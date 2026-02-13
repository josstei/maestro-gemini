# Extension Settings, Theme & Parallel Execution Design

**Created**: 2026-02-12
**Status**: Draft
**Scope**: Extension manifest, orchestrator, delegation/execution skills, research spike
**Priority**: Settings > Parallel > Theme

---

## Problem Statement

Maestro lacks three capabilities that limit adoption and execution quality:

1. **No consumer configurability** — All agent parameters (model, temperature, timeout, turns) are hardcoded. Consumers cannot tune behavior without forking the extension.
2. **No visual identity** — Maestro provides no theme, making it indistinguishable from default Gemini CLI in the terminal.
3. **No parallel execution** — Despite delegation and execution skills describing parallel dispatch, Gemini CLI currently executes subagents sequentially. Maestro's documentation promises parallel behavior it cannot deliver.

Additionally, Maestro requires `experimental.enableAgents: true` but provides no mechanism to detect or guide consumers through this prerequisite.

---

## Feature 1: Extension Settings

### Approach

Leverage the native Gemini CLI `settings` array in `gemini-extension.json`. Each setting maps to an environment variable (`envVar`) that the orchestrator reads at session startup. Non-sensitive values are stored in `.env` files within the extension directory; sensitive values use the system keychain.

### Settings Schema

10 consumer-configurable settings organized into three groups:

#### Model & Performance

| Setting | envVar | Default | Description |
|---------|--------|---------|-------------|
| Default Model | `MAESTRO_DEFAULT_MODEL` | `gemini-3-pro-preview` | Model used by all agents unless individually overridden |
| Writer Model | `MAESTRO_WRITER_MODEL` | `gemini-3-flash-preview` | Model for the technical-writer agent (cost efficiency) |
| Default Temperature | `MAESTRO_DEFAULT_TEMPERATURE` | `0.2` | Default temperature for all agents (0.0-1.0) |
| Max Agent Turns | `MAESTRO_MAX_TURNS` | `25` | Maximum turns per subagent execution |
| Agent Timeout | `MAESTRO_AGENT_TIMEOUT` | `10` | Default timeout for subagent execution in minutes |

#### Agent Management

| Setting | envVar | Default | Description |
|---------|--------|---------|-------------|
| Disabled Agents | `MAESTRO_DISABLED_AGENTS` | (empty) | Comma-separated list of agents to exclude from phase assignment |
| Max Retries | `MAESTRO_MAX_RETRIES` | `2` | Maximum retry attempts per phase before user escalation |

#### Workflow

| Setting | envVar | Default | Description |
|---------|--------|---------|-------------|
| Auto Archive | `MAESTRO_AUTO_ARCHIVE` | `true` | Automatically archive sessions on completion |
| Validation Strictness | `MAESTRO_VALIDATION_STRICTNESS` | `normal` | `strict` (fail on warnings), `normal` (fail on errors), `lenient` (report but continue) |
| State Directory | `MAESTRO_STATE_DIR` | `.gemini` | Directory for session state and plans, relative to project root |

### Settings in `gemini-extension.json`

```json
{
  "settings": [
    {
      "name": "Default Model",
      "description": "Model used by all agents unless individually overridden (e.g., gemini-3-pro-preview, gemini-2.5-pro)",
      "envVar": "MAESTRO_DEFAULT_MODEL",
      "sensitive": false
    },
    {
      "name": "Writer Model",
      "description": "Model for technical-writer agent (defaults to gemini-3-flash-preview for cost efficiency)",
      "envVar": "MAESTRO_WRITER_MODEL",
      "sensitive": false
    },
    {
      "name": "Default Temperature",
      "description": "Default temperature for all agents (0.0-1.0, default: 0.2). Individual agent temperatures override this.",
      "envVar": "MAESTRO_DEFAULT_TEMPERATURE",
      "sensitive": false
    },
    {
      "name": "Max Agent Turns",
      "description": "Maximum turns per subagent execution (default: 25)",
      "envVar": "MAESTRO_MAX_TURNS",
      "sensitive": false
    },
    {
      "name": "Agent Timeout (minutes)",
      "description": "Default timeout for subagent execution in minutes (default: 10)",
      "envVar": "MAESTRO_AGENT_TIMEOUT",
      "sensitive": false
    },
    {
      "name": "Disabled Agents",
      "description": "Comma-separated list of agents to disable (e.g., security-engineer,devops-engineer). Disabled agents won't be assigned phases.",
      "envVar": "MAESTRO_DISABLED_AGENTS",
      "sensitive": false
    },
    {
      "name": "Max Retries",
      "description": "Maximum retry attempts per phase before escalating to user (default: 2)",
      "envVar": "MAESTRO_MAX_RETRIES",
      "sensitive": false
    },
    {
      "name": "Auto Archive",
      "description": "Automatically archive sessions on completion (true/false, default: true)",
      "envVar": "MAESTRO_AUTO_ARCHIVE",
      "sensitive": false
    },
    {
      "name": "Validation Strictness",
      "description": "How strictly to enforce validation: strict (fail on warnings), normal (fail on errors only), lenient (report but continue). Default: normal",
      "envVar": "MAESTRO_VALIDATION_STRICTNESS",
      "sensitive": false
    },
    {
      "name": "State Directory",
      "description": "Directory for session state and plans (default: .gemini). Relative to project root.",
      "envVar": "MAESTRO_STATE_DIR",
      "sensitive": false
    }
  ]
}
```

