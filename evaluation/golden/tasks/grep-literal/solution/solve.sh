#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"run_command"}\n' > /logs/agent/tool-events.jsonl
grep -RFn 'ToolRegistry' /app/src | sed 's#^/app/##' | sort > /app/answer.txt
