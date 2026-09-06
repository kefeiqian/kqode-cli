#!/bin/bash
set -u

mkdir -p /logs/verifier
output_correct=0
tool_observed=0
fixture_unchanged=1

if [ -f /app/answer.txt ] && diff -u /tests/expected.txt /app/answer.txt; then
  output_correct=1
fi

if [ -f /logs/agent/tool-events.jsonl ] && grep -q '"tool":"run_command"' /logs/agent/tool-events.jsonl; then
  tool_observed=1
fi

if [ -f /tests/fixture.sha256 ] && ! sha256sum --check --quiet /tests/fixture.sha256; then
  fixture_unchanged=0
fi

task_success=0
if [ "$output_correct" -eq 1 ] && [ "$tool_observed" -eq 1 ] && [ "$fixture_unchanged" -eq 1 ]; then
  task_success=1
fi

printf '{"task_success": %s, "output_correct": %s, "tool_observed": %s, "fixture_unchanged": %s}\n'   "$task_success" "$output_correct" "$tool_observed" "$fixture_unchanged"   > /logs/verifier/reward.json

[ "$task_success" -eq 1 ]
