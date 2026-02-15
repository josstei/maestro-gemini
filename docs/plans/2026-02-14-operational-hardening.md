# Operational Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden Maestro's parallel dispatch, state I/O, delegation prompts, and execution mode against 6 runtime failures discovered during real-world testing.

**Architecture:** All changes are configuration-layer: shell scripts, Markdown protocols, Markdown skills, YAML templates. No compiled code. Enforcement is pushed down the stack — runtime validation in shell scripts over LLM prompt guidance wherever possible.

**Tech Stack:** Bash (parallel-dispatch.sh, state I/O scripts), Markdown + YAML frontmatter (skills, protocols, templates)

**Design Document:** `docs/plans/2026-02-14-operational-hardening-design.md`

---

### Task 1: Create `scripts/read-state.sh`

**Files:**
- Create: `scripts/read-state.sh`

**Step 1: Write the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

STATE_FILE="${1:?Usage: read-state.sh <relative-path>}"

if [[ "$STATE_FILE" == /* ]]; then
  echo "ERROR: Path must be relative (got: $STATE_FILE)" >&2
  exit 1
fi

if [[ "$STATE_FILE" == *".."* ]]; then
  echo "ERROR: Path traversal not allowed (got: $STATE_FILE)" >&2
  exit 1
fi

if [[ ! -f "$STATE_FILE" ]]; then
  echo "ERROR: State file not found: $STATE_FILE" >&2
  exit 1
fi

cat "$STATE_FILE"
```

**Step 2: Make executable and syntax-check**

Run: `chmod +x scripts/read-state.sh && bash -n scripts/read-state.sh`
Expected: No output (clean syntax)

**Step 3: Verify error cases**

Run: `./scripts/read-state.sh /etc/passwd 2>&1; echo "exit: $?"`
Expected: `ERROR: Path must be relative` and `exit: 1`

Run: `./scripts/read-state.sh ../../../etc/passwd 2>&1; echo "exit: $?"`
Expected: `ERROR: Path traversal not allowed` and `exit: 1`

Run: `./scripts/read-state.sh .gemini/nonexistent.md 2>&1; echo "exit: $?"`
Expected: `ERROR: State file not found` and `exit: 1`

**Step 4: Commit**

```bash
git add scripts/read-state.sh
git commit -m "feat: add read-state.sh helper to bypass ignore patterns for state file reads"
```

---

### Task 2: Create `scripts/write-state.sh`

**Files:**
- Create: `scripts/write-state.sh`

**Step 1: Write the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

STATE_FILE="${1:?Usage: write-state.sh <relative-path>}"

if [[ "$STATE_FILE" == /* ]]; then
  echo "ERROR: Path must be relative (got: $STATE_FILE)" >&2
  exit 1
fi

if [[ "$STATE_FILE" == *".."* ]]; then
  echo "ERROR: Path traversal not allowed (got: $STATE_FILE)" >&2
  exit 1
fi

PARENT_DIR=$(dirname "$STATE_FILE")
mkdir -p "$PARENT_DIR"

TEMP_FILE=$(mktemp "${PARENT_DIR}/.write-state-XXXXXX")
trap 'rm -f "$TEMP_FILE"' EXIT

cat > "$TEMP_FILE"
mv "$TEMP_FILE" "$STATE_FILE"
trap - EXIT
```

**Step 2: Make executable and syntax-check**

Run: `chmod +x scripts/write-state.sh && bash -n scripts/write-state.sh`
Expected: No output (clean syntax)

**Step 3: Verify happy path**

Run: `echo "test content" | ./scripts/write-state.sh .gemini/state/test-write.md && cat .gemini/state/test-write.md && rm .gemini/state/test-write.md`
Expected: `test content`

**Step 4: Verify error cases**

Run: `echo "bad" | ./scripts/write-state.sh /tmp/absolute-path 2>&1; echo "exit: $?"`
Expected: `ERROR: Path must be relative` and `exit: 1`

**Step 5: Commit**

```bash
git add scripts/write-state.sh
git commit -m "feat: add write-state.sh helper for atomic state file writes"
```

---

### Task 3: Add concurrency control to `scripts/parallel-dispatch.sh`

**Files:**
- Modify: `scripts/parallel-dispatch.sh`

**Step 1: Add env vars to usage block**

In the `usage()` function, append to the Environment section (after the `MAESTRO_CLEANUP_DISPATCH` line):

```
  MAESTRO_MAX_CONCURRENT      Max agents running simultaneously (default: 0 = unlimited)
  MAESTRO_STAGGER_DELAY       Seconds between agent launches (default: 0 = no delay)
```

**Step 2: Add variable resolution after timeout block**

After line 68 (`TIMEOUT_SECS=$((TIMEOUT_MINS * 60))`), add:

```bash
MAX_CONCURRENT="${MAESTRO_MAX_CONCURRENT:-0}"
MAX_CONCURRENT="${MAX_CONCURRENT#"${MAX_CONCURRENT%%[!0]*}"}"
[[ -z "$MAX_CONCURRENT" ]] && MAX_CONCURRENT=0
if ! [[ "$MAX_CONCURRENT" =~ ^[0-9]+$ ]]; then
  echo "ERROR: MAESTRO_MAX_CONCURRENT must be a non-negative integer (got: ${MAESTRO_MAX_CONCURRENT:-})" >&2
  exit 1
fi

STAGGER_DELAY="${MAESTRO_STAGGER_DELAY:-0}"
STAGGER_DELAY="${STAGGER_DELAY#"${STAGGER_DELAY%%[!0]*}"}"
[[ -z "$STAGGER_DELAY" ]] && STAGGER_DELAY=0
if ! [[ "$STAGGER_DELAY" =~ ^[0-9]+$ ]]; then
  echo "ERROR: MAESTRO_STAGGER_DELAY must be a non-negative integer (got: ${MAESTRO_STAGGER_DELAY:-})" >&2
  exit 1
fi

SUPPORTS_WAIT_N=false
if [[ "${BASH_VERSINFO[0]:-0}" -ge 5 ]] || \
   { [[ "${BASH_VERSINFO[0]:-0}" -eq 4 ]] && [[ "${BASH_VERSINFO[1]:-0}" -ge 3 ]]; }; then
  SUPPORTS_WAIT_N=true
fi
```

**Step 3: Update summary banner**

Replace the existing banner block (lines 74-79) with:

```bash
[[ "$MAX_CONCURRENT" -eq 0 ]] && CONCURRENT_DISPLAY="unlimited" || CONCURRENT_DISPLAY="$MAX_CONCURRENT"

echo "MAESTRO PARALLEL DISPATCH"
echo "========================="
echo "Agents: ${#PROMPT_FILES[@]}"
echo "Timeout: ${TIMEOUT_MINS} minutes"
echo "Model: ${MAESTRO_DEFAULT_MODEL:-default}"
echo "Max Concurrent: $CONCURRENT_DISPLAY"
echo "Stagger Delay: ${STAGGER_DELAY}s"
echo ""
```

**Step 4: Add concurrency gate and stagger to dispatch loop**

Replace the dispatch loop. The current loop runs from `for PROMPT_FILE in "${PROMPT_FILES[@]}"; do` through `done` (lines 81-130). Replace with:

```bash
LAUNCHED=0

for PROMPT_FILE in "${PROMPT_FILES[@]}"; do
  AGENT_NAME=$(basename "$PROMPT_FILE" .txt | tr -cd 'a-zA-Z0-9_-')
  if [[ -z "$AGENT_NAME" ]]; then
    echo "ERROR: Prompt file $(basename "$PROMPT_FILE" | tr -cd 'a-zA-Z0-9_.-') produces empty agent name after sanitization" >&2
    exit 1
  fi
  AGENT_NAMES+=("$AGENT_NAME")

  RESULT_JSON="$RESULT_DIR/${AGENT_NAME}.json"
  RESULT_EXIT="$RESULT_DIR/${AGENT_NAME}.exit"
  RESULT_LOG="$RESULT_DIR/${AGENT_NAME}.log"

  PROMPT_SIZE=$(wc -c < "$PROMPT_FILE")
  if [[ "$PROMPT_SIZE" -gt 1000000 ]]; then
    echo "ERROR: Prompt file $AGENT_NAME exceeds 1MB size limit (${PROMPT_SIZE} bytes)" >&2
    exit 1
  fi

  PROMPT_CONTENT=$(cat "$PROMPT_FILE")

  if [[ -z "${PROMPT_CONTENT// /}" ]]; then
    echo "ERROR: Prompt file $AGENT_NAME is empty or whitespace-only" >&2
    exit 1
  fi

  if [[ "$MAX_CONCURRENT" -gt 0 ]] && [[ "$LAUNCHED" -ge "$MAX_CONCURRENT" ]]; then
    if [[ "$SUPPORTS_WAIT_N" == true ]]; then
      wait -n 2>/dev/null || true
    else
      wait "${PIDS[$(( LAUNCHED - MAX_CONCURRENT ))]}" 2>/dev/null || true
    fi
  fi

  echo "Dispatching: $AGENT_NAME"

  (
    if command -v timeout >/dev/null 2>&1; then
      timeout "$TIMEOUT_SECS" gemini \
        -p "$PROMPT_CONTENT" \
        --yolo \
        --output-format json \
        ${MODEL_FLAGS[@]+"${MODEL_FLAGS[@]}"} \
        > "$RESULT_JSON" \
        2> "$RESULT_LOG"
    else
      gemini \
        -p "$PROMPT_CONTENT" \
        --yolo \
        --output-format json \
        ${MODEL_FLAGS[@]+"${MODEL_FLAGS[@]}"} \
        > "$RESULT_JSON" \
        2> "$RESULT_LOG"
    fi
    echo $? > "$RESULT_EXIT"
  ) &

  PIDS+=($!)
  LAUNCHED=$((LAUNCHED + 1))

  if [[ "$STAGGER_DELAY" -gt 0 ]] && [[ "$PROMPT_FILE" != "${PROMPT_FILES[-1]}" ]]; then
    sleep "$STAGGER_DELAY"
  fi
done
```

**Step 5: Syntax-check**

Run: `bash -n scripts/parallel-dispatch.sh`
Expected: No output (clean syntax)

**Step 6: Commit**

```bash
git add scripts/parallel-dispatch.sh
git commit -m "feat: add concurrency cap and stagger delay to parallel dispatch"
```

---

### Task 4: Add agent name validation to `scripts/parallel-dispatch.sh`

**Files:**
- Modify: `scripts/parallel-dispatch.sh`

**Step 1: Add extension dir resolution**

After the `SUPPORTS_WAIT_N` block (added in Task 3), add:

```bash
EXTENSION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENTS_DIR="$EXTENSION_DIR/agents"
```

**Step 2: Add validation in dispatch loop**

In the dispatch loop, immediately after `AGENT_NAMES+=("$AGENT_NAME")`, insert:

```bash
  NORMALIZED_NAME=$(echo "$AGENT_NAME" | tr '_' '-')
  if [[ -d "$AGENTS_DIR" ]] && [[ ! -f "$AGENTS_DIR/${NORMALIZED_NAME}.md" ]]; then
    echo "ERROR: Agent '${AGENT_NAME}' not found in ${AGENTS_DIR}/" >&2
    AVAILABLE=$(ls "$AGENTS_DIR"/*.md 2>/dev/null | xargs -I{} basename {} .md | tr '\n' ', ' | sed 's/,$//')
    [[ -n "$AVAILABLE" ]] && echo "  Available agents: ${AVAILABLE}" >&2
    exit 1
  fi
```

**Step 3: Syntax-check**

Run: `bash -n scripts/parallel-dispatch.sh`
Expected: No output (clean syntax)

**Step 4: Commit**

```bash
git add scripts/parallel-dispatch.sh
git commit -m "feat: validate agent names against agents/ directory in parallel dispatch"
```

---

### Task 5: Add project root injection to `scripts/parallel-dispatch.sh`

**Files:**
- Modify: `scripts/parallel-dispatch.sh`

**Step 1: Capture project root**

After the `AGENTS_DIR` line (added in Task 4), add:

```bash
PROJECT_ROOT="$(pwd)"
```

**Step 2: Update summary banner**

Add to the banner block (after the `Stagger Delay` line):

```bash
echo "Project Root: $PROJECT_ROOT"
```

**Step 3: Inject header into prompt content**

In the dispatch loop, after `PROMPT_CONTENT=$(cat "$PROMPT_FILE")` and the empty-content check, but before the concurrency gate, insert:

```bash
  PROMPT_CONTENT="PROJECT ROOT: ${PROJECT_ROOT}
All file paths in this task are relative to this directory. When using write_file, replace, or read_file, construct absolute paths by prepending this root. When using run_shell_command, execute from this directory.

${PROMPT_CONTENT}"
```

**Step 4: Syntax-check**

Run: `bash -n scripts/parallel-dispatch.sh`
Expected: No output (clean syntax)

**Step 5: Commit**

```bash
git add scripts/parallel-dispatch.sh
git commit -m "feat: auto-inject project root into all parallel dispatch prompts"
```

---

### Task 6: Add File Writing Protocol to `protocols/agent-base-protocol.md`

**Files:**
- Modify: `protocols/agent-base-protocol.md`

**Step 1: Insert new section**

After the `## Pre-Flight Protocol` section (after the Convention Extraction subsection ending at line 42, before the `---` separator and `## Output Handoff Contract` at line 46), insert:

```markdown
---

## File Writing Protocol

NEVER use `run_shell_command` to create or write file content. This includes `cat`, `printf`, `echo`, heredocs (`<< EOF`), and any other shell-based file writing mechanism.

ALWAYS use `write_file` for creating files and `replace` for modifying file content.

Rationale: Shell interpretation corrupts content containing YAML frontmatter markers (`#`), Markdown syntax (backticks, brackets), history expansion characters (`!`), and multiline strings. The `write_file` tool bypasses shell interpretation entirely and handles encoding safely.

This rule has no exceptions. If `write_file` is not in your authorized tool list, you cannot create files — report the limitation in your Task Report rather than attempting shell workarounds.
```

**Step 2: Verify the file reads correctly**

Read the file and confirm the new section appears between Pre-Flight Protocol and Output Handoff Contract.

**Step 3: Commit**

```bash
git add protocols/agent-base-protocol.md
git commit -m "feat: add hard file-writing protocol rule to agent base protocol"
```

---

### Task 7: Update `GEMINI.md` with new env vars, content writing rule, and execution mode

**Files:**
- Modify: `GEMINI.md`

**Step 1: Add new env vars to Settings Resolution table**

In the Settings Resolution table (lines 19-33), add three rows before the closing `When an env var is unset...` paragraph:

```markdown
| Max Concurrent | `MAESTRO_MAX_CONCURRENT` | `0` (unlimited) | Parallel dispatch max simultaneous agents |
| Stagger Delay | `MAESTRO_STAGGER_DELAY` | `0` (none) | Seconds between parallel agent launches |
| Execution Mode | `MAESTRO_EXECUTION_MODE` | `ask` | Phase 3 dispatch: `parallel`, `sequential`, or `ask` |
```

**Step 2: Add Content Writing Rule**

After the "Execution Mode" section (which will be rewritten in Step 3), before the "Delegation Override Protocol" section, insert:

```markdown
## Content Writing Rule

Always use `write_file` for creating or modifying files with structured content (YAML, Markdown, JSON, code). Never use `run_shell_command` with heredocs, `cat`, `printf`, or `echo` for file content — shell interpretation corrupts special characters.

Reserve `run_shell_command` for commands that execute programs (build, test, lint, dispatch scripts, git operations), not for writing file content.
```

**Step 3: Rewrite the Execution Mode section**

Replace the current "Execution Mode" section (lines 54-79) with:

```markdown
## Execution Mode

Maestro supports two execution modes for Phase 3. The mode is controlled by `MAESTRO_EXECUTION_MODE`:

- `ask` (default): Present the user with a choice before beginning Phase 3 execution
- `parallel`: Use parallel dispatch without prompting
- `sequential`: Use sequential delegation without prompting

### Mode Selection Prompt

When `MAESTRO_EXECUTION_MODE` is `ask`, present this choice before Phase 3 begins:

---

**Execution Mode Selection**

Your implementation plan has [N] phases ([M] parallelizable).

**Option 1: Parallel Dispatch (faster)**
- Parallelizable phases run as concurrent `gemini` CLI processes via `scripts/parallel-dispatch.sh`
- Agents operate in **autonomous mode (`--yolo`)**: all tool calls (file writes, shell commands, file deletions) are auto-approved without your confirmation
- You review results after each batch completes, not during execution
- Requires trust in the delegation prompts and tool restriction enforcement
- Best for: well-defined tasks with clear file ownership boundaries

**Option 2: Sequential Delegation (safer)**
- Each phase executes one at a time via `delegate_to_agent`
- Standard tool approval rules apply — you confirm sensitive operations
- You can intervene between phases if results are unexpected
- Slower but gives you full visibility and control
- Best for: exploratory tasks, unfamiliar codebases, security-sensitive work

Which mode would you like to use?

---

Record the user's choice in session state as `execution_mode`. When `MAESTRO_EXECUTION_MODE` is pre-set to `parallel` or `sequential`, skip the prompt and log the mode at session start.

### Parallel Dispatch Details

Parallel execution uses `scripts/parallel-dispatch.sh` to spawn independent `gemini` CLI processes that run concurrently. This bypasses the sequential `delegate_to_agent` tool scheduler.

**How it works:**
1. The orchestrator writes delegation prompts to `<state_dir>/parallel/<batch-id>/prompts/`
2. Invokes `./scripts/parallel-dispatch.sh <dispatch-dir>` via `run_shell_command`
3. The script spawns one `gemini -p <prompt> --yolo --output-format json` process per prompt file
4. All agents execute concurrently as independent processes (subject to `MAESTRO_MAX_CONCURRENT` cap)
5. The script collects results to `<dispatch-dir>/results/` and writes `summary.json`
6. The orchestrator reads results and updates session state

**When to use parallel dispatch:**
- Phases at the same dependency depth with non-overlapping file ownership
- Phases that are fully self-contained (no follow-up questions needed)
- Batch size of 2-4 agents (avoid overwhelming the system)

**When to use sequential `delegate_to_agent`:**
- Phases with shared file dependencies
- Phases that may need interactive clarification
- Single-phase execution (no benefit from parallelism)
- Fallback when parallel dispatch fails

**Constraint:** Parallel agents run as independent CLI processes with no shared context. Prompts must be complete and self-contained. See the execution skill for the full Parallel Dispatch Protocol.
```

**Step 4: Verify the file reads correctly**

Read the file and confirm all three additions are present and the structure is coherent.

**Step 5: Commit**

```bash
git add GEMINI.md
git commit -m "feat: add execution mode selection, content writing rule, and concurrency env vars to orchestrator"
```

---

### Task 8: Update `skills/session-management/SKILL.md` with state file access

**Files:**
- Modify: `skills/session-management/SKILL.md`

**Step 1: Add State File Access section**

After the "File Location" subsection (lines 23-25) and before "Initialization Steps" (line 27), insert:

```markdown
### State File Access

All reads and writes to files within `<MAESTRO_STATE_DIR>` must go through the dedicated state I/O scripts. These scripts bypass ignore patterns that prevent `read_file` from accessing the state directory.

**Reading state files:**
```bash
run_shell_command: ./scripts/read-state.sh <relative-path>
```

Example: `./scripts/read-state.sh .gemini/state/active-session.md`

**Writing state files:**
Use `write_file` as the primary mechanism for state file writes. When content must be piped from a shell command, use:

```bash
run_shell_command: echo '...' | ./scripts/write-state.sh <relative-path>
```

**Rules:**
- Never use `read_file` for paths inside `<MAESTRO_STATE_DIR>` — these files are in ignored directories and `read_file` may fail or return errors
- The `write-state.sh` script writes atomically (temp file + `mv`) to prevent partial writes
- Both scripts validate against absolute paths and path traversal
```

**Step 2: Update Resume Protocol**

In the Resume Protocol section (line 189), update step 1:

Before: `1. **Read State**: Read '<MAESTRO_STATE_DIR>/state/active-session.md'`

After: `1. **Read State**: Read state via run_shell_command: './scripts/read-state.sh <MAESTRO_STATE_DIR>/state/active-session.md'`

**Step 3: Commit**

```bash
git add skills/session-management/SKILL.md
git commit -m "feat: add state file access protocol using dedicated I/O scripts"
```

---

### Task 9: Update `skills/execution/SKILL.md` with state file access and execution mode gate

**Files:**
- Modify: `skills/execution/SKILL.md`

**Step 1: Add Execution Mode Gate section**

Insert as the first section after the skill description (after line 8), before "Phase Execution Protocol":

```markdown
## Execution Mode Gate

Before executing any phases in Phase 3:

1. Read `MAESTRO_EXECUTION_MODE` (default: `ask`)
2. If `ask`: present the execution mode selection prompt defined in `GEMINI.md`
3. Record the user's choice in session state as `execution_mode`
4. If `parallel` or `sequential`: use the pre-selected mode and log it
5. For the remainder of this session, use the selected mode for all batches

**Mode-specific behavior:**
- When parallel is selected and a batch contains only one phase, fall back to sequential for that batch (no benefit from parallel with a single agent)
- When sequential is selected and the plan identifies parallelizable phases, execute them sequentially in dependency order — do not reorder the plan
```

**Step 2: Add State File Access section**

Insert before the "Phase Execution Protocol" section:

```markdown
## State File Access

All reads of files within `<MAESTRO_STATE_DIR>` (including parallel dispatch results) must use the dedicated state I/O script to bypass ignore patterns:

```bash
run_shell_command: ./scripts/read-state.sh <relative-path>
```

This applies to:
- Reading `summary.json` from parallel dispatch results
- Reading individual agent `.json` output files
- Reading `active-session.md` for state checks

Never use `read_file` for paths inside `<MAESTRO_STATE_DIR>`.
```

**Step 3: Update parallel dispatch result reading**

In the Parallel Dispatch Protocol (steps 9-10), update:

Step 9 — Before: `Read the batch summary from '<state_dir>/parallel/<batch-id>/results/summary.json'`
Step 9 — After: `Read the batch summary via run_shell_command: './scripts/read-state.sh <state_dir>/parallel/<batch-id>/results/summary.json'`

Step 10 — Before: `For each agent, read its JSON output from 'results/<agent-name>.json' and parse the Task Report`
Step 10 — After: `For each agent, read its JSON output via run_shell_command: './scripts/read-state.sh <state_dir>/parallel/<batch-id>/results/<agent-name>.json' and parse the Task Report`

**Step 4: Commit**

```bash
git add skills/execution/SKILL.md
git commit -m "feat: add execution mode gate and state file access to execution skill"
```

---

### Task 10: Update `skills/delegation/SKILL.md` with agent name rules and path safety net

**Files:**
- Modify: `skills/delegation/SKILL.md`

**Step 1: Add Agent Name Rules subsection**

In the "Parallel Delegation" section, after "Prompt File Construction" (after line 187), insert:

```markdown
### Agent Name Rules

Prompt filenames must follow these rules:

- Use **hyphens**, not underscores: `technical-writer.txt`, not `technical_writer.txt`
- The filename (minus `.txt` extension) must exactly match an agent definition filename in `agents/`
- The dispatch script validates agent names at runtime and rejects unrecognized names with a list of available agents
- This validation catches typos before they waste an API call and a timeout window
```

**Step 2: Update Absolute Paths subsection**

Replace the current "Absolute Paths" subsection (lines 113-114):

Before:
```
### Absolute Paths
Always provide absolute file paths. Never use relative paths or expect agents to search for files.
```

After:
```
### Absolute Paths
Always provide absolute file paths in delegation prompts. Never use relative paths or expect agents to search for files.

For parallel dispatch, the dispatch script automatically prepends the project root directory to every prompt as a safety net. However, delegation prompts should still use absolute paths — the injected root is a fallback for resilience, not a substitute for explicit path construction.
```

**Step 3: Commit**

```bash
git add skills/delegation/SKILL.md
git commit -m "feat: add agent name rules and absolute path safety net to delegation skill"
```

---

### Task 11: Update `skills/implementation-planning/SKILL.md` with execution profile

**Files:**
- Modify: `skills/implementation-planning/SKILL.md`

**Step 1: Add Execution Profile requirement**

In the "Required Sections" subsection (after the list item `6. **Risk Classification**` around line 179), insert a new item:

```markdown
7. **Execution Profile**: Summary of parallel vs sequential characteristics to inform mode selection:
   ```
   Execution Profile:
   - Total phases: [N]
   - Parallelizable phases: [M] (in [B] batches)
   - Sequential-only phases: [S]
   - Estimated parallel wall time: [time estimate based on batch execution]
   - Estimated sequential wall time: [time estimate based on serial execution]

   Note: Parallel dispatch runs agents in autonomous mode (--yolo).
   All tool calls are auto-approved without user confirmation.
   ```
```

**Step 2: Commit**

```bash
git add skills/implementation-planning/SKILL.md
git commit -m "feat: add execution profile requirement to implementation planning skill"
```

---

### Task 12: Update `templates/session-state.md` with `execution_mode` field

**Files:**
- Modify: `templates/session-state.md`

**Step 1: Add execution_mode field**

In the YAML frontmatter, after `current_phase: 1` (line 8) and before `total_phases:` (line 9), insert:

```yaml
execution_mode: null
```

**Step 2: Commit**

```bash
git add templates/session-state.md
git commit -m "feat: add execution_mode field to session state template"
```

---

## Dependency Graph

```
Task 1 (read-state.sh) ──────────────┐
Task 2 (write-state.sh) ─────────────┤
Task 6 (agent-base-protocol) ────────┤
                                      ├──► Task 8 (session-management skill)
Task 3 (dispatch: concurrency) ──┐    ├──► Task 9 (execution skill)
  │                              │    ├──► Task 11 (impl-planning skill)
  ▼                              │    └──► Task 12 (session-state template)
Task 4 (dispatch: name validation)    │
  │                              │
  ▼                              │
Task 5 (dispatch: root injection)─────┤
                                      │
                                      ├──► Task 7 (GEMINI.md)
                                      └──► Task 10 (delegation skill)
```

**Parallel opportunities:**
- **Batch A**: Tasks 1, 2, 6 (independent new files / independent protocol file)
- **Batch B**: Tasks 3 → 4 → 5 (sequential, same file: parallel-dispatch.sh)
- **Batch C**: Tasks 7, 8, 9, 10, 11, 12 (independent skill/template files, after Batch A+B)

Batches A and B can run concurrently. Batch C runs after both complete.

## Risk Classification

| Task | Risk | Rationale |
|------|------|-----------|
| 1 | LOW | New file, no dependents |
| 2 | LOW | New file, no dependents |
| 3 | MEDIUM | Modifies dispatch loop logic, affects all parallel execution |
| 4 | LOW | Additive validation, fail-fast before dispatch |
| 5 | LOW | Additive prompt header, no logic change |
| 6 | LOW | Additive protocol section, no existing content modified |
| 7 | MEDIUM | Multiple sections added to orchestrator prompt, must maintain coherence |
| 8 | LOW | Additive skill section |
| 9 | MEDIUM | Two new sections plus modifying existing protocol steps |
| 10 | LOW | Additive subsection + small replacement |
| 11 | LOW | Additive requirement |
| 12 | LOW | Single YAML line addition |
