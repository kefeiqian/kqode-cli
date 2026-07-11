---
date: 2026-07-11
topic: tui-copy-paste-roundtrip-fidelity
---

# TUI Copy/Paste Round-Trip Fidelity

> Follow-up to `docs/brainstorms/2026-07-05-tui-copy-paste-and-selection-requirements.md`.
> Two fidelity defects were found in that shipped feature while copying a transcript
> out and pasting it back in. **Direction is not yet chosen — this doc is for review.**

## Summary

Make KQode's copy → clipboard → paste round-trip clean and lossless. Two defects:
(1) a terminal-native drag-copy in **Copy Mode** (`Ctrl+R`) sweeps in KQode's own
scrollbar glyphs (`│`/`┃`); (2) pasting or copying **non-ASCII** text (CJK, emoji,
box-drawing) corrupts to `�`/`��` because the Windows clipboard helper mismatches the
character encoding. The recommended fix is to de-chrome Copy Mode and correct the
clipboard encoding — no new selection engine.

---

## Problem Frame

While selecting some transcript text to reuse, a user hit two problems in sequence.

**Defect 1 — Copy Mode selection includes KQode chrome.** `Ctrl+R` toggles KQode's
**Copy Mode** (`COPY_MODE_INPUT_KEY = 'r'` in `tui/src/constants/ui.ts`, handled in
`tui/src/useGlobalKeys.ts`). Copy Mode intentionally disables SGR mouse tracking
(`tui/src/components/HomeScreen/HomeScreenView.tsx`) so the terminal's own
drag-select-and-copy works again — the deliberate "terminal-native selection" design
from the 2026-07-05 brainstorm. But when the transcript is scrollable, `BodyPane`
paints a scrollbar in the right-edge cells (`SCROLLBAR_TRACK = '│'`,
`SCROLLBAR_THUMB = '┃'` in `tui/src/constants/ui.ts`; rendered in
`tui/src/components/BodyPane.tsx`). A native drag-copy grabs whatever glyph sits in
each cell, so the scrollbar column lands in the copied text. The user selected prose
and got prose interleaved with `│`/`┃`.

**Defect 2 — Non-ASCII corrupts on paste/copy.** Pasting that copied text back into
the composer rendered the box glyphs as `��`. The composer is not the culprit:
`sanitizePastedText` (`tui/src/libs/composer/pastedText.ts`) strips only C0/C1 control
bytes and **preserves** box-drawing and other multibyte glyphs. The corruption is
upstream, in clipboard ingestion. The leading root cause is a Windows code-page
mismatch: `tui/src/libs/clipboard/systemClipboard.ts` runs `Get-Clipboard -Raw` (read)
and `$input | Set-Clipboard` (write) through `powershell` and treats the bytes as
`utf8`, but Windows PowerShell emits/consumes the **console code page** (GBK on this
machine), not UTF-8. So any non-ASCII character is mangled — on paste (read) and also
when copying the last response (write). ASCII survives, which is exactly the observed
signature.

```
        COPY                         CLIPBOARD                    PASTE
 transcript cells  ──drag-copy──▶  OS clipboard  ──Get-Clipboard──▶  composer
        │                                                  │
   Defect 1: scrollbar                        Defect 2: powershell bytes are
   glyphs (│ ┃) are real                      console code page, read as utf8
   cells → swept into copy                    → non-ASCII becomes �/��
```

---

## Requirements

**Copy Mode selection fidelity (Defect 1)**
- R1. While Copy Mode is active, KQode does not render the body scrollbar glyph column, so a terminal-native drag-copy of the transcript contains no `│`/`┃` chrome.
- R2. Scrollbar suppression is scoped to Copy Mode only; in normal interaction the scrollbar renders unchanged as a scroll indicator and wheel affordance.
- R3. Copy Mode still delegates the actual selection, highlight, and copy to the terminal — no custom in-app selection rendering is introduced (preserves the 2026-07-05 decision).

**Clipboard encoding correctness (Defect 2)**
- R4. Pasting text containing non-ASCII characters (CJK, emoji, box-drawing, accented) inserts them into the composer with no `�`/`��` replacement characters. This strengthens 2026-07-05 R2 ("inserted verbatim") to explicitly cover encoding.
- R5. Copying the last response (existing `Ctrl`-key copy) writes non-ASCII characters to the system clipboard losslessly.
- R6. The Windows clipboard integration round-trips non-ASCII losslessly — the current path assumes UTF-8 while the PowerShell helper uses the console code page (see Key Decisions / Findings), and that mismatch is corrected in both read and write directions.
- R7. The lossless-encoding guarantee holds across supported platforms (macOS / Linux / Windows) and applies to whichever paste path delivers the text.
- R8. Where encoding cannot be guaranteed for a given clipboard mechanism, behavior still degrades gracefully with no crash, consistent with 2026-07-05 R5/R11.

