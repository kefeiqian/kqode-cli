# Fixture: Default Scope Catalog

Expected default repo order:

| Order | ID | Display name | Upstream |
|---:|---|---|---|
| 1 | `codex` | Codex CLI | `https://github.com/openai/codex` |
| 2 | `opencode` | OpenCode | `https://github.com/anomalyco/opencode` |
| 3 | `kimi-code` | Kimi Code CLI | `https://github.com/moonshotai/kimi-code` |
| 4 | `gemini-cli` | Gemini CLI | `https://github.com/google-gemini/gemini-cli` |
| 5 | `pi-agent` | Pi Coding Agent | `https://github.com/earendil-works/pi` |
| 6 | `deepseek-harness` | DeepSeek Harness | `https://github.com/deepseek-ai/deepseek-harness` |

Unknown aliases should fail with this list instead of silently substituting another repository.
