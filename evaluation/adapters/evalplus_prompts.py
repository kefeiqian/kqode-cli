#!/usr/bin/env python3
"""Dump EvalPlus task prompts as JSONL for the KQode eval runner.

Runs inside the ``ganler/evalplus`` image (datasets baked in, so it works with
``--network none``); the Rust eval runner mounts this file into the container
and reads the emitted JSONL on stdout. Each line is ``{"task_id", "prompt"}``.

Usage::

    python evalplus_prompts.py --dataset humaneval [--limit N]
"""

import argparse
import json
import sys


def load(dataset):
    if dataset == "humaneval":
        from evalplus.data import get_human_eval_plus as getter
    else:
        from evalplus.data import get_mbpp_plus as getter
    return getter()


def main():
    parser = argparse.ArgumentParser(description="Dump EvalPlus prompts as JSONL.")
    parser.add_argument("--dataset", choices=["humaneval", "mbpp"], required=True)
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Emit only the first N tasks (0 = all).",
    )
    args = parser.parse_args()

    items = list(load(args.dataset).items())
    if args.limit > 0:
        items = items[: args.limit]

    for task_id, data in items:
        json.dump({"task_id": task_id, "prompt": data["prompt"]}, sys.stdout)
        sys.stdout.write("\n")


if __name__ == "__main__":
    main()
