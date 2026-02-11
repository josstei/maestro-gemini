---
session_id: "<YYYY-MM-DD-topic-slug>"
created: "<ISO 8601 timestamp>"
updated: "<ISO 8601 timestamp>"
status: "in_progress"
design_document: "<relative path to design doc>"
implementation_plan: "<relative path to impl plan>"
current_phase: 1
total_phases: <integer>

token_usage:
  total_input: 0
  total_output: 0
  total_cached: 0
  by_agent: {}

phases:
  - id: 1
    name: "<phase name>"
    status: "pending"
    agents: []
    parallel: false
    started: null
    completed: null
    blocked_by: []
    files_created: []
    files_modified: []
    files_deleted: []
    downstream_context:
      key_interfaces_introduced: []
      patterns_established: []
      integration_points: []
      assumptions: []
      warnings: []
    errors: []
    retry_count: 0
---

# <Topic> Orchestration Log

## Phase 1: <Phase Name>

### Status
Pending

### Agent Output
[Agent output will be recorded here as execution proceeds]

### Files Changed
- Created: [none yet]
- Modified: [none yet]
- Deleted: [none yet]

### Validation Result
[Pending]
