#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${1:-.gemini}"

DIRS=(
  "${STATE_DIR}/state"
  "${STATE_DIR}/state/archive"
  "${STATE_DIR}/plans"
  "${STATE_DIR}/plans/archive"
  "${STATE_DIR}/parallel"
)

for dir in "${DIRS[@]}"; do
  if ! mkdir -p "$dir" 2>/dev/null; then
    echo "ERROR: Failed to create directory: $dir" >&2
    echo "Check permissions on $(dirname "$dir")" >&2
    exit 1
  fi

  if [[ ! -w "$dir" ]]; then
    echo "ERROR: Directory not writable: $dir" >&2
    exit 1
  fi
done
