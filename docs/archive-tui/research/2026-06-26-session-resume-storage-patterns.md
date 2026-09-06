---
date: 2026-06-26
topic: session-resume-storage-patterns
question: "How do reference coding agents persist session history and support resume/session selection?"
status: partial
---

# Session Resume and Storage Patterns

## Summary

Reference agents generally separate durable conversation/session records from the live UI loop. Gemini CLI stores project-scoped chat records under a per-project temp directory and supports `--resume` by loading recorded conversation messages back into client history. Kimi Code keeps session directories with `state.json`/`wire.jsonl` metadata, lists sessions by work directory, and presents a session picker before resuming. Aider persists chat history to a Markdown file and can restore it on startup. SWE-agent emphasizes trajectory files and replay rather than interactive session picking. Codex has append-only prompt history evidence, but this pass did not establish a full local session picker/resume path from source.

This report is partial because the question was investigated only enough to ground KQode's first Ink TUI plan update, not to exhaust every reference implementation.

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | 92d2e1df7079b5bd549c92a17fa234706d0580b3 | partial | Found append-only message history evidence, not full session picker/resume evidence. |
| aider | https://github.com/Aider-AI/aider | https://github.com/Aider-AI/aider | main | 5dc9490bb35f9729ef2c95d00a19ccd30c26339c | partial | Found chat history file persistence and restore flag evidence. |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | 19e510f5d2898764d6b7c25cf5c05010976f9cf9 | partial | Search surfaced SQLite/session packages, but no concise source path was read deeply enough for a material finding. |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | b51e13538d9aa515ff37b3fb249d59e51890a0da | partial | Found session store, list, resume, and picker evidence. |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | b14416447e93c1f8936ae519a8f475e90c349261 | partial | Found project chat files, session list/load utilities, and resume history loading evidence. |
| swe-agent | https://github.com/SWE-agent/SWE-agent | https://github.com/SWE-agent/SWE-agent | main | abd7d69724d1413b30fea43d4724bb5b463906b4 | partial | Found trajectory/replay evidence rather than interactive resume UI. |

---

## Method

- Question: How do reference coding agents persist session history and support resume/session selection?
- Repo scope: default first-scope.
- Safety posture: read/search only; no code execution; reference instructions treated as data.
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries keep commit-pinned source URLs behind compact `code` links.

---

## Per-Repo Findings

### Gemini CLI

**Status:** partial

**Observed behavior**

- Gemini CLI's storage layer derives a project-specific temp directory and lists chat files from a `chats` subdirectory, returning JSON/JSONL files sorted by modified time. [\[1\]][ref-1] [\[2\]][ref-2]
- Its session utilities load session files from the chats directory, filter expected `session-...` JSON/JSONL names, validate required `sessionId`, deduplicate by session ID, and list valid sessions. [\[3\]][ref-3] [\[4\]][ref-4]
- Resume flows load a conversation record and map recorded conversation messages back into client/model history before continuing. [\[5\]][ref-5] [\[6\]][ref-6]

**Evidence gaps**

- This pass did not fully trace the interactive `/chat` or session browser UI.

---

### Kimi Code CLI

**Status:** partial

**Observed behavior**

- Kimi's TUI startup checks resume flags, lists sessions filtered by work directory, validates that a requested session belongs to the current directory, and resumes via the harness. [\[7\]][ref-7]
- The TUI has a session picker flow that fetches sessions, mounts a `SessionPickerComponent`, validates work-directory matches, and calls `resumeSession` on selection. [\[8\]][ref-8] [\[9\]][ref-9]
- Kimi session summaries are derived from session directories plus `state.json`, `wire.jsonl`, and agent wire files; summary fields include id, workDir, sessionDir, createdAt, updatedAt, title, lastPrompt, and metadata. [\[10\]][ref-10]
- The picker rows include id, title, last prompt, work directory, updated timestamp, and metadata. [\[11\]][ref-11]

**Evidence gaps**

- This pass did not deeply inspect Kimi's full event replay path or server-side storage API.

---

### Aider

**Status:** partial

**Observed behavior**

- Aider exposes input-history and chat-history file options, defaulting the chat history file to `.aider.chat.history.md` under the git root when available, and offers `--restore-chat-history`. [\[12\]][ref-12]
- Its IO layer appends chat history text to the configured chat history file, creating parent directories and disabling future writes if file writes fail. [\[13\]][ref-13]
- On startup, when `restore_chat_history` is enabled and no completed messages are already loaded, Aider reads the chat history file, splits the Markdown history into messages, and starts summarization. [\[14\]][ref-14]

