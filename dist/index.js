// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/lib/logger.ts
function createLogger(prefix) {
  const format = (level, message, data) => {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const base = `[${timestamp}] [${prefix}] ${level}: ${message}`;
    if (data) {
      return `${base} ${JSON.stringify(data)}`;
    }
    return base;
  };
  return {
    info(message, data) {
      console.error(format("INFO", message, data));
    },
    warn(message, data) {
      console.error(format("WARN", message, data));
    },
    error(message, data) {
      console.error(format("ERROR", message, data));
    }
  };
}

// src/lib/schema.ts
import { z } from "zod";
var PhaseStatus = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "skipped"
]);
var SessionStatus = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed"
]);
var DownstreamContext = z.object({
  key_interfaces_introduced: z.array(z.string()),
  patterns_established: z.array(z.string()),
  integration_points: z.array(z.string()),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string())
});
var SessionError = z.object({
  agent: z.string(),
  timestamp: z.string(),
  type: z.enum([
    "validation",
    "timeout",
    "file_conflict",
    "runtime",
    "dependency"
  ]),
  message: z.string(),
  resolution: z.string(),
  resolved: z.boolean()
});
var TokenUsageByAgent = z.record(
  z.string(),
  z.object({
    input: z.number(),
    output: z.number(),
    cached: z.number()
  })
);
var TokenUsage = z.object({
  total_input: z.number(),
  total_output: z.number(),
  total_cached: z.number(),
  by_agent: TokenUsageByAgent
});
var Phase = z.object({
  id: z.number(),
  name: z.string(),
  status: PhaseStatus,
  agents: z.array(z.string()),
  parallel: z.boolean(),
  started: z.string().nullable(),
  completed: z.string().nullable(),
  blocked_by: z.array(z.number()),
  files_created: z.array(z.string()),
  files_modified: z.array(z.string()),
  files_deleted: z.array(z.string()),
  downstream_context: DownstreamContext,
  errors: z.array(SessionError),
  retry_count: z.number()
});
var SessionState = z.object({
  session_id: z.string(),
  created: z.string(),
  updated: z.string(),
  status: SessionStatus,
  design_document: z.string(),
  implementation_plan: z.string(),
  current_phase: z.number(),
  execution_mode: z.enum(["parallel", "sequential"]).nullable(),
  total_phases: z.number(),
  token_usage: TokenUsage,
  phases: z.array(Phase)
});
var SessionReadInput = z.object({
  section: z.enum(["metadata", "phases", "errors", "files", "full"]).optional().default("full")
});
var SessionWriteInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    task: z.string(),
    execution_mode: z.enum(["parallel", "sequential"]).nullable().optional()
  }),
  z.object({
    action: z.literal("update_phase"),
    phase_id: z.number(),
    phase_status: PhaseStatus
  }),
  z.object({
    action: z.literal("add_error"),
    error: z.object({
      phase: z.string(),
      agent: z.string(),
      type: SessionError.shape.type,
      message: z.string(),
      retry_count: z.number()
    })
  }),
  z.object({
    action: z.literal("add_files"),
    phase_id: z.number(),
    files: z.object({
      created: z.array(z.string()).optional().default([]),
      modified: z.array(z.string()).optional().default([]),
      deleted: z.array(z.string()).optional().default([])
    })
  }),
  z.object({
    action: z.literal("complete"),
    summary: z.string().optional()
  })
]);
var ProgressStatus = z.enum([
  "dispatched",
  "running",
  "completed",
  "failed",
  "retrying"
]);
var ProgressInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    phase_id: z.string(),
    agent: z.string().optional(),
    status: ProgressStatus,
    message: z.string().optional()
  }),
  z.object({ action: z.literal("report") }),
  z.object({ action: z.literal("summary") })
]);
var ProgressEntry = z.object({
  timestamp: z.string(),
  phase_id: z.string(),
  agent: z.string().optional(),
  status: ProgressStatus,
  message: z.string().optional()
});
var ValidatePlanInput = z.object({
  plan_path: z.string()
});
var PlanPhase = z.object({
  id: z.number().or(z.string()),
  title: z.string().optional(),
  name: z.string().optional(),
  agent: z.string().or(z.array(z.string())).optional(),
  agents: z.string().or(z.array(z.string())).optional(),
  description: z.string().optional(),
  blocked_by: z.array(z.number().or(z.string())).optional().default([]),
  files_created: z.array(z.string()).optional().default([]),
  files_modified: z.array(z.string()).optional().default([]),
  validation_criteria: z.string().optional(),
  validation: z.string().optional(),
  parallel: z.boolean().optional()
});
var PlanFrontmatter = z.object({
  title: z.string(),
  design_ref: z.string().optional(),
  created: z.string().optional(),
  status: z.string().optional(),
  total_phases: z.number().optional(),
  estimated_files: z.number().optional(),
  phases: z.array(PlanPhase).optional()
});
var DispatchStatusInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list_batches") }),
  z.object({
    action: z.literal("batch_status"),
    batch_id: z.string()
  }),
  z.object({
    action: z.literal("agent_result"),
    batch_id: z.string(),
    agent: z.string()
  })
]);
var ContextChainInput = z.object({
  phase_id: z.string(),
  plan_path: z.string()
});
var BatchSummary = z.object({
  batch_status: z.string(),
  total_agents: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  wall_time_seconds: z.number(),
  agents: z.array(
    z.object({
      name: z.string(),
      exit_code: z.number(),
      status: z.string()
    })
  )
});

