---
date: 2026-07-09
topic: conversation-history-and-auto-compaction
---

# Full Conversation History and Auto-Compaction

## Summary

KQode will send the entire per-session conversation to the model on every turn — a system prompt carrying live session/workspace metadata, then every prior round, then the new message — replacing today's standalone single-message request. When the assembled context approaches the model's context window, a hidden summarization pass compacts the oldest rounds into a structured summary while keeping recent rounds verbatim, surfacing an "Auto compacting…" status while it runs. The compacted state is persisted so a resumed session continues from the summary, and the visible transcript is never altered.

---

## Problem Frame

Today each submitted message is sent to the provider on its own: the request is only the base system prompt plus the current user text, so the model has no memory of earlier rounds in the same session. Follow-ups ("now do the same for the other file", "why?") land with no context, forcing the user to re-paste prior content and making genuine multi-turn work effectively impossible.

At the same time, naively sending the whole history will eventually exceed the model's context window and hard-fail the request — precisely on long, productive sessions, i.e. the moment the session is most valuable is the moment it would break. The system prompt also currently carries only OS, cwd, and model, so the model lacks basic situational grounding (date, where it sits in git) that users expect it to "just know."

---

## Actors

- A1. User: Sends messages across multiple rounds in one session and expects continuity.
- A2. Conversation coordinator: The backend owner of turn state and single writer that assembles each request and drives compaction.
- A3. Summarization agent (hidden): An internal, user-invisible model call that produces the compaction summary.

---

## Requirements

**Conversation history assembly**
- R1. Every model request for a session includes the full ordered conversation: the system prompt, then all prior completed rounds (each as a user message followed by its assistant reply), then the new user message.
- R2. Only completed rounds contribute history; cancelled, errored, and needs-configuration rounds are excluded from what is sent to the model.
- R3. The visible transcript and the on-disk session log always retain the full, unmodified history regardless of what the request payload contains.

**Session and workspace metadata**
- R4. The system prompt carries a metadata block with current date/time, the workspace path, the current git branch, and a short git status (clean/dirty, optionally a few recent commits), in addition to the existing OS and active model.
- R5. Metadata reflects live state at the time of the turn (branch/status re-read per turn); a session id is deliberately NOT included in the prompt.
- R6. When the workspace is not a git repository, the metadata block degrades gracefully — it omits branch/status rather than erroring.

**Auto-compaction**
- R7. Before sending a turn, KQode estimates the assembled request's token size against a per-model context budget; when the estimate reaches ~70–75% of that budget, it triggers auto-compaction before the turn proceeds.
- R8. Compaction summarizes the oldest rounds into a single structured summary and keeps the most recent rounds verbatim; the request then becomes system prompt + summary + recent verbatim rounds + new message.
- R9. The summary is produced by a hidden model call using the active model, and is structured (goal / key decisions / recent context / open threads / relevant files) rather than freeform.
- R10. On repeated compactions, the previous summary is fed back into the summarization input so the running summary is refined rather than regenerated from scratch (anchored / incremental).
- R11. If the summarization call fails, the turn fails with a clear, user-visible error and no message is sent; the user can retry. History is not silently truncated.

**Status and feedback**
- R12. While the summarization call runs, the status bar shows an "Auto compacting…" state, distinct from the normal "Working" state, and returns to "Working" for the main model call.
- R13. Cancelling (Esc) during compaction cancels the whole turn, consistent with cancelling a normal in-flight turn.

**Persistence and resume**
- R14. When compaction occurs, the resulting summary and the boundary of which rounds it covers are persisted to the session record, alongside (not replacing) the full round history.
- R15. Resuming a session restores both the full visible transcript and the latest compacted state, so the next request continues from the summary + verbatim tail without re-summarizing already-compacted history.

---

## Acceptance Examples