### Settings Resolution Protocol (Orchestrator)

Add to `GEMINI.md`:

```
## Settings Resolution

On every orchestration session start:
1. Read MAESTRO_* environment variables
2. Apply overrides to delegation parameters:
   - MAESTRO_DEFAULT_MODEL → override agent `model` in delegation prompts
   - MAESTRO_WRITER_MODEL → override technical-writer model specifically
   - MAESTRO_DEFAULT_TEMPERATURE → override agent `temperature` in delegation prompts
   - MAESTRO_MAX_TURNS → override agent `max_turns` in delegation prompts
   - MAESTRO_AGENT_TIMEOUT → override agent `timeout_mins` in delegation prompts
   - MAESTRO_DISABLED_AGENTS → exclude listed agents from phase assignment
   - MAESTRO_MAX_RETRIES → override retry limit in execution skill
   - MAESTRO_AUTO_ARCHIVE → control auto-archival behavior
   - MAESTRO_VALIDATION_STRICTNESS → control validation behavior
   - MAESTRO_STATE_DIR → override default .gemini state directory
3. When an env var is unset, use the default from the agent definition
4. Log resolved settings at session start for transparency
```

### Subagent Prerequisite Check

```
## Startup Checks

Before any orchestration:
1. Verify experimental.enableAgents is true in ~/.gemini/settings.json
2. If not enabled: inform the user that Maestro requires subagents and offer to enable it
3. Do not proceed with orchestration until subagents are confirmed enabled
```

---

## Feature 2: Extension Theme

### Approach

