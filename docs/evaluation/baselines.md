# KQode evaluation baselines

Committed record of KQode's public evaluation baselines over time:

- **No-tool provider/model scores** — the comparability floor described as Layer
  1b in [`../kqode_evaluation_spec.md`](../kqode_evaluation_spec.md).
- **Tooling benchmark readiness** — the pre-tool baseline for external
  tool/sandbox benchmarks, recorded before KQode can run those agentic suites.

The no-tool numbers measure raw provider/model coding capability with **no KQode
tools, sandbox, or plugins** in the loop. They are the provider/model floor, not
the main scorecard for tool use or sandbox quality. Tool-enabled EvalPlus runs
may show a small self-check/repair lift, but these tasks are already compact and
saturated; the real harness signal belongs in local golden tasks and agentic
repository benchmarks. Do not read this baseline as harness quality.

## Where the results live

Two tiers:

- **Raw run truth** — `~/.kqode/eval/<run-id>/` (machine-local, not committed).
  Each run writes `samples.jsonl`, `samples-sanitized.jsonl`,
  `samples-sanitized_eval_results.json`, `results.jsonl`, `summary.json`, and
  `summary.md`. Bulky and reproducible; kept out of the repo.
- **This file** — the curated, committed summary. Runnable benchmark rows link
  to their `run-id` so the raw artifacts can be found. Not-runnable rows record
  the source-backed readiness state that blocks a real score.

Baseline runs are written under a stable `~/.kqode/eval/baseline/` directory.

## Benchmark tracks

### No-tool EvalPlus benchmarks

KQode currently records two EvalPlus Python code-generation benchmarks:

- **HumanEval+** — the EvalPlus-augmented version of OpenAI HumanEval. It grades
  164 function-completion problems where the model must write a Python function
  from a signature, docstring, and examples. It is a compact signal for
  algorithmic correctness and edge-case handling.
- **MBPP+** — the EvalPlus-augmented version of Mostly Basic Python Problems.
  It grades 378 short Python programming tasks in this harness, covering a
  broader spread of everyday list, string, math, and data-structure exercises.
  It complements HumanEval+ with more varied, beginner-to-intermediate tasks.

For both benchmarks, EvalPlus reports the original test-suite score as `base`
and the stricter augmented-test score as `plus`. KQode treats `pass@1 (plus)` as
the primary baseline signal because it catches solutions that only satisfy the
original examples or under-specified edge cases.

These benchmarks are intentionally **not** the primary tooling benchmark. They
mostly test one-shot Python synthesis, so adding file tools and sandboxed shell
execution should not be expected to move the score dramatically. Tooling quality
should be measured with tasks that require reading files, editing a repository,
running checks, recovering from tool errors, and respecting policy.

### External tool/sandbox benchmarks

KQode's external tooling benchmark path is captured in
[`../research/2026-07-13-agentic-tool-benchmark-selection.md`](../research/2026-07-13-agentic-tool-benchmark-selection.md):

- **Terminal-Bench smoke subset** — first external tool/sandbox baseline once
  KQode has a shell tool and sandbox-lite execution loop.
- **SWE-bench Lite development subset** — first external repository-editing
  baseline once KQode has read/search/edit, VFS apply, shell checks, and trace
  artifacts.
- **SWE-bench Verified** — later public graduation target after local and Lite
  runs are stable.

Before those capabilities exist, the truthful baseline score is **not
runnable**, not `0%`: KQode has no opportunity to attempt the tasks yet. The
first comparable score will be the earliest tool-enabled run on the fixed subset,
then reruns after each tool, VFS, sandbox, policy, context, and recovery
milestone.

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

The external tool/sandbox rows are not runnable yet. Their current status is
source-backed: `src/eval/benchmark.rs` only exposes HumanEval+/MBPP+, and the
tool registry, VFS edit loop, sandbox-lite shell execution, and benchmark
adapters needed for Terminal-Bench / SWE-bench Lite are still planned systems.

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
- Every runnable row records the KQode commit and model so scores stay
  comparable as the harness grows. Not-runnable rows record the blocking
  capability gap instead.

## No-tool baseline log

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
(~$1.40)**, ~2.2 h wall-clock. This is the floor to compare against, not the
primary score to optimize once tools, sandbox, and plugins land.

## External tool/sandbox baseline log

Newest first. `Tasks` is `attempted/available` when a suite is runnable. Rows
with `0/0` are readiness baselines: KQode cannot yet drive that benchmark, so
the status is the baseline to compare against when the first adapter lands.

| Date | KQode commit | Benchmark | Subset | Tasks | Score / status | Evidence |
|------|--------------|-----------|--------|-------|----------------|----------|
| 2026-07-13 | `e407914` | Terminal-Bench | smoke subset (TBD) | 0/0 | **not runnable** — missing KQode tool registry, shell tool, sandbox-lite execution loop, and adapter | `src/eval/benchmark.rs`; [`../research/2026-07-13-agentic-tool-benchmark-selection.md`](../research/2026-07-13-agentic-tool-benchmark-selection.md) |
| 2026-07-13 | `e407914` | SWE-bench Lite | development subset (TBD) | 0/0 | **not runnable** — missing repository edit loop, VFS apply path, shell checks, trace artifacts, and adapter | `src/eval/benchmark.rs`; [`../research/2026-07-13-agentic-tool-benchmark-selection.md`](../research/2026-07-13-agentic-tool-benchmark-selection.md) |

**Next milestone:** implement the first headless tool-loop slice before trying
to move either external score. The initial slice should prove
`read_file` -> `complete_task` with a fake provider and typed tool results; file
writes, patch application, shell execution, policy approvals, and benchmark
adapters come after that loop is deterministic.
