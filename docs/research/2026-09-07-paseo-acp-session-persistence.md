---
date: 2026-09-07
topic: paseo-acp-session-persistence
question: "Do KQode's Harbor and Paseo ACP integrations require SQLite, especially for Paseo session persistence?"
status: complete
---

# Paseo ACP Session Persistence

## Summary

Paseo does not require an ACP agent to use SQLite. Paseo itself persists daemon
configuration and agent records as JSON files. Each agent record stores a
provider-owned persistence handle, but not the provider's complete durable
conversation state.

For resumable Paseo sessions, KQode must preserve enough state behind a stable
session ID to implement ACP `session/load` or session resume after a fresh
process starts. JSONL session files are sufficient; SQLite is optional as an
index for listing, search, and metadata queries.

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| paseo | `https://github.com/getpaseo/paseo` | `https://github.com/getpaseo/paseo` | `main` | `b403dea32beaed5e1f9a08db52b88d12579c6dd2` | complete | Public source synchronized anonymously; read/search only. |

---

## Method

- Question: Determine whether KQode needs SQLite when launched through Harbor or
  Paseo, with emphasis on Paseo restart and resume behavior.
- Repo scope: custom optional target `paseo`.
- Safety posture: read/search only; no reference code was executed.
- Citation format: numbered references point to commit-pinned source locations.

---

## Per-Repo Findings

### Paseo

**Status:** complete

**Observed behavior**

- Paseo's server persistence is file-based JSON under `$PASEO_HOME`, not a
  traditional database. Agent records include configuration, runtime metadata,
  and a provider-owned persistence handle containing a session ID and optional
  native handle. [\[1\]][ref-1]
- `AgentStorage` validates persisted records, writes each record atomically, and
  reconstructs its in-memory index by scanning JSON files when the daemon
  starts. [\[2\]][ref-2] [\[3\]][ref-3]
- When Paseo loads an inactive agent, it reads the stored persistence handle,
  asks the provider to resume that session, and then hydrates the visible
  timeline from provider history. [\[4\]][ref-4]
- The ACP adapter starts a fresh ACP process for a resumed session and calls
  `session/load`; it falls back to the unstable resume operation when exposed.
  If neither capability is available, resume fails explicitly. [\[5\]][ref-5]
- Paseo's ACP session persists only the provider session identifier and
  configuration metadata in its handle. History replay received during
  `session/load` is buffered and exposed back to Paseo's in-memory timeline.
  [\[6\]][ref-6] [\[7\]][ref-7]
- The provider boundary advertises session persistence only when the ACP agent
  reports `loadSession` support. [\[8\]][ref-8]

**Evidence gaps**

- This investigation did not inspect Harbor source because the persistence
  requirement is already explicitly constrained by KQode's local integration
  plan and the requested source target was Paseo.

---

## Cross-Repo Comparison

| Dimension | Paseo | KQode implication | Confidence |
|---|---|---|---|
| Host persistence | JSON agent records containing metadata and provider persistence handles. [\[1\]][ref-1] | KQode does not need to share Paseo's storage technology. | high |
| Session resume | Paseo starts/resumes the provider using the stored handle and ACP `session/load`. [\[4\]][ref-4] [\[5\]][ref-5] | KQode must durably resolve its own session ID if it advertises resume. | high |
| Timeline recovery | Timeline is rehydrated from provider history after resume. [\[4\]][ref-4] [\[7\]][ref-7] | Paseo's agent record is not a substitute for KQode's transcript. | high |
| SQLite requirement | No SQLite requirement is present in the ACP adapter or Paseo server persistence model. [\[1\]][ref-1] | JSONL can be canonical truth; SQLite may remain an optional index. | high |

---

## KQode Lessons

### Product behavior

- KQode ACP V1 can omit resume and keep sessions in memory. When resume is
  added, it must advertise the capability only after `session/load` can restore
  model context and replay history. Paseo gates persistence on that advertised
  capability. [\[5\]][ref-5] [\[8\]][ref-8]

### Architecture implications

