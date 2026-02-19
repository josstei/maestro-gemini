#!/usr/bin/env bash

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/common.sh"

main() {
  INPUT=$(read_stdin)
  SESSION_ID=$(json_get "$INPUT" "session_id")

  if ! validate_session_id "$SESSION_ID" 2>/dev/null; then
    echo '{}'
    return 0
  fi

  SESSION_TMP_STATE_DIR="/tmp/maestro-hooks/$SESSION_ID"
  if [ -d "$SESSION_TMP_STATE_DIR" ]; then
    rm -rf "$SESSION_TMP_STATE_DIR"
  fi

  echo '{}'
}

safe_main main advisory
