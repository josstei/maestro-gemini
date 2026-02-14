# Filesystem Safety Architecture

**Date:** 2026-02-13
**Status:** Approved

## Problem

Maestro operations that create or access directories (session state, plans, archives, parallel dispatch) produce jarring hard errors in Gemini CLI when the target directories don't exist. This affects session creation, resume/archive operations, and parallel dispatch across the entire orchestration lifecycle. The same class of error occurs when subagents attempt to write files to non-existent directories in the target project.

Current state: directory creation instructions are scattered as informal procedural steps across multiple skills with no enforcement, no centralization, and no coverage for target project operations.

## Solution

A three-layer filesystem safety architecture with clear separation of concerns:

| Layer | Component | Responsibility |
|-------|-----------|---------------|
| Infrastructure | `scripts/ensure-workspace.sh` | Creates and validates all Maestro directories |
| Behavioral | `protocols/filesystem-safety-protocol.md` | Defines ensure-before-write contract for all agents |
| Orchestrator | `GEMINI.md` Startup Check #4 | Invokes bootstrap script before any orchestration |

## Layer 1: Infrastructure — `scripts/ensure-workspace.sh`

Shell script that ensures the complete Maestro workspace directory tree exists.

### Behavior

- Accepts state directory path as argument (defaults to `.gemini`)
- Creates full directory tree idempotently via `mkdir -p`
- Silent on success (no output)
- Exits non-zero with actionable error on failure (permission denied, read-only filesystem)
- Validates created directories are writable

### Directory Manifest

```
<state_dir>/
├── state/
│   └── archive/
├── plans/
│   └── archive/
└── parallel/
```

### Interface

```bash
./scripts/ensure-workspace.sh [state-dir]
# Exit 0: all directories exist and are writable
# Exit 1: creation or validation failed (stderr has details)
```

### Extensibility

Adding a new directory = adding one line to the manifest array in the script. No other files need to change for infrastructure-level additions.

## Layer 2: Behavioral — `protocols/filesystem-safety-protocol.md`

Shared protocol injected into delegation prompts alongside `agent-base-protocol.md`. Defines the behavioral contract for safe filesystem operations covering both Maestro infrastructure and target project directories.

### Rules

**Rule 1 — Ensure Before Write:**
Before any file creation or write operation, verify the parent directory exists. If it doesn't, create it. Applies to every file write action without exception.

**Rule 2 — Silent Success, Clear Failure:**
Directory creation is a precondition, not a noteworthy event. Don't report successful directory creation. Only report failures (permission denied, disk full) immediately as a blocker in the Task Report.

**Rule 3 — Never Assume Directory State:**
Treat every directory reference as potentially non-existent, even if a prior phase "should have" created it. Phases run independently (especially in parallel dispatch). Each agent ensures its own write targets exist.

**Rule 4 — Path Construction:**
Always construct full paths before writing. Never write to a path assembled from unverified components. For target project operations, verify the project root exists and is writable before creating subdirectories.

**Rule 5 — Scope:**
Applies to Maestro state directories, target project directories, and archive operations.

### Injection Point

The delegation skill prepends this protocol alongside `agent-base-protocol.md` — every delegated agent receives both protocols.

## Layer 3: Orchestrator — `GEMINI.md` Startup Check

### New Startup Check #4: Workspace Readiness

After settings resolution (Step 2) and disabled agent check (Step 3):

> **Workspace Readiness**: Invoke `scripts/ensure-workspace.sh` with the resolved `MAESTRO_STATE_DIR` value via `run_shell_command`. If the script exits non-zero, present the error to the user and do not proceed with orchestration.

Runs on every orchestration command (`/maestro.orchestrate`, `/maestro.resume`, `/maestro.review`, `/maestro.status`). The script is idempotent so repeated invocations cost nothing.

### Parallel Dispatch Guard

The orchestrator must ensure the batch-specific dispatch directory (`<state_dir>/parallel/<batch-id>/prompts/`) exists before writing prompt files. This is a runtime operation not covered by the static bootstrap.

## Integration Changes

### `skills/delegation/SKILL.md`

Add protocol injection step between reading `agent-base-protocol.md` and constructing the prompt:
- Read `protocols/filesystem-safety-protocol.md`
- Prepend alongside the base protocol

Single integration point — all delegation prompts automatically include filesystem safety rules.

### `skills/session-management/SKILL.md`

Remove inline directory creation instructions that become redundant:
- Session Creation (line 29): Replace "Create `<state_dir>/state/` directory if it does not exist" with reference to workspace readiness guarantee
- Archive Protocol (lines 167-168): Replace "Create `<state_dir>/plans/archive/` ... Create `<state_dir>/state/archive/` ..." with reference to workspace readiness guarantee

### `skills/execution/SKILL.md`

In Parallel Dispatch Protocol Step 3: Add note that the orchestrator must ensure the batch-specific dispatch directory exists before writing prompt files, consistent with the filesystem safety protocol's ensure-before-write rule. The `parallel-dispatch.sh` script already handles `mkdir -p` for its results directory; the orchestrator owns prompt directory creation.

### No Changes

- `protocols/agent-base-protocol.md` — filesystem safety is a separate, composable protocol
- `scripts/parallel-dispatch.sh` — already has proper `mkdir -p` for results directory
