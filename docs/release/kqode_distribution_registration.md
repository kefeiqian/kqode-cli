# KQode distribution registration guide

This guide walks a maintainer through publishing the standalone `kqode` executable
through the four supported channels: **GitHub Release direct download**, **npm
global install**, **Homebrew**, and **winget**.

Every channel distributes the *same* per-platform standalone executable. Package
managers are thin installers that select, bundle, or download that executable; none of
them build KQode from source or require Cargo, Node, or npm at runtime (except
npm, which is itself the installer for the npm channel).

## Scope

In scope:

- Building direct-download release archives and checksums.
- Uploading them as GitHub Release assets (automated by
  `.github/workflows/release.yml`).
- Publishing the `@kqode/kqode-cli` npm launcher and its five per-platform
  packages via Trusted Publishing (automated by
  `.github/workflows/npm-publish.yml`).
- Publishing the Homebrew tap formula and the winget package automatically on
  release (automated by `.github/workflows/homebrew-publish.yml` and
  `.github/workflows/winget-publish.yml`).

Deferred (not covered here, intentionally out of scope for this slice):

- The one-time bootstrap each package manager needs before automation takes over:
  creating the Homebrew tap repo and submitting winget's first manifest by hand
  (both documented below as one-time setup).
- Homebrew-core submission (the tap is automated; core has a notability bar).
- apt/Debian packaging, code signing, notarization, and auto-update.

## Artifacts

`cargo xtask package-release` produces, for the **current host target**, under
`tui/dist/release/`:

```text
tui/dist/release/
  kqode-<target>.tar.gz | kqode-<target>.zip   # the standalone executable
  kqode-<target>.sha256                          # single-line checksum
  checksums.txt                                  # aggregate of this run
```

The `.github/workflows/release.yml` pipeline runs that command on one native
runner per target, then a final release job downloads every target's archive and
`.sha256`, concatenates them into a single aggregate `checksums.txt`, and uploads
all archives plus `checksums.txt` to the GitHub Release.

## Target matrix

| Release target        | Archive                     |
| --------------------- | --------------------------- |
| `kqode-darwin-arm64`  | `kqode-darwin-arm64.tar.gz` |
| `kqode-linux-arm64`   | `kqode-linux-arm64.tar.gz`  |
| `kqode-linux-x64`     | `kqode-linux-x64.tar.gz`    |
| `kqode-windows-arm64` | `kqode-windows-arm64.zip`   |
| `kqode-windows-x64`   | `kqode-windows-x64.zip`     |

Release archive names use conventional OS names (`windows`). Every channel — the
npm package's download step, Homebrew, and winget — consumes these same archives
by their `kqode-<os>-<arch>` name and verifies them against the published
checksums.

## Building artifacts

Local (host target only):

```bash
cargo xtask package-release
```

This builds the release backend, Bun-compiles the standalone executable, then
archives it with a checksum. Cross-platform artifacts are produced by CI on
native runners; a single machine only builds its own target.

The `ubuntu-22.04-arm` and `windows-11-arm` jobs use GitHub-hosted arm64 runners
that are free but available **only in public repositories** — nothing to enable,
just keep the repo public. In a private repo those labels fail (the required
`kqode-linux-arm64` job would break the release), so you would need paid larger
arm64 runners or would have to drop the arm64 targets.

## Bumping the version

The product version lives in root `Cargo.toml` (it is displayed and baked into
the packaged binary), and must equal the release tag `v<version>`. Bump every
manifest at once instead of editing them by hand:

```bash
cargo xtask set-version 0.2.0
```

This sets the version in root `Cargo.toml`, `xtask/Cargo.toml`,
`packaging/npm/kqode/package.json` (including its `@kqode/kqode-cli-*`
optional-dependency pins), and `tui/package.json`, and refreshes `Cargo.lock`
(workspace members only). Then commit and tag to match:

```bash
git commit -am "chore: release v0.2.0"
git tag v0.2.0 && git push origin v0.2.0
```

The tag drives `release.yml` (which builds the archives + GitHub Release); when it
finishes, `npm-publish.yml`, `homebrew-publish.yml`, and `winget-publish.yml` each
run automatically (their `workflow_run` triggers) and publish npm, the Homebrew
tap formula, and the winget package. Keeping `Cargo.toml` equal to the tag ensures
`kqode --version` matches every published channel.

## 1. GitHub Release direct download

1. Push a version tag to trigger `.github/workflows/release.yml`:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

   (Or run the workflow via **Actions → Release → Run workflow** for a
   release-candidate dry run.)

2. The workflow creates/updates the GitHub Release for the tag and uploads:

   - `kqode-<target>.tar.gz` / `kqode-<target>.zip` for every target,
   - `kqode-<target>.sha256` for every target,
   - the aggregate `checksums.txt`.

