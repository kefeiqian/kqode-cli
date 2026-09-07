# KQode Research Repo Catalog

This file is the source of truth for repositories that the skill may research. Keep its IDs, aliases, default scope, and contract fixtures synchronized.

## Default scope repositories

The default scope mirrors KQode's referenced coding-agent list. Use these repositories by default, in this order:

| ID | Display name | Upstream |
|---|---|---|
| `codex` | Codex CLI | `https://github.com/openai/codex` |
| `opencode` | OpenCode | `https://github.com/anomalyco/opencode` |
| `kimi-code` | Kimi Code CLI | `https://github.com/moonshotai/kimi-code` |
| `gemini-cli` | Gemini CLI | `https://github.com/google-gemini/gemini-cli` |
| `pi-agent` | Pi Coding Agent | `https://github.com/earendil-works/pi` |
| `deepseek-harness` | DeepSeek Harness | `https://github.com/deepseek-ai/deepseek-harness` |

## Optional open-source references

The skill may research these additional open-source references only when the user requests them by name or alias. Do not include them in the default scope.

| ID | Display name | Upstream |
|---|---|---|
| `openhands` | OpenHands / Agent Canvas | `https://github.com/OpenHands/OpenHands` |
| `openhands-sdk` | OpenHands Software Agent SDK | `https://github.com/OpenHands/software-agent-sdk` |
| `cline` | Cline | `https://github.com/cline/cline` |
| `goose` | Goose | `https://github.com/aaif-goose/goose` |
| `autocoderover` | AutoCodeRover | `https://github.com/AutoCodeRoverSG/auto-code-rover` |
| `continue` | Continue | `https://github.com/continuedev/continue` |
| `qwen-code` | Qwen Code | `https://github.com/QwenLM/qwen-code` |
| `roo-code` | Roo Code | `https://github.com/RooCodeInc/Roo-Code` |
| `open-swe` | Open SWE | `https://github.com/langchain-ai/open-swe` |
| `plandex` | Plandex | `https://github.com/plandex-ai/plandex` |
| `smol-developer` | smol-ai/developer | `https://github.com/smol-ai/developer` |
| `paseo` | Paseo | `https://github.com/getpaseo/paseo` |

## Alias rules

- Match IDs case-insensitively.
- Accept obvious display-name aliases such as `codex-cli`, `gemini`, `kimi`, `pi`, `pi-coding-agent`, `deepseek`, `deepseek-harness`, and `auto-code-rover`.
- On unknown aliases, stop and show the known IDs. Do not silently substitute a nearby repo.
- GitHub Copilot CLI and Claude Code are research targets: Copilot CLI via its public repo, Claude Code via its local mirror. Products without a researchable source, such as the Copilot Coding Agent cloud service, Cursor, and Windsurf, remain product references only and are not source-research targets.

## Scope rules

- Default scope means the default-scope table only.
- Expanded scope means explicitly requested repos from the optional table.
- `claude-code` is the only local-mirror source; every other target is fetched from its HTTPS upstream.
- v1 does not accept arbitrary repository URLs or arbitrary local paths. Supporting either later requires a stricter trust review and the same safety guarantees as catalog repos.
