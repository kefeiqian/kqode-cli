# KQode Platform Implementation Details

This file expands R85-R160 from `2026-06-25-kqode-requirements.md`.

## R85-R97. MCP, skills, plugins, and extensions

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R85 | MCP core | Implement MCP client and one KQode MCP server exposing a safe demo tool. | KQode can call its own MCP tool. |
| R86 | MCP transports | Start with stdio; add HTTP/SSE and OAuth later. | Stdio server works from config. |
| R87 | MCP config | Add conversational and file-based MCP management. | User can add/list/disable an MCP server. |
| R88 | MCP forwarding | Defer until ACP/IDE protocol exists. | Protocol has a field for client-provided MCP servers. |
| R89 | Skills | Load SKILL.md with description and instructions. | Skill appears in available skills list. |
| R90 | Skill token cost | Estimate instruction size and show it before load. | Skill list includes token estimate. |
| R91 | Plugins | Plugin manifest with id, version, source, trust, skills, MCP, hooks. | Local plugin can be installed disabled. |
| R92 | Plugin contributions | Allow plugins to contribute skills and MCP first; defer commands/hooks/themes. | Plugin skill loads after enable. |
| R93 | Plugin sources | Support local path first; URL/GitHub/marketplace later. | Local path install copies to managed plugin dir. |
| R94 | Plugin lifecycle | Enable, disable, update, remove, reload, inspect, validate. | Disabled plugin contributes nothing. |
| R95 | Plugin safety | Require trust confirmation; do not execute install-time code; constrain paths. | Unsafe symlink path is rejected. |
| R96 | Custom distros | Defer; keep config export/import clean. | Distribution config can be represented later. |
| R97 | Recipes | Add parameterized recipe file after custom commands exist. | Recipe dry-run explains required parameters. |

## R98-R108. Multi-agent and swarm

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R98 | Swarm workflows | Parent session can spawn child sessions. | Parent trace links to child trace. |
| R99 | Built-in roles | Define explorer, coder, tester, reviewer, debugger, context scout. | `/agent explorer` creates read-only child. |
| R100 | Custom agents | Load markdown/TOML agent definitions with prompt and policy metadata. | Custom reviewer agent appears in list. |
| R101 | Agent limits | Enforce max depth, max concurrent children, max steps, and budget. | Recursive fan-out is blocked at depth limit. |
| R102 | Control | Parent can inspect, steer, stop, close, and consolidate children. | User can stop a child task. |
| R103 | Navigation | TUI can navigate parent/child session tree. | User can switch to child thread and back. |
| R104 | Messaging | Add structured inter-agent messages and delegate tool. | Parent sends focused prompt to child. |
| R105 | Human expert | Add ask-human-expert tool that pauses for user input. | Child can escalate uncertainty. |
| R106 | Persistent teams | Defer; team config can reuse custom agent definitions. | No team state required for first swarm. |
| R107 | Kanban/worktrees | Defer until worktree and background daemon exist. | Worktree abstraction planned, not first scope. |
| R108 | Batch fan-out | Defer until eval runner needs it. | Structured task list schema exists. |

## R109-R118. Runtime, workspace, and automation

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R109 | Workspace backend | Local workspace through KQode VFS and sandbox-lite first; remote backends later. | Workspace trait supports local backend. |
| R110 | Ephemeral/worktree | Use temp copies or git worktrees for isolated tasks later. | Design does not assume one mutable workspace. |
| R111 | Server/API | Defer; core protocol should not assume TUI-only use. | Headless CLI uses same core events. |
| R112 | Background daemon | Defer until sessions are durable. | Long task can persist state before daemon exists. |
| R113 | Automation server | Defer; schedules can run headless CLI first. | Cron can call `kqode run` manually. |
| R114 | Lifecycle hooks | Implement hook event enum and runner after policy engine. | Pre-tool hook receives JSON payload. |
| R115 | Hook actions | Hooks can append context or block only on blockable events. | Blocking hook reason is shown to model/user. |
| R116 | Hook safety | Fail-open for advisory hooks; fail-closed only for policy engine. | Broken hook does not replace approval. |
| R117 | Schedule import/export | Defer with automation server. | Schedule schema can round-trip. |
| R118 | Remote/proactive | Defer; wait/sleep only after background sessions exist. | No proactive wakeups in first scope. |

