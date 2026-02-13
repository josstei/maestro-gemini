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

### Gate Checklist

Do not begin prototyping until all Phase 1 questions are answered:

- [ ] Question 1: Parallel mechanism identified (or ruled out)
- [ ] Question 2: Shell command spawn viability confirmed (or ruled out)
- [ ] Question 3: Constraints documented
- [ ] Question 4: Ecosystem patterns reviewed

If no viable mechanism was identified in Phase 1, skip directly to Phase 3 with a "wait for native support" decision.

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
