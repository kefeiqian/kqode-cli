---
date: 2026-07-12
topic: tui-clipboard-image-paste
status: deferred
blocked_on: file-read/VFS read tool (see Dependencies / Assumptions)
research: docs/research/2026-07-12-image-paste-referring-and-history-handling.md
---

# TUI clipboard image paste

> **Status: DEFERRED.** Findings and decisions are captured here for a future plan. Implementation is intentionally postponed until KQode has a file-read tool, because the chosen history behavior degrades an older image to an on-disk path reference that is only useful once the model/agent can re-open that path (see Dependencies / Assumptions). This doc feeds a future `docs/plans/` implementation plan when unblocked.

## Summary

Let a user right-click-paste an image from the OS clipboard into the TUI composer, where it appears as a single atomic placeholder token (e.g. `[📷 kqode-image-<id>.png]`) that deletes as one unit. On submit, the image is sent to the active (vision-capable) provider as an OpenAI-compatible `image_url` content part alongside the text, persisted to the session folder so it survives `/resume`, and carried in conversation history under a KQode-native retention policy tied to the existing compaction boundary.

---

## Problem Frame

KQode users working on UI, screenshots, terminal output, or design references have no way to show the agent an image — the entire input path is text-only. The composer state (`tui/src/state/ui/composer/atoms.ts`) is a plain string, the clipboard seam (`tui/src/contracts/clipboard/index.ts`) exposes only `readText`/`writeText`, the submit payload (`MessageSubmitParams { text }`) carries a string, and the Rust provider message (`ChatMessage { content: String }` in `src/provider/mod.rs`) is serialized as a string to OpenAI-compatible providers. So a screenshot that would take one paste to explain today requires the user to describe it in prose or abandon the workflow. KQode's own specs already anticipate this (`docs/features/r129_multimodal_input_for_screenshots...md`, `docs/features/r030_..._screenshot_url..._context_attach.md`) but place it at milestone M10; this brainstorm pulls the first, narrowest slice forward.

---

## Actors

- A1. User: right-click-pastes an image into the composer, edits/deletes the token, and submits.
- A2. TUI (Ink/TypeScript): detects the right-click, shows the atomic token, and sends the submit payload.
- A3. Rust backend (`kqode`): reads/persists the image, assembles the provider request, applies history retention, and streams the result.
- A4. Provider (OpenAI-compatible, e.g. Kimi vision): receives the multi-part `content` (text + `image_url`).

---

## Key Flows

- F1. Paste an image
  - **Trigger:** A1 right-clicks in the composer while the OS clipboard holds an image.
  - **Actors:** A1, A2, A3
  - **Steps:** detect right-click → determine the clipboard holds an image (not text) → read image bytes → persist to the session folder as `kqode-image-<id>.png` → insert one atomic `[📷 kqode-image-<id>.png]` token at the caret, mapped to the saved image in a side model.
  - **Outcome:** the composer shows a placeholder token; no base64 appears in the composer text.
  - **Covered by:** R1, R2, R3, R4, R7

- F2. Delete a pasted image
  - **Trigger:** A1 presses Backspace/Delete with the caret adjacent to a token.
  - **Actors:** A1, A2
  - **Steps:** recognize the caret is at a token boundary → remove the whole token in one edit → drop its side-model entry (and renumber remaining tokens if numbered).
  - **Outcome:** the token is gone as a unit; surrounding text is untouched.
  - **Covered by:** R5, R6

- F3. Submit a turn with an image
  - **Trigger:** A1 submits a composer containing one or more image tokens.
  - **Actors:** A2, A3, A4
  - **Steps:** send text + image references over the protocol → backend builds a `ChatMessage` whose `content` is a text part plus an `image_url` part (`data:<mime>;base64,...`) → provider serializer emits the multi-part `content` array → stream the reply.
  - **Outcome:** the model answers about the image; the round records its image reference.
  - **Covered by:** R8, R9, R10, R11, R14

- F4. A later turn in the same session
  - **Trigger:** A1 sends a subsequent prompt after the image round.
  - **Actors:** A3, A4
  - **Steps:** `assemble()` rebuilds history → for a round still in the verbatim tail, re-materialize its image from disk into an `image_url` part → once compaction covers that round, replace the image with an on-disk breadcrumb reference instead.
  - **Outcome:** the model keeps the image for the active window, then sees a lightweight reference, bounding payload growth.
  - **Covered by:** R12, R13

---

## Requirements

