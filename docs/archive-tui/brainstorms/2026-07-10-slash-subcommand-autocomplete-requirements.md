---
date: 2026-07-10
topic: slash-subcommand-autocomplete
---

# Slash Subcommand Autocomplete

## Summary

Add inline **subcommand autocomplete** to the TUI slash menu, starting with `/memory`. Typing a parent command that has subcommands lists them — each with its own `/parent sub` name and a one-line description — filterable as you type, Tab to complete, Enter to run. Each `/memory` subcommand routes to real behavior: `add`/`edit` use a minimal title + body form, `forget` picks-an-item-then-confirms a soft-remove, and `show`/`inbox` open the memory surface on the right tab. The command registry gains a general subcommand model so other commands can adopt the same pattern later.

---

## Problem Frame

The TUI slash-command system (`2026-07-03-tui-slash-command-system-requirements.md`) is flat: the menu lists top-level commands like `/memory`, and `/memory` opens a fullscreen surface with internal Active/Inbox tabs and keyboard actions. The richer `/memory` operations that `docs/` already specify — `add`, `show`, `list`, `edit`, `forget`, `inbox` — and whose backend RPCs already exist are **not discoverable from the composer**. A user who types `/memory` has no way to learn that `add` or `inbox` exist, or what they do, without opening the surface and exploring, or reading the plan docs. One empty-state line even points at "the `/memory add` backend command" that has no interactive path today.

The cost lands every time a user wants a specific memory action: they either memorize surface keybindings, guess, or give up on manual memory management and rely on auto-extraction. Other products surface subcommands inline with descriptions the moment you type the parent, so the command's capabilities teach themselves.

---

## Key Flows

- F1. Discover and run a subcommand
  - **Trigger:** User types `/memory` in the composer.
  - **Steps:** The slash menu lists `/memory`'s subcommands, each with a description → user narrows by typing (`/memory i` → `/memory inbox`) or moves the highlight with ↑/↓ → Tab completes the highlighted name, or Enter runs it.
  - **Outcome:** The chosen subcommand executes; the user learned the available actions without leaving the composer.
  - **Covered by:** R1, R2, R3, R4

- F2. Add a memory item
  - **Trigger:** User runs `/memory add`.
  - **Steps:** A two-field form opens (title, multiline body) with scope fixed to repo and type to project → user fills it and submits, or cancels with Esc.
  - **Outcome:** On submit, an active memory item is written immediately and appears in the Active list; on cancel, nothing is written.
  - **Covered by:** R9, R10, R12

- F3. Edit a memory item
  - **Trigger:** User runs `/memory edit`.
  - **Steps:** The Active list opens for selection → user picks an item and confirms → the same two-field form opens prefilled with the item's current title and body → user edits and submits, or cancels.
  - **Outcome:** On submit, the item is updated; on cancel, it is unchanged.
  - **Covered by:** R11, R12

- F4. Forget a memory item
  - **Trigger:** User runs `/memory forget`, or presses `x` on a highlighted item in the Active list.
  - **Steps:** The Active list opens for selection (subcommand path) → user picks an item → an explicit confirmation step appears → user confirms or cancels.
  - **Outcome:** On confirm, the item is soft-removed and leaves the Active list; on cancel, it remains.
  - **Covered by:** R13, R14, R15

---

## Requirements

**Subcommand autocomplete (menu mechanism)**
- R1. The slash-command registry models subcommands generally: a command may declare zero or more subcommands, each with its own name, description, and action. Menu rendering, filtering, help listing, and execution all derive from this single source.
- R2. When the composer text matches a parent command that has subcommands (e.g. `/memory`), the slash menu lists that command's subcommands, each showing its `/parent sub` name and a short description.
- R3. Typing narrows the subcommand list by prefix (`/memory i` → `/memory inbox`); the parent-only query shows all of its subcommands.
- R4. Tab completes the highlighted subcommand into the composer; Enter runs the highlighted subcommand; ↑/↓ move the highlight; Esc dismisses — matching the existing top-level menu behavior.
- R5. Commands that declare no subcommands keep today's flat menu behavior unchanged.

**`/memory` subcommand set and routing**
- R6. `/memory` declares these subcommands: `add`, `show`, `inbox`, `edit`, `forget`, each with a one-line description. `reload` is not a composer subcommand (the in-surface `r` reload key is unchanged).
- R7. `show` opens the memory surface on the Active list; `inbox` opens it on the Inbox tab.
- R8. Bare `/memory` (no subcommand) + Enter opens the Active list, preserving today's behavior; `show` is an explicit, discoverable synonym for that same destination.

**Add and edit form**
- R9. `add` opens an interactive form with exactly two fields: a single-line title and a multiline body. Scope is fixed to repo and type to project in v1 and are not user-editable.
- R10. Submitting the add form writes an active memory item immediately via the existing add RPC; the new item appears in the Active list.
- R11. `edit` opens the Active list for selection, then opens the same two-field form prefilled with the selected item's current title and body; submitting saves the changes via the existing edit RPC.
- R12. The add/edit form can be cancelled (Esc) without writing.

