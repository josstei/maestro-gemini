# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Maestro is a **multi-agent orchestration extension for Gemini CLI**. It transforms the Gemini CLI into a team of 12 specialized AI subagents coordinated by a TechLead orchestrator through a structured 4-phase workflow (Design → Plan → Execute → Complete).

This is a **configuration-only project** — no compiled code, no runtime dependencies, no build step. The entire extension is defined through Markdown files (with YAML frontmatter), TOML command definitions, and JSON manifests.

## Development Commands

```bash
# Link extension for local development
gemini extensions link .

# Sync version from package.json to gemini-extension.json
npm version <patch|minor|major>

# Test commands (manual, in Gemini CLI after linking)
/maestro.orchestrate "Build a simple TODO app"
/maestro.review
/maestro.status
```

There is no build or lint step. Hooks integration tests are available:

```bash
# Run hooks integration tests
bash tests/run-all.sh
```

End-to-end orchestration validation is manual via Gemini CLI.

## Architecture

### Extension Entry Point

`gemini-extension.json` → points to `GEMINI.md` as the context file (system prompt). When the extension loads, `GEMINI.md` defines the TechLead orchestrator persona and all orchestration logic.

### Seven-Layer Component Model

| Layer | Directory | Format | Purpose |
|-------|-----------|--------|---------|
| **Orchestrator** | `GEMINI.md` | Markdown | TechLead persona, phase transitions, delegation rules |
| **Commands** | `commands/` | TOML | CLI command definitions mapping user commands to prompts/skills |
| **Agents** | `agents/` | Markdown + YAML frontmatter | 12 subagent persona definitions with tool permissions and model config |
| **Skills** | `skills/` | Markdown (`SKILL.md` per directory) | Reusable methodology modules with embedded protocols |
| **Scripts** | `scripts/` | Shell | Execution infrastructure (parallel dispatch) |
| **Hooks** | `hooks/` | JSON + Shell | Lifecycle middleware for agent tracking, model overrides, session init, and handoff validation (tool permissions enforced natively via frontmatter `tools:`) |
| **Templates** | `templates/` | Markdown | Structure templates for generated artifacts (designs, plans, sessions) |

### Agent Tool Access (Least-Privilege)

- **Read-only**: architect, api-designer, code-reviewer (analysis only)
- **Read + Shell**: debugger, performance-engineer, security-engineer (investigation)
- **Read + Write + Shell**: refactor (modification with validation)
- **Read + Write**: technical-writer (modification without shell)
- **Full access**: coder, data-engineer, devops-engineer, tester

### Model Assignment

- All agents omit the `model` field, inheriting the main session's model selection
- Override via `MAESTRO_DEFAULT_MODEL` or `MAESTRO_WRITER_MODEL` environment variables

### Skills System

Skills are on-demand methodology modules activated via `activate_skill`. They keep the base context lean:

- `design-dialogue` — Requirements gathering, architectural proposals
- `implementation-planning` — Phase decomposition, agent assignment, dependency analysis
- `execution` — Phase execution protocols, error handling, completion
- `delegation` — Subagent prompt construction, scope boundaries, parallel dispatch
- `session-management` — Session CRUD, resume protocol, archival
- `code-review` — Scope detection, severity classification, structured output
- `validation` — Build/lint/test pipeline detection and execution

### State Management

Session state persists in the target project at `.gemini/state/active-session.md` (YAML frontmatter + Markdown body). Plans live in `.gemini/plans/`. Both have `archive/` subdirectories for completed work.

State transitions: `pending` → `in_progress` → `completed`/`failed`/`skipped`

## Key Conventions

- **YAML frontmatter** on all agent/skill/template Markdown files defines metadata (name, tools, model, temperature, max_turns, timeout_mins)
- **TOML** for command definitions (maps CLI commands to prompts with skill/file injection)
- **File naming**: agents use kebab-case (`api-designer.md`), commands use dot-notation (`maestro.orchestrate.toml`), plans use date-prefixed slugs (`YYYY-MM-DD-<topic>-design.md`)
- **Error handling**: automatic retry (max 2) per phase before user escalation
- **Parallel execution**: implementation plans identify independent phases for concurrent subagent dispatch

## CI/CD

`.github/workflows/release.yml` triggers on `v*` tag push — extracts changelog section and creates a GitHub Release.

## Prerequisite for Testing

Gemini CLI must have experimental subagents enabled in `~/.gemini/settings.json`:
```json
{ "experimental": { "enableAgents": true } }
```
