---
date: 2026-07-13
topic: agentic-tool-benchmark-selection
question: "Which external benchmarks should KQode use to baseline tool, sandbox, and repository-editing capability?"
status: complete
---

# Agentic Tool Benchmark Selection

## Summary

KQode should not use HumanEval+/MBPP+ as the main tooling scorecard. They remain
the no-tool provider/model floor. For external tooling evaluation, the strongest
path is:

1. **Terminal-Bench smoke track** for the first external tool/sandbox baseline.
2. **SWE-bench Lite** for the first repository-editing benchmark.
3. **SWE-bench Verified** as the public graduation target.
4. **Aider Polyglot** and **SWE-bench Multilingual** later, when cross-language
   editing matters.

Before KQode has a real tool loop, the honest baseline is "adapter blocked / not
runnable" rather than a performance score. The first comparable performance
baseline should be the earliest tool-enabled run on a fixed subset, then rerun
after each VFS, sandbox, policy, context, and recovery milestone.

## Sources checked

- SWE-bench leaderboard and dataset overview: Verified is 500 instances, Lite
  is 300, Multilingual is 300, Multimodal is 517, and the reported metric is
  `% Resolved`.[^swe-leaderboard]
- SWE-bench overview: tasks require generating a patch for a real GitHub issue;
  the ecosystem includes SWE-bench, Lite, Verified, and Multimodal.[^swe-docs]
- SWE-bench Lite page: Lite is 300 lower-cost tasks, selected to preserve
  quality while improving iteration speed; it also has 23 development
  instances.[^swe-lite]
- SWE-bench Verified page: Verified is a human-filtered 500-task subset where
  annotators checked clarity, test correctness, and solvability.[^swe-verified]
- SWE-bench Multilingual page: Multilingual has 300 tasks across 9 languages,
  including Go, JavaScript/TypeScript, and Rust.[^swe-multilingual]
- Terminal-Bench repository: Terminal-Bench evaluates AI agents in real terminal
  environments; each task has English instructions, a test script, and an oracle
  solution; the benchmark is beta with roughly 100 tasks and a sandboxed
  terminal harness.[^terminal-bench]
- Aider leaderboard and Polyglot post: Aider Polyglot tests 225 difficult
  Exercism tasks across C++, Go, Java, JavaScript, Python, and Rust.[^aider-leaderboard]
  [^aider-polyglot]

## Fit matrix

| Benchmark | Primary signal | Fit for KQode | When to adopt |
|---|---|---|---|
| Terminal-Bench | Shell/tool use in sandboxed terminal tasks | Best external signal for the sandbox-lite + shell-tool loop | First external tool baseline after a shell tool and execution sandbox exist |
| SWE-bench Lite | Real GitHub issue repair with lower cost | Best first repository-editing public benchmark | After file read/edit, VFS apply, shell checks, and trace artifacts are stable on local tasks |
| SWE-bench Verified | Curated real-issue repair | Best public headline metric | After Lite/local results are stable enough that full runs are worth the cost |
| Aider Polyglot | Cross-language edit success | Useful for polyglot editing breadth | After KQode supports robust patching and language-agnostic repo context |
| SWE-bench Multilingual | Real repo edits across 9 languages | Useful once Rust/JS/TS public coverage matters | After Python SWE-bench adapter is reliable |

## Recommendation for KQode

Start with **external benchmark research now**, but do not jump straight to a
full public score. KQode does not yet have the tool registry, VFS, sandbox, or
agent loop that these benchmarks assume, so a numeric pre-tool score would be
misleading.

The next durable step is to define an **external tooling baseline track**:

- **Terminal-Bench smoke subset**: fixed small subset, e.g. 5-10 tasks, to
  measure whether KQode can follow instructions, run shell commands, inspect
  files, recover from command failures, and respect sandbox limits.
- **SWE-bench Lite development subset**: fixed small subset from the 23 dev
  instances first, then a 10-task Lite slice, to measure repository editing and
  test-driven repair.
- **Report shape**: one committed summary row per run with benchmark, subset,
  KQode commit, provider/model, pass or resolved rate, runtime, cost, tool calls,
  approvals, sandbox failures, and failure category distribution.

Record the current pre-tool state as **not runnable: missing agent tool loop**,
not as failure noise. Once the first tool loop exists, run the same fixed subset
as the **first true tooling baseline**. Rerun it after each major improvement so
the delta reflects KQode's harness contribution.

## Evidence gaps before implementation

- Terminal-Bench task selection needs a quick pass over the task registry to pick
  a deterministic smoke subset with low setup cost and no network requirement.
- SWE-bench Lite adapter design should confirm whether KQode uses the official
  harness directly or emits benchmark-compatible predictions for an external
  runner.
- KQode should keep local golden tasks first in the engineering loop; public
  benchmarks are too slow and noisy to debug every tool-registry regression.

[^swe-leaderboard]: SWE-bench leaderboard, `https://www.swebench.com/`.
[^swe-docs]: SWE-bench documentation, `https://www.swebench.com/SWE-bench/`.
[^swe-lite]: SWE-bench Lite overview, `https://www.swebench.com/lite.html`.
[^swe-verified]: SWE-bench Verified overview, `https://www.swebench.com/verified.html`.
[^swe-multilingual]: SWE-bench Multilingual overview, `https://www.swebench.com/multilingual-leaderboard.html`.
[^terminal-bench]: Terminal-Bench repository README, `https://github.com/harbor-framework/terminal-bench`.
[^aider-leaderboard]: Aider LLM leaderboards, `https://aider.chat/docs/leaderboards/`.
[^aider-polyglot]: Aider Polyglot benchmark post, `https://aider.chat/2024/12/21/polyglot.html`.
