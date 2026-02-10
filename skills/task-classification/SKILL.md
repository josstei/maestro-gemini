---
name: task-classification
description: Classifies task complexity and recommends an appropriate workflow tier (T1/T2/T3)
---

# Task Classification Skill

Activate this skill when `/maestro.orchestrate` is invoked, before entering any workflow phase. This skill evaluates the task against a three-dimension rubric and recommends a workflow tier.

## Classification Protocol

### When to Activate
- Called automatically by `/maestro.orchestrate` before any phase begins
- NOT called by `/maestro.quick` (bypasses classification)

### Input
The user's task description as provided to `/maestro.orchestrate`.

### Steps

1. Read the task description provided by the user
2. Optionally scan the project structure for scope signals (directory layout, number of modules, file count in affected areas)
3. Evaluate each dimension independently using the rubric below
4. Apply the "highest dimension wins" rule to determine the recommended tier
5. Present the classification to the user using the output template
6. Wait for user confirmation or override
7. Return the confirmed tier to the orchestration flow

## Classification Rubric

Evaluate each dimension independently. The highest-scoring dimension determines the recommended tier.

### Dimension 1: Scope

How many files and modules does the task touch?

| Signal | Tier |
|--------|------|
| Single file or tightly co-located files (e.g., component + its test) | T1 |
| Multiple files within the same module or domain boundary | T2 |
| Cross-module, cross-domain, or touches shared infrastructure | T3 |

**Scope indicators to look for:**
- Task mentions a single file or function → T1
- Task mentions a module, feature, or bounded area → T2
- Task mentions "system", "architecture", "migrate", or multiple unrelated areas → T3

### Dimension 2: Complexity

What level of reasoning does the task require?

| Signal | Tier |
|--------|------|
| Mechanical change: rename, fix typo, add test, small bug fix, add logging, update config | T1 |
| Moderate reasoning: new endpoint, refactor a module, add a feature with clear spec, update a workflow | T2 |
| Architectural reasoning: new system, design tradeoffs, technology selection, cross-cutting concerns, major refactor | T3 |

**Complexity indicators to look for:**
- Task can be expressed as a single action verb + target → T1
- Task requires understanding relationships between components → T2
- Task requires making design decisions or evaluating tradeoffs → T3

### Dimension 3: Agent Breadth

How many specialist agents are needed?

| Signal | Tier |
|--------|------|
| Single agent can handle the entire task | T1 |
| 2-4 agents needed across the task | T2 |
| 5+ agents or multiple cross-cutting specializations | T3 |

**Agent breadth indicators:**
- Task maps cleanly to one agent's domain (just coding, just testing, just debugging) → T1
- Task spans 2-3 domains (code + test, refactor + review) → T2
- Task spans many domains (design + code + test + security + devops) → T3

### Highest Dimension Wins

The recommended tier is the maximum across all three dimensions. This is a conservative strategy — it is better to over-prepare than under-prepare.

Examples:
- Scope=T1, Complexity=T1, Breadth=T1 → **T1**
- Scope=T2, Complexity=T1, Breadth=T1 → **T2**
- Scope=T1, Complexity=T3, Breadth=T1 → **T3**
- Scope=T2, Complexity=T2, Breadth=T2 → **T2**

## Output Template

Present the classification to the user in this format:

```
Task Classification: T[N] — [Tier Name]

Reasoning:
- Scope: [assessment] → T[X]
- Complexity: [assessment] → T[X]
- Agent breadth: [assessment] → T[X]
- Highest dimension: T[N]

Recommended workflow: [brief description of what will happen next]

Proceed with T[N], or would you prefer a different tier?
```

### Tier Workflow Descriptions

Use these descriptions in the "Recommended workflow" line:

- **T1 Quick**: Single agent delegation with minimal session tracking. No design or planning phases.
- **T2 Standard**: Lightweight implementation plan with 2-4 agents. No design dialogue. Plan requires your approval before execution.
- **T3 Full**: Full design dialogue, detailed implementation plan, multi-agent execution, and formal completion. The complete Maestro workflow.

## Override Handling

The user may respond with:
- **Acceptance**: Any affirmative response ("yes", "proceed", "go ahead", "looks right") → proceed with the recommended tier
- **Override**: The user specifies a different tier ("use T1", "make it T3", "just do quick") → accept the override without pushback
- **Clarification**: The user asks a question or provides more context → re-evaluate the classification with the new information and present an updated recommendation

Accept all overrides without pushback. The user knows their intent better than the rubric.

## Output Contract

After confirmation, the classification result is:

```yaml
classification:
  tier: "T1" | "T2" | "T3"
  scope: "T1" | "T2" | "T3"
  complexity: "T1" | "T2" | "T3"
  agent_breadth: "T1" | "T2" | "T3"
  reasoning: "<one-line summary>"
  confirmed: true
```

This result is used by the orchestration flow to determine which workflow to activate.
