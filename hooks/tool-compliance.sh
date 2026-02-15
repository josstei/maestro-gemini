#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null) || TOOL_NAME=""

if [[ "$TOOL_NAME" != "run_shell_command" ]]; then
  printf '{"decision":"allow"}\n'
  exit 0
fi

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || COMMAND=""

if [[ -z "$COMMAND" ]]; then
  printf '{"decision":"allow"}\n'
  exit 0
fi

FORBIDDEN_PATTERNS=(
  'echo[[:space:]].*[[:space:]]>'
  'echo[[:space:]].*[[:space:]]>>'
  'printf[[:space:]].*[[:space:]]>'
  'printf[[:space:]].*[[:space:]]>>'
  'cat[[:space:]]*<<'
  'tee[[:space:]][^-]'
)

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    printf '{"decision":"deny","reason":"File content must be written using write_file or replace tools. Shell redirects corrupt YAML/Markdown special characters. Blocked pattern: %s"}\n' "$pattern"
    exit 0
  fi
done

printf '{"decision":"allow"}\n'
