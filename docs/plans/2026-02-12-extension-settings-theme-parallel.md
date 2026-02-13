# Extension Settings, Theme & Parallel Execution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add consumer-configurable settings, a branded Maestro theme, and a parallel execution research spike to the Maestro extension.

**Architecture:** Leverage native Gemini CLI `settings` and `themes` arrays in `gemini-extension.json`. Create `GEMINI.md` orchestrator context file with settings resolution protocol, subagent prerequisite gate, and parallel execution gate. Update delegation, execution, session-management, and validation skills to reference configurable env vars.

**Tech Stack:** JSON (manifest), Markdown with YAML frontmatter (skills, orchestrator), TOML (commands — unchanged)

---

### Task 1: Add settings and themes to extension manifest

**Files:**
- Modify: `gemini-extension.json`

**Step 1: Update gemini-extension.json with settings and themes**

Replace the entire file with:

```json
{
  "name": "maestro",
  "version": "1.1.0",
  "description": "Multi-agent orchestration extension that assembles specialized dev teams for complex engineering tasks",
  "contextFileName": "GEMINI.md",
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
  ],
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

**Step 2: Verify JSON is valid**

Run: `python3 -c "import json; json.load(open('gemini-extension.json'))"`
Expected: No output (valid JSON)

**Step 3: Commit**

```bash
git add gemini-extension.json
git commit -m "feat: add extension settings and Maestro theme to manifest"
```

---

### Task 2: Create GEMINI.md orchestrator with settings resolution

**Files:**
- Create: `GEMINI.md`

**Step 1: Create the orchestrator context file**

This is the system prompt loaded when the extension activates. It establishes the TechLead persona and contains the settings resolution, startup checks, and parallel execution gate.

```markdown
---
name: TechLead
description: Maestro orchestrator — coordinates specialized subagent teams through structured 4-phase workflows
model: gemini-3-pro-preview
---

# Maestro TechLead Orchestrator

You are a **TechLead** — the orchestrator for Maestro, a multi-agent development team extension. You coordinate 12 specialized subagents through a structured 4-phase workflow: **Design → Plan → Execute → Complete**.

You never write code directly. You design, plan, delegate, and verify. Your subagents do the implementation work.

## Startup Checks

Before any orchestration command:

1. **Subagent Prerequisite**: Verify `experimental.enableAgents` is `true` in `~/.gemini/settings.json`. If not enabled, inform the user: "Maestro requires experimental subagents to be enabled. Would you like me to add `{ \"experimental\": { \"enableAgents\": true } }` to your `~/.gemini/settings.json`?" Do not proceed until subagents are confirmed enabled.

2. **Settings Resolution**: Read `MAESTRO_*` environment variables and resolve configuration:

| Setting | envVar | Default | Applies To |
|---------|--------|---------|------------|
| Default Model | `MAESTRO_DEFAULT_MODEL` | `gemini-3-pro-preview` | All agent delegation prompts |
| Writer Model | `MAESTRO_WRITER_MODEL` | `gemini-3-flash-preview` | technical-writer delegation only |
| Default Temperature | `MAESTRO_DEFAULT_TEMPERATURE` | `0.2` | All agent delegation prompts |
| Max Agent Turns | `MAESTRO_MAX_TURNS` | `25` | All agent delegation prompts |
| Agent Timeout | `MAESTRO_AGENT_TIMEOUT` | `10` (minutes) | All agent delegation prompts |
| Disabled Agents | `MAESTRO_DISABLED_AGENTS` | (none) | Phase assignment — excluded from plan |
| Max Retries | `MAESTRO_MAX_RETRIES` | `2` | Execution retry logic |
| Auto Archive | `MAESTRO_AUTO_ARCHIVE` | `true` | Session completion |
| Validation Strictness | `MAESTRO_VALIDATION_STRICTNESS` | `normal` | Post-phase validation |
| State Directory | `MAESTRO_STATE_DIR` | `.gemini` | Session state and plan paths |

When an env var is unset, use the default. When set, override the corresponding agent definition value in delegation prompts. Log resolved non-default settings at session start for transparency.

3. **Disabled Agent Check**: If `MAESTRO_DISABLED_AGENTS` is set, parse the comma-separated list and exclude those agents from the implementation planning agent selection. If a disabled agent is the only specialist for a required task domain, warn the user and suggest alternatives.

## Orchestration Phases

### Phase 1: Design Dialogue
Activate `design-dialogue` skill. Gather requirements through structured questions. Propose approaches. Produce an approved design document.

