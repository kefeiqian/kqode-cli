#!/bin/bash
set -euo pipefail

mkdir -p /logs/agent
printf '{"tool":"fetch_web_url"}\n' > /logs/agent/tool-events.jsonl
python -c "import re,urllib.request; s=urllib.request.urlopen('http://fixture-web:8080/index.html').read().decode(); open('/app/answer.txt','w').write(re.search(r'<title>(.*?)</title>',s).group(1)+'\\n')"
