# Maestro v2: Hooks, MCP Server & Policy Engine

**Date:** 2026-02-15
**Status:** Approved
**Scope:** Add three new architectural layers to Maestro — hooks for lifecycle/compliance, MCP server for orchestration tools, policy engine for mechanical access control.

---

## Problem Statement

Maestro v1 relies entirely on prompt engineering for agent compliance, manual file I/O for session state, and advisory instructions for tool restrictions. This creates three pain points:

1. **Agent compliance** — agents don't always follow protocols (file writing rules, tool restrictions, output format). Enforcement is advisory, not mechanical.
2. **Session continuity** — losing context across sessions, manual resume friction, fragile state management via raw file reads/writes.
3. **Observability** — no visibility into parallel dispatch progress, no structured logging, no real-time status.

## Solution

Three new layers leveraging untapped Gemini CLI extension capabilities:

| Layer | Mechanism | Responsibility |
|---|---|---|
| **Hooks** | `hooks/hooks.json` + shell scripts | Lifecycle management + compliance enforcement |
| **MCP Server** | TypeScript Node.js server | Custom orchestration tools for the TechLead |
| **Policy Engine** | TOML policy files | Mechanical tool restriction enforcement |

## Architecture

```
+-----------------------------------------------------+
|                   Gemini CLI Engine                   |
+----------+--------------+---------------------------+
|  Policy  |    Hooks     |       MCP Server          |
|  Engine  |  (lifecycle  |   (orchestration tools)   |
|  (access |   + enforce) |                           |
|  control)|              |                           |
+----------+--------------+---------------------------+
|              TechLead Orchestrator (GEMINI.md)        |
+-----------------------------------------------------+
|  Commands | Agents | Skills | Protocols | Templates  |
+-----------------------------------------------------+
```

Separation of concerns:
- **Policies** = "who can do what" (access control, enforced by engine)
- **Hooks** = "what happens when" (lifecycle events, compliance checks)
- **MCP Server** = "tools for orchestration" (state, progress, validation)

## New Directory Structure

```
maestro-gemini/
+-- hooks/
|   +-- hooks.json                    # Hook event -> script mappings
|   +-- session-lifecycle.sh          # SessionStart/SessionEnd handler
|   +-- tool-compliance.sh            # BeforeTool file-writing enforcement
|   +-- tool-filter.sh                # BeforeToolSelection per-agent filtering
|   +-- agent-output-validator.sh     # AfterAgent contract validation
|   +-- context-preserver.sh          # PreCompress state preservation
+-- src/
|   +-- index.ts                      # MCP server entry point
|   +-- tools/
|   |   +-- session.ts                # Session read/write/resume tools
|   |   +-- progress.ts               # Phase/agent progress tracking
|   |   +-- validation.ts             # Plan structure + output validation
|   |   +-- dispatch.ts               # Parallel dispatch coordination
|   +-- lib/
|       +-- state.ts                  # State file I/O with schema validation
|       +-- schema.ts                 # Zod schemas for all data structures
|       +-- logger.ts                 # Structured logging
+-- policies/
|   +-- safety-baseline.toml          # Global: block rm -rf, force pushes, etc.
|   +-- agent-read-only.toml          # architect, api-designer, code-reviewer
|   +-- agent-read-shell.toml         # debugger, performance-engineer, security-engineer
|   +-- agent-read-write.toml         # refactor, technical-writer
|   +-- agent-full-access.toml        # coder, data-engineer, devops-engineer, tester
+-- dist/                             # Compiled MCP server (committed)
+-- package.json                      # Now includes dependencies
+-- tsconfig.json
```

---

## Layer 1: Hooks

### hooks.json

Six hook registrations across five lifecycle events:

| Event | Script | Purpose |
|---|---|---|
| `SessionStart` | `session-lifecycle.sh start` | Init workspace, detect active sessions, inject context |
| `SessionEnd` | `session-lifecycle.sh end` | Auto-archive completed sessions, generate summary |
| `BeforeTool` | `tool-compliance.sh` | Block shell redirects/heredocs for file writing |
| `BeforeToolSelection` | `tool-filter.sh` | Restrict tools based on active agent role |
| `AfterAgent` | `agent-output-validator.sh` | Validate output against handoff contract schema |
| `PreCompress` | `context-preserver.sh` | Preserve session state before context truncation |

### Hook 1: Session Lifecycle

**On SessionStart:**
1. Reads input JSON (contains `cwd`, `session_id`, `timestamp`)
2. Runs `ensure-workspace.sh` to guarantee `.gemini/` directories exist
3. Checks for `.gemini/state/active-session.md`
4. If found: injects `systemMessage` telling TechLead about interrupted session with current phase/status
5. If not found: injects `systemMessage` confirming workspace readiness