// src/lib/state.ts
import { readFile, writeFile, rename, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
var logger = createLogger("state");
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("No YAML frontmatter found (expected --- delimiters)");
  }
  const [, yamlContent, body] = match;
  const frontmatter = parseYaml(yamlContent);
  return { frontmatter, body: body ?? "" };
}
function serializeFrontmatter(frontmatter, body) {
  const yamlStr = stringifyYaml(frontmatter, { lineWidth: 0 });
  return `---
${yamlStr}---
${body}`;
}
function resolveStateDir() {
  return process.env["MAESTRO_STATE_DIR"] ?? ".gemini";
}
function resolveStatePath(relativePath) {
  return join(process.cwd(), relativePath);
}
async function readSessionState() {
  const stateDir = resolveStateDir();
  const sessionPath = resolveStatePath(
    join(stateDir, "state", "active-session.md")
  );
  if (!existsSync(sessionPath)) {
    return null;
  }
  const content = await readFile(sessionPath, "utf-8");
  const { frontmatter } = parseFrontmatter(content);
  const result = SessionState.safeParse(frontmatter);
  if (!result.success) {
    logger.error("Session state parse failed", {
      path: sessionPath,
      errors: result.error.issues
    });
    return null;
  }
  return result.data;
}
async function writeSessionState(state, body) {
  const stateDir = resolveStateDir();
  const sessionPath = resolveStatePath(
    join(stateDir, "state", "active-session.md")
  );
  const parentDir = dirname(sessionPath);
  await mkdir(parentDir, { recursive: true });
  const content = serializeFrontmatter(state, body);
  const tempFile = join(parentDir, `.write-state-${Date.now()}`);
  await writeFile(tempFile, content, "utf-8");
  await rename(tempFile, sessionPath);
}
async function readFileContent(absolutePath) {
  return readFile(absolutePath, "utf-8");
}
async function appendToFile(absolutePath, content) {
  const { appendFile } = await import("node:fs/promises");
  const parentDir = dirname(absolutePath);
  await mkdir(parentDir, { recursive: true });
  await appendFile(absolutePath, content, "utf-8");
}
async function listDirectories(dirPath) {
  if (!existsSync(dirPath)) {
    return [];
  }
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}
async function fileExists(absolutePath) {
  return existsSync(absolutePath);
}

