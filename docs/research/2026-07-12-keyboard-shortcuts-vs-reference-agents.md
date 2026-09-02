---
date: 2026-07-12
topic: keyboard-shortcuts-vs-reference-agents
question: "What are KQode's current keyboard shortcuts, and how do reference coding agents bind shortcut keys for the same functions?"
status: complete
---

# KQode keyboard shortcuts vs. reference coding agents

## Summary

KQode already covers the core interaction verbs with sensible, mostly-conventional bindings: `Enter` submits, `Shift+Enter` / `Ctrl+Enter` / `\`+`Enter` insert a newline, `Ctrl+C ×2` exits, `Esc` cancels an in-flight turn / clears the prompt, `/` opens the command menu, `Ctrl+V` / `Alt+V` paste, `Ctrl+O` copies the last assistant response, and mouse drag / `PageUp`·`PageDown`·`End` / wheel drive selection and scrolling. On the verbs it implements, KQode is well aligned with the reference agents — and on two points it is genuinely **ahead**: native mouse-wheel scrolling (Codex discards mouse events entirely) and rich in-app transcript text selection.

Across the seven referenced agents, five clear patterns recur that KQode has **not** adopted: (1) `Shift+Tab` to cycle an agent **mode** (plan/auto/execute) — 6/7 agents; (2) `Ctrl+G` (or a leader chord) to open the prompt in an **external `$EDITOR`** — 6/7 agents; (3) a **named-command keybinding registry with user overrides** — 5/7 agents (Codex, Gemini, Claude, Kimi Code, OpenCode); (4) a **real `@` file-mention picker** — KQode only advertises `@ mention` in its status hint but has no picker; (5) **Emacs line-editing** (`Ctrl+A/E/W/K/U/Y`) and **history search** (`Ctrl+R`), which KQode lacks (it has arrow-key history recall only).

One correctness finding surfaced while auditing KQode: after the recent right-click-copy change (commit `0c6fdb1`), KQode's own in-app help (`helpContent.ts`) is now **stale** — it still documents "right-click pastes" and "drag copies on release". That is a documentation bug to fix regardless of any borrowing decision. See [KQode Lessons](#kqode-lessons).

> Note on `Ctrl+O`: KQode binds it to *copy the last assistant response*, which **matches Codex exactly**. It is not an outlier as one might assume — but it does collide with the *other* four agents (Claude, Copilot, Gemini, Kimi Code), which all use `Ctrl+O` to *expand/toggle output or transcript*. This is worth a conscious decision.

---

## Run Metadata

| Repo | Requested URL | Resolved location | Branch | SHA / provenance | Status | Notes |
|---|---|---|---|---|---|---|
| copilot-cli | https://github.com/github/copilot-cli | same | main | `6a8b92eb355bee48b731ddb2d6ab5f12c3bf50fc` | complete | **Binary-only repo**; evidence from `changelog.md` (product docs), not source. `partial_trace` at source level. |
| claude-code | docs/claude-code (local mirror) | `docs/claude-code` | n/a | source-map snapshot extracted 2026-03-31 (no embedded git SHA) | complete | Local git-ignored mirror; internal repo-relative citations. TS + Ink. |
| codex | https://github.com/openai/codex | same | main | `9e552e9d15ba52bed7077d5357f3e18e330f8f38` | complete | Rust + ratatui; `codex-rs/tui/src/keymap.rs` registry. |
| gemini-cli | https://github.com/google-gemini/gemini-cli | same | main | `f354eebaf43b25bacb176007e449bb9a638fd101` | complete | TS + Ink; `Command` enum registry. |
| opencode | https://github.com/anomalyco/opencode | same | dev | `34e58090595d44e3e7cc37498f16753a98627456` | complete | TS + custom `@opentui/core` (not Go). Leader-key + user config. |
| kimi-code | https://github.com/moonshotai/kimi-code | same | main | `b1942bd5718c46991ba5021b4ae96dbf2458617c` | complete | TS + custom `pi-tui` framework (not a fork). |
| kimix | https://github.com/Sikao-Engine/KimiX | same | master | `432a702981c3b128e79d6380825b2ab99a2965bd` | complete | Python readline REPL + web GUI; fork/optimization of MoonshotAI kimi-cli. |
| **KQode** (subject) | this repo | `tui/` | — | working tree @ this session | n/a | TS + Ink. Read directly, not as reference data. |

---

## Method

- **Question:** custom (keyboard-shortcut comparison), not the default prompt-lifecycle question.
- **Repo scope:** default scope (all 7 referenced agents from `references/repo-catalog.md`).
- **KQode inventory:** read directly from `tui/src` (our own code; not treated as untrusted reference data). Primary source: the in-app help reference `helpContent.ts`, cross-checked against the actual input handlers.
- **Reference research:** each git repo was shallow-cloned/queried at the pinned SHA by a read-only sub-agent; Claude Code was read from the local mirror. All reference repos were treated as untrusted, read-only data — no code was run, and instruction files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `README`) were treated as data, not instructions.
- **Safety posture:** read/search only; no execution; commit-pinned citations (internal repo-relative links for the Claude Code mirror).
- **Citation format:** numbered references such as [\[1\]][ref-1]; the References section keeps each commit-pinned source URL behind a compact `code` link.

---

## KQode current shortcuts (subject inventory)

KQode's bindings, as wired in `tui/src` and mirrored by the in-app help. [\[1\]][ref-1] [\[2\]][ref-2] [\[3\]][ref-3] [\[4\]][ref-4] [\[5\]][ref-5] [\[6\]][ref-6] [\[7\]][ref-7]

| Function | KQode key(s) | Source |
|---|---|---|
| Submit prompt | `Enter` | `handleSubmit.ts`; help `INPUT` [\[4\]][ref-4] [\[1\]][ref-1] |
| Insert newline | `Shift+Enter`, `Ctrl+Enter`, `Meta+Enter`, `\`+`Enter` | `handleNewline.ts` [\[4\]][ref-4] |
| Exit app | `Ctrl+C ×2` (two-step armed) | `useGlobalKeys.ts` [\[2\]][ref-2] |
| Cancel in-flight turn | `Esc` | `handleEscCancelTurn.ts` [\[4\]][ref-4] |
| Clear prompt / close menu | `Esc` (+ armed clear) | `handleEscArmedClear.ts`, `handleMenuKey.ts` [\[4\]][ref-4] |
| Open command menu | type `/` | help `GLOBAL`; composer trigger [\[1\]][ref-1] |
| File `@`-mention | **advertised only** (`/ commands \| @ mention` hint) — no picker implemented | `constants/ui.ts`; `@` stays literal input [\[6\]][ref-6] |
| Paste clipboard | `Ctrl+V` / `Alt+V` (Windows) | `handlePaste.ts` [\[6\]][ref-6] |
| Copy last assistant response | `Ctrl+O` | `handleCopyLastResponse.ts` [\[5\]][ref-5] |
| Prompt history recall | `↑` / `↓` (empty composer) | `handleHistoryRecall.ts` [\[4\]][ref-4] |
| Composer cursor movement | `←` / `→`; `↑`/`↓` for multi-line | `handleCursorMove.ts` [\[4\]][ref-4] |
| Transcript text selection / copy | mouse **drag** = select (highlight only); **double/triple-click** = word/line; **right-click** = copy selection then clear | `selectionInput.ts`, `copySelection.ts`, `HomeScreenView.tsx` [\[7\]][ref-7] [\[3\]][ref-3] |
| Scroll transcript | `PageUp` / `PageDown`, `End` (latest), mouse wheel | `HomeScreenView.tsx`, `wheelScroll.ts` [\[3\]][ref-3] |
| Command-menu / list nav | `↑`/`↓`, `Tab` (complete), `Enter` (run), `Esc` (close) | `handleMenuKey.ts`; surface hooks [\[4\]][ref-4] |
| Composer `Tab` | consumed no-op (never inserts a tab) | `handleTextEdit.ts` [\[4\]][ref-4] |
| Help viewer | `/help`; inside: `Esc`/`q` close, `↑`/`↓`/`PageUp`/`PageDown` scroll | `HelpScreen/index.tsx` [\[1\]][ref-1] |

**KQode does NOT currently have:** any mode toggle (plan/auto), external-editor launch, vim mode, history search, in-composer undo/kill-ring, clear-screen, a `?` shortcut cheatsheet key, an implemented `@` picker, or user-configurable keybindings. (Verified by absence in `tui/src`.) [\[6\]][ref-6]

> **Documentation bug (not a borrowing decision):** `helpContent.ts` still lists `SELECTION → drag "copies on release"`, `double/triple-click "Select and copy"`, `any key · right-click "Dismiss the highlight"`, and `INPUT → ctrl+v / alt+v / right-click "Paste from clipboard"`. After commit `0c6fdb1`, right-click now **copies** (not pastes) and drag no longer copies on release. The help text should be corrected to match. [\[1\]][ref-1] [\[3\]][ref-3]

---

## Per-Repo Findings

### GitHub Copilot CLI

**Status:** complete (evidence is `changelog.md` / product docs — the repo ships no source).

Copilot CLI's documented bindings closely track the "rich terminal agent" convention. [\[8\]][ref-8] `Enter` submits; `Shift+Enter` inserts a newline (Kitty protocol, else `/terminal-setup`); `Ctrl+C`/`Ctrl+D`(empty)/`/quit` exit; **double-`Esc`** interrupts the turn and dequeues messages; `/` and `Ctrl+P` open the slash picker; typing `@` opens a **file-completion picker**; `Ctrl+V`/`Meta+V` paste images; `/copy`, mouse-drag, and `Ctrl+Insert` copy output; `Ctrl+R` is reverse history search; full emacs editing (`Ctrl+A/E/B/F/W/U/K`, `Alt+D`, `Alt+←/→`); `Shift+Tab` cycles **modes** (interactive ↔ autopilot); `Ctrl+G` opens the **external editor**; `?` opens a **quick-help overlay**. Notable extras KQode lacks: `Ctrl+Q`/`Ctrl+Enter` queue-while-busy, `Ctrl+L` clear screen, `Ctrl+S` stash composer, `Ctrl+T` reasoning toggle, `!` shell prefix, `#` GitHub-reference picker, `&` background-delegate prefix.

