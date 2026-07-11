---
date: 2026-07-12
topic: theme-catalog-ten-popular-themes
---

# Theme Catalog: Ten Popular Themes

## Summary

Grow the built-in `/theme` catalog from 6 to 10 dark presets by adding four widely-used schemes — Solarized Dark, Monokai, Rosé Pine, and Everforest — each with the full 12 semantic tokens and source/license metadata, all permissively licensed and passing the existing contrast and metadata tests. No engine, protocol, or persistence changes.

---

## Problem Frame

KQode ships 6 dark themes (Tokyo Night, Dracula, One Dark, Nord, Gruvbox Dark, Catppuccin Mocha), and the picker already applies and persists a chosen theme. But the current set leans cool/blue-purple, and several of the most recognizable terminal/editor color schemes users bring from other tools — Solarized, Monokai, Rosé Pine, Everforest — aren't offered. Users who identify strongly with a familiar scheme have no in-app way to match it. Adding presets is cheap (Rust validates only id *shape*, not catalog membership), so the cost is curation and readability tuning, not new infrastructure.

---

## Requirements

**New presets**
- R1. The `/theme` catalog grows from 6 to 10 dark presets by adding Solarized Dark, Monokai, Rosé Pine, and Everforest (dark variant).
- R2. Each new preset defines all 12 semantic color tokens as truecolor `#RRGGBB` values, matching the existing `ThemeColors` shape, with `isDark: true`.
- R3. Each new preset carries source metadata (name, GitHub URL, license, notice) identifying its upstream palette.

**Licensing (all 10 themes)**
- R4. Every theme in the catalog uses a permissive license (MIT or MIT/X11) with a valid `https://github.com/...` source URL and an attribution notice; no theme derives from a paid or proprietary source.
- R5. Monokai sources the classic palette from the MIT-licensed `tanvirtin/monokai.nvim`, explicitly **not** the paid "Monokai Pro".

**Readability**
- R6. Each new preset passes the existing contrast gates — text-bearing tokens ≥ 4.5 and `muted` ≥ 3.0 against `bodyBackground`. Where a canonical palette is too low-contrast to pass (Solarized Dark, and possibly Rosé Pine's `muted`), the `foreground`/`muted` tokens are nudged to clear the gate, prioritizing "passes the gate" over byte-exact fidelity to upstream.

**Catalog behavior**
- R7. The 10 presets remain sorted alphabetically by label in the picker, Tokyo Night remains the default, and the existing 6 presets are unchanged.

---

## Acceptance Examples

- AE1. **Covers R2, R6.** Given the four new presets, when the theme-catalog test runs, each preset exposes all 12 tokens as `#RRGGBB` and produces zero failing contrast checks.
- AE2. **Covers R3, R4, R5.** Given each new preset's `source`, when the metadata test runs, every source has a `github.com` URL, a non-empty license, and a non-empty notice; Monokai's URL is the `tanvirtin/monokai.nvim` repo.
- AE3. **Covers R1, R7.** Given the `/theme` picker, when opened, it lists 10 themes alphabetically by label with Tokyo Night still the default preset.

---

## Success Criteria

- Users can pick from 10 recognizable dark themes via `/theme`, including four common schemes (Solarized, Monokai, Rosé Pine, Everforest) not previously available.
- The theme test suite passes with the 10-theme catalog: token completeness, contrast gates, license metadata, and the updated expected-id list.
- No theme introduces a licensing risk — every palette is permissively licensed with attribution, verified against its source repo.

---

## Scope Boundaries

- No light themes this round — deferred, not rejected. A light theme would require relaxing the `isDark: true` literal to `boolean` and handling a light terminal background (OSC 11).
- No custom/user-defined theme files, theme import, or per-workspace themes.
- No change to the default theme, the existing 6 presets, or the `/theme` selection/persistence UX.
- No new semantic tokens or theme-engine changes — new presets reuse the existing 12-token shape.
- Only these four themes this round. Night Owl, Kanagawa, Ayu Dark, and Material Palenight are verified/known bench options for a future round, not included now.

---

## Key Decisions

- **All-dark round.** Consistent with the "dark-only v1" decision from the theme-command brainstorm; avoids a type change and light-terminal-background handling.
- **Slate chosen for palette variety.** The four add hue families absent from the current cool-leaning set: desaturated teal (Solarized), vibrant high-saturation (Monokai), muted mauve (Rosé Pine), and low-contrast green (Everforest).
- **Monokai via MIT reproduction.** Cite `tanvirtin/monokai.nvim`; never the paid Monokai Pro.
- **Contrast gate over palette fidelity.** Canonical low-contrast palettes may be adjusted so text/muted tokens clear 4.5/3.0.

---

## Dependencies / Assumptions

- **Licenses verified this session** (via GitHub API / LICENSE inspection): Solarized — MIT (`altercation/solarized`, © 2011 Ethan Schoonover); Monokai — MIT (`tanvirtin/monokai.nvim`); Rosé Pine — MIT (`rose-pine/palette`); Everforest — MIT (`sainnhe/everforest`). The existing 6 are already MIT (Gruvbox is MIT/X11).
- **TypeScript-only change, verified.** Rust validates theme-id *shape*, not catalog membership (`src/store/theme.rs`, `set_theme_accepts_unknown_but_well_formed_ids` test), and the TUI owns catalog + unknown-id fallback. Touchpoints are `tui/src/theme/themeTypes.ts` (`ThemeId`), `tui/src/theme/themeCatalog.ts` (presets), and `tui/src/theme/__tests__/themeCatalog.test.ts` (`EXPECTED_IDS`). No Rust, protocol, store, or migration changes.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R6][Technical] The exact per-token adjustments for Solarized Dark (and Rosé Pine's `muted`) needed to pass the 4.5/3.0 gate, chosen to stay as close to the canonical palette as the gate allows.
- [Affects R1] Which specific dark variant to encode for the multi-variant families — e.g. Everforest Dark Medium vs Hard/Soft, and Rosé Pine "Main" vs "Moon" — picking the variant that best balances recognizability and the contrast gate.
