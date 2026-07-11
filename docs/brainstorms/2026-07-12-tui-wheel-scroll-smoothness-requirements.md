---
date: 2026-07-12
topic: tui-wheel-scroll-smoothness
---

# TUI Wheel Scroll Smoothness

## Summary

Make mouse-wheel scrolling in the TUI keep up with the wheel. Every notch in a batched stdin chunk must register and apply, so a fast spin scrolls proportionally far and feels responsive instead of laggy. Parser-only fix; no animation.

## Problem Frame

When the user spins the mouse wheel, the terminal emits several SGR wheel sequences in quick succession. Node/Ink delivers them concatenated in a single `input` chunk (e.g. `ESC[<64;c;rM` repeated). The wheel parser in `tui/src/libs/terminal/mouse.ts` matches with an anchored regex (`^…$`), so it recognizes exactly one sequence and returns `null` for any multi-sequence chunk — the entire chunk is dropped and nothing scrolls.

The faster the user scrolls, the more notches arrive per chunk, and the more get dropped. The felt result is the "laggy / stuttery / not keeping up" behavior the user reported. Verified: a 3-notch batch fails the current regex and scrolls zero rows, while a global scan finds all 3. This parser feeds every wheel path (`tui/src/components/HomeScreen/HomeScreenView.tsx`): transcript body, composer, and docked command panels.

## Requirements

**Notch capture**
- R1. A single `input` chunk containing multiple wheel sequences must register every notch, not drop the chunk. A single unbatched notch keeps its current behavior.
- R2. Notches apply in the order they appear in the chunk, each carrying its own direction, so a chunk with mixed up/down notches nets correctly.

**Application and routing**
- R3. Per-notch routing to composer / body / docked panel / ignored is preserved, driven by each notch's pointer position and the existing `resolveWheelTarget` rules.
- R4. The per-notch step stays `MOUSE_WHEEL_SCROLL_ROWS` (3) for the body and the existing clamped step for the composer. Net movement for a chunk is the sum of its notches, clamped to the existing scroll bounds.
- R5. Non-wheel handling in the same handler (copy-mode selection gestures, clicks, keyboard) is unchanged.

## Acceptance Examples

- AE1. **Covers R1, R4.** Given the body can scroll, when one chunk contains 3 concatenated wheel-up sequences, the body scrolls up `3 × 3` rows — not 0.
- AE2. **Covers R2.** Given a chunk contains two wheel-up notches then one wheel-down notch, the body nets one notch of upward scroll, applied and clamped in order.
- AE3. **Covers R3.** Given the pointer is over a scrollable composer, when a batched wheel-up chunk arrives, all notches route to the composer and the body offset is unchanged.
- AE4. **Covers R1.** Given a single (unbatched) wheel-up sequence, behavior is identical to today: one notch of scroll.

## Success Criteria

- Spinning the wheel fast scrolls the body smoothly and proportionally, with no dropped/stuttered notches — matching native terminal scroll feel.
- A test proves a batched N-notch chunk moves the scroll offset by N steps (previously 0), and single-notch and routing behavior are unchanged.

## Scope Boundaries

- No animated glide, momentum, inertia, or easing.
- No change to keyboard PageUp / PageDown / End / Home scrolling.
- No change to the per-notch step size (stays 3 rows).
- No re-architecture of the transcript wrap / render pipeline (see Outstanding Questions).

## Key Decisions

- Accumulate notches (proportional scroll) rather than cap one chunk to a single step — matches native scroll feel and the user's "scroll proportionally far" intent.
- Ship as a parser-level fix and defer the transcript re-wrap cost, so the change stays small and low-risk.

## Dependencies / Assumptions

- Assumes Ink's `useInput` delivers multiple concatenated SGR sequences in one `input` chunk during a fast spin — the batching that the anchored regex currently drops. This is the mechanism the fix relies on.
- Assumes a real-world wheel spin produces same-direction notches; mixed-direction chunks still net correctly via in-order application (R2).

## Outstanding Questions

### Deferred to Planning

- [Affects R4][Needs research] Does every landed notch re-wrapping the entire transcript (`resolveBodyRows` over all entries) add measurable latency on long transcripts once notches stop being dropped? If so, a memoization/windowing pass is a follow-up, not part of this change.
- [Affects R5][Technical] Should a single chunk that mixes wheel notches with a click or selection gesture also handle the non-wheel event, or is today's "wheel wins, rest dropped" acceptable for such rare mixed chunks?
