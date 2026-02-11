# Agent & Skill Quality Improvements Design

**Created**: 2026-02-11
**Status**: Draft
**Scope**: Agents, Skills, Shared Protocols
**Constraint**: No workflow changes (Design → Plan → Execute → Complete remains unchanged)

---

## Problem Statement

Maestro's 12 agents and 7 skills have consistent structure but produce outputs with four recurring failure modes:

1. **Shallow outputs** — Agents give surface-level analysis instead of deep, actionable results
2. **Context loss** — Agents don't leverage project context, producing generic results
3. **Inconsistent handoffs** — Agent outputs don't structure information the way downstream agents need it
4. **Scope drift** — Agents go too broad or too narrow, doing work outside their lane or missing parts of their assignment

## Approach

### Selected: Layered Protocol Enhancement

Three protocol layers added to every agent, each addressing specific failure modes:

1. **Pre-Flight Protocol** — Mandatory context-mining phase before work begins (addresses context loss, shallow outputs)
2. **Domain-Specific Decision Frameworks** — Concrete decision trees, heuristics, and anti-patterns per agent (addresses shallow outputs)
3. **Output Handoff Contract** — Structured output format designed for downstream consumers (addresses inconsistent handoffs, scope drift)

### Standardization Strategy

Shared protocols live in a single file (`protocols/agent-base-protocol.md`) and are injected into every delegation prompt via the enhanced delegation skill. Agent files focus exclusively on domain-specific depth. This avoids repeating boilerplate across 12 agent files.

| Layer | Location | Content |
|-------|----------|---------|
| Shared protocols | `protocols/agent-base-protocol.md` | Pre-flight, scope verification, output handoff |
| Domain expertise | Each `agents/*.md` file | Decision frameworks, anti-patterns, downstream consumers |
| Injection mechanism | `skills/delegation/SKILL.md` | Injects base protocol into every delegation prompt |

---

## New File: `protocols/agent-base-protocol.md`

### Pre-Flight Protocol

Three mandatory steps executed in order before any agent begins work.

#### Step 1 — Anchor to Project Reality

Before producing any output, the agent must:

- Read every file listed in the delegation prompt (full read, not scan)
- Identify the language, framework, and runtime from project config files (`package.json`, `go.mod`, `Cargo.toml`, etc.)
- Detect existing patterns: naming conventions, directory structure, error handling style, dependency injection approach, test framework
- Record these observations as internal working context that shapes all subsequent output

#### Step 2 — Scope Verification

Before starting work, the agent must confirm:

- The files listed in the delegation prompt exist (if modifying) or their parent directories exist (if creating)
- No files outside the delegation prompt's explicit file list will be touched
- The task objective is achievable within the agent's tool permissions (if not, report immediately rather than attempting workarounds)
- The task doesn't duplicate or conflict with work described as completed in the progress context

#### Step 3 — Convention Extraction

The agent must identify and match:

- **Naming**: How are files, classes, functions, and variables named in this project? Match exactly.
- **Structure**: How is code organized? What goes where? Follow the existing grain.
- **Patterns**: What architectural patterns are already in use (repositories, services, controllers, etc.)? Extend them, don't introduce competing patterns.
- **Error handling**: How does this project handle errors? Use the same approach.

If any convention is ambiguous, default to the most common pattern observed in the codebase rather than introducing a new one.

### Output Handoff Contract

Every agent concludes with a Handoff Report containing two parts.

#### Part 1 — Task Report

- **Status**: `success` | `partial` | `failure`
- **Objective Achieved**: One sentence restating what was asked and whether it was fully met
- **Files Created**: Absolute paths with one-line purpose each
- **Files Modified**: Absolute paths with one-line summary of what changed and why
- **Files Deleted**: Absolute paths with rationale
- **Decisions Made**: Choices the agent made that weren't explicitly specified in the delegation prompt, with rationale for each
- **Validation**: `pass` | `fail` | `skipped` with command output
- **Errors**: List with type, description, and resolution status
- **Scope Deviations**: Anything the agent was asked to do but couldn't, or additional work discovered as necessary but not performed

#### Part 2 — Downstream Context

- **Key Interfaces Introduced**: Type signatures, file locations
- **Patterns Established**: New patterns introduced that downstream agents must follow
- **Integration Points**: Where and how downstream work should connect to this agent's output
- **Assumptions**: Anything this agent assumed that downstream agents should verify
- **Warnings**: Gotchas, edge cases, or fragile areas downstream agents should be aware of