**Evidence gap:** all claims are changelog-sourced (documentation), not source (`partial_trace`); line numbers reference `changelog.md`.

### Claude Code (local mirror)

**Status:** complete (mirror @ 2026-03-31 snapshot).

Claude Code drives everything through a **named-command keybinding registry** (`keybindings/defaultBindings.ts`) organized by context (Global, Chat, Autocomplete, Scroll, Select, …), loaded first then overridden by a user `keybindings.json`. [\[9\]][ref-9] `Enter` submits; `Shift+Enter`/`Meta+Enter`/`\`+`Enter` newline; `Ctrl+C` interrupt + `Ctrl+D` exit (both non-rebindable, time-based double-press); **`Esc` cancels the turn, double-`Esc` clears the composer**; `Shift+Tab` (or `Meta+M` on Windows without VT mode) **cycles mode**; `Ctrl+X Ctrl+E` / `Ctrl+G` open the **external editor**; `Ctrl+R` history search; `Ctrl+L` redraw; `Ctrl+T` todos; `Ctrl+O` toggle transcript; `Ctrl+S` stash; `Ctrl+B` background task; `Ctrl+Shift+C`/`Cmd+C` selection copy. [\[9\]][ref-9] [\[10\]][ref-10] Two details are directly relevant to KQode as a Windows-first project: **image paste is `Alt+V` on Windows** (`Ctrl+V` is system paste) — exactly KQode's choice — and **`Shift+Tab` is explicitly unreliable on Windows Terminal without VT mode**, with a `Meta+M` fallback. [\[9\]][ref-9] A vim-input hook and reserved-shortcut validation also exist. [\[11\]][ref-11]

### Codex CLI

**Status:** complete (Rust source).

Codex uses a large, **user-configurable keymap** (`codex-rs/tui/src/keymap.rs`) with a set of hard-reserved bindings and a `/keymap` slash command + `config.toml`. [\[12\]][ref-12] `Enter` submits; `Ctrl+J`/`Ctrl+M`/`Shift+Enter`/`Alt+Enter` newline; `Ctrl+C ×2` / `Ctrl+D`(empty) exit; **`Esc` interrupts the turn**; `/`, `!`, `@`, `$` are hard-reserved inline triggers (`@` opens a fuzzy file-search popup); bracketed paste is automatic, image paste is `Ctrl+V` (`Ctrl+Alt+V` on WSL); **`Ctrl+O` copies the last agent response** (identical to KQode) plus `/copy` and `Alt+R` raw-scrollback; **history is `Ctrl+R`/`Ctrl+S` search — no plain arrow history**; full emacs + kill-ring (`Ctrl+A/E/B/F/K/U/Y/W`); the transcript pager is `Ctrl+T`; **`Shift+Tab` cycles collaboration mode (Plan ↔ Execute)** behind a feature flag; **`Ctrl+G` external editor**; **`?` shortcut overlay**. Two high-value extras: **`Esc`→`Esc` backtrack** (open transcript, pick a prior message, roll back and re-edit) and `Tab`/`Alt+↑` to queue/edit a queued message. [\[12\]][ref-12] [\[13\]][ref-13] Vim mode exists but is opt-in (empty default binding). **Mouse scroll is not supported** (mouse events are discarded).

### Gemini CLI

**Status:** complete (TS source).

Gemini CLI has a first-class keybinding registry: a `Command` enum + `defaultKeyBindingConfig` + user-customization loader, with matcher factories and platform-aware defaults. [\[14\]][ref-14] `Enter` submits (`Tab` queues during generation); newline has **five** alternates (`Ctrl/Cmd/Alt/Shift+Enter`, `Ctrl+J`); `Ctrl+D`(empty)/`Ctrl+C ×2` exit; **`Esc` cancels but preserves the buffer, `Ctrl+C` cancels and clears** (double-`Esc` = clear + `/rewind`); `/` and `@` are literal-prefix pickers; `Ctrl+V`/`Cmd+V`/`Alt+V` paste (image → temp file → `@path`), OSC52 optional; **`F9` toggles a copy-mode** that disables mouse capture so the terminal's native selection works; history is `Ctrl+P`/`Ctrl+N` + `Ctrl+R` reverse search; full emacs editing with platform-aware undo/redo (`Cmd+Z` / `Ctrl+Z` / `Alt+Z`); **`Shift+Tab` cycles approval mode** (Default → Auto-Edit → Plan) and `Ctrl+Y` toggles YOLO; **`Ctrl+G`/`Ctrl+Shift+G` external editor** (`Ctrl+X` deprecated); **`?` shortcuts panel**; `Ctrl+L` clear screen; `Ctrl+S` toggle mouse mode; `Alt+M` toggle markdown; and a full **`/vim` modal editor**. [\[14\]][ref-14] [\[15\]][ref-15]

### OpenCode

**Status:** complete (TS source; custom `@opentui/core`).

OpenCode has the most extensive and fully **user-configurable** keybind system, driven by a `Definitions`/`CommandMap` registry that merges user overrides, plus a **vim/tmux-style leader key** (default `Ctrl+X`) and a **which-key discoverability panel** (`Ctrl+Alt+K`). [\[16\]][ref-16] [\[17\]][ref-17] `return` submits; four newline chords (`shift/ctrl/alt+return`, `ctrl+j`); `Ctrl+C`/`Ctrl+D`/`<leader>q` exit (when composer empty); **triple-`Esc` (within 5 s) aborts the turn**; `Ctrl+P` command palette + `/` inline; `@` opens a fuzzy file/agent/MCP-resource picker (supports `@path#line-range`); `Ctrl+V` paste + bracketed paste + image; `<leader>y` copies the focused message, mouse-select + `Ctrl+c` copies a region (with a **copy-on-select** flag); `↑`/`↓` history at buffer edges; full emacs editing + undo/redo/select-all; scroll via `PageUp/PageDown` + `Ctrl+Alt` chords + wheel; **`Tab`/`Shift+Tab` cycle agents** (no plan/build mode); **`<leader>e` external editor**; `/help` + which-key. The leader map covers sessions (`<leader>n/l/g`), compaction, undo/redo, model/agent/theme pickers, sidebar, and quick session slots `<leader>1..9`. [\[16\]][ref-16]

