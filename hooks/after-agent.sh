#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

INPUT=$(read_stdin)
SESSION_ID=$(json_get "$INPUT" "session_id")

AGENT_NAME="${MAESTRO_CURRENT_AGENT:-}"
if [ -z "$AGENT_NAME" ]; then
  AGENT_NAME=$(get_active_agent "$SESSION_ID")
fi

if [ -n "$AGENT_NAME" ]; then
  TMPFILE=$(mktemp)
  echo "$INPUT" > "$TMPFILE"
  VALIDATION=$(python3 - "$TMPFILE" <<'PYEOF' 2>/dev/null || echo "OK"
import sys, json

with open(sys.argv[1], 'r') as f:
    data = json.load(f)

response = data.get('prompt_response', '')

has_task_report = 'Task Report' in response or 'Status:' in response
has_downstream = 'Downstream Context' in response or 'downstream' in response.lower()

warnings = []
if not has_task_report:
    warnings.append('Missing Task Report section')
if not has_downstream:
    warnings.append('Missing Downstream Context section')

if warnings:
    print('WARN: ' + '; '.join(warnings))
else:
    print('OK')
PYEOF
  )
  rm -f "$TMPFILE"

  if [[ "$VALIDATION" == WARN:* ]]; then
    log_hook "WARN" "AfterAgent [$AGENT_NAME]: $VALIDATION"
  else
    log_hook "INFO" "AfterAgent [$AGENT_NAME]: Handoff report validated"
  fi
fi

clear_active_agent "$SESSION_ID"
respond_allow
