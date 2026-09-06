#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"ask_user"}\n' > /logs/agent/tool-events.jsonl
cat /app/beta/report.txt > /app/answer.txt