#### Rules

- Part 2 is only populated when the agent's output feeds into subsequent phases
- Read-only agents (architect, code-reviewer, security-engineer, performance-engineer) populate Part 2 with findings structured as actionable items rather than integration points
- The orchestrator passes relevant Downstream Context from completed phases into subsequent delegation prompts, creating an information chain

---

## Agent Enhancements

Each agent file gains three new sections: **Decision Frameworks**, **Anti-Patterns**, and **Downstream Consumers**. Existing generic methodology text that overlaps with the shared Pre-Flight Protocol is removed.

### Architect

#### Decision Frameworks

- **Pattern Selection Matrix**: Concrete if/then rules for choosing architecture patterns based on project signals. Use Clean Architecture when: >3 external integrations, team size >2, expected lifespan >1 year. Use simpler layered architecture when: single integration, small scope, prototype. Use Hexagonal when: multiple I/O adapters (different databases, message queues, API formats). Use Event-Driven when: multiple independent subsystems that react to shared state changes.
- **Technology Evaluation Protocol**: Weighted scoring across 6 axes: maturity (community size, years in production), ecosystem (library availability, tooling), team familiarity (learning curve cost), performance characteristics (benchmarks relevant to use case), operational cost (hosting, licensing, monitoring), lock-in risk (portability, standards compliance). Agent must produce a scored comparison table, not just prose.
- **Scalability Heuristic**: Classify the system's scaling profile (read-heavy, write-heavy, compute-heavy, event-driven) and map to architectural implications. Read-heavy → caching layers, read replicas, CDN. Write-heavy → write-optimized storage, event sourcing, CQRS. Compute-heavy → worker pools, job queues, horizontal scaling. Event-driven → message brokers, eventual consistency, saga patterns.

#### Anti-Patterns

- Proposing microservices for a single-team project
- Recommending technology the project doesn't already use without explicit justification
- Over-abstracting when the design has fewer than 3 concrete implementations
- Producing component diagrams without specifying data flow direction and contract types

#### Downstream Consumers

`api-designer` (needs component boundaries and interface contracts), `coder` (needs directory structure and dependency injection patterns), `data-engineer` (needs data model relationships and storage decisions)

---

### API Designer

#### Decision Frameworks

- **Endpoint Design Checklist**: For each resource: identify the noun, determine CRUD operations needed, define nested vs flat resource relationships, choose between query parameters vs path parameters using the rule "path for identity, query for filtering."
- **Pagination Strategy Decision Tree**: Total records <100 → no pagination. <10K → offset-based. <1M → cursor-based. >1M → cursor-based with keyset. Always include: page size limits, default page size, total count behavior.
- **Error Taxonomy Construction**: Map domain errors to HTTP status codes: validation (400), authentication (401), authorization (403), not found (404), conflict (409), business rule violation (422). Every error gets a machine-readable code, human message, and optional detail object.
- **Versioning Strategy**: URL path versioning (`/v1/`) for breaking changes. Header versioning only when the project already uses it. Never mix strategies.

#### Anti-Patterns

- Designing endpoints that expose internal model structure directly
- Inconsistent pluralization across resource names
- Using POST for operations that are idempotent (should be PUT)
- Omitting rate limiting and pagination from the contract

#### Downstream Consumers

`coder` (needs endpoint contracts to implement), `tester` (needs request/response schemas for test cases), `technical-writer` (needs endpoint catalog for API docs)

---

### Code Reviewer

#### Decision Frameworks

- **Trace-Before-Report Protocol**: For every potential finding: 1) identify the suspicious code, 2) trace the execution path backward to find if a guard exists upstream, 3) trace forward to find if the issue is handled downstream, 4) only report if the issue is confirmed unhandled across the full path.
- **Severity Calibration Heuristic**: Critical = exploitable in production without special conditions. Major = causes incorrect behavior under realistic conditions. Minor = reduces maintainability but doesn't affect behavior. Suggestion = subjective improvement. When uncertain between two levels, choose the lower one.
- **Change-Type Review Depth**: New code → full review (architecture, patterns, security, naming). Refactored code → behavior-preservation focus. Deleted code → dependency verification. Config changes → environment-impact focus.

#### Anti-Patterns

