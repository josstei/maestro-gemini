---
name: delegation
description: Agent delegation best practices for constructing effective subagent prompts with proper scoping
---

# Delegation Skill

Activate this skill when delegating work to subagents during orchestration execution. This skill provides the templates, rules, and patterns for constructing effective delegation prompts that produce consistent, high-quality results.

## Protocol Injection

Before constructing any delegation prompt, inject the shared agent base protocol:

### Injection Steps
1. Read `protocols/agent-base-protocol.md`
2. Prepend the Pre-Flight Protocol and Output Handoff Contract to the delegation prompt — these appear before the task-specific content
3. For each phase listed in the current phase's `blocked_by`, read `phases[].downstream_context` from session state and include it in the prompt
4. If any required `downstream_context` is missing, include an explicit placeholder noting the missing dependency context (never omit silently)

The injected protocol ensures every agent follows consistent pre-work procedures and output formatting regardless of their specialization.

### Context Chain Construction

Every delegation prompt must include a context chain that connects the current phase to prior work:

**Phase Context**: Include Downstream Context blocks from all completed phases that the current phase depends on (identified via `blocked_by` relationships in the implementation plan and sourced from session state `phases[].downstream_context`):
```
Context from completed phases:
- Phase [N] ([agent]): [Downstream Context summary]
  - Interfaces introduced: [list with file locations]
  - Patterns established: [list]
  - Integration points: [specific files, functions, endpoints]
  - Warnings: [list]
```

**Accumulated Patterns**: Naming conventions, directory organization patterns, and architectural decisions established by earlier phases. This ensures phase 5 does not contradict patterns set in phase 2.

**File Manifest**: Complete list of files created or modified in prior phases, so the agent knows what already exists and can import from or extend those files.

**Missing Context Fallback**: If a blocked dependency has no stored downstream context, include a visible placeholder entry in the prompt:
`- Phase [N] ([agent]): Downstream Context missing in session state — verify dependency output before implementation`

### Downstream Consumer Declaration

Every delegation prompt must declare who will consume the agent's output:
```
Your output will be consumed by: [downstream agent name(s)] who need [specific information they require]
```

This primes the agent to structure their Downstream Context section for maximum utility to the next agent in the chain.

## Delegation Prompt Template

Every delegation to a subagent must follow this structure:

```
Task: [One-line description of what to accomplish]

Progress: Phase [N] of [M]: [Phase Name]

Files to modify:
- /absolute/path/to/file1.ext: [Specific change required]
- /absolute/path/to/file2.ext: [Specific change required]

Files to create:
- /absolute/path/to/new-file.ext: [Purpose and key contents]

Deliverables:
- [Concrete output 1]
- [Concrete output 2]

Validation: [command to run after completion, e.g., "npm run lint && npm run test"]

Context:
[Relevant information from the design document or previous phases]

Do NOT:
- [Explicit exclusion 1]
- [Explicit exclusion 2]
- Modify any files not listed above
```

## Scope Boundary Rules

### Absolute Paths
Always provide absolute file paths. Never use relative paths or expect agents to search for files.

### Specific Deliverables
Define exactly what the agent should produce. Vague instructions like "implement the feature" lead to inconsistent results. Instead: "Create UserService class with createUser(), getUserById(), and deleteUser() methods implementing the IUserService interface."

### Validation Criteria
Include the exact command(s) to run after completion. The agent should run these and report results. Examples:
- `npm run lint && npm run test`
- `cargo build && cargo test`
- `go vet ./... && go test ./...`
- `python -m pytest tests/`

### Exclusions
Explicitly state what the agent must NOT do:
- Files it must not modify
- Dependencies it must not add
- Patterns it must not introduce
- Scope it must not exceed

## Agent Selection Guide

| Task Domain | Agent | Key Capability |
|-------------|-------|---------------|
| System architecture, component design | architect | Read-only analysis, architecture patterns |
| API contracts, endpoint design | api-designer | Read-only, REST/GraphQL expertise |
| Feature implementation, coding | coder | Full read/write/shell access |
| Code quality assessment | code-reviewer | Read-only, verified findings |
| Database schema, queries, ETL | data-engineer | Full read/write/shell access |
| Bug investigation, root cause | debugger | Read + shell for investigation |
| CI/CD, infrastructure, deployment | devops-engineer | Full read/write/shell access |
| Performance analysis, profiling | performance-engineer | Read + shell for profiling |
| Code restructuring, modernization | refactor | Read/write, no shell |
| Security assessment, vulnerability | security-engineer | Read + shell for scanning |
| Test creation, TDD, coverage | tester | Full read/write/shell access |
| Documentation, READMEs, guides | technical-writer | Read/write, no shell |

## Parallel Delegation

### Non-Overlapping File Ownership
When delegating to multiple agents in parallel, ensure no two agents are assigned the same file. Each file must have exactly one owner in a parallel batch.

### Single-Message Invocation
Invoke all parallel agents in a single message to ensure true concurrent execution. Do not invoke them sequentially.

### Batch Completion Gates
All agents in a parallel batch must complete before:
- The next batch of phases begins
- Shared/container files are updated
- Validation checkpoints run

### Conflict Prevention
- Assign non-overlapping file sets to each agent
- Reserve shared files (barrel exports, configuration, dependency manifests) for a single agent or a post-batch update step
- If two phases must modify the same file, they cannot run in parallel — execute them sequentially

## Validation Criteria Templates

### For Implementation Agents (coder, data-engineer, devops-engineer)
```
Validation: [build command] && [lint command] && [test command]
```

### For Refactoring Agents (refactor)
```
Validation: [build command] && [test command]
Verify: No behavior changes — all existing tests must still pass
```

### For Test Agents (tester)
```
Validation: [test command]
Verify: All new tests pass, report coverage metrics
```

### For Read-Only Agents (architect, api-designer, code-reviewer, debugger, performance-engineer, security-engineer)
```
Validation: N/A (read-only assessment)
Verify: Findings reference specific files and line numbers
```

### For Documentation Agents (technical-writer)
```
Validation: Verify all links resolve, code examples are syntactically valid
```
