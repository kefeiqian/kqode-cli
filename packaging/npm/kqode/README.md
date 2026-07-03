# @kqode/kqode-cli

The `kqode` command-line interface.

```bash
npm install -g @kqode/kqode-cli
kqode
```

## How it works

This package is a small launcher. The platform-specific, self-contained `kqode`
executable ships inside a per-host package (for example
`@kqode/kqode-cli-win32-x64`) listed under `optionalDependencies`. npm installs
**only** the one whose `os`/`cpu` matches your machine, so `npm install` delivers
a ready-to-run binary — no post-install download, and it works offline.

At runtime the `kqode` launcher resolves the executable from that platform
package and execs it, forwarding all arguments, stdio, and the exit code. Because
the executable is self-contained, running `kqode` needs neither a Node runtime
nor a Rust toolchain.

## Supported platforms

`darwin-arm64`, `linux-arm64`, `linux-x64`, `win32-arm64`, `win32-x64`. Intel
macOS (`darwin-x64`) is not supported. On Windows arm64 the x64 build runs via
emulation (Windows 11). On an unsupported host, `kqode` prints an actionable
error instead of failing silently.

## Notes

Installing needs no network beyond the npm registry, and nothing is downloaded
on first run. If your install skipped optional dependencies (for example
`npm install --omit=optional`), the matching platform package is absent; reinstall
without that flag. As an escape hatch you can point `KQODE_BINARY_PATH` at a
`kqode` executable downloaded directly from
<https://github.com/kefeiqian/kqode-cli/releases>.
