# npm distribution

This directory holds the npm distribution for the `kqode` CLI.

## Packages

- **`@kqode/kqode-cli`** (`kqode/`, committed) — the published launcher. It ships
  no binary; it locates and execs the platform executable and lists the platform
  packages under `optionalDependencies`.
- **`@kqode/kqode-cli-<platform>-<arch>`** — one package per supported target,
  each carrying that host's self-contained executable plus `os`/`cpu` fields.
  These are generated at publish time from the GitHub Release archives (by
  `.github/workflows/npm-publish.yml`), not committed here.

## Layout

```text
packaging/npm/
  kqode/                     # @kqode/kqode-cli (committed)
    package.json             #   bin + optionalDependencies (the platform packages)
    bin/kqode.cjs            #   launcher: locate the platform binary, then exec it
    lib/resolve.cjs          #   pure host → package-name / binary-name mapping
    lib/locate.cjs           #   resolve the installed platform binary (or KQODE_BINARY_PATH)
    test/*.test.cjs          #   node:test for the mapping/resolution (run with `node --test`)
```

## Design

npm installs `@kqode/kqode-cli` plus exactly one
`@kqode/kqode-cli-<platform>-<arch>` optional dependency — the one whose `os`/`cpu`
matches the host. That platform package carries the self-contained executable, so
`npm install` alone is enough to run `kqode`: nothing is downloaded on install or
first run, and it works offline. At runtime the launcher resolves the executable
from the platform package via `require.resolve` and execs it, forwarding
arguments, stdio, and the exit code.

This replaces the earlier "thin launcher that downloads from GitHub Releases"
design; the trade-off is that publishing produces one package per target instead
of one, each with its own npm trusted publisher.

`win32-arm64` has no native build yet; its package carries the `win32-x64`
executable, which Windows 11 on ARM runs via emulation.

## Publishing

Publishing is automated by `.github/workflows/npm-publish.yml` via npm Trusted
Publishing (OIDC). See `docs/release/kqode_distribution_registration.md` for the
one-time per-package trusted-publisher setup and the manual bootstrap for the
first publish of each package.