- Reporting style preferences not established by the project's existing conventions
- Flagging missing error handling without verifying the error can actually occur
- Suggesting abstractions for code that has exactly one implementation
- Reporting issues in files outside the review scope

#### Downstream Consumers

`coder` (needs findings formatted as specific file:line fixes), `refactor` (needs structural improvement suggestions separated from bug fixes)

---

### Coder

#### Decision Frameworks

- **Implementation Order Protocol**: Always follow: 1) Types and interfaces first, 2) Dependencies before dependents, 3) Inner layers before outer layers (domain → application → infrastructure → presentation), 4) Exports before consumers. Never write a consumer before the thing it consumes exists.
- **Pattern Matching Protocol**: Before writing any new code, read at least 3 existing files of the same type in the project. Extract: constructor pattern, dependency injection style, error handling approach, return type conventions, naming patterns. New code must be indistinguishable in style from existing code. If no existing examples, look for the closest analog.
- **Interface-First Workflow**: For every new component: 1) Define the interface/type with full method signatures, 2) Identify all consumers and confirm the interface satisfies them, 3) Implement the concrete class, 4) Register with DI container if applicable.
- **Validation Self-Check**: Before reporting completion: 1) Re-read every file created or modified, 2) Verify all imports resolve to real files, 3) Verify all interface implementations satisfy their contracts, 4) Run the validation command, 5) If validation fails, fix and re-validate.

#### Anti-Patterns

- Writing implementation code before defining its interface
- Introducing a new pattern when the project already has an established one for the same concern
- Creating utility files or helper functions for single-use operations
- Leaving TODO or placeholder implementations in delivered code
- Importing from files outside the scope defined in the delegation prompt

#### Downstream Consumers

`tester` (needs clear public API surface and injectable dependencies for test doubles), `code-reviewer` (needs clean diffs that separate structural changes from behavioral ones)

---

### Data Engineer

#### Decision Frameworks

- **Normalization Decision Protocol**: Start at 3NF. Denormalize only when: a specific query requires joining >3 tables in a hot path, measured read performance is insufficient, the denormalized data has a clear owner for consistency. Document every denormalization decision with the query it serves and the trade-off accepted.
- **Index Design Methodology**: For each query pattern: 1) WHERE clause columns (leftmost in composite index), 2) ORDER BY columns next, 3) SELECT columns last for covering index. Evaluate: selectivity, write overhead, storage cost. Never create an index that duplicates a prefix of an existing composite index.
- **Migration Safety Protocol**: Every migration must: have a corresponding rollback, be idempotent, handle existing data (backfill strategy for new NOT NULL columns), include a pre-flight check, specify estimated execution time for large tables. Destructive migrations require a two-phase approach: deprecate first, remove in a subsequent release.
- **Connection and Transaction Heuristics**: Pool size = (2 x CPU cores) + disk spindles as starting point. Use transactions for multi-statement atomic writes and read-then-write races. Don't wrap single read-only queries in transactions. Set isolation to minimum required.

#### Anti-Patterns

- Writing migrations without rollback scripts
- Adding indexes without analyzing the query patterns they serve
- Using ORM-generated queries without reviewing the SQL they produce
- Storing computed values without a strategy for keeping them consistent with source data

#### Downstream Consumers

`coder` (needs schema types and repository interfaces), `devops-engineer` (needs migration execution requirements: estimated time, locks acquired, rollback plan)

---

### Debugger

#### Decision Frameworks

- **Hypothesis Ranking Protocol**: After forming 2-3 hypotheses, rank by: 1) How many symptoms does it explain? (more = higher), 2) How recent is the change in the suspected area? (more recent = higher), 3) How complex is the code path? (simpler paths fail in simpler ways, check first). Investigate in rank order. Abandon a hypothesis after 2 pieces of contradicting evidence.
- **Bisection Strategy**: Identify last known good state and first known bad state. Systematically narrow the gap. Use `git log` to find recent changes to suspected files. Use binary search on commits if reproducing is cheap.
- **Evidence Classification**: Every piece of evidence is tagged as `confirms` (supports hypothesis), `contradicts` (weakens hypothesis), or `neutral` (no signal). A root cause requires minimum 3 confirming pieces and 0 contradicting pieces.
- **Log Analysis Protocol**: Search for the error message verbatim first. Widen to surrounding time window (30s before, 10s after). Correlate across log sources. Identify the earliest anomaly — that's closer to root cause than the reported error.