3. Asset URLs follow this shape (used by the npm/Homebrew/winget steps below):

   ```text
   https://github.com/kefeiqian/kqode-cli/releases/download/v0.1.0/kqode-<target>.tar.gz
   https://github.com/kefeiqian/kqode-cli/releases/download/v0.1.0/checksums.txt
   ```

4. Users verify a download against the published checksum:

   ```bash
   # POSIX
   shasum -a 256 -c kqode-darwin-arm64.sha256

   # Windows (PowerShell)
   (Get-FileHash kqode-windows-x64.zip -Algorithm SHA256).Hash
   ```

## 2. npm

npm distributes the CLI as a **launcher plus per-platform packages** (the model
esbuild and SWC use), all under the `@kqode` org:

- `@kqode/kqode-cli` — the launcher. It ships no binary and lists one platform
  package per target under `optionalDependencies`.
- `@kqode/kqode-cli-<platform>-<arch>` — five packages (`darwin-arm64`,
  `linux-arm64`, `linux-x64`, `win32-arm64`, `win32-x64`), each carrying that
  host's self-contained executable and declaring `os`/`cpu`.

On `npm install -g @kqode/kqode-cli`, npm installs the launcher plus **only** the
platform package matching the host's `os`/`cpu`; the launcher then resolves that
package's executable and execs it. Nothing is downloaded on install or first run,
so the install is self-contained and works offline (`win32-arm64` carries the
`win32-x64` binary, run via emulation).

The platform packages are **generated at publish time** from the GitHub Release
archives, so npm is published only **after** `release.yml` has uploaded that tag's
archives and checksums; the pipeline enforces that ordering automatically (see
below).

Users install with:

```bash
npm install -g @kqode/kqode-cli
```

> Trade-off vs. the earlier download-on-install launcher: publishing produces six
> packages instead of one, and each needs its own npm trusted publisher. In
> return, installs need no network beyond the registry, never fail on a transient
> GitHub outage, and work offline.

### What to register and set (one-time)

1. An **npm account** and the **`@kqode` organization** (npmjs.com → Add
   Organization → `kqode`; the free plan covers public packages).
2. **Bootstrap the first publish of every package.** A trusted publisher cannot be
   configured for a package that does not exist yet, so create all six once with a
   short-lived Granular token (write access to the `@kqode` scope). After a
   `v<version>` GitHub Release exists, generate the platform packages and publish
   them plus the launcher:
   ```bash
   gh release download v<version> --dir staging
   node packaging/npm/scripts/generate-platform-packages.cjs \
     --archives staging --out dist-packages --version <version>
   export NODE_AUTH_TOKEN=<granular-token>
   for d in dist-packages/*/; do (cd "$d" && npm publish --access public); done
   (cd packaging/npm/kqode && npm publish --access public)
   ```
   Then revoke that token.
3. **Add a Trusted Publisher to each of the six packages** on npmjs.com → Packages
   → `<package>` → Settings → **Trusted Publisher** → GitHub Actions:
   - Organization/owner: `kefeiqian`
   - Repository: `kqode-cli`
   - Workflow filename: `npm-publish.yml` (exact, case-sensitive)

   The packages are `@kqode/kqode-cli`, `@kqode/kqode-cli-darwin-arm64`,
   `@kqode/kqode-cli-linux-arm64`, `@kqode/kqode-cli-linux-x64`,
   `@kqode/kqode-cli-win32-arm64`, and `@kqode/kqode-cli-win32-x64`.
4. **Restrict tokens (recommended).** For each package → Settings → Publishing
   access → **Require two-factor authentication and disallow tokens**. Trusted
   publishing keeps working over OIDC; only long-lived tokens are disallowed.
5. Ensure each package's `repository.url` matches the GitHub repo
   (`git+https://github.com/kefeiqian/kqode-cli.git`) — npm validates it for
   trusted publishing. The launcher manifest already sets it, and the generator
   stamps it into every platform manifest.

No `NPM_TOKEN` secret is needed for automated publishing; OIDC replaces it.

### Automated publishing (recommended)

`.github/workflows/npm-publish.yml` publishes all six packages via Trusted
Publishing (OIDC). It checks out the released commit, downloads the tag's Release
archives, runs the generator to assemble the platform packages, then publishes the
platform packages first and the launcher last (so the launcher's optional
dependencies already exist), skipping any `name@version` already on the registry.
npm auto-detects the OIDC environment (`id-token: write`) and, on public repos,
attaches provenance to every package automatically.