// src/tools/session.ts
var logger2 = createLogger("session");
async function sessionRead(rawInput) {
  const input = SessionReadInput.parse(rawInput);
  const state = await readSessionState();
  if (!state) {
    return { exists: false };
  }
  switch (input.section) {
    case "metadata":
      return {
        exists: true,
        session: {
          session_id: state.session_id,
          created: state.created,
          updated: state.updated,
          status: state.status,
          current_phase: state.current_phase,
          total_phases: state.total_phases,
          execution_mode: state.execution_mode,
          design_document: state.design_document,
          implementation_plan: state.implementation_plan
        }
      };
    case "phases":
      return {
        exists: true,
        phases: state.phases.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          agents: p.agents,
          parallel: p.parallel,
          started: p.started,
          completed: p.completed,
          blocked_by: p.blocked_by,
          retry_count: p.retry_count
        }))
      };
    case "errors":
      return {
        exists: true,
        errors: state.phases.flatMap(
          (p) => p.errors.map((e) => ({ ...e, phase_id: p.id, phase_name: p.name }))
        )
      };
    case "files":
      return {
        exists: true,
        files: {
          created: state.phases.flatMap((p) => p.files_created),
          modified: state.phases.flatMap((p) => p.files_modified),
          deleted: state.phases.flatMap((p) => p.files_deleted)
        }
      };
    case "full":
    default:
      return { exists: true, session: state };
  }
}
function createEmptyPhase(id, name) {
  return {
    id,
    name,
    status: "pending",
    agents: [],
    parallel: false,
    started: null,
    completed: null,
    blocked_by: [],
    files_created: [],
    files_modified: [],
    files_deleted: [],
    downstream_context: {
      key_interfaces_introduced: [],
      patterns_established: [],
      integration_points: [],
      assumptions: [],
      warnings: []
    },
    errors: [],
    retry_count: 0
  };
}
async function sessionWrite(rawInput) {
  const input = SessionWriteInput.parse(rawInput);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  switch (input.action) {
    case "create": {
      const slug = input.task.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
      const dateStr = now.slice(0, 10);
      const sessionId = `${dateStr}-${slug}`;
      const state = {
        session_id: sessionId,
        created: now,
        updated: now,
        status: "in_progress",
        design_document: "",
        implementation_plan: "",
        current_phase: 1,
        execution_mode: input.execution_mode ?? null,
        total_phases: 0,
        token_usage: {
          total_input: 0,
          total_output: 0,
          total_cached: 0,
          by_agent: {}
        },
        phases: [createEmptyPhase(1, "initial")]
      };
      const body = `# ${input.task} Orchestration Log
`;
      await writeSessionState(state, body);
      logger2.info("Session created", { sessionId });
      return { success: true, session_id: sessionId, state };
    }
    case "update_phase": {
      const state = await readSessionState();
      if (!state) {
        return { success: false, error: "No active session found" };
      }
      const phase = state.phases.find((p) => p.id === input.phase_id);
      if (!phase) {
        return {
          success: false,
          error: `Phase ${input.phase_id} not found`
        };
      }
      phase.status = input.phase_status;
      if (input.phase_status === "in_progress" && !phase.started) {
        phase.started = now;
      }
      if (input.phase_status === "completed" || input.phase_status === "failed") {
        phase.completed = now;
      }
      state.updated = now;
      state.current_phase = input.phase_id;
      const body = `# Orchestration Log
`;
      await writeSessionState(state, body);
      logger2.info("Phase updated", {
        phase_id: input.phase_id,
        status: input.phase_status
      });
      return { success: true, phase };
    }
    case "add_error": {
      const state = await readSessionState();
      if (!state) {
        return { success: false, error: "No active session found" };
      }
      const phaseId = Number(input.error.phase);
      const phase = state.phases.find((p) => p.id === phaseId);
      if (!phase) {
        return {
          success: false,
          error: `Phase ${input.error.phase} not found`
        };
      }
      phase.errors.push({
        agent: input.error.agent,
        timestamp: now,
        type: input.error.type,
        message: input.error.message,
        resolution: "pending",
        resolved: false
      });
      phase.retry_count = input.error.retry_count;
      state.updated = now;
      const body = `# Orchestration Log
`;
      await writeSessionState(state, body);
      logger2.info("Error recorded", { phase: input.error.phase });
      return { success: true };
    }
    case "add_files": {
      const state = await readSessionState();
      if (!state) {
        return { success: false, error: "No active session found" };
      }
      const phase = state.phases.find((p) => p.id === input.phase_id);
      if (!phase) {
        return {
          success: false,
          error: `Phase ${input.phase_id} not found`
        };
      }
      phase.files_created.push(...input.files.created);
      phase.files_modified.push(...input.files.modified);
      phase.files_deleted.push(...input.files.deleted);
      state.updated = now;
      const body = `# Orchestration Log
`;
      await writeSessionState(state, body);
      return { success: true };
    }
    case "complete": {
      const state = await readSessionState();
      if (!state) {
        return { success: false, error: "No active session found" };
      }
      state.status = "completed";
      state.updated = now;
      const body = `# Orchestration Log

## Summary
${input.summary ?? "Session completed."}
`;
      await writeSessionState(state, body);
      logger2.info("Session completed", {
        session_id: state.session_id
      });
      return { success: true, session_id: state.session_id };
    }
  }
}
var SESSION_READ_TOOL = {
  name: "maestro_session_read",
  description: "Read current Maestro orchestration session state. Returns structured JSON instead of raw YAML. Use 'section' to request only metadata, phases, errors, or files to save context tokens.",
  inputSchema: SessionReadInput,
  handler: sessionRead
};
var SESSION_WRITE_TOOL = {
  name: "maestro_session_write",
  description: "Update Maestro orchestration session state with schema validation and atomic writes. Actions: create (new session), update_phase (change phase status), add_error (record error), add_files (update file manifest), complete (finish session).",
  inputSchema: SessionWriteInput,
  handler: sessionWrite
};

