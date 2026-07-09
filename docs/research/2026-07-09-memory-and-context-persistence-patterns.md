---
date: 2026-07-09
topic: memory-and-context-persistence-patterns
question: "How do reference coding agents save and recall short-term conversation memory, long-term user/project/repo memory, and user decisions?"
status: partial
---

# Memory and Context Persistence Patterns

## Summary

The strongest pattern across reference agents is a three-layer split: **session truth** remains an append-only or queryable transcript, **short-term continuity** is produced by compaction or per-session summaries, and **long-term memory** lives in inspectable files or a dedicated memory database/index rather than in project instruction files alone.

Gemini CLI and Claude Code have the closest user/project memory product shape: explicit memory commands, hierarchical memory scopes, private per-project memory, reviewable auto-extraction, query-time relevant-memory recall, and strict write-path allowlists. Codex has the most advanced database-backed cross-session memory pipeline, but it is experimental and job-oriented. OpenCode, Kimi Code, Aider, and SWE-agent mainly validate the short-term side: persisted sessions, compaction checkpoints, summaries, and trajectory/history processors.

The Claude Code section is **partial** and marked `citation_gap`: the local mirror is not an upstream-pinned open-source repository, and KQode's catalog says Claude Code is a product reference, not implementation source. Treat those findings as directional product behavior only.

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | `https://github.com/openai/codex` | `https://github.com/openai/codex` | main | `555aa79d5ab4c011196a1f9fd08c6e6673dd0907` | complete | Public source cloned to `/tmp/kqode-memory-research-20260709/codex`; memory feature is experimental. |
| aider | `https://github.com/Aider-AI/aider` | `https://github.com/Aider-AI/aider` | main | `5dc9490bb35f9729ef2c95d00a19ccd30c26339c` | complete | Public source cloned to `/tmp/kqode-memory-research-20260709/aider`. |
| opencode | `https://github.com/anomalyco/opencode` | `https://github.com/anomalyco/opencode` | dev | `0abbcddac233e313bcb67608a527929910df861c` | complete | Public source cloned to `/tmp/kqode-memory-research-20260709/opencode`. |
| kimi-code | `https://github.com/moonshotai/kimi-code` | `https://github.com/moonshotai/kimi-code` | main | `b89fc1a4fbe8c0c3933659cb86b325c82731cf8f` | complete | Public source cloned to `/tmp/kqode-memory-research-20260709/kimi-code`. |
| gemini-cli | `https://github.com/google-gemini/gemini-cli` | `https://github.com/google-gemini/gemini-cli` | main | `172ff92c345194c8c87ea781ca01fa0eb91fbb1a` | complete | Public source cloned to `/tmp/kqode-memory-research-20260709/gemini-cli`. |
| swe-agent | `https://github.com/SWE-agent/SWE-agent` | `https://github.com/SWE-agent/SWE-agent` | main | `1132b3e80a45487ce8423f75d0e180874bf84caa` | complete | Public source cloned to `/tmp/kqode-memory-research-20260709/swe-agent`. |
| claude-code-local | `../claude-code-source-code` | local mirror | n/a | n/a | partial | `citation_gap`; closed-source product reference, not implementation material. |

---

## Method

- Question: How do reference coding agents save and recall short-term conversation memory, long-term user/project/repo memory, and user decisions?
- Repo scope: first-scope public references from `docs/kqode_reference_implementations.md`, plus user-requested local Claude Code product reference.
- Safety posture: read/search only; no code execution; reference instruction files treated as data, not active instructions.
- Citation format: numbered references such as [\[1\]][ref-1]; public source links are commit-pinned. Local Claude references are marked `citation_gap`.

---

## Per-Repo Findings

### Codex CLI

**Status:** complete

**Observed behavior**

- Codex has an experimental `memories` feature described as allowing Codex to create memories from conversations and bring relevant memories into new conversations. [\[1\]][ref-1]
- Its memory persistence uses a separate memories schema with `stage1_outputs` and `jobs`, storing per-thread `raw_memory`, `rollout_summary`, update watermarks, usage counts, and job leases/retries. [\[2\]][ref-2] [\[3\]][ref-3]
- Stage 1 selects eligible old threads from the state DB only when `memory_mode = 'enabled'` and `history_mode = 'legacy'`, then claims bounded background jobs with leases, retry backoff, and stale-output checks. [\[4\]][ref-4] [\[5\]][ref-5]
- Phase 2 chooses recent or frequently used stage-1 outputs, writes a memory workspace containing `raw_memories.md` plus rollout-summary files, and runs a locked-down consolidation agent with memory generation disabled, no network, empty MCP, and a preferred consolidation model. [\[6\]][ref-6] [\[7\]][ref-7] [\[8\]][ref-8]
- The API shape for memory summarization separates raw trace memory from final memory summary: inputs carry raw traces and metadata, while outputs contain `raw_memory` and `memory_summary`. [\[9\]][ref-9]
- Short-term compaction is separate from long-term memory: the protocol has `Compact`, per-thread memory mode toggles, persisted `RolloutItem::Compacted`, optional `replacement_history`, and context-window IDs. [\[10\]][ref-10] [\[11\]][ref-11]
- Resume reconstructs history by scanning rollout items newest-to-oldest, treating compaction items with `replacement_history` as complete history checkpoints and replaying only the surviving tail. [\[12\]][ref-12] [\[13\]][ref-13]

**Evidence gaps**

- The report did not trace the UI for `/memories` end-to-end. The database/API/job shape is clear enough for architecture lessons, but product UX details are incomplete.

### Gemini CLI

**Status:** complete

**Observed behavior**

