import { ValidatePlanInput, PlanPhase, PlanFrontmatter } from "../lib/schema.js";
import {
  readFileContent,
  fileExists,
  resolveStatePath,
} from "../lib/state.js";
import { parseFrontmatter } from "../lib/state.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ValidationError {
  type: "error";
  phase_id?: string;
  message: string;
}

interface ValidationWarning {
  type: "warning";
  phase_id?: string;
  message: string;
}

function getAgentsDir(): string {
  const extensionDir =
    process.env["EXTENSION_PATH"] ?? join(__dirname, "..");
  return join(extensionDir, "agents");
}

function detectCircularDeps(
  phases: PlanPhase[],
): string[] {
  const errors: string[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  const phaseMap = new Map(phases.map((p) => [String(p.id), p]));

  function dfs(id: string, path: string[]): boolean {
    if (inStack.has(id)) {
      const cycle = [...path.slice(path.indexOf(id)), id];
      errors.push(`Circular dependency: ${cycle.join(" -> ")}`);
      return true;
    }
    if (visited.has(id)) return false;

    visited.add(id);
    inStack.add(id);

    const phase = phaseMap.get(id);
    if (phase) {
      for (const dep of phase.blocked_by) {
        dfs(String(dep), [...path, id]);
      }
    }

    inStack.delete(id);
    return false;
  }

  for (const phase of phases) {
    dfs(String(phase.id), []);
  }

  return errors;
}

function computeParallelBatches(
  phases: PlanPhase[],
): string[][] {
  const phaseMap = new Map(phases.map((p) => [String(p.id), p]));
  const depths = new Map<string, number>();

  function getDepth(id: string): number {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;

    const phase = phaseMap.get(id);
    if (!phase || phase.blocked_by.length === 0) {
      depths.set(id, 0);
      return 0;
    }

    const maxDep = Math.max(
      ...phase.blocked_by.map((dep) => getDepth(String(dep))),
    );
    const depth = maxDep + 1;
    depths.set(id, depth);
    return depth;
  }

  for (const phase of phases) {
    getDepth(String(phase.id));
  }

  const batches = new Map<number, string[]>();
  for (const [id, depth] of depths) {
    const batch = batches.get(depth) ?? [];
    batch.push(id);
    batches.set(depth, batch);
  }

  return Array.from(batches.entries())
    .sort(([a], [b]) => a - b)
    .map(([, ids]) => ids);
}

function computeCriticalPath(
  phases: PlanPhase[],
): string[] {
  const phaseMap = new Map(phases.map((p) => [String(p.id), p]));
  const longestPath = new Map<string, string[]>();

  function getLongestPath(id: string): string[] {
    const cached = longestPath.get(id);
    if (cached) return cached;

    const phase = phaseMap.get(id);
    if (!phase || phase.blocked_by.length === 0) {
      const path = [id];
      longestPath.set(id, path);
      return path;
    }

    let best: string[] = [];
    for (const dep of phase.blocked_by) {
      const depPath = getLongestPath(String(dep));
      if (depPath.length > best.length) {
        best = depPath;
      }
    }

    const path = [...best, id];
    longestPath.set(id, path);
    return path;
  }

  let criticalPath: string[] = [];
  for (const phase of phases) {
    const path = getLongestPath(String(phase.id));
    if (path.length > criticalPath.length) {
      criticalPath = path;
    }
  }

  return criticalPath;
}

export async function validatePlan(
  rawInput: unknown,
): Promise<Record<string, unknown>> {
  const input = ValidatePlanInput.parse(rawInput);
  const planPath = resolveStatePath(input.plan_path);

  if (!(await fileExists(planPath))) {
    return {
      valid: false,
      errors: [{ type: "error", message: `Plan file not found: ${input.plan_path}` }],
      warnings: [],
    };
  }

  const content = await readFileContent(planPath);
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  let frontmatter: unknown;
  try {
    const parsed = parseFrontmatter<unknown>(content);
    frontmatter = parsed.frontmatter;
  } catch {
    return {
      valid: false,
      errors: [
        { type: "error", message: "Failed to parse YAML frontmatter" },
      ],
      warnings: [],
    };
  }

  const fmResult = PlanFrontmatter.safeParse(frontmatter);
  if (!fmResult.success) {
    errors.push({
      type: "error",
      message: `Frontmatter validation failed: ${fmResult.error.issues.map((i) => i.message).join(", ")}`,
    });
  }

  const phaseRegex = /^##\s+Phase\s+(\d+):\s+(.+)$/gm;
  const parsedPhases: PlanPhase[] = [];
  let match: RegExpExecArray | null;
  while ((match = phaseRegex.exec(content)) !== null) {
    parsedPhases.push({
      id: parseInt(match[1]!, 10),
      title: match[2]!.trim(),
      blocked_by: [],
      files_created: [],
      files_modified: [],
    });
  }

  const phases =
    fmResult.success && fmResult.data.phases
      ? fmResult.data.phases
      : parsedPhases;

  if (phases.length === 0) {
    errors.push({ type: "error", message: "No phases found in plan" });
  }

  const phaseIds = new Set(phases.map((p) => String(p.id)));

  for (const phase of phases) {
    const pid = String(phase.id);

    if (!phase.title && !phase.name) {
      warnings.push({
        type: "warning",
        phase_id: pid,
        message: `Phase ${pid}: missing title/name`,
      });
    }

    if (!phase.agent && !phase.agents) {
      warnings.push({
        type: "warning",
        phase_id: pid,
        message: `Phase ${pid}: no agent assigned`,
      });
    }

    for (const dep of phase.blocked_by) {
      if (!phaseIds.has(String(dep))) {
        errors.push({
          type: "error",
          phase_id: pid,
          message: `Phase ${pid}: blocked_by references non-existent phase ${dep}`,
        });
      }
    }

    const agents = phase.agents
      ? Array.isArray(phase.agents)
        ? phase.agents
        : [phase.agents]
      : phase.agent
        ? Array.isArray(phase.agent)
          ? phase.agent
          : [phase.agent]
        : [];

    const agentsDir = getAgentsDir();
    for (const agentName of agents) {
      const agentFile = join(agentsDir, `${agentName}.md`);
      if (!(await fileExists(agentFile))) {
        warnings.push({
          type: "warning",
          phase_id: pid,
          message: `Phase ${pid}: agent '${agentName}' not found in agents/ directory`,
        });
      }
    }
  }

  const circularErrors = detectCircularDeps(phases);
  for (const err of circularErrors) {
    errors.push({ type: "error", message: err });
  }

  const allCreated = new Map<string, string[]>();
  const allModified = new Map<string, string[]>();
  for (const phase of phases) {
    const pid = String(phase.id);
    for (const f of phase.files_created) {
      const owners = allCreated.get(f) ?? [];
      owners.push(pid);
      allCreated.set(f, owners);
    }
    for (const f of phase.files_modified) {
      const owners = allModified.get(f) ?? [];
      owners.push(pid);
      allModified.set(f, owners);
    }
  }

  for (const [file, owners] of allCreated) {
    if (owners.length > 1) {
      warnings.push({
        type: "warning",
        message: `File '${file}' created by multiple phases: ${owners.join(", ")}. Cannot run in parallel.`,
      });
    }
  }

  for (const [file, owners] of allModified) {
    if (owners.length > 1) {
      warnings.push({
        type: "warning",
        message: `File '${file}' modified by multiple phases: ${owners.join(", ")}. Cannot run in parallel.`,
      });
    }
  }

  const parallelBatches = computeParallelBatches(phases);
  const criticalPath = computeCriticalPath(phases);

  const dependencyGraph = {
    phases: phases.map((p) => ({
      id: String(p.id),
      depends_on: p.blocked_by.map(String),
      parallel_group: parallelBatches.findIndex((b) =>
        b.includes(String(p.id)),
      ),
    })),
    critical_path: criticalPath,
    parallel_batches: parallelBatches,
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    dependency_graph: dependencyGraph,
  };
}

export const VALIDATE_PLAN_TOOL = {
  name: "maestro_validate_plan",
  description:
    "Validate a Maestro implementation plan before execution. Checks YAML frontmatter, phase structure, dependency graph (circular deps, missing refs), agent name validity, and file ownership overlap. Returns dependency graph with critical path and parallel batches.",
  inputSchema: ValidatePlanInput,
  handler: validatePlan,
};
