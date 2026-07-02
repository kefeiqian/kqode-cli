# npm distribution

This directory holds the npm distribution for the `kqode` CLI: a single package,
`@kqode/kqode-cli`, published under the `@kqode` org.

## Layout

```text
packaging/npm/
  kqode/                     # the published package @kqode/kqode-cli (committed)
    package.json             #   name, bin, postinstall
    bin/kqode.cjs            #   launcher: ensure the binary, then exec it
    lib/resolve.cjs          #   pure host → release-asset mapping
    lib/install.cjs          #   download + SHA-256 verify + extract the binary
    test/resolve.test.cjs    #   node:test for the mapping (run with `node --test`)
```

## Design

The package ships **no** binary. On install (postinstall) and, as a fallback, on
first run, `lib/install.cjs` downloads the matching `kqode-<os>-<arch>` archive
for the host from the GitHub Release for the package's version
(`kefeiqian/kqode-cli`), verifies its SHA-256 against the published checksum,
extracts the self-contained executable into a local `vendor/` directory, and the
`bin/kqode.cjs` launcher execs it — forwarding arguments, stdio, and the exit
code.

This "thin launcher" pattern keeps npm to one package (no per-target packages)
while still delivering a platform-specific, self-contained executable that needs
neither a Node runtime nor a Rust toolchain at execution time.

Tradeoff: install/first-run needs network access to GitHub Releases, and
`npm install --ignore-scripts` skips the postinstall (the first `kqode` run then
performs the download instead). The alternative `os`/`cpu` optional-dependency
layout avoids that but requires one npm package per target.

## Publishing

Publishing is automated by `.github/workflows/npm-publish.yml` via npm Trusted
Publishing (OIDC). See `docs/release/kqode_distribution_registration.md` for the
one-time org/trusted-publisher setup and the manual bootstrap for the first
publish.