- Gemini models memory as hierarchical content with `global`, `extension`, `project`, and `userProjectMemory` tiers; the flattening order keeps these labels visible for display and legacy use. [\[14\]][ref-14]
- The memory manager refreshes global, extension, trusted-project, and user-project-private memory in parallel, deduplicates by file identity, categorizes content by source, appends MCP instructions into project memory, and blocks project memory in untrusted folders. [\[15\]][ref-15]
- Query-time JIT memory can discover additional `GEMINI.md` files upward from an accessed path, bounded by trusted roots and `.git`-like boundary markers, while avoiding files already loaded by identity. [\[16\]][ref-16]
- Discovery separates global memory under `~/.gemini`, private project memory under the per-project temp memory directory as `MEMORY.md` (with legacy `GEMINI.md` fallback), extension context files, and project `GEMINI.md` files discovered upward from trusted roots. [\[17\]][ref-17]
- `GEMINI.md` remains the configurable context/instruction filename, while `MEMORY.md` is the private project memory index stored under `storage.getProjectMemoryDir()`. [\[18\]][ref-18]
- Prompt assembly splits memory placement: global and private project memory go into the system instruction so mid-session saves can update it, while extension and project memory are injected into the first user message. [\[19\]][ref-19]
- The system prompt explicitly distinguishes shared `GEMINI.md` instructions from private `MEMORY.md`, includes routing rules, and warns that there is no `save_memory` tool in that prompt path. [\[20\]][ref-20]
- Auto Memory is experimental and review-gated: it scans idle sessions with enough user messages, builds a compact session index, runs a background extraction agent, writes candidates under `<projectMemoryDir>/.inbox/<kind>/`, records extraction state, and tells the user to review with `/memory inbox`; nothing is auto-applied. [\[21\]][ref-21] [\[22\]][ref-22]
- Memory inbox patch validation restricts private memory writes to direct markdown documents in the project memory directory and global memory writes to the exact global memory file, with unified-diff parsing and allowed-root checks. [\[23\]][ref-23]

**Evidence gaps**

- The report did not inspect the `InboxDialog` UI. The command and service layers show that candidates are reviewable, but the exact approval UI is not covered.

### OpenCode

**Status:** complete

**Observed behavior**

- OpenCode loads global and project instruction files (`AGENTS.md`, optionally `CLAUDE.md`, deprecated `CONTEXT.md`) into the system prompt, but targeted searches found no dedicated long-term user/project memory store comparable to Gemini's `MEMORY.md`. [\[24\]][ref-24]
- It can resolve nearby instruction files when reading a file, walking upward from the target path and attaching newly found instruction files once per assistant message. [\[25\]][ref-25]
- Session storage is first-class: sessions expose methods for create, fork, get, set summary, list messages, remove messages/parts, and find messages; storage migrates older JSON files into project/session/message/part directories. [\[26\]][ref-26] [\[27\]][ref-27]
- Compaction is a persisted session task: user messages can carry a `compaction` part, assistant messages can be marked `summary`, and `filterCompacted` reconstructs model input as compaction request + summary + retained tail + later messages. [\[28\]][ref-28] [\[29\]][ref-29]
- The compaction service selects a recent-tail budget, strips or truncates tool output, sends a compaction prompt, stores the summary as a summary assistant message, patches `tail_start_id`, and optionally auto-continues with a synthetic user prompt. [\[30\]][ref-30] [\[31\]][ref-31] [\[32\]][ref-32]
- The compaction prompt is an anchored summarization prompt: summarize only given history, merge any previous summary, keep exact paths/IDs, and do not answer the conversation. [\[33\]][ref-33]

**Evidence gaps**

- No long-term memory feature was found in targeted searches. This is a negative finding with medium confidence because the repo is large and the search focused on `packages/opencode/src`.

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- Kimi stores runtime data under `~/.kimi-code`, including `AGENTS.md`, skills, `session_index.jsonl`, and sessions under `sessions/<workDirKey>/<sessionId>/`; each session contains `state.json`, `agents/main/wire.jsonl`, per-agent wire logs, tasks, cron, and diagnostics. [\[34\]][ref-34]
- The session store creates per-workdir session directories, appends a global JSONL session index, lists by workdir/session/all, and can rebuild/repair the index from self-describing `state.json` files. [\[35\]][ref-35] [\[36\]][ref-36] [\[37\]][ref-37]
- Session summaries derive updated time from `state.json`, root `wire.jsonl`, and nested agent `wire.jsonl` mtimes, keeping session list state tied to append-only communication records. [\[38\]][ref-38]
- Each agent gets a filesystem record persistence at `<agent homedir>/wire.jsonl`; records are appended as JSONL, flushed with fsync, and corrupted trailing lines are tolerated while non-trailing corrupt lines fail. [\[39\]][ref-39] [\[40\]][ref-40]
- Full compaction rewrites live context through a single `ContextMemory.applyCompaction` derivation point: keep real user inputs within a budget, optionally split oldest head and recent tail with an elision marker, append a prefixed user-role summary, log `context.apply_compaction`, and clear pending/deferred tool state. [\[41\]][ref-41] [\[42\]][ref-42] [\[43\]][ref-43]
- Full compaction refuses manual compaction during an active turn, records begin/cancel/complete events, handles provider context overflow by shrinking summarizer input, reports dropped messages as a blind spot, checks for prefix races before applying, and records telemetry. [\[44\]][ref-44] [\[45\]][ref-45] [\[46\]][ref-46]
- Session bootstrap loads AGENTS/system context through a dedicated persistence-backed filesystem, warns on oversized `AGENTS.md`, and explicitly neutralizes stale plugin session-start guidance when a compaction summary may have folded old plugin instructions into context. [\[47\]][ref-47]

**Evidence gaps**

- No dedicated Kimi long-term memory store beyond AGENTS, skills, sessions, and agent context was found in the inspected paths. Kimi's strongest evidence here is session persistence plus compaction correctness.

### Aider

**Status:** complete

**Observed behavior**

