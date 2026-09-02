---
date: 2026-07-12
topic: evaluation-baseline-public-benchmarks
---

# Evaluation Baseline on Public No-Tool Benchmarks

## Summary

Add a non-interactive KQode mode (`--prompt`, `--json`) and a native `kqode eval` runner that scores KQode against public, no-tool benchmarks — starting with EvalPlus (HumanEval+/MBPP+) — and writes reproducible per-run reports. This establishes a baseline number now, built so the same score rises as tools, sandboxes, and plugins land.

---

## Problem Frame

KQode today is a "bare" agent: it streams a single-turn chat completion from a provider (`src/chat/turn.rs`) and has no tool system, VFS, or sandbox. There is no way to measure how good it is, and no baseline to measure future improvement against — the only binary mode is the TUI's JSON-RPC backend (`main.rs` accepts `--backend` and nothing else), so nothing can drive KQode headlessly or grade its output.

As tools, sandboxes, and plugins are added, the team needs to *prove* the harness is getting better, not just assert it. Frontier labs (Anthropic Opus 4.8 System Card, OpenAI GPT-5.6) publish exactly this kind of benchmark evidence. Without a baseline captured before the harness grows, there is no "before" to compare the "after" to, and no portfolio-grade evidence that KQode works at all.

The existing `docs/kqode_evaluation_spec.md` is harness-first ("evaluate the harness, not only the LLM") and sequences public benchmarks last, after deterministic and golden-task layers. That is the right long-run design, but it leaves no early, cheap, provider-comparable number — which is what this work adds.

---

## Actors

- A1. **KQode developer / portfolio owner** (@kefeiqian): runs evals, tracks the baseline over time, publishes results as evidence.
- A2. **`kqode eval` runner**: drives the model with an eval-mode prompt, collects completions, invokes graders, writes reports.
- A3. **External benchmark grader** (e.g., EvalPlus): scores completions (executes generated code / matches answers) outside KQode.
- A4. **LLM provider** (Kimi / OpenAI-compatible): serves the completions.

---

## Key Flows

- F1. **Run a benchmark end-to-end**
  - **Trigger:** developer runs `kqode eval evalplus --limit N` (directly or via the xtask/skill wrapper).
  - **Actors:** A1, A2, A3, A4.
  - **Steps:** resolve provider/model non-interactively → load pinned dataset → for each task, drive the model with the eval-mode prompt → collect completion → hand completions to the grader → grader scores pass@1 → write run artifacts + metrics.
  - **Outcome:** a saved, reproducible run report with pass rate, cost, runtime, and failure breakdown.
  - **Covered by:** R5, R6, R7, R8, R10, R14, R15, R16, R17.

```text
kqode eval <suite/names>
  -> resolve provider/model (store + keychain, non-interactive)
  -> load pinned benchmark dataset
  -> for each task: drive model (eval-mode prompt) -> completion
  -> hand completions to external grader (isolated) -> pass/fail
  -> write eval-run artifacts + metrics (pass rate, cost, runtime)
```

- F2. **Headless one-shot (non-eval)**
  - **Trigger:** `kqode --prompt "..." [--json]`, or a prompt piped on stdin.
  - **Actors:** A1, A4.
  - **Steps:** resolve config non-interactively → run one turn → print completion (text, or JSON with usage) → exit code reflects success/failure.
  - **Outcome:** a scriptable single completion; fails closed when unconfigured.
  - **Covered by:** R1, R2, R3, R4.

---

## Requirements

**Non-interactive mode**
- R1. Add a headless one-shot mode invoked with `--prompt <text>` (also accepting a prompt on stdin) that resolves the active provider/model non-interactively and prints the assistant completion to stdout, with no TUI.
- R2. Support `--json` output carrying at least the completion text, finish reason, model/provider, and token/cost usage, for machine consumption.
- R3. When no provider/model/key is configured, the headless mode fails closed with a non-zero exit and a clear stderr message — no interactive login prompt.
- R4. The headless mode reuses the existing single-turn machinery and does not depend on the TUI or the JSON-RPC backend.

**Eval runner**
- R5. Add a `kqode eval` command that runs one or more benchmarks and produces a saved, reproducible run report.
- R6. Support benchmark selection: run all benchmarks in a named suite, or an explicit subset by name (the "run all or selected" behavior).
- R7. Each run writes machine-readable metrics and human-readable evidence following the run-artifact shape in `docs/kqode_evaluation_spec.md` (per-run summary + per-task result + trajectory), including pass rate, per-task pass/fail, runtime, cost, and token usage.
- R8. Record the exact run configuration (provider, model, sampling settings, benchmark dataset version, KQode git commit, prompt mode) so a run is reproducible and comparable to earlier runs.
- R9. Expose the runner through a thin developer entrypoint (an `xtask` command and/or an agent skill) so "run the eval suite" is a first-class dev workflow, consistent with the project's xtask conventions.

