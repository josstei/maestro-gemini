# Hooks, MCP Server & Policy Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three new architectural layers to Maestro — hooks for lifecycle/compliance enforcement, an MCP server for orchestration tools, and policy engine TOML files for mechanical access control.

**Architecture:** Hooks (shell scripts triggered by Gemini CLI lifecycle events) handle session lifecycle and compliance enforcement. A lightweight TypeScript MCP server exposes 6 custom tools for structured orchestration operations. TOML policy files enforce tool restrictions at the engine level.

**Tech Stack:** TypeScript, Node.js 18+, `@modelcontextprotocol/sdk`, `zod`, `yaml`, `esbuild`, Bash 4.3+

**Design Reference:** `docs/plans/2026-02-15-hooks-mcp-policies-design.md`

---

## Dependency Graph

```
Task 1 (Build System)
  |
  +---> Task 2 (Schemas)
  |       |
  |       +---> Task 3 (Logger)
  |       |
  |       +---> Task 4 (State I/O)
  |               |
  |               +---> Task 5 (Session Tools)
  |               |
  |               +---> Task 6 (Progress Tool)
  |               |
  |               +---> Task 7 (Validation Tool)
  |               |
  |               +---> Task 8 (Dispatch Tools)
  |                       |
  |                       +---> Task 9 (Entry Point)
  |                               |
  |                               +---> Task 10 (Build & Verify)
  |
  Task 11 (Policy Files) -------- no dependencies, can run in parallel with Tasks 2-10
  |
  Task 12 (Hooks) --------------- no dependencies, can run in parallel with Tasks 2-10
  |
  +---> Task 13 (Extension Manifest) -- depends on Task 10 + 12
  |
  +---> Task 14 (GEMINI.md Update) --- depends on Task 10 + 12
  |       |
  |       +---> Task 15 (Skills Updates)
  |       |
  |       +---> Task 16 (Protocol Updates)
```

## Execution Strategy

| Stage | Tasks | Execution | Notes |
|-------|-------|-----------|-------|
| 1 | Task 1 | Sequential | Foundation — must complete first |
| 2 | Tasks 2, 11, 12 | Parallel (3 agents) | Schemas, policies, and hooks are independent |
| 3 | Tasks 3, 4 | Parallel (2 agents) | Both depend only on schemas |
| 4 | Tasks 5, 6, 7, 8 | Parallel (4 agents) | All depend on state I/O lib |
| 5 | Task 9 | Sequential | Wires all tools together |
| 6 | Task 10 | Sequential | Build verification |
| 7 | Tasks 13, 14 | Parallel (2 agents) | Extension manifest + GEMINI.md |
| 8 | Tasks 15, 16 | Parallel (2 agents) | Skills + protocols |
| 9 | Final commit + validation | Sequential | Full integration verification |

---

### Task 1: Build System Foundation

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Modify: `.gitignore`

**Step 1: Update package.json with dependencies and scripts**

Replace the entire contents of `package.json`:

```json
{
  "name": "gemini-maestro",
  "version": "1.1.0",
  "description": "Maestro - Multi-agent orchestration for Gemini CLI",
  "type": "module",
  "license": "MIT",
  "keywords": [
    "gemini-cli",
    "extension",
    "orchestration",
    "multi-agent"
  ],
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "build": "esbuild src/index.ts --bundle --platform=node --target=node18 --outfile=dist/index.js --format=esm --packages=external",
    "dev": "esbuild src/index.ts --bundle --platform=node --target=node18 --outfile=dist/index.js --format=esm --packages=external --watch",
    "typecheck": "tsc --noEmit",
    "version": "node scripts/sync-version.js && git add gemini-extension.json"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "yaml": "^2.7.1",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/node": "^22.13.4",
    "esbuild": "^0.25.0",
    "typescript": "^5.7.3"
  }
}
```

**Step 2: Create tsconfig.json**

Create `tsconfig.json` at project root:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "sourceMap": false,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"]
}
```

**Step 3: Update .gitignore**

Read the current `.gitignore` and append these entries if not already present:

```
node_modules/
```

Do NOT add `dist/` to .gitignore — we commit the built bundle for zero-build-step installation.

**Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created with `@modelcontextprotocol/sdk`, `yaml`, `zod`, `esbuild`, `typescript`, `@types/node`

**Step 5: Verify TypeScript compilation works**

Create a minimal `src/index.ts` placeholder:

```typescript
console.log("maestro mcp server placeholder");
```

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Verify esbuild bundling works**

Run: `npm run build`
Expected: `dist/index.js` created

**Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/index.ts dist/index.js
git commit -m "feat: add build system for MCP server

Add TypeScript + esbuild build pipeline with MCP SDK, Zod, and YAML
dependencies. Commit dist/index.js for zero-build-step installation."
```

---

### Task 2: MCP Server — Zod Schemas

**Files:**
- Create: `src/lib/schema.ts`

**Step 1: Create the schemas file**

Create `src/lib/schema.ts` with all Zod schemas used across the MCP server:

```typescript
import { z } from "zod";

export const PhaseStatus = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "skipped",
]);

export type PhaseStatus = z.infer<typeof PhaseStatus>;

export const SessionStatus = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

export type SessionStatus = z.infer<typeof SessionStatus>;

export const DownstreamContext = z.object({
  key_interfaces_introduced: z.array(z.string()),
  patterns_established: z.array(z.string()),
  integration_points: z.array(z.string()),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type DownstreamContext = z.infer<typeof DownstreamContext>;

export const SessionError = z.object({
  agent: z.string(),
  timestamp: z.string(),
  type: z.enum([
    "validation",
    "timeout",
    "file_conflict",
    "runtime",
    "dependency",
  ]),
  message: z.string(),
  resolution: z.string(),
  resolved: z.boolean(),
});

export type SessionError = z.infer<typeof SessionError>;

export const TokenUsageByAgent = z.record(
  z.string(),
  z.object({
    input: z.number(),
    output: z.number(),
    cached: z.number(),
  }),
);

export const TokenUsage = z.object({
  total_input: z.number(),
  total_output: z.number(),
  total_cached: z.number(),
  by_agent: TokenUsageByAgent,
});

export type TokenUsage = z.infer<typeof TokenUsage>;

export const Phase = z.object({
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
  retry_count: z.number(),
});

export type Phase = z.infer<typeof Phase>;

export const SessionState = z.object({
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
  phases: z.array(Phase),
});

export type SessionState = z.infer<typeof SessionState>;

export const SessionReadInput = z.object({
  section: z
    .enum(["metadata", "phases", "errors", "files", "full"])
    .optional()
    .default("full"),
});

export const SessionWriteInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    task: z.string(),
    execution_mode: z.enum(["parallel", "sequential"]).nullable().optional(),
  }),
  z.object({
    action: z.literal("update_phase"),
    phase_id: z.number(),
    phase_status: PhaseStatus,
  }),
  z.object({
    action: z.literal("add_error"),
    error: z.object({
      phase: z.string(),
      agent: z.string(),
      type: SessionError.shape.type,
      message: z.string(),
      retry_count: z.number(),
    }),
  }),
  z.object({
    action: z.literal("add_files"),
    phase_id: z.number(),
    files: z.object({
      created: z.array(z.string()).optional().default([]),
      modified: z.array(z.string()).optional().default([]),
      deleted: z.array(z.string()).optional().default([]),
    }),
  }),
  z.object({
    action: z.literal("complete"),
    summary: z.string().optional(),
  }),
]);

export type SessionWriteInput = z.infer<typeof SessionWriteInput>;

export const ProgressStatus = z.enum([
  "dispatched",
  "running",
  "completed",
  "failed",
  "retrying",
]);

export const ProgressInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    phase_id: z.string(),
    agent: z.string().optional(),
    status: ProgressStatus,
    message: z.string().optional(),
  }),
  z.object({ action: z.literal("report") }),
  z.object({ action: z.literal("summary") }),
]);

export type ProgressInput = z.infer<typeof ProgressInput>;

export const ProgressEntry = z.object({
  timestamp: z.string(),
  phase_id: z.string(),
  agent: z.string().optional(),
  status: ProgressStatus,
  message: z.string().optional(),
});

export type ProgressEntry = z.infer<typeof ProgressEntry>;

export const ValidatePlanInput = z.object({
  plan_path: z.string(),
});

export const PlanPhase = z.object({
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
  parallel: z.boolean().optional(),
});

export type PlanPhase = z.infer<typeof PlanPhase>;

export const PlanFrontmatter = z.object({
  title: z.string(),
  design_ref: z.string().optional(),
  created: z.string().optional(),
  status: z.string().optional(),
  total_phases: z.number().optional(),
  estimated_files: z.number().optional(),
  phases: z.array(PlanPhase).optional(),
});

export const DispatchStatusInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list_batches") }),
  z.object({
    action: z.literal("batch_status"),
    batch_id: z.string(),
  }),
  z.object({
    action: z.literal("agent_result"),
    batch_id: z.string(),
    agent: z.string(),
  }),
]);

export type DispatchStatusInput = z.infer<typeof DispatchStatusInput>;

export const ContextChainInput = z.object({
  phase_id: z.string(),
  plan_path: z.string(),
});

export const BatchSummary = z.object({
  batch_status: z.string(),
  total_agents: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  wall_time_seconds: z.number(),
  agents: z.array(
    z.object({
      name: z.string(),
      exit_code: z.number(),
      status: z.string(),
    }),
  ),
});

export type BatchSummary = z.infer<typeof BatchSummary>;
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/schema.ts
git commit -m "feat: add Zod schemas for MCP server data structures"
```

---

### Task 3: MCP Server — Logger

**Files:**
- Create: `src/lib/logger.ts`

**Step 1: Create the logger**

Create `src/lib/logger.ts`:

```typescript
export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export function createLogger(prefix: string): Logger {
  const format = (
    level: string,
    message: string,
    data?: Record<string, unknown>,
  ): string => {
    const timestamp = new Date().toISOString();
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
    },
  };
}
```

All output goes to stderr (MCP requirement — stdout is reserved for JSON protocol).

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/logger.ts
git commit -m "feat: add structured logger for MCP server (stderr output)"
```

---

### Task 4: MCP Server — State File I/O

**Files:**
- Create: `src/lib/state.ts`

**Step 1: Create the state I/O module**

Create `src/lib/state.ts`:

```typescript
import { readFile, writeFile, rename, mkdtemp, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { SessionState } from "./schema.js";
import { createLogger } from "./logger.js";

const logger = createLogger("state");

interface ParsedFrontmatter<T> {
  frontmatter: T;
  body: string;
}

export function parseFrontmatter<T>(content: string): ParsedFrontmatter<T> {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("No YAML frontmatter found (expected --- delimiters)");
  }
  const [, yamlContent, body] = match;
  const frontmatter = parseYaml(yamlContent!) as T;
  return { frontmatter, body: body ?? "" };
}

export function serializeFrontmatter<T>(
  frontmatter: T,
  body: string,
): string {
  const yamlStr = stringifyYaml(frontmatter, { lineWidth: 0 });
  return `---\n${yamlStr}---\n${body}`;
}

export function resolveStateDir(): string {
  const stateDir = process.env["MAESTRO_STATE_DIR"] ?? ".gemini";
  return stateDir;
}

export function resolveStatePath(relativePath: string): string {
  const cwd = process.cwd();
  return join(cwd, relativePath);
}

export async function readSessionState(): Promise<SessionState | null> {
  const stateDir = resolveStateDir();
  const sessionPath = resolveStatePath(
    join(stateDir, "state", "active-session.md"),
  );

  if (!existsSync(sessionPath)) {
    return null;
  }

  const content = await readFile(sessionPath, "utf-8");
  const { frontmatter } = parseFrontmatter<unknown>(content);
  const result = SessionState.safeParse(frontmatter);

  if (!result.success) {
    logger.error("Session state parse failed", {
      path: sessionPath,
      errors: result.error.issues,
    });
    return null;
  }

  return result.data;
}

export async function writeSessionState(
  state: SessionState,
  body: string,
): Promise<void> {
  const stateDir = resolveStateDir();
  const sessionPath = resolveStatePath(
    join(stateDir, "state", "active-session.md"),
  );

  const parentDir = dirname(sessionPath);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(parentDir, { recursive: true });

  const content = serializeFrontmatter(state, body);

  const tempDir = dirname(sessionPath);
  const tempFile = join(tempDir, `.write-state-${Date.now()}`);
  await writeFile(tempFile, content, "utf-8");
  await rename(tempFile, sessionPath);
}

export async function readFileContent(absolutePath: string): Promise<string> {
  return readFile(absolutePath, "utf-8");
}

export async function appendToFile(
  absolutePath: string,
  content: string,
): Promise<void> {
  const { appendFile } = await import("node:fs/promises");
  const parentDir = dirname(absolutePath);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(parentDir, { recursive: true });
  await appendFile(absolutePath, content, "utf-8");
}

