# KQode Reference Implementations

This catalog lists the open-source and public-reference coding-agent implementations used to shape KQode's feature list and build path. These are references for product behavior, architecture ideas, and evaluation design. KQode remains an original implementation.

## Primary references

| Project | Repository | Primary lessons for KQode |
|---|---|---|
| GitHub Copilot CLI | `https://github.com/github/copilot-cli` | Terminal Copilot workflow, GitHub-native auth and model access, approvals, and headless/CI usage patterns. |
| Codex CLI | `https://github.com/openai/codex` | Terminal-first coding agent, approvals, sandbox policy, project instructions, session resume, subagents, MCP, local code review, web search, headless mode. |
| Kimi Code CLI | `https://github.com/moonshotai/kimi-code` | Fast TUI, video input, conversational MCP config, plugin trust model, hooks, ACP, sessions, exports, provider management. |
| KimiX | `https://github.com/Sikao-Engine/KimiX` | Lightweight coding-agent CLI shape, minimal-footprint tooling, and provider-agnostic agent loop patterns. |
| Gemini CLI | `https://github.com/google-gemini/gemini-cli` | GEMINI.md context, checkpointing, rewind, headless JSON/stream-json, policy engine, trusted folders, token caching, GitHub Action automation, evals. |
| Aider | `https://github.com/Aider-AI/aider` | Git-native edit loop, repo map, model-specific edit formats, auto lint/test loop, watch comments, voice, image/web context, polyglot benchmark. |
| OpenCode | `https://github.com/anomalyco/opencode` | Terminal product shape, build/plan primary agents, subagent hierarchy, LSP diagnostics, custom agents/commands, session sharing, themes, keybindings. |
| OpenHands / Agent Canvas | `https://github.com/OpenHands/OpenHands` | Agent control center, multi-backend agent orchestration, automation server, browser-use, self-hosting, ACP-compatible agent backend model. |
| OpenHands Software Agent SDK | `https://github.com/OpenHands/software-agent-sdk` | Agent server, workspace abstractions, tool packages, delegate/workflow/task-tracker tools, browser automation, skill marketplace patterns. |
| Cline | `https://github.com/cline/cline` | Plan/Act UX, IDE diff approvals, CLI/headless mode, SDK layering, Kanban agents, scheduled agents, chat connectors, pass@k/pass^k evals. |
| Goose | `https://github.com/aaif-goose/goose` | Rust agent implementation, desktop/CLI/API surfaces, MCP-first extensions, recipes, secure recipe secrets, custom distributions, provider setup wizard. |
| SWE-agent | `https://github.com/SWE-agent/SWE-agent` | SWE-bench evaluation, trajectory files, replay, batch runs, frozen configs, cost stats, run comparison, benchmark-oriented research workflow. |
| AutoCodeRover | `https://github.com/AutoCodeRoverSG/auto-code-rover` | Issue-solving pipeline, AST-aware localization, statistical fault localization, patch selection, patch classification, reproducible benchmark runs. |

## Secondary references

| Project | Repository | Why it matters |
|---|---|---|
| Continue | `https://github.com/continuedev/continue` | IDE-first context providers, model routing, codebase assistance, and CI/assistant workflows. |
| Qwen Code | `https://github.com/QwenLM/qwen-code` | Terminal coding-agent reference from the Qwen ecosystem; useful for China-market positioning. |
| Roo Code | `https://github.com/RooCodeInc/Roo-Code` | Multi-mode IDE agent and team-style agent UX; archived, so use as historical reference only. |
| Open SWE | `https://github.com/langchain-ai/open-swe` | Async coding-agent design and background task patterns. |
| Plandex | `https://github.com/plandex-ai/plandex` | Long-running planning for large projects and multi-file change management. |
| smol-ai/developer | `https://github.com/smol-ai/developer` | Minimal embeddable developer-agent library patterns. |

## Public but not open-source implementation references

| Product | Reference value |
|---|---|
| Claude Code | Product benchmark for terminal coding-agent UX, permissions, tool use, memory, skills, and workflow depth. Do not use leaked/proprietary source as implementation material. The `kqode-research` skill studies it only from a git-ignored local mirror at `docs/claude-code`. |
| GitHub Copilot Coding Agent | Reference for GitHub-native async/cloud coding workflows and model access paths. (The Copilot CLI itself is now an open-source primary reference above.) |
| Cursor | Reference for editor-native agent UX and codebase interaction. |
| Windsurf | Reference for IDE-agent workflow and user-facing product polish. |

## Study order

1. Aider - git/diff/edit loop and repo map.
2. OpenCode - terminal product shape and agent hierarchy.
3. Codex CLI - terminal operating model, approvals, sessions, MCP, and sandbox policy.
4. Kimi Code CLI - plugin/MCP/hook/ACP surfaces and fast TUI polish.
5. Gemini CLI - checkpointing, policy engine, trusted folders, token caching, and GitHub automation.
6. OpenHands - runtime, workspace, automation, browser-use, and control-center ideas.
7. Cline - approval UX, IDE patterns, SDK layering, Kanban, and eval pyramid.
8. Goose - Rust implementation, MCP-first extensions, recipes, and desktop/API surfaces.
9. SWE-agent and AutoCodeRover - benchmark design, localization, replay, cost reporting, and reproducibility.

## What to borrow vs avoid

### Borrow

- Product behaviors that improve safety, observability, and learning.
- Feature categories and evaluation ideas.
- Public APIs, documented workflows, and open-source architectural patterns.
- Testing and benchmark design.

### Avoid

- Copying source code from reference projects.
- Building every reference feature in v1.
- Treating Docker or cloud runtimes as mandatory.
- Replacing KQode's own VFS/sandbox-lite with an external runtime too early.
- Optimizing for daily-driver polish before the harness is demonstrable.

## KQode first-scope references

Use these references for the first implementation slice:

- Codex CLI for local terminal session shape.
- Aider for git-aware edit loop and auto lint/test feedback.
- OpenCode for build/plan agent separation.
- Kimi Code for TUI polish and hooks.
- Gemini CLI for checkpoint/rewind and policy ideas.
- SWE-agent for trace/eval artifacts.

Everything else is later proof-of-depth.

## Research workflow

Use `.agents/skills/kqode-research/SKILL.md` for repeatable source-grounded research over these repositories. The skill's default research scope is KQode's referenced coding-agent list from `blog/docs/01-KQode介绍.md` (Copilot CLI, Codex, Gemini CLI, OpenCode, Kimi Code, KimiX) plus Claude Code, which is read from a git-ignored local mirror at `docs/claude-code` and cited with internal repo-relative links. Research reports live under `docs/research` and should record analyzed commit SHAs (or mirror provenance), cite source evidence, separate observed reference behavior from KQode lessons, and preserve the no-source-copying boundary.