### Kimi Code CLI

**Status:** complete (TS source; independent custom `pi-tui` framework).

Kimi Code is an independent, sophisticated TUI with its own `pi-tui/src/keybindings.ts` registry (Kitty-protocol keys, kill-ring, differential rendering) and an app-level override layer. [\[18\]][ref-18] [\[19\]][ref-19] `Enter` submits; `Shift+Enter`/`Ctrl+J` newline; `Ctrl+C ×2` (1500 ms) / `Ctrl+D ×2`(empty) exit; **`Ctrl+C` (1st) or `Esc` cancels a streaming turn**, and **double-`Esc` (600 ms) opens an undo selector**; `/` and `@` are inline pickers (`@` is fd-backed file search); **paste is `Ctrl+V` on Unix / `Alt+V` on Windows** (matching KQode) with bracketed-paste + paste-burst heuristics; `↑`/`↓` history when empty; full emacs + kill-ring (`Ctrl+K/U/W`, `Ctrl+Y` yank, `Alt+Y` yank-pop), `Ctrl+]` jump-to-char; **`Shift+Tab` toggles Plan mode** and `!` enters bash mode; **`Ctrl+G` external editor**; `/help` panel (no `?` key). Standout extra: **`Ctrl+S` "steer"** — inject guidance mid-turn without stopping the stream — plus `Ctrl+B` background-detach, `Ctrl+O` output-expand, `Ctrl+T` todos, and numeric `1`–`9` approval selection.

