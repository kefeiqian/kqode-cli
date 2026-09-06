---
title: State-vs-libs layering and import-cycle verification in the Ink TUI
date: 2026-07-04
category: docs/solutions/architecture-patterns/
module: tui
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - Adding or reorganizing TUI Jotai state under tui/src/state/
  - Deciding where pure helper/calculation functions and shared types belong
  - Verifying the codebase has no circular imports or layering violations
tags:
  - jotai
  - atoms
  - dependency-cycle
  - madge
  - ink-tui
  - layering
  - refactoring
  - tsconfig-paths
---

# State-vs-libs layering and import-cycle verification in the Ink TUI

## Context

The TUI state layer (`tui/src/state/`) had accumulated pure helper/calculation
functions mixed in with Jotai atoms: slash-command matching/filtering, composer
text validation, backend queue → body-entry mapping, and home-screen layout math.
Components imported these calculation functions directly from `@state/...`, which
coupled presentation logic to the state layer and left the door open to import
cycles (a lib helper importing back into `@state`).

The goal: `tui/src/state/` should contain **only atoms**; every pure helper,
shared datum, and its types should live in the reusable `tui/src/libs/` layer.

## Guidance

**1. `state/` is atoms-only. Pure logic and shared data live in `libs/`.**

Move any non-atom export (calculation function, registry/data, plain type that
travels with a helper) out of `state/` into `tui/src/libs/<domain>/`. State
barrels (`index.ts`) then re-export atoms only.

What moved in this refactor:

| From (`state/`) | To (`libs/`) | Contents |
|---|---|---|
| `ui/commands/{registry,matchCommand,filterCommands,unknownCommand,executeCommand}.ts` | `libs/commands/*` | command data + matching/filter/execute helpers |
| `ui/composer/text.ts` | `libs/composer/promptText.ts` | `printableInput`, `validateComposerSubmit`, `overLimitMessage`, `PROMPT_MAX_BYTES` |
| `promptQueue/bodyEntries.ts` | `libs/promptQueue/promptQueue.ts` | `queueToBodyEntries`, `backendErrorMessage`, `QueueItem` types |
| `ui/layout.ts` (`resolveHomeScreenLayout` + row constants) | `libs/tui/layout.ts` | home-screen layout math |

**2. Enforce a one-way dependency direction: components → state → libs.**

`libs` must **never** import `@state`. This is the load-bearing rule — it is what
makes cycles structurally impossible and keeps the reusable core independent of
UI state. When a helper is extracted, any shared data/types it depends on (e.g.
`COMMAND_REGISTRY`, `PROMPT_MAX_BYTES`, `QueueItem`) must move with it, or the
new lib file will import back into `@state` and invert the direction.

**3. Follow the existing `libs/` conventions.**

- No barrel `index.ts` in `libs/` — consumers import the specific file
  (`@libs/commands/registry.ts`), matching every existing `@libs/*` import.
- Colocate each helper's unit tests with the helper under `libs/**/__tests__/`,
  and split any mixed test file so pure-function tests live beside the lib and
  atom tests stay under `state/`.

## Why This Matters

A one-way layering (components → state → libs, with `libs` never importing
`@state`) prevents import cycles by construction and keeps the headless/logic
core reusable without dragging in UI state atoms. After the refactor a
whole-codebase scan (161 files, 372 edges) found **zero cycles** and confirmed
the invariant held.

## When to Apply

- Any time a new pure helper or shared constant is about to be added to
  `tui/src/state/` — put it in `tui/src/libs/` instead.
- When a component imports a "calculation" function from `@state/...` — that's a
  smell; the function belongs in `@libs/...`.
- Before claiming a state/libs refactor is done — verify there are no cycles
  (see the verification gotcha below).

## Verifying: `madge` cannot analyze this codebase (use a custom detector)

`madge --circular` gives a **false pass** here. The TUI uses tsconfig path
aliases (`@libs/*`, `@state/*`, …) **and** explicit `.ts`/`.tsx` extensions in
import specifiers (`allowImportingTsExtensions: true`). madge's default resolver
follows neither:

```text
$ bunx madge --circular --extensions ts,tsx --ts-config tsconfig.json src
Processed 0 files (579ms)
✔ No circular dependency found!        # <- misleading: 0 files were analyzed

$ bunx madge --extensions ts,tsx main.tsx
Processed 1 file (2 warnings)          # <- entry parsed, but imports unresolved
main.tsx
```

