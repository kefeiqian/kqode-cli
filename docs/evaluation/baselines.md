# KQode evaluation baselines

Committed record of KQode's public **no-tool** benchmark scores over time — the
comparability floor described as Layer 1b in
[`../kqode_evaluation_spec.md`](../kqode_evaluation_spec.md).

These numbers measure raw provider/model coding capability with **no KQode tools,
sandbox, or plugins** in the loop. They are the floor we expect to **rise** as
those systems land; the lift above this baseline is the harness's contribution.
Do not read the baseline as harness quality.

## Where the results live

Two tiers:

- **Raw run truth** — `~/.kqode/eval/<run-id>/` (machine-local, not committed).
  Each run writes `samples.jsonl`, `samples-sanitized.jsonl`,
  `samples-sanitized_eval_results.json`, `results.jsonl`, `summary.json`, and
  `summary.md`. Bulky and reproducible; kept out of the repo.
- **This file** — the curated, committed summary. One row per benchmark run,
  linked to its `run-id` so the raw artifacts can be found.

Baseline runs are written under a stable `~/.kqode/eval/baseline/` directory.

## How to reproduce

```bash
# Both benchmarks (HumanEval+ and MBPP+), full sets, into the baseline dir:
kqode eval evalplus --out ~/.kqode/eval/baseline
# Or one at a time:
kqode eval humaneval+ --out ~/.kqode/eval/baseline
kqode eval mbpp+ --out ~/.kqode/eval/baseline
# Smaller smoke / calibration:
kqode eval evalplus --limit 10 --out ~/.kqode/eval/calib

# Dev wrapper (same behavior, forwards to the kqode binary):
cargo xtask eval evalplus --out ~/.kqode/eval/baseline
```

Read `summary.md` (or `summary.json`) in each run dir for the numbers, then add a
row below.

## Methodology and caveats

- **Grader:** the official EvalPlus harness, pinned by digest
  `ganler/evalplus@sha256:26b118098bef281fe8dfe999bf05f1d5b45374b4e6c00161ec0f30592aef4740`,
  run container-isolated (network off, read-only root, dropped capabilities,
  cpu/mem/pid/wall-clock limits). Grading never runs in-process.
- **`pass@1 (plus)`** — the augmented-test pass rate — is the primary signal;
  `pass@1 (base)` (original tests) is shown alongside.
- **Sampling variance:** the active `kimi-k2.7-code` model is thinking-mode-only
  and locks sampling (rejects `seed` and any non-default `temperature`), so eval
  sends provider-default sampling. Single-run `pass@1` is therefore an estimate
  carrying sampling variance, **not** an exact reproducible constant. Treat small
  run-to-run differences as noise, not signal.
- Every row records the KQode commit and model so scores stay comparable as the
  harness grows.

## Baseline log

Newest first. `Tasks` is `driven/total` (metrics are computed over the driven
subset; every task id is still written for the grader's full-coverage assertion).

| Date | KQode commit | Provider / model | Benchmark | Tasks | pass@1 (base) | pass@1 (plus) | Run id |
|------|--------------|------------------|-----------|-------|---------------|---------------|--------|
| 2026-07-12 | `1c32e0d8` | kimi / kimi-k2.7-code | humaneval+ | 164/164 | 0.976 | **0.921** | `20260712T154729-6c2d50` |
| 2026-07-12 | `1c32e0d8` | kimi / kimi-k2.7-code | mbpp+ | 378/378 | 0.973 | **0.833** | `20260712T163250-a883c0` |

**First baseline (2026-07-12)** — the no-tool floor on `kimi-k2.7-code`:
HumanEval+ **92.1%** / MBPP+ **83.3%** (plus). The `plus` rate sits well below
`base` (97.6% / 97.4%) because EvalPlus's augmented tests catch edge cases the
original tests miss. Run cost ~0.18M input + ~0.33M output tokens ≈ **¥10 CNY
(~$1.40)**, ~2.2 h wall-clock. This is the number to beat as tools, sandbox, and
plugins land.
