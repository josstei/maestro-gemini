# Operational Hardening Design

Date: 2026-02-14
Status: Approved

## Problem Statement

Real-world testing of the Maestro extension surfaced 5 operational failures, plus a missing informed-consent mechanism for execution mode selection. These are not feature requests — they are runtime failures that caused partial_failure results, corrupted state files, wasted API calls, and user confusion.

### Issues Addressed

1. **API Quota Exhaustion** — Concurrent parallel agents exceeded Gemini API rate limits
2. **Shell String Corruption** — YAML/Markdown content mangled by shell interpretation in heredocs
3. **Ignore Pattern Blocking** — `.gemini/` state files inaccessible via `read_file` due to ignore patterns
4. **Tool Name Typos** — Underscore/hyphen confusion in agent names caused tool-not-found errors
5. **Relative Path Failures** — Parallel agents wrote to wrong locations without absolute paths
6. **Uninformed Execution Mode** — Users unaware that parallel dispatch runs `--yolo` (auto-approve all tool calls)

## Design Principle

Make the wrong thing impossible, not merely discouraged. LLM guidance is the weakest form of enforcement. Every fix pushes enforcement down the stack: runtime validation > protocol rules > skill guidance.

---

## Section 1: Parallel Dispatch Concurrency Control

### Files Changed
- `scripts/parallel-dispatch.sh`
- `GEMINI.md`

### New Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAESTRO_MAX_CONCURRENT` | `0` (unlimited) | Maximum number of agents running simultaneously. Uses semaphore pattern with `wait -n`. |
| `MAESTRO_STAGGER_DELAY` | `0` (no delay) | Seconds to sleep between launching each agent process. |

### Implementation

Replace the current fire-all-at-once dispatch loop with a controlled loop:

1. Read and validate `MAESTRO_MAX_CONCURRENT` and `MAESTRO_STAGGER_DELAY`
2. Launch agents up to concurrency cap
3. When cap reached, `wait -n` for any agent to finish (bash 4.3+), then launch next
4. Fall back to `wait` for oldest PID on older bash versions
5. Sleep `MAESTRO_STAGGER_DELAY` seconds between each launch (except last)
6. Print resolved concurrency/stagger values in summary banner

### GEMINI.md Changes

Add both variables to the Settings Resolution table with defaults and descriptions.

---

## Section 2: Content Writing Hard Rule

### Files Changed
- `protocols/agent-base-protocol.md`
- `GEMINI.md`

### Agent Base Protocol Addition

Add a new "File Writing Protocol" section after Pre-Flight Protocol and before Output Handoff Contract:

- NEVER use `run_shell_command` to create or write file content (no `cat`, `printf`, `echo`, heredocs)
- ALWAYS use `write_file` for creating files, `replace` for modifying content
- If `write_file` is not in authorized tool list, report limitation — do not attempt shell workarounds
- No exceptions

### GEMINI.md Addition

Add a "Content Writing Rule" section after "Execution Mode":

- `write_file` for all structured content (YAML, Markdown, JSON, code)
- `run_shell_command` reserved for executing programs (build, test, lint, dispatch, git)

### Rationale

Shell interpretation corrupts `#` (YAML comments), backticks (Markdown code), `!` (history expansion), and multiline content. `write_file` bypasses shell entirely. Placing the rule in the base protocol ensures injection into every delegation prompt.

---

## Section 3: Dedicated State I/O Helper Scripts

### Files Created
- `scripts/read-state.sh`
- `scripts/write-state.sh`

### Files Changed
- `skills/session-management/SKILL.md`
- `skills/execution/SKILL.md`

### `scripts/read-state.sh`

Single-purpose script that reads a state file by relative path, bypassing ignore patterns:

- Validates: no absolute paths, no path traversal (`..`)
- Checks file existence
- Outputs contents to stdout
- Exit 1 on any failure

### `scripts/write-state.sh`

Single-purpose script that writes state file content from stdin:

- Validates: no absolute paths, no path traversal
- Creates parent directories (`mkdir -p`)
- Writes atomically via temp file + `mv` (prevents partial writes on interruption)
- Cleanup trap for temp file on failure

### Skill Changes

**session-management/SKILL.md**: Add "State File Access" section near top. All state reads use `./scripts/read-state.sh`, all state writes use `write_file` (primary) or `./scripts/write-state.sh` (when shell piping is needed). Never use `read_file` for `<MAESTRO_STATE_DIR>` paths.

**execution/SKILL.md**: Same addition. Update parallel dispatch result reading steps (9-10) to use `./scripts/read-state.sh` for `summary.json` and agent output files.

---

