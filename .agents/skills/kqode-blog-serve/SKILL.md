---
name: kqode-blog-serve
description: "Start the KQode Docusaurus blog dev server locally with hot reload, in the default Chinese locale, the English locale, or as a production preview build. Use when asked to start, run, or serve the blog or docs site, preview the blog locally, open or view the blog in a browser, or check the English blog locale. Always terminates any server already bound to port 3000, then starts a fresh one as a background process through the parallel-safe xtask launcher, waits for it to come up, verifies it is serving, and reports the local URL. Also use when a blog edit or new article does not show up or a page 404s in the running dev server (stale hot reload), to restart it and re-verify the page."
---

# KQode Blog Serve

Start the Docusaurus blog under `blog/` locally and hand the user a working URL. The dev server is long-lived, so run it as a background process through the parallel-safe launcher rather than a blocking foreground command.

## Server options

All three bind `http://127.0.0.1:3000`, so only one can run at a time. The site is served under its configured `baseUrl`, so the working URL is `http://127.0.0.1:3000/kqode-cli/` — always health-check and verify against that path. A bare `http://127.0.0.1:3000/` returns 404 and must not be used to decide whether the server is up.

| Goal | xtask command | Behavior |
| --- | --- | --- |
| Default Chinese docs, hot reload | `blog-serve` | Docusaurus `start` on the default locale |
| English docs, hot reload | `blog-serve-en` | Docusaurus `start --locale en` |
| Production build preview | `blog-preview` | Builds, then serves static `build/` output (no hot reload) |

## Workflow

### 1. Pick which server to start

Default to `blog-serve` (Chinese, hot reload) for a plain "start the blog / dev server" request. Use `blog-serve-en` when the user wants the English locale, and `blog-preview` only when they want to validate the built production output. Ask only if the request is genuinely ambiguous between these.

### 2. Free port 3000 first (terminate any existing server)

`/kqode-blog-serve` always starts a **fresh** server, so first terminate whatever is bound to `127.0.0.1:3000` instead of reusing it — a stale dev server (see step 6) or another session's server would otherwise keep serving outdated routes.

