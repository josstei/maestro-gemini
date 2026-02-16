# Documentation Audience & Quality Improvements Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all documentation issues identified by 5 parallel code review agents — audience targeting, factual inaccuracies, missing contributor guides, and terminology inconsistencies across 5 docs.

**Architecture:** Pure documentation edits across 5 Markdown files. No code changes. Each task targets a single file with specific edits. Tasks are grouped by document and ordered by priority (factual fixes first, audience fixes second, new content third).

**Tech Stack:** Markdown, YAML frontmatter

---

### Task 1: Fix Factual Inaccuracies in state-management-and-scripts.md

**Files:**
- Modify: `docs/architecture/state-management-and-scripts.md:734-736`

**Step 1: Fix protocol filename reference**

On line 734, change `base-protocol.md` to `agent-base-protocol.md`. The current text reads:

```
6. **Base Protocol Injection**: Behavioral contract (from `protocols/base-protocol.md`)
```

Change to:

```
6. **Protocol Injection**: Behavioral contracts (from `protocols/agent-base-protocol.md` and `protocols/filesystem-safety-protocol.md`)
```

**Step 2: Verify the fix**

Read line 734 to confirm the edit was applied correctly.

**Step 3: Commit**

```bash
git add docs/architecture/state-management-and-scripts.md
git commit -m "fix(docs): correct protocol filename reference in state-management doc"
```

---

### Task 2: Fix Tool Name in system-overview.md

**Files:**
- Modify: `docs/architecture/system-overview.md:650,664`

**Step 1: Replace incorrect tool name**

On lines 650 and 664, the tool is listed as `search_files`. The correct name (per agent definitions) is `search_file_content`. Replace all occurrences of `search_files` in this file with `search_file_content`.

**Step 2: Verify the fix**

Grep the file for any remaining `search_files` references.

**Step 3: Commit**

```bash
git add docs/architecture/system-overview.md
git commit -m "fix(docs): correct tool name search_files to search_file_content"
```

---

### Task 3: Fix USAGE.md Terminology and Duplicate

**Files:**
- Modify: `USAGE.md:45-46,68,172-173,841,915`

**Step 1: Replace "YOLO mode" with "autonomous mode"**