export async function listDirectories(dirPath: string): Promise<string[]> {
  if (!existsSync(dirPath)) {
    return [];
  }
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function fileExists(absolutePath: string): Promise<boolean> {
  return existsSync(absolutePath);
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/state.ts
git commit -m "feat: add state file I/O with YAML frontmatter parsing and atomic writes"
```

---

### Task 5: MCP Server — Session Tools

**Files:**
- Create: `src/tools/session.ts`

**Step 1: Create the session tools module**

Create `src/tools/session.ts`:

```typescript
import { z } from "zod";
import {
  SessionReadInput,
  SessionWriteInput,
  SessionState,
  Phase,
  DownstreamContext,
  TokenUsage,
} from "../lib/schema.js";
import {
  readSessionState,
  writeSessionState,
  resolveStateDir,
} from "../lib/state.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("session");

export async function sessionRead(
  rawInput: unknown,
): Promise<Record<string, unknown>> {
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
          implementation_plan: state.implementation_plan,
        },
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
          retry_count: p.retry_count,
        })),
      };
    case "errors":
      return {
        exists: true,
        errors: state.phases.flatMap((p) =>
          p.errors.map((e) => ({ ...e, phase_id: p.id, phase_name: p.name })),
        ),
      };
    case "files":
      return {
        exists: true,
        files: {
          created: state.phases.flatMap((p) => p.files_created),
          modified: state.phases.flatMap((p) => p.files_modified),
          deleted: state.phases.flatMap((p) => p.files_deleted),
        },
      };
    case "full":
    default:
      return { exists: true, session: state };
  }
}

function createEmptyPhase(id: number, name: string): Phase {
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
      warnings: [],
    },
    errors: [],
    retry_count: 0,
  };
}

export async function sessionWrite(
  rawInput: unknown,
): Promise<Record<string, unknown>> {
  const input = SessionWriteInput.parse(rawInput);
  const now = new Date().toISOString();

  switch (input.action) {
    case "create": {
      const slug = input.task
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50);
      const dateStr = now.slice(0, 10);
      const sessionId = `${dateStr}-${slug}`;

      const state: SessionState = {
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
          by_agent: {},
        },
        phases: [createEmptyPhase(1, "initial")],
      };

      const body = `# ${input.task} Orchestration Log\n`;
      await writeSessionState(state, body);
      logger.info("Session created", { sessionId });
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
          error: `Phase ${input.phase_id} not found`,
        };
      }

      phase.status = input.phase_status;
      if (input.phase_status === "in_progress" && !phase.started) {
        phase.started = now;
      }
      if (
        input.phase_status === "completed" ||
        input.phase_status === "failed"
      ) {
        phase.completed = now;
      }
      state.updated = now;
      state.current_phase = input.phase_id;

      const body = `# Orchestration Log\n`;
      await writeSessionState(state, body);
      logger.info("Phase updated", {
        phase_id: input.phase_id,
        status: input.phase_status,
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
          error: `Phase ${input.error.phase} not found`,
        };
      }

      phase.errors.push({
        agent: input.error.agent,
        timestamp: now,
        type: input.error.type,
        message: input.error.message,
        resolution: "pending",
        resolved: false,
      });
      phase.retry_count = input.error.retry_count;
      state.updated = now;

      const body = `# Orchestration Log\n`;
      await writeSessionState(state, body);
      logger.info("Error recorded", { phase: input.error.phase });
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
          error: `Phase ${input.phase_id} not found`,
        };
      }

      phase.files_created.push(...input.files.created);
      phase.files_modified.push(...input.files.modified);
      phase.files_deleted.push(...input.files.deleted);
      state.updated = now;

      const body = `# Orchestration Log\n`;
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

      const body = `# Orchestration Log\n\n## Summary\n${input.summary ?? "Session completed."}\n`;
      await writeSessionState(state, body);
      logger.info("Session completed", {
        session_id: state.session_id,
      });
      return { success: true, session_id: state.session_id };
    }
  }
}

export const SESSION_READ_TOOL = {
  name: "maestro_session_read",
  description:
    "Read current Maestro orchestration session state. Returns structured JSON instead of raw YAML. Use 'section' to request only metadata, phases, errors, or files to save context tokens.",
  inputSchema: SessionReadInput,
  handler: sessionRead,
};

export const SESSION_WRITE_TOOL = {
  name: "maestro_session_write",
  description:
    "Update Maestro orchestration session state with schema validation and atomic writes. Actions: create (new session), update_phase (change phase status), add_error (record error), add_files (update file manifest), complete (finish session).",
  inputSchema: SessionWriteInput,
  handler: sessionWrite,
};
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/session.ts
git commit -m "feat: add session read/write MCP tools with atomic state management"
```

---

### Task 6: MCP Server — Progress Tool

**Files:**
- Create: `src/tools/progress.ts`

**Step 1: Create the progress tool module**

Create `src/tools/progress.ts`:

```typescript
import { ProgressInput, ProgressEntry } from "../lib/schema.js";
import {
  resolveStateDir,
  resolveStatePath,
  appendToFile,
  readFileContent,
  fileExists,
} from "../lib/state.js";
import { createLogger } from "../lib/logger.js";
import { join } from "node:path";

const logger = createLogger("progress");

function getProgressPath(): string {
  const stateDir = resolveStateDir();
  return resolveStatePath(join(stateDir, "state", "progress.jsonl"));
}

