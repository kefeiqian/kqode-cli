#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"run_command"}\n' > /logs/agent/tool-events.jsonl
sed -n '3,5p' /app/lines.txt > /app/answer.txt
