import {
  DispatchStatusInput,
  ContextChainInput,
  BatchSummary,
  PlanPhase,
  PlanFrontmatter,
} from "../lib/schema.js";
import {
  resolveStateDir,
  resolveStatePath,
  listDirectories,
  readFileContent,
  fileExists,
  parseFrontmatter,
} from "../lib/state.js";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";

export async function dispatchStatus(
  rawInput: unknown,
): Promise<Record<string, unknown>> {
  const input = DispatchStatusInput.parse(rawInput);
  const stateDir = resolveStateDir();
  const parallelDir = resolveStatePath(join(stateDir, "parallel"));

  switch (input.action) {
    case "list_batches": {
      const batchIds = await listDirectories(parallelDir);

      const batches = await Promise.all(
        batchIds.map(async (id) => {
          const summaryPath = join(parallelDir, id, "results", "summary.json");
          let status = "unknown";
          let timestamp = "";

          if (await fileExists(summaryPath)) {
            try {
              const content = await readFileContent(summaryPath);
              const summary = JSON.parse(content) as BatchSummary;
              status = summary.batch_status;
            } catch {
              status = "parse_error";
            }
          } else {
            status = "pending";
          }

          try {
            const stats = await stat(join(parallelDir, id));
            timestamp = stats.mtime.toISOString();
          } catch {
            timestamp = "";
          }

          return { batch_id: id, status, timestamp };
        }),
      );

      return { batches };
    }

    case "batch_status": {
      const summaryPath = join(
        parallelDir,
        input.batch_id,
        "results",
        "summary.json",
      );

      if (!(await fileExists(summaryPath))) {
        return {
          error: `Batch '${input.batch_id}' summary not found. Batch may still be running.`,
        };
      }

      const content = await readFileContent(summaryPath);
      const summary = BatchSummary.parse(JSON.parse(content));

      const agents = await Promise.all(
        summary.agents.map(async (agent) => {
          const resultPath = join(
            parallelDir,
            input.batch_id,
            "results",
            `${agent.name}.json`,
          );
          const hasResult = await fileExists(resultPath);
          let hasDownstreamContext = false;

          if (hasResult) {
            try {
              const resultContent = await readFileContent(resultPath);
              hasDownstreamContext =
                resultContent.includes("Downstream Context");
            } catch {
              // Ignore parse errors
            }
          }

          return {
            ...agent,
            has_result: hasResult,
            has_downstream_context: hasDownstreamContext,
          };
        }),
      );

      return {
        batch_id: input.batch_id,
        status: summary.batch_status,
        agents,
        wall_time_seconds: summary.wall_time_seconds,
        total_agents: summary.total_agents,
        succeeded: summary.succeeded,
        failed: summary.failed,
      };
    }

    case "agent_result": {
      const resultPath = join(
        parallelDir,
        input.batch_id,
        "results",
        `${input.agent}.json`,
      );

      if (!(await fileExists(resultPath))) {
        return {
          error: `Result for agent '${input.agent}' in batch '${input.batch_id}' not found`,
        };
      }

      const content = await readFileContent(resultPath);
      try {
        return { agent: input.agent, result: JSON.parse(content) };
      } catch {
        return { agent: input.agent, result_raw: content };
      }
    }
  }
}

export async function contextChain(
  rawInput: unknown,
): Promise<Record<string, unknown>> {
  const input = ContextChainInput.parse(rawInput);
  const planPath = resolveStatePath(input.plan_path);

  if (!(await fileExists(planPath))) {
    return { error: `Plan file not found: ${input.plan_path}` };
  }

  const planContent = await readFileContent(planPath);
  let phases: PlanPhase[] = [];

  try {
    const { frontmatter } = parseFrontmatter<unknown>(planContent);
    const fmResult = PlanFrontmatter.safeParse(frontmatter);
    if (fmResult.success && fmResult.data.phases) {
      phases = fmResult.data.phases;
    }
  } catch {
    // Fall back to regex parsing
  }

  if (phases.length === 0) {
    const phaseRegex = /^##\s+Phase\s+(\d+):/gm;
    let match: RegExpExecArray | null;
    while ((match = phaseRegex.exec(planContent)) !== null) {
      phases.push({
        id: parseInt(match[1]!, 10),
        blocked_by: [],
        files_created: [],
        files_modified: [],
      });
    }
  }

  const targetPhase = phases.find((p) => String(p.id) === input.phase_id);
  if (!targetPhase) {
    return {
      error: `Phase '${input.phase_id}' not found in plan`,
    };
  }

  const blockingPhases = targetPhase.blocked_by.map(String);
  const contextParts: string[] = [];
  const missingContexts: string[] = [];

  const stateDir = resolveStateDir();
  const parallelDir = resolveStatePath(join(stateDir, "parallel"));

  for (const blockingId of blockingPhases) {
    let found = false;

    const batchDirs = await listDirectories(parallelDir);
    for (const batchId of batchDirs) {
      const resultsDir = join(parallelDir, batchId, "results");
      let resultFiles: string[] = [];
      try {
        resultFiles = (await readdir(resultsDir)).filter((f) =>
          f.endsWith(".json"),
        );
      } catch {
        continue;
      }

      for (const resultFile of resultFiles) {
        if (resultFile === "summary.json") continue;
        const resultPath = join(resultsDir, resultFile);
        try {
          const content = await readFileContent(resultPath);
          const downstreamMatch = content.match(
            /### Downstream Context\n([\s\S]*?)(?=\n###|\n##|$)/,
          );
          if (downstreamMatch) {
            contextParts.push(
              `## Context from Phase ${blockingId}\n\n${downstreamMatch[1]!.trim()}`,
            );
            found = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (found) break;
    }

    if (!found) {
      missingContexts.push(blockingId);
    }
  }

  const contextChainText =
    contextParts.length > 0
      ? contextParts.join("\n\n---\n\n")
      : "No upstream context available.";

  return {
    phase_id: input.phase_id,
    blocking_phases: blockingPhases,
    context_chain: contextChainText,
    missing_contexts: missingContexts,
  };
}

export const DISPATCH_STATUS_TOOL = {
  name: "maestro_dispatch_status",
  description:
    "Read and aggregate results from parallel dispatch batches. Actions: list_batches (scan all batches), batch_status (summary for specific batch), agent_result (individual agent output).",
  inputSchema: DispatchStatusInput,
  handler: dispatchStatus,
};

export const CONTEXT_CHAIN_TOOL = {
  name: "maestro_context_chain",
  description:
    "Build the downstream context chain for a phase about to be delegated. Reads completed results from blocking phases, extracts Downstream Context sections, and assembles them into a single injection payload.",
  inputSchema: ContextChainInput,
  handler: contextChain,
};
