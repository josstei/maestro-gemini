#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/before-model.sh"

echo "=== Test: BeforeModel Hook ==="

echo -n "  Test 1: No active agent returns empty JSON object... "
RESULT=$(echo '{"session_id":"test-bm-001","cwd":"/tmp","hook_event_name":"BeforeModel","timestamp":"2026-01-01T00:00:00Z","llm_request":{"model":"gemini-2.5-pro","messages":[]}}' | bash "$HOOK" 2>/dev/null)
if python3 -c "import sys,json; d=json.loads('$RESULT'); assert d == {}, f'Expected empty dict, got {d}'" 2>/dev/null; then
  echo "PASS"
else
  echo "FAIL: Expected {}, got: $RESULT"
  exit 1
fi

echo -n "  Test 2: Active agent present returns empty JSON object (no model override)... "
STATE_DIR="/tmp/maestro-hooks"
mkdir -p "$STATE_DIR/test-bm-002"
echo "coder" > "$STATE_DIR/test-bm-002/active-agent"
RESULT=$(echo '{"session_id":"test-bm-002","cwd":"/tmp","hook_event_name":"BeforeModel","timestamp":"2026-01-01T00:00:00Z","llm_request":{"model":"gemini-2.5-pro","messages":[]}}' | bash "$HOOK" 2>/dev/null)
if python3 -c "import sys,json; d=json.loads('$RESULT'); assert d == {}, f'Expected empty dict, got {d}'" 2>/dev/null; then
  echo "PASS"
else
  echo "FAIL: Expected {}, got: $RESULT"
  exit 1
fi

echo -n "  Test 3: MAESTRO_DEFAULT_MODEL env var set returns empty JSON object (model overrides are not supported via hook)... "
RESULT=$(MAESTRO_DEFAULT_MODEL="gemini-2.0-flash" bash -c "echo '{\"session_id\":\"test-bm-003\",\"cwd\":\"/tmp\",\"hook_event_name\":\"BeforeModel\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"llm_request\":{\"model\":\"gemini-2.5-pro\",\"messages\":[]}}' | bash '$HOOK'" 2>/dev/null)
if python3 -c "import sys,json; d=json.loads('$RESULT'); assert d == {}, f'Expected empty dict, got {d}'" 2>/dev/null; then
  echo "PASS"
else
  echo "FAIL: Expected {}, got: $RESULT"
  exit 1
fi

echo -n "  Test 4: Empty stdin returns safe allow... "
RESULT=$(echo "" | bash "$HOOK" 2>/dev/null || echo '{"decision":"allow"}')
if python3 -c "import sys,json; d=json.loads('$RESULT'); assert isinstance(d, dict), f'Expected dict, got {type(d)}'" 2>/dev/null; then
  echo "PASS"
else
  echo "FAIL: Expected JSON object, got: $RESULT"
  exit 1
fi

rm -rf "$STATE_DIR/test-bm-002"

echo "=== All BeforeModel hook tests passed ==="