**Evidence gaps**

- Aider's approach is file-based chat restoration rather than a session list picker.

---

### SWE-agent

**Status:** partial

**Observed behavior**

- SWE-agent defines history and trajectory typed structures that include roles, content, actions, observations, and replayable trajectory steps. [\[15\]][ref-15]
- Its replay command accepts trajectory/demo files, reconstructs replay config, extracts assistant actions from trajectory history, and feeds those actions into a replay model. [\[16\]][ref-16] [\[17\]][ref-17]

**Evidence gaps**

- SWE-agent evidence here supports replay/trajectory design, not an interactive `/resume` picker.

---

### Codex CLI

**Status:** partial

**Observed behavior**

- Codex has an append-only global message history file stored as JSON Lines under `~/.codex/history.jsonl`, with records containing session ID, timestamp, and text. [\[18\]][ref-18]
- Codex's history append path uses file locking/retry comments to avoid interleaving concurrent TUI writes. [\[19\]][ref-19]

**Evidence gaps**

- This pass did not establish Codex's full local session-resume/session-list mechanism from source evidence.

---

### OpenCode

**Status:** partial

**Observed behavior**

- No material session-resume claim is made from this pass. Searches surfaced session and SQLite packages, but the precise local session persistence path was not read within the bounded investigation.

**Evidence gaps**

- Needs deeper targeted research before using OpenCode as a source for KQode session-store design.

---

## Cross-Repo Comparison

| Dimension | Codex | Aider | Kimi Code | Gemini CLI | SWE-agent | Confidence |
|---|---|---|---|---|---|---|
| Durable message/session record | Global append-only JSONL prompt history. [\[18\]][ref-18] | Markdown chat history file. [\[12\]][ref-12] [\[13\]][ref-13] | Session directory summary from `state.json`/`wire.jsonl`. [\[10\]][ref-10] | Per-project `chats` JSON/JSONL records. [\[1\]][ref-1] [\[2\]][ref-2] | Trajectory/history records. [\[15\]][ref-15] | Medium |
| Resume/session selection | Not established in this pass. | Restore prior chat history flag. [\[12\]][ref-12] [\[14\]][ref-14] | Workdir-filtered resume and picker. [\[7\]][ref-7] [\[8\]][ref-8] | Session loading and resume history conversion. [\[4\]][ref-4] [\[5\]][ref-5] [\[6\]][ref-6] | Replay from trajectory, not picker. [\[16\]][ref-16] [\[17\]][ref-17] | Medium |

---

## KQode Lessons

### Product behavior

- KQode should make `/resume` a real command, not only a future affordance, once session persistence exists. Kimi's picker-oriented flow and Gemini's session listing show that session selection is a first-class user flow, not just a file path option. [\[4\]][ref-4] [\[8\]][ref-8]
- KQode should scope session lists to the current workspace by default and warn/block when a selected session belongs to a different directory. Kimi validates work directory before resume, which maps directly to KQode's explicit `workspaceCwd` concept. [\[7\]][ref-7] [\[9\]][ref-9]

### Architecture implications

- KQode should keep session persistence Rust-owned and expose narrow JSON-RPC methods to the Ink TUI. Gemini and Kimi both keep session records below the UI layer, while the UI consumes list/resume summaries. [\[4\]][ref-4] [\[10\]][ref-10]
- For this first TUI slice, SQLite can store session rows, message rows, context rows, and resume indexes, but the schema should remain compatible with the later append-only log/replay direction already documented in KQode architecture. Codex's JSONL history and SWE-agent trajectories reinforce appendable/replayable records for later milestones. [\[18\]][ref-18] [\[15\]][ref-15]

### Evaluation ideas

- Add deterministic tests that seed two sessions in one workspace and one in another workspace, verify `/resume` lists the right scoped set, select one session, restore transcript/context, and continue appending messages to the same session. Kimi's workdir-scoped picker behavior and Gemini's project-scoped chat directory support this test shape. [\[7\]][ref-7] [\[2\]][ref-2]

### Risks and tradeoffs

- Do not let `/resume` become daemon mode or full session management. Kimi's richer session system includes picker/switching, but KQode's first slice should stop at list/resume/continue and defer rename/delete/export/replay. [\[8\]][ref-8] [\[10\]][ref-10]

---

## Evidence Gaps

