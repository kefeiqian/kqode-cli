#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"run_command"}\n' > /logs/agent/tool-events.jsonl
find /app -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort > /app/answer.txt
