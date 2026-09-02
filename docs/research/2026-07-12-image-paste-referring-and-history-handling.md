---
date: 2026-07-12
topic: image-paste-referring-and-history-handling
question: "How do reference coding agents let a user paste/refer to an image, send it in the prompt, and handle it in conversation history — do they put base64 inside the prompt?"
status: complete
---

# Image paste: referring, sending, and history handling across reference agents

## Summary

Across every reference agent that supports image input, the answer to the central question is the same: **base64 is never inlined into the text of the prompt string.** The user-visible composer text holds only a short **placeholder/reference token** — `[Image #N]` (Claude Code, Codex), an `@path` mention (Gemini CLI), or an attachment chip (Copilot CLI, OpenCode). The image bytes travel as a **separate, structured multimodal content part** alongside the text part, and only there is base64 used — as a `data:<mime>;base64,...` URL (Codex, KimiX, OpenCode) or a provider-native `inlineData.data` / `input_image` field (Gemini CLI, KimiX). [\[1\]][ref-1] [\[2\]][ref-2] [\[7\]][ref-7] [\[8\]][ref-8] [\[11\]][ref-11] [\[12\]][ref-12] [\[13\]][ref-13] [\[16\]][ref-16]

**Referring** is modelled two ways. The strong pattern (Codex, Claude Code) keeps a **side map keyed by a numeric placeholder** — the text buffer holds `[Image #N]` as an *atomic element* (one backspace deletes the whole token) while a parallel list maps that placeholder to the image path/bytes. The lighter pattern (Gemini CLI) inserts a plain-text `@path`, which deletes character-by-character. Claude Code makes the split explicit: text pastes are **inlined back into the string** at send time, but **image refs are deliberately left as placeholders and converted to content blocks**. [\[1\]][ref-1] [\[2\]][ref-2] [\[5\]][ref-5] [\[6\]][ref-6]

**History handling** is where they diverge, and every agent treats images as a **context-window liability** because a base64 image cannot be summarised/compacted like text:
- **Copilot CLI** keeps the image in conversation history and re-sends it, but **strips it from history after a vision-unsupported 400** so the session recovers. [\[16\]][ref-16]
- **Gemini CLI** runs a `BlobDegradationProcessor` that, on later context assembly, **writes the base64 blob out to a temp file and replaces the inline data in history with a text placeholder** (`[Multi-Modal Blob … degraded to text to preserve context window]`). [\[8\]][ref-8]
- **kimi-code** compresses every image at ingestion (`compressBase64ForModel`), **persists the pre-compression original** to disk, and emits a visible caption of what was compressed. [\[15\]][ref-15]
- **Claude Code** persists paste content per history entry (numeric-id side map), large text pastes going to a content-addressable disk store; image bytes ride in the entry's `PastedContent`. [\[3\]][ref-3] [\[4\]][ref-4]

All image-capable providers observed here are **OpenAI-compatible** and consume base64 either as an OpenAI `image_url` / Responses `input_image` part or a Gemini `inlineData` part; several also resize/cap image bytes before sending (Codex, OpenCode, kimi-code). [\[7\]][ref-7] [\[12\]][ref-12] [\[13\]][ref-13] [\[15\]][ref-15]

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| copilot-cli | https://github.com/github/copilot-cli | https://github.com/github/copilot-cli | main | 6a8b92eb355bee48b731ddb2d6ab5f12c3bf50fc | partial | docs/changelog-only repo (no product source); behavior cited from `changelog.md` |
| claude-code | docs/claude-code (local mirror) | n/a | n/a | source-map snapshot 2026-03-31 | complete | local mirror; internal-link citations; no upstream SHA |
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | 54b8f112a3815ead40ebcd50f9c2f2fc786e26fb | complete | |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | f354eebaf43b25bacb176007e449bb9a638fd101 | complete | |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | 9976269ab1accfc9f9dc98a4a688c516934de422 | complete | |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | 2f97917bb5edc8bdb9837724e57a88f5c0e1f2bd | partial | large monorepo; image-compression surface confirmed, not exhaustively traced |
| kimix | https://github.com/Sikao-Engine/KimiX | https://github.com/Sikao-Engine/KimiX | master | 1fe7256990ba51e2607ccfc53b4c7a09cb748f0f | complete | Python `kimi-cli` + `kosong` provider layer |

