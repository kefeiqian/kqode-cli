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
- Manually registering the Homebrew and winget packages that point at the GitHub
  Release asset URLs.

Deferred (not covered here, intentionally out of scope for this slice):

- Homebrew tap submission and winget submission from CI.
- Code signing, notarization, and auto-update.

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
finishes, `npm-publish.yml` runs automatically (its `workflow_run` trigger) and
publishes npm. Keeping `Cargo.toml` equal to the tag ensures `kqode --version`
matches the published release and npm version.

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

Homebrew consumes the POSIX (`darwin`/`linux`) `.tar.gz` release assets. Create a
formula in your tap that points at the GitHub Release URLs and pins the
published `sha256` values (from `checksums.txt`):

```ruby
class Kqode < Formula
  desc "Rust-core coding-agent harness with a TypeScript Ink terminal UI"
  homepage "https://github.com/kefeiqian/kqode-cli"
  version "0.1.0"

  on_macos do
    on_arm do
      url "https://github.com/kefeiqian/kqode-cli/releases/download/v0.1.0/kqode-darwin-arm64.tar.gz"
      sha256 "<sha256 from checksums.txt>"
    end
    # Intel macOS (darwin-x64) is not distributed; only Apple Silicon is built.
  end

  def install
    bin.install "kqode"
  end
end
```

Register by creating a tap repo (`homebrew-<tap>`), committing the formula under
`Formula/`, and instructing users to
`brew install <owner>/<tap>/kqode`.

## 4. winget

winget consumes the Windows `.zip` release assets. Author a manifest set
(version, installer, locale) for submission to
[microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs). The installer
manifest points at the GitHub Release URL and pins the published `SHA256`:

```yaml
# KQode.KQode.installer.yaml (excerpt)
PackageIdentifier: KQode.KQode
PackageVersion: 0.1.0
Installers:
  - Architecture: x64
    InstallerType: zip
    InstallerUrl: https://github.com/kefeiqian/kqode-cli/releases/download/v0.1.0/kqode-windows-x64.zip
    InstallerSha256: <SHA256 from checksums.txt>
    NestedInstallerType: portable
    NestedInstallerFiles:
      - RelativeFilePath: kqode.exe
```

Submit via a pull request to `microsoft/winget-pkgs`. Users then install with
`winget install KQode.KQode`.

## Verifying provenance

The release workflow publishes checksums alongside the archives and, where the
platform feature is available, GitHub artifact attestations for the release
assets. npm packages published via Trusted Publishing additionally carry npm
provenance automatically on public repos. Downstream package-manager
registrations should pin the `sha256`/`SHA256` values from the release
`checksums.txt`, and verifiers can additionally check attestations with
`gh attestation verify <file> --repo kefeiqian/kqode-cli`.