#### Anti-Patterns

- Proposing a fix before confirming root cause with evidence
- Investigating only the file where the error surfaces instead of tracing upstream
- Treating correlation as causation
- Stopping investigation after first plausible explanation without verifying it explains all symptoms

#### Downstream Consumers

`coder` (needs root cause location with exact file:line and specific fix recommendation), `tester` (needs reproduction steps for regression test creation)

---

### DevOps Engineer

#### Decision Frameworks

- **Pipeline Stage Ordering Protocol**: Every CI/CD pipeline follows: 1) Install dependencies (cached), 2) Lint/format check (fast fail), 3) Type check/compile, 4) Unit tests, 5) Build artifacts, 6) Integration tests, 7) Security scan, 8) Deploy to staging, 9) Smoke tests, 10) Deploy to production. Never run slow stages before fast ones. Never deploy without at least stages 1-5.
- **Container Optimization Decision Tree**: Base image: need full OS → `debian-slim`, language runtime only → official slim image, static binary → `scratch` or `distroless`. Always: multi-stage builds, non-root user, explicit COPY, `.dockerignore`.
- **Secret Management Classification**: Critical (API keys, DB credentials, signing keys) → external vault, injected at runtime. High (service tokens, webhook secrets) → CI/CD secret storage, injected at deploy. Low (public API keys, non-sensitive config) → environment variables. Never in code, images, git history, or logs.
- **Rollback Readiness Checklist**: Database migrations backward-compatible, previous container image retained, rollback procedure documented and tested, feature flags gate new behavior, health checks detect failures within 30 seconds.

#### Anti-Patterns

- Deploying without health check endpoints
- Using `latest` tags for base images or dependencies in production
- Running CI steps dependent on external services without timeout and retry
- Storing secrets visible in build logs
- Pipelines >15 minutes without parallelizing independent stages

#### Downstream Consumers

`coder` (needs environment variable contracts and configuration schemas), `security-engineer` (needs infrastructure configuration for review), `tester` (needs CI pipeline configuration for test stage integration)

---

### Performance Engineer

#### Decision Frameworks

- **Bottleneck Classification Tree**: Measure first, then classify: CPU-bound (high CPU, low I/O wait) → optimize algorithms. I/O-bound (low CPU, high I/O wait) → optimize queries, add caching, batch. Memory-bound (high allocation, GC pressure) → reduce allocations, pool objects. Concurrency-bound (low utilization, high contention) → reduce lock scope, partition state.
- **Optimization Priority Matrix**: Score on two axes: impact (measured improvement) and effort (lines changed, regression risk). High impact + low effort = do first. High impact + high effort = plan carefully. Low impact + low effort = optional. Low impact + high effort = skip.
- **Caching Decision Framework**: Cache when: data read >10x more than written, staleness tolerable, invalidation deterministic. Don't cache when: data changes per-request, correctness requires real-time, cache key space unbounded.
- **Measurement Protocol**: Every claim requires: what was measured, how (tool, command), baseline value, current/proposed value, sample size or duration. "Faster" without numbers is not a finding.

#### Anti-Patterns

- Recommending optimizations without baseline measurements
- Suggesting micro-optimizations before algorithmic improvements
- Proposing caching without addressing invalidation
- Optimizing code paths that profiling shows are not hot paths

#### Downstream Consumers

`coder` (needs specific code locations with before/after optimization patterns), `architect` (needs systemic findings suggesting architectural changes)

---

### Refactor

#### Decision Frameworks

- **Behavior Preservation Verification**: At every step: 1) Identify observable behavior before change (inputs → outputs, side effects, error conditions), 2) Apply structural change, 3) Verify same inputs produce same outputs. If unable to verify, stop and report.
- **Refactoring Sequence Protocol**: Apply in order: renames (lowest risk) → extract method/class → move method/field → introduce interface/polymorphism → inline unnecessary abstractions. Never jump to complex refactorings before completing simpler ones.
- **Smell-to-Refactoring Map**: Long method (>30 lines) → extract method. God class (>5 responsibilities) → extract class. Feature envy → move method. Shotgun surgery → extract and centralize. Primitive obsession → introduce value objects. Each smell has one primary refactoring.
- **Scope Boundary Enforcement**: Only refactor files explicitly listed. If proper refactoring requires files outside scope, report the dependency in handoff rather than expanding scope.

