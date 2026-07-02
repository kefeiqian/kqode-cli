# @kqode/kqode-cli

The `kqode` command-line interface. Installing this package downloads the
prebuilt standalone executable for your platform and exposes it as the `kqode`
binary.

```bash
npm install -g @kqode/kqode-cli
kqode
```

## How it works

This package ships no platform binary. On install (and, as a fallback, on first
run) it downloads the matching `kqode-<os>-<arch>` archive for your host from the
GitHub Release for this version, verifies its SHA-256 against the published
checksum, and extracts the self-contained executable locally. The `kqode`
launcher then execs it, forwarding all arguments, stdio, and the exit code.

Because the executable is self-contained, running `kqode` needs neither a Node
runtime nor a Rust toolchain at execution time.

## Supported platforms

`darwin-arm64`, `linux-arm64`, `linux-x64`, `win32-arm64`, `win32-x64`. Intel
macOS (`darwin-x64`) is not supported. On Windows arm64 the x64 build runs via
emulation (Windows 11). On an unsupported host, `kqode` prints an actionable
error instead of failing silently.

## Notes

Install and first run need network access to GitHub Releases. If you install
with `--ignore-scripts`, the postinstall download is skipped and happens on the
first `kqode` run instead. You can always download the executable directly from
<https://github.com/kefeiqian/kqode-cli/releases>.
