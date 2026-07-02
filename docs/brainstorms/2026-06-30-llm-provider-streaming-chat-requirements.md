---
date: 2026-06-30
topic: llm-provider-streaming-chat
---

# First LLM Provider, Model Selection, and Streaming Chat

## Summary

Add KQode's first real LLM turn on top of the Ink TUI homepage slice. The Rust core gains a unified, vendor-agnostic provider layer (Kimi/Moonshot wired first), a `/model` selection flow that stores the API key encrypted via the OS keychain, a base system prompt with environment context, and a multi-round chat loop that streams tokens to the TUI and auto-compacts history near the model's context limit. Only Kimi is wired now; the layer and menu are built to scale to more providers later.

---

## Problem Frame

After the homepage slice, KQode can render a home screen, accept a prompt, persist a session, and echo an ACK from the Rust backend — but it never talks to a model. The next step on the build path (M1 headless agent loop, plus M5 streaming TUI) is the first provider call, so the product can hold an actual conversation.

The pain is concrete: today a submitted prompt produces a canned `ACK` instead of a model response, there is no way to choose or authenticate a model from inside the TUI, no system prompt, no multi-round context, and no way to keep chatting once a conversation outgrows the model's context window. Until those exist, KQode is a shell with no agent behind it, and every later milestone (tools, diffs, approvals) has nothing to attach to.

```text
type prompt
  -> assemble: system prompt + history + new message
  -> estimate tokens vs model context limit
  -> if near limit: compact older turns into a summary (history preserved)
  -> call active provider (Kimi), stream tokens
  -> render tokens live in TUI body  +  persist completed turn
```

---

## Actors

- A1. User: Configures a model via `/model`, types prompts, cancels a stream, or triggers `/compact`.
- A2. Ink TUI: Presents the `/model` surface and masked key entry, streams assistant tokens into the body, and shows the active model in the status area.
- A3. Rust core (agent loop + provider layer): Assembles the prompt, estimates tokens, compacts when needed, calls the provider, and streams the response back over the JSON-RPC boundary.
- A4. Kimi/Moonshot API: The authenticated model endpoint that returns a streamed completion.
- A5. OS keychain: Holds the encryption key that protects the stored API key (Windows Credential Manager / macOS Keychain / Linux Secret Service).

---

## Key Flows

- F1. Configure a model
  - **Trigger:** The user runs `/model` and chooses "Add / configure provider".
  - **Actors:** A1, A2, A3, A5
  - **Steps:** The TUI launches the configure wizard, collects the API key through masked input, the core encrypts it (key from the OS keychain) and stores the ciphertext in SQLite, and the provider/model becomes active.
  - **Outcome:** Kimi is selectable and usable, and the status area reflects the active model.
  - **Covered by:** R3, R4, R5, R6

- F2. Multi-round streaming chat turn
  - **Trigger:** The user submits a prompt with an active, configured model.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The core assembles system prompt + prior history + new message, sends it to the provider, and streams tokens back; the TUI renders them live under the user prompt; the completed turn is persisted.
  - **Outcome:** A context-aware assistant response appears token-by-token and survives `/resume`.
  - **Escape path:** Esc cancels mid-stream (R11); provider/network/auth failure renders a themed error (R12).
  - **Covered by:** R8, R9, R10, R17, R18

- F3. Compaction during a long conversation
  - **Trigger:** The assembled prompt nears the model's context limit (auto), or the user runs `/compact` (manual).
  - **Actors:** A1, A3
  - **Steps:** The core summarizes older turns into a compact fragment, keeps recent turns verbatim, sends summary + recent + new message, and shows a brief "history compacted" indication.
  - **Outcome:** The conversation continues past the context limit while the full transcript remains intact in the session log.
  - **Covered by:** R13, R14, R15, R16

---

## Requirements

**Provider layer**
- R1. Add a Rust-native, vendor-agnostic provider abstraction: a normalized request (system prompt + message history + current user message) in, a streamed token response out, with vendor wire formats hidden inside the layer. The abstraction and the `/model` data model must be shaped to add further providers and a second auth method (OAuth) later without redesign.
- R2. Implement one concrete provider for Kimi/Moonshot over its OpenAI-compatible streaming chat-completions API. Only Kimi is wired in this slice.

**Model selection and credentials**
- R3. Add a `/model` command that opens the hybrid selection surface (Approach 3): a flat quick-switch list of configured (provider, model) entries with the active one marked, plus an "Add / configure provider" entry. Selecting a configured entry activates it without re-entering the key.
- R4. Configuring a provider collects its API key through masked in-TUI input (no plaintext echo, no web UI). The user can re-enter or clear a stored key.
- R5. Store the API key encrypted at rest: ciphertext in SQLite, with the encryption key held in the OS keychain. The raw key is never written to SQLite, logs, or the trace.
- R6. The status area shows the currently active provider/model, replacing the static model affordance from the homepage slice.
- R7. When the active provider has no usable key, submitting a prompt routes the user to the `/model` configuration path instead of surfacing a raw provider error.

**Chat turn and streaming**
- R8. Build a base system prompt that establishes KQode's assistant identity and environment context (workspace cwd, OS, git repo identity when available, date, active model), structured to extend with tool-use guidance in later milestones.
- R9. Each submitted turn sends the system prompt plus prior conversation history plus the new user message to the active provider, giving the model multi-round context.
- R10. Stream the assistant response token-by-token into the TUI body under its user prompt, by extending the TUI↔Rust JSON-RPC boundary to carry server→client streaming notifications (token deltas, turn start/end, errors) alongside request/response.
- R11. Pressing Esc during an in-flight streamed response cancels the turn, stops further tokens, and preserves the partial text already shown.
- R12. Provider, network, and auth failures render as themed error messages in the body without crashing the session.

