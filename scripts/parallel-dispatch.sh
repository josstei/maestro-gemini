#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH_DIR="${1:-.maestro-parallel}"
PROMPT_DIR="${DISPATCH_DIR}/prompts"
RESULT_DIR="${DISPATCH_DIR}/results"

usage() {
  cat <<EOF
Usage: parallel-dispatch.sh <dispatch-dir>

Dispatches Gemini CLI agents in parallel from prompt files.

Setup:
  1. Create dispatch directory with prompt files:
     <dispatch-dir>/prompts/agent-a.txt
     <dispatch-dir>/prompts/agent-b.txt
     ...

  2. Each prompt file contains the full agent delegation prompt.

  3. Run: ./parallel-dispatch.sh <dispatch-dir>

Results:
  <dispatch-dir>/results/agent-a.json    (structured output)
  <dispatch-dir>/results/agent-a.exit    (exit code)
  <dispatch-dir>/results/agent-a.log     (stderr/debug)
  <dispatch-dir>/results/summary.json    (batch summary)

Environment:
  MAESTRO_DEFAULT_MODEL   Override model for all agents
  MAESTRO_AGENT_TIMEOUT   Timeout in minutes (default: 10)
EOF
  exit 1
}

if [[ ! -d "$PROMPT_DIR" ]]; then
  echo "ERROR: No prompts directory found at $PROMPT_DIR"
  usage
fi

PROMPT_FILES=("$PROMPT_DIR"/*)
if [[ ${#PROMPT_FILES[@]} -eq 0 ]]; then
  echo "ERROR: No prompt files found in $PROMPT_DIR"
  exit 1
fi

mkdir -p "$RESULT_DIR"

MODEL_FLAGS=()
if [[ -n "${MAESTRO_DEFAULT_MODEL:-}" ]]; then
  MODEL_FLAGS=("-m" "$MAESTRO_DEFAULT_MODEL")
fi

TIMEOUT_MINS="${MAESTRO_AGENT_TIMEOUT:-10}"
TIMEOUT_SECS=$((TIMEOUT_MINS * 60))

PIDS=()
AGENT_NAMES=()
START_TIME=$(date +%s)

echo "MAESTRO PARALLEL DISPATCH"
echo "========================="
echo "Agents: ${#PROMPT_FILES[@]}"
echo "Timeout: ${TIMEOUT_MINS} minutes"
echo "Model: ${MAESTRO_DEFAULT_MODEL:-default}"
echo ""

for PROMPT_FILE in "${PROMPT_FILES[@]}"; do
  AGENT_NAME=$(basename "$PROMPT_FILE" .txt)
  AGENT_NAMES+=("$AGENT_NAME")

  RESULT_JSON="$RESULT_DIR/${AGENT_NAME}.json"
  RESULT_EXIT="$RESULT_DIR/${AGENT_NAME}.exit"
  RESULT_LOG="$RESULT_DIR/${AGENT_NAME}.log"

  PROMPT_CONTENT=$(cat "$PROMPT_FILE")

  if [[ -z "${PROMPT_CONTENT// /}" ]]; then
    echo "ERROR: Prompt file $PROMPT_FILE is empty or whitespace-only"
    exit 1
  fi

  echo "Dispatching: $AGENT_NAME"

  (
    timeout "$TIMEOUT_SECS" gemini \
      -p "$PROMPT_CONTENT" \
      --yolo \
      --output-format json \
      "${MODEL_FLAGS[@]}" \
      > "$RESULT_JSON" \
      2> "$RESULT_LOG"
    echo $? > "$RESULT_EXIT"
  ) &

  PIDS+=($!)
done

echo ""
echo "All agents dispatched. Waiting for completion..."
echo ""

FAILURES=0
for i in "${!PIDS[@]}"; do
  PID=${PIDS[$i]}
  AGENT_NAME=${AGENT_NAMES[$i]}

  wait "$PID" 2>/dev/null || true

  RESULT_EXIT="$RESULT_DIR/${AGENT_NAME}.exit"
  if [[ -f "$RESULT_EXIT" ]]; then
    EXIT_CODE=$(cat "$RESULT_EXIT")
  else
    EXIT_CODE=255
    echo "$EXIT_CODE" > "$RESULT_EXIT"
  fi

  if [[ "$EXIT_CODE" -eq 0 ]]; then
    echo "  $AGENT_NAME: SUCCESS (exit 0)"
  elif [[ "$EXIT_CODE" -eq 124 ]]; then
    echo "  $AGENT_NAME: TIMEOUT (exceeded ${TIMEOUT_MINS}m)"
    FAILURES=$((FAILURES + 1))
  else
    echo "  $AGENT_NAME: FAILED (exit $EXIT_CODE)"
    FAILURES=$((FAILURES + 1))
  fi
done

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "BATCH COMPLETE"
echo "  Total agents: ${#AGENT_NAMES[@]}"
echo "  Succeeded: $(( ${#AGENT_NAMES[@]} - FAILURES ))"
echo "  Failed: $FAILURES"
echo "  Wall time: ${ELAPSED}s"

cat > "$RESULT_DIR/summary.json" <<ENDJSON
{
  "batch_status": "$([ "$FAILURES" -eq 0 ] && echo "success" || echo "partial_failure")",
  "total_agents": ${#AGENT_NAMES[@]},
  "succeeded": $(( ${#AGENT_NAMES[@]} - FAILURES )),
  "failed": $FAILURES,
  "wall_time_seconds": $ELAPSED,
  "agents": [
$(for i in "${!AGENT_NAMES[@]}"; do
    NAME=${AGENT_NAMES[$i]}
    EXIT=$(cat "$RESULT_DIR/${NAME}.exit" 2>/dev/null || echo "255")
    STATUS="success"
    [[ "$EXIT" -eq 124 ]] && STATUS="timeout"
    [[ "$EXIT" -ne 0 && "$EXIT" -ne 124 ]] && STATUS="failed"
    COMMA=""
    [[ $i -lt $(( ${#AGENT_NAMES[@]} - 1 )) ]] && COMMA=","
    echo "    {\"name\": \"$NAME\", \"exit_code\": $EXIT, \"status\": \"$STATUS\"}$COMMA"
done)
  ]
}
ENDJSON

echo ""
echo "Results: $RESULT_DIR/summary.json"

exit $FAILURES