async function readProgressEntries(): Promise<ProgressEntry[]> {
  const progressPath = getProgressPath();
  if (!(await fileExists(progressPath))) {
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

export async function progress(
  rawInput: unknown,
): Promise<Record<string, unknown>> {
  const input = ProgressInput.parse(rawInput);

  switch (input.action) {
    case "update": {
      const entry: ProgressEntry = {
        timestamp: new Date().toISOString(),
        phase_id: input.phase_id,
        agent: input.agent,
        status: input.status,
        message: input.message,
      };

      const progressPath = getProgressPath();
      await appendToFile(progressPath, JSON.stringify(entry) + "\n");
      logger.info("Progress updated", {
        phase_id: input.phase_id,
        status: input.status,
      });
      return { success: true, entry };
    }

    case "report": {
      const entries = await readProgressEntries();

      const phaseMap = new Map<
        string,
        { latest_status: string; agent?: string; entries: number; first: string; last: string }
      >();

      for (const entry of entries) {
        const existing = phaseMap.get(entry.phase_id);
        if (!existing) {
          phaseMap.set(entry.phase_id, {
            latest_status: entry.status,
            agent: entry.agent,
            entries: 1,
            first: entry.timestamp,
            last: entry.timestamp,
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
        ...data,
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
        const first = new Date(entries[0]!.timestamp).getTime();
        const last = new Date(entries[entries.length - 1]!.timestamp).getTime();
        wallTime = Math.round((last - first) / 1000);
      }

      return {
        total_phases: phases.size,
        completed_phases: completedPhases.size,
        failed_phases: failed.length,
        wall_time_seconds: wallTime,
        total_entries: entries.length,
      };
    }
  }
}

export const PROGRESS_TOOL = {
  name: "maestro_progress",
  description:
    "Track orchestration progress in real-time. Actions: update (log phase/agent status change), report (current status of all phases), summary (condensed overview with counts and timing).",
  inputSchema: ProgressInput,
  handler: progress,
};
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/progress.ts
git commit -m "feat: add progress tracking MCP tool with JSONL append-only log"
```

---

### Task 7: MCP Server — Validation Tool

**Files:**
- Create: `src/tools/validation.ts`

**Step 1: Create the validation tool module**

Create `src/tools/validation.ts`:

```typescript
import { ValidatePlanInput, PlanPhase, PlanFrontmatter } from "../lib/schema.js";
import {
  readFileContent,
  fileExists,
  resolveStatePath,
} from "../lib/state.js";
import { parseFrontmatter } from "../lib/state.js";
import { createLogger } from "../lib/logger.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const logger = createLogger("validation");

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
    process.env["EXTENSION_PATH"] ?? join(process.cwd(), "..");
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
      if (!existsSync(agentFile)) {
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
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/validation.ts
git commit -m "feat: add plan validation MCP tool with dependency graph analysis"
```

---

### Task 8: MCP Server — Dispatch Tools

**Files:**
- Create: `src/tools/dispatch.ts`

**Step 1: Create the dispatch tools module**

Create `src/tools/dispatch.ts` with `maestro_dispatch_status` and `maestro_context_chain`:

```typescript
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
import { createLogger } from "../lib/logger.js";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";

const logger = createLogger("dispatch");

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
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/dispatch.ts
git commit -m "feat: add dispatch status and context chain MCP tools"
```

---

### Task 9: MCP Server — Entry Point

**Files:**
- Modify: `src/index.ts`

**Step 1: Replace the placeholder with the MCP server setup**

Replace `src/index.ts` with:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogger } from "./lib/logger.js";
import { SESSION_READ_TOOL, SESSION_WRITE_TOOL } from "./tools/session.js";
import { PROGRESS_TOOL } from "./tools/progress.js";
import { VALIDATE_PLAN_TOOL } from "./tools/validation.js";
import {
  DISPATCH_STATUS_TOOL,
  CONTEXT_CHAIN_TOOL,
} from "./tools/dispatch.js";

const logger = createLogger("server");

const server = new McpServer({
  name: "maestro",
  version: "1.1.0",
});

const tools = [
  SESSION_READ_TOOL,
  SESSION_WRITE_TOOL,
  PROGRESS_TOOL,
  VALIDATE_PLAN_TOOL,
  DISPATCH_STATUS_TOOL,
  CONTEXT_CHAIN_TOOL,
];

for (const tool of tools) {
  server.tool(
    tool.name,
    tool.description,
    tool.inputSchema.shape ?? {},
    async (args: Record<string, unknown>) => {
      try {
        const result = await tool.handler(args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        logger.error(`Tool ${tool.name} failed`, { error: message });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Maestro MCP server started", {
    tools: tools.map((t) => t.name),
  });
}

main().catch((error) => {
  logger.error("Failed to start server", { error: String(error) });
  process.exit(1);
});
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add MCP server entry point wiring all 6 orchestration tools"
```

---

### Task 10: Build & Verify MCP Server

**Step 1: Run the full build**

Run: `npm run build`
Expected: `dist/index.js` created successfully, no errors

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors

**Step 3: Verify the bundle runs**

Run: `node dist/index.js --help 2>&1 || true`
Expected: Server starts and waits for stdio (may hang waiting for input — that's correct). Ctrl+C to exit. The key is no crash on startup.

Alternatively, verify the bundle is valid JS:
Run: `node -e "import('file://' + process.cwd() + '/dist/index.js')" 2>&1 | head -5`
Expected: No syntax errors

**Step 4: Commit the built bundle**

```bash
git add dist/index.js
git commit -m "build: compile MCP server bundle for zero-build-step installation"
```

---

### Task 11: Policy Engine — TOML Files

**Files:**
- Create: `policies/safety-baseline.toml`
- Create: `policies/agent-read-only.toml`
- Create: `policies/agent-read-shell.toml`
- Create: `policies/agent-read-write.toml`
- Create: `policies/agent-full-access.toml`

**Step 1: Create safety-baseline.toml**

Create `policies/safety-baseline.toml`:

```toml
[[rule]]
toolName = "run_shell_command"
commandRegex = "rm\\s+-rf\\s+/"
decision = "deny"
deny_message = "Destructive recursive deletion from root is blocked by Maestro safety policy."
priority = 900

[[rule]]
toolName = "run_shell_command"
commandRegex = "git\\s+push\\s+--force\\s+(origin\\s+)?(main|master)"
decision = "deny"
deny_message = "Force push to main/master is blocked by Maestro safety policy."
priority = 900

[[rule]]
toolName = "run_shell_command"
commandRegex = "git\\s+reset\\s+--hard"
decision = "deny"
deny_message = "Hard reset is blocked by Maestro safety policy. Use explicit user confirmation."
priority = 900

[[rule]]
toolName = "run_shell_command"
commandRegex = "(echo|printf|cat\\s*<<).*>"
decision = "deny"
deny_message = "File content must be written using write_file or replace tools, not shell redirects."
priority = 800

[[rule]]
toolName = ["write_file", "replace"]
argsPattern = "\\.(env|pem|key|credentials)"
decision = "deny"
deny_message = "Writing to sensitive files (.env, .pem, .key, .credentials) is blocked by Maestro safety policy."
priority = 850
```

**Step 2: Create agent-read-only.toml**

Create `policies/agent-read-only.toml`:

```toml
[[rule]]
toolName = ["read_file", "grep_search", "list_directory", "web_search"]
decision = "allow"
priority = 500
modes = ["yolo"]

[[rule]]
toolName = ["write_file", "replace"]
decision = "deny"
deny_message = "This agent has read-only access. File modifications are not permitted."
priority = 600
modes = ["yolo"]

[[rule]]
toolName = "run_shell_command"
decision = "deny"
deny_message = "This agent has read-only access. Shell execution is not permitted."
priority = 600
modes = ["yolo"]
```

**Step 3: Create agent-read-shell.toml**

Create `policies/agent-read-shell.toml`:

```toml
[[rule]]
toolName = ["read_file", "grep_search", "list_directory", "web_search", "run_shell_command"]
decision = "allow"
priority = 500
modes = ["yolo"]

[[rule]]
toolName = ["write_file", "replace"]
decision = "deny"
deny_message = "This agent has read+shell access. File modifications are not permitted."
priority = 600
modes = ["yolo"]
```

**Step 4: Create agent-read-write.toml**

Create `policies/agent-read-write.toml`:

```toml
[[rule]]
toolName = ["read_file", "grep_search", "list_directory", "web_search", "write_file", "replace"]
decision = "allow"
priority = 500
modes = ["yolo"]

[[rule]]
toolName = "run_shell_command"
decision = "deny"
deny_message = "This agent has read+write access. Shell execution is not permitted."
priority = 600
modes = ["yolo"]
```

**Step 5: Create agent-full-access.toml**

Create `policies/agent-full-access.toml`:

```toml
[[rule]]
toolName = ["read_file", "grep_search", "list_directory", "web_search", "write_file", "replace", "run_shell_command"]
decision = "allow"
priority = 500
modes = ["yolo"]
```

**Step 6: Commit**

```bash
git add policies/
git commit -m "feat: add policy engine TOML files for mechanical tool restriction enforcement"
```

---

### Task 12: Hooks — Configuration & Scripts

**Files:**
- Create: `hooks/hooks.json`
- Create: `hooks/session-lifecycle.sh`
- Create: `hooks/tool-compliance.sh`
- Create: `hooks/tool-filter.sh`
- Create: `hooks/agent-output-validator.sh`
- Create: `hooks/context-preserver.sh`

**Step 1: Create hooks.json**

Create `hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": {
      "hooks": [
        {
          "type": "command",
          "name": "maestro-session-lifecycle",
          "command": "${extensionPath}/hooks/session-lifecycle.sh start",
          "timeout": 10000,
          "description": "Initialize workspace, detect active sessions, inject context"
        }
      ]
    },
    "SessionEnd": {
      "hooks": [
        {
          "type": "command",
          "name": "maestro-session-lifecycle",
          "command": "${extensionPath}/hooks/session-lifecycle.sh end",
          "timeout": 10000,
          "description": "Auto-archive completed sessions, generate summary"
        }
      ]
    },
    "BeforeTool": {
      "matcher": "write_file|replace|run_shell_command",
      "hooks": [
        {
          "type": "command",
          "name": "maestro-tool-compliance",
          "command": "${extensionPath}/hooks/tool-compliance.sh",
          "timeout": 5000,
          "description": "Block shell redirects, heredocs, echo > for file writing"
        }
      ]
    },
    "BeforeToolSelection": {
      "hooks": [
        {
          "type": "command",
          "name": "maestro-tool-filter",
          "command": "${extensionPath}/hooks/tool-filter.sh",
          "timeout": 5000,
          "description": "Restrict available tools based on active agent role"
        }
      ]
    },
    "AfterAgent": {
      "hooks": [
        {
          "type": "command",
          "name": "maestro-output-validator",
          "command": "${extensionPath}/hooks/agent-output-validator.sh",
          "timeout": 10000,
          "description": "Validate agent output against handoff contract schema"
        }
      ]
    },
    "PreCompress": {
      "hooks": [
        {
          "type": "command",
          "name": "maestro-context-preserver",
          "command": "${extensionPath}/hooks/context-preserver.sh",
          "timeout": 5000,
          "description": "Preserve session state before context compression"
        }
      ]
    }
  }
}
```

**Step 2: Create session-lifecycle.sh**

Create `hooks/session-lifecycle.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
INPUT=$(cat)

CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null) || CWD=""
STATE_DIR="${MAESTRO_STATE_DIR:-.gemini}"

if [[ -z "$CWD" ]]; then
  CWD="$(pwd)"
fi

SESSION_PATH="${CWD}/${STATE_DIR}/state/active-session.md"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENSURE_SCRIPT="${EXTENSION_DIR}/scripts/ensure-workspace.sh"

case "$ACTION" in
  start)
    if [[ -x "$ENSURE_SCRIPT" ]]; then
      (cd "$CWD" && "$ENSURE_SCRIPT" "$STATE_DIR") >&2 || echo "Workspace init warning" >&2
    fi

    if [[ -f "$SESSION_PATH" ]]; then
      SESSION_ID=$(grep -m1 '^session_id:' "$SESSION_PATH" | sed 's/^session_id:\s*//' | tr -d '"' 2>/dev/null) || SESSION_ID="unknown"
      CURRENT_PHASE=$(grep -m1 '^current_phase:' "$SESSION_PATH" | sed 's/^current_phase:\s*//' 2>/dev/null) || CURRENT_PHASE="unknown"
      STATUS=$(grep -m1 '^status:' "$SESSION_PATH" | sed 's/^status:\s*//' | tr -d '"' 2>/dev/null) || STATUS="unknown"

      printf '{"systemMessage":"[Maestro] Active session detected: %s (phase %s, status: %s). Use /maestro.resume to continue or /maestro.archive to start fresh.","continue":true}\n' \
        "$SESSION_ID" "$CURRENT_PHASE" "$STATUS"
    else
      printf '{"systemMessage":"[Maestro] Workspace ready. No active session.","continue":true}\n'
    fi
    ;;

  end)
    if [[ -f "$SESSION_PATH" ]]; then
      STATUS=$(grep -m1 '^status:' "$SESSION_PATH" | sed 's/^status:\s*//' | tr -d '"' 2>/dev/null) || STATUS=""

      if [[ "$STATUS" == "completed" ]]; then
        SESSION_ID=$(grep -m1 '^session_id:' "$SESSION_PATH" | sed 's/^session_id:\s*//' | tr -d '"' 2>/dev/null) || SESSION_ID="session"
        ARCHIVE_DIR="${CWD}/${STATE_DIR}/state/archive"
        mkdir -p "$ARCHIVE_DIR" 2>/dev/null || true
        mv "$SESSION_PATH" "${ARCHIVE_DIR}/${SESSION_ID}.md" 2>/dev/null || true

        HISTORY_LOG="${CWD}/${STATE_DIR}/state/session-history.log"
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | ${SESSION_ID} | completed" >> "$HISTORY_LOG" 2>/dev/null || true

        echo "Archived session: $SESSION_ID" >&2
      fi
    fi

    printf '{"continue":true}\n'
    ;;

  *)
    echo "Unknown action: $ACTION" >&2
    printf '{"continue":true}\n'
    ;;
esac
```

**Step 3: Create tool-compliance.sh**

Create `hooks/tool-compliance.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null) || TOOL_NAME=""

if [[ "$TOOL_NAME" != "run_shell_command" ]]; then
  printf '{"decision":"allow"}\n'
  exit 0
fi

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || COMMAND=""

if [[ -z "$COMMAND" ]]; then
  printf '{"decision":"allow"}\n'
  exit 0
fi

FORBIDDEN_PATTERNS=(
  'echo[[:space:]].*[[:space:]]>'
  'echo[[:space:]].*[[:space:]]>>'
  'printf[[:space:]].*[[:space:]]>'
  'printf[[:space:]].*[[:space:]]>>'
  'cat[[:space:]]*<<'
  'tee[[:space:]][^-]'
)

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    printf '{"decision":"deny","reason":"File content must be written using write_file or replace tools. Shell redirects corrupt YAML/Markdown special characters. Blocked pattern: %s"}\n' "$pattern"
    exit 0
  fi
done

printf '{"decision":"allow"}\n'
```

**Step 4: Create tool-filter.sh**

Create `hooks/tool-filter.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)

MESSAGES=$(echo "$INPUT" | jq -r '.llm_request.messages // empty' 2>/dev/null) || MESSAGES=""

if [[ -z "$MESSAGES" ]] || [[ "$MESSAGES" == "null" ]]; then
  printf '{}\n'
  exit 0
fi

AGENT_NAME=$(echo "$INPUT" | jq -r '
  .llm_request.messages
  | map(select(.role == "user"))
  | last
  | .content // ""
  | if type == "array" then map(.text // "") | join(" ") else . end
  | capture("Agent:\\s*(?<name>[a-z][a-z0-9-]*)") // null
  | .name // null
' 2>/dev/null) || AGENT_NAME=""

if [[ -z "$AGENT_NAME" ]] || [[ "$AGENT_NAME" == "null" ]]; then
  printf '{}\n'
  exit 0
fi

READ_TOOLS='["read_file","grep_search","list_directory","web_search"]'
READ_SHELL_TOOLS='["read_file","grep_search","list_directory","web_search","run_shell_command"]'
READ_WRITE_TOOLS='["read_file","grep_search","list_directory","web_search","write_file","replace"]'

case "$AGENT_NAME" in
  architect|api-designer|code-reviewer)
    printf '{"allowedTools":%s}\n' "$READ_TOOLS"
    ;;
  debugger|performance-engineer|security-engineer)
    printf '{"allowedTools":%s}\n' "$READ_SHELL_TOOLS"
    ;;
  refactor|technical-writer)
    printf '{"allowedTools":%s}\n' "$READ_WRITE_TOOLS"
    ;;
  coder|data-engineer|devops-engineer|tester)
    printf '{}\n'
    ;;
  *)
    printf '{}\n'
    ;;
esac
```

**Step 5: Create agent-output-validator.sh**

Create `hooks/agent-output-validator.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)

RESPONSE=$(echo "$INPUT" | jq -r '.response // empty' 2>/dev/null) || RESPONSE=""

if [[ -z "$RESPONSE" ]] || [[ "$RESPONSE" == "null" ]]; then
  printf '{"continue":true}\n'
  exit 0
fi

MISSING=()

if ! echo "$RESPONSE" | grep -qi "Task Report"; then
  MISSING+=("Task Report")
fi

if ! echo "$RESPONSE" | grep -qi "Status.*:"; then
  MISSING+=("Status field")
fi

if ! echo "$RESPONSE" | grep -qi "Files Created\|Files Modified\|Files Deleted\|Files Changed"; then
  MISSING+=("File manifest")
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
  MISSING_STR=$(IFS=", "; echo "${MISSING[*]}")
  printf '{"continue":true,"systemMessage":"[Maestro] Agent output missing required sections: %s. Consider requesting a retry or manual completion."}\n' "$MISSING_STR"
else
  printf '{"continue":true}\n'
fi
```

**Step 6: Create context-preserver.sh**

Create `hooks/context-preserver.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)

CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null) || CWD="$(pwd)"
STATE_DIR="${MAESTRO_STATE_DIR:-.gemini}"
SESSION_PATH="${CWD}/${STATE_DIR}/state/active-session.md"

if [[ ! -f "$SESSION_PATH" ]]; then
  printf '{"continue":true}\n'
  exit 0
fi

SESSION_ID=$(grep -m1 '^session_id:' "$SESSION_PATH" | sed 's/^session_id:\s*//' | tr -d '"' 2>/dev/null) || SESSION_ID="unknown"
CURRENT_PHASE=$(grep -m1 '^current_phase:' "$SESSION_PATH" | sed 's/^current_phase:\s*//' 2>/dev/null) || CURRENT_PHASE="?"
TOTAL_PHASES=$(grep -m1 '^total_phases:' "$SESSION_PATH" | sed 's/^total_phases:\s*//' 2>/dev/null) || TOTAL_PHASES="?"
STATUS=$(grep -m1 '^status:' "$SESSION_PATH" | sed 's/^status:\s*//' | tr -d '"' 2>/dev/null) || STATUS="unknown"

COMPLETED=$(grep -c 'status: "completed"' "$SESSION_PATH" 2>/dev/null) || COMPLETED=0

CHECKPOINT_PATH="${CWD}/${STATE_DIR}/state/compress-checkpoint.md"
mkdir -p "$(dirname "$CHECKPOINT_PATH")" 2>/dev/null || true

cat > "$CHECKPOINT_PATH" <<CHECKPOINT
# Session State Checkpoint
- Session: ${SESSION_ID}
- Status: ${STATUS}
- Phase: ${CURRENT_PHASE} of ${TOTAL_PHASES}
- Completed phases: ${COMPLETED}
- Preserved at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
CHECKPOINT

printf '{"continue":true,"systemMessage":"[Maestro] Session state preserved before context compression. Session: %s, Phase %s/%s (%s completed). Use maestro_session_read tool to restore full context."}\n' \
  "$SESSION_ID" "$CURRENT_PHASE" "$TOTAL_PHASES" "$COMPLETED"
```

**Step 7: Make all hook scripts executable**

Run: `chmod +x hooks/*.sh`

**Step 8: Commit**

```bash
git add hooks/
git commit -m "feat: add hooks layer with lifecycle, compliance, filtering, validation, and context preservation"
```

---

### Task 13: Extension Manifest Update

**Files:**
- Modify: `gemini-extension.json`

**Step 1: Add mcpServers config to gemini-extension.json**

Add the `mcpServers` field to `gemini-extension.json` (after the `contextFileName` field). The exact edit:

Find the line `"contextFileName": "GEMINI.md",` and add after it:

```json
  "mcpServers": {
    "maestro": {
      "command": "node",
      "args": ["${extensionPath}/dist/index.js"],
      "cwd": "${workspacePath}"
    }
  },
```

**Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('gemini-extension.json', 'utf-8')); console.log('valid')"`
Expected: `valid`

**Step 3: Commit**

```bash
git add gemini-extension.json
git commit -m "feat: register MCP server in extension manifest"
```

---

### Task 14: GEMINI.md Update

**Files:**
- Modify: `GEMINI.md`

This task modifies `GEMINI.md` to reference the new MCP tools, acknowledge hooks, and remove sections that have moved to hooks/MCP.

**Step 1: Replace the "Startup Checks" section**

Replace the full `## Startup Checks` section (lines 13-41) with:

```markdown
## Startup Checks

Before any orchestration command:

1. **Subagent Prerequisite**: Verify `experimental.enableAgents` is `true` in `~/.gemini/settings.json`. If not enabled, inform the user and do not proceed until subagents are confirmed enabled.

2. **Settings Resolution**: Read `MAESTRO_*` environment variables and resolve configuration:

| Setting | envVar | Default | Applies To |
|---------|--------|---------|------------|
| Default Model | `MAESTRO_DEFAULT_MODEL` | `gemini-3-pro-preview` | All agent delegation prompts |
| Writer Model | `MAESTRO_WRITER_MODEL` | `gemini-3-flash-preview` | technical-writer delegation only |
| Default Temperature | `MAESTRO_DEFAULT_TEMPERATURE` | `0.2` | All agent delegation prompts |
| Max Agent Turns | `MAESTRO_MAX_TURNS` | `25` | All agent delegation prompts |
| Agent Timeout | `MAESTRO_AGENT_TIMEOUT` | `10` (minutes) | All agent delegation prompts |
| Disabled Agents | `MAESTRO_DISABLED_AGENTS` | (none) | Phase assignment — excluded from plan |
| Max Retries | `MAESTRO_MAX_RETRIES` | `2` | Execution retry logic |
| Auto Archive | `MAESTRO_AUTO_ARCHIVE` | `true` | Session completion |
| Validation Strictness | `MAESTRO_VALIDATION_STRICTNESS` | `normal` | Post-phase validation |
| State Directory | `MAESTRO_STATE_DIR` | `.gemini` | Session state and plan paths |
| Max Concurrent | `MAESTRO_MAX_CONCURRENT` | `0` (unlimited) | Parallel dispatch max simultaneous agents |
| Stagger Delay | `MAESTRO_STAGGER_DELAY` | `5` (seconds) | Seconds between parallel agent launches |
| Execution Mode | `MAESTRO_EXECUTION_MODE` | `ask` | Phase 3 dispatch: `parallel`, `sequential`, or `ask` |

When an env var is unset, use the default. When set, override the corresponding agent definition value in delegation prompts.

3. **Disabled Agent Check**: If `MAESTRO_DISABLED_AGENTS` is set, parse the comma-separated list and exclude those agents from implementation planning.

Note: Workspace initialization is handled automatically by the SessionStart hook. You do not need to run `ensure-workspace.sh` manually.
```

**Step 2: Replace the "Content Writing Rule" section**

Replace the `## Content Writing Rule` section with:

```markdown
## Automated Enforcement (Hooks)

The following are enforced automatically by Gemini CLI hooks — do NOT include these as instructions in delegation prompts:
- **File-writing restrictions**: BeforeTool hook blocks shell redirects (`echo >`, heredocs, `cat <<`). Safety baseline policy provides backup enforcement.
- **Tool access restrictions**: BeforeToolSelection hook filters available tools per agent role.
- **Session state preservation**: PreCompress hook preserves orchestration state before context compression.
- **Agent output validation**: AfterAgent hook checks for required Task Report and Downstream Context sections.

Focus delegation prompts on: task description, scope boundaries, downstream consumers, validation criteria.
```

**Step 3: Add new "Orchestration Tools" section after the Automated Enforcement section**

```markdown
## Orchestration Tools (MCP: maestro)

Use these tools for all orchestration state operations. They replace raw file I/O with validated, structured operations.

| Tool | When to Use |
|------|-------------|
| `maestro_session_read` | Before any phase transition. Check current state. Use `section` parameter to minimize context usage. |
| `maestro_session_write` | After phase completion, on errors, session create/complete. |
| `maestro_progress` | After dispatching agents. Before reporting status to user. |
| `maestro_validate_plan` | After Phase 2 produces a plan. Before Phase 3 execution begins. |
| `maestro_dispatch_status` | After parallel batch completes. Before deciding next batch. |
| `maestro_context_chain` | Before delegating any phase with `blocked_by` dependencies. Inject returned `context_chain` into delegation prompt. |
```

**Step 4: Remove the "Workspace Readiness" step (item 4) from Startup Checks**

It's now handled by the SessionStart hook. If there's still a reference to `./scripts/ensure-workspace.sh` in the startup checks, remove it.

**Step 5: Verify the file is valid Markdown**

Read the file and verify no broken formatting.

**Step 6: Commit**

```bash
git add GEMINI.md
git commit -m "feat: integrate MCP tools and hook-aware behavior into orchestrator"
```

---

### Task 15: Skills Updates

**Files:**
- Modify: `skills/delegation/SKILL.md`
- Modify: `skills/execution/SKILL.md`
- Modify: `skills/session-management/SKILL.md`

**Step 1: Update delegation skill — Context Chain Construction**

In `skills/delegation/SKILL.md`, find the `### Context Chain Construction` subsection and replace it with:

```markdown
### Context Chain Construction

Before delegating a phase with dependencies (`blocked_by` is non-empty):

1. Call `maestro_context_chain` with the phase_id and plan_path
2. The tool reads completed agent results, extracts Downstream Context sections, and assembles them in dependency order
3. Inject the returned `context_chain` into the delegation prompt under a "## Upstream Context" heading
4. If `missing_contexts` is non-empty, include a visible placeholder for each missing dependency

This replaces manual reading and assembly of upstream phase results.
```

**Step 2: Update delegation skill — Remove file-writing rules block from Tool Restriction Enforcement**

In `skills/delegation/SKILL.md`, find the `### Tool Restriction Enforcement` subsection. Remove the `FILE WRITING RULES` block template and its surrounding text (the block starting with "The file writing rules block template:" through "This block reinforces..."). Replace with:

```markdown
Note: File-writing rules are enforced automatically by the BeforeTool hook and safety baseline policy. Do not include file-writing rule blocks in delegation prompts.
```

**Step 3: Update execution skill — State File Access**

In `skills/execution/SKILL.md`, replace the `## State File Access` section with:

```markdown
## State Access

All session state operations use MCP tools instead of raw file I/O:

| Operation | Tool | Action |
|-----------|------|--------|
| Read session state | `maestro_session_read` | Use `section` parameter for targeted reads |
| Update phase status | `maestro_session_write` | `action: "update_phase"` |
| Record errors | `maestro_session_write` | `action: "add_error"` |
| Update file manifest | `maestro_session_write` | `action: "add_files"` |
| Track progress | `maestro_progress` | `action: "update"` on each transition |
| Read dispatch results | `maestro_dispatch_status` | `action: "batch_status"` or `"agent_result"` |
| Build context chain | `maestro_context_chain` | Before delegating phases with dependencies |
| Validate plan | `maestro_validate_plan` | Before Phase 3 execution begins |

Never use `read_file`, `read-state.sh`, or `write-state.sh` for session state. These are superseded by MCP tools.
```

**Step 4: Update execution skill — Add plan validation step**

In `skills/execution/SKILL.md`, add before the `## Phase Execution Protocol` section:

```markdown
## Pre-Execution Validation

Before beginning Phase 3 execution:

1. Call `maestro_validate_plan` with the implementation plan path
2. If `valid` is `false`, present errors to the user and do not proceed
3. If warnings exist, present them but allow the user to proceed
4. Use the returned `dependency_graph.parallel_batches` to inform batch construction
5. Use `dependency_graph.critical_path` to estimate execution order
```

**Step 5: Update execution skill — Parallel Dispatch Protocol steps 9-10**

In the `#### Parallel Dispatch Protocol` subsection, replace steps 9-10 (about reading summary.json and agent results via read-state.sh) with:

```markdown
9. Call `maestro_dispatch_status` with `action: "batch_status"` and the batch_id to get structured results
10. For failed agents, call `maestro_dispatch_status` with `action: "agent_result"` to get detailed output
11. Call `maestro_progress` with `action: "update"` for each completed/failed phase
12. Call `maestro_session_write` with `action: "update_phase"` for each phase in the batch
```

**Step 6: Update session-management skill — State File Access**

In `skills/session-management/SKILL.md`, replace the `### State File Access` subsection with:

```markdown
### State Access

All session state operations use MCP tools:

- **Reading state**: `maestro_session_read` with optional `section` parameter
- **Creating sessions**: `maestro_session_write` with `action: "create"`
- **Updating phases**: `maestro_session_write` with `action: "update_phase"`
- **Recording errors**: `maestro_session_write` with `action: "add_error"`
- **Updating files**: `maestro_session_write` with `action: "add_files"`
- **Completing sessions**: `maestro_session_write` with `action: "complete"`

Do not use `read-state.sh`, `write-state.sh`, or `write_file` for session state files. MCP tools handle schema validation, atomic writes, and structured output.
```

**Step 7: Update session-management skill — Resume Protocol step 1**

In the `### Resume Steps` subsection, replace step 1:

```markdown
1. **Read State**: Call `maestro_session_read` with `section: "full"` to get the complete session state
```

**Step 8: Commit**

```bash
git add skills/delegation/SKILL.md skills/execution/SKILL.md skills/session-management/SKILL.md
git commit -m "feat: update skills to use MCP tools instead of raw file I/O"
```

---

### Task 16: Protocol Updates

**Files:**
- Modify: `protocols/agent-base-protocol.md`
- Modify: `protocols/filesystem-safety-protocol.md`

**Step 1: Simplify agent-base-protocol.md file-writing rule**

In `protocols/agent-base-protocol.md`, replace the `## CRITICAL: File Writing Rule` section with a shorter version that acknowledges hook enforcement:

```markdown
## CRITICAL: File Writing Rule

ALWAYS use `write_file` for creating files and `replace` for modifying files. NEVER use `run_shell_command` to write file content (cat, echo, printf, heredocs, shell redirection). This rule is enforced by Gemini CLI hooks — violations will be automatically blocked.
```

**Step 2: Simplify filesystem-safety-protocol.md Rule 6**

In `protocols/filesystem-safety-protocol.md`, replace Rule 6 with:

```markdown
## Rule 6 — Write Tool Only

All file content must be written using `write_file` or `replace` tools. Shell-based file writing is automatically blocked by Gemini CLI hooks and safety policies.
```

**Step 3: Commit**

```bash
git add protocols/agent-base-protocol.md protocols/filesystem-safety-protocol.md
git commit -m "feat: simplify protocols — file-writing enforcement now handled by hooks and policies"
```

---

## File Inventory

| # | File | Task | Purpose |
|---|------|------|---------|
| 1 | `package.json` | 1 | Dependencies and build scripts |
| 2 | `tsconfig.json` | 1 | TypeScript compiler configuration |
| 3 | `.gitignore` | 1 | Add node_modules exclusion |
| 4 | `src/lib/schema.ts` | 2 | Zod schemas for all data structures |
| 5 | `src/lib/logger.ts` | 3 | Structured logging to stderr |
| 6 | `src/lib/state.ts` | 4 | YAML frontmatter parsing, atomic writes |
| 7 | `src/tools/session.ts` | 5 | maestro_session_read + maestro_session_write |
| 8 | `src/tools/progress.ts` | 6 | maestro_progress |
| 9 | `src/tools/validation.ts` | 7 | maestro_validate_plan |
| 10 | `src/tools/dispatch.ts` | 8 | maestro_dispatch_status + maestro_context_chain |
| 11 | `src/index.ts` | 9 | MCP server entry point |
| 12 | `dist/index.js` | 10 | Built bundle (committed) |
| 13 | `policies/safety-baseline.toml` | 11 | Global destructive-op blocking |
| 14 | `policies/agent-read-only.toml` | 11 | Read-only agent restrictions |
| 15 | `policies/agent-read-shell.toml` | 11 | Read+shell agent restrictions |
| 16 | `policies/agent-read-write.toml` | 11 | Read+write agent restrictions |
| 17 | `policies/agent-full-access.toml` | 11 | Full-access agent permissions |
| 18 | `hooks/hooks.json` | 12 | Hook event-to-script mappings |
| 19 | `hooks/session-lifecycle.sh` | 12 | SessionStart/SessionEnd handler |
| 20 | `hooks/tool-compliance.sh` | 12 | BeforeTool file-writing enforcement |
| 21 | `hooks/tool-filter.sh` | 12 | BeforeToolSelection agent filtering |
| 22 | `hooks/agent-output-validator.sh` | 12 | AfterAgent output validation |
| 23 | `hooks/context-preserver.sh` | 12 | PreCompress state preservation |
| 24 | `gemini-extension.json` | 13 | MCP server registration |
| 25 | `GEMINI.md` | 14 | Orchestrator integration |
| 26 | `skills/delegation/SKILL.md` | 15 | Context chain via MCP tool |
| 27 | `skills/execution/SKILL.md` | 15 | State ops via MCP tools |
| 28 | `skills/session-management/SKILL.md` | 15 | State CRUD via MCP tools |
| 29 | `protocols/agent-base-protocol.md` | 16 | Simplified file-writing rule |
| 30 | `protocols/filesystem-safety-protocol.md` | 16 | Simplified Rule 6 |
