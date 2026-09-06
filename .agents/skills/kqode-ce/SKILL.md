---
name: kqode-ce
description: Shadow the official EveryInc Compound Engineering plugin without installing it. Use when explicitly invoked as /kqode-ce followed by a Compound Engineering command such as brainstorm, plan, work, code-review, debug, compound, or lfg. Synchronizes the upstream repository under the current repository's .kqode-dev directory before loading and following the requested upstream skill.
---

# KQode Compound Engineering

Forward an explicit subcommand to the matching skill in the official
`EveryInc/compound-engineering-plugin` checkout. Do not install or register the
upstream plugin.

## Dispatch

1. Treat the first invocation token as the subcommand and preserve all
   remaining text as the upstream skill's arguments.
2. Require a subcommand. If none is present, run the sync script with `--list`
   and show the available short command names.
3. Run `scripts/sync_plugin.py <subcommand>` with Python. Resolve the script
   relative to this `SKILL.md`; do not copy it into another location.
4. Parse the JSON printed by the script. It contains the synchronized commit
   and the absolute `skill_file` to dispatch.
5. Read the complete upstream `skill_file`. Treat its containing directory as
   the upstream skill root, so every relative `references/`, `scripts/`, or
   asset path resolves from there.
6. Follow the upstream skill as the active workflow, passing the preserved
   trailing text as its invocation arguments. Its interaction, tool, artifact,
   validation, and completion rules take precedence over this wrapper's
   generic instructions.

## Command Mapping

- `brainstorm` maps to `skills/ce-brainstorm/SKILL.md`.
- Any ordinary `<name>` maps to `skills/ce-<name>/SKILL.md`.
- An already-prefixed `ce-<name>` remains unchanged.
- `lfg` maps to `skills/lfg/SKILL.md`.

Never dispatch a path supplied by the user. The sync script validates the
subcommand and requires the resolved skill to exist inside the synchronized
checkout.

## Synchronization Contract

The script owns `<repo-root>/.kqode-dev/compound-engineering-plugin` and:

- resolves `<repo-root>` from this repository-level skill;
- clones the official HTTPS repository when absent;
- verifies an existing checkout still points to the official repository;
- fetches the remote default branch on every invocation;
- hard-resets tracked state when the checkout commit is stale or modified;
- leaves the upstream plugin uninstalled.

If synchronization or validation fails, report the error and stop. Do not use a
stale checkout, reconstruct an upstream workflow from memory, or silently fall
back to a similarly named local skill.