Find every instance of "YOLO mode" or "YOLO" (when referring to the autonomous execution mode) in USAGE.md and replace:
- "YOLO mode" → "autonomous mode"
- Keep the `--yolo` flag references as-is (that's the actual CLI flag name)

Specifically:
- Line 45: `Subagents operate in YOLO mode` → `Subagents operate in autonomous mode`
- Line 173: `Agents operate in autonomous mode (\`--yolo\`)` — this already explains the flag, keep as-is but ensure consistency
- Line 915: `Faster but fully autonomous (YOLO mode).` → `Faster but fully autonomous (agents auto-approve all tool calls).`

**Step 2: Remove duplicate sentence**

Line 841 is a duplicate of line 804:
```
This section walks through the Design → Plan → Execute → Complete lifecycle from a user perspective.
```

Delete line 841 (the duplicate that appears after the mermaid diagram).

**Step 3: Clarify installation link command**

Line 68 currently reads:
```bash
gemini extensions link maestro/
```

Change to:
```bash
gemini extensions link .
```

And update the surrounding text on line 71 from:
```
The `link` command creates a symlink from your Gemini CLI extensions directory to the cloned repository.
```
To:
```
The `link` command creates a symlink from your Gemini CLI extensions directory to the current directory. Run this from the cloned repository root.
```

**Step 4: Verify changes**

Grep for "YOLO mode" to confirm none remain. Grep for the duplicate sentence to confirm only one instance exists.

**Step 5: Commit**

```bash
git add USAGE.md
git commit -m "fix(docs): standardize terminology and remove duplicate in USAGE.md"
```

---

### Task 4: Rename Misleading Section in system-overview.md

**Files:**
- Modify: `docs/architecture/system-overview.md:827`

**Step 1: Rename section header**

Line 827 currently reads:
```
### Debugging Failed Tests
```

Change to:
```
### Troubleshooting Common Issues
```

**Step 2: Commit**

```bash
git add docs/architecture/system-overview.md
git commit -m "fix(docs): rename misleading section header in system-overview"
```

---

### Task 5: Clarify Skill Activation Mechanism in skills-and-commands.md

**Files:**
- Modify: `docs/architecture/skills-and-commands.md:38`

**Step 1: Rewrite activation mechanism description**

Line 38 currently reads:
```
Skills are activated via the `activate_skill` directive embedded in command prompts or triggered dynamically by the orchestrator based on workflow phase. When a skill is activated, the Gemini CLI injects its content into the conversation context for the duration of the operation.
```

Change to:
```
Skills are activated by referencing them in command prompt text (e.g., "Activate the design-dialogue skill to guide the conversation."). When the Gemini CLI processes this text, it detects skill references and injects the corresponding `SKILL.md` content into the conversation context for the duration of the operation. This is a text-based convention within the prompt, not a formal API or function call.
```

**Step 2: Commit**

```bash
git add docs/architecture/skills-and-commands.md
git commit -m "fix(docs): clarify skill activation is text convention not API"
```

---

### Task 6: Add Context for External Readers in system-overview.md

**Files:**
- Modify: `docs/architecture/system-overview.md:104,806,808`

**Step 1: Clarify "activation directives"**

Line 104 currently reads:
```
Commands can reference skills via activation directives in their prompt templates, causing those skill files to be injected into the context dynamically.
```

Change to:
```
Commands can reference skills via activation directives in their prompt templates (e.g., `Activate the design-dialogue skill to guide the conversation.`), causing those skill files to be injected into the context dynamically.
```

**Step 2: Clarify restart instruction**

Line 808-809: After "Restart CLI" on line 809, change:
```
2. **Restart CLI**: Close and reopen Gemini CLI to load the extension
```

To:
```
2. **Restart Gemini CLI**: Close and reopen the Gemini CLI terminal session to reload extension changes
```

**Step 3: Commit**

```bash
git add docs/architecture/system-overview.md
git commit -m "docs: add context for external readers in system-overview"
```

---

### Task 7: Add Introductory Context to agent-system.md

**Files:**
- Modify: `docs/architecture/agent-system.md:1-3`

**Step 1: Add introductory paragraph with audience and prerequisites**

Replace lines 1-3:
```
# Agent System Architecture

The Maestro agent system provides 12 specialized AI personas that execute implementation phases under TechLead orchestration. This document specifies how agents are defined, configured, deployed, and constrained.
```

With:
```
# Agent System Architecture

The Maestro agent system provides 12 specialized AI personas that execute implementation phases under TechLead orchestration (defined in `GEMINI.md`). The TechLead is the central orchestrator agent that coordinates all subagents — it designs, plans, delegates, and verifies but never writes code directly.

This document covers agent definition format, tool permissions, delegation mechanics, model configuration, and protocol injection. It is intended for contributors who want to understand, modify, or extend the agent system.

**Prerequisites:** Familiarity with the [System Overview](system-overview.md) and basic understanding of YAML frontmatter and Markdown.
```

**Step 2: Commit**

```bash
git add docs/architecture/agent-system.md
git commit -m "docs: add introductory context and prerequisites to agent-system"
```

---

### Task 8: Add Glossary to agent-system.md

**Files:**
- Modify: `docs/architecture/agent-system.md` (insert after intro, before "## Agent Architecture")

**Step 1: Add glossary section**

Insert after the intro paragraph (after the prerequisites line) and before `## Agent Architecture`:

```markdown
## Key Concepts

| Term | Definition |
|------|-----------|
| **Agent** | AI persona with specialized domain expertise, defined as a Markdown file with YAML frontmatter in `agents/` |
| **TechLead / Orchestrator** | The central coordinating agent defined in `GEMINI.md` that delegates work to specialized agents |
| **Delegation Prompt** | Complete instructions sent to an agent, including protocols, context chain, task, deliverables, and constraints |
| **Tool Permission Tier** | Access level granted to an agent (read-only, read+shell, read+write, full access) |
| **Downstream Context** | Structured information produced by one agent (Part 2 of the Handoff Report) for use by subsequent agents |
| **Task Report** | Structured output every agent produces upon completion (Part 1 of the Handoff Report) |
| **Context Chain** | Accumulated downstream context from all completed phases, injected into each new delegation prompt |
| **Protocol** | Shared behavioral contract (Markdown file in `protocols/`) injected into every delegation prompt |
| **Parallel Dispatch** | Concurrent execution of independent agents via `scripts/parallel-dispatch.sh` as separate CLI processes |
```

**Step 2: Commit**

```bash
git add docs/architecture/agent-system.md
git commit -m "docs: add glossary of key concepts to agent-system"
```

---

### Task 9: Add "Creating a New Agent" Guide to agent-system.md

**Files:**
- Modify: `docs/architecture/agent-system.md` (insert before `## Best Practices` section, which starts around line 757)

**Step 1: Add contributor guide section**

Insert before `## Best Practices`:

```markdown
## Creating a New Agent

Follow these steps to add a new specialized agent to Maestro.

### 1. Create the Agent Definition File

Create `agents/<agent-name>.md` using kebab-case naming. The filename (without extension) must match the `name` field in frontmatter.

```yaml
---
name: agent-name
description: "One-line summary of specialization"
kind: local
tools:
  - read_file
  - glob
  - search_file_content
model: gemini-3-pro-preview
temperature: 0.2
max_turns: 15
timeout_mins: 5
---
```

### 2. Choose Tool Permissions

Select the minimum tools required based on the agent's role:

| If the agent needs to... | Include these tools |
|--------------------------|-------------------|
| Analyze code (read-only) | `read_file`, `glob`, `search_file_content` |
| Run diagnostic commands | Add `run_shell_command` |
| Modify files | Add `write_file`, `replace` |
| Full implementation | All tools |

### 3. Write the Agent Persona

The Markdown body below the frontmatter defines the agent's behavior. Include:

- **Role and Expertise**: What the agent specializes in
- **Methodology**: Step-by-step approach the agent follows
- **Decision Frameworks**: Criteria for making choices (e.g., pattern selection, technology evaluation)
- **Output Contract**: Exact format of the agent's deliverables
- **Anti-Patterns**: Common mistakes the agent must avoid
- **Downstream Consumers**: Which agents will use this agent's output

### 4. Register with the Orchestrator

1. Add the agent to the roster table in `GEMINI.md`
2. Add agent assignment criteria in `skills/implementation-planning/SKILL.md`

### 5. Test the Agent

Link the extension and test via Gemini CLI:

```bash
gemini extensions link .
# Restart Gemini CLI, then test delegation:
gemini delegate_to_agent agent=agent-name prompt="Test task description"
```

### 6. Validate Permissions

Run the permission validation script:

```bash
./scripts/validate-agent-permissions.sh
```

This confirms the new agent's tool permissions conform to the least-privilege model.
```

**Step 2: Commit**

```bash
git add docs/architecture/agent-system.md
git commit -m "docs: add contributor guide for creating new agents"
```

---

### Task 10: Add "Creating Skills and Commands" Guide to skills-and-commands.md

**Files:**
- Modify: `docs/architecture/skills-and-commands.md` (insert after the Templates section, before end of file)

**Step 1: Add contributor guide section**

Append before the end of the file:

```markdown
## Contributing Skills and Commands

### Creating a New Skill

1. **Create the skill directory:** `skills/<skill-name>/`
2. **Define `SKILL.md`** with YAML frontmatter:
   ```yaml
   ---
   name: skill-name
   description: "One-line purpose of this skill"
   ---
   ```
3. **Write procedures:** Document step-by-step protocols in Markdown. Include validation rules, output format specifications, and error handling procedures.
4. **Reference in commands:** Add skill activation text to relevant command prompts (e.g., `Activate the <skill-name> skill.`)
5. **Test:** Link the extension and verify activation via command execution.

### Creating a New Command

1. **Create TOML file:** `commands/maestro.<command-name>.toml`
2. **Define structure:**
   ```toml
   description = "Brief command purpose shown in help text"

   prompt = """Full prompt text sent to the TechLead orchestrator.

   Use template syntax:
   - @{file-path} to inject file content
   - !{shell-command} to inject command output
   - {{args}} to substitute user arguments
   - <user-request>{{args}}</user-request> to sandbox user input

   Activate the relevant-skill skill for methodology guidance."""
   ```
3. **Test:** Restart Gemini CLI and run `/maestro.<command-name> <test-args>`

### Common Pitfalls

- **Skill not activating:** Verify the activation text in the command prompt matches the skill's `name` field in frontmatter exactly.
- **File injection failing:** Ensure paths in `@{}` are relative to the project root. The file must exist at runtime.
- **Command not appearing:** Restart Gemini CLI after adding new TOML files. Verify the filename follows `maestro.<name>.toml` convention.
```

**Step 2: Commit**

```bash
git add docs/architecture/skills-and-commands.md
git commit -m "docs: add contributor guide for creating skills and commands"
```

---

### Task 11: Add `--yolo` Explanation to state-management-and-scripts.md

**Files:**
- Modify: `docs/architecture/state-management-and-scripts.md:500`

**Step 1: Add parenthetical explanation for --yolo flag**

Line 500 currently reads:
```
   - Launch `gemini -p "$PROMPT" --yolo --output-format json` as background process
```

Change to:
```
   - Launch `gemini -p "$PROMPT" --yolo --output-format json` as background process (`--yolo` auto-approves all tool calls without user confirmation)
```

**Step 2: Commit**

```bash
git add docs/architecture/state-management-and-scripts.md
git commit -m "docs: explain --yolo flag for external readers"
```

---

### Task 12: Add Transition Paragraph to skills-and-commands.md

**Files:**
- Modify: `docs/architecture/skills-and-commands.md:62-63` (between "Skill Structure" section and "Skill Catalog")

**Step 1: Add transition paragraph**

Between the end of the "Skill Structure" section (line 62) and `## Skill Catalog` (line 63), insert:

```markdown

The skills below are ordered by their typical activation sequence in the 4-phase orchestration workflow (Design → Plan → Execute → Complete). Cross-cutting skills like `validation` and `session-management` appear where they first become active but are used across multiple phases.

```

**Step 2: Commit**

```bash
git add docs/architecture/skills-and-commands.md
git commit -m "docs: add transition paragraph before skill catalog"
```

---

### Task 13: Final Verification

**Files:**
- Read: All 5 documentation files

**Step 1: Verify all factual fixes**

- Grep `docs/architecture/state-management-and-scripts.md` for `base-protocol.md` — should find zero matches
- Grep `docs/architecture/system-overview.md` for `search_files` — should find zero matches
- Grep `USAGE.md` for `YOLO mode` — should find zero matches

**Step 2: Verify no duplicate sentence**

Grep `USAGE.md` for "This section walks through" — should find exactly one match.

**Step 3: Verify new sections exist**

- Grep `docs/architecture/agent-system.md` for "Key Concepts" — should find one match
- Grep `docs/architecture/agent-system.md` for "Creating a New Agent" — should find one match
- Grep `docs/architecture/skills-and-commands.md` for "Contributing Skills and Commands" — should find one match

**Step 4: Commit (if any fixes needed)**

Only commit if verification reveals missed issues.
