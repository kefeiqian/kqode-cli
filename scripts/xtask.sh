#!/usr/bin/env bash
# Parallel-safe launcher for KQode xtask commands.
#
# `cargo xtask <cmd>` expands to `cargo run -p xtask`, which relinks the single
# shared `target/debug/xtask` binary on every call. A long-running command such
# as `blog-serve` or `tui-dev` keeps that binary locked (notably on Windows), so
# a second invocation fails to replace it. This launcher builds xtask once, then
# runs a unique per-invocation copy under `target/debug/xtask-run/`, leaving the
# canonical binary free so any number of xtask commands can run in parallel.
#
# `repo_root()` inside xtask is baked in at compile time (CARGO_MANIFEST_DIR), so
# a relocated copy still resolves the real repository.
#
# Usage:
#   ./scripts/xtask.sh blog-serve
#   ./scripts/xtask.sh tui-dev
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(dirname "$script_dir")"

(cd "$repo_root" && cargo build -p xtask)

target_dir="${CARGO_TARGET_DIR:-$repo_root/target}"
# A relative CARGO_TARGET_DIR is resolved by cargo against the build cwd (repo root), so anchor it there too.
[[ "$target_dir" = /* ]] || target_dir="$repo_root/$target_dir"
source_exe="$target_dir/debug/xtask"
if [[ ! -x "$source_exe" ]]; then
    echo "xtask binary not found at $source_exe" >&2
    exit 1
fi

run_dir="$target_dir/debug/xtask-run"
mkdir -p "$run_dir"

# Best-effort prune of copies left by earlier crashed runs.
find "$run_dir" -maxdepth 1 -type f -mtime +1 -delete 2>/dev/null || true

command_label="$(printf '%s' "${1:-help}" | tr -cd '[:alnum:]-')"
copy_exe="$run_dir/$$-${command_label}-$RANDOM"
cp "$source_exe" "$copy_exe"
chmod +x "$copy_exe"

cleanup() { rm -f "$copy_exe"; }
trap cleanup EXIT

code=0
# ${1+"$@"} forwards args verbatim, but expands to nothing when none are given
# so `set -u` does not abort on bash < 4.4 (e.g. macOS's stock bash 3.2).
"$copy_exe" ${1+"$@"} || code=$?
exit "$code"