Find the PID that owns the port:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
```

If it prints a PID, stop it by that **literal** number, then re-check until the port is free:

```powershell
Stop-Process -Id <PID> -Force   # replace <PID> with the actual number printed above
```

The powershell tool requires a literal `-Id <number>` — do not pass a variable or a pipeline. (The `kqode-blog-stop` skill performs exactly this discover-then-stop-by-PID flow if you prefer to delegate it.) Keep checking until nothing listens on 3000: the socket can take a second to release, and starting while it is still bound triggers Docusaurus's interactive "port in use" prompt, which hangs a detached process.

### 3. Start the server as a background process via the launcher

Run it detached/async so it keeps running and does not block the session. Use the parallel-safe launcher, not bare `cargo xtask`:

```powershell
./scripts/xtask.ps1 blog-serve       # Windows (PowerShell)
```

```bash
./scripts/xtask.sh blog-serve        # macOS/Linux
```

Swap in `blog-serve-en` or `blog-preview` as chosen. The launcher builds `xtask` once, then runs a per-invocation copy under `target/debug/xtask-run/`, so the long-lived server never holds the shared `xtask.exe` lock and other `cargo xtask` commands still work in parallel.

The first start may take longer: `ensure_dependencies` runs `bun install` automatically when `blog/node_modules/.bin/docusaurus` is missing, and the initial Docusaurus compile takes several seconds.

### 4. Wait for it to come up and verify

Poll the URL until the dev server has finished its first compile and responds:

```powershell
1..30 | ForEach-Object {
  try { if ((Invoke-WebRequest -Uri http://127.0.0.1:3000/kqode-cli/ -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { 'ready'; break } } catch { Start-Sleep -Seconds 2 }
}
```

If it never responds, read the background process output for the real failure (dependency install, port conflict, or a Docusaurus/MDX error) and report it rather than assuming success.

### 5. Report the URL and how to stop it

Report `http://127.0.0.1:3000/kqode-cli/` and which locale/mode is running. Tell the user it stays running in the background and how to stop it (stop the background process, e.g. `Stop-Process -Id <PID>`, or Ctrl+C in its terminal).

### 6. After editing docs or config: restart if needed, then verify

Hot reload is only reliable for edits to the **body of an existing doc**. Adding, renaming, moving, or deleting a doc, and editing `_category_.json`, `sidebars.ts`, or `docusaurus.config.ts`, are often **not** picked up: the running server keeps serving its old in-memory route table, so a brand-new page renders as "Page Not Found" in the browser even though the file is correct, and config edits simply do not take effect. After any such change, **restart** by re-running this skill: step 2 terminates the current server on port 3000, then steps 3–4 start a fresh one that picks up the change.

**Do not verify that a page exists with an HTTP status code.** In dev the server serves the SPA shell with HTTP `200` for *every* path under the baseUrl — missing pages are rendered as "Page Not Found" by client-side JS, which `curl` never sees — so `200` does not prove a page exists (and `Invoke-WebRequest` misleadingly returns `404` for *all* sub-routes because of its request headers). Verify a page reliably with one of:

- **Authoritative:** run `cargo xtask blog-build`. It fails loudly on MDX / broken-link errors and generates each page as `build\<slug>.html` (note `trailingSlash: false`, e.g. `build\文章结构.html`).
- **Route table (fast):** confirm the page's permalink is in the freshly generated route list `blog/.docusaurus/routes.js` (search with a UTF-8-safe tool such as ripgrep, e.g. `rg 文章结构 blog/.docusaurus/routes.js`; PowerShell `Select-String` can mangle CJK).
- **See it rendered:** use `blog-preview`, which serves the pre-rendered static build and returns a real `404` for missing pages.

Use `curl` only to check the server is **alive**: `curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:3000/kqode-cli/` returning `200` means it is up.

## Rules

- Prefer the parallel-safe launcher (`scripts/xtask.ps1` / `scripts/xtask.sh`) over bare `cargo xtask blog-serve` for the long-lived dev server, so it does not lock the shared `xtask.exe` and block other xtask commands.
- Run the server as a background/detached process; never block the session waiting on it.
- `/kqode-blog-serve` always starts fresh: terminate whatever owns port 3000 first (step 2) — including another session's server — then start. Never reuse an already-running server or start a second one (`blog-serve`, `blog-serve-en`, and `blog-preview` all bind `127.0.0.1:3000`, so only one can run).
- Do not run raw `bun run serve` or the `docusaurus` binary directly; go through the xtask command per repo conventions.
- Let dependencies auto-install on first start; allow extra time rather than pre-running `blog-install` unless install itself fails.
- `blog-serve` and `blog-serve-en` hot-reload docs and translations; `blog-preview` serves a static build and does not. Do not use `blog-preview` to check live edits.
- To check the server is alive, request the baseUrl path, e.g. `curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:3000/kqode-cli/` → `200`; do not report success from launching alone, and never health-check the bare `http://127.0.0.1:3000/`, which 404s because of the baseUrl and would falsely look "not running". A `200` here means only that the server is up, not that any specific page exists.
- Hot reload only reliably covers edits to the body of an existing doc. After adding, renaming, moving, or deleting docs, or editing `_category_.json`, `sidebars.ts`, or `docusaurus.config.ts`, restart the server — do not trust hot reload for these.
- Do not use an HTTP status to verify a page exists: the dev server returns `200` (SPA shell) for every path under the baseUrl, and `Invoke-WebRequest` returns `404` for all sub-routes regardless. Confirm a page instead by running `cargo xtask blog-build` (authoritative; generates `build/<slug>.html`, `trailingSlash: false`) or by finding its permalink in `blog/.docusaurus/routes.js`. Use `blog-preview` to view rendered pages with real 404s.
- To restart, stop the process owning port 3000 by its literal PID (see the `kqode-blog-stop` skill), then start fresh via the launcher.