**On SessionEnd:**
1. If session status is `completed`, moves session + plans to `archive/`
2. Appends one-line summary to `.gemini/state/session-history.log`
3. Returns `{ "continue": true }` (non-blocking)

### Hook 2: Tool Compliance

**Trigger:** `BeforeTool` on `write_file`, `replace`, `run_shell_command`

For `run_shell_command`, pattern-matches against forbidden file-writing patterns:
- `echo .* >` / `echo .* >>`
- `cat <<` / heredocs
- `printf .* >` / `printf .* >>`
- `tee ` (without `-a`)

Match found: `{ "decision": "deny", "reason": "..." }`
No match: `{ "decision": "allow" }`

### Hook 3: Tool Filter

**Trigger:** `BeforeToolSelection` every turn during agent delegation.

Extracts agent name from the most recent delegation prompt in `llm_request` messages. Maps agent name to allowed tool set:

| Agent Role | Allowed Tools |
|---|---|
| architect, api-designer, code-reviewer | `read_file`, `grep_search`, `list_directory`, `web_search` |
| debugger, performance-engineer, security-engineer | above + `run_shell_command` |
| refactor, technical-writer | read tools + `write_file`, `replace` |
| coder, data-engineer, devops-engineer, tester | all tools |

When no agent context detected: no filtering (TechLead's own turn).

### Hook 4: Agent Output Validator

**Trigger:** `AfterAgent`

Validates:
1. Response contains "Task Report" section
2. Response contains "Downstream Context" when phase has downstream dependencies
3. Status field is present and valid
4. Files created/modified/deleted are listed

On failure: returns `systemMessage` with missing sections (advisory, does not block).
On success: returns `{ "continue": true }`.

### Hook 5: Context Preserver

**Trigger:** `PreCompress`

1. Reads current session state
2. Extracts current phase, completed phases, pending phases, last error
3. Writes compressed snapshot to `.gemini/state/compress-checkpoint.md`
4. Returns `systemMessage` with state summary and instruction to use `maestro_session_read`

---

## Layer 2: MCP Server

Lightweight TypeScript MCP server providing 6 orchestration tools.

### Technology Stack

| Dependency | Purpose | Size |
|---|---|---|
| `@modelcontextprotocol/sdk` | MCP server framework | ~50KB |
| `zod` | Schema validation | ~60KB |
| `yaml` | YAML frontmatter parsing | ~40KB |
| `typescript` | Type safety (dev) | - |
| `esbuild` | Bundling (dev) | - |

Total runtime: ~150KB bundled.

### Tool 1: `maestro_session_read`

Read current session state with structured output. Replaces raw file reads.

**Input:** `{ section?: "metadata" | "phases" | "errors" | "files" | "full" }`

**Output:** Parsed session state as structured JSON, or `{ exists: false }` if no active session.

### Tool 2: `maestro_session_write`

Update session state with schema validation and atomic writes.

**Input:**
```
{
  action: "create" | "update_phase" | "add_error" | "add_files" | "complete"
  // Action-specific fields (task, phase_id, phase_status, error, files, summary)
}
```

Validates against Zod schema, uses atomic write (temp file + rename).

### Tool 3: `maestro_progress`

Real-time phase/agent progress tracking.

**Input:** `{ action: "report" | "update" | "summary", phase_id?, agent?, status?, message? }`

Maintains append-only JSONL at `.gemini/state/progress.jsonl`. Provides single-source status during parallel dispatch.

### Tool 4: `maestro_validate_plan`

Structural validation of implementation plans before execution.

**Input:** `{ plan_path: string }`

**Validates:**
- YAML frontmatter parseable with required fields
- Every phase has id, title, agent, description, validation_criteria
- `blocked_by` references exist, no circular dependencies
- Agent names match `agents/` directory
- Parallelizable phases have no file overlap

**Output:** `{ valid, errors, warnings, dependency_graph: { phases, critical_path, parallel_batches } }`

### Tool 5: `maestro_dispatch_status`

Read and aggregate parallel dispatch results.

**Input:** `{ action: "list_batches" | "batch_status" | "agent_result", batch_id?, agent? }`

Scans `.gemini/parallel/`, reads `summary.json` and individual result files, returns structured status.

### Tool 6: `maestro_context_chain`

Build downstream context chain for phase delegation.

**Input:** `{ phase_id: string, plan_path: string }`

1. Reads plan to find `blocked_by` for target phase
2. Reads completed agent results for each blocking phase
3. Extracts "Downstream Context" sections
4. Assembles in dependency order into a single context block

**Output:** `{ phase_id, blocking_phases, context_chain, missing_contexts }`

---

## Layer 3: Policy Engine

TOML policy files for mechanical tool restriction enforcement.

### Safety Baseline (`safety-baseline.toml`)

Always active. Blocks:
- `rm -rf /` (destructive recursive deletion)
- `git push --force` to main/master
- `git reset --hard`
- Shell-based file writing (`echo >`, `cat <<`, `printf >`)
- Writes to sensitive files (`.env`, `.pem`, `.key`, `.credentials`)

### Per-Role Policies (User-Installable)

Four policy files matching agent access tiers:

| File | Agents | Allows | Denies |
|---|---|---|---|
| `agent-read-only.toml` | architect, api-designer, code-reviewer | read, grep, list, web_search | write_file, replace, run_shell_command |
| `agent-read-shell.toml` | debugger, performance-engineer, security-engineer | read + run_shell_command | write_file, replace |
| `agent-read-write.toml` | refactor, technical-writer | read + write_file, replace | run_shell_command |
| `agent-full-access.toml` | coder, data-engineer, devops-engineer, tester | all tools | (safety baseline only) |

Per-role policies are user-installable to `~/.gemini/policies/` for hard enforcement. The `BeforeToolSelection` hook provides dynamic per-agent filtering without requiring policy installation.

### Defense-in-Depth

```
Agent attempts forbidden action
         |
         v
    +-- Policy Engine ---- BLOCKED (if safety-baseline matches)
    |
    +-- BeforeToolSelection ---- TOOL NOT AVAILABLE (if agent role filtered)
    |
    +-- BeforeTool ---- DENIED (if pattern matches forbidden operation)
    |
    +-- Agent Instructions ---- ADVISORY (agent may or may not comply)
```

Four independent layers. No single point of failure.

---

## GEMINI.md Integration

### What Moves Out

- Workspace initialization checks -> `SessionStart` hook
- Raw file reads for session state -> `maestro_session_read`
- Raw file writes for session state -> `maestro_session_write`
- File-writing rule enforcement text -> `BeforeTool` hook + safety policy
- Tool restriction descriptions per agent -> `BeforeToolSelection` hook
- Manual downstream context assembly -> `maestro_context_chain`
- Reading parallel dispatch results -> `maestro_dispatch_status`

### What Stays

- TechLead persona and delegation rules
- Phase transition logic
- Execution mode gate
- Agent selection intelligence
- Error escalation decisions
- Design dialogue facilitation

### New Sections

1. **MCP Tools Reference** — table of 6 tools with "when to use" guidance
2. **Hook-Aware Behavior** — what NOT to include in delegation prompts (hooks handle it)
3. **Updated Delegation Flow** — uses `maestro_context_chain` and `maestro_progress`

### Skills Updates

- **Delegation skill**: use `maestro_context_chain`, remove file-writing rule injection
- **Execution skill**: use `maestro_session_read/write`, `maestro_dispatch_status`, `maestro_validate_plan`, `maestro_progress`
- **Session-management skill**: replace raw state file I/O with MCP tools

**Estimated context reduction:** ~150-200 lines removed, ~30 lines added. Net savings ~120-170 lines.

---

## Build System

### Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x",
    "yaml": "^2.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "esbuild": "^0.x",
    "typescript": "^5.x",
    "@types/node": "^20.x"
  }
}
```

### Commands

- `npm run build` — esbuild bundle to `dist/index.js`
- `npm run dev` — watch mode
- `npm run typecheck` — tsc --noEmit

### Distribution

`dist/index.js` is committed so `gemini extensions install` works without a build step. Single ~150KB bundle.

---

## Error Handling

### Hook Failures

All hooks degrade to "continue without the enhancement." Exit code != 0,2 becomes a warning. The orchestration worked without hooks before — hooks are additive safety, not critical path.

| Hook | On Failure |
|---|---|
| session-lifecycle | TechLead works without auto-detected session |
| tool-compliance | Tool call proceeds; safety policy is backup layer |
| tool-filter | No filtering; agent gets full access (current behavior) |
| agent-output-validator | Warning systemMessage; TechLead decides |
| context-preserver | Compression proceeds without state preservation |

### MCP Server Failures

Tools fail with descriptive errors, never silently. The TechLead always has enough information to decide what to do (retry, fall back to manual, escalate to user).

| Scenario | Behavior |
|---|---|
| Server fails to start | TechLead operates without custom tools (existing behavior) |
| Tool call throws | Error returned to model; can retry or fall back |
| Schema validation rejects | Zod error with specific field failures |
| State file corrupted | Returns `{ exists: false, error: "parse_failed" }` |
| Atomic write fails | Returns OS error message; TechLead escalates |

### Policy Failures

Only failure mode: malformed TOML at startup. Gemini CLI reports the error.
