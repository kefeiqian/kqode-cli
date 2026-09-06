#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"run_command"}\n' > /logs/agent/tool-events.jsonl
{ git log -1 --pretty=%s; git show HEAD:note.txt; } > /app/answer.txt