Define a single branded `"Maestro"` theme in the `themes` array of `gemini-extension.json`. The palette draws from a conductor/orchestration metaphor — deep warm charcoal background (concert hall wood), warm ivory text (aged parchment), and gold accents (conductor's baton).

### Theme Definition

```json
{
  "themes": [
    {
      "name": "Maestro",
      "type": "custom",
      "text": {
        "primary": "#E8E1D3",
        "secondary": "#A89B8C",
        "link": "#D4A84B",
        "accent": "#D4A84B",
        "response": "#E8E1D3"
      },
      "Background": "#1A1714",
      "Foreground": "#E8E1D3",
      "LightBlue": "#7BA4C7",
      "AccentBlue": "#5B8CB8",
      "AccentPurple": "#9B7BB8",
      "AccentCyan": "#6BB8B2",
      "AccentGreen": "#8BB86B",
      "AccentYellow": "#D4A84B",
      "AccentRed": "#C75B5B",
      "Comment": "#6B6156",
      "Gray": "#8A8079",
      "DiffAdded": "#6B9B4B",
      "DiffRemoved": "#9B4B4B",
      "DiffModified": "#5B8CB8"
    }
  ]
}
```

### Design Rationale

| Color | Hex | Role | Metaphor |
|-------|-----|------|----------|
| Background | `#1A1714` | Deep warm charcoal | Concert hall in dim lighting |
| Foreground | `#E8E1D3` | Warm ivory | Aged sheet music parchment |
| AccentYellow | `#D4A84B` | Gold — signature color | Conductor's baton, brass instruments |
| AccentPurple | `#9B7BB8` | Plum — structural accent | Velvet curtains, formal attire |
| AccentCyan | `#6BB8B2` | Muted teal — informational | Calm, clarity |
| AccentGreen | `#8BB86B` | Muted green — success/positive | Natural, grounded |
| AccentRed | `#C75B5B` | Muted red — errors/warnings | Attention without alarm |
| Comment | `#6B6156` | Warm gray — subdued | Background instrumentation |

Appears in the Gemini CLI theme picker as **"Maestro (maestro)"**.

---

## Feature 3: Parallel Subagent Execution Research Spike

### Current State

Gemini CLI Issue #17749 tracks "Parallel Execution of Subagents" with 0 of 4 subtasks completed. The broader Epic #17120 (Parallel Tool Calling) is in progress. Current execution is strictly sequential — each subagent is a tool call, and tool calls execute one at a time.

Maestro's delegation and execution skills describe parallel dispatch patterns (non-overlapping file ownership, single-message invocation, batch completion gates), but the underlying CLI cannot execute them.

### Research Scope

Three-phase investigation with a working prototype:

#### Phase 1: Investigation

1. Validate whether `/subagent:run` or equivalent mechanism exists for spawning independent agent instances
2. Test whether the orchestrator's `run_shell_command` tool can launch independent Gemini CLI processes (e.g., `gemini --agent=coder "task prompt" &`)
3. Document constraints: authentication scope, token limits, file locking, state management with concurrent disk writes
4. Catalog any other parallel patterns observed in the Gemini CLI ecosystem

#### Phase 2: Prototype

Build a minimal working example:
- Two agents with non-overlapping file assignments
- One batch of two concurrent agents
- Validate: both execute concurrently, both produce correct output, state is updated correctly after both complete
- Prototype lives in `docs/research/parallel-prototype/`

#### Phase 3: Decision + Integration Design

Based on prototype results, produce one of three outcomes:

| Outcome | Meaning | Next Step |
|---------|---------|-----------|
| **Viable now** | Prototype works reliably | Produce concrete integration design with exact file changes for execution/delegation skills and orchestrator |
| **Viable with caveats** | Works but with significant limitations | Document limitations, produce integration design with explicit guards |
| **Wait for native support** | Workaround too fragile or limited | Remove false parallel promises from skills, add sequential-only gate, revisit when CLI ships native support |

### Integration Points (if viable)

| File | Change |
|------|--------|
| `skills/execution/SKILL.md` | Add parallel dispatch mechanism alongside sequential |
| `skills/delegation/SKILL.md` | Update parallel delegation to use discovered mechanism |
| `GEMINI.md` | Add parallel dispatch capability and decision logic for when to use it |

### Deliverable

`docs/research/parallel-subagent-execution.md` — investigation results, prototype findings, decision, and integration design (if applicable).

---

## Orchestrator (`GEMINI.md`) Changes

`GEMINI.md` is the context file referenced by `gemini-extension.json`. It defines the TechLead orchestrator persona and all orchestration logic. Changes for this design:

### Settings Resolution Section

See Feature 1 above — the orchestrator reads `MAESTRO_*` environment variables at session start and applies overrides to delegation parameters.

### Subagent Prerequisite Gate

See Feature 1 above — soft gate that checks `experimental.enableAgents` and guides the user to enable it.

### Parallel Execution Gate

```
## Execution Mode

Current execution mode: SEQUENTIAL
When parallel subagent execution becomes available (via research spike or Gemini CLI native support),
the execution skill will activate parallel dispatch for independent phases.
Until then, all phases execute sequentially through the standard delegation flow.
```

Updated pending research spike outcome.

---

## File Inventory

| # | File | Action | Purpose |
|---|------|--------|---------|
| 1 | `gemini-extension.json` | Modify | Add `settings` array and `themes` array |
| 2 | `GEMINI.md` | Modify | Add settings resolution, subagent prerequisite check, parallel execution gate |
| 3 | `skills/execution/SKILL.md` | Modify | Reference settings env vars for retry limits, respect validation strictness |
| 4 | `skills/delegation/SKILL.md` | Modify | Reference settings env vars for model/temperature/turns/timeout overrides |
| 5 | `skills/session-management/SKILL.md` | Modify | Reference MAESTRO_AUTO_ARCHIVE and MAESTRO_STATE_DIR settings |
| 6 | `skills/validation/SKILL.md` | Modify | Reference MAESTRO_VALIDATION_STRICTNESS setting |
| 7 | `docs/research/parallel-subagent-execution.md` | Create | Research spike: investigation, prototype, decision |
| 8 | `docs/research/parallel-prototype/` | Create | Prototype files for parallel execution testing |

## What Does NOT Change

- Agent definitions (`agents/*.md`) — settings override at delegation time, not in agent files
- Command definitions (`commands/*.toml`) — no command changes
- Templates (`templates/`) — no template changes
- Workflow phases (Design → Plan → Execute → Complete)
- Protocols (`protocols/agent-base-protocol.md`) — no protocol changes