**Clipboard capture and trigger**
- R1. Right-clicking in the composer pastes an image from the OS clipboard. This extends the existing right-click text-paste path (`tui/src/components/HomeScreen/rightClickPaste.ts`).
- R2. When the clipboard holds an image, the paste is treated as an image; when it holds text, paste behaves exactly as today. (Behavioral-conditional.)
- R3. Image reading is cross-platform (Windows/macOS/Linux) and binary-safe. The current text seam moves UTF-8 over PowerShell stdio (`tui/src/libs/clipboard/systemClipboard.ts`) and cannot carry image bytes, so a distinct binary-capable path is required.

**Composer token and referring**
- R4. A pasted image is represented by a single placeholder token in the composer (working shape `[📷 kqode-image-<id>.png]`). The base64/bytes never appear in the composer text — only the token does.
- R5. The token is atomic: one Backspace/Delete removes the entire token, not a single character. (Behavioral-conditional.)
- R6. The composer keeps a side model mapping each token to its saved image; multiple images get distinct tokens/ids (unless v1 is scoped to a single image — see Outstanding Questions).

**Persistence**
- R7. Each pasted image is written to the session folder with a real filename `kqode-image-<id>.png` and survives `/resume`.
- R8. The session record (append-only JSONL truth + SQLite index) stores the image reference on its round so resume re-attaches the token and history can re-materialize the image.

**Sending and wire format**
- R9. On submit, the image is sent as an OpenAI-compatible multimodal content part — `image_url` with a `data:<mime>;base64,...` URL — alongside the text part. (Confirmed applicable to Kimi/OpenAI-compatible providers in the research report.)
- R10. The Rust `ChatMessage.content` carries structured content (a text part plus optional image parts) rather than a bare `String`, and the provider serializer emits the multi-part `content` array. The mirrored protocol payload (`MessageSubmitParams`, Rust `src/protocol/mod.rs` ↔ TS `tui/src/contracts/backend/messages.ts`) changes in lockstep.
- R11. Images are size-bounded before send (cap and/or resize) to protect payload size; exact strategy is a planning concern.

**Conversation history**
- R12. A round can reference its pasted image(s), and `assemble()` (`src/chat/request.rs`) re-materializes the image into an `image_url` part for rounds inside the retention window.
- R13. Retention policy (recommended, not yet locked): keep re-sending the image while its round is in the verbatim tail; once compaction (`CompactionState.covered_through_seq`) covers that round, degrade the image to an on-disk breadcrumb reference. (Behavioral-conditional.)

**Capability and errors**
- R14. If the active model is not vision-capable, the user gets a clear signal (at paste or at send) instead of a silent failure or a poisoned session. (Behavioral-conditional.)
- R15. Clipboard-read failures and unsupported image formats surface a transient hint, consistent with the existing `PASTE_FAILED_HINT` pattern.

---

## Acceptance Examples

- AE1. **Covers R5.** Given the composer contains `look at [📷 kqode-image-ab12cd.png] please` with the caret immediately after the token, when the user presses Backspace once, then the whole token is removed in one step, leaving `look at  please`.
- AE2. **Covers R2.** Given the OS clipboard holds a PNG, when the user right-clicks in the composer, then an image token is inserted; given the clipboard holds text, when the user right-clicks, then the text is pasted exactly as today.
- AE3. **Covers R12, R13.** Given a session where round 1 pasted an image and rounds 2-3 followed, when the image round is still in the verbatim tail, then `assemble()` re-sends the image as an `image_url` part; once compaction covers round 1, then subsequent turns send a text breadcrumb referencing the on-disk file instead of the base64.
- AE4. **Covers R14.** Given the active model is not vision-capable, when the user submits a turn containing an image token, then KQode surfaces a clear capability message rather than failing silently.

---

## Success Criteria

- A user can right-click-paste a screenshot, see an atomic `[📷 …]` token, submit, and receive a vision-model answer about the image; the image and its token survive `/resume`.
- Payload size does not grow unboundedly across a long conversation that contains an image (retention policy bounds re-sends).
- Once the file-read tool unblocks this work, a downstream planner can implement it without having to invent product behavior, scope, or the history model — every open item below is either a decision the user still owns or a tagged planning question.

---

## Scope Boundaries

