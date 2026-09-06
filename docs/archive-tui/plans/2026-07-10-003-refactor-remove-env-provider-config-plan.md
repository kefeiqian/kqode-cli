---
title: 'refactor: Remove .env provider configuration'
type: refactor
status: completed
date: 2026-07-10
origin: docs/brainstorms/2026-07-10-remove-env-provider-config-requirements.md
---

# refactor: Remove .env provider configuration

## Summary

Remove `.env` as a provider-configuration mechanism. Delete the three `CUSTOM_*`
environment reads and the `env` credential-source state ("connected via .env")
end-to-end across the Rust backend, the mirrored JSON-RPC contract, and the TUI.
The Custom provider stays but is configured only through `/login` (keychain key +
store-persisted base URL). `dotenvy` still loads `.env` at startup so dev-only
`KQODE_DEBUG` keeps working; `.env.example` is rewritten to document only that.

---

## Problem Frame

Provider configuration currently lives in two places — `/login` (keychain +
store) and a workspace `.env` (`CUSTOM_API_KEY` / `CUSTOM_MODEL` /
`CUSTOM_BASE_URL`) — and selecting a model through `.env` is the sharpest edge.
Supporting the `.env` path also carries an `env` credential-source state that
threads through the Rust backend, the mirrored TS contract, and TUI status
labels. See origin for the full motivation and the before/after config-source
table (`docs/brainstorms/2026-07-10-remove-env-provider-config-requirements.md`).

---

## Requirements

Carried from the origin requirements doc (`see origin`):

- R1. Backend reads no provider configuration from env vars (`CUSTOM_API_KEY`, `CUSTOM_MODEL`, `CUSTOM_BASE_URL` removed as inputs).
- R2. No env-var path pins or selects a provider's model; model selection is `/model` only.
- R3. Custom provider remains, configured exclusively through `/login` (keychain key + store-persisted base URL).
- R4. Custom with no keychain key or no persisted base URL reports "not configured" and cannot serve a turn (fail-closed, no `.env` fallback).
- R5. Custom has no default model, so it is never auto-selected as the effective default; presets (Kimi) still auto-default from their compiled model.
- R6. Loading a Custom model catalog always fetches from the endpoint (no `.env`-pinned single-model short-circuit).
- R7. The `env` credential/key-source states and the `CREDENTIAL_SOURCE_ENV` protocol constant are deleted from Rust and the mirrored TS contract in lockstep.
- R8. Status surfaces show only "connected via keychain" or "not configured"; no "connected via .env" label, tag, or workspace-cwd annotation remains.
- R9. `.env`/dotenvy still loads at startup for dev-only vars; `KQODE_DEBUG` remains readable from `.env`, the process env, and `--debug`.
- R10. `.env.example` documents only dev-only vars (`KQODE_DEBUG`); no provider/model config.
- R11. `AGENTS.md` "Provider configuration and storage" describes Custom as keychain-only and `.env` as dev-only.

**Origin acceptance examples:** AE1 (env ignored → not configured, covers R1/R2), AE2 (keychain key, no base URL → not configured, covers R4/R8), AE3 (no selection/no keychain → needs config, Custom never default, covers R5), AE4 (only "connected via keychain"; "via .env" absent, covers R7/R8), AE5 (`KQODE_DEBUG=1` from `.env` still enables logging, covers R9).

---

## Scope Boundaries

- Keep the Custom provider — not removing it.
- Keep `dotenvy` and the `.env` loader for dev-only vars — not removing `.env` entirely.
- No CI/CD setup here; future CI/CD is expected to use real environment variables, not a `.env` file.
- No changes to Kimi/keychain behavior, base-URL HTTPS/SSRF validation, or the `/login` and `/model` flows beyond removing the `.env` fallback paths.
- No migration or auto-import of existing `.env` Custom config into the keychain.
- Historical `docs/plans/` and `docs/brainstorms/` records are left as-is; only living docs (`AGENTS.md`, `.env.example`) are updated.

---

## Context & Research

### Relevant Code and Patterns

