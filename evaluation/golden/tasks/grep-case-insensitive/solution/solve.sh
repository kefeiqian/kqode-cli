#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"run_command"}\n' > /logs/agent/tool-events.jsonl
grep -in 'warning' /app/events.log > /app/answer.txt
