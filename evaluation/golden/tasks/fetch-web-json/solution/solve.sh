#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"fetch_web_url"}\n' > /logs/agent/tool-events.jsonl
python -c "import json,urllib.request; d=json.load(urllib.request.urlopen('http://fixture-web:8080/data.json')); open('/app/answer.txt','w').write(d['project']+'\\n')"
