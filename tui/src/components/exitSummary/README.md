# exitSummary

**Not React/Ink components.** This folder is pure logic — it formats the
exit-summary card as a string and prints it to the terminal when the TUI shuts
down. Nothing here renders JSX.

It lives under `components/` because it is **UI-related**: it owns what the user
sees on exit. We group it with the UI rather than in `libs/` (which holds
generic, UI-agnostic, reusable helpers such as `math`, `text`, and `terminal`),
so UI concerns stay together.

## Layout

- `formatExitSummaryCard.ts`, `banner.ts`, `border.ts`, `formatDuration.ts` —
  pure string formatting for the card.
- `computeExitSummary.ts`, `resolveSessionSeed.ts` — derive the card's data
  (duration, working-tree change counts) from the session.
- `printExitSummary.ts`, `finishSession.ts` — write the card to the terminal's
  normal buffer on the clean-exit path, after the alternate screen is left.
- `types.ts` — shared types.
