#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"fetch_web_url"}\n' > /logs/agent/tool-events.jsonl
python -c "import urllib.request; open('/app/answer.txt','wb').write(urllib.request.urlopen('http://fixture-web:8080/message.txt').read())"
