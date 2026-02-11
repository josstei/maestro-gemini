---
name: execution
description: Phase execution methodology for orchestration workflows with error handling and completion protocols
---

# Execution Skill

Activate this skill during Phase 3 (Execution) of Maestro orchestration. This skill provides the protocols for executing implementation plan phases through subagent delegation, handling errors, and completing orchestration sessions.

## Phase Execution Protocol

### Sequential Execution

For phases with dependencies (`blocked_by` is non-empty):

1. Verify all blocking phases have `status: completed`
2. Update the phase status to `in_progress` in session state
3. Update `current_phase` in session state
4. Delegate to the assigned agent(s) with full context
5. Process the agent's Task Report
6. Update session state with results (files changed, validation status, token usage)
7. Transition phase status to `completed` or `failed`

### Parallel Execution

For phases at the same dependency depth with no file overlap:

1. Verify all blocking phases for every phase in the batch are completed
2. Update all batch phases to `in_progress` simultaneously
3. Invoke all assigned agents concurrently in a single message
4. Wait for all agents in the batch to complete
5. Process all Task Reports
6. Update session state for all phases in the batch
7. Only proceed to the next batch when all phases in the current batch are completed

### Progress Context

Include the following in every delegation prompt to maintain execution awareness:

```
Progress: Phase [N] of [M]: [Phase Name]
Session: [session_id]
```

## Error Handling Protocol

### Error Recording

Record all errors in session state with complete metadata:
- `agent`: Which subagent encountered the error
- `timestamp`: When the error occurred (ISO 8601)
- `type`: Category — `validation`, `timeout`, `file_conflict`, `runtime`, `dependency`
- `message`: Full error message or relevant output
- `resolution`: How it was resolved, or `pending` if unresolved

### Retry Logic

- **Maximum 2 retries** per phase before escalating to user
- **First failure**: Analyze the error, adjust delegation parameters (more context, narrower scope, different approach), retry automatically
- **Second failure**: Report to user and request guidance
- **Third failure**: Mark phase as `failed`, stop execution, escalate

Increment `retry_count` in session state on each retry attempt.

### Timeout Handling

When a subagent times out:
1. Record partial output in session state if available
2. Report the timeout to the user with context about what was attempted
3. Offer options: retry with adjusted parameters, skip phase, or abort

### File Conflict Handling

When a subagent reports a file conflict (concurrent modification):
1. Stop execution immediately
2. Report conflict details to user (which files, which agents)
3. Do NOT attempt automatic resolution
4. Wait for user guidance before proceeding

### Error Escalation Format

Present failures to the user in this structured format:

```
Phase Execution Failed: [phase-name]

Agent: [agent-name]
Attempt: [N] of 2
Error Type: [error-type]

Error Message:
[full error message]

Context:
[what the agent was trying to do]
[relevant files/parameters]

Options:
1. Manually fix the issue and retry this phase
2. Skip this phase and continue
3. Abort orchestration and review session state
4. Adjust delegation parameters and retry

What would you like to do?
```

## Subagent Output Processing

### Task Report Parsing

After each subagent completes, parse its Task Report to extract:
- **Status**: `success`, `failure`, or `partial`
- **Files Created/Modified/Deleted**: Update session state file manifest
- **Downstream Context**: Extract Part 2 fields (`Key Interfaces Introduced`, `Patterns Established`, `Integration Points`, `Assumptions`, `Warnings`) into phase `downstream_context`
- **Validation**: `pass`, `fail`, or `skipped`
- **Errors**: Append to session state errors array

### State Update Sequence

After processing each Task Report:
1. Update phase `files_created`, `files_modified`, `files_deleted`
2. Update phase `downstream_context` from the parsed Handoff Report Part 2 (or empty lists when legitimately omitted)
3. Append any errors to phase `errors` array
4. Aggregate token usage into session `token_usage`
5. If validation passed: transition phase to `completed`
6. If validation failed: trigger retry logic
7. Update `updated` timestamp

## Completion Protocol

### Final Review

When all phases are completed:
1. Review all phase statuses — confirm none are `failed` or `pending`
2. Verify all deliverables from the implementation plan are accounted for
3. Cross-reference the file manifest against expected outputs

### Deliverable Verification

For each phase in the implementation plan:
- Confirm expected files were created/modified
- Confirm validation passed (or was explicitly skipped by user)
- Flag any deviations from the plan

### Archival Trigger

After successful completion:
1. Activate the `session-management` skill
2. Execute the archive protocol
3. Move design document, implementation plan, and session state to archive directories

### Summary Format

Present the final orchestration summary:

```
Orchestration Complete: [session_id]

Delivered:
- [bullet point summary of what was built/changed]

Files Changed:
- Created: [count] files
- Modified: [count] files
- Deleted: [count] files

Token Usage:
- Total: [input + output tokens]
- By Agent: [top 3 agents by usage]

Deviations from Plan:
- [any changes from original plan, or "None"]

Recommended Next Steps:
- [actionable follow-up items]
```