## Section 4: Runtime Agent Name Validation

### Files Changed
- `scripts/parallel-dispatch.sh`
- `skills/delegation/SKILL.md`

### Dispatch Script Changes

Resolve extension root from script location:
```
EXTENSION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENTS_DIR="$EXTENSION_DIR/agents"
```

In the dispatch loop, after sanitization:

1. Normalize underscores to hyphens: `tr '_' '-'`
2. Check if `$AGENTS_DIR/${NORMALIZED_NAME}.md` exists
3. If not found, compute closest match and print helpful error:
   ```
   ERROR: Agent 'technical_writer' not found in agents/
     Did you mean: technical-writer?
   ```
4. Exit 1 — fail fast before wasting API calls

Validation only runs if `agents/` directory exists (graceful degradation outside extension context).

### Delegation Skill Changes

Add "Agent Name Rules" under Parallel Delegation:
- Prompt filenames MUST use hyphens, not underscores
- Filename (minus `.txt`) must exactly match an agent definition in `agents/`
- Dispatch script validates at runtime and rejects unrecognized names

Defense in depth: delegation skill prevents bad names at construction time, dispatch script catches any that slip through.

---

## Section 5: Automatic Project Root Injection

### Files Changed
- `scripts/parallel-dispatch.sh`
- `skills/delegation/SKILL.md`

### Dispatch Script Changes

Before the dispatch loop, capture project root:
```bash
PROJECT_ROOT="$(pwd)"
```

Before spawning each agent, prepend a standard header to the prompt content:
```
PROJECT ROOT: /absolute/path/to/project
All file paths in this task are relative to this directory. When using write_file,
replace, or read_file, construct absolute paths by prepending this root. When
using run_shell_command, execute from this directory.
```

Print project root in the summary banner for observability.

### Delegation Skill Changes

Update "Absolute Paths" rule to document the safety net: dispatch script auto-injects project root, but delegation prompts should still use absolute paths (the injection is a fallback, not a substitute).

---

## Section 6: Execution Mode Selection with Informed Consent

### Files Changed
- `GEMINI.md`
- `skills/execution/SKILL.md`
- `skills/implementation-planning/SKILL.md`
- `templates/session-state.md`

### New Environment Variable

| Variable | Default | Description |
|----------|---------|-------------|
| `MAESTRO_EXECUTION_MODE` | `ask` | `parallel`, `sequential`, or `ask` (prompt user at Phase 3 start) |

### User-Facing Prompt

When `MAESTRO_EXECUTION_MODE=ask`, present before Phase 3 begins:

**Option 1: Parallel Dispatch (faster)**
- Parallelizable phases run as concurrent `gemini` CLI processes
- Agents operate in autonomous mode (`--yolo`): all tool calls auto-approved without confirmation
- User reviews results after each batch, not during execution
- Best for: well-defined tasks with clear file ownership

**Option 2: Sequential Delegation (safer)**
- Each phase executes one at a time via `delegate_to_agent`
- Standard tool approval rules apply
- Full visibility and control between phases
- Best for: exploratory tasks, unfamiliar codebases, security-sensitive work

### Execution Skill Changes

Add "Execution Mode Gate" as first action in Phase 3:
1. Read `MAESTRO_EXECUTION_MODE`
2. If `ask`: present prompt, record choice in session state as `execution_mode`
3. If pre-set: use specified mode, log it
4. Single-phase batches always fall back to sequential
5. Selected mode applies for entire session

### Implementation Planning Skill Changes

Add "Execution Profile" to every plan:
- Total phases, parallelizable count, batch count
- Estimated wall time for parallel vs sequential
- Note that parallel uses `--yolo` autonomous mode

### Session State Addition

Add to template: `execution_mode: null` (set at Phase 3 start)

---

## Change Summary

| Issue | File(s) | Change Type | Enforcement Level |
|-------|---------|-------------|-------------------|
| #1 Quota | `parallel-dispatch.sh`, `GEMINI.md` | Semaphore + stagger | Runtime |
| #2 Strings | `agent-base-protocol.md`, `GEMINI.md` | Hard no-shell-writes rule | Protocol (every prompt) |
| #3 Ignores | `read-state.sh` (new), `write-state.sh` (new), 2 skills | Dedicated I/O scripts | Runtime |
| #4 Names | `parallel-dispatch.sh`, `delegation/SKILL.md` | Validation + closest match | Runtime + Protocol |
| #5 Paths | `parallel-dispatch.sh`, `delegation/SKILL.md` | Auto-inject project root | Runtime + Protocol |
| #6 Consent | `GEMINI.md`, 2 skills, template | User prompt + env var | UX Gate |
