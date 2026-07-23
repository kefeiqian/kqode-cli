---
date: 2026-07-23
topic: copilot-cli-right-edge-rendering
question: "How does GitHub Copilot CLI visually reach the terminal right edge without clipping its content?"
status: blocked
---

# Copilot CLI Right-Edge Rendering

## Summary

Source-level implementation research is blocked. The checked-in reference
catalog classifies GitHub Copilot CLI as a public product reference rather than
an approved open-source source-research target, so this run did not fetch or
inspect its implementation.

The supplied screenshot is still useful as product evidence: the conversation
surface stops before a dedicated right-side scrollbar/gutter, so it does not
demonstrate meaningful text rendered in the physical final terminal cell.

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| GitHub Copilot CLI | not fetched | not fetched | n/a | n/a | blocked | Product-only reference under the current approved catalog. |

---

## Method

- Question: How Copilot CLI handles right-edge rendering.
- Repo scope: GitHub Copilot CLI product reference.
- Safety posture: screenshot inspection only; no unsupported source fetch.
- Citation format: no source citations are available for implementation claims.

---

## Per-Repo Findings

### GitHub Copilot CLI

**Status:** blocked

**Observed product behavior**

- The screenshot shows a dedicated vertical scrollbar and a visible gutter at
  the far right. Conversation-row text and backgrounds terminate before that
  chrome, so the UI can appear edge-to-edge without placing important text in
  the terminal's final cell.

**Evidence gaps**

- No approved source evidence identifies the renderer, width calculation, cell
  buffer, or terminal-specific final-column handling.

---

## Evidence Gaps

- GitHub Copilot CLI source: `policy_blocked` by the current KQode reference
  catalog, which lists it as a product reference rather than a source target.
- Renderer implementation: `no_evidence`; screenshot behavior must not be
  presented as proof of a specific rendering architecture.

---

## References

No commit-pinned source references were available for this blocked run.