It runs **automatically** on a pushed version tag: `npm-publish.yml` has a
`workflow_run` trigger on the **Release** workflow, so when `release.yml` finishes
a successful tag-push run, npm-publish runs and publishes the just-released
version — after that tag's archives and checksums are uploaded, with no manual
step. It reads the version from the released commit's `package.json` (checked out
at the run's `head_sha`).

Crucially, `workflow_run` keeps `npm-publish.yml` as the **top-level** workflow.
npm Trusted Publishing validates the *top-level* workflow's filename (not the file
that runs `npm publish`), so npm-publish must **not** be invoked via
`workflow_call` from `release.yml` — npm would then validate `release.yml` and
reject the publish (`ENEEDAUTH`). Keeping it top-level means every package's
Trusted Publisher config (workflow `npm-publish.yml`) needs no change.

You can still publish (or re-publish) a tag by hand from **Actions → Publish npm
→ Run workflow**; the idempotency guard makes a duplicate run a no-op.

> A Release *published by hand in the UI* fires `release: published`, which this
> workflow also handles. A Release created by `release.yml`'s `GITHUB_TOKEN` does
> not re-fire that event — which is why the automatic path is the `workflow_run`
> trigger, not `release`.

### Manual publishing

Publish every package for a tag whose GitHub Release already exists (the same
steps the workflow runs, with your own npm auth):

```bash
gh release download v<version> --dir staging
node packaging/npm/scripts/generate-platform-packages.cjs \
  --archives staging --out dist-packages --version <version>
for d in dist-packages/*/; do (cd "$d" && npm publish --access public); done
(cd packaging/npm/kqode && npm publish --access public)
```

## 3. Homebrew

Homebrew installs from a **tap** you control — the GitHub repo
`kefeiqian/homebrew-kqode` (Homebrew maps the tap name `kefeiqian/kqode` to a repo
named `homebrew-kqode`). The formula points at the POSIX (`darwin`/`linux`)
`.tar.gz` release assets and pins each `sha256` from the release's
`checksums.txt`. `.github/workflows/homebrew-publish.yml` regenerates and pushes
the formula on every release, so the tap always tracks the latest version.

Users install with:

```bash
brew install kefeiqian/kqode/kqode        # self-tapping one-liner
# or tap once, then use the bare name:
brew tap kefeiqian/kqode && brew install kqode
brew upgrade kqode
```

A truly bare `brew install kqode` with no tap requires acceptance into
**homebrew-core**, which has a notability bar and discourages prebuilt-binary
formulae — deferred until KQode is established. The tap gives a bare
`brew install kqode` after the one-time `brew tap`.

The formula covers macOS arm64, Linux x64, and Linux arm64. Intel macOS is not
built (Apple Silicon only) and Windows is served by winget, so neither appears in
the formula.

### One-time setup

1. Create a **public** GitHub repo named **`homebrew-kqode`** under `kefeiqian`,
   initialized with a README (or any initial commit) so it has a default branch —
   `actions/checkout` cannot check out a repo with zero commits. The first release
   then commits `Formula/kqode.rb`; you do not need to add the formula by hand.
2. Add a repository secret **`HOMEBREW_TAP_TOKEN`** to `kqode-cli` (Settings →
   Secrets and variables → Actions) that can push to the tap: a fine-grained PAT
   scoped to `homebrew-kqode` with **Contents: read and write**, or a classic PAT
   with `repo`. `GITHUB_TOKEN` cannot push to another repo, so this token is
   required.

### Automated publishing

`homebrew-publish.yml` runs after `release.yml` completes (its `workflow_run`
trigger, the same model as npm), downloads the tag's `checksums.txt`, runs
`packaging/homebrew/generate-formula.cjs` to render `Formula/kqode.rb` with the
pinned checksums, and pushes it to the tap using `HOMEBREW_TAP_TOKEN`. Re-run a
tag by hand from **Actions → Publish Homebrew → Run workflow** (also the path for
a Release published by hand in the UI).

Render the formula locally (e.g. to seed the tap the first time):

```bash
gh release download vX.Y.Z --pattern checksums.txt --dir staging
node packaging/homebrew/generate-formula.cjs \
  --checksums staging/checksums.txt --version X.Y.Z --out kqode.rb
```

## 4. winget

winget consumes the Windows `.zip` release asset. Ongoing releases are automated
by `.github/workflows/winget-publish.yml` (the `vedantmgoyal9/winget-releaser`
action), which reads the release's `kqode-windows-x64.zip`, regenerates the
manifests, and opens a pull request to
[microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs). The package
identifier is **`KefeiQian.KQode`** with **`Moniker: kqode`**, so users install with:

```bash
winget install kqode          # matches the moniker
# exact id:
winget install KefeiQian.KQode
```

