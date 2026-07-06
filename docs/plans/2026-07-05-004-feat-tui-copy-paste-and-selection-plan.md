---
title: "feat: TUI copy, paste, and text selection"
type: feat
status: completed
date: 2026-07-05
origin: docs/brainstorms/2026-07-05-tui-copy-paste-and-selection-requirements.md
---

# feat: TUI copy, paste, and text selection

## Summary

Add clipboard ergonomics to the Ink TUI: paste into the composer via Ink's built-in `usePaste` (bracketed paste) plus app-level `Ctrl+V`/`Alt+V` and right-click; copy the last assistant response with `Ctrl+O`; and a `Alt+R` "Copy Mode" toggle that disables SGR mouse tracking so the terminal's own native selection/copy works. Clipboard I/O lives behind an injected seam owned at `tui/src/bootstrap.ts`, mirroring the backend-client pattern. `Ctrl+C` remains the two-step armed exit. Keybindings align to Codex CLI conventions.

---

## Problem Frame

The TUI enables SGR mouse tracking (`ENABLE_SGR_MOUSE_TRACKING` in `tui/src/libs/terminal/mouse.ts`, written from `HomeScreenView`), so the terminal forwards mouse events to the app instead of doing its own click-drag selection — the user cannot select or copy transcript text at all. Paste is also broken: bracketed paste is not enabled anywhere in `tui/src`, so a pasted multi-line snippet arrives keystroke-by-keystroke and its embedded newline hits the composer's Enter handler, submitting a half-pasted prompt. There is no clipboard integration and no key that copies model output. See origin for full framing.

---

## Requirements

**Paste into the composer**
- R1. Bracketed paste is enabled while the TUI owns the screen so pasted text arrives as one atomic chunk, distinct from typed input.
- R2. Pasted content is inserted at the caret verbatim including newlines; no newline in a paste is treated as submit.
- R3. Right-click (SGR button 2) pastes the system clipboard into the composer.
- R4. `Ctrl+V` and `Alt+V` paste the system clipboard via an app-level read, with no double-paste on terminals that already paste on `Ctrl+V`.
- R5. Clipboard reads happen in the TUI layer and fail gracefully (nothing inserted, brief status hint, no crash).

**Copy Mode (delegated selection)**
- R6. A toggle (`Alt+R`) disables SGR mouse tracking so the terminal's native selection/highlight/copy work across the whole screen.
- R7. While Copy Mode is active the status bar shows a hint; PageUp/PageDown/End still scroll the body.
- R8. Copy Mode exits on any non-scroll key, re-enabling mouse tracking.
- R9. Copy Mode operates on the visible viewport only; scrolled-off content is reached by scrolling before selecting.

**Copy the last response**
- R10. `Ctrl+O` copies the most recent assistant response (the `Assistant`-kind transcript entry) to the clipboard without entering Copy Mode.
- R11. Clipboard writes happen in the TUI layer and fail gracefully with a status hint.

**Key ownership**
- R12. `Ctrl+C` remains the two-step armed exit; `Ctrl+Shift+C`/`Ctrl+Shift+V` are intentionally not bound.

**Origin acceptance examples:** AE1 (paste no submit → U3), AE2 (right-click insert → U4), AE3 (no double paste → U3), AE4 (toggle disables tracking → U6), AE5 (exit re-enables tracking → U6), AE6 (Ctrl+O copies → U5), AE7 (clipboard unavailable → graceful → U1/U3/U4/U5), AE8 (Ctrl+C unchanged → U6).

---

## Scope Boundaries

- No custom in-app selection rendering/highlight — selection is delegated to the terminal via Copy Mode.
- No `Ctrl+Shift+C`/`Ctrl+Shift+V` bindings (swallowed by terminals; byte-identical to armed `Ctrl+C`).
- No motion mouse tracking (`?1002h`) or drag-range tracking.
- No image paste, no huge-paste `[Pasted N lines]` collapse, no paste-burst detection, no OSC 52 remote clipboard, no Kitty keyboard protocol, no drag-and-drop path→`@path`.

### Deferred to Follow-Up Work

- Right-click repositioning the caret to the click position before pasting (v1 pastes at the current caret).
- Retaining the raw (un-sanitized) model response so `Ctrl+O` copies raw text (v1 copies the sanitized display text).

---

## Context & Research

### Relevant Code and Patterns

