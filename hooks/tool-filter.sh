#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)

MESSAGES=$(echo "$INPUT" | jq -r '.llm_request.messages // empty' 2>/dev/null) || MESSAGES=""

if [[ -z "$MESSAGES" ]] || [[ "$MESSAGES" == "null" ]]; then
  printf '{}\n'
  exit 0
fi

AGENT_NAME=$(echo "$INPUT" | jq -r '
  .llm_request.messages
  | map(select(.role == "user"))
  | last
  | .content // ""
  | if type == "array" then map(.text // "") | join(" ") else . end
  | capture("Agent:\\s*(?<name>[a-z][a-z0-9-]*)") // null
  | .name // null
' 2>/dev/null) || AGENT_NAME=""

if [[ -z "$AGENT_NAME" ]] || [[ "$AGENT_NAME" == "null" ]]; then
  printf '{}\n'
  exit 0
fi

READ_TOOLS='["read_file","grep_search","list_directory","web_search"]'
READ_SHELL_TOOLS='["read_file","grep_search","list_directory","web_search","run_shell_command"]'
READ_WRITE_TOOLS='["read_file","grep_search","list_directory","web_search","write_file","replace"]'

case "$AGENT_NAME" in
  architect|api-designer|code-reviewer)
    printf '{"allowedTools":%s}\n' "$READ_TOOLS"
    ;;
  debugger|performance-engineer|security-engineer)
    printf '{"allowedTools":%s}\n' "$READ_SHELL_TOOLS"
    ;;
  refactor|technical-writer)
    printf '{"allowedTools":%s}\n' "$READ_WRITE_TOOLS"
    ;;
  coder|data-engineer|devops-engineer|tester)
    printf '{}\n'
    ;;
  *)
    printf '{}\n'
    ;;
esac
