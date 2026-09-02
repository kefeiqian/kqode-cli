---
title: "feat: First LLM Provider, Model Selection, and Streaming Chat"
type: feat
status: active
date: 2026-06-30
origin: docs/brainstorms/2026-06-30-llm-provider-streaming-chat-requirements.md
deepened: 2026-06-30
---

# feat: First LLM Provider, Model Selection, and Streaming Chat

## Summary

Replace the homepage slice's canned ACK with KQode's first real LLM turn. Add a Rust-native, vendor-agnostic provider layer (Kimi/Moonshot wired first via its OpenAI-compatible streaming API), a `/model` selection flow that stores the API key encrypted through the OS keychain, a base system prompt with environment context, and a multi-round chat loop that streams tokens to the Ink TUI and auto-compacts history near the model's context limit while preserving the full transcript. Only Kimi is wired; the provider trait, `/model` surface, and storage are shaped to add the remaining providers later.

---

## Problem Frame

After the homepage slice, a submitted prompt returns `ACK: message received` — KQode never talks to a model, cannot authenticate one from the TUI, has no system prompt, no multi-round context, and no way to keep chatting past a model's context window. This plan delivers the first provider call so KQode can hold an actual conversation, and establishes the provider, credential-encryption, streaming-protocol, and compaction patterns every later milestone attaches to (see origin: `docs/brainstorms/2026-06-30-llm-provider-streaming-chat-requirements.md`).

---

## Requirements

Traced from the origin requirements doc. This plan satisfies all 18 origin requirements.

**Provider layer**
- R1. Rust-native, vendor-agnostic provider abstraction: normalized request (system prompt + history + current message) in, streamed token response out, vendor wire formats hidden; shaped to add providers and a second auth method later.
- R2. One concrete Kimi/Moonshot provider over its OpenAI-compatible streaming chat-completions API; only Kimi wired.

**Model selection and credentials**
- R3. `/model` opens the hybrid surface: flat quick-switch list of configured (provider, model) entries with the active one marked, plus an "Add / configure provider" entry; selecting a configured entry activates it without re-entering the key.
- R4. Masked in-TUI API-key entry (no plaintext echo, no web UI); user can re-enter or clear a stored key.
- R5. API key encrypted at rest: ciphertext in SQLite, encryption key in the OS keychain; raw key never written to SQLite, logs, or trace.
- R6. Status area shows the active provider/model, replacing the static homepage affordance.
- R7. When the active provider has no usable key, submitting a prompt routes to the `/model` configuration path instead of a raw provider error.

**Chat turn and streaming**
- R8. Base system prompt with KQode identity and environment context (cwd, OS, git identity when available, date, active model), structured to extend with tool-use guidance later.
- R9. Each turn sends system prompt + prior history + new message for multi-round context.
- R10. Stream the assistant response token-by-token into the TUI body, via an extended JSON-RPC boundary carrying server→client streaming notifications.
- R11. Esc during an in-flight response cancels the turn, stops further tokens, preserves the partial text shown.
- R12. Provider/network/auth failures render as themed error messages without crashing the session.

**History compaction**
- R13. Estimate assembled-prompt token count against the active model's context limit each turn.
- R14. Near the limit, auto-compact older history into a summary fragment, keep recent turns verbatim, show a brief indication.
- R15. Manual `/compact` triggers the same summarization on demand.
- R16. Compaction is prompt-construction only: never deletes/rewrites the persisted transcript; full history stays in the append-only session log plus the persisted transcript index; the summary is a derived fragment.

**Persistence and trace**
- R17. Persist each user prompt, completed assistant response, and the active provider/model so multi-round context and `/resume` reconstruct conversation and model.
- R18. Record trace evidence per model call: provider/model, token estimate, compaction events, cancellation, outcome.

**Origin actors:** A1 user, A2 Ink TUI, A3 Rust core (agent loop + provider layer), A4 Kimi/Moonshot API, A5 OS keychain.
**Origin flows:** F1 configure a model, F2 multi-round streaming chat turn, F3 compaction during a long conversation.
**Origin acceptance examples:** AE1 (compaction preserves history; covers R14, R16), AE2 (Esc cancels mid-stream; covers R11), AE3 (no key → configuration path; covers R7), AE4 (provider failure themed error; covers R12).

---

## Scope Boundaries

- Chat-only: no tools, agent actions, file edits, diffs, approvals, or sandbox execution.
- Kimi is the only wired provider; the remaining five (OpenAI, GLM, Anthropic/Claude, Gemini, GitHub Copilot) and OAuth/subscription sign-in (including the Copilot device flow) are not implemented.
- Per-provider model catalogs beyond Kimi's default and a documented alternate are out.
- Cost/token-usage display and rich markdown rendering of streamed output beyond plain streamed text are out.
- Cross-machine key portability is out by design (keychain is per-machine).
- Daemon mode remains out, per the homepage no-daemon decision; this slice still uses the TUI-owned child Rust process over JSON-RPC stdio.

### Deferred to Follow-Up Work
- The planned multi-crate split (`kqode-provider`, `kqode-session`, `kqode-core`, etc.): modules are added under the current single package, organized so they can move into crates in a later refactor PR.
- Wiring the remaining providers and OAuth auth: future iterations reusing the trait and `/model` surface built here.
- Transcript deletion/retention/redaction controls for stored real chat content: future privacy/compliance work once real prompts and model output are landing in persistent storage.

---

## Context & Research