## R119-R128. IDE, protocol, and ecosystem integrations

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R119 | ACP | Defer; keep JSON-RPC protocol close enough to map later. | Protocol has session, prompt, cancel, approval events. |
| R120 | Editor session control | Defer; share session service methods with TUI. | Session service is not TUI-specific. |
| R121 | Editor file routing | Defer; VFS can accept alternate file backend later. | VFS trait abstracts filesystem access. |
| R122 | IDE clients | Defer until terminal product is stable. | No IDE code in first milestones. |
| R123 | IDE diff UX | TUI diff UX should use same approval concepts. | Approval response supports edit/reject. |
| R124 | GitHub Actions | Defer; headless mode and eval runner are prerequisites. | CI can run local task suite first. |
| R125 | Chat connectors | Defer; sessions and auth must mature first. | Connector API not first scope. |
| R126 | Access control | Defer; design auth identity field now. | Session can record actor/source. |
| R127 | Desktop/mobile | Defer; keep protocol reusable by future surfaces. | TUI is not coupled to core internals. |
| R128 | Gateway/proxy | Defer; provider layer should permit routing. | Provider trait does not hardcode one vendor. |

## R129-R136. Multimodal and non-code automation

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R129 | Multimodal input | Represent attachments with path, MIME type, source, and text fallback. | Image attachment appears in trace metadata. |
| R130 | Video | Defer; accept file metadata first. | Video is rejected gracefully if unsupported. |
| R131 | Voice | Defer; prompt input path can accept transcript later. | No voice dependency in core. |
| R132 | Image generation/editing | Defer; plugin or skill surface later. | Not in first product scope. |
| R133 | Browser automation | Defer; Playwright can be a tool plugin later. | Browser tool can fit tool registry. |
| R134 | Computer control | Defer; requires stricter approval model. | Native control is not mixed with sandbox-lite. |
| R135 | Office docs | Defer; treat as artifact tools later. | DOCX/PDF/XLSX not core dependencies. |
| R136 | Charts/visualization | Defer; plugin extension later. | No chart engine in first milestones. |

## R137-R154. Observability and evaluation

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R137 | Traces | Emit local JSONL and summarized timeline. | Trace covers model, tool, approval, diff, checks. |
| R138 | OpenTelemetry | Defer; map trace fields to OTel later. | Local trace schema has stable IDs. |
| R139 | Analytics | Opt-in only; local disabled default. | User can permanently opt out. |
| R140 | Badcases | Save failed task, cause, trace link, and expected fix. | User can mark a session as badcase. |
| R141 | Local task suite | Define tasks against KQode repo with expected checks. | `kqode eval local` runs one task. |
| R142 | Eval categories | Build separate suites for coding, context, safety, multi-agent, replay, prompt injection. | Eval report groups results by category. |
| R143 | Deterministic tests | Unit/integration tests for parser, VFS, policy, sandbox-lite, replay. | Tests run without LLM. |
| R144 | Provider smoke | Small provider tests gated by env vars. | Missing credentials skip gracefully. |
| R145 | Reliability metrics | Compute pass rate, pass@k, flakiness, latency, throughput, cost. | Eval output has metrics JSON. |
| R146 | SWE-bench | Defer until local suite works. | Adapter design doc exists later. |
| R147 | Batch runs | Add skip/redo/resume/frozen config once eval runner exists. | Interrupted eval can resume. |
| R148 | Task sources | Support local task definitions first; GitHub issue later. | Local issue file becomes task input. |
| R149 | Localization | Defer AST/SBFL; start with search trace and fix-location notes. | Eval records files the agent selected. |
| R150 | Patch pipeline | Record candidate patches, chosen patch, applicability, and reviewer result. | Eval report can explain no-patch vs bad-patch. |
| R151 | Reproducer tests | Defer; add manual reproducer command first. | User can attach repro command to task. |
| R152 | Metadata | Record repo path, base commit, model, config, task source, timestamps, cost. | Each eval task writes metadata. |
| R153 | Repro env | Use sandbox-lite first; defer remote or VM-backed reproducible environments. | Eval notes environment requirements. |
| R154 | Public evidence | Generate Markdown report for README. | Report includes pass rate, cost, runtime. |

## R155-R160. Portfolio and scope boundaries

| Requirement | What to build | Implementation detail | First acceptance |
|---|---|---|---|
| R155 | JD coverage | Keep keyword coverage visible in README and docs. | README maps core features to Agent Infra terms. |
| R156 | JD signal map | Maintain a small table mapping KQode features to `job/all-jds.md` signals. | Portfolio doc names target signals. |
| R157 | Deferred areas | Keep advanced RAG, fine-tuning, serving, enterprise, GitHub automation, cross-device as later scope. | First roadmap labels deferred items. |
| R158 | Standalone product | Build from scratch; use references only as product research. | No copied source from reference agents. |
| R159 | Flagship demo | Dogfood a real KQode task. | Demo includes request, diff, check, trace. |
| R160 | Interview proof | Make artifacts explainable: design doc, trace, eval number, demo reel. | Interview packet can be generated from docs and traces. |
