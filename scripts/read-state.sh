#!/usr/bin/env bash
set -euo pipefail

STATE_FILE="${1:?Usage: read-state.sh <relative-path>}"

if [[ "$STATE_FILE" == /* ]]; then
  echo "ERROR: Path must be relative (got: $STATE_FILE)" >&2
  exit 1
fi

if [[ "$STATE_FILE" == *".."* ]]; then
  echo "ERROR: Path traversal not allowed (got: $STATE_FILE)" >&2
  exit 1
fi

if [[ ! -f "$STATE_FILE" ]]; then
  echo "ERROR: State file not found: $STATE_FILE" >&2
  exit 1
fi

cat "$STATE_FILE"
