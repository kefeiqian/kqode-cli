---
name: kqode-blog-stop
description: "Stop the locally running KQode Docusaurus blog dev server or production preview that binds http://127.0.0.1:3000. Use when asked to stop, kill, shut down, or restart the blog or docs server, free port 3000, or when switching blog locale/preview mode requires stopping the current server first. Finds the one process that owns port 3000 and stops it by PID (never by process name, because this environment runs many unrelated node processes), then verifies the port is free."
---

# KQode Blog Stop

Stop the long-lived Docusaurus server started by the `kqode-blog-serve` skill (or a bare `cargo xtask blog-serve` / `blog-serve-en` / `blog-preview`). All of those bind `http://127.0.0.1:3000`, so stopping is a matter of finding the single process that owns port 3000 and terminating it — **by PID, never by process name**. This environment runs many unrelated `node` and `xtask` processes, so name-based killing would take down other work.

## Workflow

### 1. Confirm something is actually listening on port 3000

Port ownership is the definitive signal (more reliable than an HTTP probe, since Docusaurus serves under the `/kqode-cli/` base path and the bare root may not return `200`):

```powershell
$conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($conns) { $conns | Select-Object -ExpandProperty OwningProcess -Unique } else { 'not-running' }
```

```bash
lsof -ti tcp:3000 || echo 'not-running'   # macOS/Linux
```

If nothing is listening, report that there is nothing to stop — do not kill anything.

### 2. Prefer stopping the background process this session started

If the current session started the server, the `kqode-blog-serve` skill launched it as a **detached background shell** (typically shellId `blog-serve`). Stopping that shell cleanly tears down the whole `xtask.ps1` → `xtask` → `node` process tree:

- Use the agent's `stop_powershell` tool with that shellId, or `Stop-Process -Id <PID>` on the tracked launcher PID.

Only fall back to port-based discovery (below) when the server was started outside this session or the shellId is unknown.

### 3. Otherwise find the PID(s) to stop — the port owner plus its children

Discover and **print** the exact PIDs so you can substitute literal numbers into the kill in the next step. The listener is the `node` dev-server process; also list its child processes (webpack workers) so nothing is orphaned:

```powershell
$targetPids = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
              Select-Object -ExpandProperty OwningProcess -Unique
if (-not $targetPids) {
  # Fallback when Get-NetTCPConnection is unavailable
  $targetPids = netstat -ano | Select-String ':3000\s' | Select-String 'LISTENING' |
                ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
}
$allPids = foreach ($p in $targetPids) {
  $p
  Get-CimInstance Win32_Process -Filter "ParentProcessId=$p" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId
}
$allPids | Sort-Object -Unique   # <- the literal PIDs to stop in step 4
```

```bash
lsof -ti tcp:3000     # macOS/Linux: PID(s) bound to 3000
```

### 4. Stop those PIDs by literal `-Id`

Killing the listener makes the parent `xtask` launcher exit on its own. Substitute the **literal numbers** printed in step 3 — the runtime's safety guard rejects `Stop-Process` when the PID comes from a variable, a pipe, or a name, so it must be written as `-Id <number>`:

```powershell
Stop-Process -Id 11188 -Force            # one PID
Stop-Process -Id 11188,4242,4243 -Force  # or several PIDs at once
```

```bash
lsof -ti tcp:3000 | xargs -r kill        # graceful (macOS/Linux)
lsof -ti tcp:3000 | xargs -r kill -9     # only if it stays bound
```

### 5. Verify the port is free

Do not report success from issuing the kill alone — confirm the port is released:

```powershell
Start-Sleep -Seconds 1
if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { 'still-running' } else { 'stopped' }
```

```bash
sleep 1; lsof -ti tcp:3000 && echo 'still-running' || echo 'stopped'
```

If it is still bound, re-run discovery (a stale PID or the launcher parent may remain) and stop the remaining PID, escalating to a forced kill.

### 6. Report

State that port 3000 is now free. If the goal was to switch locale or preview mode, hand off to `kqode-blog-serve` to start the new one.

## Rules

- Kill **only by literal PID** — `Stop-Process -Id <number>` (Windows) or `kill <number>` (macOS/Linux). The runtime's safety guard rejects `Stop-Process` when the PID comes from a variable, a pipe, or a name, so always discover PIDs first (step 3) then write the literal numbers. Never use name-based termination (`Stop-Process -Name`, `taskkill /IM`, `pkill node`); this environment has many unrelated `node`/`xtask` processes.
- Identify the target by **port ownership** (`Get-NetTCPConnection -LocalPort 3000` / `lsof -ti tcp:3000`), not by guessing or by process name.
- If nothing is listening on 3000, report there is nothing to stop rather than killing anything.
- Prefer tearing down via the session's background shell (`stop_powershell`) when `kqode-blog-serve` started it, so the launcher and `xtask` parent are cleaned up along with `node`.
- After stopping, **verify** port 3000 no longer has a listener before reporting success.
- To switch locale/preview mode, stop here first, then use `kqode-blog-serve` to start the desired server (only one can bind `127.0.0.1:3000` at a time).