**Forget confirmation**
- R13. `forget` opens the Active list for selection; confirming performs a soft-remove via the existing forget RPC, and the item leaves the Active list.
- R14. Removal always passes through an explicit confirmation step; cancelling the confirmation leaves the item in place.
- R15. The existing in-surface `x` forget key routes through the same confirmation step rather than removing instantly.

**Discoverability**
- R16. The Help surface's COMMANDS section reflects subcommands (name + description), derived from the registry, so `/help` documents them alongside top-level commands.
- R17. The Active-list empty-state hint that references `/memory add` stays accurate now that `add` is a real interactive command.

---

## Acceptance Examples

- AE1. **Covers R2, R3.** Given the composer reads `/memory`, when the menu renders, it shows `/memory add`, `/memory show`, `/memory inbox`, `/memory edit`, `/memory forget`, each with a description; when the user then types `/memory e`, only `/memory edit` remains.
- AE2. **Covers R4, R7.** Given `/memory inbox` is highlighted, when the user presses Enter, the memory surface opens on the Inbox tab.
- AE3. **Covers R8.** Given the composer reads exactly `/memory` with no subcommand, when the user runs the parent, the Active list opens — today's behavior preserved.
- AE4. **Covers R9, R10.** Given the user runs `/memory add`, when they enter a title and body and submit, a repo-scoped / project-type item is created and appears in the Active list; when they instead press Esc, nothing is written.
- AE5. **Covers R11.** Given the user runs `/memory edit` and picks an item, when the form opens it is prefilled with that item's title and body; submitting updates the existing item rather than creating a new one.
- AE6. **Covers R13, R14, R15.** Given the user runs `/memory forget` (or presses `x` on a highlighted item), when they pick an item and confirm, it is soft-removed and leaves the list; when they cancel at the confirmation step, the item remains.

---

## Success Criteria

- A user discovers and runs `/memory` subcommands without reading docs — the menu names and descriptions make each subcommand's purpose clear on sight.
- A user can create, view, review, edit, and remove memory entirely from the composer via subcommands, without needing to memorize in-surface keybindings first.
- Adding a subcommand to any command is a single registry entry (name, description, action); the menu, filter, help listing, and routing pick it up with no other changes.
- Downstream planning can implement without inventing which subcommands exist, what each does, or the shape of the form and confirmation flows.

---

## Scope Boundaries

- No scope or type pickers in the add/edit form; v1 is fixed to repo/project. Cross-scope and user-scoped (cross-repo) manual add are deferred.
- No inline arguments (e.g. `/memory add <text>` prefilling the body).
- No new subcommands for other commands (`/model`, `/login`, `/resume`, etc.); only the general mechanism ships so they can adopt it later.
- `reload` is not exposed as a composer subcommand; the in-surface `r` reload key is unchanged.
- Editing an existing item's scope or type is out of scope (edit is title + body only).
- Auto-extraction and inbox candidate generation behavior are unchanged; this feature only adds composer entry points and manual create/edit/forget flows.

---

## Key Decisions

- **Full functional routing over discovery-only:** subcommands execute distinct behavior, which justifies building the new add/edit form, the forget confirmation, and the in-surface pick-then-act transitions.
- **Minimal form (title + body, fixed repo/project):** lowest new-UI cost for v1; scope/type picking is deferred rather than built now.
- **Forget gains a confirmation on both paths:** the `/memory forget` subcommand and the existing in-surface `x` key both route through one confirmation step, for consistency and because soft-remove is destructive.
- **Bare `/memory` keeps opening the Active list, with `show` as a synonym:** preserves current behavior while making the "view" action explicit and discoverable in the menu.
- **Subcommands modeled as nested registry children:** one source of truth, and the pattern generalizes to any command without special-casing `/memory`.

---

## Dependencies / Assumptions

- The backend memory RPCs already exist and are the read/write truth (`kqode.memory.add`, `.edit`, `.forget`, `.list`, `.show`, `.inbox.list/apply/undo`); verified in `tui/src/contracts/backend/memoryMessages.ts`. This feature wires composer/surface UI to them and does not add backend methods.
- The memory surface already supports Active/Inbox tabs, item highlighting, a detail view, and forget; the **net-new** surface pieces are the add/edit form, item selection returning into a form/confirmation, and the confirmation step.
- Soft-remove semantics are provided by the existing forget RPC; this feature does not redefine what "forget" persists.

---

## Outstanding Questions

### Resolve Before Planning

- (None — product decisions are settled.)

### Deferred to Planning

- [Affects R2, R4][Technical] Menu layout when a parent has both a run-the-parent action and subcommands: ordering and default highlight of the parent entry versus its children.
- [Affects R11, R13][Technical] How the pick-then-act transition is represented in the surface state (a transient selection/picker mode that returns into the edit form or the forget confirmation).
- [Affects R9][Technical] The multiline body editing affordance in the form (reuse the composer input model versus a dedicated field).
- [Affects R15][Needs research] Whether existing tests assert instant `x` forget and must be updated for the new confirmation step.