#### Anti-Patterns

- Changing behavior while refactoring
- Refactoring code without test coverage without flagging the risk
- Introducing new abstractions during simplification refactoring
- Applying patterns dogmatically when existing code is clearer

#### Downstream Consumers

`tester` (needs to know which public interfaces changed shape), `coder` (needs to know new patterns established for consistency)

---

### Security Engineer

#### Decision Frameworks

- **Attack Surface Mapping Protocol**: Map all entry points before reviewing code: HTTP endpoints (method, auth, inputs), message queue consumers, scheduled jobs, file upload handlers, CLI commands. Prioritize by exposure: public unauthenticated > public authenticated > internal > admin-only.
- **Data Flow Taint Tracking**: For each entry point, trace user-controlled input through every transformation to sinks (database, filesystem, shell, HTTP response, logs). At each step: validated? sanitized? encoded for output context? A finding exists only when tainted data reaches a sink without appropriate sanitization.
- **Vulnerability Verification Protocol**: For every potential vulnerability: 1) identify exact triggering input, 2) trace to vulnerable sink, 3) confirm no sanitization in path, 4) assess exploitability (can external attacker reach this?), 5) classify severity on actual impact, not theoretical.
- **Dependency Audit Methodology**: Check lock files for known CVEs. For each CVE: determine if the vulnerable code path is reachable from this project's usage. Unreachable CVEs are informational, not actionable.

#### Anti-Patterns

- Reporting theoretical vulnerabilities without demonstrating reachable attack path
- Flagging CVEs without checking if the vulnerable code path is used
- Recommending security controls that already exist
- Treating all findings as Critical without exploitability assessment

#### Downstream Consumers

`coder` (needs specific remediation code patterns per vulnerability), `devops-engineer` (needs infrastructure-level findings: missing headers, TLS config, secret exposure)

---

### Technical Writer

#### Decision Frameworks

- **Audience Detection Protocol**: Determine audience from delegation prompt or file type. README → first-time user (zero context, "clone to running in 5 minutes"). API docs → integrating developer (technical, "find endpoint in 30 seconds"). Architecture docs → team member (project context, "understand why decisions were made"). JSDoc → contributing developer (code context, "understand contract without reading body").
- **Documentation Structure Decision Tree**: Reference material → alphabetical/grouped, table format, type + default + description + example. Tutorial → sequential numbered steps, one action and one verification per step. Architecture → top-down, diagrams before prose, decision rationale over description.
- **Example Quality Protocol**: Every code example must: be syntactically valid and runnable, use realistic values (not foo/bar), show common use case first and edge cases second, include expected output. If setup required, show it.
- **Staleness Prevention**: Every doc declares its source of truth with a comment: `<!-- Source: path/to/file.ts -->`. Enables future verification against code.

#### Anti-Patterns

- Describing code line-by-line instead of why it exists and how to use it
- Including setup instructions assuming specific OS without noting the assumption
- Using screenshots for content representable as text
- Documenting internal implementation details consumers don't need

#### Downstream Consumers

`code-reviewer` (needs documentation coverage as review dimension), orchestrator (needs docs verifiable against source code)

---

### Tester

#### Decision Frameworks

- **Test Strategy Selection**: Unit tests for: pure functions, business logic, data transformations, edge cases. Integration tests for: database queries, API endpoints, service interactions, middleware chains. E2E tests for: critical user journeys only. Never E2E test what a unit test can cover.
- **Edge Case Discovery Protocol**: For every function, systematically check: empty inputs (null, undefined, empty string, empty array, 0), boundary values (min, max, min-1, max+1), type boundaries (MAX_INT, negatives, float precision), invalid states (expired tokens, closed connections), concurrent access (if applicable).
- **Test Isolation Checklist**: Each test must: create its own data, clean up side effects, mock external services at boundaries, be runnable in any order. If a test fails alone but passes in suite (or vice versa), it has an isolation defect.
- **Mock Boundary Rule**: Mock at system boundaries only: external HTTP APIs, databases, file systems, clocks, random generators. Never mock internal classes. If you need to mock an internal dependency, the function has a design problem — report it.

#### Anti-Patterns

- Testing implementation details (checking private method calls vs verifying outputs)
- Snapshot tests for dynamic content
- Test names describing code instead of behavior
- Sharing mutable state between tests via module-level variables