// src/tools/progress.ts
import { join as join2 } from "node:path";
var logger3 = createLogger("progress");
function getProgressPath() {
  const stateDir = resolveStateDir();
  return resolveStatePath(join2(stateDir, "state", "progress.jsonl"));
}
async function readProgressEntries() {
  const progressPath = getProgressPath();
  if (!await fileExists(progressPath)) {
    return [];
  }
  const content = await readFileContent(progressPath);
  const lines = content.trim().split("\n").filter(Boolean);
  return lines.flatMap((line) => {
    const result = ProgressEntry.safeParse(JSON.parse(line));
    if (result.success) {
      return [result.data];
    }
    return [];
  });
}
async function progress(rawInput) {
  const input = ProgressInput.parse(rawInput);
  switch (input.action) {
    case "update": {
      const entry = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        phase_id: input.phase_id,
        agent: input.agent,
        status: input.status,
        message: input.message
      };
      const progressPath = getProgressPath();
      await appendToFile(progressPath, JSON.stringify(entry) + "\n");
      logger3.info("Progress updated", {
        phase_id: input.phase_id,
        status: input.status
      });
      return { success: true, entry };
    }
    case "report": {
      const entries = await readProgressEntries();
      const phaseMap = /* @__PURE__ */ new Map();
      for (const entry of entries) {
        const existing = phaseMap.get(entry.phase_id);
        if (!existing) {
          phaseMap.set(entry.phase_id, {
            latest_status: entry.status,
            agent: entry.agent,
            entries: 1,
            first: entry.timestamp,
            last: entry.timestamp
          });
        } else {
          existing.latest_status = entry.status;
          if (entry.agent) existing.agent = entry.agent;
          existing.entries += 1;
          existing.last = entry.timestamp;
        }
      }
      const phases = Array.from(phaseMap.entries()).map(([id, data]) => ({
        phase_id: id,
        ...data
      }));
      return { phases, total_entries: entries.length };
    }
    case "summary": {
      const entries = await readProgressEntries();
      const phases = new Set(entries.map((e) => e.phase_id));
      const completed = entries.filter((e) => e.status === "completed");
      const failed = entries.filter((e) => e.status === "failed");
      const completedPhases = new Set(completed.map((e) => e.phase_id));
      let wallTime = 0;
      if (entries.length > 0) {
        const first = new Date(entries[0].timestamp).getTime();
        const last = new Date(entries[entries.length - 1].timestamp).getTime();
        wallTime = Math.round((last - first) / 1e3);
      }
      return {
        total_phases: phases.size,
        completed_phases: completedPhases.size,
        failed_phases: failed.length,
        wall_time_seconds: wallTime,
        total_entries: entries.length
      };
    }
  }
}
var PROGRESS_TOOL = {
  name: "maestro_progress",
  description: "Track orchestration progress in real-time. Actions: update (log phase/agent status change), report (current status of all phases), summary (condensed overview with counts and timing).",
  inputSchema: ProgressInput,
  handler: progress
};

