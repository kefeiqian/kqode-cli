# KQode desktop release guide

KQode is distributed as a Tauri desktop application.

## Release artifacts

Pushing a `v*` tag runs `.github/workflows/release.yml` and creates native
desktop bundles:

| Platform | Bundles |
| --- | --- |
| macOS arm64 | `.dmg` |
| macOS x64 | `.dmg` |
| Linux x64 | `.deb`, `.AppImage` |
| Windows x64 | `.msi`, NSIS `.exe` |

The workflow uses the official Tauri GitHub Action. A manual workflow run builds
the same matrix and stores the bundles as workflow artifacts without creating a
GitHub Release.

## Bumping the version

Run:

```bash
cargo xtask set-version 0.3.0
```

This updates:

- `Cargo.toml`
- `xtask/Cargo.toml`
- `desktop/package.json`
- `tauri.conf.json`
- `Cargo.lock`

Commit the version change, create the matching tag, and push it:

```bash
git commit -am "chore: release v0.3.0"
git tag v0.3.0
git push origin v0.3.0
```

The tag is the only automated publishing trigger. npm, Homebrew, and winget
publishing are retired until desktop-specific distribution channels are
designed and registered.

## Local bundles

Install the frontend dependencies once:

```bash
cd desktop
bun install
```

Then build from the repository root through the frontend-owned Tauri CLI:

```bash
bun run --cwd desktop tauri build
```
