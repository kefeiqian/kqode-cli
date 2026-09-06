---
title: Backend process lifecycle ownership in the Ink TUI
date: "2026-06-30"
category: docs/solutions/architecture-patterns/
module: tui
problem_type: architecture_pattern
component: tooling
severity: medium
symptoms:
  - "State atoms or React components import process spawn or launch code"
  - "Backend lifecycle is split between state and component effects"
applies_when:
  - "A TUI or CLI has a long-lived backend process that must start once at app boot"
  - "State management must not import or own process-launching code"
  - "A narrow client seam lets state submit work without managing lifecycle"
  - "Cleanup must be centralized at app shutdown, e.g. via waitUntilExit()"
tags:
  - composition-root
  - dependency-injection
  - process-lifecycle
  - backend-runtime
  - state-isolation
  - ink-tui
  - jotai
  - eager-startup
---

# Backend process lifecycle ownership in the Ink TUI

## Context

KQode's terminal UI is a TypeScript Ink app (`tui/`) that talks to a Rust backend spawned as a JSON-RPC child process. A committed guardrail test, `tui/src/__tests__/backendIsolation.test.ts`, forbids everything under `src/state/**` and `src/components/**` from importing process/launch code (`createBackendClient`, `launchSourceBackend`, `node:child_process`, `tree-kill`, …). The intent: the display/state layer reaches the backend **only** through a narrow injected `BackendClient` seam (`submitMessage` only), never through process mechanics. This isolation rule and the narrow seam predate this work — they were established earlier on the `feat/first-ink-tui-jsonrpc-backend` branch. (session history)

A work-in-progress had placed backend creation **inside a Jotai state atom** (`initializeRuntimeAtom`), which called `createProcessBackendClient({ launch: () => launchSourceBackend(...) })` and was driven by `App`'s `useEffect` (init on mount, dispose on unmount). That made the isolation test red. When asked to fix it, the reflex objection was "is this dependency injection just to satisfy a test?" The resolving insight: **the backend's lifetime equals the TUI *process* lifetime, not a React *component* lifetime.** `App` is the root component — it mounts once and unmounts once — so tying process create/dispose to a `useEffect` is a category mismatch (and risks StrictMode/remount double-spawn or double-kill). The natural owner is the program entry point.

## Guidance

Own process-backed lifecycles at the **composition root** (`main.tsx`), not in React state or components. State holds only a narrow, already-created client seam.

1. The composition root creates the process client, starts it eagerly, and wires teardown:

```ts
// tui/main.tsx
const backendClient = createBackendClient({
  launch: () => launchSourceBackend({ repoRoot, workspaceCwd })
});
const disposeBackend = startBackendRuntime(store, backendClient);

const { waitUntilExit } = render(
  <Provider store={store}><App /></Provider>
);
void waitUntilExit().finally(disposeBackend); // dispose when the TUI process exits
```

`main.tsx` is the **only** module that imports the process client / launch code.

2. A thin runtime controller injects the client and owns eager start + the loading hint, returning a disposer. It depends only on a structural client type (`BackendClient & { ensureStarted(); dispose() }`) and the state atoms — never on the process-client module:

```ts
// tui/src/backend/runtime/backendRuntime.ts
export function startBackendRuntime(store, client) {
  store.set(backendClientAtom, client);
  store.set(startupStatusHintAtom, BACKEND_LOADING_HINT);
  void client
    .ensureStarted()
    .catch(() => {
      client.dispose();
      store.set(backendClientAtom, undefined);
    })
    .finally(() => store.set(startupStatusHintAtom, undefined));
  return () => client.dispose();
}
```

3. State exposes only the narrow seam; consumers (e.g. the prompt queue) submit through it:

```ts
// tui/src/state/global/backend.ts
export const backendClientAtom = atom<BackendClient | undefined>(undefined);
// BackendClient = { submitMessage(params): Promise<MessageSubmitResult> }
```

4. Components stop managing the process. `App` was reduced to window-size wiring; the init/dispose effect was deleted. Tests inject a fake `{ submitMessage }` by setting `backendClientAtom` on an isolated store, so no test spawns a real process.

Start eagerly, not lazily: `submitMessage` would lazily start the backend on first use via `ensureSession()`, but the eager `ensureStarted()` at boot is what spawns the process up front and drives the "Loading backend" hint. Eager startup was an explicit product requirement.

## Why This Matters

- **Layering / testability**: state and components contain zero process-spawning code, so the entire state tree is unit-testable without launching OS processes. The `backendIsolation.test.ts` guardrail makes this property executable, not aspirational.
- **Correct lifetime model**: backend lifetime tracks the TUI process, not a component mount cycle. The root component effectively never remounts, so the "React-driven lifecycle" was illusory.
- **Avoids remount hazards**: process create/dispose can't be double-fired by StrictMode or a remount.
- **Clean startup UX**: eager start plus a single "Loading backend" status hint, cleared on settle.
- **Simpler tests and wiring**: removing the effect deleted a dead `autoInitializeRuntime` flag and let tests inject a narrow fake. Wiring later collapsed further — the bootstrap atoms are seeded by direct `store.set` at the composition root (no seed helper), and tests set only the atoms they need on an isolated store.

## When to Apply

Whenever an Ink/CLI TUI wires any **process-backed, session-lived dependency** — backend server, model/provider worker, MCP server, or other long-lived child process — and:

- the dependency should live for the whole app session,
- UI/state should talk to it only through a narrow interface, and
- you need eager startup and deterministic teardown.

Keep a guardrail test that forbids `state/**` and `components/**` from importing the process/launch modules, so the boundary can't silently erode.

## Examples

**Before (wrong)** — creation/lifecycle inside a state atom, triggered by a component effect:

```ts
// WIP: violated backendIsolation.test.ts (state imported launch code)
export const initializeRuntimeAtom = atom(null, async (get, set) => {
  const client = createProcessBackendClient({ launch: () => launchSourceBackend(...) });
  set(backendClientAtom, client);
  await client.ensureStarted();
});
// App.useEffect(() => { void initializeRuntime(); return () => disposeRuntime(); }, [])
```

**After (current)** — composition root owns lifecycle; state holds the narrow seam:

- `tui/main.tsx` creates the client, calls `startBackendRuntime(store, client)`, and wires `waitUntilExit().finally(dispose)`.
- `tui/src/backend/runtime/backendRuntime.ts` — `startBackendRuntime`.
- `tui/src/state/global/backend.ts` — `backendClientAtom` (just `BackendClient | undefined`).
- `tui/src/App.tsx` — window-size wiring only; no backend effect.
- `tui/src/backend/runtime/__tests__/backendRuntime.test.ts` — verifies eager start, hint set/clear, dispose handle, and the start-failure path with a fake client (no real process).

Supporting structure introduced alongside this: backend code lives under `tui/src/backend/` (alias `@backend`) split into `client/`, `protocol/`, `process/`, `runtime/`; the prompt-queue state that drains through the backend lives under `tui/src/state/promptQueue/`.

## Related

- Guardrail: `tui/src/__tests__/backendIsolation.test.ts`
- Narrow seam type: `tui/src/contracts/backend/client.ts`
- Backend client lifecycle handle (lazy `ensureSession`, `ensureStarted`, `dispose`): `tui/src/backend/client/backendClient.ts`
- No related GitHub issues found.