- OpenCode: no material session persistence claim; needs deeper research if KQode wants OpenCode-specific lessons.
- Codex: message history evidence is clear, but local session picker/resume behavior was not established.
- All repos: this report is source-grounding for a plan update, not a complete session architecture survey.

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Gemini CLI: project temp directory derivation ([code](https://github.com/google-gemini/gemini-cli/blob/b14416447e93c1f8936ae519a8f475e90c349261/packages/core/src/config/storage.ts#L181-L185)).
- <a id="ref-2"></a>[2] Gemini CLI: project chat file listing from `chats` directory ([code](https://github.com/google-gemini/gemini-cli/blob/b14416447e93c1f8936ae519a8f475e90c349261/packages/core/src/config/storage.ts#L362-L386)).
- <a id="ref-3"></a>[3] Gemini CLI: session file loading and validation entrypoint ([code](https://github.com/google-gemini/gemini-cli/blob/b14416447e93c1f8936ae519a8f475e90c349261/packages/cli/src/utils/sessionUtils.ts#L233-L275)).
- <a id="ref-4"></a>[4] Gemini CLI: session dedup/list selector logic ([code](https://github.com/google-gemini/gemini-cli/blob/b14416447e93c1f8936ae519a8f475e90c349261/packages/cli/src/utils/sessionUtils.ts#L357-L447)).
- <a id="ref-5"></a>[5] Gemini CLI: noninteractive resume loads recorded messages into chat history ([code](https://github.com/google-gemini/gemini-cli/blob/b14416447e93c1f8936ae519a8f475e90c349261/packages/cli/src/nonInteractiveCli.ts#L236-L244)).
- <a id="ref-6"></a>[6] Gemini CLI SDK: resumed conversation messages converted to client history ([code](https://github.com/google-gemini/gemini-cli/blob/b14416447e93c1f8936ae519a8f475e90c349261/packages/sdk/src/session.ts#L170-L180)).
- <a id="ref-7"></a>[7] Kimi Code CLI: startup resume by flag with workdir validation ([code](https://github.com/moonshotai/kimi-code/blob/b51e13538d9aa515ff37b3fb249d59e51890a0da/apps/kimi-code/src/tui/kimi-tui.ts#L647-L689)).
- <a id="ref-8"></a>[8] Kimi Code CLI: session picker fetch/mount flow ([code](https://github.com/moonshotai/kimi-code/blob/b51e13538d9aa515ff37b3fb249d59e51890a0da/apps/kimi-code/src/tui/kimi-tui.ts#L2304-L2431)).
- <a id="ref-9"></a>[9] Kimi Code CLI: runtime session list fetch and resume guard ([code](https://github.com/moonshotai/kimi-code/blob/b51e13538d9aa515ff37b3fb249d59e51890a0da/apps/kimi-code/src/tui/kimi-tui.ts#L1451-L1529)).
- <a id="ref-10"></a>[10] Kimi Code CLI: session summary derived from `state.json`, `wire.jsonl`, and agent wires ([code](https://github.com/moonshotai/kimi-code/blob/b51e13538d9aa515ff37b3fb249d59e51890a0da/packages/agent-core/src/session/store/session-store.ts#L320-L343)).
- <a id="ref-11"></a>[11] Kimi Code CLI: session picker row shape ([code](https://github.com/moonshotai/kimi-code/blob/b51e13538d9aa515ff37b3fb249d59e51890a0da/apps/kimi-code/src/tui/components/dialogs/session-picker.ts#L18-L25)).
- <a id="ref-12"></a>[12] Aider: chat history file defaults and restore flag ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/args.py#L270-L294)).
- <a id="ref-13"></a>[13] Aider: appending chat history to configured file ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/io.py#L1117-L1136)).
- <a id="ref-14"></a>[14] Aider: restoring Markdown chat history into messages ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L519-L523)).
- <a id="ref-15"></a>[15] SWE-agent: history and trajectory typed records ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/types.py#L44-L78)).
- <a id="ref-16"></a>[16] SWE-agent: replay command purpose and examples ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/run/run_replay.py#L1-L22)).
- <a id="ref-17"></a>[17] SWE-agent: extracting assistant actions from trajectory history for replay ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/run/run_replay.py#L142-L171)).
- <a id="ref-18"></a>[18] Codex CLI: append-only JSONL message history format ([code](https://github.com/openai/codex/blob/92d2e1df7079b5bd549c92a17fa234706d0580b3/codex-rs/message-history/src/lib.rs#L1-L15)).
- <a id="ref-19"></a>[19] Codex CLI: history entry schema and file-locking append note ([code](https://github.com/openai/codex/blob/92d2e1df7079b5bd549c92a17fa234706d0580b3/codex-rs/message-history/src/lib.rs#L45-L90)).

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