### Relevant Code and Patterns
- `src/backend.rs` — synchronous `lsp-server` stdio loop; currently matches only `Message::Request` and returns a `Response`. Streaming requires cloning `connection.sender` and emitting `Message::Notification`.
- `src/protocol.rs` — `RpcMethod` enum, method-name constants, and typed params/results with `serde(deny_unknown_fields)`/`camelCase`. New methods/notifications follow this constant + typed-struct pattern (AGENTS.md: no hard-coded protocol names).
- `src/session_store.rs`, `src/session_protocol.rs` (introduced by this plan's U9/U10) — `rusqlite` bundled SQLite under `~/.kqode/`; tables `sessions`, `session_messages`, `session_context`, `repo_memory`; methods `kqode.session.start/list/resume` and `kqode.message.submit(sessionId, text)`. U9/U10 create the base store; the streaming units then extend the schema, add a versioned migration path, and add append-only session-log writes ahead of SQLite indexing.
- `tui/src/libs/backend/` — `vscode-jsonrpc` client (`backendClient.ts`, `processBackendClient.ts`, `messageProtocol.ts`, `sessionProtocol.ts`). New `modelProtocol.ts` and notification wiring attach here.
- `tui/src/components/` — `HomeScreen`, `BodyPane`, `StatusBar` (static `GPT-5.5` affordance), `PromptComposer` from the homepage slice; `ResumeSessionList` and the `/resume` command pattern are added by this plan's U10 and mirrored for `/model`.
- `tui/src/state/` — Jotai atoms (`homeScreenAtoms.ts`, `composerAtoms.ts`). Shared model/transcript state uses Jotai; isolated input editing stays component-local (per project convention).
- File-size guideline: keep new source files ≤ ~200 lines; split modules accordingly.

### Institutional Learnings
- No `docs/solutions/` learnings exist yet.

### External References
- Kimi/Moonshot: OpenAI-compatible chat-completions; base URLs `https://api.moonshot.cn/v1` (CNY) and `https://api.moonshot.ai/v1` (international/USD); streaming via `stream:true`, `data:` SSE chunks, `[DONE]` sentinel, `usage` in the last chunk; `kimi-k2.6` and `kimi-k2.7-code` both 256k context (`platform.kimi.com/docs/models.md`).
- `keyring` 4.1.x (rustc ≥ 1.88, edition 2024) — `Entry::new(service, user)` with `set_password`/`get_password`/`get_secret`; Windows Credential Manager / macOS Keychain / Linux Secret Service. No built-in fallback on headless Linux (no Secret Service) → env-var fallback required.
- `chacha20poly1305` 0.10 (`XChaCha20Poly1305`, 24-byte random nonce; NCC-audited) for envelope encryption of the key; `aes-gcm` 0.10 is the FIPS alternative with the same AEAD trait.
- `async-openai` 0.41 (custom `api_base`, streaming, bundles `eventsource-stream`); runs on `tokio`. `lsp-server` is synchronous → stream on a dedicated thread with its own `tokio` current-thread runtime, cloning the crossbeam `connection.sender` to emit notifications.
- Compaction patterns (Gemini CLI ~50% threshold, Claude Code ~83%, Codex absolute limit): keep recent turns verbatim, summarize older via a model call with a structured "distiller" prompt, split at a user-message boundary. Reference agents mostly discard original history — KQode deliberately preserves it in the session log and SQLite transcript index. Token triggering uses API-returned `usage` plus a char-aware heuristic (ASCII vs CJK) before the first response.

---

## Key Technical Decisions

- **Model-access-only provider layer (origin decision):** Copilot/Claude become authenticated endpoints, not wrapped agent SDKs; KQode owns the loop, system prompt, and compaction. v1 implements only Kimi.
- **Kimi client via `async-openai` with a custom `api_base`:** reuses a maintained OpenAI-compatible client and its SSE layer instead of hand-rolling SSE parsing. Base URL is a provider-config field; default `https://api.moonshot.cn/v1`, `https://api.moonshot.ai/v1` documented (the key is region-bound).
- **Default model `kimi-k2.7-code`, `kimi-k2.6` documented as an alternate** (both 256k context). Model id is a config field, not hard-coded into the agent loop.
- **Streaming over synchronous `lsp-server`:** the submit request carries a client-generated `clientTurnId`, echoed back as `turnId` in the ack and every notification so correlation never depends on ack ordering. The backend keeps one active turn per session, bounded by a small global in-flight limit. Each accepted turn spawns an OS thread with a `tokio` current-thread runtime and a cloned `connection.sender`; tokens arrive as `kqode/tokenDelta` notifications; the request returns an immediate streaming-ack response. This lifts the homepage slice's explicit "no streaming deltas" scope guard without forcing a daemon/runtime redesign.
- **In-flight turn registry + cancellation token:** cancellation is owned by a registry keyed by `turnId` with explicit lifecycle states (`preparing`, `streaming`, `completed`, `cancelled`, `errored`) and guaranteed cleanup on success, cancel, error, client disconnect, backend shutdown, and admission rejection.
- **Envelope encryption:** a random 32-byte data-encryption key (DEK) stored in the OS keychain (service `kqode`); the API key sealed with `XChaCha20Poly1305` (random 24-byte nonce) using AEAD associated data `{ envelopeVersion, providerId, canonicalBaseUrl }`; `(envelopeVersion, nonce, ciphertext)` stored in SQLite. Raw key never persisted outside the keychain-wrapped ciphertext.
- **Secret-handling posture:** secret-bearing types avoid `Debug`/trace serialization, use short-lived zeroizing wrappers where possible, and sanitize any provider/auth failures before they reach protocol errors or trace rows.
- **Credential source states:** stored encrypted credentials, ephemeral env-var credentials, and unrecoverable stored credentials are distinct states. Env-var keys are ephemeral-only and never persisted back to SQLite. If stored ciphertext exists but the DEK is missing/corrupt, surface an unrecoverable state and require explicit reconfiguration instead of silently falling back.
- **Env-var fallback posture:** env-var credentials are an explicit lower-assurance escape hatch for headless/CI use, not the default desktop path, and should be documented as unsupported on shared machines unless the operator accepts the weaker secret boundary.
- **HTTPS-only provider endpoints:** configured base URLs are canonicalized, HTTPS-only, and restricted to documented Moonshot hosts in production unless a test-only override is explicitly enabled.
- **Compaction preserves full history (origin decision):** summarize older turns into a derived summary fragment for the prompt only; keep recent turns verbatim; never mutate the persisted transcript. Default trigger ≈ 75% of the model context limit (configurable); abort compaction if it would inflate token count.
- **Token estimation:** authoritative count from Kimi's returned `usage` after each turn; a char-aware heuristic (ASCII ≈ 3 chars/token, CJK ≈ 1 token/char, per-message overhead) for the pre-send estimate before usage is known.
- **Durable turn truth:** this slice adds the append-only session log instead of assuming it exists. Each turn appends write-ahead events to the JSONL log first, then indexes them into SQLite in short transactions so recovery does not depend on a torn SQLite write.
- **Trace evidence:** each model call records provider/model, token estimate vs. usage, compaction events, cancellation, and outcome, with no secret-bearing payloads, consistent with the session log + SQLite index convention.
- **`clientTurnId` uniqueness:** the client-generated ID is globally unique within a backend process; the backend rejects reuse for any live turn so cancel/correlation never target the wrong stream.
- **Shared TUI state in Jotai:** active model, configured-provider list, `/model` mode, and the streaming-assistant message are Jotai atoms; masked-key input editing stays component-local.

---

## Open Questions

### Resolved During Planning
- Exact Kimi model id (`kimi-k2.6` assumed in origin): resolved — `kimi-k2.6` is valid; default to `kimi-k2.7-code` (newer, coding-optimized), keep `kimi-k2.6` documented, both configurable.
- Context-window size for triggering compaction: resolved — 256,000 tokens for both Kimi models.
- Streaming-protocol direction: resolved — server→client `lsp-server` notifications + an immediate ack response, correlated by a client-generated `clientTurnId` echoed back as `turnId` through every notification.
- Keychain fallback when no OS secret store: resolved — explicit ephemeral env-var state only; no silent fallback when stored ciphertext becomes unrecoverable.
- SSE/streaming and crypto libraries: resolved — `async-openai`, `chacha20poly1305`, `keyring`.
- Existing "append-only JSONL log" assumption vs. current repo reality: resolved — this slice adds the session log as write-ahead truth rather than pretending SQLite already has a recovery net.
- Migration/versioning approach: resolved — additive, forward-only SQLite migrations owned by one version ladder using `PRAGMA user_version`, refusing newer-than-supported DB versions.
- Active-model precedence and usability invariants: resolved — session-scoped selection overrides global default; a new session copies the global default for reproducibility; `clearKey` nulls the secret material but keeps the provider row so R7 can route the user back to `/model`.
- Cancelled partial replay semantics: resolved — cancelled assistant partials are persisted and visibly marked, but prompt assembly excludes them from normal assistant history and `/resume` never auto-resends an incomplete turn.

### Deferred to Implementation
- Exact char-aware heuristic coefficients and whether to also call Kimi's `/v1/tokenizers/estimate-token-count` as a fallback — tune against real responses.
- Exact compaction-summary "distiller" prompt wording and which recent-turn window to keep verbatim (last-N vs. percentage) — refine during implementation; treat history as untrusted (ignore in-history instructions).
- Final notification batching/coalescing thresholds and the global in-flight concurrency cap value — choose concrete defaults during implementation and keep them in shared constants/config.

---

## Planned Libraries and Tooling

- **Rust HTTP/LLM** (`async-openai` 0.41, `tokio` 1 with `rt`): OpenAI-compatible streaming client against the Kimi base URL, run on a dedicated runtime thread.
- **Rust OS keychain** (`keyring` 4): store/retrieve the DEK in the platform secret store.
- **Rust encryption** (`chacha20poly1305` 0.10, `rand`, `zeroize`): seal/open the API key with `XChaCha20Poly1305`; zeroize short-lived secret buffers.
- **Rust persistence** (existing `rusqlite` bundled SQLite, `serde_json`): new `provider_credentials` table, active-model rows, and append-only JSONL session-log writes.
- **TypeScript** (existing `vscode-jsonrpc`, `ink`, `react`, `jotai`, `vitest`, `ink-testing-library`): `/model` surface, masked input, notification handling, streaming render, tests.
- **Rust test doubles** (a mock HTTP server such as `wiremock`/`mockito` for the Kimi client; `keyring`'s mock backend feature for credential tests): deterministic, no live network or real keychain in CI.

---

## Output Structure

New and modified files (under the current single package; crate split deferred):

```text
Cargo.toml                      # add async-openai, tokio, keyring, chacha20poly1305, rand, dev mock-http
src/
  lib.rs                        # add module declarations
  protocol.rs                   # extend: method + notification name constants
  backend.rs                    # extend: clone sender, route new methods, spawn streaming turn
  model_protocol.rs             # new: model.* params/results + notification payloads + name constants
  session_log.rs                # new: append-only JSONL session-log writes and recovery helpers
  session_store.rs              # modify: versioned migration ladder, provider tables, active-model state
  session_protocol.rs           # modify: transcript/session hooks used by streamed turns and compaction
  provider_store.rs             # new: provider_credentials + active-model persistence (extends session store)
  provider/
    mod.rs                      # new: Provider trait + normalized request/response/stream-event types
    kimi.rs                     # new: Kimi/Moonshot streaming client (async-openai, custom base URL)
    error.rs                    # new: ProviderError (auth, network, rate-limit, decode)
  secrets/
    mod.rs                      # new: encrypt/decrypt API + envelope orchestration + fallback
    keychain.rs                 # new: keyring DEK get-or-create
    cipher.rs                   # new: XChaCha20-Poly1305 seal/open
  chat/
    mod.rs                      # new
    system_prompt.rs            # new: base system prompt + environment-context fragment
    context.rs                  # new: prompt assembly + token estimation
    compaction.rs               # new: threshold, split, summarize, preserve-history
    turn.rs                     # new: streaming turn orchestration + trace
    inflight.rs                 # new: turn registry, cancellation tokens, bounded admission
tests/
  provider_kimi.rs              # new: mock-HTTP streaming + error mapping
  secrets.rs                    # new: encrypt/decrypt round-trip, tamper, fallback
  provider_store.rs             # new: credential + active-model persistence
  session_log.rs                # new: append-only log and migration/recovery behavior
  chat_turn.rs                  # new: end-to-end turn over a mock provider
tui/src/
  App.tsx                       # extend: /model + /compact routing, Esc cancel
  libs/
    backend/
    modelProtocol.ts            # new: model.* request wrappers + types
    streamProtocol.ts           # new: notification names + payload types + onNotification wiring
    backendClient.ts            # modify: notification fan-in / typed event surface
    processBackendClient.ts     # extend: register notification handlers, new methods, cancel
  components/
    StatusBar.tsx               # extend: active provider/model
    BodyPane.tsx                # extend: streaming assistant message render
    ModelSelect/
      ModelSelect.tsx           # new: hybrid quick-switch + add-provider surface
      ProviderList.tsx          # new: configured (provider, model) rows + active marker
      MaskedKeyInput.tsx        # new: masked API-key entry
      __tests__/
        ModelSelect.test.tsx
        MaskedKeyInput.test.tsx
  state/
    homeScreenAtoms.ts          # modify: transcript / streamed assistant state
    composerAtoms.ts            # modify: prompt draft + reroute/cancel interactions
    modelAtoms.ts               # new: active model, configured providers, /model mode (Jotai)
    __tests__/
      modelAtoms.test.ts
```

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
sequenceDiagram
    participant TUI as Ink TUI
    participant Client as BackendClient (vscode-jsonrpc)
    participant Loop as Rust backend loop
    participant Turn as Chat turn (tokio thread)
    participant Prov as Kimi provider
    participant Store as JSONL session log + SQLite + keychain

    TUI->>Client: submit(sessionId, turnId, text)
    Client->>Loop: kqode.message.submit
    Loop->>Loop: reserve session slot + register turnId
    Loop->>Store: append user-turn start to JSONL + index user row/trace(in_flight)
    Loop->>Turn: spawn thread + tokio runtime (cloned sender, cancel token)
    Loop-->>Client: ack { turnId, status: "streaming" }
    Turn-->>Client: notify kqode/turnStart { turnId, phase: "preparing" }
    Turn->>Turn: assemble system + history + text; estimate tokens
    alt estimate >= threshold * contextLimit
        Turn->>Prov: summarize older turns (distiller prompt)
        Prov-->>Turn: summary fragment
        Turn-->>Client: notify kqode/compacted { turnId }
    end
    Turn-->>Client: notify kqode/turnStart { turnId, phase: "streaming" }
    Turn->>Prov: stream chat completion (system + kept history + summary + text)
    loop each token
        Prov-->>Turn: delta
        Turn-->>Client: notify kqode/tokenDelta { turnId, delta }
        Client-->>TUI: append delta to assistant message
    end
    Turn->>Store: append terminal event to JSONL + transactionally index assistant row + trace
    Turn-->>Client: notify kqode/turnEnd { turnId, finishReason, usage }
    Note over TUI,Turn: Esc -> kqode.message.cancel(turnId): cancel token is checked during<br/>prepare + stream, persists partial (marked cancelled), emits turnEnd, cleans registry
```

---

## JSON-RPC Contract Additions

> *Extends the homepage First-Slice contract. All method/notification names live as constants in `src/protocol.rs` / `src/model_protocol.rs` and a shared TS module — no inline string literals (AGENTS.md).*

**Requests (client → backend)**
- `kqode.model.list` → configured providers + per-provider models, the active selection, and per-provider "key present" flags.
- `kqode.model.configure` (params: provider id, apiKey, optional baseUrl, optional model) → seals and stores the key; returns success without echoing the key.
- `kqode.model.select` (params: provider id, model) → sets the active provider/model.
- `kqode.model.clearKey` (params: provider id) → removes the stored credential.
- `kqode.message.submit` (extended; params: sessionId, clientTurnId, text) → returns one of: accepted `{ turnId, status: "streaming" }`, needs-configuration `{ status: "needsConfiguration" }`, or busy `{ status: "busy", reason }`. `turnId` echoes `clientTurnId` on accepted turns only.
- `kqode.message.cancel` (params: turnId) → cancels an in-flight turn.
- `kqode.session.compact` (params: sessionId) → forces compaction on demand and returns a response-only result `{ status: "compacted" | "noop", summaryAppliedToNextTurn }`; it does not emit a synthetic streaming `turnId`.

**Notifications (backend → client)**
- `kqode/turnStart` { turnId, sessionId, phase }
- `kqode/tokenDelta` { turnId, delta }
- `kqode/turnEnd` { turnId, finishReason, usage }
- `kqode/compacted` { turnId, sessionId, keptTurns, summaryTokenEstimate }  # auto-compaction during an accepted submit turn only
- `kqode/turnError` { turnId, errorKind, message }

---

## Implementation Units

Two phases: **Phase A** builds the Rust core (U1–U6) plus the SQLite session store (U9); **Phase B** builds the TUI surfaces (U7–U8) plus the `/resume` picker (U10).

### U1. Provider abstraction and Kimi streaming client

**Goal:** Define the vendor-agnostic provider trait and normalized types, and implement the Kimi/Moonshot streaming chat-completions client.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Create: `src/provider/mod.rs`, `src/provider/kimi.rs`, `src/provider/error.rs`
- Create: `tests/provider_kimi.rs`
- Modify: `Cargo.toml` (add `async-openai`, `tokio` with `rt`; dev: mock HTTP server), `src/lib.rs`

**Approach:**
- Normalized request carries a system prompt, an ordered list of role-tagged messages, model id, and base URL/params. The response is an async stream of `StreamEvent` values (token delta, usage, done, error). The `Provider` trait exposes a streaming `complete` plus a non-streaming `summarize` helper used by compaction.
- `kimi.rs` configures `async-openai` with the Kimi `api_base` and bearer key, validates/canonicalizes the configured base URL as HTTPS-only (Moonshot hosts in production; explicit test override for local mock servers), maps the normalized request to a streamed chat-completion, and converts SSE chunks into `StreamEvent`s. Vendor types stay inside this module.
- `error.rs` classifies failures into `ProviderError` kinds (auth, network/timeout, rate-limit, decode) so the loop and TUI can render themed, non-fatal errors.

**Technical design:** *(directional)* `trait Provider { fn complete(&self, req) -> impl Stream<Item = StreamEvent>; async fn summarize(&self, req) -> Result<String, ProviderError>; }` — vendor format never escapes `provider::kimi`.

**Patterns to follow:**
- `src/protocol.rs` typed structs with `serde` derives; rustdoc with `# Errors` on fallible fns.

**Test scenarios:**
- Happy path: a streamed mock response yields ordered token deltas, a final usage event, then done.
- Happy path: the request body sets the configured model, `stream:true`, and system+messages in order.
- Happy path: production base URLs are canonicalized and restricted to HTTPS Moonshot hosts; a test-only override permits a local mock HTTP server.
- Edge case: a `[DONE]` with no trailing usage chunk still completes cleanly.
- Error path: HTTP 401 maps to `ProviderError::Auth`; a dropped/timed-out connection maps to `ProviderError::Network`; HTTP 429 maps to rate-limit.
- Error path: malformed SSE JSON maps to `ProviderError::Decode` and ends the stream without panicking.
- Error path: provider exceptions are sanitized before surfacing to `turnError` or trace rows and never include bearer tokens, auth headers, or full request dumps.

**Verification:**
- Against a mock HTTP server, the client streams deltas and surfaces typed errors with no live network call.

---

### U2. Keychain-backed envelope encryption

**Goal:** Encrypt/decrypt a secret with a DEK held in the OS keychain, with a headless fallback.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Create: `src/secrets/mod.rs`, `src/secrets/keychain.rs`, `src/secrets/cipher.rs`
- Create: `tests/secrets.rs`
- Modify: `Cargo.toml` (`keyring`, `chacha20poly1305`, `rand`), `src/lib.rs`

**Approach:**
- `keychain.rs` gets-or-creates a 32-byte random DEK stored under keyring service `kqode`; on keychain unavailability it returns a typed "unavailable" error. If ciphertext exists but decrypt fails because the DEK is missing/corrupt, surface an explicit unrecoverable-credential state rather than silently switching sources.
- `cipher.rs` seals/opens bytes with `XChaCha20Poly1305` using a fresh random 24-byte nonce and AEAD associated data `{ envelopeVersion, providerId, canonicalBaseUrl }`; output is `(envelopeVersion, nonce, ciphertext)`.
- `mod.rs` orchestrates explicit credential-source states (`stored_encrypted`, `ephemeral_env`, `unrecoverable_stored`), zeroizing short-lived plaintext/DEK buffers, and env-var secrets read at use time only (never re-persisted automatically).

**Execution note:** Add the encrypt→decrypt round-trip test first to lock the envelope contract.

**Patterns to follow:**
- Keep each file ≤ ~200 lines; rustdoc `# Errors` on the crypto/keychain boundaries.

**Test scenarios:**
- Happy path: encrypt then decrypt returns the original secret; ciphertext ≠ plaintext and ≠ DEK.
- Edge case: two encryptions of the same secret produce different nonces/ciphertexts.
- Error path: a tampered ciphertext or wrong nonce fails authentication and does not return plaintext.
- Error path: changing `providerId` or canonical `baseUrl` causes AAD authentication failure.
- Error path (use the keyring mock backend): keychain-unavailable surfaces the typed error; env-var source is treated as ephemeral and is never re-persisted automatically.
- Error path: a lost/corrupt DEK with stored ciphertext becomes `unrecoverable_stored` and requires explicit reconfiguration rather than silently falling back.
- Integration: secret-bearing types never serialize/trace/debug-print plaintext material.

**Verification:**
- Round-trip and tamper tests pass with the keyring mock backend; no plaintext key is observable in the ciphertext output.

---

### U3. Credential and active-model persistence + model JSON-RPC methods

**Goal:** Extend the SQLite store with encrypted credentials and active-model selection, and expose the `kqode.model.*` methods.

**Requirements:** R3 (data), R5 (storage), R6, R17 (selection)

**Dependencies:** U2, U9 (session store)

**Files:**
- Create: `src/provider_store.rs`, `src/model_protocol.rs`
- Create: `src/session_log.rs`
- Create: `tests/provider_store.rs`
- Create: `tests/session_log.rs`
- Modify: `src/session_store.rs` (schema/migration hook), `src/backend.rs` (route methods), `src/protocol.rs` (name constants), `src/lib.rs`

**Approach:**
- `src/session_store.rs` owns a single additive migration ladder using `PRAGMA user_version` (U9 baseline → this slice's additions), executed transactionally and refusing newer-than-supported DB versions. Existing `sessions` / `session_messages` rows are preserved unchanged.
- New `provider_credentials` table: `provider_id` primary key, canonical base URL, default model, `envelope_version`, encrypted-key blob, nonce, created/updated. `clearKey` nulls the secret columns but keeps the provider row so active selection remains structurally valid.
- Store the active provider/model as a session-scoped row plus a global default. Precedence is explicit: session-scoped > copied-at-session-start global default > unconfigured.
- `provider_store.rs` exposes: configure (seal+store via U2), clear, list configured providers with a "key present" / credential-source flag (never returning the key), get-and-decrypt for a turn, set/get active selection. `configure` and `select` use UPSERT semantics so concurrent writers cannot duplicate rows.
- `session_log.rs` appends write-ahead JSONL events for turn start and turn terminal outcomes; SQLite remains the query/index layer derived from the log.
- `model_protocol.rs` defines typed params/results for `kqode.model.list/configure/select/clearKey` and the notification payload structs; `backend.rs` routes these synchronous methods.

**Approach (security):** results never include the raw or decrypted key; only "configured" booleans and non-secret metadata cross the protocol boundary.

**Patterns to follow:**
- `src/session_store.rs` table-creation + `rusqlite` access; `src/session_protocol.rs` method routing; test-overridable KQode home path.

**Test scenarios:**
- Happy path: configure stores an encrypted blob; `kqode.model.list` reports the provider as configured without exposing the key.
- Happy path: get-and-decrypt returns the original key for a turn.
- Happy path: select then restart/resume restores the active provider/model using session-scoped > global-default precedence.
- Happy path: a new session copies the global default selection, then diverges independently.
- Edge case: clearKey leaves the provider row and active selection intact but marks it unusable so submit routes to `/model`.
- Error path: a corrupt/missing nonce or blob fails visibly without crashing the backend.
- Integration: the stored blob column never equals the plaintext key (asserted on the row).
- Integration: upgrading a U9-baseline DB to the new `user_version` preserves existing session/message rows and is idempotent on re-open.
- Error path: opening a newer-than-supported DB version fails clearly rather than writing against an unknown schema.

**Verification:**
- Credentials persist encrypted across process restarts; active model survives `/resume`.

---

### U4. System prompt, context assembly, and token estimation

**Goal:** Build the base system prompt and environment-context fragment, assemble the normalized request, and estimate tokens against the context limit.

**Requirements:** R8, R9, R13

**Dependencies:** U1 (normalized types)

**Files:**
- Create: `src/chat/mod.rs`, `src/chat/system_prompt.rs`, `src/chat/context.rs`
- Create/extend tests in `tests/chat_turn.rs`
- Modify: `src/lib.rs`

**Approach:**
- `system_prompt.rs` composes the base prompt from chat-only sections (identity, tone/response conventions) plus an environment-context fragment (cwd, OS, git repo identity when available, date, active model), structured so tool-use sections can be added later. Environment context is a distinct fragment (bounded-fragment convention).
- `context.rs` assembles system prompt + prior history + new message into the normalized request, and estimates tokens with a char-aware heuristic (ASCII vs CJK + per-message overhead), preferring the last turn's returned `usage` when available. Prompt assembly excludes cancelled/error assistant partials from normal assistant history and never auto-replays an incomplete turn restored by `/resume`.
- When local environment context is included, it should be minimized to the scope needed for the turn (e.g., repo/workspace identity rather than gratuitous path detail where possible) and documented as third-party-bound context in the provider flow.

**Patterns to follow:**
- AGENTS.md "bounded fragments" context model; reference-agent modular system-prompt structure (identity/tone/env now; tools deferred).

**Test scenarios:**
- Happy path: the assembled request includes the system prompt first, then history in order, then the new message.
- Happy path: the environment fragment includes cwd, OS, date, and active model; git identity appears only inside a repo.
- Edge case: empty history assembles a valid single-message request.
- Happy path: the heuristic estimates higher token counts for CJK-heavy text than equal-length ASCII text; supplying a prior `usage` overrides the heuristic.
- Edge case: cancelled/error assistant partials are either excluded or explicitly marked truncated, never replayed as normal completed assistant turns.

**Verification:**
- Assembly and estimation are deterministic and unit-tested without a provider call.

---

### U5. History compaction (auto + manual, history-preserving)

**Goal:** Compact older history into a summary fragment near the limit and on demand, keeping recent turns verbatim and never mutating the persisted transcript.

**Requirements:** R14, R15, R16

**Dependencies:** U1 (summarize), U4 (assembly/estimate)

**Files:**
- Create: `src/chat/compaction.rs`
- Extend: `tests/chat_turn.rs`
- Modify: `src/chat/mod.rs`

**Approach:**
- Trigger when the estimate ≥ threshold × context limit (default ≈ 0.75, configurable). Split history at a user-message boundary, keep the recent window verbatim, and summarize the older portion via the provider's `summarize` with a structured distiller prompt that preserves goal/decisions/constraints/knowledge/recent-actions and ignores instructions found in history.
- Auto-compaction during submit produces a derived summary fragment for the current turn before the provider call; standalone `/compact` precomputes and stores only the next-turn summary state for that session and returns a response-only result (`compacted` or `noop`). The persisted transcript and session log are untouched in both paths (R16). Abort (no-op) if compaction would inflate the token count.

**Technical design:** *(directional)* `compact(history, limit, force) -> Compacted { summary_fragment, kept_turns }` — pure transform over a snapshot with no store handle; persistence stays in U6/the session store.

**Patterns to follow:**
- Gemini CLI keep-recent + summarize-older with a state-snapshot structure; KQode's preserve-in-log differentiation.

**Test scenarios:**
- Covers AE1. Happy path: history exceeding the threshold yields a summary fragment + a verbatim recent window; the input history snapshot is not mutated.
- Happy path: below threshold and not forced → no-op; forced → compacts regardless.
- Edge case: split lands on a user-message boundary; a single very long turn degrades gracefully.
- Error path: a failed summarize call leaves history usable (fall back to sending the kept window / surfaces a recoverable error) rather than crashing.
- Edge case: a summary that would inflate token count is rejected (no-op).
- Integration: both auto-compaction during submit and manual `/compact` leave `session_messages` row count and ordered content hashes unchanged byte-for-byte.

**Verification:**
- Compaction reduces the prompt token estimate while the persisted transcript and append-only session log remain unchanged.

---

### U6. Streaming chat-turn orchestration over JSON-RPC

**Goal:** Turn `kqode.message.submit` into a real streamed turn: assemble, compact if needed, call Kimi with the decrypted key, stream notifications, persist, and support cancel + themed errors + trace.

**Requirements:** R7, R9, R10, R11, R12, R16, R17, R18

**Dependencies:** U1, U3, U4, U5

**Files:**
- Create: `src/chat/turn.rs`
- Create: `src/chat/inflight.rs`
- Modify: `src/backend.rs` (clone sender, route submit/cancel/compact, spawn runtime thread), `src/protocol.rs` (notification + method constants), `src/session_protocol.rs` (persist hooks), `src/model_protocol.rs` (ack/notification payloads), `src/session_log.rs`, `src/lib.rs`
- Extend: `tests/chat_turn.rs`
- Modify: `Cargo.toml` if additional `tokio` features are needed

**Approach:**
- On submit: the client provides a `clientTurnId`. The backend echoes it back as `turnId`, admits at most one active turn per session, and enforces a small global in-flight bound; if the session already has a turn or the process is at capacity, return a typed outcome rather than spawning unbounded workers. Load history and decrypt the active key (U3); if no usable key, return the routed "configure your model" outcome (R7) rather than a provider error.
- Manual `kqode.session.compact` goes through the same per-session admission lane as submit so compaction cannot race a live turn against the same transcript snapshot.
- Before the provider call, append a turn-start event to the JSONL session log and transactionally index the user message + an `in_flight` trace row in SQLite. Then spawn an OS thread with a `tokio` current-thread runtime, a cloned `connection.sender`, and a cancellation token from `chat/inflight.rs`; return an immediate streaming-ack response echoing the same `turnId`.
- In the thread: emit `kqode/turnStart { phase: "preparing" }`, assemble (U4), compact if triggered (U5, emit `kqode/compacted`), emit `kqode/turnStart { phase: "streaming" }`, stream the completion emitting coalesced `kqode/tokenDelta` notifications, then append a terminal event to the JSONL log and transactionally persist the assistant row + terminal trace update and emit `kqode/turnEnd` with usage. Map provider errors to sanitized `kqode/turnError` (R12).
- Cancellation: `kqode.message.cancel(turnId)` resolves the in-flight registry entry and signals the shared cancellation token. The worker checks it during compaction, while waiting for the next SSE chunk, and between deltas. On cancel, stop streaming, append the cancel terminal event, persist the partial assistant text marked cancelled, emit `kqode/turnEnd`, and remove the registry entry. `/resume` restores but never auto-replays incomplete turns. Full history is always preserved in the JSONL log plus transcript index (R16).
- Backpressure: coalesce deltas by small time/size windows, cap unsent buffered text per turn, and treat sender/client disconnect as a terminal path that persists/cleans up rather than leaving background tasks orphaned.

**Execution note:** Start with a failing end-to-end test for the submit→notifications→turnEnd contract against a mock provider.

**Patterns to follow:**
- Research pattern: clone crossbeam `Sender`, `tokio::runtime::Builder::new_current_thread`, `lsp_server::Notification::new(method, params)`; existing `src/backend.rs` request routing.

**Test scenarios:**
- Happy path: submit emits turnStart, ordered tokenDeltas, then turnEnd with usage; the user + assistant turn is persisted in order.
- Happy path: ack and all notifications reuse the same client-provided `turnId`, so the TUI can correlate them without relying on response ordering.
- Covers AE3. Error path: no configured key → routed configuration outcome, not a raw provider error; nothing is sent to the provider.
- Edge case: a submit while the session already has an active turn returns the typed busy outcome and does not spawn another worker.
- Covers AE2. Edge case: cancel mid-stream stops further deltas, persists the partial (marked cancelled), and emits a cancelled turnEnd.
- Edge case: cancel during compaction/pre-stream preparation stops before the main stream starts and still cleans the registry entry.
- Covers AE4. Error path: a provider auth/network failure emits `kqode/turnError` and leaves the backend/session usable.
- Integration: crossing the threshold emits `kqode/compacted` before streaming, and the persisted transcript plus session log still contain every original turn.
- Integration: crash injection after the user row/in-flight trace write but before assistant completion still preserves the user prompt and restores the turn as incomplete/non-replayed on `/resume`.
- Integration: a second submit in the same session while a turn is active is rejected or queued according to the stated single-turn-per-session policy.
- Happy path: trace rows record provider/model, token estimate vs usage, compaction, cancellation, and outcome without any secret-bearing payloads.

**Verification:**
- A full turn streams to a mock client and persists a resumable transcript/log pair; cancel, disconnect, and error paths are non-fatal and leave no leaked registry entries.

---

### U7. `/model` selection flow, masked key entry, and status

**Goal:** Add the `/model` command and the hybrid Approach-3 surface with masked key entry, wired to the `kqode.model.*` methods, and reflect the active model in the status bar.

**Requirements:** R3, R4, R6, R7

**Dependencies:** U3, U6

**Files:**
- Create: `tui/src/components/ModelSelect/ModelSelect.tsx`, `ProviderList.tsx`, `MaskedKeyInput.tsx`, and `__tests__/ModelSelect.test.tsx`, `__tests__/MaskedKeyInput.test.tsx`
- Create: `tui/src/libs/backend/modelProtocol.ts`, `tui/src/state/modelAtoms.ts`, `tui/src/state/__tests__/modelAtoms.test.ts`
- Modify: `tui/src/App.tsx` (route exact `/model`), `tui/src/components/StatusBar.tsx`, `tui/src/libs/backend/processBackendClient.ts`

**Approach:**
- Mirror the `/resume` command pattern (U10): treat exact `/model` (trimmed) as a command; App owns routing and backend calls; `ModelSelect` is display-only. The surface shows a flat quick-switch list of configured (provider, model) entries with the active one marked, plus an "Add / configure provider" entry; selecting a configured entry calls `kqode.model.select`; the add entry launches the wizard with `MaskedKeyInput` (no plaintext echo) then `kqode.model.configure`.
- With only Kimi wired, the list shows Kimi (active or "needs key") + the add entry; built to scale to N providers. The status bar reflects the active provider/model (replacing the static affordance, R6). When a submit returns the no-key outcome (R7), open the `/model` configuration path.
- The surface also distinguishes key states (`configured`, `ephemeral env`, `needs key`, `stored key unrecoverable`) so a lost keychain item routes the user to explicit reconfiguration rather than silently falling back.
- Keyboard/focus contract: Up/Down moves the row selection, Enter confirms, Escape cancels/backtracks one level, and focus returns to the composer on close. If `/model` was opened because submit returned `needsConfiguration`, the submitted prompt is restored into the composer after configure/cancel and requires an explicit resubmit rather than auto-sending.
- Shared state (active model, configured list, `/model` mode) in Jotai; masked-input editing stays component-local. Keep non-color affordances (pointer marker, error markers) consistent with the `/resume` picker (U10).

**Patterns to follow:**
- `tui/src/components/ResumeSessionList.tsx` picker + App command routing; Jotai atoms convention; existing `tui/src/libs/backend/` separation between protocol/process client code and TUI components.

**Test scenarios:**
- Happy path: exact `/model` opens the surface; other slash text submits as a normal prompt.
- Happy path: the add-provider wizard masks the key input and never renders the typed key.
- Happy path: selecting a configured entry sets it active and updates the status bar; configuring Kimi calls configure with the entered key.
- Edge case: with no key configured, the surface presents the configure path; cancelling returns focus to the composer with the draft preserved.
- Happy path: a prompt that triggered `needsConfiguration` is restored to the composer after `/model` closes and is only sent again on explicit resubmit.
- Edge case: an unrecoverable stored credential surfaces a clear reconfigure state instead of pretending the provider is configured.
- Edge case: an ephemeral env-var credential is shown as usable-but-not-persisted.
- Covers AE3. Integration: submitting with no configured key opens the `/model` configuration path rather than showing a raw error.
- Edge case: color-stripped output keeps the selected-row pointer and error markers.

**Verification:**
- A user can run `/model`, configure Kimi with a masked key, see it active in the status bar, and switch selection without re-entering the key.

---

### U8. Streaming render, cancel, and error handling in the TUI

**Goal:** Consume streaming notifications, render the assistant response live, cancel on Esc, and render themed provider errors.

**Requirements:** R10, R11, R12

**Dependencies:** U6, U7

**Files:**
- Create: `tui/src/libs/backend/streamProtocol.ts`
- Modify: `tui/src/libs/backend/processBackendClient.ts`, `tui/src/libs/backend/backendClient.ts`, `tui/src/components/BodyPane.tsx`, `tui/src/App.tsx`, `tui/src/state/homeScreenAtoms.ts`, `tui/src/state/composerAtoms.ts`; extend `__tests__` under `tui/src/components` and `tui/src/libs/backend`
- Modify: `tui/src/components/StatusBar.tsx` if a streaming indicator is shown

**Approach:**
- `streamProtocol.ts` declares the notification method names (shared with Rust constants) and payload types; `processBackendClient.ts` registers `onNotification` handlers for turnStart/tokenDelta/turnEnd/compacted/turnError and exposes a typed event surface to App keyed by `turnId`.
- App appends an in-progress assistant message to the transcript (Jotai) and accumulates `tokenDelta`s into it; `BodyPane` renders the streaming text under the user prompt. On `compacted`, show a brief body-level system row anchored to the active turn. On `turnEnd`, finalize the message. On `turnError`, keep any partial assistant text visible, mark it errored, and render the themed error (reusing the homepage error styling) without crashing.
- Esc during an in-flight turn calls `kqode.message.cancel(turnId)`, stops accumulation, and keeps the partial text visible. Respect the bottom-stuck layout and cursor-placement contract when adding streaming/indicator rows.
- Streaming scroll rule: auto-follow only when the body viewport is already at the bottom; if the user has scrolled up, preserve the viewport and surface a lightweight "new output below" hint rather than snapping the cursor/scroll.

**Execution note:** Verify the Ink cursor still lands on the composer text row after adding any streaming/indicator rows (per `tui/AGENTS.md`).

**Patterns to follow:**
- `vscode-jsonrpc` `onNotification`; homepage transcript rendering + error theme; Jotai shared state; bottom-sticky layout + manual cursor contract.

**Test scenarios:**
- Happy path: a sequence of tokenDelta notifications for one `turnId` renders incrementally into one assistant message; turnEnd finalizes it.
- Covers AE2. Edge case: Esc mid-stream sends cancel, stops further rendering, and keeps the partial text visible; the composer regains focus.
- Covers AE4. Error path: a turnError notification renders the themed error and leaves the session interactive.
- Error path: a stream failure after partial output leaves the partial assistant text visible but clearly marked errored, and that partial is excluded from future prompt assembly.
- Happy path: a compacted notification shows a brief non-intrusive indication.
- Edge case: notifications arriving before the response promise resolves still correlate correctly because the client already knows the `turnId`.
- Edge case: when the user has scrolled up, streaming preserves viewport position and surfaces a "new output below" hint instead of auto-following.
- Edge case: layout/cursor — adding streaming and indicator rows keeps cwd/composer/status bottom-stuck and the cursor on the composer row.

**Verification:**
- An end-to-end run (mock or live Kimi) streams a visible response, cancels cleanly on Esc, and renders provider errors without crashing.

---

### U9. Add the SQLite session store and session JSON-RPC methods

**Goal:** Add a Rust-owned local SQLite session store under `~/.kqode/` and expose narrow JSON-RPC methods for starting, recording, listing, and resuming sessions.

**Requirements:** R17

**Dependencies:** None (relies on the homepage JSON-RPC backend as a prerequisite; see Dependencies / Prerequisites)

**Approach:**
- Add SQLite storage under the Rust backend, not under display components or TUI-only state.
- Use `rusqlite` with bundled SQLite (or an equivalent self-contained SQLite strategy) so packaged backends do not require system SQLite, pkg-config, vcpkg, or platform-specific runtime libraries.
- Place the SQLite database under `~/.kqode/` by default, with a test-only override so integration tests do not write to the real user profile.
- Create a small schema with `sessions`, `session_messages`, `session_context`, and `repo_memory` tables. Include stable ids, canonical absolute `workspace_cwd`, git root/repo key when detected, relative workspace subpath from the git root, `created_at`, `updated_at`, title/last-prompt metadata, message order, role/kind, status, text/content JSON, context fragments, and repo-memory kind/source fields.
- Keep writes explicit and ordered: start session, record each user prompt when it is sent to the backend, record the completed assistant response/error, and update session `updated_at`/last prompt. Do not persist frontend-only queued prompts or validation-only errors in this slice.
- Record repo memory only through an explicit session API/event with structured content. It must not infer broad semantic memory from arbitrary prompt text, and automatic repo-memory injection into the model context is deferred to a later memory-focused slice.
- Add JSON-RPC methods for `kqode.session.start`, `kqode.session.list`, `kqode.session.resume`, and extend `kqode.message.submit` to require `sessionId`.
- Session listing is always scoped to the current canonical absolute `workspaceCwd`; all-workspace browsing is out of scope for this slice. Canonicalization should resolve symlinks with best-effort realpath, normalize separators, and apply platform-appropriate case normalization where the filesystem is case-insensitive.
- Restore backend-observed transcript/context rows in stable message order and restore repo-memory rows for the session's git repo key. Frontend-only queued prompts from a crashed TUI are not restored because they were never sent to the backend.
- Keep session persistence scoped: no full trace replay, checkpoint/rewind/fork, rename/delete/export, cost accounting, or tool session state.

**Patterns to follow:**
- KQode architecture already assigns durable session state to Rust and SQLite indexes; keep the TUI as a protocol client.
- Reference research shows useful precedent for project-scoped session files/lists, workdir validation, and replayable append-style records.

**Test scenarios:**
- Happy path: starting the backend creates a SQLite database and a session row for the current `workspaceCwd`.
- Happy path: the SQLite database is created under a test-overridden KQode home path and the production default resolves under `~/.kqode/`.
- Happy path: packaged backend smoke tests confirm SQLite open/read/write works on each supported target without system SQLite dependencies.
- Happy path: starting a session inside a git repo stores git root/repo identity plus the relative workspace subpath and returns explicitly stored repo-memory rows for that repo.
- Happy path: submitting a prompt records the user message and the matching assistant response with exact text and stable order.
- Happy path: explicitly written repo-memory rows are restored for later sessions in the same git repo, including sessions launched from subfolders with distinct relative workspace subpaths.
- Happy path: listing sessions returns current-workspace sessions ordered by most recently updated.
- Happy path: resuming a session returns metadata, context rows, repo memory rows, and transcript entries in display order.
- Edge case: starting or resuming outside a git repo skips repo memory and still restores session transcript/context.
- Edge case: symlink/case-variant paths that canonicalize to the same workspace can resume; paths that canonicalize differently return a typed JSON-RPC error and do not switch cwd.
- Edge case: malformed/corrupt persisted rows fail visibly and do not crash the TUI process.
- Error path: SQLite open/write failure returns an explicit backend error that renders red in the TUI.

**Verification:**
- A killed and restarted TUI can recover the persisted transcript for a selected session without requiring daemon mode.

---

### U10. Implement `/resume` session picker and restore flow

**Goal:** Make `/resume` the first active slash command: list persisted sessions, let the user choose one, restore transcript/context, and continue appending prompts to that session.

**Requirements:** R12, R17

**Dependencies:** U9 (and the homepage TUI composer/submit surfaces as a prerequisite; see Dependencies / Prerequisites)

**Approach:**
- Treat `/resume` as a command only when the composer content is exactly `/resume` after trimming. Other slash-prefixed text remains normal prompt content for this slice.
- On `/resume`, call the backend session list method for the current absolute `workspaceCwd` and render only sessions whose stored canonical workspace path matches it, with title/id, updated time, workspace path, and last prompt.
- While the session list is loading, render a compact loading animation directly under the input composer in the same area where the list will appear.
- During session-list loading, treat the composer as command/list mode: do not append typed characters to the prompt, preserve the pre-`/resume` draft, and let Escape cancel back to the composer when possible.
- Render the session list directly under the input composer, not as a full-screen overlay. Show a 5-row visible window over the session list, highlight the currently selected row, and scroll the window as the selection moves.
- Prefix the selected session row with a non-color pointer such as `>` in addition to any color/inverse highlight.
- Apply the picker-open vertical layout contract: BodyPane shrinks first, list height is `min(5, availableRowsForPicker)`, and cwd/composer remain higher priority than decorative/status details.
- Use Up/Down arrow keys to move the highlighted selection; Enter resumes the highlighted session; Escape cancels and returns focus to the composer.
- On selection, call session resume, replace the visible transcript/context with restored entries, set the active `sessionId`, and keep the composer focused for the next prompt.
- During session restore, disable prompt submit and preserve any draft text until restore completes or fails.
- If a direct resume request somehow targets a session from another canonical workspace path, show a red error and keep the current session; never switch cwd or offer cross-workspace resume.
- If the active queue has unsent/in-flight prompts, block `/resume` with a red error until the queue is idle.
- Keep session management minimal: no delete, rename, archive, export, checkpoint, rewind, or fork in this slice.

**Patterns to follow:**
- Use a display-only Ink component for the picker; App owns command routing and backend calls.
- Keep loading animations terminal-safe, deterministic in tests, and isolated from persisted transcript/session state.
- Keep important states distinguishable without color: errors include text markers, selected rows include a pointer marker, loading includes static fallback text, and pending rows retain `(pending)`.
- Reference research favors project/workdir-scoped session lists and explicit workdir validation before resume; this slice tightens that to same-canonical-workspace-only.

**Test scenarios:**
- Happy path: `/resume` opens a current-workspace session list sorted by updated time.
- Happy path: while `/resume` is fetching sessions, a compact loading animation appears under the input bar and is replaced by the session list.
- Happy path: typed draft text before `/resume` is preserved while the session list loads and after Escape cancel.
- Happy path: the resume list appears under the input bar with 5 visible rows, a highlighted selected row, and Up/Down arrow navigation that scrolls beyond the visible window.
- Happy path: with colors stripped or `NO_COLOR` set, the selected row is still identifiable by `>` and errors remain identifiable by `ERROR:`/`!`.
- Happy path: opening `/resume` shrinks BodyPane first while preserving cwd, composer, picker rows, and bottom status bar at normal heights.
- Edge case: short terminal height renders fewer than 5 picker rows without hiding the composer or cwd.
- Happy path: selecting a session restores prior user prompts and assistant response/error entries, then a new prompt appends to the restored session.
- Happy path: restored sessions in a git repo include explicitly written repo-memory rows for that git repo and preserve the launched subpath metadata.
- Edge case: no sessions shows an empty-state message and returns to the composer without crashing.
- Edge case: fewer than 5 sessions renders only the available rows without empty selectable placeholders.
- Edge case: slash text other than exact `/resume` submits as normal prompt content.
- Error path: attempting `/resume` while queued/in-flight prompts exist shows a red error and does not switch sessions.
- Error path: backend list/resume failure shows a red error and preserves the current session.
- Error path: a resume request for a different canonical workspace path shows a red error and preserves the current session/cwd.
- Error path: loading animation stops when list/resume fails or Escape cancels.
- Error path: session list or restore failure returns focus to the composer and preserves the prior draft/current session.
- Error path: red errors retain non-color error markers in color-stripped output.

**Verification:**
- A developer can run the TUI, submit prompts, exit, relaunch, type `/resume`, select the previous session, see the restored transcript/context, and continue submitting prompts into that session.

---

## Acceptance Coverage Matrix

| Origin AE | Requirement(s) | Covered by |
|---|---|---|
| AE1 — compaction summarizes older turns, preserves full transcript | R14, R16 | U5 (transform), U6 (compacted notification + persistence) |
| AE2 — Esc cancels mid-stream, partial preserved | R11 | U6 (cancel + persist partial), U8 (stop render, keep partial) |
| AE3 — no key routes to `/model` config | R7 | U6 (routed outcome), U7 (open config path) |
| AE4 — provider failure renders themed error | R12 | U6 (turnError), U8 (themed render) |

---

## System-Wide Impact

- **Interaction graph:** the submit path changes from synchronous ACK to spawn-thread streaming with a client-generated `turnId`, a per-session admission lane, and an in-flight registry. The backend loop must remain responsive while turns stream; the TUI gains a notification channel alongside request/response.
- **Error propagation:** provider errors become sanitized `ProviderError` → `kqode/turnError` → themed TUI render; keychain/credential errors surface as explicit key states (`needs key`, `ephemeral env`, `unrecoverable stored`) and routed configuration prompts, never as a crash.
- **State lifecycle risks:** turn persistence is now two short writes (user-start, terminal outcome) rather than one trailing write; cancelled partials are persisted and visibly marked but excluded from normal assistant history; compaction must never mutate the persisted transcript or session log; the active-model row must stay consistent with credentials.
- **API surface parity:** the method/notification name constants must match exactly across Rust (`protocol.rs`/`model_protocol.rs`) and the shared TS module; the TS JSON-RPC client must handle interleaved responses and notifications and correlate all streaming events by `turnId`.
- **Concurrency and cleanup:** one active turn per session, a bounded global in-flight count, notification coalescing/backpressure rules, and guaranteed registry cleanup on success, cancel, disconnect, backend shutdown, and admission rejection are part of the contract, not implementation details.
- **Integration coverage:** streaming + compaction + persistence interplay is only proven end-to-end (U6/U8) — mock-provider integration tests, not unit mocks alone.
- **Unchanged invariants:** the no-daemon child-process model and bottom-stuck TUI layout + manual cursor contract are preserved. `/resume` and the SQLite session store are delivered by this plan (U9/U10) rather than assumed from homepage; this plan adds versioned migrations and the append-only session log on top of them without rewriting the user-facing session shape.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Ack/notification ordering races could make the TUI correlate the wrong turn | `clientTurnId` is supplied in `kqode.message.submit`, echoed in the ack, and present in every notification; correlation never depends on ack-first ordering |
| `lsp-server` is synchronous; naive async would block the loop or leak unbounded worker threads | Spawn a dedicated thread with a `tokio` current-thread runtime and a cloned `connection.sender`; enforce one active turn per session plus a small global in-flight bound; clean the registry on all terminal paths |
| Keychain unavailable on headless Linux/CI | Env-var fallback is explicit and ephemeral-only; tests use the `keyring` mock backend; clear status when neither keychain nor env var is available |
| Lost/corrupt DEK makes stored ciphertext undecryptable | Treat as `unrecoverable_stored`, route to explicit reconfiguration, and never silently fall back to a different secret source |
| Wrong Kimi endpoint region or model id for the user's key | Base URL and model are config fields with documented `.cn`/`.ai` and `kimi-k2.7-code`/`kimi-k2.6` options; default chosen, overridable |
| Misconfigured provider endpoint could exfiltrate the bearer token | Canonicalize and validate base URLs as HTTPS-only Moonshot hosts in production; allow test-only overrides explicitly |
| Streaming token injection / unsafe terminal control | Reuse the homepage sanitization of rendered text for streamed deltas before display |
| Compaction loses important context or inflates tokens | Structured distiller prompt + keep-recent window; abort on inflation; full history preserved in the append-only session log and transcript index; verify row hashes do not change |
| Turn crash/cancel leaves the transcript inconsistent or drops a submitted prompt | Append user-turn start to JSONL and index it before provider work; write assistant/trace terminal state transactionally; `/resume` restores incomplete turns without auto-resend |
| Leaking the API key into logs/trace/protocol/errors | Key lives only as keychain-wrapped ciphertext or ephemeral env state; results/trace/error payloads are sanitized and non-secret; assert no plaintext/bearer material appears in DB, protocol payloads, or trace rows |
| `eventsource-stream` staleness | Depend on `async-openai`, which encapsulates and maintains the SSE layer |

---

## Phased Delivery

### Phase A — Rust core (headless-capable)
- U9 SQLite session store + session JSON-RPC methods (persistence foundation for U3/U6), U1 provider + Kimi client, U2 secrets, U3 credential/model store + methods, U4 system prompt/assembly, U5 compaction, U6 streaming turn. The core can be exercised headlessly via the JSON-RPC backend before any TUI work.

### Phase B — TUI surfaces
- U7 `/model` flow + status, U8 streaming render + cancel + errors, U10 `/resume` session picker + restore. Depends on the Phase A methods/notifications.

---

## Dependencies / Prerequisites

- This plan assumes the homepage slice described in `docs/plans/2026-06-25-003-feat-first-ink-tui-homepage-plan.md` has landed first, including the source-mode Ink TUI, its component/theme patterns, the TUI-owned Rust child-process boundary, and the JSON-RPC `kqode.message.submit` flow. Session identity, `/resume`, and SQLite transcript persistence are delivered by this plan (U9/U10), not assumed as prerequisites. If the homepage slice is still not implemented, it is a prerequisite rather than hidden scope in this document.

---

## Documentation / Operational Notes
- Note the new `~/.kqode/` `provider_credentials` table and the keychain entry (service `kqode`) in operational docs; document the env-var fallback for headless use and the `.cn`/`.ai` base-URL choice.
- Document the new append-only session log, SQLite `user_version` migration path, the key-state surface (`configured`, `ephemeral env`, `unrecoverable stored`), and the explicit reconfigure flow after a lost keychain item.
- Record that real prompts/model output are now stored under `~/.kqode/`; transcript deletion/retention/redaction is a deferred privacy/compliance concern, not an accidental omission.
- Validation: Rust via `cargo test --workspace`, `cargo fmt --check`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`; TUI via `cargo xtask tui-typecheck` and `cargo xtask tui-test`. No live Kimi calls in the suite.
- A blog article documenting the provider/streaming/compaction design fits the `blog/docs/` series but is out of scope for this plan.

---

## Sources & References
- **Origin document:** `docs/brainstorms/2026-06-30-llm-provider-streaming-chat-requirements.md`
- Homepage plan (extended here): `docs/plans/2026-06-25-003-feat-first-ink-tui-homepage-plan.md`
- Current backend/protocol: `src/backend.rs`, `src/protocol.rs`
- Build path milestones M1 (headless agent loop) and M5 (streaming TUI): `docs/kqode_build_path.md`
- Reference-agent list: `blog/docs/01-KQode介绍.md`
- External: Kimi platform docs (`platform.kimi.com/docs/`); `keyring`, `chacha20poly1305`, `async-openai`, `lsp-server` crate docs; Gemini CLI / Codex / Claude Code compaction sources (from planning research).