- Aider exposes `--max-chat-history-tokens`, input history, markdown chat history, `--restore-chat-history`, and optional LLM history files; default chat history files live at `.aider.chat.history.md` in the git root or current directory. [\[48\]][ref-48]
- Aider restores prior markdown chat history only when requested, parses it into `done_messages`, and starts summarization when that history is too large. [\[49\]][ref-49] [\[50\]][ref-50]
- Its request assembly orders chunks as system, examples, read-only files, repo map, done history, chat files, current messages, and reminders. [\[51\]][ref-51] [\[52\]][ref-52]
- The chat summarizer recursively summarizes older head messages, preserves a tail, falls back across weak/main models, and emits a user-role summary prefixed as prior conversation. [\[53\]][ref-53]
- Completed current messages are moved into `done_messages`; if summarization is needed it runs in a background thread and only replaces `done_messages` if the source history has not changed. [\[54\]][ref-54]
- Markdown chat history is append-only text written by the IO layer, and restore reparses `####` user markers and quoted/tool lines back into messages. [\[55\]][ref-55] [\[56\]][ref-56]

**Evidence gaps**

- Aider does not appear to have a dedicated long-term memory taxonomy or project memory store in the inspected paths; the relevant comparison is short-term chat history, repo map, and summarization.

### SWE-agent

**Status:** complete

**Observed behavior**

- SWE-agent's memory-like mechanism is configurable history processing, not user/project memory: `DefaultHistoryProcessor` leaves history unchanged, `LastNObservations` elides older observations, and other processors tag tool observations, add cache-control, remove regex-matched content, or parse images. [\[57\]][ref-57] [\[58\]][ref-58]
- `DefaultAgent.messages` filters agent history, applies the configured history processors in order, and sends the processed history to the model. [\[59\]][ref-59] [\[60\]][ref-60]
- Every step appends assistant action and user/tool observation messages to history, and trajectories save `trajectory`, full `history`, and `info` to `.traj` JSON files after each step. [\[61\]][ref-61] [\[62\]][ref-62]
- The docs explicitly describe `.traj` files as containing thought/action/observation turns and, for debugging, the exact `query` shown to the LM at each step. [\[63\]][ref-63]
- The history processor docs describe processors as filters for history/trajectory before querying the model, e.g. stripping old observations to reduce context. [\[64\]][ref-64]

**Evidence gaps**

- SWE-agent is benchmark-oriented; no interactive user/repo long-term memory feature was found in the inspected paths.

### Claude Code (product reference -- local mirror)

**Status:** partial (`citation_gap`)

**Observed behavior**

- The local mirror has a `/memory` command that opens a selector for memory files, creates the selected file if needed, and opens it in the user's editor. This is product-behavior evidence only, not implementation material. [\[65\]][ref-65]
- Its memory selector distinguishes user memory (`~/.claude/CLAUDE.md`), project memory (`./CLAUDE.md`), imported/nested memory, auto-memory folders, team memory folders, and agent-specific memory folders. [\[66\]][ref-66]
- Auto-memory uses a typed file taxonomy (`user`, `feedback`, `project`, `reference`) and explicitly says memory should capture context not derivable from current project state; it also tells the model when to access memories and to verify current file/function/flag claims before acting on recalled memory. [\[67\]][ref-67]
- Auto-memory files are scanned by reading markdown frontmatter from up to 200 memory files, formatting a manifest for query-time recall and extraction. [\[68\]][ref-68]
- Query-time recall asks a side model to select up to five clearly useful memory files from the manifest, filters already-surfaced files, and injects relevant-memory attachments without blocking the main turn. [\[69\]][ref-69] [\[70\]][ref-70]
- Background extraction runs a forked memory-extraction agent on recent messages, skips when the main agent already wrote memory, restricts tools to read-only exploration plus Edit/Write inside the memory directory, and notifies when memory files were saved. [\[71\]][ref-71] [\[72\]][ref-72]
- Session memory is separate from long-term memory: it writes a per-session markdown file after token/tool thresholds using a forked agent allowed to edit only that exact session-memory file, and manual extraction is used by `/summary`. [\[73\]][ref-73]
- Compaction creates compact-boundary messages, summary messages, restored attachments, hook outputs, and telemetry; post-compaction re-injects current files, plan state, invoked skills, deferred tools, agent listings, MCP instructions, and session-start hooks. [\[74\]][ref-74]

**Evidence gaps**

- `citation_gap`: local mirror only, no upstream-pinned SHA. KQode's own catalog says Claude Code should be treated as a product benchmark and that leaked/proprietary source must not be used as implementation material. [\[75\]][ref-75]

---

## Cross-Repo Comparison