### KimiX

**Status:** complete (Python readline REPL + TS/Vite web GUI; a fork/optimization of MoonshotAI kimi-cli).

KimiX is the **minimal end of the spectrum**: the primary CLI is a `while True: input()` readline REPL with **no TUI framework**, so most "shortcuts" are either GNU-readline/`pyreadline3` defaults or text slash-commands rather than app-level key bindings. [\[20\]][ref-20] `Enter` submits; multi-line uses a `/txt … /end` sentinel mode (the web GUI uses `Ctrl/Cmd+Enter` for newline); `Ctrl+C`/`Ctrl+D`/`/exit` exit; `Ctrl+C` interrupts (web `/abort`); `/clear` clears context; slash `Tab`-completion is **documented but not implemented** (no `readline.set_completer`); **no `@`-mention** (uses `/file:<path>`), **no output-copy shortcut, no external editor, no Esc handling, no in-app scroll key**. Arrow-key history and emacs cursor motion come free from readline. Mode switching is via text commands (`/cot:on|off`, `/ralph:on|off|N`, `/plan`). The vendored upstream kimi-cli documents a `Ctrl-X` shell-mode toggle that KimiX's own REPL does not expose.

**Evidence note:** history recall and emacs motion are inferred from the `input()`/`pyreadline3` dependency (readline behavior), medium confidence.