- Env reads to remove: `src/config.rs` (`CUSTOM_*_VAR` constants, `custom_env_model`, `custom_env_base_url`, `non_empty_var`).
- Credential resolution: `src/secrets/mod.rs` (`env_key`, `resolve_key`, `KeychainKeyResolver`) — keychain-preferred-over-env logic becomes keychain-only.
- Status derivation: `src/provider/registry.rs` (`KeySource`, `CredentialSource`, `derive_status`, `effective_default_model`) and `src/backend/providers.rs` (`key_source`, `fallback_base_url`, `status_fields`, `gate_status_on_base_url`).
- Submit + catalog resolution: `src/backend/resolve.rs` (`effective_default`) and `src/login.rs` (`list_models`, `resolve_base_url`, `custom_env_model_result`).
- Protocol constant + mirror: `src/protocol/providers.rs` (`CREDENTIAL_SOURCE_ENV`) and `tui/src/contracts/backend/providerMessages.ts` (comment explicitly requires lockstep).
- TUI status labels: `tui/src/libs/providers/statusLabel.ts`, `tui/src/libs/model/index.ts`, `tui/src/components/LoginSurface/ProviderList.tsx`.
- Startup loader (retained): `src/backend/mod.rs` `dotenvy::dotenv().ok()`.

### Institutional Learnings

- `docs/solutions/` has no provider/config learnings (entries cover TUI rendering, state layering, memory, backend-process lifecycle) — none apply.
- Wire-protocol convention (verified this session): JSON-RPC constants/shapes are mirrored Rust↔TS and must change in lockstep; `providerMessages.ts` carries `Must match … in src/protocol.rs` comments. Rust uses serde `deny_unknown_fields` + camelCase.

### External References

- None. Well-patterned internal refactor with strong local patterns; external research skipped.

---

## Key Technical Decisions

- **Rust removal as one cohesive unit:** the env reads, the `Env` enum variants, the protocol constant, and their tests land together to stay green. `KeySource`/`CredentialSource` are exported pub API (`pub use` in `src/provider/mod.rs`), so `dead_code` does **not** reliably flag a lingering never-constructed `Env` variant — the plan does not rely on that lint. The reliable gates are the grep check (`CredentialSource::Env` / `CREDENTIAL_SOURCE_ENV`), `match`-arm exhaustiveness after the variant is deleted, and `unused_imports` on `CUSTOM_API_KEY_VAR` / `CREDENTIAL_SOURCE_ENV`, then `clippy -- -D warnings`. Splitting auth vs. model/URL would double-touch `config.rs` and several test files with intermediate dead-code states.
- **Delete the `env` credential-source state rather than leave it unused** (R7): nothing produces it after the key read is gone, and a dead protocol state violates the constants/enums convention. The Rust constant and TS mirror change within this plan (lockstep).
- **Drop the `cwd` parameter from the status-label path** (resolves origin deferred Q1): `cwd` exists only to render "connected via .env (`cwd`)"; with the env source gone it is dead plumbing through `statusLabel` → `ProviderList` → the login surface.
- **Reword login error hints to keychain-only guidance** (resolves origin deferred Q2): hints telling users to set `CUSTOM_API_KEY` in `.env` become factually wrong once env keys aren't read.
- **Rework env-based tests into keychain equivalents, don't just delete:** preserve the SSRF-preset guarantee (a Custom endpoint value must never override a preset's fixed base URL) and the not-configured coverage, and add an explicit regression test that `CUSTOM_*` env is ignored.

---

## Open Questions

### Resolved During Planning

- Origin deferred Q1 (fate of the `cwd` status-label param): remove it — it only fed the `.env` annotation.
- Origin deferred Q2 (rewording of the `CUSTOM_API_KEY`/`.env` login hints): reword to keychain-only guidance ("keychain unavailable" framing), dropping the env references.

### Deferred to Implementation

- `gate_status_on_base_url`'s "key present but no base URL → not configured" branch is unreachable once Custom is keychain-only: a settings row created via the `/login` keychain flow always carries a store-persisted `base_url` (non-optional `String`), so `provider_list` reaches `notConfigured` for Custom only via `key_source` → `None`. Keep the guard as documented defensive code (optionally cover it with an isolated unit test labeled currently-unreachable); do not assert it via the AE2 scenario.
- A stale `active_selection` row pointing at Custom could persist from the `.env` era (written by `/model` when `CUSTOM_MODEL` pinned a single-model catalog). After this change the model surface may show a Custom selection that every submit rejects as needs-configuration — confirm whether such dangling selections should be cleared or surfaced.
- Exact final copy for the reworded hints (wording detail, not behavior).