| Dimension | Codex | Gemini CLI | OpenCode | Kimi Code | Aider | SWE-agent | Claude Code local | Confidence |
|---|---|---|---|---|---|---|---|---|
| Short-term conversation continuity | Rollout JSONL plus compaction checkpoints and reconstruction. [\[10\]][ref-10] [\[12\]][ref-12] | Conversation/session system outside this report; memory itself is prompt-injected. [\[19\]][ref-19] | Persisted session messages/parts plus compaction summaries and tail pointers. [\[28\]][ref-28] [\[29\]][ref-29] | `wire.jsonl` records plus full context compaction. [\[39\]][ref-39] [\[41\]][ref-41] | `done_messages`/`cur_messages`, optional markdown restore, and recursive summarization. [\[49\]][ref-49] [\[53\]][ref-53] | Full history plus processors and trajectory query snapshots. [\[59\]][ref-59] [\[63\]][ref-63] | Session memory plus compact boundaries. [\[73\]][ref-73] [\[74\]][ref-74] | high for public repos; partial for Claude |
| Long-term memory storage | Experimental memories DB plus raw/summary workspace. [\[2\]][ref-2] [\[6\]][ref-6] | Global, project, extension, and private project memory files. [\[14\]][ref-14] [\[17\]][ref-17] | No dedicated store found; instruction files only. [\[24\]][ref-24] | No dedicated store found; sessions and AGENTS/skills. [\[34\]][ref-34] | No dedicated store found. [\[48\]][ref-48] | No dedicated store found. [\[57\]][ref-57] | Typed auto-memory files, team/private/agent folders. [\[66\]][ref-66] [\[67\]][ref-67] | medium |
| Memory save workflow | Background stage jobs plus consolidation. [\[4\]][ref-4] [\[8\]][ref-8] | Background extraction writes reviewable `.patch` files in inbox. [\[21\]][ref-21] [\[23\]][ref-23] | Not found. | Not found. | Not found. | Not found. | Main-agent direct writes plus background extraction; restricted write tools. [\[71\]][ref-71] [\[72\]][ref-72] | high for Gemini; partial for Claude |
| Query-time recall | Consolidated memory appears intended for new conversations; exact injection not fully traced. [\[1\]][ref-1] | Memory is loaded into system/first-user message; JIT directory memory loads on accessed paths. [\[16\]][ref-16] [\[19\]][ref-19] | Instruction JIT on file read. [\[25\]][ref-25] | System context from AGENTS/profile. [\[47\]][ref-47] | Repo map and selected files, not memory recall. [\[51\]][ref-51] | History processors, not memory recall. [\[59\]][ref-59] | Side-model selects up to five relevant memory files, injected as attachments. [\[69\]][ref-69] [\[70\]][ref-70] | medium |
| User decisions/preferences | Captured if memory extraction identifies them; job pipeline is generic. [\[9\]][ref-9] | Explicit private project and global memory; prompt separates user/project tiers. [\[19\]][ref-19] [\[20\]][ref-20] | No dedicated decision memory found. | No dedicated decision memory found. | Only current chat/history. [\[49\]][ref-49] | Not product-oriented. | Explicit `feedback` memory type and direct remember/forget guidance. [\[67\]][ref-67] [\[72\]][ref-72] | medium |
| Safety/write constraints | Consolidation sandbox has local memory-root write access and no network. [\[8\]][ref-8] | Inbox patches validated against exact allowed memory roots. [\[23\]][ref-23] | Compaction/prune logic only mutates session parts. [\[31\]][ref-31] | Append/fdatasync wire records and explicit compaction race guards. [\[40\]][ref-40] [\[45\]][ref-45] | User-confirmed normal agent flow; no memory write path. | Offline benchmark trajectories. | Extraction/session-memory agents have narrow allowed tools/paths. [\[72\]][ref-72] [\[73\]][ref-73] | high |

---

## KQode Lessons

### Product behavior

- **Do not make `AGENTS.md` carry every kind of memory.** Use AGENTS-like files for instructions and conventions, but create a dedicated memory surface for remembered facts, decisions, preferences, gotchas, and references. Gemini's `GEMINI.md` vs private `MEMORY.md` split and Claude's typed memory files both support this separation. [\[18\]][ref-18] [\[20\]][ref-20] [\[67\]][ref-67]
- **Expose memory as inspectable, editable files plus a command surface.** Users should be able to view, edit, delete, and correct memory; KQode already names this in R35-R36, and the strongest references expose `/memory show/list/reload/inbox` or `/memory` editor flows. [\[19\]][ref-19] [\[21\]][ref-21] [\[65\]][ref-65] [\[76\]][ref-76]
- **Treat user decisions as a first-class memory type, not just transcript residue.** A durable decision should store the decision, why it was made, how to apply it, scope, citations, and staleness; transient task steps should stay in the session/plan/task tracker. Claude's `feedback` and `project` types are a useful product benchmark, while Gemini's private project memory gives the storage analogue. [\[19\]][ref-19] [\[67\]][ref-67]
- **Recall must be selective.** Loading a short memory index by default and selecting deeper files only when relevant avoids dumping the whole memory directory into every prompt. Claude's manifest + side-model selector and Gemini's JIT memory both converge on bounded recall. [\[16\]][ref-16] [\[68\]][ref-68] [\[69\]][ref-69]

### Architecture implications

- **Keep session truth, compaction state, and long-term memory separate.** KQode's current local-session and auto-compaction plans already point in the right direction: append-only session JSONL is replay truth, compaction summaries are request-shaping state, and long-term memory should be a separate inspectable corpus with a rebuildable SQLite index. Codex, Kimi, and OpenCode all separate persisted session records from compaction projections. [\[11\]][ref-11] [\[12\]][ref-12] [\[28\]][ref-28] [\[39\]][ref-39]
- **Use file memory as truth, SQLite as index/search metadata.** This matches KQode's existing "JSONL truth + SQLite index" posture and R35's "inspectable files plus SQLite index." Codex's memory DB is powerful but less user-inspectable; Gemini/Claude-style files make correction and review easier. [\[2\]][ref-2] [\[17\]][ref-17] [\[23\]][ref-23] [\[76\]][ref-76]
- **Add scopes explicitly: user-global, repo/project, folder/subtree, team/shared, session, agent-specific.** Gemini and Claude show that scope is the product; without it, agents duplicate facts into the wrong place or leak repo-specific preferences across workspaces. [\[14\]][ref-14] [\[17\]][ref-17] [\[66\]][ref-66] [\[77\]][ref-77]
- **Review before applying automatic memory.** Gemini's inbox is the safest baseline for KQode v1: record candidates from sessions, validate patch targets, and require user approval before modifying durable memory. Claude's direct-write extraction is more ambitious, but it should be a later mode after KQode has correction/audit UI. [\[21\]][ref-21] [\[23\]][ref-23] [\[71\]][ref-71]
- **Memory writes need a dedicated policy gate.** Use a memory-specific write tool or VFS path class that allows only memory roots, never broad shell writes. Gemini and Claude both restrict memory patch/extraction writes to memory locations. [\[23\]][ref-23] [\[72\]][ref-72] [\[73\]][ref-73]
- **Compaction restore must be deterministic.** Kimi's "single derivation point" and Codex's replacement-history checkpoint are the strongest patterns for KQode's current compaction plan: persist enough metadata so live context, JSONL replay, and request assembly produce the same shape. [\[12\]][ref-12] [\[41\]][ref-41] [\[43\]][ref-43]

### Evaluation ideas