**Benchmark coverage**
- R10. First vertical: score KQode on EvalPlus (HumanEval+ and MBPP+) end-to-end — drive model → collect completions → grade pass@1 → saved report.
- R11. Establish the general no-tool baseline set (see Benchmark Catalog) as the near-term target, added incrementally after the first vertical.
- R12. Designate "growth carriers" — benchmarks built so the *same* task can rerun single-shot now and with execution-feedback/self-repair once the sandbox lands (EvalPlus, LiveCodeBench, BigCodeBench, Aider Polyglot). The runner loop must accommodate adding an execution-feedback step without a rewrite.
- R13. Record the deferred tool-requiring benchmarks as an explicit backlog (see Benchmark Catalog), with SWE-bench Verified named as the graduation target.

**Eval-mode model driving**
- R14. In eval mode, drive the model with KQode's real system prompt but stripped of benchmark-irrelevant environment noise (live git status, cwd, memory, compaction), so the reported number reflects KQode as shipped.
- R15. Give eval runs deterministic, recorded sampling (e.g., fixed temperature/seed); support benchmarks that require multiple samples (AIME avg@k, pass@k).

**Safety**
- R16. Because coding graders execute model-written code, eval runs treat grading as untrusted code execution and isolate it (sandboxed/containerized grader), consistent with KQode's safety posture.

**Reporting and reconciliation**
- R17. Produce a portfolio-facing report per run (KQode version/commit, provider/model, prompt mode, benchmark + dataset version, pass rate, cost/runtime per task, failure breakdown) suitable for README evidence and comparable across KQode runs over time.
- R18. Reconcile `docs/kqode_evaluation_spec.md`: document general no-tool public benchmarks as an early "provider/model capability baseline" layer, distinct from and sequenced before the harness-focused layers, so the two specs do not contradict.

### Benchmark Catalog

Classification of the researched benchmarks. **NOW** = a bare LLM agent can produce a gradable answer (external grader scores it); **DEFER** = needs a tool/agent harness. Both frontier cards report GPQA Diamond and SWE-bench Verified; the classic coding/math benchmarks are saturated and dropped by 2026 cards but still have the most mature harnesses — ideal to bootstrap on.

| Benchmark | Capability | Scoring | Bucket | Role |
|---|---|---|---|---|
| EvalPlus (HumanEval+/MBPP+) | Function synthesis | unit-test pass@1 | NOW | **First vertical + growth carrier** |
| LiveCodeBench | Contamination-free coding | unit-test pass@1 | NOW | Growth carrier |
| BigCodeBench | Library-use coding | unit-test pass@1 (Docker) | NOW | Growth carrier |
| Aider Polyglot | Instructed code edit | test pass + edit-format, 1 retry | NOW | Growth carrier (edit-format bridge) |
| GPQA Diamond | Grad-level science | multiple-choice accuracy | NOW | Comparability anchor (both labs) |
| MMLU-Pro | Broad knowledge | multiple-choice accuracy | NOW | Comparability floor |
| MATH-500 / AIME | Competition math | final-answer match (avg@k) | NOW | Comparability floor |
| GSM8K | Grade-school math | final-answer match | NOW | Smoke-test (saturated) |
| IFEval | Instruction following | deterministic verifiers | NOW | Instruction signal (no judge) |
| SimpleQA | Factuality/hallucination | LLM-judge | NOW | Needs a judge model |
| SWE-bench Verified | Repo issue → patch | % resolved (tests in Docker) | DEFER | **Graduation target** |
| SWE-bench (Full/Lite/Multilingual/Pro) | Repo issue → patch | % resolved | DEFER | Deferred |
| Terminal-Bench, SWE-Lancer, Commit0 | Terminal / repo agency | task tests | DEFER | Deferred |
| WebArena, OSWorld, τ/τ²-bench, BFCL (multi-turn) | Web / computer / tool use | task success | DEFER | Deferred |
| MMMU, ChartQA, ScreenSpot (vision); MRCR, GraphWalks (256K+) | Multimodal / long-context | accuracy | DEFER | Out of reach (text-only KQode) |

---

## Acceptance Examples

- AE1. **Covers R3.** Given no provider is connected, when `kqode --prompt "hello"` runs, then it exits non-zero and prints a clear "no provider configured" message to stderr, with no interactive prompt.
- AE2. **Covers R1, R2.** Given a connected provider, when `kqode --prompt "return the number 4" --json` runs, then stdout is a single JSON object containing the completion text, finish reason, model, and token usage.
- AE3. **Covers R10, R7.** Given EvalPlus is selected with a small limit, when `kqode eval` runs it, then a run directory is written containing a summary with a pass rate and one result entry per task, each graded pass/fail by the EvalPlus harness.
- AE4. **Covers R14.** Given eval mode drives the model, when a benchmark prompt is sent, then the assembled system prompt contains KQode's agent instructions but not live git status, cwd, or memory.
- AE5. **Covers R8.** Given a completed run, when the same benchmark is re-run at the same recorded configuration, then the run reproduces the score within documented sampling variance and both runs are comparable.

