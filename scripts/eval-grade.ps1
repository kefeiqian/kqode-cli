#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Run the EvalPlus grader container from the KQode repo root.

.DESCRIPTION
    Thin wrapper around `docker compose -f evaluation/compose.yaml run` that
    grades a completed `samples.jsonl` inside the isolated, container-only
    EvalPlus grader (plan U6 / requirement R16 — untrusted model code never runs
    on the host). Resolves the repo root itself, so it works from any directory.

    The eval runner (`kqode eval`) invokes this same compose file directly; this
    script exists for the Phase 2 feasibility spike and manual grading.

    Docker Desktop runs the Linux grader container transparently through its WSL2
    engine — you never open a WSL shell. Native Windows grading is not possible:
    EvalPlus's sandbox imports Python's Unix-only `resource` module.

.PARAMETER RunDir
    Directory holding `samples.jsonl` (LF line endings). Mounted read-write into
    the container as /work; grading results are written back here. Required.

.PARAMETER Dataset
    Benchmark to grade against: `humaneval` (default) or `mbpp`.

.PARAMETER Samples
    Samples filename inside RunDir. Defaults to `samples.jsonl`.

.PARAMETER Image
    Override the grader image (e.g. a pinned digest
    `ganler/evalplus@sha256:...`). Defaults to the compose file's default.

.PARAMETER ExtraArgs
    Any additional args forwarded verbatim to `evalplus.evaluate`.

.EXAMPLE
    ./scripts/eval-grade.ps1 -RunDir $HOME\.kqode\eval\spike

.EXAMPLE
    ./scripts/eval-grade.ps1 -RunDir .\run -Dataset mbpp -- --parallel 4
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RunDir,

    [ValidateSet('humaneval', 'mbpp')]
    [string]$Dataset = 'humaneval',

    [string]$Samples = 'samples.jsonl',

    [string]$Image,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repoRoot 'evaluation\compose.yaml'
if (-not (Test-Path $composeFile)) {
    Write-Error "compose file not found at $composeFile"
    exit 1
}

# Docker must be reachable before we try to grade.
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "docker not found on PATH. Install Docker Desktop (WSL2 engine) first."
    exit 1
}

# Resolve the run dir to an absolute path and verify the samples file is present,
# so the container mount can't silently point at an empty or wrong directory.
if (-not (Test-Path $RunDir)) {
    Write-Error "run dir not found: $RunDir"
    exit 1
}
$RunDir = (Resolve-Path $RunDir).Path
$samplesPath = Join-Path $RunDir $Samples
if (-not (Test-Path $samplesPath)) {
    Write-Error "samples file not found: $samplesPath (write it before grading)"
    exit 1
}

# The compose file reads EVAL_RUN_DIR (the only writable mount) and EVALPLUS_IMAGE.
$env:EVAL_RUN_DIR = $RunDir
if ($Image) { $env:EVALPLUS_IMAGE = $Image }

$graderArgs = @(
    'compose', '-f', $composeFile, 'run', '--rm', 'grader',
    'evalplus.evaluate', '--dataset', $Dataset, '--samples', "/work/$Samples"
)
if ($ExtraArgs) { $graderArgs += $ExtraArgs }

Write-Host "Grading $Dataset from $samplesPath (container-only, isolated)..." -ForegroundColor Cyan
& docker @graderArgs
exit $LASTEXITCODE
