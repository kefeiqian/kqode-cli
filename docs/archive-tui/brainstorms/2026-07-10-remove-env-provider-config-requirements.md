---
date: 2026-07-10
topic: remove-env-provider-config
---

# Remove `.env` Provider Configuration

## Summary

Stop using `.env` as a provider-configuration mechanism. The Custom
(OpenAI-compatible) provider stays but is configured only through `/login`
(keychain key + saved base URL); all three `CUSTOM_*` environment variables are
removed, including the model-selection one. `.env`/dotenvy survives purely as a
dev convenience for `KQODE_DEBUG`, and `.env.example` is rewritten to document
only that.

---

## Problem Frame

Provider configuration currently lives in two places. The Custom provider can be
configured either through `/login` (OS keychain key + base URL persisted in the
local store) or through a workspace `.env` file (`CUSTOM_API_KEY`,
`CUSTOM_BASE_URL`, `CUSTOM_MODEL`), with keychain taking precedence. Selecting a
model through `.env` (`CUSTOM_MODEL`) is the sharpest edge: model choice is a
runtime decision that belongs in the `/model` flow, not a config file, and
having it in `.env` is confusing.

There is no near-term CI/CD need that justifies a `.env`-based config surface,
and if CI/CD arrives it should use real environment variables rather than a
committed or loaded `.env` file. The dual-source setup also carries ongoing
cost: an `env` credential-source state ("connected via .env") threads through the
Rust backend, the mirrored TypeScript contract, and the TUI status labels — extra
surface that only exists to support the `.env` provider path.

Where provider configuration is sourced, before vs after:

| Config input      | Before                                   | After                          |
|-------------------|------------------------------------------|--------------------------------|
| Custom API key    | `.env` `CUSTOM_API_KEY` **or** keychain  | keychain only (`/login`)       |
| Custom base URL   | `.env` `CUSTOM_BASE_URL` **or** store     | store only (`/login`)          |
| Custom model      | `.env` `CUSTOM_MODEL` **or** `/model`     | `/model` catalog only          |
| `KQODE_DEBUG`     | `.env` / process env / `--debug`         | `.env` / process env / `--debug` (unchanged) |

---

## Requirements

**`.env` provider configuration removal**
- R1. The backend no longer reads any provider configuration from environment variables: `CUSTOM_API_KEY`, `CUSTOM_MODEL`, and `CUSTOM_BASE_URL` are removed as recognized configuration inputs.
- R2. There is no environment-variable path that pins or selects a provider's model; model selection happens only through the `/model` flow.

**Custom provider (keychain-only)**
- R3. The Custom (OpenAI-compatible) provider remains available and is configured exclusively through `/login`: an API key in the OS keychain plus a base URL persisted in the local store.
- R4. If a Custom provider has no keychain key or no persisted base URL, it reports "not configured" and cannot serve a turn — the fail-closed behavior is unchanged, now with no `.env` fallback.
- R5. The Custom provider has no default model, so it is never auto-selected as the effective default; it becomes usable only after an explicit `/login` (and `/model`) selection. Preset providers (Kimi) continue to auto-default from their compiled model.
- R6. Loading a Custom provider's model catalog always fetches from the endpoint; the former `.env`-pinned single-model short-circuit is removed.

**Credential-source cleanup**
- R7. The `env` credential source is removed end-to-end: the `env` key-source / credential-source states and the `CREDENTIAL_SOURCE_ENV` protocol constant are deleted from the Rust backend and the mirrored TypeScript contract in lockstep.
- R8. Provider status surfaces (login and model views) only ever show "connected via keychain" or "not configured"; no "connected via .env" label, source tag, or workspace-cwd annotation remains.

**Dev-only `.env` retention**
- R9. The backend still loads a `.env` file at startup (via dotenvy) so dev-only variables keep working; `KQODE_DEBUG` remains readable from `.env`, the process environment, and the `--debug` flag.
- R10. `.env.example` is rewritten to document only dev-only variables (`KQODE_DEBUG`) and no longer references any provider or model configuration.

