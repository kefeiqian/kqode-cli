#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Parallel-safe launcher for KQode xtask commands on Windows.

.DESCRIPTION
    `cargo xtask <cmd>` expands to `cargo run -p xtask`, which relinks the single
    shared `target\debug\xtask.exe` on every call. A long-running command such as
    `blog-serve` or `tui-dev` keeps that executable locked, so a second
    `cargo xtask` fails to replace it ("cannot move xtask.exe", os error 32).

    This launcher builds the xtask binary once, then runs a unique per-invocation
    copy under `target\debug\xtask-run\`. The canonical `xtask.exe` is never held
    by a running command, so any number of xtask commands can run in parallel.

    `repo_root()` inside xtask is baked in at compile time (CARGO_MANIFEST_DIR),
    so a relocated copy still resolves the real repository.

.EXAMPLE
    ./scripts/xtask.ps1 blog-serve
    ./scripts/xtask.ps1 tui-dev
#>
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repoRoot
try {
    cargo build -p xtask
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}

$targetDir = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $repoRoot 'target' }
# A relative CARGO_TARGET_DIR is resolved by cargo against the build cwd (repo root), so anchor it there too.
if (-not [System.IO.Path]::IsPathRooted($targetDir)) { $targetDir = Join-Path $repoRoot $targetDir }
$sourceExe = Join-Path $targetDir 'debug\xtask.exe'
if (-not (Test-Path $sourceExe)) {
    Write-Error "xtask binary not found at $sourceExe"
    exit 1
}

$runDir = Join-Path $targetDir 'debug\xtask-run'
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

# Best-effort prune of copies left by earlier crashed runs; locked ones are skipped.
Get-ChildItem -Path $runDir -Filter '*.exe' -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } |
    ForEach-Object { Remove-Item $_.FullName -ErrorAction SilentlyContinue }

$commandLabel = if ($args.Count -gt 0) { ($args[0] -replace '[^\w\-]', '') } else { 'help' }
$copyName = "$PID-$commandLabel-$([guid]::NewGuid().ToString('N').Substring(0, 8)).exe"
$copyExe = Join-Path $runDir $copyName
Copy-Item -Path $sourceExe -Destination $copyExe -Force

$code = 0
try {
    & $copyExe @args
    $code = $LASTEXITCODE
}
finally {
    Remove-Item $copyExe -ErrorAction SilentlyContinue
}

exit $code
