# KQode distribution registration guide

This guide walks a maintainer through publishing the standalone `kqode` executable
through the four supported channels: **GitHub Release direct download**, **npm
global install**, **Homebrew**, and **winget**.

Every channel distributes the *same* per-platform standalone executable. Package
managers are thin installers that select or download that executable; none of
them build KQode from source or require Cargo, Node, or npm at runtime (except
npm, which is itself the installer for the npm channel).

## Scope

In scope:

- Building direct-download release archives and checksums.
- Uploading them as GitHub Release assets (automated by
  `.github/workflows/release.yml`).
- Publishing the single `@kqode/kqode-cli` npm package via Trusted Publishing
  (automated by `.github/workflows/npm-publish.yml`).
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
`packaging/npm/kqode/package.json`, and `tui/package.json`, and refreshes
`Cargo.lock` (workspace members only). Then commit and tag to match:

```bash
git commit -am "chore: release v0.2.0"
git tag v0.2.0 && git push origin v0.2.0
```

The tag drives `release.yml` (which builds the archives + Release) and
`npm-publish.yml` (which stamps the npm version from the tag). Keeping
`Cargo.toml` equal to the tag ensures `kqode --version` matches the published
release and npm version.

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

npm distributes a **single** package, `@kqode/kqode-cli`, published under the
`@kqode` org. It ships no binary: on install (postinstall) and, as a fallback, on
first run, it downloads the matching `kqode-<os>-<arch>` archive for the host from
this version's GitHub Release, verifies its SHA-256 against the published
checksum, and extracts the self-contained executable locally. The `kqode`
launcher then execs it.

Because the download targets `v<package-version>`, only publish the npm package
**after** `release.yml` has uploaded that tag's archives and checksums.

Users install with:

```bash
npm install -g @kqode/kqode-cli
```

> Tradeoff: install/first-run needs network access to GitHub Releases, and
> `npm install --ignore-scripts` skips the postinstall (the first `kqode` run
> performs the download instead). The alternative `os`/`cpu`
> optional-dependency layout avoids this but needs one npm package per target.

### What to register and set (one-time)

1. An **npm account** and the **`@kqode` organization** (npmjs.com → Add
   Organization → `kqode`; the free plan covers public packages).
2. **Bootstrap the first publish.** A trusted publisher cannot be configured for
   a package that does not exist yet, so create it once with a short-lived
   Granular token (write access to `@kqode/kqode-cli`):
   ```bash
   cd packaging/npm/kqode
   npm version <version> --no-git-tag-version --allow-same-version
   NODE_AUTH_TOKEN=<granular-token> npm publish --access public
   ```
   Then revoke that token.
3. **Add the Trusted Publisher** on npmjs.com → Packages → `@kqode/kqode-cli` →
   Settings → **Trusted Publisher** → GitHub Actions:
   - Organization/owner: `kefeiqian`
   - Repository: `kqode-cli`
   - Workflow filename: `npm-publish.yml` (exact, case-sensitive)
4. **Restrict tokens (recommended).** Package → Settings → Publishing access →
   **Require two-factor authentication and disallow tokens**. Trusted publishing
   keeps working over OIDC; only long-lived tokens are disallowed.
5. Ensure the package's `repository.url` matches the GitHub repo
   (`git+https://github.com/kefeiqian/kqode-cli.git`) — npm validates it for
   trusted publishing. It is already set in `packaging/npm/kqode/package.json`.

No `NPM_TOKEN` secret is needed for automated publishing; OIDC replaces it.

### Automated publishing (recommended)

`.github/workflows/npm-publish.yml` publishes `@kqode/kqode-cli` via Trusted
Publishing (OIDC): it stamps the tag's version into `package.json` and runs
`npm publish --access public`, skipping the publish if that version already
exists. npm auto-detects the OIDC environment (`id-token: write`) and, on public
repos, attaches provenance automatically. Trigger it from **Actions → Publish npm
→ Run workflow** and enter the tag (e.g. `v0.1.0`).

> A Release created by `release.yml`'s `GITHUB_TOKEN` does not re-trigger the
> `release: published` event, so the manual dispatch above is the reliable path.

### Manual publishing

```bash
cd packaging/npm/kqode
npm version <version> --no-git-tag-version --allow-same-version
npm publish --access public
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