---

## Implementation Units

### U1. Remove all `.env` provider configuration and the `env` credential source (Rust backend)

**Goal:** Delete every `CUSTOM_*` env read and the `env` credential/key-source state from the Rust backend and JSON-RPC contract, leaving Custom keychain-only and presets unchanged, while keeping `dotenvy` for `KQODE_DEBUG`.

**Requirements:** R1, R2, R3, R4, R5, R6, R7 (Rust half), R8 (backend status), R9 (loader retained)

**Dependencies:** None

**Files:**
- Modify: `src/config.rs` — remove `CUSTOM_API_KEY_VAR`, `CUSTOM_MODEL_VAR`, `CUSTOM_BASE_URL_VAR`, `custom_env_model`, `custom_env_base_url`, `non_empty_var`; update module docs to "dev-only `.env`".
- Modify: `src/secrets/mod.rs` — remove `env_key`, `non_empty_env`, the `CUSTOM_API_KEY_VAR` import; `resolve_key` becomes keychain-only; `KeychainKeyResolver::key_source` returns `Keychain` or `None`.
- Modify: `src/provider/registry.rs` — remove the `Env` variant from `KeySource` and `CredentialSource`; drop the `Env` arm in `derive_status`; `effective_default_model` returns the compiled default only (Custom → `None`).
- Modify: `src/login.rs` — remove the `list_models` env-model short-circuit and `custom_env_model_result`; `resolve_base_url` for Custom uses store settings only (no `custom_env_base_url` fallback).
- Modify: `src/backend/providers.rs` — drop the `CUSTOM_API_KEY` branch in `key_source`, the env branch in `fallback_base_url`, the `CredentialSource::Env` arm in `status_fields`, and the `CREDENTIAL_SOURCE_ENV`/`CUSTOM_API_KEY_VAR` imports; keep `gate_status_on_base_url`.
- Modify: `src/protocol/providers.rs` — remove the `CREDENTIAL_SOURCE_ENV` constant.
- Modify: `src/backend/mod.rs` — update the `dotenvy::dotenv().ok()` doc comment to explain it loads dev-only vars (`KQODE_DEBUG`), not provider config.
- Test: `src/config/tests.rs` — remove the `custom_env_model_*` / `custom_env_base_url_*` tests and the `clear()`/env helpers; keep `debug_redacts_the_api_key`.
- Test: `src/secrets/tests.rs` — remove `clear_does_not_touch_env_fallback` and the env half of `resolver_prefers_keychain_over_env` / `kimi_has_no_env_fallback`; drop the `CUSTOM_API_KEY_VAR` plumbing in `IsolatedState`; keep round-trip, per-provider clear, keychain-unavailable, and redaction tests.
- Test: `src/backend/resolve/tests.rs` — remove `no_active_row_uses_custom_env_default` and `custom_env_base_url_must_be_https_or_submit_needs_config`; drop the env plumbing in `IsolatedState`; keep keychain-selection, kimi-default, active-without-key, and nothing-configured tests.
- Test: `src/backend/providers/tests.rs` — remove `provider_list_reports_custom_connected_via_env_with_default_model`; rework `provider_list_marks_custom_not_configured_without_a_base_url` to a keychain-only shape; drop the `EnvGuard` `CUSTOM_*` plumbing.
- Test: `src/provider/kimi/tests.rs` — drop the `KeySource::Env → CredentialSource::Env` case from the status-derivation test; keep its keychain/none coverage.
- Test: `src/login/tests.rs` — delete `list_models_pins_custom_env_model_without_fetch`, `custom_env_model_result_sanitizes_pinned_id`, and `resolve_base_url_falls_back_to_custom_env_when_store_has_no_settings`; drop the env plumbing in `resolve_base_url_is_none_for_custom_without_store_or_env`; rework `resolve_base_url_uses_compiled_endpoint_for_fixed_preset_providers` to persist an attacker base URL for Custom in the **store** (not env) and assert `resolve_base_url(Kimi)` stays on the compiled endpoint (the retained SSRF-preset test named in Risks); keep `unreachable_set_key_does_not_leak_sentinel_to_persistent_sinks` unchanged (the key-never-reaches-persistent-sinks guard).
- Test: `tests/cli_invocation.rs`, `tests/common/rpc.rs` — remove the `.env("CUSTOM_API_KEY", "")` lines and the stale dotenvy comment (temp `HOME` already yields an unconfigured backend); keep `KQODE_DEBUG=0`.

