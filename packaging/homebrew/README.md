# Homebrew packaging

Generates the `Formula/kqode.rb` served by the **`kefeiqian/homebrew-kqode`**
tap. Every install channel ships the same GitHub Release binaries; this formula
just points Homebrew at the POSIX `.tar.gz` assets and pins their `sha256`.

- `formula.cjs` — pure Ruby-source builder (no IO), covering the three POSIX
  targets Homebrew serves: macOS arm64, Linux x64, Linux arm64. Intel macOS is
  not built and Windows is served by winget, so neither appears here.
- `generate-formula.cjs` — reads a release `checksums.txt` and writes
  `Formula/kqode.rb`.
- `test/` — `node --test` coverage for the builder.

## Users

```bash
brew install kefeiqian/kqode/kqode        # self-tapping one-liner
# or
brew tap kefeiqian/kqode && brew install kqode
brew upgrade kqode
```

## Publishing

`.github/workflows/homebrew-publish.yml` runs this automatically after each
release. To render locally (e.g. to seed the tap):

```bash
gh release download vX.Y.Z --pattern checksums.txt --dir staging
node packaging/homebrew/generate-formula.cjs \
  --checksums staging/checksums.txt --version X.Y.Z --out kqode.rb
```

Run the tests with `node --test` from this directory. See
`docs/release/kqode_distribution_registration.md` for the one-time tap and token
setup.