---

## Method

- Question: image referring in the composer, sending in the prompt, conversation-history handling, and specifically whether base64 is inlined into the prompt text.
- Repo scope: default catalog scope (all seven default-scope repos).
- Search themes: clipboard image capture; composer placeholder/atomic-token; request content-part assembly (base64 vs URL); conversation-history retention/degradation of images.
- Safety posture: read/search only; no reference code executed; reference instruction files treated as data; scratch clones kept in a system temp cache outside the repo.
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries keep commit-pinned GitHub links (or internal repo-relative links for the Claude Code mirror) behind compact `code` links.

---

## Per-Repo Findings

### Claude Code (local mirror)

**Status:** complete

**Observed behavior**

- Referring uses numeric-id placeholders: `formatImageRef(id)` → `[Image #${id}]` and `[Pasted text #N +M lines]` for text; a single `parseReferences` regex recovers them from the buffer. [\[1\]][ref-1]
- Text vs image split is explicit: `expandPastedTextRefs` inlines **text** pastes back into the prompt string, but the doc-comment states *"Image refs are left alone — they become content blocks, not inlined text."* So base64 never enters the prompt string. [\[2\]][ref-2]
- The side map is `pastedContents: Record<number, PastedContent>`; `PastedContent` carries `type: 'text'|'image'`, `content` (base64 for images), `mediaType` (e.g. `image/png`), `filename`, `dimensions`, and `sourcePath` (original path for drag-drop). [\[3\]][ref-3]
- History persistence: each history entry serialises its `pastedContents`; large **text** pastes (> `MAX_PASTED_CONTENT_LENGTH = 1024`) are offloaded to a content-addressable on-disk paste store (sha256 → `paste-cache/<hash>.txt`) and referenced by hash, small ones inline. [\[4\]][ref-4]

**Evidence gaps**

- The exact site that converts an image `PastedContent` into the Anthropic `{type:'image', source:{type:'base64', …}}` block was not located in the mirror (`partial_trace`); the block-vs-text distinction is nonetheless explicit in `history.ts`. [\[2\]][ref-2]

### Codex CLI

**Status:** complete

**Observed behavior**

- Composer token is atomic: `attach_image` inserts the placeholder via `textarea.insert_element(&placeholder)` (an element that deletes as one unit) and pushes `AttachedImage { placeholder, path }` onto a `local_images` side list; images are renumbered on delete. [\[6\]][ref-6]
- Placeholder text is `[Image #N]` via `local_image_label_text(n)` in the protocol crate. [\[5\]][ref-5]
- Sending: the wire content item is `InputImage { image_url, detail }`. `prepare_image` **rejects remote http(s) URLs** (they become an "image content omitted" text placeholder), only processes `data:` URLs, **resizes by detail limits**, and re-encodes with `into_data_url()`; a failed image is replaced by an `InputText` placeholder rather than dropped silently. So the transport is a base64 `data:` URL, prepared/resized before send. [\[7\]][ref-7]

### Gemini CLI

**Status:** complete

**Observed behavior**