---

## Cross-Repo Comparison

Legend: ✅ implemented · ⚠️ partial/advertised · ❌ absent · key names are the *default* bindings.

| Function | KQode | Copilot CLI | Claude Code | Codex | Gemini CLI | OpenCode | Kimi Code | KimiX |
|---|---|---|---|---|---|---|---|---|
| Submit | `Enter` | `Enter` | `Enter` | `Enter` | `Enter` | `Enter` | `Enter` | `Enter` |
| Newline | `Shift/Ctrl/Meta+Enter`, `\`+`Enter` | `Shift+Enter` | `Shift/Meta+Enter`, `\`+`Enter` | `Ctrl+J`,`Shift/Alt+Enter` | 5 chords | 4 chords | `Shift+Enter`,`Ctrl+J` | web `Ctrl+Enter` |
| Exit | `Ctrl+C ×2` | `Ctrl+C`,`Ctrl+D` | `Ctrl+D`,`Ctrl+C` | `Ctrl+C ×2`,`Ctrl+D` | `Ctrl+D`,`Ctrl+C ×2` | `Ctrl+C/D`,`<ldr>q` | `Ctrl+C/D ×2` | `Ctrl+C/D` |
| Cancel turn | `Esc` ✅ | double-`Esc` | `Esc` | `Esc` | `Esc` | triple-`Esc` | `Esc`/`Ctrl+C` | `Ctrl+C` |
| Slash menu | type `/` | `/`,`Ctrl+P` | `/` | `/` | `/` | `Ctrl+P`,`/` | `/` | `/` (no complete) |
| `@` file picker | ⚠️ advertised | ✅ `@` | ✅ | ✅ `@` | ✅ `@` | ✅ `@` | ✅ `@` | ❌ (`/file:`) |
| Paste (Win) | `Ctrl+V`/`Alt+V` ✅ | `Ctrl/Meta+V` | `Alt+V` (Win) ✅ | `Ctrl+V`/WSL`Ctrl+Alt+V` | `Ctrl/Cmd/Alt+V` | `Ctrl+V` | `Alt+V` (Win) ✅ | terminal-native |
| Copy output | `Ctrl+O` (last resp) | `/copy`,drag,`Ctrl+Insert` | `Ctrl+Shift+C` | **`Ctrl+O`** (last resp) ✅match | `F9` copy-mode | `<ldr>y`,select+`Ctrl+c` | ❌ (kill-ring only) | ❌ |
| History recall | `↑`/`↓` ✅ | `↑`/`↓`,`Ctrl+R` | `↑`/`↓` | `Ctrl+R` search | `Ctrl+P/N`,`Ctrl+R` | `↑`/`↓` | `↑`/`↓` | `↑`/`↓` (readline) |
| History search | ❌ | `Ctrl+R` | `Ctrl+R` | `Ctrl+R` | `Ctrl+R` | ❌ | ❌ | ❌ |
| Emacs edit / kill-ring | ❌ (arrows only) | ✅ full | ✅ (readline) | ✅ full | ✅ full | ✅ full | ✅ full | ✅ (readline) |
| Scroll transcript | `PgUp/PgDn/End`+wheel ✅ | `PgUp/PgDn`,`Ctrl+F/B`,wheel | `PgUp/PgDn`,wheel | `Ctrl+T` pager (no mouse) | `Shift+↑/↓`,`PgUp/Dn` | `PgUp/Dn`+chords | pane-only | terminal-native |
| Mode toggle (`Shift+Tab`) | ❌ | ✅ modes | ✅ mode | ✅ collab mode | ✅ approval mode | ✅ agent cycle | ✅ plan | ❌ (text cmd) |
| External editor | ❌ | `Ctrl+G` | `Ctrl+G`/`Ctrl+X Ctrl+E` | `Ctrl+G` | `Ctrl+G` | `<ldr>e` | `Ctrl+G` | ❌ |
| Shortcut help key | ❌ (`/help`) | `?` | ❌ (`/help`) | `?` | `?` | which-key `Ctrl+Alt+K` | ❌ (`/help`) | ❌ (`/help`) |
| User-configurable keymap | ❌ | ❌ (fixed) | ✅ json | ✅ toml | ✅ | ✅ | ✅ | ❌ |
| Vim mode | ❌ | ❌ | ✅ | ✅ (opt-in) | ✅ `/vim` | ❌ | ❌ | ❌ |

Confidence: **high** for Claude Code, Codex, Gemini CLI, OpenCode, Kimi Code (read from source keybinding registries); **medium** for Copilot CLI (changelog/docs, not source) and for KimiX readline-inherited rows (inferred from the `input()`/`pyreadline3` dependency).

---

## KQode Lessons

### Product behavior

- **Adopt `Shift+Tab` as the mode-cycle key when KQode gains modes.** Six of seven agents (Copilot, Claude, Codex, Gemini, Kimi Code for mode; OpenCode for agent-cycle) use `Shift+Tab` for cycling. When KQode introduces plan/auto/approval modes (per `docs/kqode_build_path.md`), binding them to `Shift+Tab` will match user muscle memory. **But** heed Claude Code's explicit warning: modifier-only chords like `Shift+Tab` are unreliable on Windows Terminal without VT mode, and it falls back to `Meta+M` — KQode is Windows-first, so a fallback binding is mandatory. [\[9\]][ref-9] [\[8\]][ref-8] [\[12\]][ref-12] [\[14\]][ref-14] [\[18\]][ref-18]
- **Add an external-editor shortcut (`Ctrl+G`).** Six of seven agents open the draft in `$VISUAL`/`$EDITOR` via a temp file; `Ctrl+G` is the dominant key (Copilot, Claude, Codex, Gemini, Kimi Code; OpenCode uses `<leader>e`). This is the single most consistent KQode gap and a low-risk, high-value add for long prompts. [\[8\]][ref-8] [\[9\]][ref-9] [\[12\]][ref-12] [\[14\]][ref-14] [\[18\]][ref-18] [\[16\]][ref-16]
- **Implement the `@` file-mention picker KQode already advertises.** KQode's status hint says `@ mention`, but `@` is currently literal text with no picker. Copilot, Codex, Gemini, OpenCode, and Kimi Code all ship an inline fuzzy file picker on `@`; several support `@path#line-range`. Either build the picker or stop advertising it. [\[6\]][ref-6] [\[8\]][ref-8] [\[12\]][ref-12] [\[14\]][ref-14] [\[16\]][ref-16] [\[18\]][ref-18]
- **Decide `Ctrl+O` deliberately.** KQode's `Ctrl+O = copy last response` matches Codex exactly, but collides with Claude/Copilot/Gemini/Kimi Code, which use `Ctrl+O` for *expand output / toggle transcript*. If KQode later adds output-expansion, reserve a different key for it and keep `Ctrl+O`=copy (Codex-aligned), or migrate copy to `/copy` + selection like Copilot/OpenCode. [\[5\]][ref-5] [\[12\]][ref-12] [\[9\]][ref-9]
- **Add emacs line-editing and `Ctrl+R` history search.** Every rich agent provides `Ctrl+A/E/W/K/U` (and often a kill-ring `Ctrl+Y`) plus `Ctrl+R` reverse-search; KQode has only arrows + backspace and arrow-key recall. This is table-stakes for terminal users. [\[8\]][ref-8] [\[12\]][ref-12] [\[14\]][ref-14] [\[18\]][ref-18]