// src/tools/validation.ts
import { existsSync as existsSync2 } from "node:fs";
import { join as join3 } from "node:path";
function getAgentsDir() {
  const extensionDir = process.env["EXTENSION_PATH"] ?? join3(process.cwd(), "..");
  return join3(extensionDir, "agents");
}
function detectCircularDeps(phases) {
  const errors = [];
  const visited = /* @__PURE__ */ new Set();
  const inStack = /* @__PURE__ */ new Set();
  const phaseMap = new Map(phases.map((p) => [String(p.id), p]));
  function dfs(id, path) {
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
function computeParallelBatches(phases) {
  const phaseMap = new Map(phases.map((p) => [String(p.id), p]));
  const depths = /* @__PURE__ */ new Map();
  function getDepth(id) {
    const cached = depths.get(id);
    if (cached !== void 0) return cached;
    const phase = phaseMap.get(id);
    if (!phase || phase.blocked_by.length === 0) {
      depths.set(id, 0);
      return 0;
    }
    const maxDep = Math.max(
      ...phase.blocked_by.map((dep) => getDepth(String(dep)))
    );
    const depth = maxDep + 1;
    depths.set(id, depth);
    return depth;
  }
  for (const phase of phases) {
    getDepth(String(phase.id));
  }
  const batches = /* @__PURE__ */ new Map();
  for (const [id, depth] of depths) {
    const batch = batches.get(depth) ?? [];
    batch.push(id);
    batches.set(depth, batch);
  }
  return Array.from(batches.entries()).sort(([a], [b]) => a - b).map(([, ids]) => ids);
}
function computeCriticalPath(phases) {
  const phaseMap = new Map(phases.map((p) => [String(p.id), p]));
  const longestPath = /* @__PURE__ */ new Map();
  function getLongestPath(id) {
    const cached = longestPath.get(id);
    if (cached) return cached;
    const phase = phaseMap.get(id);
    if (!phase || phase.blocked_by.length === 0) {
      const path2 = [id];
      longestPath.set(id, path2);
      return path2;
    }
    let best = [];
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
  let criticalPath = [];
  for (const phase of phases) {
    const path = getLongestPath(String(phase.id));
    if (path.length > criticalPath.length) {
      criticalPath = path;
    }
  }
  return criticalPath;
}
async function validatePlan(rawInput) {
  const input = ValidatePlanInput.parse(rawInput);
  const planPath = resolveStatePath(input.plan_path);
  if (!await fileExists(planPath)) {
    return {
      valid: false,
      errors: [{ type: "error", message: `Plan file not found: ${input.plan_path}` }],
      warnings: []
    };
  }
  const content = await readFileContent(planPath);
  const errors = [];
  const warnings = [];
  let frontmatter;
  try {
    const parsed = parseFrontmatter(content);
    frontmatter = parsed.frontmatter;
  } catch {
    return {
      valid: false,
      errors: [
        { type: "error", message: "Failed to parse YAML frontmatter" }
      ],
      warnings: []
    };
  }
  const fmResult = PlanFrontmatter.safeParse(frontmatter);
  if (!fmResult.success) {
    errors.push({
      type: "error",
      message: `Frontmatter validation failed: ${fmResult.error.issues.map((i) => i.message).join(", ")}`
    });
  }
  const phaseRegex = /^##\s+Phase\s+(\d+):\s+(.+)$/gm;
  const parsedPhases = [];
  let match;
  while ((match = phaseRegex.exec(content)) !== null) {
    parsedPhases.push({
      id: parseInt(match[1], 10),
      title: match[2].trim(),
      blocked_by: [],
      files_created: [],
      files_modified: []
    });
  }
  const phases = fmResult.success && fmResult.data.phases ? fmResult.data.phases : parsedPhases;
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
        message: `Phase ${pid}: missing title/name`
      });
    }
    if (!phase.agent && !phase.agents) {
      warnings.push({
        type: "warning",
        phase_id: pid,
        message: `Phase ${pid}: no agent assigned`
      });
    }
    for (const dep of phase.blocked_by) {
      if (!phaseIds.has(String(dep))) {
        errors.push({
          type: "error",
          phase_id: pid,
          message: `Phase ${pid}: blocked_by references non-existent phase ${dep}`
        });
      }
    }
    const agents = phase.agents ? Array.isArray(phase.agents) ? phase.agents : [phase.agents] : phase.agent ? Array.isArray(phase.agent) ? phase.agent : [phase.agent] : [];
    const agentsDir = getAgentsDir();
    for (const agentName of agents) {
      const agentFile = join3(agentsDir, `${agentName}.md`);
      if (!existsSync2(agentFile)) {
        warnings.push({
          type: "warning",
          phase_id: pid,
          message: `Phase ${pid}: agent '${agentName}' not found in agents/ directory`
        });
      }
    }
  }
  const circularErrors = detectCircularDeps(phases);
  for (const err of circularErrors) {
    errors.push({ type: "error", message: err });
  }
  const allCreated = /* @__PURE__ */ new Map();
  const allModified = /* @__PURE__ */ new Map();
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
        message: `File '${file}' created by multiple phases: ${owners.join(", ")}. Cannot run in parallel.`
      });
    }
  }
  for (const [file, owners] of allModified) {
    if (owners.length > 1) {
      warnings.push({
        type: "warning",
        message: `File '${file}' modified by multiple phases: ${owners.join(", ")}. Cannot run in parallel.`
      });
    }
  }
  const parallelBatches = computeParallelBatches(phases);
  const criticalPath = computeCriticalPath(phases);
  const dependencyGraph = {
    phases: phases.map((p) => ({
      id: String(p.id),
      depends_on: p.blocked_by.map(String),
      parallel_group: parallelBatches.findIndex(
        (b) => b.includes(String(p.id))
      )
    })),
    critical_path: criticalPath,
    parallel_batches: parallelBatches
  };
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    dependency_graph: dependencyGraph
  };
}
var VALIDATE_PLAN_TOOL = {
  name: "maestro_validate_plan",
  description: "Validate a Maestro implementation plan before execution. Checks YAML frontmatter, phase structure, dependency graph (circular deps, missing refs), agent name validity, and file ownership overlap. Returns dependency graph with critical path and parallel batches.",
  inputSchema: ValidatePlanInput,
  handler: validatePlan
};