- **Memory routing evals:** Given a fact, the agent must choose exactly one target: user-global, repo/project, team, session, plan/task, or no memory.
- **Memory drift evals:** A remembered file/function/flag is stale; the agent must verify before recommending it. Claude's prompt explicitly teaches this failure mode. [\[67\]][ref-67]
- **Auto-extraction review evals:** Long transcript contains three candidate memories and two non-memories; the extraction pipeline should create reviewable candidates without applying them.
- **Compaction/resume evals:** Multi-compact sessions must replay to the same request shape after restart, with retained tail and summary boundaries intact. [\[12\]][ref-12] [\[29\]][ref-29] [\[41\]][ref-41]
- **Privacy/scope evals:** A personal preference must not be written to a committed team memory file; a team convention must not be hidden in user-private memory.

### Risks and tradeoffs

- **Over-saving is worse than under-saving for trust.** Memory that records derivable code structure, stale status, or personal judgments becomes noise and can mislead future work. Claude's taxonomy explicitly says memory should capture context not derivable from current project state. [\[67\]][ref-67]
- **Auto-memory has prompt-injection risk.** Gemini's inbox summary fences pending patch content and validates patch roots; KQode should treat past sessions and memory files as untrusted data, not active instructions. [\[21\]][ref-21] [\[23\]][ref-23]
- **Long-term memory can fight plans.** KQode should keep active implementation decisions in `docs/plans/` or session tasks while the work is live; memory should store durable rationale and cross-session facts after they are settled.
- **Committed repo memory vs private project memory is a product decision.** Committed memory helps teams, but it needs stricter review and should avoid personal preferences or secrets. Private project memory is safer for individual workflow facts.

---

## Implications for the Current KQode Plans

The two active plans cover only part of the memory stack:

- `docs/plans/2026-07-08-001-feat-local-session-resume-plan.md` covers durable session identity and replay.
- `docs/plans/2026-07-09-001-feat-conversation-history-and-auto-compaction-plan.md` covers full request history and short-term compaction.

The missing follow-up should be a dedicated **local memory system** plan, not another addition to AGENTS.md:

1. **Session memory:** derived from the current transcript and compaction state; useful for continuing a session and `/summary`, not automatically promoted to long-term memory.
2. **Long-term memory files:** user-global and repo/project-scoped inspectable files with a concise index plus topic files.
3. **Decision memory:** a typed memory class for user decisions, project decisions, and badcases, including why/how-to-apply and citations.
4. **Candidate extraction log/inbox:** deferred auto-extraction that records candidates first, then applies only after review.
5. **Bounded recall:** load only index/metadata by default, then select/read a small number of relevant memory files for the turn.
6. **Traceability:** every loaded memory fragment should carry source path, scope, timestamp, token estimate, and whether it was user-authored, agent-authored, reviewed, or candidate-only.

---

## Evidence Gaps

- Claude Code local mirror: `citation_gap`; no upstream-pinned SHA and not implementation material.
- Codex: UI and exact runtime injection of consolidated memories into new conversations were not fully traced.
- OpenCode/Kimi/Aider/SWE-agent: targeted searches found little or no dedicated long-term memory surface; the report treats them mainly as session/compaction references.
- Kimi Code: line numbers are from current public source, but only `packages/agent-core` and docs were deeply inspected.

---

## References

Body citations use these numbered source references; each entry keeps public source URLs commit-pinned where possible.