### Architecture implications

- **Introduce a named-command keybinding registry with user overrides.** Five of seven agents (Claude `keybindings.json`, Codex `config.toml` + `/keymap`, Gemini `Command` enum + config, OpenCode `Definitions`/`CommandMap`, Kimi Code `pi-tui` registry) route keys through a central `keyId → command` table that a user file overrides, and derive their help/footer text from it. KQode currently hardcodes handlers across ~15 files and keeps a **separately-maintained** help list (`helpContent.ts`) — which is exactly why that list drifted stale after the right-click change. A registry would (a) make bindings discoverable/rebindable and (b) let the help viewer be *generated* from the source of truth, eliminating the drift class of bug. This aligns with the repo convention against hard-coded strings/enums. [\[9\]][ref-9] [\[12\]][ref-12] [\[14\]][ref-14] [\[16\]][ref-16] [\[18\]][ref-18] [\[1\]][ref-1]
- **Model platform-specific bindings explicitly.** Claude Code and Gemini CLI compute platform-aware defaults (Windows `Alt+V` paste; `Meta+M` mode fallback; per-OS undo). KQode already does the right thing on `Alt+V`; a registry should encode the platform axis rather than scattering `process.platform` checks. [\[9\]][ref-9] [\[14\]][ref-14]

### Evaluation ideas

