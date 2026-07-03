---
name: kqode-version-bump
description: "Interactively bump the KQode product version. Use when asked to bump/release a new version, cut a release, or change the version number. Shows the current version, asks whether to bump major/minor/patch (or a custom version), runs `cargo xtask set-version` to update every manifest in lockstep, commits and tags the release, then offers to push (triggering the release pipeline) and publish to npm, and prints the GitHub Release and npm links."
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

### 4. Commit and tag the release (automatic)

The version must equal the release tag, so create both automatically after a
successful bump — no confirmation needed for the local commit and tag. First
make sure the working tree contains only the bump's changes, then commit and
tag:

```bash
git commit -am "chore: release v<chosen-version>"
git tag v<chosen-version>
```

If the tag `v<chosen-version>` already exists, stop and report it instead of
moving it.

### 5. Ask whether to push (triggers the release pipeline)

Use the ask_user tool: "Push the release commit and tag `v<chosen-version>` now
to trigger the release pipeline?" Do not push without explicit confirmation. If
the user declines, print the commands below and stop.

```bash
git push origin HEAD
git push origin v<chosen-version>
```

Pushing the `v*` tag triggers `release.yml`, which builds the standalone
executables for every target and creates/updates the GitHub Release with the
archives and checksums. Watch it to success (`gh run watch <run-id> --exit-status`)
before the npm step.

### 6. Publish to npm (separate, confirmed step)

`release.yml` does NOT publish to npm, and a GitHub Release created by its
`GITHUB_TOKEN` does not re-fire the `release: published` event — so npm keeps
serving the old version until `npm-publish.yml` runs. Because the npm package's
postinstall downloads the tag's release archive, publish to npm only AFTER
`release.yml` has finished uploading that tag's assets.

Once the release run has succeeded, ask the user whether to publish to npm. On
confirmation, dispatch the workflow (OIDC Trusted Publishing — no token) and
watch it:

```bash
gh workflow run npm-publish.yml -f tag=v<chosen-version>
gh run watch <run-id> --exit-status
```

### 7. Show the release and npm links

Report the new-version links (get the release URL from `gh`, and use the stable
npm package name `@kqode/kqode-cli`):

```bash
gh release view v<chosen-version> --json url -q .url
# npm: https://www.npmjs.com/package/@kqode/kqode-cli/v/<chosen-version>
```

The npm link only resolves after `npm-publish.yml` succeeds; verify with
`npm view @kqode/kqode-cli version` (or the registry JSON) if in doubt.

## Rules

- Never hand-edit version fields; always go through `cargo xtask set-version`.
- Show the current version and the concrete resulting version for every choice.
- Do not choose the bump type for the user; ask and wait.
- Create the release commit and tag automatically, but never push or publish to
  npm without explicit user confirmation.
- Keep the git tag equal to the new version (`v<version>`), or `kqode --version`
  will not match the published npm/release version.
- Publish npm only after `release.yml` has uploaded the tag's archives, and only
  via `npm-publish.yml` (never `npm publish` by hand). See
  `docs/release/kqode_distribution_registration.md`.
