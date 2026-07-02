---
sidebar_position: 2
title: KQode Development Workflow
---

In the previous article, we introduced KQode's goal. Before entering code implementation, we need to explain how this project will be developed: KQode is not built by designing the complete architecture up front and then implementing everything at once. Instead, it uses small runnable iterations to gradually build up the Coding Agent Harness.

This article comes before the concrete implementation because every next step will involve product judgment, architectural boundaries, code implementation, and verification. Without first agreeing on the development rhythm, and while heavily using Coding Agents for implementation, it would be easy to turn the project into a pile of assembled features rather than a long-term evolvable Agent Runtime.

## Why Start with the Development Workflow

A Coding Agent is not a normal CLI tool. It interacts with models, runs local commands, edits files, displays diffs, stores sessions, handles approvals, and recovers from failures. Any module may look like a reasonable place to start, but the wrong order can create a lot of rework.

KQode development follows several principles:

- Rust core first: the Agent Loop, tool registry, file-system edits, command execution, policy approvals, and session records all belong on the Rust side.
- Keep the TUI replaceable: the Ink frontend is responsible only for terminal interaction and does not own the core state machine.
- Do one verifiable small unit at a time: for example, first make local command execution work, then add tool result display, rather than implementing a full tool system at once.
- Reference existing Agents, but do not copy implementations: study product behavior and architecture tradeoffs from Copilot CLI, Claude Code, Codex CLI, Gemini CLI, OpenCode, and similar projects, while keeping KQode's implementation independent.
- Make it work locally first, then expand advanced capabilities: first build an Agent that works in the local terminal, then consider MCP, Subagents, IDE integration, browser automation, or cloud/runtime surfaces.

## Development Loop

Later articles will generally follow the same loop:

1. Clarify the real problem this small step solves.
2. Define the boundary between the Rust core and the TypeScript TUI.
3. Implement the smallest runnable version.
4. Run the corresponding build, test, or manual verification.
5. Record the architectural conclusion and the next step.

The point of this loop is to leave every step in a runnable, reversible, and extensible state. For an Agent Harness, many design issues only surface after the system actually runs, such as how tool output should be truncated, how approvals should block, how context should cite files, and how a conversation should continue after a failure.

## Designing and Implementing with Compound Engineering

KQode development heavily uses [compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin).

Before writing code, we use `ce-brainstorm` to turn vague ideas into requirements, then use `ce-plan` to turn those requirements into executable, reviewable, and verifiable plans.

Each plan item is reviewed one by one to confirm scope, boundaries, risks, and acceptance criteria before implementation starts. For example, the first Ink TUI homepage feature corresponds to the plan document `docs/plans/2026-06-25-003-feat-first-ink-tui-homepage-plan.md`, which organizes requirements, scope boundaries, technical constraints, context research, testing strategy, and task breakdown into reviewable checklist items.

This approach fits a project like KQode well. On one hand, we are indeed using Coding Agents to accelerate development. On the other hand, we do not want an Agent to jump directly from a vague instruction to code. Brainstorming first, planning next, and reviewing item by item lets humans control product direction and architectural boundaries, while also giving the Agent clearer context for more stable implementation.

After plan review, we split the plan into commit-sized units such as U1 and U2, then implement them one at a time through `ce-work`. After each small unit is implemented, it goes through both human and Agent review: on the Agent side, `ce-code-review` performs structured checks, and any discovered issues are fixed and verified again. Finally, I perform the final human review. Only after each commit has passed human review do we actually commit the code. This keeps development quality high while ensuring humans retain control over the overall project.

## Coding Agents and Models Used

In daily development, we mainly use [GitHub Copilot CLI](https://github.com/features/copilot/cli/) as the Coding Agent entry point. It runs in the terminal and works well for code search, edits, builds, tests, and commit preparation around the current repository. Its experience is also close to the local terminal Agent experience KQode aims to build.

For models, we mainly use GPT-5.5 and Claude Opus 4.8. GPT-5.5 is suitable for most code implementation, refactoring, and verification tasks. Claude Opus 4.8 is useful for complex architecture reasoning, long-context review, and high-risk design decisions. KQode will also reference this pattern of "tool entry point + multiple model capabilities + explicit plan constraints" as it gradually builds its own Agent Runtime.

## Evolving Docs and Code Together

This article series is not a retrospective tutorial written after the project is completed. It evolves alongside KQode development. Therefore, the articles will preserve some stage-specific judgments: some approaches may change later, and some modules may gradually split from simple implementations into independent crates.

The benefit is that readers can see a Coding Agent grow from scratch, rather than only seeing a polished final result. For learning Agent Runtime and Harness Engineering, the tradeoffs made along the way are often more important than the final code.

Next, we will enter the U1 development scaffolding stage and first create the Rust project, frontend TUI project, and automation command entry points. No matter how the UI changes, the core direction remains the same: Rust owns reusable and verifiable runtime capabilities, while the TUI presents those capabilities clearly to the user.