- Sending uses Gemini-native `inlineData { mimeType, data }` where `data` is base64; a display helper renders such a part as `[Image: <mime>, <KB>]` (byte size derived from base64 length). [\[9\]][ref-9]
- History handling is the standout: `BlobDegradationProcessor` forward-scans context nodes for bloated non-text parts and, for any `inlineData.data`, **writes the decoded bytes to `degraded-blobs/session-<id>/blob_<id>.<ext>` and replaces the node with text** — `[Multi-Modal Blob (<mime>, <MB>MB) degraded to text to preserve context window. Saved to: <path>]` — only when it actually saves tokens. `fileData` URIs degrade to a `[File Reference … Original URI: …]` text node. [\[8\]][ref-8]
- Composer referring (from the web-research pass, cross-checked to this repo's `InputPrompt.tsx`) inserts a plain-text `@<relative/path>` on Ctrl+V after saving the clipboard image, so the token is ordinary text.

**Evidence gaps**

- The `@path` insertion line in `InputPrompt.tsx` was confirmed by a prior web pass but not re-pinned here (`partial_trace`); the request-assembly and degradation behavior are pinned. [\[8\]][ref-8] [\[9\]][ref-9]

### KimiX (kimi-cli + kosong)

**Status:** complete

**Observed behavior**

- Cross-platform clipboard capture: `grab_media_from_clipboard()` uses the macOS AppKit pasteboard for file paths, explicit `xclip -t image/png` / `wl-paste -t image` on Linux (session-type aware), and Pillow `ImageGrab.grabclipboard()` on Windows; it returns loaded PIL images plus non-image file paths (videos/PDFs). [\[10\]][ref-10]
- Base64 is confined to a data URL: `_to_data_url(mime, bytes)` → `f"data:{mime};base64,{b64}"`, wrapped as `ImageURLPart(image_url=ImageURL(url=data_url))` — a normalized content-part type (alongside `TextPart`, `AudioURLPart`). [\[11\]][ref-11]
- Provider serialization: the OpenAI Responses adapter maps `ImageURLPart` to `{"type": "input_image", "image_url": <url>, "detail": "auto"}`, i.e. the base64 data URL rides in the structured image part, not the text part. [\[12\]][ref-12]

### OpenCode

**Status:** complete

**Observed behavior**

- Attachments are read as raw bytes + mime: `LocalAttachment` is `{ type: 'binary', mime, content: Uint8Array }` (SVG as text); accepted types gate to `image/*` and `application/pdf`. [\[14\]][ref-14]
- Images are normalized as base64 with **auto-resize caps** (`maxWidth/maxHeight` default 2000px, `maxBase64Bytes` default 5 MiB) before send; the UI previews via a `dataUrl`. [\[13\]][ref-13]

**Evidence gaps**

- The exact FilePart shape sent to each provider and its history retention were not fully traced (`partial_trace`); representation (base64 + resize) is pinned. [\[13\]][ref-13]

### kimi-code

**Status:** partial

**Observed behavior**

- A dedicated image-compression surface is invoked **at prompt-ingestion sites (CLI paste, server upload, ACP)**: `compressBase64ForModel` / `compressImageForModel` run per image while constructing the content part; `compressImageContentParts` walks whole part lists for MCP tool results. Compression is never silent — `buildImageCompressionCaption` renders a "what was compressed" note, `persistOriginalImage` keeps the pre-compression bytes, and `cropImageForModel` re-reads a region of the original at full fidelity. [\[15\]][ref-15]

**Evidence gaps**

- Large monorepo; the composer placeholder token and per-provider request JSON were not exhaustively traced (`budget_exhausted`). The ingestion/compression/persistence design is confirmed. [\[15\]][ref-15]

### Copilot CLI

**Status:** partial (docs/changelog evidence; no product source in repo)

**Observed behavior**

- Clipboard image paste is a first-class feature triggered by **Ctrl+V and Meta+V on all platforms**, prioritising image-file *contents* over file icons; cross-platform specifics include macOS pasteboard reads, WSL/Windows-clipboard bridging, and Linux `wl-clipboard`/`xclip`. [\[16\]][ref-16]
- Placeholder-token model is implied by a fix noting *"Pasted images no longer leak into the main prompt"* — the image is tracked out-of-band, not as prompt text. [\[16\]][ref-16]
- History handling: images are retained and re-sent in conversation history; on a vision-unsupported **400**, *"the image is stripped from conversation history after the 400 so subsequent prompts succeed."* BYOK file attachments up to > 5 MiB send via the **OpenAI Responses** provider. [\[16\]][ref-16]

**Evidence gaps**

- No source in the repo (16 files: README/install/changelog); all claims are from `changelog.md` release notes, not implementation (`not_applicable` for source-level detail). [\[16\]][ref-16]

---

## Cross-Repo Comparison

| Dimension | Copilot CLI | Claude Code | Codex | Gemini CLI | OpenCode | kimi-code | KimiX | Confidence |
|---|---|---|---|---|---|---|---|---|
| Composer referring token | attachment chip; not in prompt text [\[16\]][ref-16] | `[Image #N]` + side map [\[1\]][ref-1] | `[Image #N]` atomic element + side list [\[5\]][ref-5] [\[6\]][ref-6] | plain-text `@path` | attachment chip / bytes [\[14\]][ref-14] | ingestion-site part (token not traced) [\[15\]][ref-15] | `ImageURLPart` (CLI token not traced) [\[11\]][ref-11] | high |
| Atomic one-backspace delete | implied (no-leak fix) [\[16\]][ref-16] | side-map placeholder [\[1\]][ref-1] | yes — text element [\[6\]][ref-6] | no (plain `@path`) | n/a (chip) | not traced | not traced | partial |
| base64 in prompt **text**? | no [\[16\]][ref-16] | **no** — image ref left as block [\[2\]][ref-2] | no — separate `InputImage` [\[7\]][ref-7] | no — `inlineData` part [\[9\]][ref-9] | no — separate part [\[13\]][ref-13] | no — content part [\[15\]][ref-15] | no — `input_image` part [\[12\]][ref-12] | high |
| Image transport | OpenAI Responses part [\[16\]][ref-16] | Anthropic image block (base64) [\[2\]][ref-2] [\[3\]][ref-3] | `data:` URL, resized [\[7\]][ref-7] | `inlineData` base64 [\[9\]][ref-9] | base64, resized ≤5 MiB/2000px [\[13\]][ref-13] | base64, compressed [\[15\]][ref-15] | `data:;base64` URL [\[11\]][ref-11] | high |
| History retention of image | keep; strip on vision-400 [\[16\]][ref-16] | persist via side map [\[3\]][ref-3] [\[4\]][ref-4] | prepared per-send; resized [\[7\]][ref-7] | **degrade base64 → temp file + text** [\[8\]][ref-8] | not traced | persist original + compress [\[15\]][ref-15] | not traced | partial |
| Size/context defense | ≤5 MiB Responses [\[16\]][ref-16] | large-paste disk store (text) [\[4\]][ref-4] | detail-based resize [\[7\]][ref-7] | blob degradation [\[8\]][ref-8] | 2000px/5 MiB cap [\[13\]][ref-13] | compress + caption [\[15\]][ref-15] | (none traced) | high |

---

## KQode Lessons

### Product behavior

- **Keep the placeholder in the text, keep the bytes out of it.** Every agent shows a short token (`[Image #N]` / chip / `@path`) in the composer and carries the image as a separate part. KQode's requested `[📷 kqode-image-<id>.png]` chip matches the dominant pattern; the base64 must live in a side map, never in `composerStateAtom.text`. Derived from [\[1\]][ref-1] [\[2\]][ref-2] [\[6\]][ref-6] [\[16\]][ref-16].
- **Atomic delete is the norm worth copying.** Codex's text-element model (and Claude Code's placeholder map) give one-backspace deletion of the whole token — exactly the behavior the user asked for. A plain-text `@path` (Gemini) does not, and Copilot shipped a bug where a pasted image "leaked into the main prompt," underscoring the value of a real out-of-band model. Derived from [\[6\]][ref-6] [\[16\]][ref-16].
- **Explain, don't silently mangle.** kimi-code emits a compression caption and Codex substitutes a human-readable "image omitted because…" placeholder on failure. KQode's trace-first ethos should surface when an image is resized, rejected (no vision model), or dropped. Derived from [\[7\]][ref-7] [\[15\]][ref-15] [\[16\]][ref-16].