**Approach:**
- Remove the env reads, the `Env` enum variants, the protocol constant, and their tests together. `KeySource`/`CredentialSource` are exported pub API (`pub use` in `src/provider/mod.rs`), so `dead_code` does **not** reliably flag a lingering never-constructed `Env` variant — the reliable green-keeping gates are the grep check, `match`-arm exhaustiveness after the variant is deleted, and `unused_imports` on `CUSTOM_API_KEY_VAR` / `CREDENTIAL_SOURCE_ENV`.
- `effective_default` in `src/backend/resolve.rs` needs no direct edit — it inherits the new `effective_default_model` (Custom → `None`), so Custom is skipped as an auto-default.
- Preserve the SSRF guarantee: presets keep their compiled `Fixed` endpoint; only the Custom `Custom` endpoint path loses its env fallback (store-only).
- AE5 (dev `.env` still enables `KQODE_DEBUG`) is preserved by construction — the `dotenvy` loader in `src/backend/mod.rs` is untouched (only its doc comment changes) and the existing `debug_log` truthiness tests cover the toggle, so no new integration test is warranted.

**Patterns to follow:**
- Keychain-preferred resolution already in `src/secrets/mod.rs`; keep the uncached per-operation read.
- `deny_unknown_fields` + camelCase serde on protocol structs in `src/protocol/`.

