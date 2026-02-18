# Changelog

All notable changes to Maestro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-02-18

### Added

- **Hooks-based lifecycle middleware** — 5 hook handlers: SessionStart, BeforeAgent, AfterAgent, BeforeModel, SessionEnd
- **Agent tracking** — BeforeAgent/AfterAgent hooks track active agent identity across parallel dispatch
- **Handoff report validation** — AfterAgent hook validates agent output includes Task Report and Downstream Context
- **Model inheritance** — All agents omit the `model` field, inheriting the main session's model selection
- **Integration test suite** — `tests/run-all.sh` with tests for hook lifecycle events
- **macOS timeout fallback** — Cancel-file-based watchdog with SIGTERM/SIGKILL for systems without GNU `timeout`
- `settings` declarations in `gemini-extension.json` for `MAESTRO_DEFAULT_MODEL` and `MAESTRO_WRITER_MODEL` environment variables (parallel dispatch)
- `write_todos` phase progress tracking in orchestrator
- `enter_plan_mode`/`exit_plan_mode` for read-only Phase 1-2
- `save_memory` for cross-session knowledge persistence at Phase 4

### Changed

- All agents: removed hardcoded models (inherit from main session)
- All agents: `search_file_content` renamed to `grep_search` (canonical tool name)
- All agents: unified Handoff Report output contract
- `parallel-dispatch.sh`: sets `MAESTRO_CURRENT_AGENT` per spawned process
- `delegation` skill: prompt-based enforcement documented as defense-in-depth (native frontmatter is primary gate)

### Fixed

- `excludeTools` patterns corrected to use proper regex syntax instead of shell glob syntax
- All agent definitions: added `display_name`, expanded tool access to include `grep_search`, improved descriptions
- macOS timeout support in parallel dispatch
- README local development link command (`gemini extensions link .`)
- Inconsistent agent output contracts unified

### Removed

- `before-tool.sh`, `before-tool-selection.sh`, `after-tool.sh` hooks — native frontmatter `tools:` handles tool enforcement
- `permissions.json` and `generate-permissions.sh` — redundant with native frontmatter enforcement
- `validate-agent-permissions.sh` — validated against the removed permissions manifest

## [1.1.1] - 2026-02-15

### Fixed

- Removed extension settings prompts from install — Gemini CLI doesn't support default values, so users were forced through 13 prompts on install. All settings now use orchestrator defaults and are configurable via environment variables.

### Changed

- README configuration section renamed from "Extension Settings" to "Environment Variables" with all 13 parameters documented

## [1.1.0] - 2026-02-15

### Added

- Extension settings with 10 configurable parameters via environment variables
- Maestro branded dark theme with warm gold accents
- Shell-based parallel dispatch for concurrent subagent execution (`scripts/parallel-dispatch.sh`)
- Agent base protocol with pre-flight procedures and structured output formatting
- Settings references in delegation, execution, session-management, and validation skills
- TechLead orchestrator startup checks with settings resolution
- Filesystem safety protocol for delegated agents (`protocols/filesystem-safety-protocol.md`)
- Workspace bootstrap script for directory safety (`scripts/ensure-workspace.sh`)
- State file I/O scripts for atomic reads and writes (`scripts/read-state.sh`, `scripts/write-state.sh`)
- Agent name validation against `agents/` directory in parallel dispatch (`scripts/validate-agent-permissions.sh`)
- Concurrency cap (`max_concurrent`) and stagger delay (`stagger_delay_seconds`) settings for parallel dispatch
- Execution mode selection (`execution_mode`) in extension settings and session state template
- Workspace readiness startup check in orchestrator
- File-writing enforcement rules across agent base protocol, delegation prompts, and filesystem safety protocol
- Project root auto-injection into all parallel dispatch prompts
- Execution mode gate and state file access protocol in execution skill
- Execution profile requirement in implementation planning skill

### Fixed

- Hardened `parallel-dispatch.sh` against shell injection and edge cases
- Hardened scripts and commands against injection and path traversal attacks
- Stagger delay default changed from 0 to 5 seconds
- File writing rules enforced via `write_file` tool-only policy across all delegation prompts

### Changed

- Execution mode upgraded from sequential-only to PARALLEL (shell-based) as default strategy
- Delegation skill updated with agent name rules and absolute path safety net
- Filesystem safety protocol injected into all delegation prompts
- Session-management `mkdir` steps annotated as defense-in-depth fallbacks

## [1.0.0] - 2026-02-09

### Added

- TechLead orchestrator with 12 specialized subagents
- Guided design dialogue with structured requirements gathering
- Automated implementation planning with phase dependencies and parallelization
- Parallel execution of independent phases via subagent invocation
- Session persistence with YAML+Markdown state tracking
- Least-privilege security model per agent
- Standalone commands: `maestro.orchestrate`, `maestro.resume`, `maestro.execute`
- Standalone commands: `maestro.review`, `maestro.debug`, `maestro.security-audit`, `maestro.perf-check`
- Session management: `maestro.status`, `maestro.archive`
- Design document, implementation plan, and session state templates
- Skill modules: code-review, delegation, design-dialogue, execution, implementation-planning, session-management, validation
