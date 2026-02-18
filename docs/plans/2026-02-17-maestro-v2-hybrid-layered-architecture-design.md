# Maestro v2.0 — Hybrid Layered Architecture Design

| Field | Value |
|-------|-------|
| **Title** | Maestro v2.0 Hybrid Layered Architecture |
| **Created** | 2026-02-17 |
| **Status** | Approved |
| **Authors** | TechLead (orchestrator) |
| **Type** | Architecture Redesign |

---

## Problem Statement

Maestro v1.1.1 is a capable multi-agent orchestration extension, but it has structural limitations that prevent it from being truly reliable, intelligent, and capable:

1. **Tool permission enforcement is prompt-based only** — Read-only agents running in `--yolo` parallel mode can ignore restrictions. No actual enforcement exists.
2. **Shell scripts handle critical operations** — Session state, parallel dispatch, and workspace setup rely on shell scripts that the model calls indirectly with no structured I/O.
3. **Model assignment is static and suboptimal** — All agents use `gemini-3-pro-preview` except `technical-writer`, despite Gemini 3 Flash outperforming Pro on SWE-bench Verified (78% vs 76.2%).
4. **No quality gates** — Phase validation is ad-hoc. The orchestrator runs whatever commands seem right with no formalized go/no-go decisions.
5. **Context window consumption is unmanaged** — Full orchestration loads all skills, protocols, and state into context regardless of relevance to the current phase.
6. **Parallel dispatch is a workaround** — `parallel-dispatch.sh` spawns separate CLI processes because native parallel delegation doesn't exist yet (Issue #17749).
7. **15 structural gaps identified** — From inconsistent output contracts to missing git integration to session state concurrency risks.

## Requirements

### Functional

- Real tool permission enforcement at the middleware level
- Structured, schema-validated tools for session management, orchestration, and project analysis
- Dynamic model routing with per-agent thinking level configuration
- Quality gates with formalized go/no-go decisions between phases
- Git integration for commit-per-phase and branch-per-session workflows
- Plan versioning with modification and supersede support
- Context intelligence for budget-aware context injection
- Parallel dispatch abstraction with future native migration path
- Native Plan Mode integration for Design phase read-only enforcement

### Non-Functional

- Each improvement phase is independently valuable and deployable
- Future SDK migration path is preserved without rework
- Backward compatible with existing Maestro sessions/workflows
- No degradation in orchestration speed or reliability during migration

### Constraints

