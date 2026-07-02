---
name: kqode-version-bump
description: "Interactively bump the KQode product version. Use when asked to bump/release a new version, cut a release, or change the version number. Shows the current version, asks whether to bump major/minor/patch (or a custom version), then runs `cargo xtask set-version` to update every manifest in lockstep."
---

# KQode Version Bump

Interactively raise the KQode product version. This skill only chooses the new
version and delegates the actual writes to `cargo xtask set-version`, which is the
single source of truth for which files change (root `Cargo.toml`,
`xtask/Cargo.toml`, `packaging/npm/kqode/package.json`, `tui/package.json`, and
`Cargo.lock`). Do not hand-edit version fields.

## Workflow

### 1. Read the current version and candidates

Run the helper (works from any cwd; it locates the repo root itself):

```bash
python .agents/skills/kqode-version-bump/scripts/version_options.py
```

It prints JSON, for example:

```json
{ "current": "0.1.0", "major": "1.0.0", "minor": "0.2.0", "patch": "0.1.1" }
```

If it errors (no repo root, or a non-`MAJOR.MINOR.PATCH` current version), report
the message and stop.

### 2. Ask the user which bump to apply

Use the ask_user tool. State the current version in the question and offer the
three computed candidates plus a custom option, each labelled with its resulting
version, for example:

- `patch → 0.1.1` (backwards-compatible fixes)
- `minor → 0.2.0` (backwards-compatible features)
- `major → 1.0.0` (breaking changes)

Always show the concrete resulting version for each choice (read them from the
helper output, do not compute them yourself). Allow a custom
`MAJOR.MINOR.PATCH` value. Do not guess the bump type — wait for the user.

### 3. Apply the bump

Run the xtask command with the chosen version:

```bash
cargo xtask set-version <chosen-version>
```

Report the files it changed (the command prints each one). If the command fails
(for example an invalid version), surface the error and stop.

### 4. Remind about commit and tag

The version must equal the release tag. After a successful bump, tell the user
the next steps (offer to do them, but do not tag without confirmation):

```bash
git commit -am "chore: release v<chosen-version>"
git tag v<chosen-version> && git push origin v<chosen-version>
```

The tag drives `release.yml` (archives + GitHub Release) and `npm-publish.yml`
(npm version). See `docs/release/kqode_distribution_registration.md`.

## Rules

- Never hand-edit version fields; always go through `cargo xtask set-version`.
- Show the current version and the concrete resulting version for every choice.
- Do not choose the bump type for the user; ask and wait.
- Keep the git tag equal to the new version (`v<version>`), or `kqode --version`
  will not match the published npm/release version.
- Do not create the tag or push without explicit user confirmation.