- **Composer input dispatcher** — `tui/src/components/PromptComposer/usePromptComposerInput.ts`: single `useInput`, ordered `COMPOSER_KEY_HANDLERS`, first handler returning `true` wins. Adding a key = one handler file + one array entry. Handler contract `ComposerKeyHandler` in `tui/src/components/PromptComposer/input/types.ts`. Handlers are **synchronous** — an async clipboard read must consume the key then fire-and-forget.
- **Global keys / armed exit** — `tui/src/useGlobalKeys.ts` (owns `Ctrl+C`), `ArmedAction` in `tui/src/constants/ui.ts`, `armedActionAtom` in `tui/src/state/ui/keyArm.ts`. Modifier detection precedent: `key.ctrl && input === 'c'` (Ctrl+C), `key.meta` for Alt (`handleNewline.ts`).
- **Mouse** — `tui/src/libs/terminal/mouse.ts`: `ENABLE_SGR_MOUSE_TRACKING`/`DISABLE_SGR_MOUSE_TRACKING`, SGR parser, `LEFT_BUTTON_CODE = 0`, wheel offset 64. Right-click = button code 2 (today `parseMouseClickEvent('\u001B[<2;1;1M')` returns `null`; asserted in `tui/src/libs/terminal/__tests__/mouse.test.ts`). Tracking is enabled/disabled by the `useEffect` in `tui/src/components/HomeScreen/HomeScreenView.tsx`; its `useInput` parses wheel/click.
- **Terminal lib pattern** — `tui/src/libs/terminal/{alternateScreen,windowTitle,terminalBackground}.ts`: named escape constants + pure builders + TTY-guarded writers (`if (!stream.isTTY) return`) + colocated tests. Lifecycle wired in `tui/src/bootstrap.ts`.
- **Status bar** — `tui/src/components/StatusBar.tsx` (`leftHints` precedence: armed hint wins), `tui/src/state/ui/statusHint.ts` (`statusHintAtom` currently only mirrors `startupStatusHintAtom`; a new transient source is needed), `useLoadingFrame` shows the `setInterval`+cleanup timer pattern to mirror for an auto-clearing toast.
- **Transcript** — `tui/src/state/promptQueue/store.ts` (`promptQueueAtom`), `tui/src/libs/promptQueue/promptQueue.ts` (`QueueItem.result: { kind, text }`). A settled completed turn retains `result.text` with `kind === BodyEntryKind.Assistant` — this is the last-response source. Text is the **sanitized display form** (`sanitizeDisplayText`, ~128 KB cap); raw text is not retained after settle.
- **Injected seam + isolation guardrail** — backend client seam (`backendClientAtom`, injected in `bootstrap.ts`); `tui/src/__tests__/backendIsolation.test.ts` forbids `components/**` and `state/**` from importing `node:child_process` and process modules. Clipboard follows the same shape.
- **Shell-out pattern** — `tui/src/libs/git/lineDelta.ts`: `execFileSync` with a named timeout (`GIT_LINE_DELTA_TIMEOUT_MS`) + `try/catch → undefined`, named constants, pure parse helper. The clipboard client mirrors this shape (async `execFile`). Note: the shell-out helper lives under `libs/git/`; `tui/src/state/ui/gitStatus.ts` is backend-routed and is NOT the pattern to follow for clipboard.

### Institutional Learnings

- `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md` — reach external/process-backed resources through a narrow injected seam owned at the composition root, not via `useEffect`/atoms; keep a TTY/no-op fallback. Extend the isolation guardrail when adding a new external dependency.
- `docs/solutions/architecture-patterns/state-libs-layering-and-cycle-verification-in-the-ink-tui.md` — `state/` is atoms-only; pure helpers live in `libs/<domain>/`; `libs` must never import `@state`; import specific files (no `libs` barrel).
- `docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md` + `tui/AGENTS.md` — cursor placement is manually resolved and drifts with layout math; render full-width status content as `<Box width={columns} backgroundColor>`; the alt buffer has no scrollback (bounds Copy Mode to the viewport). Do not touch `FULLSCREEN_GUARD_ROWS` without moving `INK_CURSOR_ROW_ORIGIN_OFFSET` in lockstep.
- `docs/solutions/workflow-issues/recovering-from-concurrent-agent-session-edits.md` — the composer/`constants/ui.ts` files this plan edits were hit by a prior concurrent-session collision; re-read fresh immediately before editing and gate on `cargo xtask tui-typecheck` + `tui-test`.

### External References

- Ink 7.1.0 `usePaste(handler, { isActive })` (`tui/node_modules/ink/build/hooks/use-paste.js`): auto-enables `\x1b[?2004h` while active, delivers the full pasted string including newlines on a **separate channel from `useInput`**, so paste is never re-delivered as keystrokes. Supersedes hand-rolled `200~`/`201~` parsing.
- Codex CLI keymap (research 2026-07-05, `openai/codex` `codex-rs/tui/src/keymap.rs`): `copy` = `Ctrl+O`, paste = `Ctrl+V`/`Alt+V`, `toggle_raw_output` (copy-friendly selection) = `Alt+R`, `Ctrl+C` = interrupt/quit — the binding set this plan mirrors.

---

## Key Technical Decisions

