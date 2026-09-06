#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"ask_user"}\n' > /logs/agent/tool-events.jsonl
printf 'cancelled\n' > /app/answer.txt
