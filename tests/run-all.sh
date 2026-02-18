#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0

run_test() {
  local test_file="$1"
  local test_name="$(basename "$test_file" .sh)"
  echo ""
  echo "--- Running: $test_name ---"
  if bash "$test_file"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAILED: $test_name"
  fi
}

echo "Maestro v1.2 Integration Tests"
echo "==============================="

for test_file in "$SCRIPT_DIR"/test-*.sh; do
  if [ -f "$test_file" ]; then
    run_test "$test_file"
  fi
done

echo ""
echo "-------------------------------"
echo "Results: $PASS passed, $FAIL failed"
echo "-------------------------------"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
