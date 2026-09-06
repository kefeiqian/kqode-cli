# KQode Golden Set

This directory is a native [Harbor](https://github.com/harbor-framework/harbor) local dataset for evaluating KQode's first model-facing tools. Other coding agents can run the outcome checks only if their Harbor adapter also emits the normalized tool events required by this dataset. The layout follows Harbor task schema `1.4`, verified against Harbor commit `c29f416af4b02ef593d6874f88b59d38bf164646` from 2026-09-05.

## Run with Harbor

From the KQode repository root:

```powershell
harbor run `
  --path evaluation\golden\tasks `
  --agent "<agent>" `
  --model "<model>" `
  --jobs-dir target\harbor-jobs
```

The equivalent short form is:

```powershell
harbor run -p evaluation\golden\tasks -a "<agent>" -m "<model>" -o target\harbor-jobs
```

Harbor can import the dataset directly because every child of `tasks/` is a self-contained Harbor task. No KQode-specific dataset adapter is required.

Compatibility was exercised with Harbor `0.22.0` on 2026-09-06. All 25 Oracle trials received `task_success=1`; all 25 NOP trials received `task_success=0`.

Running the dataset specifically with KQode additionally requires a Harbor custom agent integration. KQode does not yet expose the required headless coding-agent CLI, so `--agent kqode` is not available yet. Once the headless CLI exists, add a `BaseInstalledAgent` adapter and invoke it with Harbor's `module.path:ClassName` syntax.

## Harbor Task Layout

Each task uses Harbor's native structure:

```text
tasks/<task-id>/
  instruction.md
  task.toml
  environment/
    Dockerfile
    <fixture files>
  tests/
    test.sh
    <hidden verifier files>
  solution/
    solve.sh
```

- `instruction.md` is the only task instruction passed to the Agent.
- `task.toml` uses Harbor schema `1.4`.
- `environment/` builds the isolated Linux workspace.
- `tests/` is uploaded after the Agent finishes and writes Harbor rewards.
- `solution/` is optional and is used only by Harbor's Oracle agent.

Do not add a parallel KQode task manifest or schema. Task metadata, timeouts, resources, network policy, artifacts, verifier configuration, and package identity belong in `task.toml`.

## Dataset Contract

Golden tasks must be:

- independent and self-contained;
- reproducible without access to the KQode working tree;
- isolated in a Harbor container;
- independent of public network access;
- verifiable without an LLM judge where practical;
- safe to execute repeatedly;
- pinned to explicit toolchain and dependency versions;
- free of secrets and production service dependencies.

The Agent must not receive `tests/` or `solution/` before its run. Harbor owns that separation: it uploads shared verifier files after the Agent completes and copies `solution/` only for Oracle runs.

## Reward Contract

Every Linux task provides `tests/test.sh`. The verifier must always write:

```text
/logs/verifier/reward.json
```

Use numeric values so Harbor can aggregate them:

```json
{
  "task_success": 1,
  "tests_passed": 1,
  "policy_compliance": 1
}
```

`task_success` is the primary binary reward. Additional labeled rewards diagnose why a run succeeded or failed; they must not turn a failed required check into a pass.

Verifier scripts must avoid `set -e` paths that exit before writing a reward. Capture failures, emit diagnostic output, write zero-valued rewards, and then exit nonzero.

## Task Lifecycle

Lifecycle state is tracked in [catalog.md](catalog.md), not in Harbor task configuration:

| State | Meaning |
|---|---|
| `planned` | Task idea only; no Harbor directory exists |
| `candidate` | Native Harbor task exists but has not completed acceptance |
| `active` | Oracle, no-op, and repeatability checks pass |
| `retired` | Kept for history but excluded from current suites |

A candidate becomes active only after:

1. `harbor run -p evaluation/golden/tasks -a oracle` succeeds three times.
2. A no-op or intentionally failing agent receives zero reward three times.
3. The task succeeds in a network-enforcing CI sandbox with `no-network`.
4. Hidden tests are unavailable during the Agent phase.
5. Repeated runs produce equivalent rewards.
6. The task has a documented failure category.

Harbor 0.22's local Docker provider on Windows does not advertise enforced `no-network` support and rejects tasks that request it. Local task definitions therefore omit `network_mode`; they must not download dependencies or call external services. Release evaluation should use a Harbor environment provider that can enforce network isolation.

## Initial Dataset

The initial dataset contains 25 candidate tasks:

- 19 tasks targeting `run_command`;
- 3 tasks targeting `fetch_web_url`;
- 3 tasks targeting `ask_user`.

The `run_command` group covers the first-version read-only command surface: current directory, directory listing, globbing, grep, file reading, file metadata, read-only Git inspection, and Rust/Cargo environment inspection. This creates a baseline before KQode introduces dedicated read-only tools.

Every verifier checks both the requested output and a tool event in:

```text
/logs/agent/tool-events.jsonl
```

The future KQode Harbor adapter must write real tool-call events there. Oracle solutions write equivalent synthetic events only to validate task construction. See [catalog.md](catalog.md) for the complete task list and suite groupings.

## KQode Agent Integration

Harbor recommends `BaseInstalledAgent` when the evaluated CLI runs inside the task container. The future adapter should:

1. install or upload a pinned KQode headless binary;
2. run KQode in the Harbor task working directory;
3. pass Harbor's instruction as user input;
4. map Harbor timeout and cancellation to KQode;
5. write KQode trajectory and usage data under `/logs/agent/`;
6. write normalized tool events to `/logs/agent/tool-events.jsonl`;
7. bridge `ask_user` to Harbor's deterministic simulated-user input;
8. return without running the verifier itself.

The adapter should remain outside individual tasks. Tasks describe the problem and environment; the adapter describes how Harbor invokes KQode.

## References

- Harbor task overview: `instruction.md`, `task.toml`, `environment/`, `tests/`, and optional `solution/`.
- Harbor local datasets: `harbor run --path <dataset> --agent <agent> --model <model>`.
- Harbor verifier contract: `tests/test.sh` writes `/logs/verifier/reward.txt` or `/logs/verifier/reward.json`.
- Harbor custom agents: use `BaseInstalledAgent` where the CLI runs inside the task environment.
