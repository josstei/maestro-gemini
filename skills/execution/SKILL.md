---
name: execution
description: Phase execution methodology for orchestration workflows with error handling and completion protocols
---

# Execution Skill

Activate this skill during Phase 3 (Execution) of Maestro orchestration. This skill provides the protocols for executing implementation plan phases through subagent delegation, handling errors, and completing orchestration sessions.

## Tier-Based Execution Modes

This skill supports three execution modes based on the workflow tier:

- **T1 Quick**: Direct delegation to a single agent without a plan file. See "T1 Direct Delegation Protocol" below.
- **T2 Standard**: Plan-based execution using a lightweight implementation plan. Uses the standard "Phase Execution Protocol" below.
- **T3 Full**: Plan-based execution using a full implementation plan. Uses the standard "Phase Execution Protocol" below (unchanged).

## T1 Direct Delegation Protocol

For T1 Quick workflow, execution skips plan lookup entirely. The TechLead constructs the delegation inline.

### Flow

1. Receive the task description and selected agent from the TechLead
2. Construct a delegation prompt using the delegation skill template with simplified context:
   - Task description
   - Tier: T1 Quick
   - Files to modify/create (identified by the TechLead)
   - Deliverables
   - Validation command
   - Scope boundaries
3. Delegate to the single selected agent
4. Process the agent's task report
5. Run validation using the validation skill (if applicable — skip for read-only agents)
6. Return results to the TechLead for session state creation

### T1 Error Handling

- **First failure**: Analyze the error, adjust the delegation prompt (more context, narrower scope, different approach), retry once
- **Second failure**: Do NOT retry again. Escalate to the user with options:
  1. Retry with adjusted parameters
  2. Escalate to T2 Standard workflow (re-classify and re-plan)
  3. Abort

### T1 Completion Summary

After successful execution, present:

```
Quick Task Complete

Task: [description]
Agent: [agent-name]
Files Changed: [list of files created/modified/deleted]
Validation: [pass/fail/skipped]
```

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
- **Validation**: `pass`, `fail`, or `skipped`
- **Errors**: Append to session state errors array

### State Update Sequence

After processing each Task Report:
1. Update phase `files_created`, `files_modified`, `files_deleted`
2. Append any errors to phase `errors` array
3. Aggregate token usage into session `token_usage`
4. If validation passed: transition phase to `completed`
5. If validation failed: trigger retry logic
6. Update `updated` timestamp

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