winget ships the **x64** zip only; Windows on ARM runs it via emulation (the same
stance as the npm channel), so no arm64 winget installer is needed.

winget-releaser **updates an existing package** — it copies the previous
version's manifests and bumps the version/URL/hash — so the very first version
must be submitted once by hand to create the package. Every version after that is
automatic; runs before the bootstrap fail with a clear "package does not exist"
error.

### One-time setup

1. **Fork** `microsoft/winget-pkgs` under `kefeiqian` (winget-releaser opens its
   PRs from this fork; override with the action's `fork-user` input if it lives
   elsewhere).
2. Add a repository secret **`WINGET_TOKEN`** to `kqode-cli`: a **classic** PAT
   with **`public_repo`** scope. Fine-grained PATs are not supported by the
   action.
3. **Bootstrap the first submission** for an existing release `vX.Y.Z` with
   [komac](https://github.com/russellbanks/Komac) (install via
   `cargo binstall komac`, or download from its releases):

   ```bash
   komac new KefeiQian.KQode \
     --urls https://github.com/kefeiqian/kqode-cli/releases/download/vX.Y.Z/kqode-windows-x64.zip \
     --version X.Y.Z --submit
   ```

   komac downloads the zip, computes the SHA-256, and (because it is a zip)
   prompts for the nested installer. Set **NestedInstallerType: portable**,
   relative path **`kqode.exe`**, command alias **`kqode`**, and the metadata
   below (especially **Moniker: `kqode`**), then let it submit the PR. The
   resulting manifests should match:

   ```yaml
   # KefeiQian.KQode.installer.yaml
   PackageIdentifier: KefeiQian.KQode
   PackageVersion: X.Y.Z
   InstallerType: zip
   NestedInstallerType: portable
   NestedInstallerFiles:
     - RelativeFilePath: kqode.exe
       PortableCommandAlias: kqode
   Installers:
     - Architecture: x64
       InstallerUrl: https://github.com/kefeiqian/kqode-cli/releases/download/vX.Y.Z/kqode-windows-x64.zip
       InstallerSha256: <SHA256 from checksums.txt>
   ManifestType: installer
   ManifestVersion: 1.6.0
   ```

   ```yaml
   # KefeiQian.KQode.locale.en-US.yaml
   PackageIdentifier: KefeiQian.KQode
   PackageVersion: X.Y.Z
   PackageLocale: en-US
   Publisher: KefeiQian
   PackageName: KQode
   License: MIT OR Apache-2.0
   ShortDescription: Rust-core coding-agent harness with a TypeScript Ink terminal UI.
   Moniker: kqode
   ManifestType: defaultLocale
   ManifestVersion: 1.6.0
   ```

   ```yaml
   # KefeiQian.KQode.yaml
   PackageIdentifier: KefeiQian.KQode
   PackageVersion: X.Y.Z
   DefaultLocale: en-US
   ManifestType: version
   ManifestVersion: 1.6.0
   ```

### Automated publishing

`winget-publish.yml` runs after `release.yml` completes (`workflow_run`), resolves
the version from the released commit, and calls `winget-releaser` with
`identifier: KQode.KQode`, the release tag, and
`installers-regex: kqode-windows-x64\.zip$`, using `WINGET_TOKEN` to open the PR
from your fork. Re-run a tag by hand from **Actions → Publish winget → Run
workflow** (also the path for a Release published by hand in the UI). Because
komac opens a real PR each run, avoid triggering it twice for the same version.

```bash
gh secret set WINGET_TOKEN --repo kefeiqian/kqode-cli   # paste a fresh <=7-day classic PAT
gh workflow run "Publish winget" --repo kefeiqian/kqode-cli -f tag=vX.Y.Z
```

The workflow calls `winget-releaser` with `identifier: KefeiQian.KQode`, the tag, and
`installers-regex: kqode-windows-x64\.zip$` to open the PR from your fork. Each
run opens a real PR, so don't dispatch the same version twice.

Equivalent local alternative (no CI, no stored secret) — run from your machine
with a fresh token via `komac token add`:

```bash
komac update KefeiQian.KQode --version X.Y.Z \
  --urls https://github.com/kefeiqian/kqode-cli/releases/download/vX.Y.Z/kqode-windows-x64.zip --submit
```

## Verifying provenance

The release workflow publishes checksums alongside the archives and, where the
platform feature is available, GitHub artifact attestations for the release
assets. npm packages published via Trusted Publishing additionally carry npm
provenance automatically on public repos. Downstream package-manager
registrations should pin the `sha256`/`SHA256` values from the release
`checksums.txt`, and verifiers can additionally check attestations with
`gh attestation verify <file> --repo kefeiqian/kqode-cli`.