- **Ink `usePaste` for bracketed paste** instead of a custom `?2004h` module + `200~`/`201~` parser: Ink 7.1 provides it natively on a separate channel, eliminating the double-handle risk and the manual escape-sequence plumbing.
- **Shell-out clipboard client over the `clipboardy` dependency**: the packaged build Bun-compiles the TUI to a standalone binary, and `clipboardy`'s bundled Linux helper assets are unlikely to be embedded, breaking clipboard in the packaged binary. A small platform-dispatch module using `node:child_process` (mirroring `lineDelta.ts`) has no bundled-asset risk, adds no dependency, and sits behind the seam so it is swappable. macOS `pbcopy`/`pbpaste`; Windows PowerShell `Get-Clipboard`/`Set-Clipboard`; Linux Wayland `wl-copy`/`wl-paste` else X11 `xclip`/`xsel`. Missing tools → graceful failure.
- **Clipboard content is passed to write commands via stdin only — never interpolated into a shell string, a PowerShell `-Command`, or a command-line argument.** `Ctrl+O` copies model output, which the codebase already treats as untrusted (that is why `sanitizeDisplayText` exists), and prompt injection can steer it. Since the sanitized display text still contains PowerShell metacharacters (`;`, `$(...)`, backticks) and argv-visible content leaks into the process table (`wl-copy <text>`), every write keeps a fixed argv (flags only: `pbcopy`; `wl-copy`; `xclip -selection clipboard`; `xsel -ib`; Windows `powershell -NoProfile -Command "$input | Set-Clipboard"`) and writes the payload to the child's stdin. Reads take fixed argv with no dynamic content.
- **`usePaste` `isActive` is keyed on home-screen mount only, independent of the composer's active/`inputLocked`/`copyModeActive` gate.** Ink's `usePaste` toggles `?2004h` off whenever `isActive` goes false and, with no active paste listener, re-delivers a paste as keystrokes; tying it to the composer-active gate would disable bracketed paste during Copy Mode and streaming (violating R1) and let a Copy-Mode paste exit Copy Mode. Keeping it session-scoped makes `?2004h` hold while the TUI owns the screen.
- **Empty clipboard vs unavailable clipboard are distinct outcomes, applied uniformly across all paste paths (`usePaste`, `Ctrl+V`/`Alt+V`, right-click):** an empty-but-available clipboard (`readText()` → `""`) inserts nothing silently; an unavailable clipboard (`readText()` → `null`) shows the paste-failed hint. An empty clipboard is not a failure and must not show the failure hint.
- **Clipboard behind an injected `ClipboardClient` seam** owned at `bootstrap.ts`: keeps `components/`/`state/` free of `node:child_process` (enforced by the extended isolation guardrail) and unit-testable via a fake injected on the store.
- **`Ctrl+O` copies the sanitized display text** of the last assistant response (already retained in `QueueItem.result.text`): no new capture path needed for v1; raw-text retention is deferred.
- **Copy Mode gates composer input inactive** (`isActive = !inputLocked && !copyModeActive`): during Copy Mode only the global handler (exit) and `HomeScreenView` (scroll) process keys, avoiding a double-handle race, and the composer cursor hides automatically.
- **Single mouse-tracking owner keyed on `copyModeActive`**: the existing `HomeScreenView` `useEffect` writes `ENABLE`/`DISABLE` based on `copyModeActive` (cleanup always writes `DISABLE`), so Copy Mode and the mount effect cannot fight over the escape sequence.
- **`Ctrl+C` during Copy Mode exits Copy Mode first** (treated as "any non-scroll key"), matching the press-any-key-to-exit model; a subsequent `Ctrl+C` arms exit as normal.

---

## Open Questions

### Resolved During Planning