- **Add a deterministic "help matches bindings" test.** The stale-help finding is a regression that a test could have caught: assert every entry in the help reference resolves to a live handler/binding and vice-versa. If KQode adopts a registry, this becomes trivial (help is generated). This fits the repo's "start evaluation with deterministic harness tests" guidance. [\[1\]][ref-1] [\[3\]][ref-3]
- **Golden keymap snapshot.** Snapshot the resolved default keymap (like Codex/Gemini registries) so any accidental binding change is a reviewable diff — a good first dogfood golden task.

### Risks and tradeoffs

- **`Shift+Tab` / modifier-chord portability on Windows.** Confirmed risk from Claude Code source: unreliable without VT mode. Any `Shift+Tab`/`Ctrl+Shift+*` binding needs a Windows fallback and testing on a GBK/Windows console. [\[9\]][ref-9]
- **`Esc` semantics are crowded.** KQode already overloads `Esc` (cancel turn, clear prompt, close menu, dismiss selection). Reference agents disambiguate with **multi-press** semantics — double-`Esc` (Claude clear, Gemini/Copilot rewind, Kimi undo) or triple-`Esc` (OpenCode abort) — and Codex's `Esc→Esc` **backtrack** (rewind to edit a prior message) is a high-value pattern. If KQode adds more `Esc` behaviors, follow the multi-press convention rather than piling more onto a single press. [\[13\]][ref-13] [\[9\]][ref-9] [\[16\]][ref-16]
- **Don't over-borrow.** KimiX shows a viable minimal design (readline + slash commands) and KQode is already **ahead** on mouse-wheel scrolling (Codex has none) and in-app selection. Borrow the high-consistency verbs (external editor, mode cycle, `@` picker, emacs edit, registry); treat leader-keys/vim/which-key as optional later polish, not milestone-1 work. [\[20\]][ref-20] [\[12\]][ref-12] [\[7\]][ref-7]

---

## Evidence Gaps