**Test scenarios:**
- Covers AE1. Happy path: `provider_list` with `CUSTOM_API_KEY`/`CUSTOM_MODEL`/`CUSTOM_BASE_URL` all set in the process env still reports Custom `notConfigured` with `credentialSource: None` — proves env is ignored.
- Covers AE3. Happy path: no active selection + only a Kimi keychain key → `resolve_submit_config` resolves Kimi (compiled model + fixed base URL); Custom is never chosen as the effective default.
- Edge case: Custom has a keychain key + store base URL but no active selection → `resolve_submit_config` does not auto-select Custom (no default model).
- Covers AE2. Edge case: a Custom provider with no keychain settings row → `provider_list` reports `notConfigured` via `key_source` → `None`. (A keychain-connected Custom always carries a store `base_url`, so `gate_status_on_base_url`'s downgrade branch is unreachable on this path — see Deferred to Implementation; do not assert the gate through this scenario.)
- Happy path: `resolve_key(Custom)` returns the keychain key and returns `None` when the keychain has none (no env fallback consulted).
- Error path: preset base URL is never overridable — an attacker base URL persisted for Custom in the store leaves `resolve_base_url(Kimi)` on the compiled `DEFAULT_KIMI_BASE_URL` (reworked SSRF-preset test, no env).
- Happy path: `list_models(Custom)` performs a catalog fetch path (no env-pinned single-model short-circuit remains).

**Verification:**
- `cargo build`, `cargo test --workspace`, `cargo fmt --check`, and `cargo clippy --workspace --all-targets --all-features -- -D warnings` all pass.
- Grep finds no production reads of `CUSTOM_API_KEY` / `CUSTOM_MODEL` / `CUSTOM_BASE_URL` / `CREDENTIAL_SOURCE_ENV` / `CredentialSource::Env` in `src/`.

---

### U2. Remove the `env` credential source from the TypeScript contract and TUI status surfaces

**Goal:** Delete the `env` credential source from the mirrored TS contract and every TUI status-rendering path, and drop the now-dead `cwd` annotation plumbing.

**Requirements:** R7 (TS half), R8

**Dependencies:** U1 (lockstep protocol removal)

**Files:**
- Modify: `tui/src/contracts/backend/providerMessages.ts` — remove `CREDENTIAL_SOURCE_ENV`; `CredentialSource` narrows to `typeof CREDENTIAL_SOURCE_KEYCHAIN`.
- Modify: `tui/src/libs/providers/statusLabel.ts` — remove the `CREDENTIAL_SOURCE_ENV` branch, the `via .env` tag, and the `cwd` parameter.
- Modify: `tui/src/libs/model/index.ts` — remove `MODEL_SOURCE_TAG_ENV` and the `CREDENTIAL_SOURCE_ENV` branch in `modelSourceTag`.
- Modify: `tui/src/components/LoginSurface/ProviderList.tsx` — drop the `cwd` prop from `ProviderList`/`ProviderRow` and the `statusLabel` call.
- Modify: `tui/src/components/LoginSurface/index.tsx` — stop passing `cwd` to `ProviderList` (trace and remove the now-unused source).
- Test: `tui/src/libs/providers/__tests__/statusLabel.test.ts` — remove the `.env` label case.
- Test: `tui/src/components/ModelSurface/__tests__/ModelSurface.test.tsx` — remove the `CREDENTIAL_SOURCE_ENV` / "Kimi (via .env)" assertions.
- Test: `tui/src/components/LoginSurface/__tests__/LoginSurface.test.tsx` — remove the "connected via .env" assertions.
- Test: `tui/src/state/global/__tests__/activeModel.test.ts` — switch `CREDENTIAL_SOURCE_ENV` fixtures to keychain.

**Approach:**
- Narrowing `CredentialSource` to a single member surfaces every dead branch at typecheck time — let `tsc` drive the cleanup.
- `cwd` removal is pure plumbing deletion; keep the login surface otherwise unchanged.

**Patterns to follow:**
- Existing keychain-only rendering in `statusLabel.ts` (`connected via keychain`) and `modelSourceTag` (`keychain` tag).

**Test scenarios:**
- Covers AE4. Happy path: a connected provider renders "connected via keychain" and the compact model tag renders `keychain`; no code path can produce a `.env`/`via .env` string.
- Edge case: a not-configured provider still renders "not configured" with no `cwd` argument in the call.
- Happy path: `modelSourceTag(keychain)` → `keychain`; `modelSourceTag(null)` → `null` (env input is no longer representable).

**Verification:**
- `cargo xtask tui-typecheck` and `cargo xtask tui-test` pass; grep finds no `CREDENTIAL_SOURCE_ENV`, `via .env`, or `MODEL_SOURCE_TAG_ENV` in `tui/src/`.

---

### U3. Reword TUI credential hints to keychain-only guidance

**Goal:** Replace the `CUSTOM_API_KEY`/`.env` guidance in login error/outcome copy with keychain-focused wording and drop remaining TUI-side `CUSTOM_API_KEY` references.

**Requirements:** R4 (user-facing guidance), R8

**Dependencies:** None

**Files:**
- Modify: `tui/src/components/LoginSurface/OutcomeMessage.tsx` — reword the `SET_KEY_OUTCOME_STORE_FAILED` text (currently "set `CUSTOM_API_KEY` in `.env`") to keychain guidance; keep the Custom-specific store-failure override.
- Modify: `tui/src/components/LoginSurface/useLoginBackend.ts` — reword the four `.env`/`CUSTOM_API_KEY` hint strings (backend-unavailable, could-not-read-providers, login-failed, clear-failed) to keychain-only framing.
- Modify: `tui/src/backend/process/processEnv.ts` — reword the env-allowlist comment so it no longer cites `CUSTOM_API_KEY` as a `.env`-read provider key (state that provider keys stay out of the forwarded allowlist), satisfying the U3 grep gate.
- Modify: `tui/src/backend/testUtils/tempHome.ts` — drop `CUSTOM_API_KEY` from the `EnvName` union.
- Test: `tui/src/backend/client/__tests__/backendClient.test.ts` — drop the `CUSTOM_API_KEY: ''` env override (temp home already yields not-configured), and reword the accompanying `// finds no CUSTOM_API_KEY` comment; keep `KQODE_DEBUG: '0'`.
- Test: `tui/src/backend/process/__tests__/backendProcess.test.ts` — update the "no CUSTOM_API_KEY" comment to reflect keychain-only.
- Test: `tui/src/components/LoginSurface/__tests__/*.tsx` — update any assertions on the reworded hint copy.

**Approach:**
- Pure copy + test-fixture change; no behavior change. Wording should point at OS-keychain availability, not `.env`.

**Patterns to follow:**
- Existing themed outcome copy in `OutcomeMessage.tsx`; existing degraded-mode hint style in `useLoginBackend.ts`.

**Test scenarios:**
- Happy path: the store-failed outcome for a preset renders keychain-oriented copy with no `.env`/`CUSTOM_API_KEY` mention.
- Edge case: the Custom store-failed override still renders "Custom can't be saved while settings storage is unavailable."
- Happy path: with no keychain key, a submit still returns an accepted-only ack (backend deterministically not-configured without the `CUSTOM_API_KEY: ''` override).

**Verification:**
- `cargo xtask tui-typecheck` and `cargo xtask tui-test` pass; grep finds no `CUSTOM_API_KEY` in `tui/src/`.

---

### U4. Rewrite `.env.example` and update AGENTS.md provider docs

**Goal:** Make the living docs describe Custom as keychain-only and `.env` as dev-only.

**Requirements:** R9, R10, R11

**Dependencies:** None

**Files:**
- Modify: `.env.example` — remove `CUSTOM_API_KEY`/`CUSTOM_MODEL`/`CUSTOM_BASE_URL`; document only dev-only vars (`KQODE_DEBUG`), with the `--debug` note.
- Modify: `AGENTS.md` — update the "Provider configuration and storage" section: Custom is keychain-only (`/login` key + store base URL), `.env` is dev-only, drop statements that `.env` configures providers/models or that "keychain > .env" precedence exists; keep the keychain/SQLite-index/Kimi-preset facts.

**Approach:**
- Keep `.env` gitignored (still used for dev); no `.gitignore` change.
- Preserve accurate, still-true storage facts in `AGENTS.md`; only remove the `.env`-as-provider-config claims.

**Test scenarios:**
- Test expectation: none — documentation only.

**Verification:**
- `.env.example` references no `CUSTOM_*` var; `AGENTS.md` "Provider configuration and storage" contains no "connected via .env" / "keychain > .env" provider-config claim; `rg 'CUSTOM_' AGENTS.md .env.example` returns nothing.

---

## System-Wide Impact

- **Interaction graph:** provider status derivation (login + model surfaces), submit-time config resolution (`resolve_submit_config`), and `/model` catalog loading all lose their `.env` branches; presets and keychain paths are untouched.
- **API surface parity:** the JSON-RPC provider contract drops `credentialSource: "env"` — Rust (`src/protocol/providers.rs`) and TS (`tui/src/contracts/backend/providerMessages.ts`) must change together (U1 + U2). No method names or request/response shapes change otherwise.
- **Error propagation:** unconfigured Custom continues to fail closed (needs-configuration); no new error paths.
- **State lifecycle risks:** existing `.env`-only Custom setups stop resolving until re-added via `/login`; not auto-migrated (by decision).
- **Unchanged invariants:** keychain resolution, base-URL HTTPS/SSRF validation, preset fixed endpoints, `gate_status_on_base_url`, and `dotenvy` startup loading (retained for `KQODE_DEBUG`) are all preserved.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Rust↔TS protocol drift if only one side removes `CREDENTIAL_SOURCE_ENV` | U1 and U2 land in this plan; U2 depends on U1 and narrows the TS type so `tsc` catches any residual use. |
| Partial Rust removal leaves dead `env` protocol state | Remove producers, `Env` enum variants, the protocol constant, and imports together within U1. `dead_code` does not flag never-constructed variants of *exported pub* enums, so rely on the grep gate + `match`-arm exhaustiveness + `unused_imports`, then `clippy -- -D warnings`. |
| Existing `.env`-only Custom users silently lose config | Documented in `.env.example` + `AGENTS.md`; re-login via `/login` restores it; no silent behavior beyond loss of an unsupported path. |
| A reworked test weakens the SSRF-preset guarantee | Keep an explicit test that a Custom store base URL never overrides a preset's compiled endpoint. |

---

## Sources & References

- **Origin document:** `docs/brainstorms/2026-07-10-remove-env-provider-config-requirements.md`
- Related code: `src/config.rs`, `src/secrets/mod.rs`, `src/provider/registry.rs`, `src/login.rs`, `src/backend/providers.rs`, `src/backend/resolve.rs`, `src/protocol/providers.rs`, `tui/src/contracts/backend/providerMessages.ts`, `tui/src/libs/providers/statusLabel.ts`
- Prior art: `docs/plans/2026-07-05-002-feat-provider-login-and-model-selection-plan.md` (established the provider/login/keychain model)