#### Downstream Consumers

`code-reviewer` (needs tests readable as behavioral specifications), `coder` (needs clear failure messages indicating expected vs actual)

---

## Skill Enhancements

### Delegation Skill (`skills/delegation/SKILL.md`)

#### New: Protocol Injection

Add a mandatory first step to prompt construction:

1. Read `protocols/agent-base-protocol.md`
2. Prepend the Pre-Flight Protocol and Output Handoff Contract to every delegation prompt
3. Include relevant Downstream Context from previously completed phases

#### New: Context Chain Construction

Add structured context chain to delegation prompts:

- **Phase Context**: Downstream Context blocks from all completed phases that the current phase depends on (from `blocked_by` relationships)
- **Accumulated Patterns**: Naming conventions, directory patterns, architectural decisions from earlier phases
- **File Manifest**: Complete list of files created/modified in prior phases

#### Enhanced: Prompt Template Addition

```
Context from completed phases:
- Phase [N] ([agent]): [Downstream Context summary]
  - Interfaces introduced: [list]
  - Patterns established: [list]
  - Integration points: [list]
  - Warnings: [list]

Your output will be consumed by: [downstream agent(s) and what they need]
```

### Validation Skill (`skills/validation/SKILL.md`)

#### New: Incremental Validation Mode

- Phase created new files only → lint + type check on those files only
- Phase modified existing files → full test suite
- Phase touched configuration → full pipeline

#### New: Validation Failure Diagnosis

When validation fails:

1. Categorize: type error, lint error, test failure, build error
2. Identify which files from current phase are involved
3. Determine if failure is from current phase or pre-existing
4. Format for orchestrator: fixable by same agent (re-delegate with error context) vs requires human input (escalate)

### Code Review Skill (`skills/code-review/SKILL.md`)

#### New: Review Scope Calibration

- New files → full review (architecture, patterns, security, naming)
- Modified files → diff focus (behavior changes, regression risk, contract compliance)
- Deleted files → dependency verification
- Configuration changes → environment impact assessment

#### New: Finding Deduplication Protocol

When reviewing multiple files, deduplicate findings sharing the same root cause. Same pattern violation in 5 files → one systemic finding with affected locations list, not 5 separate findings.

---

## File Inventory

| # | File | Action | Purpose |
|---|------|--------|---------|
| 1 | `protocols/agent-base-protocol.md` | Create | Shared pre-flight protocol and output handoff contract |
| 2 | `agents/architect.md` | Modify | Add decision frameworks, anti-patterns, downstream consumers |
| 3 | `agents/api-designer.md` | Modify | Add decision frameworks, anti-patterns, downstream consumers |
| 4 | `agents/code-reviewer.md` | Modify | Add decision frameworks, anti-patterns, downstream consumers |
| 5 | `agents/coder.md` | Modify | Add decision frameworks, anti-patterns, downstream consumers |
| 6 | `agents/data-engineer.md` | Modify | Add decision frameworks, anti-patterns, downstream consumers |
| 7 | `agents/debugger.md` | Modify | Add decision frameworks, anti-patterns, downstream consumers |
| 8 | `agents/devops-engineer.md` | Modify | Add decision frameworks, anti-patterns, downstream consumers |
| 9 | `agents/performance-engineer.md` | Modify | Add decision frameworks, anti-patterns, downstream consumers |
| 10 | `agents/refactor.md` | Modify | Add decision frameworks, anti-patterns, downstream consumers |
| 11 | `agents/security-engineer.md` | Modify | Add decision frameworks, anti-patterns, downstream consumers |
| 12 | `agents/technical-writer.md` | Modify | Add decision frameworks, anti-patterns, downstream consumers |
| 13 | `agents/tester.md` | Modify | Add decision frameworks, anti-patterns, downstream consumers |
| 14 | `skills/delegation/SKILL.md` | Modify | Add protocol injection, context chain, enhanced template |
| 15 | `skills/validation/SKILL.md` | Modify | Add incremental validation, failure diagnosis |
| 16 | `skills/code-review/SKILL.md` | Modify | Add scope calibration, finding deduplication |

## What Does NOT Change

- Workflow phases (Design → Plan → Execute → Complete)
- Commands (TOML files)
- Templates (structure)
- Agent YAML frontmatter (tools, model, temperature, max_turns, timeout)
- Session management, design dialogue, implementation planning, execution skills