// src/tools/dispatch.ts
import { join as join4 } from "node:path";
import { readdir as readdir2, stat } from "node:fs/promises";
async function dispatchStatus(rawInput) {
  const input = DispatchStatusInput.parse(rawInput);
  const stateDir = resolveStateDir();
  const parallelDir = resolveStatePath(join4(stateDir, "parallel"));
  switch (input.action) {
    case "list_batches": {
      const batchIds = await listDirectories(parallelDir);
      const batches = await Promise.all(
        batchIds.map(async (id) => {
          const summaryPath = join4(parallelDir, id, "results", "summary.json");
          let status = "unknown";
          let timestamp = "";
          if (await fileExists(summaryPath)) {
            try {
              const content = await readFileContent(summaryPath);
              const summary = JSON.parse(content);
              status = summary.batch_status;
            } catch {
              status = "parse_error";
            }
          } else {
            status = "pending";
          }
          try {
            const stats = await stat(join4(parallelDir, id));
            timestamp = stats.mtime.toISOString();
          } catch {
            timestamp = "";
          }
          return { batch_id: id, status, timestamp };
        })
      );
      return { batches };
    }
    case "batch_status": {
      const summaryPath = join4(
        parallelDir,
        input.batch_id,
        "results",
        "summary.json"
      );
      if (!await fileExists(summaryPath)) {
        return {
          error: `Batch '${input.batch_id}' summary not found. Batch may still be running.`
        };
      }
      const content = await readFileContent(summaryPath);
      const summary = BatchSummary.parse(JSON.parse(content));
      const agents = await Promise.all(
        summary.agents.map(async (agent) => {
          const resultPath = join4(
            parallelDir,
            input.batch_id,
            "results",
            `${agent.name}.json`
          );
          const hasResult = await fileExists(resultPath);
          let hasDownstreamContext = false;
          if (hasResult) {
            try {
              const resultContent = await readFileContent(resultPath);
              hasDownstreamContext = resultContent.includes("Downstream Context");
            } catch {
            }
          }
          return {
            ...agent,
            has_result: hasResult,
            has_downstream_context: hasDownstreamContext
          };
        })
      );
      return {
        batch_id: input.batch_id,
        status: summary.batch_status,
        agents,
        wall_time_seconds: summary.wall_time_seconds,
        total_agents: summary.total_agents,
        succeeded: summary.succeeded,
        failed: summary.failed
      };
    }
    case "agent_result": {
      const resultPath = join4(
        parallelDir,
        input.batch_id,
        "results",
        `${input.agent}.json`
      );
      if (!await fileExists(resultPath)) {
        return {
          error: `Result for agent '${input.agent}' in batch '${input.batch_id}' not found`
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
async function contextChain(rawInput) {
  const input = ContextChainInput.parse(rawInput);
  const planPath = resolveStatePath(input.plan_path);
  if (!await fileExists(planPath)) {
    return { error: `Plan file not found: ${input.plan_path}` };
  }
  const planContent = await readFileContent(planPath);
  let phases = [];
  try {
    const { frontmatter } = parseFrontmatter(planContent);
    const fmResult = PlanFrontmatter.safeParse(frontmatter);
    if (fmResult.success && fmResult.data.phases) {
      phases = fmResult.data.phases;
    }
  } catch {
  }
  if (phases.length === 0) {
    const phaseRegex = /^##\s+Phase\s+(\d+):/gm;
    let match;
    while ((match = phaseRegex.exec(planContent)) !== null) {
      phases.push({
        id: parseInt(match[1], 10),
        blocked_by: [],
        files_created: [],
        files_modified: []
      });
    }
  }
  const targetPhase = phases.find((p) => String(p.id) === input.phase_id);
  if (!targetPhase) {
    return {
      error: `Phase '${input.phase_id}' not found in plan`
    };
  }
  const blockingPhases = targetPhase.blocked_by.map(String);
  const contextParts = [];
  const missingContexts = [];
  const stateDir = resolveStateDir();
  const parallelDir = resolveStatePath(join4(stateDir, "parallel"));
  for (const blockingId of blockingPhases) {
    let found = false;
    const batchDirs = await listDirectories(parallelDir);
    for (const batchId of batchDirs) {
      const resultsDir = join4(parallelDir, batchId, "results");
      let resultFiles = [];
      try {
        resultFiles = (await readdir2(resultsDir)).filter(
          (f) => f.endsWith(".json")
        );
      } catch {
        continue;
      }
      for (const resultFile of resultFiles) {
        if (resultFile === "summary.json") continue;
        const resultPath = join4(resultsDir, resultFile);
        try {
          const content = await readFileContent(resultPath);
          const downstreamMatch = content.match(
            /### Downstream Context\n([\s\S]*?)(?=\n###|\n##|$)/
          );
          if (downstreamMatch) {
            contextParts.push(
              `## Context from Phase ${blockingId}

${downstreamMatch[1].trim()}`
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
  const contextChainText = contextParts.length > 0 ? contextParts.join("\n\n---\n\n") : "No upstream context available.";
  return {
    phase_id: input.phase_id,
    blocking_phases: blockingPhases,
    context_chain: contextChainText,
    missing_contexts: missingContexts
  };
}
var DISPATCH_STATUS_TOOL = {
  name: "maestro_dispatch_status",
  description: "Read and aggregate results from parallel dispatch batches. Actions: list_batches (scan all batches), batch_status (summary for specific batch), agent_result (individual agent output).",
  inputSchema: DispatchStatusInput,
  handler: dispatchStatus
};
var CONTEXT_CHAIN_TOOL = {
  name: "maestro_context_chain",
  description: "Build the downstream context chain for a phase about to be delegated. Reads completed results from blocking phases, extracts Downstream Context sections, and assembles them into a single injection payload.",
  inputSchema: ContextChainInput,
  handler: contextChain
};

// src/index.ts
var logger4 = createLogger("server");
var server = new McpServer({
  name: "maestro",
  version: "1.1.0"
});
var tools = [
  SESSION_READ_TOOL,
  SESSION_WRITE_TOOL,
  PROGRESS_TOOL,
  VALIDATE_PLAN_TOOL,
  DISPATCH_STATUS_TOOL,
  CONTEXT_CHAIN_TOOL
];
for (const tool of tools) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema
    },
    async (args) => {
      try {
        const result = await tool.handler(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger4.error(`Tool ${tool.name} failed`, { error: message });
        return {
          content: [{ type: "text", text: JSON.stringify({ error: message }) }],
          isError: true
        };
      }
    }
  );
}
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger4.info("Maestro MCP server started", {
    tools: tools.map((t) => t.name)
  });
}
main().catch((error) => {
  logger4.error("Failed to start server", { error: String(error) });
  process.exit(1);
});