- Copy Mode toggle key: `Alt+R` (Codex-aligned; function keys can't be detected via Ink `useInput`, which surfaces them as empty input).
- Exit-on-any-key vs Esc-only: any non-scroll key exits (PageUp/PageDown/End keep scrolling).
- Right-click paste position: at the current caret (reposition-then-paste deferred).
- Clipboard mechanism: shell-out (see Key Technical Decisions), not `clipboardy`.
- Clipboard content-passing: stdin only for writes; fixed argv with no dynamic content (resolves the injection/argv-exposure surface — see Key Technical Decisions).
- `usePaste` `isActive` gating: keyed on home-screen mount, independent of composer-active/`inputLocked`/`copyModeActive` (see Key Technical Decisions).
- Empty vs unavailable clipboard: empty → silent no-op; unavailable (`null`) → paste-failed hint, uniform across all paste paths.

### Deferred to Implementation

- Windows PowerShell Unicode-correct read/write via the stdin path (`$input | Set-Clipboard`, `Get-Clipboard -Raw` trailing-newline trimming) and spawn-latency acceptability. (Command shape is resolved as stdin-only; the remaining unknown is Unicode/newline fidelity.)
- Whether any target terminal sends both a `Ctrl+V` keypress and a bracketed paste (would double-paste); verify on Windows Terminal and WezTerm and, if found, suppress the app-level `Ctrl+V` read on that terminal (AE3).
- Linux tool-detection order and how absence is surfaced to the status hint.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

Input → outcome matrix (home screen, composer focused unless noted):

| Input | Normal mode | Copy Mode active |
|---|---|---|
| Terminal-native paste (bracketed) | `usePaste` → sanitize → insert at caret | same (paste stays app-inserted) |
| `Ctrl+V` / `Alt+V` | read clipboard → sanitize → insert at caret | (composer inactive) exits Copy Mode |
| Right-click (SGR btn 2) | read clipboard → insert at caret | mouse released to terminal; native paste/select |
| `Ctrl+O` | copy last assistant response → flash toast | exits Copy Mode |
| `Alt+R` | enter Copy Mode (disable mouse tracking) | exit Copy Mode (re-enable tracking) |
| PageUp/PageDown/End | scroll body | scroll body (stays in Copy Mode) |
| other printable key | edit composer | exits Copy Mode |
| `Ctrl+C` | arm exit → confirm exit | exits Copy Mode (then arms on next press) |

Clipboard seam (TUI layer only):

```text
components / state  ──uses──▶  clipboardClientAtom (ClipboardClient interface)
                                        ▲ injected at bootstrap.ts
                          libs/clipboard/systemClipboard.ts (execFile per-OS)
```

---

## Implementation Units

### U1. Clipboard seam and cross-platform client

**Goal:** Provide a `ClipboardClient` interface, a shell-out implementation, an injected atom seam, and an extended isolation guardrail — the foundation for all clipboard read/write.

**Requirements:** R5, R11

**Dependencies:** None

**Files:**
- Create: `tui/src/contracts/clipboard/index.ts` (`ClipboardClient` type)
- Create: `tui/src/libs/clipboard/systemClipboard.ts` (per-OS `execFile` read/write impl + named command constants + pure command-builder helper)
- Create: `tui/src/state/global/clipboard.ts` (`clipboardClientAtom` seam)
- Modify: `tui/src/state/global/index.ts` (re-export), `tui/src/bootstrap.ts` (inject the system client into the store)
- Modify: `tui/src/__tests__/backendIsolation.test.ts` (add `systemClipboard` to forbidden references; broaden comment to "backend/clipboard process mechanics")
- Test: `tui/src/libs/clipboard/__tests__/systemClipboard.test.ts`

**Approach:**
- `ClipboardClient = { readText(): Promise<string | null>; writeText(text: string): Promise<boolean> }` — `null` read / `false` write signal graceful failure.
- Impl selects the command by platform (macOS `pbpaste`/`pbcopy`; Windows PowerShell `Get-Clipboard`/`Set-Clipboard`; Linux Wayland `wl-paste`/`wl-copy` else X11 `xclip`/`xsel`), async `execFile` with a timeout, `try/catch` → `null`/`false`. Mirror `lineDelta.ts`.
- **Writes pass content via the child's stdin only** — fixed argv (flags only), never argv/`-Command` interpolation. Windows write uses `powershell -NoProfile -Command "$input | Set-Clipboard"` with the text on stdin; reads take fixed argv with no dynamic content. This is the security boundary for `Ctrl+O` copying untrusted model output (see Key Technical Decisions).
- `readText()` distinguishes empty (`""`, available but no content) from unavailable (`null`); callers treat `""` as a silent no-op and `null` as a failure.
- Keep a pure `resolveClipboardCommand(platform, env)`-style helper so command selection is unit-testable without spawning.
- Inject at `bootstrap.ts` alongside the other store seams; the impl is the only module importing `node:child_process`, so `components/`/`state/` reach it only through the atom.

**Patterns to follow:** `tui/src/libs/git/lineDelta.ts` (`execFileSync` shell-out with timeout + `try/catch`), `tui/src/state/global/backend.ts` + `backendClientAtom` injection in `bootstrap.ts` (seam), `tui/src/__tests__/backendIsolation.test.ts` (guardrail).

**Test scenarios:**
- Happy path: `resolveClipboardCommand` returns `pbcopy`/`pbpaste` on `darwin`, PowerShell on `win32`, `wl-copy`/`wl-paste` when `WAYLAND_DISPLAY` is set, `xclip`/`xsel` on X11.
- Edge case: unknown platform / no Linux tool available → read resolves `null`, write resolves `false` (no throw).
- Error path: spawned command exits non-zero or times out → `readText` resolves `null`, `writeText` resolves `false`.
- Security: the command-builder places clipboard content only on stdin — a written payload (including strings with `;`, `$(...)`, backticks, or newlines) never appears in the resolved argv or a `-Command` string. Assert the argv contains only fixed flags.
- Edge case: an available-but-empty clipboard resolves `readText()` to `""` (distinct from `null`).
- Integration: `backendIsolation.test.ts` fails if a `components/**` or `state/**` file imports `systemClipboard` or `node:child_process`.

**Verification:** The guardrail test passes with the clipboard impl in `libs/`; command-builder tests pass across platforms; `bootstrap.ts` wires a live client without importing spawn code into state/components.

---

### U2. Transient status-hint infrastructure

**Goal:** Add an auto-clearing transient status hint (for "copied" / failure toasts) that the copy and paste units reuse, without disturbing the startup loading hint or the armed-exit hint.

**Requirements:** R5, R11 (surfacing side); supports R10 (copied/failure toasts)

**Dependencies:** None

**Files:**
- Modify: `tui/src/state/ui/statusHint.ts` (add `transientStatusHintAtom`; make `statusHintAtom` derive `startup ?? transient`)
- Modify: `tui/src/components/StatusBar.tsx` (drive an auto-clear timer keyed on the transient hint identity, mirroring `useLoadingFrame`)
- Modify: `tui/src/constants/ui.ts` (`TRANSIENT_STATUS_HINT_MS` and hint-text constants)
- Test: `tui/src/state/ui/__tests__/statusHint.test.ts`, `tui/src/__tests__/components/StatusBar.test.tsx`

**Approach:**
- `transientStatusHintAtom: atom<StatusHint | undefined>`; a small write helper sets it. `statusHintAtom` prefers the startup hint (loading) and otherwise returns the transient hint, so the existing `StatusBar` precedence continues to work.
- Auto-clear via a `StatusBar` effect keyed on the hint value (React-idiomatic timer, not a `setTimeout` inside the atom) so a newer toast resets the timer.

**Patterns to follow:** `useLoadingFrame` in `tui/src/components/StatusBar.tsx`; `armedActionAtom` hint wiring.

**Test scenarios:**
- Happy path: setting a transient hint renders it in the status bar; after `TRANSIENT_STATUS_HINT_MS` it clears back to `DEFAULT_STATUS_HINTS`.
- Edge case: a loading (startup) hint takes precedence over a transient hint.
- Edge case: a second transient hint set before the first clears replaces it and restarts the timer.

**Verification:** A transient hint appears then disappears on its own; the startup loading hint and armed-exit hint are unchanged.

---

### U3. Composer paste — `usePaste` (bracketed) + `Ctrl+V`/`Alt+V`

**Goal:** Insert pasted text at the caret verbatim (newlines included, never submitting) via Ink `usePaste`, and read the system clipboard on `Ctrl+V`/`Alt+V`.

**Requirements:** R1, R2, R4, R5

**Dependencies:** U1 (clipboard read), U2 (failure hint)

**Files:**
- Create: `tui/src/libs/composer/pastedText.ts` (`sanitizePastedText`: normalize `\r\n`/`\r` → `\n`, strip C0/C1 control chars and `\u007f` except `\n`/`\t` — parity with `sanitizeDisplayText`)
- Create: `tui/src/components/PromptComposer/usePasteInput.ts` (mounts `usePaste`, sanitizes + inserts; `isActive` keyed on home-screen mount only — NOT the composer's `resolvedIsActive`/`!copyModeActive` — so `?2004h` stays enabled session-wide per R1)
- Create: `tui/src/components/PromptComposer/input/handlePaste.ts` (`Ctrl+V`/`Alt+V` handler: consume key, fire-and-forget clipboard read → insert or flash failure)
- Modify: `tui/src/components/PromptComposer/index.tsx` (mount `usePasteInput`), `tui/src/components/PromptComposer/usePromptComposerInput.ts` (add `handlePaste` to `COMPOSER_KEY_HANDLERS` **ordered before `handleTextEdit`**), `tui/src/components/PromptComposer/input/handleTextEdit.ts` (ignore `key.ctrl`/`key.meta`-modified input so `Ctrl+V`/`Alt+V`/`Alt+R` never insert a stray letter), `tui/src/constants/ui.ts` (paste key constant)
- Test: `tui/src/libs/composer/__tests__/pastedText.test.ts`, `tui/src/components/PromptComposer/__tests__/handlePaste.test.ts`, and a paste-insertion test under `tui/src/__tests__/components/PromptComposer.test.tsx`

**Approach:**
- `usePaste((text) => insert(sanitizePastedText(text)))`; both the paste hook and `handlePaste` route through the existing `insertComposerTextAtom` (handles caret + `overLimitMessage`). An empty result (`""`) inserts nothing silently; `handlePaste` shows the paste-failed hint only when `readText()` is `null` (unavailable).
- `usePasteInput`'s `isActive` is keyed on home-screen mount only (not `resolvedIsActive`), so bracketed paste stays enabled during Copy Mode and streaming per R1, and a paste in Copy Mode is app-inserted rather than re-delivered as keystrokes.
- `handlePaste` reads `clipboardClientAtom` from the store, calls `readText()`, and on resolve inserts sanitized text or flashes the paste-failed transient hint; it returns `true` synchronously so the key is consumed. It sits **before `handleTextEdit`** in `COMPOSER_KEY_HANDLERS`, and `handleTextEdit` ignores `key.ctrl`/`key.meta`-modified input, so `Ctrl+V`/`Alt+V` (and `Alt+R`) never insert a stray `v`/`r`.
- In-flight guard: while an app-level clipboard read is pending, a repeat `Ctrl+V`/`Alt+V` is ignored, so a slow spawn (e.g. cold Windows PowerShell) plus an impatient second press cannot double-insert. Optionally surface a transient `Pasting…` hint until the read resolves.
- No-double-paste: with `usePaste` active, a terminal that pastes on `Ctrl+V` delivers a paste event (not a `v` keypress), so `handlePaste` never fires for it; terminals that send raw `Ctrl+V` are handled by `handlePaste`.

**Patterns to follow:** `tui/src/components/PromptComposer/input/handleTextEdit.ts` (insert via atom), `printableInput` in `tui/src/libs/composer/promptText.ts` (control-char handling — but preserve newlines here).

**Test scenarios:**
- Covers AE1. Happy path: a multi-line string delivered via `usePaste` inserts all lines at the caret and does not submit.
- Covers AE3. Edge case: a raw `Ctrl+V` keypress triggers exactly one clipboard read + insert; a bracketed-paste delivery does not also trigger `handlePaste`.
- Edge case: `Ctrl+V`, `Alt+V`, and `Alt+R` do not insert a literal `v`/`r` into the composer (modified input is ignored by `handleTextEdit`; `handlePaste` is ordered before it).
- Edge case: a second `Ctrl+V` while a prior read is still in flight does not produce a second insert (in-flight guard).
- Happy path: `Alt+V` (`key.meta && input==='v'`) reads the clipboard and inserts.
- Edge case: `sanitizePastedText` normalizes `\r\n`→`\n`, keeps `\n`/`\t`, strips ESC/CSI and other C0/C1 control bytes (and `\u007f`); an empty clipboard (`""`) inserts nothing with no hint.
- Covers AE7. Error path: clipboard read returns `null` (unavailable) → nothing inserted, paste-failed transient hint shown, no crash.
- Edge case: over-limit paste sets the composer validation error (via `insertComposerTextAtom`).

**Verification:** Pasting multi-line text lands a multi-line prompt with no submit; `Ctrl+V`/`Alt+V` insert clipboard text; failures show a hint. Verify the composer cursor still lands on the active text row after a multi-line paste (`tui/AGENTS.md` cursor rule).

---

### U4. Right-click paste

**Goal:** Paste the system clipboard at the caret on a right-click (SGR button 2).

**Requirements:** R3, R5

**Dependencies:** U1 (clipboard read), U3 (shared sanitize + insert)

**Files:**
- Modify: `tui/src/libs/terminal/mouse.ts` (add `RIGHT_BUTTON_CODE = 2` and `parseMouseRightClickEvent`)
- Modify: `tui/src/components/HomeScreen/HomeScreenView.tsx` (add a right-click branch to the mouse `useInput`: read clipboard → sanitize → insert at caret)
- Test: `tui/src/libs/terminal/__tests__/mouse.test.ts` (extend), `tui/src/__tests__/components/HomeScreen.test.tsx`

**Approach:**
- Add a pure `parseMouseRightClickEvent` mirroring `parseMouseClickEvent` but matching button code 2, event `M`. Update the existing test that currently asserts button-2 → `null`.
- In `HomeScreenView`, after the left-click branch, detect a right-click, read `clipboardClientAtom` via the already-present `useStore`, and insert sanitized clipboard text at the current caret (no reposition in v1).

**Patterns to follow:** existing `parseMouseClickEvent` + the click branch in `HomeScreenView`; reuse `sanitizePastedText` and `insertComposerTextAtom` from U3.

**Test scenarios:**
- Happy path: `parseMouseRightClickEvent('\u001B[<2;5;3M')` returns `{ row: 3, column: 5 }`; wheel/left/release events return `null`.
- Covers AE2. Integration: a right-click SGR event with clipboard text inserts that text into the composer at the caret.
- Covers AE7. Error path: right-click with an unavailable clipboard (`readText()` → `null`) inserts nothing and shows the paste-failed hint; an empty-but-available clipboard (`""`) inserts nothing with no hint (consistent with U3).
- Edge case: the prior assertion that button 2 yields `null` from `parseMouseClickEvent` is updated to reflect the new dedicated parser.

**Verification:** Right-clicking pastes clipboard text into the composer; wheel and left-click behavior is unchanged.

---

### U5. Copy last response (`Ctrl+O`)

**Goal:** Copy the most recent assistant response to the system clipboard with `Ctrl+O`, with a transient confirmation/failure hint.

**Requirements:** R10, R11

**Dependencies:** U1 (clipboard write), U2 (transient hint)

**Files:**
- Create: `tui/src/libs/promptQueue/lastAssistantResponse.ts` (pure selector over the queue → last settled `Assistant` result text)
- Create: `tui/src/state/promptQueue/lastResponse.ts` (`lastAssistantResponseAtom` deriving from `promptQueueAtom`)
- Create: `tui/src/components/PromptComposer/input/handleCopyLastResponse.ts` (`Ctrl+O` handler: read last response → write clipboard → flash toast)
- Modify: `tui/src/components/PromptComposer/usePromptComposerInput.ts` (add handler to chain), `tui/src/constants/ui.ts` (copy key + hint constants)
- Test: `tui/src/libs/promptQueue/__tests__/lastAssistantResponse.test.ts`, `tui/src/components/PromptComposer/__tests__/handleCopyLastResponse.test.ts`

**Approach:**
- Selector returns the `text` of the last `QueueItem` whose `state === 'settled'` and `result.kind === Assistant`, else `undefined`.
- Handler: if a response exists, `clipboardClientAtom.writeText(text)` then flash "copied" / "copy failed"; if none, flash "nothing to copy". Return `true` synchronously (async write fire-and-forget), mirroring `handlePaste`.

**Patterns to follow:** `tui/src/state/promptQueue/__tests__/atoms.test.ts` (transcript-state assertions); the armed-hint/status pattern for confirmation text.

**Test scenarios:**
- Happy path: with a settled assistant turn, the selector returns its text; `Ctrl+O` writes it and flashes the copied hint.
- Covers AE6. Integration: `Ctrl+O` calls the injected client's `writeText` with the last response text.
- Edge case: only user/error/pending items present → selector returns `undefined`; `Ctrl+O` flashes "nothing to copy" and does not call `writeText`.
- Edge case: the newest assistant result (not an earlier one) is chosen when multiple turns are settled.
- Covers AE7. Error path: `writeText` resolves `false` → copy-failed hint, no crash.

**Verification:** `Ctrl+O` copies the last assistant reply; empty/failed cases show the right hint and never throw.

---

### U6. Copy Mode toggle (`Alt+R`) + mouse-tracking ownership + banner

**Goal:** Toggle Copy Mode with `Alt+R`, releasing the mouse to the terminal for native selection; show a status banner; keep scrolling; exit on any non-scroll key; preserve `Ctrl+C`.

**Requirements:** R6, R7, R8, R9, R12

**Dependencies:** None (coordinates with U2's `StatusBar` edit; the Copy Mode banner is a separate persistent branch keyed on `copyModeActive`, not U2's auto-clearing transient atom)

**Files:**
- Create: `tui/src/state/ui/copyMode.ts` (`copyModeActiveAtom`)
- Modify: `tui/src/state/ui/index.ts` (re-export)
- Modify: `tui/src/useGlobalKeys.ts` (`Alt+R` toggle; while active, any non-scroll key exits; keep `Ctrl+C`)
- Modify: `tui/src/components/HomeScreen/HomeScreenView.tsx` (mouse-tracking `useEffect` writes `ENABLE`/`DISABLE` based on `copyModeActive`; cleanup always `DISABLE`)
- Modify: `tui/src/components/PromptComposer/index.tsx` (gate `resolvedIsActive` on `!copyModeActive`)
- Modify: `tui/src/components/StatusBar.tsx` (show `COPY_MODE_HINT` when active, taking precedence over transient toasts), `tui/src/components/HelpScreen/helpContent.ts` (document the new keys: `Alt+R` Copy Mode, `Ctrl+O` copy last response, `Ctrl+V`/`Alt+V`/right-click paste), `tui/src/constants/ui.ts` (`COPY_MODE_HINT`, copy-mode key constant)
- Test: `tui/src/__tests__/components/HomeScreen.test.tsx`, `tui/src/__tests__/App.test.tsx` (or a focused global-keys test), `tui/src/__tests__/components/StatusBar.test.tsx`

**Approach:**
- `Alt+R` = `key.meta && input === 'r'` toggles `copyModeActiveAtom`. While active, `useGlobalKeys` exits Copy Mode on any key except PageUp/PageDown/End (scroll passes through to `HomeScreenView`). `Ctrl+C` while active exits Copy Mode first.
- Single mouse-tracking owner: the `HomeScreenView` effect keyed on `[stdout, copyModeActive]` writes `DISABLE` when active / `ENABLE` when inactive; cleanup always `DISABLE` so the terminal is restored on unmount.
- Composer `isActive = !inputLocked && !copyModeActive` so only the global handler and scroll handler act during Copy Mode; the composer cursor hides automatically. `Alt+R` is also consumed on the composer side because `handleTextEdit` ignores `key.meta`-modified input (U3), so entering Copy Mode never leaves a stray `r`.
- Banner is a persistent hint keyed on `copyModeActive`, rendered as a separate `StatusBar` branch that takes precedence over transient toasts while active (so a lingering "Copied" toast cannot hide it); it does not add a row, so layout math is unchanged. `COPY_MODE_HINT` states the copy gesture is the terminal's own (drag to select, then your terminal's copy), names the scroll keys (PageUp/PageDown/End), and says "press any key to exit" so the consumed exit-keystroke is not a surprise.

**Patterns to follow:** `tui/src/useGlobalKeys.ts` (global two-step pattern), the existing mouse-tracking `useEffect` and `isActive` gating in `PromptComposer`.

**Test scenarios:**
- Covers AE4. Happy path: `Alt+R` sets `copyModeActiveAtom` true and writes `DISABLE_SGR_MOUSE_TRACKING`; the status bar shows the Copy Mode banner.
- Covers AE5. Happy path: a subsequent key (or `Alt+R`) sets it false and writes `ENABLE_SGR_MOUSE_TRACKING`.
- Edge case: PageUp/PageDown/End while active scroll the body and do NOT exit Copy Mode.
- Edge case: a printable key while active exits Copy Mode and is not inserted into the composer (composer inactive).
- Edge case: entering Copy Mode with `Alt+R` does not insert a stray `r` into the composer.
- Discoverability: the help screen lists `Alt+R` (Copy Mode), `Ctrl+O` (copy last response), and `Ctrl+V`/`Alt+V`/right-click (paste).
- Covers AE8. Happy path: with Copy Mode off, `Ctrl+C` arms then confirms exit unchanged; with Copy Mode on, `Ctrl+C` exits Copy Mode first.
- Edge case (non-TTY): the tracking effect writes nothing when `stdout.isTTY` is false.

**Verification:** `Alt+R` toggles native selection on/off (mouse tracking disabled/enabled), the banner appears while active, scrolling still works, any other key exits, and `Ctrl+C` exit behavior is intact. Verify the composer cursor returns to the active text row on exit (`tui/AGENTS.md` cursor rule).

---

## System-Wide Impact

- **Interaction graph:** Three `useInput` sites (`useGlobalKeys`, composer dispatcher, `HomeScreenView`) plus the new `usePaste` channel all receive keys. `handleTextEdit` ignores `key.ctrl`/`key.meta`-modified input and `handlePaste` is ordered ahead of it, so `Ctrl+V`/`Alt+V`/`Alt+R` cannot leak a stray letter even though the composer is active when they fire. Copy Mode gating the composer inactive keeps only the global + scroll handlers live during Copy Mode. `Ctrl+C` stays owned solely by `useGlobalKeys`.
- **Error propagation:** Clipboard failures surface as transient status hints only; they never throw into the render tree (seam returns `null`/`false`).
- **State lifecycle risks:** Mouse tracking must be re-enabled whenever Copy Mode exits and on unmount; the single-owner effect with an always-`DISABLE` cleanup covers exit paths. Bracketed paste (`usePaste`) is keyed on home-screen mount — independent of `inputLocked` and `copyModeActive` — so `?2004h` stays enabled while the TUI owns the screen (per R1) and disables only on unmount.
- **API surface parity:** Only the home screen composes the input handlers; the too-small screen is unaffected. The help screen (`helpContent.ts`) documents the new keybindings so they are discoverable. `Ctrl+C` armed exit remains globally consistent.
- **Integration coverage:** Injected-fake clipboard client on an isolated store proves read/write wiring without spawning processes; the isolation guardrail proves the boundary holds.
- **Unchanged invariants:** `Ctrl+C` two-step armed exit, wheel routing, click-to-caret, body scroll, composer growth/cap, and cursor placement math are unchanged; `FULLSCREEN_GUARD_ROWS`/`INK_CURSOR_ROW_ORIGIN_OFFSET` are not touched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| A terminal sends both a `Ctrl+V` keypress and a bracketed paste → double paste | Verify on Windows Terminal + WezTerm (Open Question); if found, suppress the app-level `Ctrl+V` read on that terminal (AE3). The in-flight read guard (U3) also prevents a slow-spawn re-press from double-inserting. |
| Copy Mode banner or composer-inactive change drifts the prompt cursor | Banner replaces text in the existing status row (no new row); verify cursor lands on the active composer row after entering/exiting Copy Mode. |
| Windows PowerShell clipboard spawn latency / Unicode issues | User-initiated actions tolerate latency; validate `Get-Clipboard -Raw` and trailing-newline handling during implementation. |
| Linux clipboard tool absent (headless/minimal) | Seam returns `null`/`false` → graceful paste-failed / copy-failed hint; no crash. |
| Concurrent agent-session edits to composer/`constants/ui.ts` | Re-read files fresh immediately before editing; gate on `cargo xtask tui-typecheck` + `tui-test`. |

---

## Sources & References

- **Origin document:** `docs/brainstorms/2026-07-05-tui-copy-paste-and-selection-requirements.md`
- Related code: `tui/src/libs/terminal/mouse.ts`, `tui/src/components/PromptComposer/usePromptComposerInput.ts`, `tui/src/useGlobalKeys.ts`, `tui/src/components/HomeScreen/HomeScreenView.tsx`, `tui/src/state/promptQueue/store.ts`, `tui/src/bootstrap.ts`, `tui/src/__tests__/backendIsolation.test.ts`
- External docs: Ink 7.1.0 `usePaste` (`tui/node_modules/ink/build/hooks/use-paste.js`); Codex CLI keymap (`openai/codex` `codex-rs/tui/src/keymap.rs`, research 2026-07-05)
