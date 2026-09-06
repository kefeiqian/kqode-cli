#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"run_command"}\n' > /logs/agent/tool-events.jsonl
metadata=$(cargo metadata --no-deps --format-version 1); rustc_version=$(rustc --version | awk '{print $2}'); name=$(printf '%s' "$metadata" | grep -o '"name":"[^"]*"' | head -n 1 | cut -d '"' -f4); root=$(printf '%s' "$metadata" | grep -o '"workspace_root":"[^"]*"' | head -n 1 | cut -d '"' -f4); printf '%s|%s|%s\n' "$rustc_version" "$name" "$root" > /app/answer.txt