### Architecture implications

- **Model the image as a normalized content *part*, not a string.** KQode's `ChatMessage { content: String }` (`src/provider/mod.rs`) and the plain-string composer/protocol (`text` in `MessageSubmitParams`) cannot carry an image. The consistent cross-repo shape is a normalized part list (`TextPart | ImageURLPart`, à la KimiX `kosong`) that each provider adapter serializes — KimiX/OpenCode/Codex all converge on an OpenAI `image_url`/`input_image` data URL. KQode should introduce a multimodal content type in `kqode-provider` and thread it through `assemble()` (`src/chat/request.rs`) rather than concatenating into the prompt string. Derived from [\[7\]][ref-7] [\[11\]][ref-11] [\[12\]][ref-12] [\[13\]][ref-13].
- **base64 `data:<mime>;base64,` is the interoperable transport** for OpenAI-compatible providers (incl. Kimi vision), so KQode need not host images; but resize/cap before send (2000px, ~5 MiB) as Codex/OpenCode do. Derived from [\[7\]][ref-7] [\[12\]][ref-12] [\[13\]][ref-13].
- **Images are a context-window hazard; plan history degradation from day one.** Because KQode re-sends full history each turn via `assemble()` and auto-compaction can't shrink an image, adopt Gemini's degrade-to-file-reference or Copilot's strip-on-error so a kept image doesn't blow the budget on every subsequent turn. This is the concrete resolution of the "keep image in history?" question from the brainstorm. Derived from [\[8\]][ref-8] [\[16\]][ref-16].

