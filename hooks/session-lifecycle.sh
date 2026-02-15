#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
INPUT=$(cat)

CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null) || CWD=""
STATE_DIR="${MAESTRO_STATE_DIR:-.gemini}"

if [[ -z "$CWD" ]]; then
  CWD="$(pwd)"
fi

SESSION_PATH="${CWD}/${STATE_DIR}/state/active-session.md"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENSURE_SCRIPT="${EXTENSION_DIR}/scripts/ensure-workspace.sh"

case "$ACTION" in
  start)
    if [[ -x "$ENSURE_SCRIPT" ]]; then
      (cd "$CWD" && "$ENSURE_SCRIPT" "$STATE_DIR") >&2 || echo "Workspace init warning" >&2
    fi

    if [[ -f "$SESSION_PATH" ]]; then
      SESSION_ID=$(grep -m1 '^session_id:' "$SESSION_PATH" | sed 's/^session_id:\s*//' | tr -d '"' 2>/dev/null) || SESSION_ID="unknown"
      CURRENT_PHASE=$(grep -m1 '^current_phase:' "$SESSION_PATH" | sed 's/^current_phase:\s*//' 2>/dev/null) || CURRENT_PHASE="unknown"
      STATUS=$(grep -m1 '^status:' "$SESSION_PATH" | sed 's/^status:\s*//' | tr -d '"' 2>/dev/null) || STATUS="unknown"

      printf '{"systemMessage":"[Maestro] Active session detected: %s (phase %s, status: %s). Use /maestro.resume to continue or /maestro.archive to start fresh.","continue":true}\n' \
        "$SESSION_ID" "$CURRENT_PHASE" "$STATUS"
    else
      printf '{"systemMessage":"[Maestro] Workspace ready. No active session.","continue":true}\n'
    fi
    ;;

  end)
    if [[ -f "$SESSION_PATH" ]]; then
      STATUS=$(grep -m1 '^status:' "$SESSION_PATH" | sed 's/^status:\s*//' | tr -d '"' 2>/dev/null) || STATUS=""

      if [[ "$STATUS" == "completed" ]]; then
        SESSION_ID=$(grep -m1 '^session_id:' "$SESSION_PATH" | sed 's/^session_id:\s*//' | tr -d '"' 2>/dev/null) || SESSION_ID="session"
        ARCHIVE_DIR="${CWD}/${STATE_DIR}/state/archive"
        mkdir -p "$ARCHIVE_DIR" 2>/dev/null || true
        mv "$SESSION_PATH" "${ARCHIVE_DIR}/${SESSION_ID}.md" 2>/dev/null || true

        HISTORY_LOG="${CWD}/${STATE_DIR}/state/session-history.log"
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | ${SESSION_ID} | completed" >> "$HISTORY_LOG" 2>/dev/null || true

        echo "Archived session: $SESSION_ID" >&2
      fi
    fi

    printf '{"continue":true}\n'
    ;;

  *)
    echo "Unknown action: $ACTION" >&2
    printf '{"continue":true}\n'
    ;;
esac