**History compaction**
- R13. Estimate the assembled-prompt token count (system + history + new message) against the active model's context limit on each turn.
- R14. When the estimate approaches the limit, automatically compact older history into a summary fragment before sending, keep recent turns verbatim, and show a brief "history compacted" indication.
- R15. Provide a manual `/compact` command that triggers the same summarization on demand.
- R16. Compaction is a prompt-construction operation only: it never deletes or rewrites the persisted transcript. The full history remains in the append-only session log, and the summary is a derived fragment.

**Persistence and trace**
- R17. Persist each user prompt and completed assistant response, plus the active provider/model selection, into the existing session store so multi-round context and `/resume` reconstruct both the conversation and the active model.
- R18. Record trace evidence for each model call: provider/model, token estimate, compaction events, cancellation, and outcome (success/error), consistent with the project's trace conventions.

---

## Acceptance Examples

- AE1. **Covers R14, R16.** Given a long conversation whose assembled prompt nears the model's context limit, when the user sends another message, KQode summarizes older turns, sends summary + recent + new message, and shows a "history compacted" indication — and the persisted transcript still contains every original turn.
- AE2. **Covers R11.** Given an assistant response is mid-stream, when the user presses Esc, token streaming stops, the partial text stays visible, and the user can immediately enter the next prompt.
- AE3. **Covers R7.** Given no API key is configured for the active provider, when the user submits a prompt, KQode opens or points to the `/model` configuration path instead of showing a raw provider error.
- AE4. **Covers R12.** Given a network or auth failure from Kimi, when a turn is attempted, KQode renders a themed error in the body and the session remains usable.

---

## Success Criteria

- From a fresh start, the user can configure Kimi once, hold a multi-round streamed conversation that remembers earlier turns, and keep chatting past the context limit without a crash or manual reset.
- The API key is never observable in SQLite, logs, or the trace; copying the SQLite file alone does not reveal the key.
- `ce-plan` can implement this without inventing the provider-layer responsibilities, the `/model` flow shape, the encryption pattern, the streaming-protocol direction, or the compaction-preserves-history rule.

---

## Scope Boundaries

- Tools, agent actions, file edits, diffs, approvals, and sandbox execution are out — this slice is chat-only.
- The remaining five providers (OpenAI, GLM, Anthropic/Claude, Gemini, GitHub Copilot) and OAuth/subscription sign-in (including the Copilot device flow) are deferred; the layer is built to accept them.
- Per-provider model catalogs beyond Kimi's single default model are deferred.
- Cost/token-usage display and rich markdown rendering of streamed output beyond plain streamed text are deferred unless trivial.
- Cross-machine key portability is out by design (keychain is per-machine).
- Daemon mode remains out, per the homepage no-daemon decision; this slice still uses the TUI-owned child Rust process over JSON-RPC stdio.

---

## Key Decisions

- Model-access-only over wrapping the Copilot/Claude agent SDKs: KQode owns the loop, system prompt, and compaction; Copilot and Claude become authenticated endpoints, collapsing the three originally described "categories" into one provider list keyed by auth method. Keeps the provider layer unified in Rust and fits the build-your-own-harness goal.
- `/model` uses Approach 3 (hybrid quick-switch list + configure wizard): preserves cc-switch's fast-switch value while supporting guided onboarding, and scales from one provider to many without redesign.
- OS-keychain envelope encryption over a master passphrase: no password friction and strong at rest; accepted trade-off is per-machine key re-entry.
- Compaction preserves history (prompt-only summarization): aligns with the JSONL-truth / SQLite-index convention and keeps `/resume` and replay faithful.
- Auto-compact plus a manual `/compact`: matches reference agents (Claude Code, Codex, Gemini CLI).
- Kimi v1 exposes a single default model rather than a model catalog, to keep the first vertical slice minimal.

---

## Dependencies / Assumptions

- Assumes the homepage plan (SQLite session store, JSON-RPC boundary, transcript persistence, `/resume`) is implemented; this slice extends it rather than rebuilding it.
- Assumes Kimi/Moonshot exposes an OpenAI-compatible streaming chat-completions API reachable from Rust. The exact base URL and model identifier (e.g., `kimi-k2.6`) are to be verified at planning.
- Assumes a Rust OS-keychain integration (e.g., the `keyring` crate) covers Windows, macOS, and Linux secret storage. Fallback behavior when no OS secret store is available (e.g., headless Linux/CI) must be defined.
- Streaming requires extending the current request/response JSON-RPC boundary with notifications; the no-daemon child-process model is unchanged.

---

## Outstanding Questions

### Resolve Before Planning

- (none — product shape is resolved; the items below are technical and better answered during planning.)

### Deferred to Planning

- [Affects R2][Needs research] Confirm Kimi/Moonshot's exact base URL and the correct/latest model identifier (`kimi-k2.6` is assumed, unverified).
- [Affects R13, R14][Needs research] The active model's context-window size and the token-estimation method (real tokenizer vs heuristic).
- [Affects R14, R15][Needs research] The compaction algorithm: summarization prompt, which recent turns to keep verbatim, and whether the summary is produced by a model call — referencing Claude Code, Codex, and Gemini CLI compaction.
- [Affects R5][Technical] Keychain fallback behavior when no OS secret store is available.
- [Affects R10][Technical] Exact streaming notification method names and payload shapes on the JSON-RPC boundary.