**Documentation**
- R11. The `AGENTS.md` "Provider configuration and storage" section is updated to describe Custom as keychain-only and `.env` as dev-only, removing statements that `.env` configures providers/models or that keychain precedes `.env`.

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given a workspace `.env` containing `CUSTOM_API_KEY`, `CUSTOM_MODEL`, and `CUSTOM_BASE_URL`, when the backend starts and provider status is read, the Custom provider is "not configured" and the env values are ignored.
- AE2. **Covers R4, R8.** Given the Custom provider has a keychain key but no persisted base URL, when provider status is listed, it shows "not configured" — never "connected via .env".
- AE3. **Covers R5.** Given no active selection and no keychain key for any provider, when a turn is submitted, it returns needs-configuration and Custom is never chosen as the effective default.
- AE4. **Covers R7, R8.** Given any connected provider, when its status label renders, the only connected label is "connected via keychain"; the string "via .env" appears nowhere in the protocol or UI.
- AE5. **Covers R9.** Given a `.env` file containing `KQODE_DEBUG=1`, when the backend starts in a packaged build, debug logging is enabled — dev-only `.env` loading still works.

---

## Success Criteria

- A user configuring a non-Kimi endpoint does so entirely through `/login`; there is no supported way to configure a provider or model via `.env`.
- Searching the codebase for `CUSTOM_API_KEY`, `CUSTOM_MODEL`, `CUSTOM_BASE_URL`, and the `env` credential-source finds no production reads (only removals/tests that assert their absence).
- The Rust and TypeScript provider contracts stay in lockstep with no dangling `env` credential-source state.
- A downstream implementer completes the change against the existing suites (`cargo test --workspace`, TUI typecheck/test) with `.env`/Env-source cases dropped, and invents no new provider-config surface.

---

## Scope Boundaries

- Keep the Custom provider — not removing it.
- Keep dotenvy and the `.env` file loader for dev-only variables — not removing `.env` entirely.
- No CI/CD setup in this change; future CI/CD is expected to use real environment variables, not a committed or loaded `.env` file.
- No changes to Kimi/keychain behavior, base-URL validation, or the `/login` and `/model` flows beyond removing the `.env` fallback paths.
- Historical `docs/plans/` and `docs/brainstorms/` records are left as-is; only living docs (`AGENTS.md`, `.env.example`) are updated.
- No migration or automatic import of existing `.env` Custom config into the keychain.

---

## Key Decisions

- **Keep Custom, keychain-only:** eliminates dual-source provider config while preserving bring-your-own-endpoint via `/login`.
- **Keep `.env` for dev only:** dotenvy stays so `KQODE_DEBUG` still loads from a `.env` file; `.env` is no longer a config surface for providers.
- **Remove the `env` credential-source state entirely** rather than leaving it unused: nothing else produces it, and a dead protocol state violates the repo's constants/enums convention and keeps Rust↔TS in sync.

---

## Dependencies / Assumptions

- Assumes the `/login` keychain path already persists the Custom base URL to the store (it does), so keychain-only Custom is fully functional without the `.env` fallback.
- `dotenvy` remains a dependency (for `KQODE_DEBUG`); no dependency is removed.
- Existing `.env`-only Custom users must re-add their provider via `/login`; this is acceptable at the current early stage and is not auto-migrated.
- The change touches the mirrored JSON-RPC provider contract, so Rust and TypeScript constants must change in lockstep (repo convention).

---

## Outstanding Questions

### Deferred to Planning

- [Affects R8][Technical] Whether the `cwd` parameter threaded into the status-label path has any remaining use once the `.env` annotation is gone, or should be dropped as well.
- [Affects R4][Technical] Exact rewording of the TUI login error hints that currently point users at `CUSTOM_API_KEY` in `.env`, so they guide toward keychain-only setup.
