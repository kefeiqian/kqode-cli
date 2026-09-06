#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"ask_user"}\n' > /logs/agent/tool-events.jsonl
printf 'aurora\n' > /app/answer.txt
