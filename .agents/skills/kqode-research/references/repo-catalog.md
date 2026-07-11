# KQode Research Repo Catalog

`docs/kqode_reference_implementations.md` is the source of truth for KQode reference repositories, and `blog/docs/01-KQode介绍.md` lists KQode's referenced coding agents. This file defines the skill-facing IDs, aliases, and default research scope derived from those sources; update the source catalog first when repository membership changes.

## Default scope repositories

The default scope mirrors KQode's referenced coding-agent list. Use these repositories by default, in this order:

| ID | Display name | Source | Upstream / location |
|---|---|---|---|
| `copilot-cli` | GitHub Copilot CLI | git | `https://github.com/github/copilot-cli` |
| `claude-code` | Claude Code | local mirror | `docs/claude-code` (git-ignored) |
| `codex` | Codex CLI | git | `https://github.com/openai/codex` |
| `gemini-cli` | Gemini CLI | git | `https://github.com/google-gemini/gemini-cli` |
| `opencode` | OpenCode | git | `https://github.com/anomalyco/opencode` |
| `kimi-code` | Kimi Code CLI | git | `https://github.com/moonshotai/kimi-code` |
| `kimix` | KimiX | git | `https://github.com/Sikao-Engine/KimiX` |

`claude-code` has no public repository. Research it only from the KQode-managed, git-ignored local mirror at `docs/claude-code`, following the local-mirror rules in `safety-and-citations.md`, and cite it with internal repo-relative links rather than an upstream URL.

## Optional open-source references

The skill may research these additional open-source references only when the user requests them by catalog ID or alias. Do not include them in the default scope.

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

## Alias rules

- Match IDs case-insensitively.
- Accept obvious display-name aliases such as `copilot`, `copilot-cli`, `claude`, `claude-code`, `codex-cli`, `gemini`, `kimi`, `kimix`, and `auto-code-rover`.
- On unknown aliases, stop and show the known IDs. Do not silently substitute a nearby repo.
- GitHub Copilot CLI and Claude Code are research targets: Copilot CLI via its public repo, Claude Code via its local mirror. Products without a researchable source, such as the Copilot Coding Agent cloud service, Cursor, and Windsurf, remain product references only and are not source-research targets.

## Scope rules

- Default scope means the default-scope table only.
- Expanded scope means explicitly requested repos from the optional table.
- `claude-code` is the only local-mirror source; every other target is fetched from its HTTPS upstream.
- v1 does not accept arbitrary repository URLs or arbitrary local paths. Supporting either later requires a stricter trust review and the same safety guarantees as catalog repos.
