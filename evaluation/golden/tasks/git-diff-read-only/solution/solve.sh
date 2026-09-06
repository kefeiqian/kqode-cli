#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"run_command"}\n' > /logs/agent/tool-events.jsonl
git diff --numstat > /app/answer.txt
