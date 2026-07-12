#!/usr/bin/env bash
# Run the EvalPlus grader container from the KQode repo root.
#
# Thin wrapper around `docker compose -f evaluation/compose.yaml run` that grades
# a completed `samples.jsonl` inside the isolated, container-only EvalPlus grader
# (plan U6 / requirement R16 — untrusted model code never runs on the host).
# Resolves the repo root itself, so it works from any directory.
#
# The eval runner (`kqode eval`) invokes this same compose file directly; this
# script exists for the Phase 2 feasibility spike and manual grading. Native
# grading needs a Linux container: EvalPlus's sandbox imports Python's Unix-only
# `resource` module.
#
# Usage:
#   ./scripts/eval-grade.sh --run-dir ~/.kqode/eval/spike [--dataset humaneval|mbpp]
#                           [--samples samples.jsonl] [--image <ref>] [-- <extra evalplus args>]
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(dirname "$script_dir")"
compose_file="$repo_root/evaluation/compose.yaml"

run_dir=""
dataset="humaneval"
samples="samples.jsonl"
image=""
extra=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --run-dir)  run_dir="$2"; shift 2 ;;
        --dataset)  dataset="$2"; shift 2 ;;
        --samples)  samples="$2"; shift 2 ;;
        --image)    image="$2"; shift 2 ;;
        --)         shift; extra=("$@"); break ;;
        *) echo "unknown argument: $1" >&2; exit 1 ;;
    esac
done

if [[ ! -f "$compose_file" ]]; then
    echo "compose file not found at $compose_file" >&2
    exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
    echo "docker not found on PATH. Install Docker (or Docker Desktop) first." >&2
    exit 1
fi
if [[ -z "$run_dir" ]]; then
    echo "--run-dir is required (directory holding $samples)" >&2
    exit 1
fi
if [[ ! -d "$run_dir" ]]; then
    echo "run dir not found: $run_dir" >&2
    exit 1
fi

# Absolute path so the container mount can't point at the wrong directory.
run_dir="$(cd "$run_dir" && pwd)"
samples_path="$run_dir/$samples"
if [[ ! -f "$samples_path" ]]; then
    echo "samples file not found: $samples_path (write it before grading)" >&2
    exit 1
fi

# The compose file reads EVAL_RUN_DIR (the only writable mount) and EVALPLUS_IMAGE.
export EVAL_RUN_DIR="$run_dir"
[[ -n "$image" ]] && export EVALPLUS_IMAGE="$image"

echo "Grading $dataset from $samples_path (container-only, isolated)..."
exec docker compose -f "$compose_file" run --rm grader \
    evalplus.evaluate --dataset "$dataset" --samples "/work/$samples" "${extra[@]}"
