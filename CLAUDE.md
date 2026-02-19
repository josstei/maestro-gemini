# CLAUDE.md

Implementation guidance for contributors working on the Maestro Gemini CLI extension.

## Project Overview

Maestro is a configuration-first Gemini CLI extension. Core runtime surfaces:

- `gemini-extension.json`: extension metadata and configurable env vars
- `GEMINI.md`: TechLead orchestrator context and 4-phase protocol
- `commands/maestro/*.toml`: slash command prompts (`/maestro:*`)
- `agents/*.md`: local subagent definitions and tool permissions
- `skills/*/SKILL.md`: reusable procedural protocols
- `hooks/hooks.json` + `hooks/*.sh`: lifecycle middleware
- `scripts/*.sh`: workspace/state/parallel-dispatch helpers

There is no compiled runtime binary in this repository.

## Development Commands

```bash
# Link extension in Gemini CLI
gemini extensions link .

# Sync package version into gemini-extension.json
npm version <patch|minor|major>

# Run integration tests
bash tests/run-all.sh
```

Useful manual checks after linking:

```bash
/maestro:orchestrate "Build a simple TODO app"
/maestro:status
/maestro:resume
/maestro:review
```

## Source-of-Truth Files

- `gemini-extension.json`
- `GEMINI.md`
- `commands/maestro/*.toml`
- `agents/*.md`
- `skills/*/SKILL.md`
- `hooks/hooks.json`
- `scripts/ensure-workspace.sh`
- `scripts/read-state.sh`
- `scripts/write-state.sh`
- `scripts/read-active-session.sh`
- `scripts/parallel-dispatch.sh`
- `tests/run-all.sh`

## Gemini CLI Compatibility Notes

- Extension settings from `gemini-extension.json` are configured through `gemini extensions config` and hydrated as `MAESTRO_*` env vars.
- File commands are loaded from user/project/extension command directories; Maestro commands resolve under `/maestro:*`.
- Hook definitions in `hooks/hooks.json` must use `type: "command"` (plugin-style hooks are rejected by current Gemini CLI validation).
- Skill discovery merges built-in, extension, user, and workspace skills with precedence and trust gating.

## Current Settings Surface

`gemini-extension.json` exposes:

| envVar | Purpose |
| --- | --- |
| `MAESTRO_DEFAULT_MODEL` | Model override for parallel-dispatched agents |
| `MAESTRO_WRITER_MODEL` | Writer-specific model override in parallel dispatch |
| `MAESTRO_DEFAULT_TEMPERATURE` | Delegation temperature override |
| `MAESTRO_MAX_TURNS` | Delegation turn limit override |
| `MAESTRO_AGENT_TIMEOUT` | Dispatch timeout and delegation timeout metadata |
| `MAESTRO_DISABLED_AGENTS` | Comma-separated excluded agents |
| `MAESTRO_MAX_RETRIES` | Retry ceiling before escalation |
| `MAESTRO_AUTO_ARCHIVE` | Auto-archive on successful completion |
| `MAESTRO_VALIDATION_STRICTNESS` | Validation gate mode |
| `MAESTRO_STATE_DIR` | Session/plans/parallel state root |
| `MAESTRO_MAX_CONCURRENT` | Parallel process cap (`0` = unlimited) |
| `MAESTRO_STAGGER_DELAY` | Launch delay between parallel processes |
| `MAESTRO_GEMINI_EXTRA_ARGS` | Extra Gemini CLI args forwarded to each parallel process |
| `MAESTRO_EXECUTION_MODE` | Execute phase mode: `ask`, `parallel`, `sequential` |

Script-only vars:

- `MAESTRO_CLEANUP_DISPATCH`
- `MAESTRO_CURRENT_AGENT`
- `MAESTRO_EXTENSION_PATH`

Script precedence is env -> workspace `.env` -> extension `.env` -> default.

## Hook Contract

Defined in `hooks/hooks.json`:

- SessionStart -> `hooks/session-start.sh`
- BeforeAgent -> `hooks/before-agent.sh`
- AfterAgent -> `hooks/after-agent.sh`
- SessionEnd -> `hooks/session-end.sh`

Behavior summary:

- `before-agent.sh`: tracks active agent (`MAESTRO_CURRENT_AGENT` first, regex fallback), injects compact session phase/status context
- `after-agent.sh`: validates delegated output includes both `Task Report` and `Downstream Context`, requests one retry when malformed
- session hooks: maintain `/tmp/maestro-hooks/<session-id>` lifecycle

## Parallel Dispatch Contract

`scripts/parallel-dispatch.sh <dispatch-dir>` expects `prompts/*.txt` and writes `results/*`.

Per-agent execution:

- validates agent name against `agents/*.md`
- prepends project-root safety preamble
- streams prompt payload to `gemini` over stdin
- runs `gemini --approval-mode=yolo --output-format json [model flags] [extra args]`
- persists `.json`, `.exit`, `.log`

Batch-level behavior:

- writes `summary.json`
- preserves real non-zero exit codes in `.exit` and summary
- exits with number of failed agents
- warns when `--allowed-tools` is passed and recommends `--policy`

## Testing

`bash tests/run-all.sh` currently covers:

- all hook scripts
- parallel dispatch arg forwarding and stdin payload behavior
- dispatch config fallback precedence
- dispatch exit-code propagation
- read-active-session resolution behavior

Orchestration prerequisite:

```json
{ "experimental": { "enableAgents": true } }
```