- AE1. **Covers R1.** Given a session with three completed rounds, when the user sends a fourth message, the request contains the system prompt, all three prior user/assistant pairs, and the fourth user message, in order.
- AE2. **Covers R2.** Given a round that was cancelled mid-stream, when the next turn is assembled, that cancelled round does not appear in the messages sent to the model.
- AE3. **Covers R3, R8.** Given a session long enough to trigger compaction, when compaction replaces the oldest rounds with a summary in the request, the TUI transcript still shows every original round unchanged.
- AE4. **Covers R7, R12.** Given an assembled request estimated at ~72% of the model budget, when the user submits, the status bar shows "Auto compacting…" before the assistant response begins streaming.
- AE5. **Covers R11.** Given the summarization call returns a network error, when compaction fails, the turn settles as an error explaining compaction failed and nothing is sent as the main call.
- AE6. **Covers R15.** Given a session that compacted at round 20 and was then closed, when it is resumed and the user sends round 25, the request starts from the persisted summary plus the verbatim recent rounds rather than re-sending rounds 1–20.
- AE7. **Covers R6.** Given a workspace that is not a git repository, when a turn is assembled, the metadata block includes date/time and workspace path but omits git branch/status without error.

---

## Success Criteria

- A user can hold a genuine multi-turn conversation in one session — follow-ups resolve against earlier rounds without re-pasting context.
- A session can run well past the model's context window without a hard context-limit failure; compaction keeps it going while recent detail stays verbatim.
- The visible transcript is never silently altered by compaction — users trust what they see.
- A resumed long session continues seamlessly from its compacted state.
- A downstream implementer can build request assembly, the compaction trigger/summary, status signaling, and persistence/resume without inventing product behavior.

---

## Scope Boundaries

- No tool calling / function calling, and no other agent mechanics — this feature is conversation history + compaction only. (The interactive question window is a separate companion brainstorm: `2026-07-09-interactive-user-question-window-requirements.md`.)
- No manual `/compact` (or `/compress`) command in this round — compaction is automatic only.
- Token counting is an estimate (heuristic), not exact provider-usage accounting.
- No per-model context-window auto-detection; a configured budget per model is assumed.
- No cheaper / dedicated summarizer model, and no Gemini-style second "verify" pass over the summary.
- No prompt-caching optimization of the static prefix.
- Multi-provider support is out — only the currently supported provider (Kimi) is in scope.

---

## Key Decisions

- Summarize-old + keep-recent-verbatim over a single rolling summary or blind truncation: preserves recent fidelity while bounding size; matches all four reference agents (Claude Code, Codex, Gemini CLI, OpenCode).
- Conservative ~70–75% trigger over an aggressive ~90%: token size is estimated, so headroom protects against ever exceeding the real limit.
- Persist the summary (resume-from-compacted) over in-memory-only: robust for long / resumed sessions, accepting a new persisted record + restore path.
- Fail the turn on compaction error over degrade-to-truncation: matches prior art and avoids silent history loss.
- Inject git branch + status (Claude / Codex style) rather than a bare "is-git-repo" boolean (Gemini / OpenCode): KQode has no tools yet, so the model cannot inspect git itself.
- Structured summary with anchored re-summarization: 3 of 4 reference agents use structured summaries, and anchoring the prior summary prevents drift across repeated compactions.

---

## Dependencies / Assumptions

- The backend already owns an in-memory transcript of all rounds (prompt + assistant result) and persists rounds to a per-session JSONL log with a SQLite index and resume — this feature builds request assembly, compaction, and compacted-state persistence on top of that spine.
- A per-model context-window budget is available as a configured constant (the currently supported provider's window). [Unverified assumption] The model catalog does not track context window today, so a budget must be supplied.
- Token estimation uses a simple heuristic (e.g., characters-per-token); capturing exact provider token usage from the stream is a later refinement.
- Git branch/status is already obtainable by the backend for the workspace.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R7][Technical] Exact token-estimation heuristic and the precise budget/threshold numbers per model, including how much headroom to reserve for the model's own response.
- [Affects R8][User decision] How much recent history stays verbatim (a fixed number of recent rounds vs a token-budgeted tail such as ~25–30% of the budget).
- [Affects R9][Technical] The exact section set and wording of the structured summarization prompt.
- [Affects R14][Technical] The on-disk representation of the persisted compaction record and how the covered-round boundary is expressed for restore.
- [Affects R4][Needs research] Whether "short git status" includes recent commits or just clean/dirty + branch, balancing usefulness against per-turn cost.
