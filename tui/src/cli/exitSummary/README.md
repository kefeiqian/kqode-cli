# Exit summary

This CLI composition module computes and prints the exit-summary card when the
TUI shuts down. Pure formatting and session-seed helpers live in
`src/libs/exitSummary/`; this folder owns state access and terminal output.

## Layout

- `src/libs/exitSummary/` — pure formatting, shared types, and session seeding.
- `computeExitSummary.ts` — derives duration and working-tree changes from state.
- `printExitSummary.ts`, `finishSession.ts` — write the card to the terminal's
  normal buffer on the clean-exit path, after the alternate screen is left.