- <a id="ref-1"></a>[1] Codex CLI: experimental `memories` feature description ([code](https://github.com/openai/codex/blob/555aa79d5ab4c011196a1f9fd08c6e6673dd0907/codex-rs/features/src/lib.rs#L924-L929)).
- <a id="ref-2"></a>[2] Codex CLI: memories schema with `stage1_outputs` and `jobs` ([code](https://github.com/openai/codex/blob/555aa79d5ab4c011196a1f9fd08c6e6673dd0907/codex-rs/state/memory_migrations/0001_memories.sql#L1-L24)).
- <a id="ref-3"></a>[3] Codex CLI: stage-1 output model fields ([code](https://github.com/openai/codex/blob/555aa79d5ab4c011196a1f9fd08c6e6673dd0907/codex-rs/state/src/model/memories.rs#L1-L45)).
- <a id="ref-4"></a>[4] Codex CLI: selecting eligible memory stage-1 jobs from enabled legacy threads ([code](https://github.com/openai/codex/blob/555aa79d5ab4c011196a1f9fd08c6e6673dd0907/codex-rs/state/src/runtime/memories.rs#L111-L206)).
- <a id="ref-5"></a>[5] Codex CLI: claiming stage-1 jobs with leases and retry semantics ([code](https://github.com/openai/codex/blob/555aa79d5ab4c011196a1f9fd08c6e6673dd0907/codex-rs/state/src/runtime/memories.rs#L620-L780)).
- <a id="ref-6"></a>[6] Codex CLI: phase-2 input selection by usage/recency ([code](https://github.com/openai/codex/blob/555aa79d5ab4c011196a1f9fd08c6e6673dd0907/codex-rs/state/src/runtime/memories.rs#L260-L342)).
- <a id="ref-7"></a>[7] Codex CLI: rebuilding raw memory and rollout-summary files from DB rows ([code](https://github.com/openai/codex/blob/555aa79d5ab4c011196a1f9fd08c6e6673dd0907/codex-rs/memories/write/src/storage.rs#L1-L75)).
- <a id="ref-8"></a>[8] Codex CLI: phase-2 consolidation agent locked to local memory workspace with no network ([code](https://github.com/openai/codex/blob/555aa79d5ab4c011196a1f9fd08c6e6673dd0907/codex-rs/memories/write/src/phase2.rs#L300-L331)).
- <a id="ref-9"></a>[9] Codex CLI: memory summarization API input/output types ([code](https://github.com/openai/codex/blob/555aa79d5ab4c011196a1f9fd08c6e6673dd0907/codex-rs/codex-api/src/common.rs#L46-L70)).
- <a id="ref-10"></a>[10] Codex CLI: `Compact` operation and thread memory mode protocol ([code](https://github.com/openai/codex/blob/555aa79d5ab4c011196a1f9fd08c6e6673dd0907/codex-rs/protocol/src/protocol.rs#L650-L683)).
- <a id="ref-11"></a>[11] Codex CLI: `RolloutItem::Compacted` and `CompactedItem` fields ([code](https://github.com/openai/codex/blob/555aa79d5ab4c011196a1f9fd08c6e6673dd0907/codex-rs/protocol/src/protocol.rs#L3107-L3158)).
- <a id="ref-12"></a>[12] Codex CLI: rollout reconstruction scans compaction checkpoints in reverse ([code](https://github.com/openai/codex/blob/555aa79d5ab4c011196a1f9fd08c6e6673dd0907/codex-rs/core/src/session/rollout_reconstruction.rs#L100-L210)).
- <a id="ref-13"></a>[13] Codex CLI: replaying suffix after replacement-history compaction ([code](https://github.com/openai/codex/blob/555aa79d5ab4c011196a1f9fd08c6e6673dd0907/codex-rs/core/src/session/rollout_reconstruction.rs#L286-L330)).
- <a id="ref-14"></a>[14] Gemini CLI: hierarchical memory type and flattening order ([code](https://github.com/google-gemini/gemini-cli/blob/172ff92c345194c8c87ea781ca01fa0eb91fbb1a/packages/core/src/config/memory.ts#L7-L39)).
- <a id="ref-15"></a>[15] Gemini CLI: memory manager discovery, loading, categorization, and trusted-folder gating ([code](https://github.com/google-gemini/gemini-cli/blob/172ff92c345194c8c87ea781ca01fa0eb91fbb1a/packages/core/src/context/memoryContextManager.ts#L31-L108)).
- <a id="ref-16"></a>[16] Gemini CLI: JIT subdirectory memory discovery from accessed paths ([code](https://github.com/google-gemini/gemini-cli/blob/172ff92c345194c8c87ea781ca01fa0eb91fbb1a/packages/core/src/context/memoryContextManager.ts#L113-L173)).
- <a id="ref-17"></a>[17] Gemini CLI: global, private project, extension, and environment memory path discovery ([code](https://github.com/google-gemini/gemini-cli/blob/172ff92c345194c8c87ea781ca01fa0eb91fbb1a/packages/core/src/utils/memoryDiscovery.ts#L317-L459)).
- <a id="ref-18"></a>[18] Gemini CLI: `GEMINI.md` context filename and project `MEMORY.md` index paths ([code](https://github.com/google-gemini/gemini-cli/blob/172ff92c345194c8c87ea781ca01fa0eb91fbb1a/packages/core/src/tools/memoryTool.ts#L7-L100)).
- <a id="ref-19"></a>[19] Gemini CLI: system-instruction memory vs first-user-message memory placement ([code](https://github.com/google-gemini/gemini-cli/blob/172ff92c345194c8c87ea781ca01fa0eb91fbb1a/packages/core/src/config/config.ts#L2527-L2599)).
- <a id="ref-20"></a>[20] Gemini CLI: prompt guidance distinguishing `GEMINI.md`, `MEMORY.md`, routing, and no `save_memory` tool ([code](https://github.com/google-gemini/gemini-cli/blob/172ff92c345194c8c87ea781ca01fa0eb91fbb1a/packages/core/src/prompts/snippets-memory.test.ts#L1-L80)).
- <a id="ref-21"></a>[21] Gemini CLI: Auto Memory scans eligible past sessions and runs a background extraction agent ([code](https://github.com/google-gemini/gemini-cli/blob/172ff92c345194c8c87ea781ca01fa0eb91fbb1a/packages/core/src/services/memoryService.ts#L1126-L1450)).
- <a id="ref-22"></a>[22] Gemini CLI: `experimental.autoMemory` schema says patches are held for review in `/memory inbox` ([code](https://github.com/google-gemini/gemini-cli/blob/172ff92c345194c8c87ea781ca01fa0eb91fbb1a/schemas/settings.schema.json#L3512-L3514)).
- <a id="ref-23"></a>[23] Gemini CLI: memory inbox patch allowed roots and validation ([code](https://github.com/google-gemini/gemini-cli/blob/172ff92c345194c8c87ea781ca01fa0eb91fbb1a/packages/core/src/services/memoryPatchUtils.ts#L279-L434)).
- <a id="ref-24"></a>[24] OpenCode: global/project instruction-file discovery ([code](https://github.com/anomalyco/opencode/blob/0abbcddac233e313bcb67608a527929910df861c/packages/opencode/src/session/instruction.ts#L61-L130)).
- <a id="ref-25"></a>[25] OpenCode: nearby instruction resolution on file reads ([code](https://github.com/anomalyco/opencode/blob/0abbcddac233e313bcb67608a527929910df861c/packages/opencode/src/session/instruction.ts#L193-L237)).
- <a id="ref-26"></a>[26] OpenCode: session service interface for messages, summaries, fork, and mutation ([code](https://github.com/anomalyco/opencode/blob/0abbcddac233e313bcb67608a527929910df861c/packages/opencode/src/session/session.ts#L420-L452)).
- <a id="ref-27"></a>[27] OpenCode: JSON storage migrations for project/session/message/part data ([code](https://github.com/anomalyco/opencode/blob/0abbcddac233e313bcb67608a527929910df861c/packages/opencode/src/storage/storage.ts#L1-L260)).
- <a id="ref-28"></a>[28] OpenCode: session fork copies compaction tail pointers ([code](https://github.com/anomalyco/opencode/blob/0abbcddac233e313bcb67608a527929910df861c/packages/opencode/src/session/session.ts#L680-L728)).
- <a id="ref-29"></a>[29] OpenCode: `filterCompacted` reconstructs model input around compaction summaries and retained tail ([code](https://github.com/anomalyco/opencode/blob/0abbcddac233e313bcb67608a527929910df861c/packages/opencode/src/session/message-v2.ts#L521-L568)).
- <a id="ref-30"></a>[30] OpenCode: compaction tail budget and completed summary detection ([code](https://github.com/anomalyco/opencode/blob/0abbcddac233e313bcb67608a527929910df861c/packages/opencode/src/session/compaction.ts#L1-L103)).
- <a id="ref-31"></a>[31] OpenCode: compaction selection and pruning mechanics ([code](https://github.com/anomalyco/opencode/blob/0abbcddac233e313bcb67608a527929910df861c/packages/opencode/src/session/compaction.ts#L150-L330)).
- <a id="ref-32"></a>[32] OpenCode: compaction processing, summary assistant message, tail patch, and auto-continue ([code](https://github.com/anomalyco/opencode/blob/0abbcddac233e313bcb67608a527929910df861c/packages/opencode/src/session/compaction.ts#L330-L513)).
- <a id="ref-33"></a>[33] OpenCode: anchored compaction prompt ([code](https://github.com/anomalyco/opencode/blob/0abbcddac233e313bcb67608a527929910df861c/packages/opencode/src/agent/prompt/compaction.txt#L1-L10)).
- <a id="ref-34"></a>[34] Kimi Code: documented data root and session directory layout ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/docs/en/configuration/data-locations.md#L1-L112)).
- <a id="ref-35"></a>[35] Kimi Code: session create and index append ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/packages/agent-core/src/session/store/session-store.ts#L36-L75)).
- <a id="ref-36"></a>[36] Kimi Code: append-only session index path and validation ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/packages/agent-core/src/session/store/session-index.ts#L1-L69)).
- <a id="ref-37"></a>[37] Kimi Code: listing all sessions and reindex behavior ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/packages/agent-core/src/session/store/session-store.ts#L183-L222)).
- <a id="ref-38"></a>[38] Kimi Code: session summary updated time from state and wire logs ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/packages/agent-core/src/session/store/session-store.ts#L411-L433)).
- <a id="ref-39"></a>[39] Kimi Code: agent wire record persistence setup ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/packages/agent-core/src/agent/index.ts#L193-L201)).
- <a id="ref-40"></a>[40] Kimi Code: JSONL wire persistence read/append/flush and truncated-tail tolerance ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/packages/agent-core/src/agent/records/persistence.ts#L48-L126)).
- <a id="ref-41"></a>[41] Kimi Code: `ContextMemory.applyCompaction` single derivation point ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/packages/agent-core/src/agent/context/index.ts#L239-L355)).
- <a id="ref-42"></a>[42] Kimi Code: compaction handoff helper rationale and real-user-input policy ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/packages/agent-core/src/agent/compaction/handoff.ts#L1-L47)).
- <a id="ref-43"></a>[43] Kimi Code: head/tail user message selection and elision marker ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/packages/agent-core/src/agent/compaction/handoff.ts#L220-L345)).
- <a id="ref-44"></a>[44] Kimi Code: full-compaction begin/cancel guards ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/packages/agent-core/src/agent/compaction/full.ts#L148-L210)).
- <a id="ref-45"></a>[45] Kimi Code: compaction generation, overflow shrink, race checks, and apply path ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/packages/agent-core/src/agent/compaction/full.ts#L385-L570)).
- <a id="ref-46"></a>[46] Kimi Code: compaction success/failure telemetry and hooks ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/packages/agent-core/src/agent/compaction/full.ts#L570-L640)).
- <a id="ref-47"></a>[47] Kimi Code: AGENTS bootstrap warning and stale plugin reminder neutralization after compaction ([code](https://github.com/moonshotai/kimi-code/blob/b89fc1a4fbe8c0c3933659cb86b325c82731cf8f/packages/agent-core/src/session/index.ts#L540-L688)).
- <a id="ref-48"></a>[48] Aider: max chat history tokens and history file flags ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/args.py#L220-L294)).
- <a id="ref-49"></a>[49] Aider: restoring markdown chat history into `done_messages` ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L510-L523)).
- <a id="ref-50"></a>[50] Aider: markdown chat history parsing ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/utils.py#L148-L190)).
- <a id="ref-51"></a>[51] Aider: chat chunk request order ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/chat_chunks.py#L1-L23)).
- <a id="ref-52"></a>[52] Aider: assembling system/history/repo/file/current chunks ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1226-L1298)).
- <a id="ref-53"></a>[53] Aider: recursive chat summarizer and summary prompt ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/history.py#L1-L123)).
- <a id="ref-54"></a>[54] Aider: summarization thread and moving current messages into done history ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1002-L1046)).
- <a id="ref-55"></a>[55] Aider: markdown chat history append path ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/io.py#L1118-L1138)).
- <a id="ref-56"></a>[56] Aider: model-derived max chat history token defaults ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/models.py#L330-L365)).
- <a id="ref-57"></a>[57] SWE-agent: default and last-N observation history processors ([code](https://github.com/SWE-agent/SWE-agent/blob/1132b3e80a45487ce8423f75d0e180874bf84caa/sweagent/agent/history_processors.py#L74-L131)).
- <a id="ref-58"></a>[58] SWE-agent: additional history processors for windows, cache control, regex removal, and images ([code](https://github.com/SWE-agent/SWE-agent/blob/1132b3e80a45487ce8423f75d0e180874bf84caa/sweagent/agent/history_processors.py#L180-L335)).
- <a id="ref-59"></a>[59] SWE-agent: `DefaultAgent.messages` applies history processors ([code](https://github.com/SWE-agent/SWE-agent/blob/1132b3e80a45487ce8423f75d0e180874bf84caa/sweagent/agent/agents.py#L440-L556)).
- <a id="ref-60"></a>[60] SWE-agent: model query receives processed history ([code](https://github.com/SWE-agent/SWE-agent/blob/1132b3e80a45487ce8423f75d0e180874bf84caa/sweagent/agent/agents.py#L1018-L1050)).
- <a id="ref-61"></a>[61] SWE-agent: action/observation history append ([code](https://github.com/SWE-agent/SWE-agent/blob/1132b3e80a45487ce8423f75d0e180874bf84caa/sweagent/agent/agents.py#L640-L760)).
- <a id="ref-62"></a>[62] SWE-agent: trajectory saving with history and info ([code](https://github.com/SWE-agent/SWE-agent/blob/1132b3e80a45487ce8423f75d0e180874bf84caa/sweagent/agent/agents.py#L1210-L1298)).
- <a id="ref-63"></a>[63] SWE-agent: trajectory docs describe thought/action/observation and exact LM query ([code](https://github.com/SWE-agent/SWE-agent/blob/1132b3e80a45487ce8423f75d0e180874bf84caa/docs/usage/trajectories.md#L1-L42)).
- <a id="ref-64"></a>[64] SWE-agent: history processor docs ([code](https://github.com/SWE-agent/SWE-agent/blob/1132b3e80a45487ce8423f75d0e180874bf84caa/docs/reference/history_processor_config.md#L1-L15)).
- <a id="ref-65"></a>[65] Claude Code local mirror: `/memory` editor command (`../claude-code-source-code/src/commands/memory/memory.tsx`, `citation_gap`).
- <a id="ref-66"></a>[66] Claude Code local mirror: memory file selector scopes (`../claude-code-source-code/src/components/memory/MemoryFileSelector.tsx`, `citation_gap`).
- <a id="ref-67"></a>[67] Claude Code local mirror: memory taxonomy and recall verification guidance (`../claude-code-source-code/src/memdir/memoryTypes.ts`, `citation_gap`).
- <a id="ref-68"></a>[68] Claude Code local mirror: memory directory scan and manifest formatting (`../claude-code-source-code/src/memdir/memoryScan.ts`, `citation_gap`).
- <a id="ref-69"></a>[69] Claude Code local mirror: relevant memory selection via side model (`../claude-code-source-code/src/memdir/findRelevantMemories.ts`, `citation_gap`).
- <a id="ref-70"></a>[70] Claude Code local mirror: relevant-memory prefetch and attachment injection (`../claude-code-source-code/src/utils/attachments.ts`, `citation_gap`).
- <a id="ref-71"></a>[71] Claude Code local mirror: background memory extraction flow (`../claude-code-source-code/src/services/extractMemories/extractMemories.ts`, `citation_gap`).
- <a id="ref-72"></a>[72] Claude Code local mirror: auto-memory extraction prompt and restricted tools (`../claude-code-source-code/src/services/extractMemories/prompts.ts`, `../claude-code-source-code/src/services/extractMemories/extractMemories.ts`, `citation_gap`).
- <a id="ref-73"></a>[73] Claude Code local mirror: session memory thresholds, forked extraction, and exact-file edit permission (`../claude-code-source-code/src/services/SessionMemory/sessionMemory.ts`, `../claude-code-source-code/src/services/SessionMemory/sessionMemoryUtils.ts`, `citation_gap`).
- <a id="ref-74"></a>[74] Claude Code local mirror: compaction result shape, compact boundary, restored attachments, and hooks (`../claude-code-source-code/src/services/compact/compact.ts`, `citation_gap`).
- <a id="ref-75"></a>[75] KQode catalog: Claude Code is a product reference; do not use leaked/proprietary source as implementation material (`docs/kqode_reference_implementations.md`).
- <a id="ref-76"></a>[76] KQode core details: R35-R38 memory requirements (`docs/kqode_core_implementation_details.md`).
- <a id="ref-77"></a>[77] KQode build path: M6 project context and memory milestone (`docs/kqode_build_path.md`).

[ref-1]: #ref-1
[ref-2]: #ref-2
[ref-3]: #ref-3
[ref-4]: #ref-4
[ref-5]: #ref-5
[ref-6]: #ref-6
[ref-7]: #ref-7
[ref-8]: #ref-8
[ref-9]: #ref-9
[ref-10]: #ref-10
[ref-11]: #ref-11
[ref-12]: #ref-12
[ref-13]: #ref-13
[ref-14]: #ref-14
[ref-15]: #ref-15
[ref-16]: #ref-16
[ref-17]: #ref-17
[ref-18]: #ref-18
[ref-19]: #ref-19
[ref-20]: #ref-20
[ref-21]: #ref-21
[ref-22]: #ref-22
[ref-23]: #ref-23
[ref-24]: #ref-24
[ref-25]: #ref-25
[ref-26]: #ref-26
[ref-27]: #ref-27
[ref-28]: #ref-28
[ref-29]: #ref-29
[ref-30]: #ref-30
[ref-31]: #ref-31
[ref-32]: #ref-32
[ref-33]: #ref-33
[ref-34]: #ref-34
[ref-35]: #ref-35
[ref-36]: #ref-36
[ref-37]: #ref-37
[ref-38]: #ref-38
[ref-39]: #ref-39
[ref-40]: #ref-40
[ref-41]: #ref-41
[ref-42]: #ref-42
[ref-43]: #ref-43
[ref-44]: #ref-44
[ref-45]: #ref-45
[ref-46]: #ref-46
[ref-47]: #ref-47
[ref-48]: #ref-48
[ref-49]: #ref-49
[ref-50]: #ref-50
[ref-51]: #ref-51
[ref-52]: #ref-52
[ref-53]: #ref-53
[ref-54]: #ref-54
[ref-55]: #ref-55
[ref-56]: #ref-56
[ref-57]: #ref-57
[ref-58]: #ref-58
[ref-59]: #ref-59
[ref-60]: #ref-60
[ref-61]: #ref-61
[ref-62]: #ref-62
[ref-63]: #ref-63
[ref-64]: #ref-64
[ref-65]: #ref-65
[ref-66]: #ref-66
[ref-67]: #ref-67
[ref-68]: #ref-68
[ref-69]: #ref-69
[ref-70]: #ref-70
[ref-71]: #ref-71
[ref-72]: #ref-72
[ref-73]: #ref-73
[ref-74]: #ref-74
[ref-75]: #ref-75
[ref-76]: #ref-76
[ref-77]: #ref-77