- Image input only. Video, audio, and PDF (`docs/features/r130...`, `r131...`) are excluded from this slice, though the structured content-part model should not preclude them later.
- Right-click clipboard paste only. Drag-and-drop and `@path` file attachment are out of scope for this slice.
- No image generation or editing (`docs/features/r132...`).
- No hosted image upload — base64 `data:` URL transport only.
- Not the full R129 attachment abstraction (token-budget accounting, per-fragment trace citations, priority/expiry). This is the first slice toward R129/R030, not the whole thing.

---

## Key Decisions

- Hybrid over "follow Gemini wholesale": atomic placeholder token (Codex/Claude Code model) + OpenAI `image_url` wire format (KimiX/Codex model) + Gemini-style history degradation. Rationale: Gemini's plain-text `@path` token deletes character-by-character and contradicts the atomic-delete requirement; Gemini's `inlineData` wire format is Gemini-native and wrong for KQode's OpenAI-compatible providers; Gemini's history-degradation idea is the right fit because KQode re-sends full history every turn and images can't be compacted.
- Session-folder persistence with a real `kqode-image-<id>.png` filename (user-chosen over in-memory-only and over the full attachment abstraction).
- Right-click is the primary paste trigger (user-stated), reusing the existing right-click paste path.
- Discovered constraint: the whole paste→submit→provider stack is text-only today, so structured content parts must be introduced in the provider/protocol/composer layers before any image can be sent. Captured as a repository memory.
- All reference agents keep the image as a typed content part inside per-turn message history and re-send it on later rounds; their engineering effort goes into bounding (resize/compress) or stopping (degrade/strip) that re-send. KQode's history is plain-string rounds today, so this capability must be built, not merely configured (see research report).

---

## Dependencies / Assumptions

- **BLOCKER (why this is deferred):** implementation waits on a KQode file-read/VFS read tool. The chosen retention policy degrades an older image to a `[saved to <path>]` breadcrumb; that is only useful once the model/agent can re-open the path. Until a read tool exists, a degraded image is effectively lost after its window, which is acceptable for a same-turn "paste and ask" but not for multi-turn discussion — so the feature lands after the read tool.
- Requires a vision-capable active model selected via `/model` (e.g. Kimi vision ids confirmed in the research report). Non-vision models must be handled per R14.
- Assumes OpenAI-compatible providers accept base64 `data:` URLs inside `image_url` content parts (verified for Kimi/OpenAI in the research report).
- Assumes the TUI and the Rust backend run on the same host, so the local OS clipboard is reachable from whichever side performs the read.
- Evidence base and cross-agent mechanics: `docs/research/2026-07-12-image-paste-referring-and-history-handling.md`.

---

## Outstanding Questions

### Resolve Before Planning

- [Affects R3, R9, R10][User decision] Capture location: Rust-side (mirror Codex `arboard`-style — keep image bytes, base64, and resize in the Rust core, aligning with Rust-first and the existing Rust send path) vs TS-side (extend the `contracts/clipboard` seam and cross the boundary with the payload). Leaning Rust-side.
- [Affects R13][User decision] History retention policy: KQode-native (verbatim-tail-then-degrade, recommended) vs pure Gemini (degrade after the paste turn) vs Codex (keep resized, re-send every turn) vs attach-once (never in history).
- [Affects R4, R6][User decision] Exact token format: camera emoji or not; id scheme (numeric `#N` like Codex/Claude vs short hash like `ab12cd` vs sequential filename); final `kqode-image-<id>.png` shape.
- [Affects R6][User decision] v1 supports multiple images per turn (numbered tokens) or a single image only.
- [Affects R1][User decision] Also bind Ctrl+V / Cmd+V to image paste (as most agents do) or keep right-click as the only trigger.

### Deferred to Planning

- [Affects R10][Technical] Exact structured shape of `ChatMessage.content` / `HistoryRound` and the mirrored `MessageSubmitParams` protocol change (Rust `src/protocol/mod.rs` ↔ TS `tui/src/contracts/backend/messages.ts`), kept serde-compatible.
- [Affects R5][Technical] Atomic-token mechanism in the plain-string composer: a parallel range/element model (Codex `TextElement`) vs a sentinel-substring special-cased by the delete handlers in `tui/src/state/ui/composer/atoms.ts`.
- [Affects R11][Needs research] Resize/size-cap strategy and per-provider image limits (dimensions, byte size, count).
- [Affects R14][Technical] Where vision capability is known (provider/model catalog metadata) and whether to gate at paste time or send time.
- [Affects R2, R3][Technical] Terminal-level image-vs-text detection and interaction with bracketed paste.
- [Affects R8][Technical] JSONL/SQLite record shape for a round's image reference and the resume re-attach path.