---

## Acceptance Examples

- AE1. **Covers R1.** Given a scrollable transcript (scrollbar visible), when the user enters Copy Mode and drag-copies a block of transcript lines, the copied text contains no `│` or `┃` characters.
- AE2. **Covers R2.** Given Copy Mode has exited and the transcript is scrollable, the scrollbar renders exactly as before.
- AE3. **Covers R4, R6.** Given the clipboard holds `均值 E[X]=3.5 │`, when the user pastes into the composer, the composer shows those exact characters with no `�`.
- AE4. **Covers R5, R6.** Given the last response contains CJK text, when the user copies it and pastes into another app, the text is intact.
- AE5. **Covers R8.** Given the clipboard helper is unavailable, when the user pastes, KQode shows the existing failure hint and keeps running.

---

## Success Criteria

- A drag-copy from Copy Mode yields exactly the visible text the user selected, with no KQode-drawn chrome (scrollbar) mixed in.
- Pasting or copying non-ASCII text (CJK / emoji / box glyphs) round-trips with zero replacement characters, on Windows in particular.
- A downstream implementer can fix both defects without re-deciding the selection model (terminal-native, unchanged) or re-litigating custom selection.

---

## Scope Boundaries

- Not building app-owned / custom in-app selection rendering (that is Approach B, held pending the Resolve-Before-Planning decision); the 2026-07-05 "terminal-native selection" decision stands by default.
- Not removing trailing-space or soft-wrap-join artifacts that the terminal's own native selection naturally includes; only KQode-drawn chrome (the scrollbar) is removed. True byte-perfect selection is only achievable via Approach B.
- No OSC 52 / remote clipboard; local system clipboard only (unchanged from 2026-07-05).
- No image paste (unchanged from 2026-07-05).

---

## Key Decisions

- **Recommended: Approach A (de-chrome Copy Mode) over Approach B (app-owned selection).** A is a small change aligned with the shipped terminal-native Copy Mode; it directly removes the artifact the user hit. B would reopen the deliberately-settled 2026-07-05 "terminal-native selection over custom highlight" decision and is a much larger build (selection model, highlight rendering, rendered→source mapping, cross-terminal mouse edge cases). Keep B as a future upgrade only if byte-perfect selection becomes a priority.
- **Finding — the `��` is upstream of the composer.** `tui/src/libs/composer/pastedText.ts` preserves box glyphs and strips only control bytes, so it is not the cause. The leading root cause is a Windows code-page mismatch in `tui/src/libs/clipboard/systemClipboard.ts`: it reads `Get-Clipboard -Raw` and writes `$input | Set-Clipboard` via `powershell` as `utf8`, but Windows PowerShell uses the console code page (GBK here), corrupting non-ASCII in both directions.

---

## Dependencies / Assumptions

- Copy Mode already re-renders on toggle via `copyModeActiveAtom` (`tui/src/state/ui/copyMode.ts`; `tui/src/components/HomeScreen/HomeScreenView.tsx`), so scoping scrollbar suppression to Copy Mode is a small extension — verified.
- The scrollbar is the only KQode-drawn glyph in the body's copyable region; the reserved final column is a background gutter, not a glyph (per `tui/AGENTS.md` and `tui/src/components/BodyPane.tsx`). Assumed no other decorative glyph columns exist in the copyable area — confirm in planning.
- The bracketed-paste path (`usePaste` in `tui/src/components/PromptComposer/usePasteInput.ts`) is separate from the app-level clipboard helper; whether it also corrupts large multibyte pastes via stdin chunk-boundary splits is unverified — confirm in planning.

---

## Outstanding Questions

### Resolve Before Planning

- [Affects R1, R3][User decision] Approach A (de-chrome terminal-native Copy Mode — recommended) vs Approach B (build app-owned selection for byte-perfect copy). Approach B reopens the 2026-07-05 "terminal-native selection" decision.

### Deferred to Planning

- [Affects R4, R6][Technical] Exact Windows encoding fix for the clipboard helper — force a UTF-8 console encoding for `Get-Clipboard`/`Set-Clipboard`, or switch mechanism — validated against a GBK/Chinese console.
- [Affects R4, R7][Needs research] Whether the bracketed-paste path (`usePaste` → Node stdin) corrupts large multibyte pastes via chunk-boundary splits, independent of the clipboard helper.
- [Affects R1][Technical] Whether to omit the scrollbar column entirely in Copy Mode or render it as blank/background, and confirm no layout/reflow side effects given the width-reservation rules in `tui/AGENTS.md`.