"No circular dependency found" over **0 processed files** is not a pass. The
working approach is a small stdlib-only Node script that mirrors the project's
own resolution rules: it hardcodes the tsconfig `paths` alias map (simpler than
parsing `tsconfig.json` for a standalone snippet), resolves aliases + relative
specifiers (trying the bare path, `.ts`, `.tsx`, and `index.*`), builds the
import graph, then runs Tarjan SCC. It also asserts the
`libs`-never-imports-`state` invariant directly:

```js
// detect-cycles.mjs — run: node detect-cycles.mjs tui/src
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';

const SRC = resolve(process.argv[2]);
const ALIASES = { '@backend/':'backend/', '@components/':'components/',
  '@constants/':'constants/', '@contracts/':'contracts/', '@libs/':'libs/',
  '@state/':'state/', '@test/':'test/', '@theme/':'theme/', '@/':'' };

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
});
const tryResolve = (b) => [b, b+'.ts', b+'.tsx', join(b,'index.ts'), join(b,'index.tsx')]
  .find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
const resolveSpec = (spec, from) => {
  const hit = Object.entries(ALIASES).find(([a]) => spec.startsWith(a));
  const base = hit ? join(SRC, hit[1] + spec.slice(hit[0].length))
    : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  return base ? tryResolve(base) : null;         // null == external package
};

const files = walk(SRC);
const graph = new Map(files.map((f) => [f, new Set()]));
const RE = /(?:^|\n)\s*(?:import|export)(?:\s+type)?\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
for (const f of files) {
  const code = readFileSync(f, 'utf8');
  for (let m; (m = RE.exec(code)); ) {
    const t = resolveSpec(m[1], f);
    if (t && graph.has(t) && t !== f) graph.get(f).add(t);
  }
}

// Tarjan SCC — any component with >1 node is a cycle.
let i = 0; const idx = new Map(), low = new Map(), onSt = new Set(), st = [], cycles = [];
const strongConnect = (v) => {
  idx.set(v, i); low.set(v, i++); st.push(v); onSt.add(v);
  for (const w of graph.get(v)) {
    if (!idx.has(w)) { strongConnect(w); low.set(v, Math.min(low.get(v), low.get(w))); }
    else if (onSt.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
  }
  if (low.get(v) === idx.get(v)) {
    const c = []; let w; do { w = st.pop(); onSt.delete(w); c.push(w); } while (w !== v);
    if (c.length > 1) cycles.push(c);
  }
};
for (const v of graph.keys()) if (!idx.has(v)) strongConnect(v);

const violations = [...graph].flatMap(([f, deps]) => [...deps]
  .filter((d) => f.includes(`${sep}libs${sep}`) && d.includes(`${sep}state${sep}`))
  .map((d) => `${relative(SRC, f)} -> ${relative(SRC, d)}`));
console.log(cycles.length ? `CYCLES: ${cycles.length}` : 'No circular dependencies.');
console.log(violations.length ? `libs->state: ${violations.join(', ')}` : 'INVARIANT OK.');
process.exit(cycles.length || violations.length ? 1 : 0);
```

## Examples

Before — a component pulls a calculation function out of state:

```ts
// components/PromptComposer/input/handleSubmit.ts
import { validateComposerSubmit } from '@state/ui/composer/index.ts';
```

After — the helper lives in libs; only atoms come from state:

```ts
import { validateComposerSubmit } from '@libs/composer/promptText.ts';
import { clearComposerAtom, setComposerValidationErrorAtom } from '@state/ui/composer/index.ts';
```

## Related

- `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`
  — sibling TUI-layering pattern: the same "enforce a boundary with a committed
  guardrail test" idea applied to backend *process* lifecycle ownership
  (composition root) rather than to state-vs-libs code layering.
- An earlier same-day session ("Extract Helper Functions to Lib") began this
  exact task from the identical prompt but was abandoned at the state-file
  exploration phase; the current session completed it. (session history)
- A concurrent "entry kind" rename (`BodyEntry.kind`: `info`→`assistant`,
  `prompt`→`user`) landed in the working tree mid-refactor and collided with the
  verbatim-moved `queueToBodyEntries` (the last holdout still emitting
  `'prompt'`), which had to be reconciled to `'user'`. Re-read shared types
  before moving code when other sessions may be editing the same tree.
  (session history)
- `docs/solutions/workflow-issues/recovering-from-concurrent-agent-session-edits.md`
  — the generalized workflow for detecting and recovering from concurrent
  agent-session edits to shared files (the hazard the note above describes).