- Keep ACP session truth independent of Desktop SQLite. A portable append-only
  JSONL transcript keyed by stable session ID can serve Desktop, CLI, Harbor,
  and Paseo; a SQLite index can be added without becoming the only source of
  truth. Paseo needs a durable provider handle and history replay contract, not
  a particular database. [\[4\]][ref-4] [\[5\]][ref-5] [\[7\]][ref-7]
- Provider credentials and model selection for headless execution should come
  from explicit CLI configuration, environment, or another headless-safe
  credential adapter rather than Tauri-managed Desktop state.

### Evaluation ideas

- Start `kqode acp`, create and prompt a session, terminate the process, start a
  fresh process, call `session/load` with the original ID, and verify that prior
  user, assistant, and tool events are replayed before the next prompt.
  [\[5\]][ref-5] [\[7\]][ref-7]

### Risks and tradeoffs

- Persisting only the ACP session ID without transcript state produces a handle
  that Paseo can store but KQode cannot actually restore.
- Making SQLite the sole transcript truth would unnecessarily couple headless
  Harbor execution and portable ACP sessions to a local database.

---

## Evidence Gaps

- Harbor: `not_applicable` to the selected source scope; conclusions about
  Harbor rely on KQode's checked-in integration plan rather than a Harbor source
  trace in this report.

---

## References

Body citations use these numbered source references; each entry keeps the code
URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Paseo: file-based server persistence and persisted agent record shape ([code](https://github.com/getpaseo/paseo/blob/b403dea32beaed5e1f9a08db52b88d12579c6dd2/docs/data-model.md#L34-L117)).
- <a id="ref-2"></a>[2] Paseo: agent record schema and atomic record writes ([code](https://github.com/getpaseo/paseo/blob/b403dea32beaed5e1f9a08db52b88d12579c6dd2/packages/server/src/server/agent/agent-storage.ts#L12-L200)).
- <a id="ref-3"></a>[3] Paseo: daemon startup scans and validates persisted agent JSON files ([code](https://github.com/getpaseo/paseo/blob/b403dea32beaed5e1f9a08db52b88d12579c6dd2/packages/server/src/server/agent/agent-storage.ts#L282-L383)).
- <a id="ref-4"></a>[4] Paseo: stored handles resume provider sessions before timeline hydration ([code](https://github.com/getpaseo/paseo/blob/b403dea32beaed5e1f9a08db52b88d12579c6dd2/packages/server/src/server/agent/agent-loading.ts#L91-L134)).
- <a id="ref-5"></a>[5] Paseo: ACP resume starts a process and invokes load or unstable resume ([code](https://github.com/getpaseo/paseo/blob/b403dea32beaed5e1f9a08db52b88d12579c6dd2/packages/server/src/server/agent/providers/acp-agent.ts#L1755-L1805)).
- <a id="ref-6"></a>[6] Paseo: ACP persistence handle contains the provider session ID and configuration metadata ([code](https://github.com/getpaseo/paseo/blob/b403dea32beaed5e1f9a08db52b88d12579c6dd2/packages/server/src/server/agent/providers/acp-agent.ts#L2381-L2393)).
- <a id="ref-7"></a>[7] Paseo: history replay from ACP load is buffered for timeline hydration ([code](https://github.com/getpaseo/paseo/blob/b403dea32beaed5e1f9a08db52b88d12579c6dd2/packages/server/src/server/agent/providers/acp-agent.ts#L1898-L1907)).
- <a id="ref-8"></a>[8] Paseo: provider boundary advertises persistence only when ACP loadSession is supported ([code](https://github.com/getpaseo/paseo/blob/b403dea32beaed5e1f9a08db52b88d12579c6dd2/packages/plugin/src/acp-internal/connection.ts#L67-L85)).

[ref-1]: #ref-1
[ref-2]: #ref-2
[ref-3]: #ref-3
[ref-4]: #ref-4
[ref-5]: #ref-5
[ref-6]: #ref-6
[ref-7]: #ref-7
[ref-8]: #ref-8
