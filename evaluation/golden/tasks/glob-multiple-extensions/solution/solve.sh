#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"run_command"}\n' > /logs/agent/tool-events.jsonl
find /app -type f \( -name '*.md' -o -name '*.toml' \) -printf '%P\n' | sort > /app/answer.txt