### Phase 2: Implementation Planning
Activate `implementation-planning` skill. Decompose the design into phases with agent assignments, dependency graphs, and validation criteria. Produce an approved implementation plan. Create session state via `session-management` skill.

### Phase 3: Execution
Activate `execution` skill and `delegation` skill. Execute phases sequentially (or in parallel when available), delegating to subagents with full context. Update session state after each phase. Handle errors via retry logic.

### Phase 4: Completion
Verify all deliverables. Run final validation. Archive session state. Present summary.

## Execution Mode

**Current mode: SEQUENTIAL**

All phases execute one at a time through the standard delegation flow. The delegation and execution skills describe parallel dispatch patterns (non-overlapping file ownership, batch completion gates), but the underlying Gemini CLI does not yet support concurrent subagent invocation (tracked in Gemini CLI Issue #17749).

When parallel execution becomes available (via validated workaround or native CLI support), update this section and activate parallel dispatch in the execution skill for independent phases at the same dependency depth.

## Delegation Override Protocol

When constructing delegation prompts, apply settings overrides in this order:

1. Start with the agent's base definition (from `agents/<name>.md` frontmatter)
2. Override `model` with `MAESTRO_DEFAULT_MODEL` (or `MAESTRO_WRITER_MODEL` for technical-writer) if set
3. Override `temperature` with `MAESTRO_DEFAULT_TEMPERATURE` if set
4. Override `max_turns` with `MAESTRO_MAX_TURNS` if set
5. Override `timeout_mins` with `MAESTRO_AGENT_TIMEOUT` if set
6. Agent-specific overrides always win over defaults (e.g., MAESTRO_WRITER_MODEL overrides MAESTRO_DEFAULT_MODEL for technical-writer)

## Session State Directory

Use the path from `MAESTRO_STATE_DIR` (default: `.gemini`) as the base directory for:
- Session state: `<state_dir>/state/active-session.md`
- Plans: `<state_dir>/plans/`
- Archives: `<state_dir>/state/archive/` and `<state_dir>/plans/archive/`

## Skills Reference

| Skill | Activation | Purpose |
|-------|-----------|---------|
| `design-dialogue` | Phase 1 | Requirements gathering, design proposals |
| `implementation-planning` | Phase 2 | Phase decomposition, agent assignment |
| `execution` | Phase 3 | Phase execution, error handling |
| `delegation` | Phase 3 | Subagent prompt construction |
| `session-management` | Phases 2-4 | Session CRUD, archival |
| `code-review` | On demand | Standalone code review |
| `validation` | Phase 3 | Build/lint/test pipeline |

## Agent Roster

| Agent | Domain | Tools | Model |
|-------|--------|-------|-------|
| architect | System design, architecture | Read-only | gemini-3-pro-preview |
| api-designer | API contracts, endpoints | Read-only | gemini-3-pro-preview |
| code-reviewer | Code quality assessment | Read-only | gemini-3-pro-preview |
| coder | Feature implementation | Full access | gemini-3-pro-preview |
| data-engineer | Schema, queries, ETL | Full access | gemini-3-pro-preview |
| debugger | Bug investigation | Read + shell | gemini-3-pro-preview |
| devops-engineer | CI/CD, infrastructure | Full access | gemini-3-pro-preview |
| performance-engineer | Performance analysis | Read + shell | gemini-3-pro-preview |
| refactor | Code restructuring | Read + write | gemini-3-pro-preview |
| security-engineer | Security assessment | Read + shell | gemini-3-pro-preview |
| technical-writer | Documentation | Read + write | gemini-3-flash-preview |
| tester | Test creation, TDD | Full access | gemini-3-pro-preview |
```

**Step 2: Verify the file references match the manifest**

Run: `python3 -c "import json; d=json.load(open('gemini-extension.json')); assert d['contextFileName'] == 'GEMINI.md'; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add GEMINI.md
git commit -m "feat: create TechLead orchestrator with settings resolution and startup checks"
```

---

### Task 3: Update delegation skill with settings override references

**Files:**
- Modify: `skills/delegation/SKILL.md`

**Step 1: Add settings override section after Protocol Injection**

Insert the following section after the existing "## Protocol Injection" section (after line 19, before "## Delegation Prompt Template"):

```markdown
## Settings Override Application

Before constructing any delegation prompt, resolve configurable parameters:

1. Read the agent's base definition frontmatter (`model`, `temperature`, `max_turns`, `timeout_mins`)
2. Apply environment variable overrides per the orchestrator's Delegation Override Protocol:
   - `MAESTRO_DEFAULT_MODEL` → overrides `model` for all agents
   - `MAESTRO_WRITER_MODEL` → overrides `model` for `technical-writer` only (takes precedence over `MAESTRO_DEFAULT_MODEL`)
   - `MAESTRO_DEFAULT_TEMPERATURE` → overrides `temperature` for all agents
   - `MAESTRO_MAX_TURNS` → overrides `max_turns` for all agents
   - `MAESTRO_AGENT_TIMEOUT` → overrides `timeout_mins` for all agents
3. Include resolved values in the delegation prompt metadata:
   ```
   Agent: [agent-name]
   Model: [resolved model]
   Temperature: [resolved temperature]
   Max Turns: [resolved max_turns]
   Timeout: [resolved timeout] minutes
   ```
4. If the agent appears in `MAESTRO_DISABLED_AGENTS`, do not construct a delegation prompt — report to the orchestrator that the agent is disabled

### Override Precedence

Agent-specific env var > General env var > Agent frontmatter default

Example: For `technical-writer`, if both `MAESTRO_DEFAULT_MODEL=gemini-2.5-pro` and `MAESTRO_WRITER_MODEL=gemini-3-flash-preview` are set, use `gemini-3-flash-preview`.
```

**Step 2: Commit**

```bash
git add skills/delegation/SKILL.md
git commit -m "feat: add settings override protocol to delegation skill"
```

---

### Task 4: Update execution skill with settings-aware retry and sequential gate

**Files:**
- Modify: `skills/execution/SKILL.md`

**Step 1: Update retry logic to reference MAESTRO_MAX_RETRIES**

In the "### Retry Logic" section (around line 57), replace the hardcoded retry references with settings-aware language. Replace:

```markdown
- **Maximum 2 retries** per phase before escalating to user
```

With:

```markdown
- **Maximum retries** per phase: controlled by `MAESTRO_MAX_RETRIES` (default: 2). Escalate to user after this limit is reached.
```

Replace:

```markdown
- **First failure**: Analyze the error, adjust delegation parameters (more context, narrower scope, different approach), retry automatically
- **Second failure**: Report to user and request guidance
- **Third failure**: Mark phase as `failed`, stop execution, escalate
```

With:

```markdown
- **First failure**: Analyze the error, adjust delegation parameters (more context, narrower scope, different approach), retry automatically
- **Subsequent failures up to limit**: Continue retrying with progressively adjusted parameters
- **Limit exceeded**: Mark phase as `failed`, stop execution, escalate to user
```

**Step 2: Update the error escalation format**

In the error escalation format (around line 85), replace:

```
Attempt: [N] of 2
```

With:

```
Attempt: [N] of [MAESTRO_MAX_RETRIES, default 2]
```

**Step 3: Add execution mode gate to Parallel Execution section**

At the beginning of the "### Parallel Execution" section (around line 26), add this preamble:

```markdown
**Execution Mode Gate**: Parallel execution requires Gemini CLI support for concurrent subagent invocation. Check the orchestrator's Execution Mode declaration in `GEMINI.md`. If the mode is `SEQUENTIAL`, execute all phases sequentially regardless of parallelization markers in the implementation plan. Record that parallel-eligible phases were executed sequentially in session state.

When the mode is `PARALLEL`:
```

**Step 4: Commit**

```bash
git add skills/execution/SKILL.md
git commit -m "feat: add settings-aware retries and sequential execution gate"
```

---

### Task 5: Update session-management skill for configurable state directory and auto-archive

**Files:**
- Modify: `skills/session-management/SKILL.md`

**Step 1: Add settings reference to Session Creation Protocol**

After "### File Location" (line 23), replace:

```markdown
`.gemini/state/active-session.md`
```

With:

```markdown
`<MAESTRO_STATE_DIR>/state/active-session.md`

Where `MAESTRO_STATE_DIR` defaults to `.gemini` if not set. All state paths in this skill use `<MAESTRO_STATE_DIR>` as their base directory.
```

**Step 2: Update Initialization Steps to use configurable path**

In "### Initialization Steps" (line 26), replace:

```markdown
1. Create `.gemini/state/` directory if it does not exist
```

With:

```markdown
1. Resolve state directory from `MAESTRO_STATE_DIR` (default: `.gemini`)
2. Create `<state_dir>/state/` directory if it does not exist
```

**Step 3: Update Archive Protocol for auto-archive setting**

In "## Archive Protocol" → "### When to Archive" (line 153), replace:

```markdown
Archive session state when:
- All phases are completed successfully
- User explicitly requests archival
- User starts a new orchestration (previous session must be archived first)
```

With:

```markdown
Archive session state when:
- All phases are completed successfully AND `MAESTRO_AUTO_ARCHIVE` is `true` (default)
- User explicitly requests archival (regardless of `MAESTRO_AUTO_ARCHIVE` setting)
- User starts a new orchestration (previous session must be archived first, regardless of setting)

When `MAESTRO_AUTO_ARCHIVE` is `false`, prompt the user after successful completion: "Session complete. Auto-archive is disabled. Would you like to archive this session?"
```

**Step 4: Update Archive Steps paths**

In "### Archive Steps" (line 162), replace all `.gemini/` path references with `<MAESTRO_STATE_DIR>/`:

```markdown
1. Create `<state_dir>/plans/archive/` directory if it does not exist
2. Create `<state_dir>/state/archive/` directory if it does not exist
3. Move design document from `<state_dir>/plans/` to `<state_dir>/plans/archive/`
4. Move implementation plan from `<state_dir>/plans/` to `<state_dir>/plans/archive/`
5. Update session state `status` to `completed`
6. Update `updated` timestamp
7. Move `active-session.md` from `<state_dir>/state/` to `<state_dir>/state/archive/<session-id>.md`
8. Confirm archival to user with summary of what was archived
```

**Step 5: Update Archive Verification paths**

Replace:

```markdown
- No `active-session.md` exists in `.gemini/state/`
- Archived files are readable at their new locations
- Plan files are no longer in active `.gemini/plans/` directory
```

With:

```markdown
- No `active-session.md` exists in `<state_dir>/state/`
- Archived files are readable at their new locations
- Plan files are no longer in active `<state_dir>/plans/` directory
```

**Step 6: Update Resume Protocol path**

In "### Resume Steps" (line 182), replace:

```markdown
1. **Read State**: Read `.gemini/state/active-session.md`
```

With:

```markdown
1. **Read State**: Read `<MAESTRO_STATE_DIR>/state/active-session.md` (resolve `MAESTRO_STATE_DIR`, default: `.gemini`)
```

**Step 7: Commit**

```bash
git add skills/session-management/SKILL.md
git commit -m "feat: add configurable state directory and auto-archive setting to session management"
```

---

### Task 6: Update validation skill for configurable strictness

**Files:**
- Modify: `skills/validation/SKILL.md`

**Step 1: Add validation strictness mode section**

After the "## Validation Result Interpretation" section (after line 97), insert:

```markdown
## Validation Strictness Modes

The validation strictness is controlled by `MAESTRO_VALIDATION_STRICTNESS` (default: `normal`).

| Mode | Behavior |
|------|----------|
| `strict` | Warnings are treated as blocking failures. All lint warnings, deprecation notices, and coverage decreases block phase progression. |
| `normal` | Only errors block. Warnings are recorded but do not prevent phase completion. This is the default behavior described in the Pass/Fail/Warn sections above. |
| `lenient` | Nothing blocks automatically. All failures and warnings are recorded in session state and reported to the user, but phase progression continues. The user reviews the accumulated report at completion. |

### Strictness Application

When evaluating each validation step:
1. Run the validation command and capture the exit code and output
2. Classify the result as Pass, Fail (Blocking), or Warn (Non-Blocking) using the standard criteria above
3. Apply the strictness mode:
   - `strict`: Fail (Blocking) AND Warn (Non-Blocking) both stop progression
   - `normal`: Only Fail (Blocking) stops progression
   - `lenient`: Record everything, stop nothing — append all results to session state and continue
4. If strictness causes a result to be downgraded from blocking to non-blocking, note this in the validation output: "Warning recorded but not blocking (lenient mode)"
```

**Step 2: Commit**

```bash
git add skills/validation/SKILL.md
git commit -m "feat: add configurable validation strictness modes"
```

---

### Task 7: Create parallel execution research spike document

**Files:**
- Create: `docs/research/parallel-subagent-execution.md`

**Step 1: Create the research directory**

Run: `mkdir -p docs/research`

**Step 2: Create the research spike document**

```markdown
# Parallel Subagent Execution Research Spike

**Created**: 2026-02-12
**Status**: Not Started
**Objective**: Determine if pseudo-parallel subagent execution is achievable before Gemini CLI ships native support
**Decision**: Pending (viable now | viable with caveats | wait for native support)

---

## Background

Gemini CLI currently executes subagents sequentially — each agent is a tool call, and tool calls run one at a time. Parallel execution is tracked in:
- [Issue #17749: Parallel Execution of Subagents](https://github.com/google-gemini/gemini-cli/issues/17749) — 0 of 4 subtasks complete
- [Epic #17120: Parallel Tool Calling](https://github.com/google-gemini/gemini-cli/issues/17120) — broader initiative

Maestro's delegation and execution skills describe parallel dispatch patterns but cannot execute them. This research investigates workarounds.

---

## Phase 1: Investigation

### Question 1: Does `/subagent:run` or equivalent mechanism exist?

**To investigate:**
- Check Gemini CLI docs for `/subagent:run` command
- Check if extensions can spawn named subagents programmatically
- Test: Can the orchestrator invoke a subagent by name outside the normal tool-call flow?

**Findings:** _(fill during investigation)_

### Question 2: Can `run_shell_command` spawn independent Gemini CLI processes?

**To investigate:**
- Test: `gemini --agent=coder "task prompt"` as a shell command
- Test: Can multiple such processes run concurrently?
- Test: Do spawned processes inherit the extension context and agent definitions?
- Test: How does authentication scope work across spawned processes?

**Findings:** _(fill during investigation)_

### Question 3: What are the constraints?

**To investigate:**
- Token limits: Do spawned processes share a quota?
- File locking: What happens when two processes write to different files simultaneously?
- State management: Can session state be updated safely from multiple processes?
- Process management: How does the orchestrator know when spawned processes complete?
- Error handling: How do errors from spawned processes propagate back?

**Findings:** _(fill during investigation)_

### Question 4: Are there other parallel patterns in the ecosystem?

**To investigate:**
- Search Gemini CLI issues and PRs for parallel execution workarounds
- Check if other extensions have solved this problem
- Look for patterns in the Gemini CLI source code that hint at future parallel APIs

**Findings:** _(fill during investigation)_

---

## Phase 2: Prototype

### Setup

- Create a minimal test project with two independent files
- Define two non-overlapping tasks (Agent A modifies file-a.txt, Agent B modifies file-b.txt)
- Use the simplest viable parallel mechanism discovered in Phase 1

### Test Cases

| # | Test | Expected | Actual |
|---|------|----------|--------|
| 1 | Both agents execute concurrently | Overlapping execution time | |
| 2 | Both agents produce correct output | File contents match expected | |
| 3 | No file conflicts | Each agent only touches its assigned file | |
| 4 | Orchestrator detects completion | Both completions are captured | |
| 5 | Error in one agent doesn't corrupt the other | Isolated failure | |
| 6 | State update after batch | Session state reflects both agents' work | |

### Prototype Files

Location: `docs/research/parallel-prototype/`

_(Create prototype files during investigation)_

---

## Phase 3: Decision

### Decision Matrix

| Criterion | Weight | Score (1-5) | Notes |
|-----------|--------|-------------|-------|
| Reliability | 30% | | |
| Performance gain | 25% | | |
| Implementation complexity | 20% | | |
| Maintenance burden | 15% | | |
| Future compatibility | 10% | | |
| **Weighted Total** | | | |

### Outcome

**Decision:** _(viable now | viable with caveats | wait for native support)_

**Rationale:** _(fill after prototype)_

### Integration Design (if viable)

#### Files to Modify

| File | Change |
|------|--------|
| `GEMINI.md` | Update Execution Mode from SEQUENTIAL to PARALLEL, add parallel dispatch decision logic |
| `skills/execution/SKILL.md` | Add concrete parallel dispatch mechanism, remove sequential-only gate |
| `skills/delegation/SKILL.md` | Add parallel invocation syntax for the discovered mechanism |

#### Parallel Dispatch Protocol (draft)

_(Fill with concrete protocol after prototype validation)_

#### Limitations and Guards

_(Document known limitations and safety guards)_
```

**Step 3: Commit**

```bash
git add docs/research/parallel-subagent-execution.md
git commit -m "docs: add parallel subagent execution research spike template"
```

---

### Task 8: Update README with settings and theme documentation

**Files:**
- Modify: `README.md`

**Step 1: Add Configuration section to README**

After the existing installation/usage section, add a "Configuration" section documenting the available settings and the Maestro theme. Reference the `gemini extensions config maestro` command and list all `MAESTRO_*` env vars with their defaults.

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add settings and theme documentation to README"
```

---

### Task 9: Local validation

**Step 1: Link the extension for local testing**

Run: `gemini extensions link maestro/`
Expected: Extension linked successfully

**Step 2: Verify settings appear**

Run: `gemini extensions config maestro`
Expected: All 10 settings listed with their descriptions

**Step 3: Verify theme appears**

Check Gemini CLI theme picker for "Maestro (maestro)" entry.

**Step 4: Verify GEMINI.md loads as context**

Run: `/maestro.status`
Expected: Orchestrator responds with status check (confirms GEMINI.md loaded as system prompt)

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address validation findings from local testing"
```