- **Copilot CLI (`partial_trace`):** the repo is a binary-only distribution; every binding is sourced from `changelog.md` (product documentation), not source code. Behavior is well-documented but not source-verifiable at this SHA. [\[8\]][ref-8]
- **Claude Code (mirror):** read from the 2026-03-31 source-map snapshot mirror; upstream has drifted since, and some bindings are compile-time feature-gated (`feature('…')`), so a subset may not be active in a shipped build. No embedded git SHA (provenance is the snapshot date). [\[9\]][ref-9]
- **KimiX (medium confidence rows):** history recall and emacs cursor motion are inferred from the `input()`/`pyreadline3` dependency, not explicit code; slash `Tab`-completion is documented but not implemented at the pinned SHA. [\[20\]][ref-20]
- **Mouse specifics:** exact wheel/drag handling was confirmed for KQode, Codex (absent), Gemini (needs `Ctrl+S` mouse-mode), and OpenCode (default on); not exhaustively traced for Copilot/Claude/Kimi beyond documented drag-copy.
- **Not compared:** IDE/ACP surfaces, web GUIs (except KimiX's, noted), and voice-mode keys were out of scope for this terminal-shortcut comparison.

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link. KQode entries link to this repository's own source; the Claude Code entry uses an internal repo-relative link into the mirror.

- <a id="ref-1"></a>[1] KQode: in-app help = source of truth for wired shortcuts (`GLOBAL`/`INPUT`/`SELECTION`/`COMMAND MENU`/`SCROLL`) ([code](../../tui/src/components/HelpScreen/helpContent.ts#L27-L86)).
- <a id="ref-2"></a>[2] KQode: two-step `Ctrl+C` exit + selection dismissal ([code](../../tui/src/useGlobalKeys.ts#L33-L60)).
- <a id="ref-3"></a>[3] KQode: home-screen router — `PageUp`/`PageDown`/`End` scroll and right-click copy-then-clear ([code](../../tui/src/components/HomeScreen/HomeScreenView.tsx#L159-L186)).
- <a id="ref-4"></a>[4] KQode: composer input handlers — submit/newline/esc-cancel/history/cursor/tab ([code](../../tui/src/components/PromptComposer/input/handleNewline.ts#L30-L40)).
- <a id="ref-5"></a>[5] KQode: `Ctrl+O` copy last assistant response ([code](../../tui/src/components/PromptComposer/input/handleCopyLastResponse.ts#L10-L20)).
- <a id="ref-6"></a>[6] KQode: `Ctrl+V`/`Alt+V` paste; `@ mention` is a status-hint affordance only, no picker ([code](../../tui/src/components/PromptComposer/input/handlePaste.ts#L44-L47)).
- <a id="ref-7"></a>[7] KQode: in-app transcript selection gestures (drag/double/triple-click) ([code](../../tui/src/components/HomeScreen/selectionInput.ts#L60-L130)).
- <a id="ref-8"></a>[8] Copilot CLI: shortcut behavior documented in the product changelog (binary-only repo) ([code](https://github.com/github/copilot-cli/blob/6a8b92eb355bee48b731ddb2d6ab5f12c3bf50fc/changelog.md)).
- <a id="ref-9"></a>[9] Claude Code (local mirror): default keybinding registry by context, incl. Windows `Alt+V` paste and `Shift+Tab`/`Meta+M` mode-cycle ([code](../claude-code/keybindings/defaultBindings.ts#L34-L120)).
- <a id="ref-10"></a>[10] Claude Code (local mirror): composer text input — newline (`\`+Enter/Shift/Meta), submit, double-Esc clear ([code](../claude-code/hooks/useTextInput.ts#L250-L330)).
- <a id="ref-11"></a>[11] Claude Code (local mirror): reserved/non-rebindable shortcuts (`Ctrl+C`/`Ctrl+D`/`Ctrl+M`) ([code](../claude-code/keybindings/reservedShortcuts.ts#L16-L70)).
- <a id="ref-12"></a>[12] Codex CLI: TUI keymap registry — submit/newline/interrupt/`@`/`Ctrl+O` copy/`Shift+Tab` mode/`Ctrl+G` editor/`?` overlay ([code](https://github.com/openai/codex/blob/9e552e9d15ba52bed7077d5357f3e18e330f8f38/codex-rs/tui/src/keymap.rs#L925-L1010)).
- <a id="ref-13"></a>[13] Codex CLI: `Esc`→`Esc` backtrack / edit-previous-message rollback ([code](https://github.com/openai/codex/blob/9e552e9d15ba52bed7077d5357f3e18e330f8f38/codex-rs/tui/src/app_backtrack.rs#L90-L165)).
- <a id="ref-14"></a>[14] Gemini CLI: `Command`-enum keybinding registry + defaults (newline chords, approval-mode cycle, external editor) ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/cli/src/ui/key/keyBindings.ts#L280-L400)).
- <a id="ref-15"></a>[15] Gemini CLI: `Shift+Tab` approval-mode + `Ctrl+Y` YOLO handling ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/cli/src/ui/hooks/useApprovalModeIndicator.ts)).
- <a id="ref-16"></a>[16] OpenCode: master keybind defaults (`Definitions`/`CommandMap`), leader-key map, `@`/external-editor/agent-cycle ([code](https://github.com/anomalyco/opencode/blob/34e58090595d44e3e7cc37498f16753a98627456/packages/tui/src/config/keybind.ts#L45-L236)).
- <a id="ref-17"></a>[17] OpenCode: leader-key registration + which-key panel + user-override merge ([code](https://github.com/anomalyco/opencode/blob/34e58090595d44e3e7cc37498f16753a98627456/packages/tui/src/keymap.tsx)).
- <a id="ref-18"></a>[18] Kimi Code: `pi-tui` keybinding registry (submit/newline/emacs/kill-ring) ([code](https://github.com/moonshotai/kimi-code/blob/b1942bd5718c46991ba5021b4ae96dbf2458617c/packages/pi-tui/src/keybindings.ts#L40-L79)).
- <a id="ref-19"></a>[19] Kimi Code: app-level editor key dispatch — `Ctrl+G` editor, `Ctrl+S` steer, `Shift+Tab` plan, double-Esc undo, Windows `Alt+V` paste ([code](https://github.com/moonshotai/kimi-code/blob/b1942bd5718c46991ba5021b4ae96dbf2458617c/apps/kimi-code/src/tui/components/editor/custom-editor.ts#L375-L513)).
- <a id="ref-20"></a>[20] KimiX: readline REPL command surface (`/txt`,`/exit`,`/clear`,`/cot`,`/ralph`,`/plan`) + web-GUI key handlers ([code](https://github.com/Sikao-Engine/KimiX/blob/432a702981c3b128e79d6380825b2ab99a2965bd/src/kimix/cli_impl/commands.py#L118-L320)).

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
[ref-17]: #ref-17
[ref-18]: #ref-18
[ref-19]: #ref-19
[ref-20]: #ref-20
