# Fixture: Default Scope Catalog

Expected default repo order:

| Order | ID | Display name | Source | Upstream / location |
|---:|---|---|---|---|
| 1 | `copilot-cli` | GitHub Copilot CLI | git | `https://github.com/github/copilot-cli` |
| 2 | `claude-code` | Claude Code | local mirror | `docs/claude-code` |
| 3 | `codex` | Codex CLI | git | `https://github.com/openai/codex` |
| 4 | `gemini-cli` | Gemini CLI | git | `https://github.com/google-gemini/gemini-cli` |
| 5 | `opencode` | OpenCode | git | `https://github.com/anomalyco/opencode` |
| 6 | `kimi-code` | Kimi Code CLI | git | `https://github.com/moonshotai/kimi-code` |
| 7 | `kimix` | KimiX | git | `https://github.com/Sikao-Engine/KimiX` |

Unknown aliases should fail with this list instead of silently substituting another repository.