---

## Success Criteria

- A developer can run `kqode eval` for EvalPlus and get a saved report with a pass rate, cost, and runtime — a first baseline number — without touching the TUI.
- Re-running the same benchmark at the same config reproduces the score (within documented sampling variance) and is comparable to prior runs over time.
- `kqode --prompt` / `--json` works as a standalone scriptable mode and fails closed when unconfigured.
- The plan cleanly separates general no-tool benchmarks (now) from tool-requiring benchmarks (deferred, SWE-bench Verified as the named graduation target) and reconciles the existing eval spec.
- A downstream implementer can build the first vertical without inventing product behavior: benchmark choice, prompt mode, report contents, selection UX, and safety posture are all specified.

---

## Scope Boundaries

- **Deferred — tool-requiring benchmarks:** the entire agentic set (SWE-bench family, Terminal-Bench, SWE-Lancer, WebArena/OSWorld, τ/τ²-bench, Commit0, BFCL multi-turn) waits until VFS + sandbox exist. SWE-bench Verified is the graduation target.
- **Deferred — breadth accelerator:** Approach C (KQode as an OpenAI-compatible server pointed at `lm-evaluation-harness`) is recorded for later to light up the MCQ/string long tail cheaply, but is not built now.
- **Out of reach:** vision benchmarks (MMMU, ChartQA, ScreenSpot) and 256K+-context benchmarks (MRCR, GraphWalks) — a text-only KQode + provider window cannot run them.
- **Not this work:** the harness-focused eval layers (deterministic tool tests, local golden tasks, safety/replay/multi-agent) remain the separate existing eval-spec track.
- **Not building now:** execution-feedback/self-repair loops — this work only ensures the runner can accommodate them later (growth carriers).
- **Not claimed:** frontier-comparable absolute scores. KQode's numbers are harness-specific (both system cards warn scores are not cross-comparable); they are tracked over time against KQode itself and positioned against published ranges.

---

## Key Decisions

- **Approach B (native `kqode eval` runner)** over an external Python script (A) or an OpenAI-compatible server (C): eval becomes a real KQode surface with native reports, and the growth-carrier rerun is an in-loop addition.
- **Standalone `--prompt` / `--json` headless mode** is included alongside the runner (user-requested) and is the shared non-interactive foundation both the runner and scripting use.
- **Coding-first with EvalPlus** as the first vertical: KQode's identity number and a growth carrier, over the cheaper reasoning anchor (GPQA).
- **Report KQode-as-shipped minus environment noise** (not a neutral eval prompt): the number reflects real behavior and moves as KQode improves, accepting reduced frontier-card comparability.
- **Pull general no-tool benchmarks earlier** than the existing eval-spec sequence, as a distinct provider/model baseline layer.
- **Strategy: comparability floor + growth carriers** — general benchmarks give a frontier-positioned floor; code-execution benchmarks are built to rise as tools land.

---

## Dependencies / Assumptions

- Python is available to run official graders (EvalPlus, etc.), matching the project's "Python only for benchmark/eval adapters" stance.
- Benchmark datasets/harnesses are obtained and version-pinned for reproducibility (vendored or fetched-and-pinned).
- A provider (Kimi/OpenAI-compatible) is connected and within context limits for the chosen benchmarks.
- Grading executes untrusted model-written code and must be isolated (container/sandbox) on the eval machine.
- Cross-lab score comparability is not assumed — both system cards state scores are harness-specific.
- Verified against the codebase: no non-interactive CLI mode exists today (`main.rs` accepts only `--backend`); no tool system/VFS/sandbox exists; the turn machinery injects system prompt + live git status + memory (`src/chat/turn.rs`).

---

## Outstanding Questions

### Resolve Before Planning

- (none — all product decisions were resolved in the brainstorm.)

### Deferred to Planning

- [Affects R5, R9][Technical] Where the runner lives in the crate layout (a module in the current root crate now vs. the planned `kqode-eval` crate) and how the CLI arg surface grows (`--prompt` flag + `eval` subcommand) — settle against current code shape.
- [Affects R7][Technical] Exact run-artifact schema and directory naming vs. the existing eval-spec shape — align during planning.
- [Affects R10][Needs research] Precise EvalPlus integration contract (completion JSONL format, invocation, container-isolation flags, dataset version pinning) — validate against the current EvalPlus release.
- [Affects R15][Technical] How to expose sampling controls (temperature/seed/sample count) through the eval-mode request path (the provider request currently carries only messages + model).
- [Affects R14][Technical] Exact mechanism to strip environment noise from the system prompt in eval mode.