- Gemini CLI experimental subagents must be enabled
- MCP server requires Node.js runtime
- Hook handlers are shell scripts (Gemini CLI constraint)
- Native parallel delegation depends on unreleased Gemini CLI feature (Issue #17749)

---

## Approach

### Selected: Hybrid Layered Architecture

Use hooks for enforcement and lifecycle management, MCP for tools, and keep the configuration-driven agent/skill system for the parts it handles well. Each layer has a single responsibility. No layer reaches into another's domain.

### Alternatives Considered

**Hooks-First (Middleware-Driven)**: Make hooks the sole nervous system. Rejected because hook handlers are shell scripts, which limits complexity for tools like project analysis and session management.

**SDK-Powered (Programmatic Orchestration)**: Use `@google/gemini-cli-sdk` for programmatic agent construction with custom tools and dynamic instructions. Rejected for now due to SDK immaturity (bootstrapped recently, API likely to change). Positioned as the future migration target — the Hybrid architecture creates the abstraction boundaries that make SDK migration straightforward.

---

## Architecture

### Four-Layer Model

```
┌─────────────────────────────────────────────────────────┐
│                    Gemini CLI Runtime                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Layer 4: Parallel Abstraction            │   │
│  │  ┌─────────────┐  ┌───────────────────────────┐  │   │
│  │  │  Dispatch    │  │  Shell (now)               │  │   │
│  │  │  Strategy    │──│  Sequential (now)          │  │   │
│  │  │  Router      │  │  Native (future)           │  │   │
│  │  └─────────────┘  └───────────────────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Layer 3: Agents, Skills, Protocols         │   │
│  │  12 agents (model:auto) │ 7 skills │ 3 protocols  │   │
│  │  + thinking levels  + output contracts  + MCP ACL  │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Layer 2: MCP Tool Server                 │   │
│  │  Session │ Orchestration │ Project │ Git │ Plans   │   │
│  │  Quality Gates │ Context Intelligence              │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │        Layer 1: Hooks (Lifecycle Middleware)        │   │
│  │  BeforeTool → Enforcement  │ AfterTool → Validation│   │
│  │  BeforeAgent → Context     │ AfterAgent → State    │   │
│  │  SessionStart → Setup                              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Layer 1: Hooks (Lifecycle Middleware)

The enforcement backbone. Every significant event passes through hooks.

#### Hook Definitions

| Hook Event | Handler | Purpose |
|------------|---------|---------|
| `SessionStart` | `hooks/session-start.sh` | Workspace setup, config resolution, permissions manifest generation, active session detection |
| `BeforeTool` | `hooks/before-tool.sh` | Tool permission enforcement — blocks disallowed tools per agent |
| `AfterTool` | `hooks/after-tool.sh` | Auto-validation after writes, token tracking |
| `BeforeAgent` | `hooks/before-agent.sh` | Dynamic context injection (session state, downstream context, conventions) |
| `AfterAgent` | `hooks/after-agent.sh` | State updates, handoff report validation, phase transition tracking |

#### BeforeTool — Permission Enforcement

1. Receives JSON on stdin: `{ "toolName": "write_file", "agentName": "code-reviewer", "input": {...} }`
2. Looks up agent's allowed tools from compiled `hooks/permissions.json`
3. Returns `{"action": "block", "message": "..."}` or `{"action": "allow"}`

The permissions manifest is generated at SessionStart from agent YAML frontmatter:
```json
{
  "code-reviewer": ["read_file", "glob", "search_file_content"],
  "architect": ["read_file", "glob", "search_file_content", "google_web_search"],
  "coder": ["read_file", "glob", "search_file_content", "write_file", "replace", "run_shell_command"]
}
```

#### BeforeAgent — Dynamic Context Injection

Injects only what's relevant for the current agent invocation:
- Active session state (current phase, completed phases)
- Downstream context from prior phases (interfaces, patterns, warnings)
- Project conventions detected during Design phase
- Convention anchors from parallel batch peers

#### AfterTool — Automatic Validation

- After `write_file`/`replace` → run linter on modified file (if detected)
- After `run_shell_command` with test patterns → record results in session state
- Token counting for budget tracking

#### AfterAgent — State Management

- Parse handoff report from agent output
- Update session state (phase status, files changed, token usage)
- Record downstream context for subsequent phases
- Trigger batch validation when all phases in a parallel batch complete

### Layer 2: MCP Tool Server

Node.js MCP server providing 7 tool categories (~30 tools).

#### Category 1: Session Management

| Tool | Input | Output |
|------|-------|--------|
| `maestro_session_create` | `{topic, planRef, executionMode}` | `{sessionId, statePath}` |
| `maestro_session_read` | `{sessionId?}` | `{session state object}` |
| `maestro_session_update` | `{phaseId, status, filesChanged?, errors?, downstreamContext?}` | `{success, updatedState}` |
| `maestro_session_archive` | `{sessionId?}` | `{archivePath, summary}` |
| `maestro_session_resume` | `{sessionId}` | `{session state, resumePoint}` |

Atomic state mutations with file locking. Structured JSON I/O replaces raw Markdown parsing.

#### Category 2: Orchestration

| Tool | Input | Output |
|------|-------|--------|
| `maestro_dispatch_batch` | `{agents: [{name, prompt, files}], mode}` | `{batchId, results[]}` |
| `maestro_validate_phase` | `{phaseId, validationType}` | `{passed, errors[], warnings[]}` |
| `maestro_track_tokens` | `{agentName, inputTokens, outputTokens}` | `{totalUsage, budgetRemaining}` |
| `maestro_resolve_model` | `{agentName}` | `{model, thinkingLevel, overrideSource}` |

`maestro_dispatch_batch` wraps the Layer 4 parallel abstraction as a callable tool.

#### Category 3: Project Analysis

| Tool | Input | Output |
|------|-------|--------|
| `maestro_detect_stack` | `{projectPath?}` | `{languages[], frameworks[], buildTools[], testFrameworks[], linters[]}` |
| `maestro_analyze_deps` | `{filePath}` | `{imports[], exports[], dependents[]}` |
| `maestro_file_inventory` | `{paths[], includeMetadata?}` | `{files[{path, size, lastModified, language}]}` |
| `maestro_detect_conventions` | `{projectPath?}` | `{naming, structure, patterns, testLocation}` |

#### Category 4: Git Integration

| Tool | Input | Output |
|------|-------|--------|
| `maestro_git_status` | `{staged?, unstaged?, untracked?}` | `{files[], summary}` |
| `maestro_git_diff` | `{scope, ref?}` | `{files[], hunks[], stats}` |
| `maestro_git_commit` | `{message, files[], phase?}` | `{sha, filesCommitted}` |
| `maestro_git_branch` | `{action, name?}` | `{branch, created?}` |
| `maestro_git_stash` | `{action, message?}` | `{stashRef?, restored?}` |

#### Category 5: Plan Management

| Tool | Input | Output |
|------|-------|--------|
| `maestro_plan_create` | `{topic, phases[], designRef}` | `{planPath, planId}` |
| `maestro_plan_read` | `{planId?}` | `{plan object}` |
| `maestro_plan_version` | `{planId, changes[]}` | `{newPlanPath, version, diff}` |
| `maestro_plan_reorder` | `{planId, newOrder[]}` | `{updatedPlan, dependencyWarnings[]}` |
| `maestro_plan_progress` | `{planId?}` | `{completed, current, remaining, percent}` |

#### Category 6: Quality Gates

| Tool | Input | Output |
|------|-------|--------|
| `maestro_gate_check` | `{phaseId, checks[]}` | `{passed, results[], blockers[]}` |
| `maestro_gate_coverage` | `{files[], threshold?}` | `{coverage%, covered[], uncovered[]}` |
| `maestro_gate_regression` | `{beforeRef, afterRef}` | `{newFailures[], fixed[], unchanged[]}` |
| `maestro_gate_deliverables` | `{phaseId, expected[]}` | `{delivered[], missing[], unexpected[]}` |

#### Category 7: Context Intelligence

| Tool | Input | Output |
|------|-------|--------|
| `maestro_context_budget` | `{agentName?}` | `{usedTokens, remaining, utilization%}` |
| `maestro_context_summarize` | `{phaseId}` | `{summary, keyDecisions[], fileInventory[]}` |
| `maestro_context_relevant` | `{query, files[]}` | `{rankedFiles[], relevanceScores[]}` |

#### MCP Server Registration

```json
{
  "mcpServers": {
    "maestro": {
      "command": "node",
      "args": ["${extensionPath}/mcp-server/index.js"],
      "cwd": "${workspacePath}"
    }
  }
}
```

### Layer 3: Enhanced Agents, Skills & Protocols

#### Agent Enhancements

**Dynamic Model Routing**: All agents use `model: auto` for platform-optimized routing per turn.

**Thinking Levels**:

| Tier | Agents | Thinking Level |
|------|--------|---------------|
| Design-heavy | architect, api-designer | high |
| Analysis-heavy | code-reviewer, security-engineer, performance-engineer, debugger | high |
| Implementation | coder, tester, refactor, data-engineer, devops-engineer | medium |
| Documentation | technical-writer | low |

**Consistent Output Contracts**: All agents adopt the Handoff Report format (Part 1: Task Report + Part 2: Downstream Context). AfterAgent hook validates compliance.

**MCP Tool Access by Tier**:
- Read-only agents: `maestro_session_read`, `maestro_detect_stack`, `maestro_detect_conventions`, `maestro_context_relevant`
- Write agents: Above + `maestro_session_update`, `maestro_git_status`
- Full-access agents: Above + `maestro_git_commit`, `maestro_gate_check`

#### Skill Enhancements

**design-dialogue**: Enters native Plan Mode (`enter_plan_mode()`) for read-only enforcement during Design phase. Layers Maestro's structured requirements gathering methodology on top.

**implementation-planning**: Uses `maestro_detect_stack`, `maestro_detect_conventions`, `maestro_file_inventory`, `maestro_plan_create` for MCP-powered planning.

**execution**: Integrates quality gates — `maestro_gate_deliverables` before phases, `maestro_gate_check` after phases, `maestro_gate_regression` after batches.

**validation**: Becomes thin methodology layer delegating to quality gate MCP tools.

#### Protocol Enhancements

**agent-base-protocol**: Rules now enforced via hooks. Document becomes reference, not sole enforcement mechanism.

**filesystem-safety-protocol**: Unchanged — still relevant for path construction guidance.

**New: mcp-tool-usage-protocol**: Defines how agents interact with Maestro MCP tools — when to call session tools, how to interpret quality gate results, context inclusion in state updates.

### Layer 4: Parallel Abstraction

Abstracted behind `maestro_dispatch_batch` MCP tool with strategy routing.

#### Dispatch Strategies

| Strategy | Implementation | When Used |
|----------|---------------|-----------|
| `parallel` | Enhanced shell processes | Current default for parallel batches |
| `sequential` | `delegate_to_agent` one-by-one | User preference or quota concerns |
| `native` | Parallel `delegate_to_agent` | When Issue #17749 ships (auto-detected) |
| `auto` | Best available | Checks native → falls back to parallel |

#### Shell Dispatcher Enhancements

- macOS timeout fallback (background timer + kill)
- Per-agent model resolution via `maestro_resolve_model`
- Result normalization to standard format
- Hooks integration (BeforeTool/AfterTool still fire)

#### Cross-Batch Context

- Pre-batch: BeforeAgent hooks inject accumulated patterns
- Convention anchoring: First phase establishing patterns marked as anchor
- Post-batch reconciliation: Orchestrator reviews results for convention conflicts

---

## Structural Fixes

| # | Gap | Fix | Layer |
|---|-----|-----|-------|
| 1 | Tool permission enforcement prompt-based | BeforeTool hook with permissions manifest | L1 |
| 2 | No automated test suite | YAML/TOML validation, cross-ref checks, hook handler tests | Build |
| 3 | MAESTRO_WRITER_MODEL not in parallel | Per-agent model resolution via MCP tool | L4 |
| 4 | Missing macOS timeout fallback | Background timer + kill | L4 |
| 5 | No git integration | Git MCP tools | L2 |
| 6 | Session state concurrency | File locking in MCP session tools | L2 |
| 7 | Plan versioning not implemented | Plan management MCP tools | L2 |
| 8 | Inconsistent output contracts | Unified Handoff Report + AfterAgent validation | L1+L3 |
| 9 | No codebase-investigator agent | Formalize or remove references | L3 |
| 10 | Missing quota error handling | Exponential backoff in dispatch tools | L2+L4 |
| 11 | Documentation accuracy | Fix README link command inconsistency | Docs |
| 12 | Fragile skill activation | BeforeAgent verifies skill injection | L1 |
| 13 | No cross-batch context | Convention anchoring + reconciliation | L4 |
| 14 | Large context consumption | Context intelligence MCP tools | L2 |
| 15 | Missing thinking_level | Agent frontmatter enhancement | L3 |

---

## Release Phasing

### Phase 1: v1.2 — Foundation (Hooks + Fixes)

**Scope**: Hooks infrastructure, permission enforcement, model routing, structural fixes.

**Deliverables**:
- `hooks/hooks.json` — Hook event definitions
- `hooks/session-start.sh` — Workspace setup + permissions manifest generation
- `hooks/before-tool.sh` — Tool permission enforcement
- `hooks/before-agent.sh` — Dynamic context injection
- `hooks/after-agent.sh` — Handoff report validation
- `hooks/permissions.json` — Compiled agent-to-tools mapping
- Agent frontmatter updates: `model: auto`, `thinking_level` per tier
- Unified Handoff Report across all agents
- macOS timeout fallback in `parallel-dispatch.sh`
- Documentation fixes

**Value**: Real security enforcement, optimized model routing, consistent agent output.

### Phase 2: v1.3 — MCP Server (Core Tools)

**Scope**: MCP server infrastructure with session, orchestration, and project analysis tools.

**Deliverables**:
- `mcp-server/` — Node.js MCP server
- 13 tools across 3 categories (Session, Orchestration, Project Analysis)
- `gemini-extension.json` update for MCP server registration
- Skill updates to use MCP tools
- `hooks/after-tool.sh` — Auto-validation after writes
- `hooks/after-agent.sh` — Session state updates via MCP

**Dependencies**: Phase 1 hooks infrastructure.

**Value**: Tool-driven orchestration replaces shell scripts. Structured I/O for all operations.

### Phase 3: v1.4 — MCP Server (Extended) + Plan Mode

**Scope**: Git, plans, quality gates, context intelligence tools. Plan Mode integration.

**Deliverables**:
- 17 additional tools across 4 categories (Git, Plans, Quality Gates, Context Intelligence)
- Design-dialogue skill → Plan Mode integration
- Execution skill → Quality gate integration
- Validation skill → Quality gate delegation
- `protocols/mcp-tool-usage-protocol.md`

**Dependencies**: Phase 2 MCP server infrastructure.

**Value**: Full project lifecycle coverage. Formalized quality gates. Native Plan Mode enforcement.

### Phase 4: v2.0 — Parallel Abstraction + Polish

**Scope**: Dispatch strategy router, enhanced dispatchers, cross-batch context, test suite.

**Deliverables**:
- `maestro_dispatch_batch` strategy routing implementation
- Enhanced shell dispatcher
- Sequential dispatcher
- Native dispatcher stub with auto-detection
- Convention anchoring for cross-batch context
- Automated test suite (YAML/TOML validation, cross-references, hook handlers)
- Comprehensive documentation update
- `package.json` version bump to 2.0.0

**Dependencies**: Phase 3 MCP tools (dispatch uses quality gates and session tools).

**Value**: Production-grade parallel execution. Future-proof native migration path. Full v2.0.

### Dependency Graph

```
Phase 1 (v1.2: Hooks + Fixes)
    │
    ▼
Phase 2 (v1.3: MCP Core)
    │
    ▼
Phase 3 (v1.4: MCP Extended + Plan Mode)
    │
    ▼
Phase 4 (v2.0: Parallel + Polish)
```

---

## Future: SDK Migration Path

The Hybrid Layered architecture creates natural abstraction boundaries for future SDK migration:

| Current (Hybrid) | Future (SDK) |
|-------------------|-------------|
| MCP server tools | SDK custom tools (Zod schemas) |
| Hook handlers (shell) | Programmatic middleware (TypeScript) |
| Static GEMINI.md | Dynamic system instructions (function) |
| Shell parallel dispatch | `ctx.agent` programmatic dispatch |
| File-based state | SDK SessionContext state |

Migration is component-by-component, not all-or-nothing. Each layer can be migrated independently as the SDK matures.

---

## Success Criteria

### Reliability

- Zero tool permission violations in parallel execution (hooks enforce, not suggest)
- Zero session state corruption (file locking, atomic mutations)
- Consistent handoff reports across all agents (validated by hooks)

### Intelligence

- Dynamic model routing adapts to task complexity per turn
- Thinking levels match agent cognitive requirements
- Context injection is phase-aware (agents get relevant context, not everything)

### Capability

- 30 MCP tools covering full orchestration lifecycle
- Formalized quality gates with structured go/no-go decisions
- Git integration for commit-per-phase workflows
- Plan versioning for mid-execution modifications
- Context budgeting for long-running orchestrations