### Evaluation ideas

- **Deterministic, non-LLM tests first** (per KQode's eval spec): (a) pasted-token round-trips to exactly one image part + placeholder-preserving text; (b) one-backspace deletes the whole token; (c) history assembly degrades/strips an image after its first turn instead of re-inlining base64. Mirrors Codex's placeholder tests and Gemini's degradation processor. Derived from [\[6\]][ref-6] [\[8\]][ref-8].

### Risks and tradeoffs

- **Persistence vs cost.** The brainstorm chose session-folder persistence (real `kqode-image-<id>.png` surviving `/resume`); Claude Code (side map + disk store) and kimi-code (`persistOriginalImage`) validate this, but pair it with a history-degradation step or every resumed turn re-uploads the full base64. Derived from [\[3\]][ref-3] [\[4\]][ref-4] [\[8\]][ref-8] [\[15\]][ref-15].
- **Provider capability gating.** A non-vision model returns a 400; Copilot's fix (strip the image from history after the 400) shows this must be handled at the policy/provider boundary, and KQode's `/model` selection should signal vision capability before send. Derived from [\[16\]][ref-16].
- **Cross-platform clipboard is fiddly.** KimiX and Copilot both carry substantial per-OS clipboard code (AppKit, xclip/wl-paste, WSL bridging, encoding pitfalls). KQode already routes clipboard through the injected `contracts/clipboard` seam (text-only today); image reads add binary-over-stdio concerns that the existing UTF-8 PowerShell text path does not cover. Derived from [\[10\]][ref-10] [\[16\]][ref-16].

---

## Evidence Gaps

- **copilot-cli**: docs/changelog-only repo — no implementation source; behavior is from release notes (`not_applicable` for code-level detail). [\[16\]][ref-16]
- **claude-code**: image `PastedContent` → Anthropic image-block construction site not located in the mirror (`partial_trace`); text/image split is explicit in `history.ts`. [\[2\]][ref-2]
- **gemini-cli**: `@path` insertion line not re-pinned this pass (`partial_trace`); request-assembly and blob degradation are pinned. [\[8\]][ref-8]
- **opencode / kimi-code**: composer token shape and exact per-provider request JSON not exhaustively traced (`budget_exhausted`); representation (base64 + resize/compress + original persistence) confirmed. [\[13\]][ref-13] [\[15\]][ref-15]

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Claude Code (local mirror): `[Image #N]`/`[Pasted text #N]` reference format and parser ([code](../claude-code/history.ts#L52-L76)).
- <a id="ref-2"></a>[2] Claude Code (local mirror): text refs inlined into the prompt, image refs left as content blocks ([code](../claude-code/history.ts#L78-L101)).
- <a id="ref-3"></a>[3] Claude Code (local mirror): `PastedContent` type — base64 in `content`, `mediaType`, `filename`, `sourcePath` ([code](../claude-code/utils/config.ts#L54-L62)).
- <a id="ref-4"></a>[4] Claude Code (local mirror): content-addressable on-disk paste store for large pastes ([code](../claude-code/utils/pasteStore.ts#L33-L71)).
- <a id="ref-5"></a>[5] Codex CLI: `local_image_label_text` → `[Image #N]` ([code](https://github.com/openai/codex/blob/54b8f112a3815ead40ebcd50f9c2f2fc786e26fb/codex-rs/protocol/src/models.rs#L1500-L1502)).
- <a id="ref-6"></a>[6] Codex CLI: `attach_image` inserts an atomic placeholder element + `local_images` side list ([code](https://github.com/openai/codex/blob/54b8f112a3815ead40ebcd50f9c2f2fc786e26fb/codex-rs/tui/src/bottom_pane/chat_composer/attachment_state.rs#L96-L101)).
- <a id="ref-7"></a>[7] Codex CLI: `InputImage { image_url, detail }` prep — rejects remote URLs, resizes, re-encodes data URL, failure→text placeholder ([code](https://github.com/openai/codex/blob/54b8f112a3815ead40ebcd50f9c2f2fc786e26fb/codex-rs/core/src/image_preparation.rs#L78-L135)).
- <a id="ref-8"></a>[8] Gemini CLI: `BlobDegradationProcessor` writes `inlineData` base64 to a temp file and replaces it in history with a text placeholder to preserve the context window ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/core/src/context/processors/blobDegradationProcessor.ts#L23-L108)).
- <a id="ref-9"></a>[9] Gemini CLI: `inlineData` display summary `[Image: <mime>, <KB>]` (byte size from base64 length) ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/core/src/utils/partUtils.ts#L65-L77)).
- <a id="ref-10"></a>[10] KimiX: cross-platform clipboard image capture (AppKit / xclip / wl-paste / Pillow) ([code](https://github.com/Sikao-Engine/KimiX/blob/1fe7256990ba51e2607ccfc53b4c7a09cb748f0f/kimi-cli/src/kimi_cli/utils/clipboard.py#L48-L160)).
- <a id="ref-11"></a>[11] KimiX: `_to_data_url` → `data:<mime>;base64,…` wrapped as `ImageURLPart` ([code](https://github.com/Sikao-Engine/KimiX/blob/1fe7256990ba51e2607ccfc53b4c7a09cb748f0f/kimi-cli/src/kimi_cli/tools/file/read_media.py#L27-L120)).
- <a id="ref-12"></a>[12] KimiX: OpenAI Responses adapter serializes `ImageURLPart` → `{type:'input_image', image_url, detail}` ([code](https://github.com/Sikao-Engine/KimiX/blob/1fe7256990ba51e2607ccfc53b4c7a09cb748f0f/kimi-cli/packages/kosong/src/kosong/contrib/chat_provider/openai_responses.py#L397-L449)).
- <a id="ref-13"></a>[13] OpenCode: base64 image normalize + auto-resize (2000px / 5 MiB caps) ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/core/src/image.ts#L28-L75)).
- <a id="ref-14"></a>[14] OpenCode: `LocalAttachment` reads image/pdf as raw bytes + mime ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/tui/src/component/prompt/local-attachment.ts#L10-L48)).
- <a id="ref-15"></a>[15] kimi-code: per-image `compressBase64ForModel`/`compressImageForModel` at ingestion, `persistOriginalImage`, `buildImageCompressionCaption`, `cropImageForModel` ([code](https://github.com/moonshotai/kimi-code/blob/2f97917bb5edc8bdb9837724e57a88f5c0e1f2bd/packages/agent-core/src/index.ts#L48-L70)).
- <a id="ref-16"></a>[16] Copilot CLI (changelog): clipboard image paste (Ctrl+V/Meta+V), image not leaked into prompt, image stripped from history after vision-400, OpenAI Responses attachments ([code](https://github.com/github/copilot-cli/blob/6a8b92eb355bee48b731ddb2d6ab5f12c3bf50fc/changelog.md#L481)).

[ref-1]: #ref-1
[ref-2]: #ref-2
[ref-3]: #ref-3
[ref-4]: #ref-4
[ref-5]: #ref-5
[ref-6]: #ref-6
[ref-7]: #ref-7
[ref-8]: #ref-8
[ref-9]: #ref-9
[ref-10]: #ref-10
[ref-11]: #ref-11
[ref-12]: #ref-12
[ref-13]: #ref-13
[ref-14]: #ref-14
[ref-15]: #ref-15
[ref-16]: #ref-16
