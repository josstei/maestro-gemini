#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)

CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null) || CWD="$(pwd)"
STATE_DIR="${MAESTRO_STATE_DIR:-.gemini}"
SESSION_PATH="${CWD}/${STATE_DIR}/state/active-session.md"

if [[ ! -f "$SESSION_PATH" ]]; then
  printf '{"continue":true}\n'
  exit 0
fi

SESSION_ID=$(grep -m1 '^session_id:' "$SESSION_PATH" | sed 's/^session_id:[[:space:]]*//' | tr -d '"' 2>/dev/null) || SESSION_ID="unknown"
CURRENT_PHASE=$(grep -m1 '^current_phase:' "$SESSION_PATH" | sed 's/^current_phase:[[:space:]]*//' 2>/dev/null) || CURRENT_PHASE="?"
TOTAL_PHASES=$(grep -m1 '^total_phases:' "$SESSION_PATH" | sed 's/^total_phases:[[:space:]]*//' 2>/dev/null) || TOTAL_PHASES="?"
STATUS=$(grep -m1 '^status:' "$SESSION_PATH" | sed 's/^status:[[:space:]]*//' | tr -d '"' 2>/dev/null) || STATUS="unknown"

COMPLETED=$(grep -c '  status: "completed"' "$SESSION_PATH" 2>/dev/null) || COMPLETED=0

CHECKPOINT_PATH="${CWD}/${STATE_DIR}/state/compress-checkpoint.md"
mkdir -p "$(dirname "$CHECKPOINT_PATH")" 2>/dev/null || true

cat > "$CHECKPOINT_PATH" <<CHECKPOINT
# Session State Checkpoint
- Session: ${SESSION_ID}
- Status: ${STATUS}
- Phase: ${CURRENT_PHASE} of ${TOTAL_PHASES}
- Completed phases: ${COMPLETED}
- Preserved at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
CHECKPOINT

printf '{"continue":true,"systemMessage":"[Maestro] Session state preserved before context compression. Session: %s, Phase %s/%s (%s completed). Use maestro_session_read tool to restore full context."}\n' \
  "$SESSION_ID" "$CURRENT_PHASE" "$TOTAL_PHASES" "$COMPLETED"
