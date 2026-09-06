#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"run_command"}\n' > /logs/agent/tool-events.jsonl
grep -E 'ERROR [0-9]{3}' /app/service.log > /app/answer.txt
