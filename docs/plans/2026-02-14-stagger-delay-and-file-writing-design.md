# Stagger Delay & File Writing Enforcement Design

**Date:** 2026-02-14
**Status:** Approved
**Branch:** chore/gitignore-and-dispatch-fixes

## Problem Statement

Two issues observed during parallel dispatch testing:

1. **Stagger delay was 0** — The orchestrator invoked `parallel-dispatch.sh` without setting `MAESTRO_STAGGER_DELAY`, and the script defaults to 0. All agents launched simultaneously, risking rate-limiting and resource contention.

2. **Agents used `cat >>` for file writing** — Despite the agent base protocol prohibiting shell-based file writing, dispatched agents ignored the rule and used `cat >>` instead of `write_file`.

## Root Cause Analysis

### Stagger Delay

- `parallel-dispatch.sh` defaults `MAESTRO_STAGGER_DELAY` to `0` (line 80)
- The test script (`test-parallel-dispatch.sh`) does not set the env var
- `MAESTRO_STAGGER_DELAY` is documented in `GEMINI.md` but missing from `gemini-extension.json`, so users cannot configure it via `gemini extensions config maestro`
- Two other settings (`MAESTRO_MAX_CONCURRENT`, `MAESTRO_EXECUTION_MODE`) have the same gap

### File Writing

- Gemini CLI has NO runtime tool restriction enforcement — `--yolo` bypasses all tool permissions
- Agent frontmatter `tools` arrays are only enforced in sequential `delegate_to_agent` mode
- No hook system exists for intercepting tool calls
- The file writing prohibition in `agent-base-protocol.md` is buried after 3 pre-flight steps — LLMs weight early instructions higher
- No reinforcement of the rule exists in the delegation prompt template or filesystem safety protocol

## Design

### Section 1: Settings Sync & Default Change

**Add 3 missing settings to `gemini-extension.json`:**

```json
{
  "name": "Max Concurrent Agents",
  "description": "Maximum agents running simultaneously in parallel dispatch (0 = unlimited, default: 0)",
  "envVar": "MAESTRO_MAX_CONCURRENT",
  "sensitive": false
},
{
  "name": "Stagger Delay",
  "description": "Seconds between parallel agent launches to prevent rate-limiting (default: 5)",
  "envVar": "MAESTRO_STAGGER_DELAY",
  "sensitive": false
},
{
  "name": "Execution Mode",
  "description": "Phase 3 dispatch mode: parallel (concurrent agents), sequential (one at a time), or ask (prompt user). Default: ask",
  "envVar": "MAESTRO_EXECUTION_MODE",
  "sensitive": false
}
```

**Change stagger delay default from 0 to 5:**

| File | Change |
|------|--------|
| `scripts/parallel-dispatch.sh` line 80 | `MAESTRO_STAGGER_DELAY:-0` -> `MAESTRO_STAGGER_DELAY:-5` |
| `scripts/parallel-dispatch.sh` line 37 | Update usage text default |
| `GEMINI.md` settings table | Update default column for Stagger Delay to `5` |

### Section 2: File Writing Rule — 4-Layer Reinforcement

Since Gemini CLI provides no runtime enforcement, prompt-based reinforcement at every layer is the only viable strategy.

**Layer 1 — Agent Base Protocol (elevation)**

Move the "File Writing Protocol" section to the very top of `agent-base-protocol.md`, before the Pre-Flight Protocol. Strengthen the framing:

```markdown
## CRITICAL: File Writing Rule

ALWAYS use `write_file` for creating files and `replace` for modifying files.

NEVER use `run_shell_command` to write file content. This includes:
- `cat`, `cat >>`, `cat << EOF`
- `echo`, `printf`
- Heredocs (`<< EOF`, `<< 'EOF'`)
- Any shell redirection for content (`>`, `>>`)

Shell interpretation corrupts YAML frontmatter, Markdown syntax, backticks, brackets, and special characters. This rule has NO exceptions.

If `write_file` is not in your authorized tool list, you cannot create files. Report the limitation rather than using shell workarounds.
```

**Layer 2 — Filesystem Safety Protocol (reinforcement)**

Add Rule 6 to `filesystem-safety-protocol.md`:

```markdown
## Rule 6 - Write Tool Only

All file content must be written using `write_file` or `replace` tools. Never use `run_shell_command` with `cat`, `echo`, `printf`, heredocs, or shell redirection (`>`, `>>`) to create or modify file content. Shell interpretation corrupts structured content. This reinforces the Agent Base Protocol's File Writing Rule.
```

**Layer 3 — Delegation Prompt Template (inline)**

Add a `FILE WRITING RULES` block to the delegation prompt template in `skills/delegation/SKILL.md`, placed after the TOOL RESTRICTIONS block:

```markdown
FILE WRITING RULES (MANDATORY):
Use ONLY `write_file` to create files and `replace` to modify files.
Do NOT use run_shell_command with cat, echo, printf, heredocs, or redirection to write content.
```

**Layer 4 — Test Script (modeling correct behavior)**

Update `scripts/test-parallel-dispatch.sh` prompts to explicitly instruct agents to use `write_file` tool:

```
Your task: Use the write_file tool to write EXACTLY this content to src/file-a.txt:
...
IMPORTANT: You MUST use the write_file tool. Do NOT use cat, echo, or any shell command to write files.
```

## Files Changed

| File | Change Type |
|------|-------------|
| `gemini-extension.json` | Add 3 settings entries |
| `GEMINI.md` | Update stagger delay default |
| `scripts/parallel-dispatch.sh` | Change stagger default, update usage text |
| `protocols/agent-base-protocol.md` | Elevate file writing rule to top |
| `protocols/filesystem-safety-protocol.md` | Add Rule 6 |
| `skills/delegation/SKILL.md` | Add FILE WRITING RULES to template |
| `scripts/test-parallel-dispatch.sh` | Update prompt text |

## Constraints

- Gemini CLI has no runtime tool restriction enforcement (researched: no `--restrict-tools` flag, no hook system, no settings-based enforcement)
- `--yolo` mode bypasses all tool permissions
- Agent frontmatter `tools` arrays are advisory in parallel dispatch mode
- Prompt-based reinforcement is the only available enforcement mechanism until Gemini CLI Issue #17749 ships native parallel `delegate_to_agent` support
