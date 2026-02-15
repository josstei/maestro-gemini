#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)

RESPONSE=$(echo "$INPUT" | jq -r '.response // empty' 2>/dev/null) || RESPONSE=""

if [[ -z "$RESPONSE" ]] || [[ "$RESPONSE" == "null" ]]; then
  printf '{"continue":true}\n'
  exit 0
fi

MISSING=()

if ! echo "$RESPONSE" | grep -qi "Task Report"; then
  MISSING+=("Task Report")
fi

if ! echo "$RESPONSE" | grep -qi "Status.*:"; then
  MISSING+=("Status field")
fi

if ! echo "$RESPONSE" | grep -qi "Files Created\|Files Modified\|Files Deleted\|Files Changed"; then
  MISSING+=("File manifest")
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
  MISSING_STR=$(IFS=", "; echo "${MISSING[*]}")
  printf '{"continue":true,"systemMessage":"[Maestro] Agent output missing required sections: %s. Consider requesting a retry or manual completion."}\n' "$MISSING_STR"
else
  printf '{"continue":true}\n'
fi
