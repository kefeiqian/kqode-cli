param(
    [Parameter(Mandatory = $false)]
    [string]$BundleRoot = "target\release\bundle",

    [Parameter(Mandatory = $false)]
    [string]$InstallRoot = "",

    [Parameter(Mandatory = $false)]
    [switch]$VerifyCopilotLogin
)

$ErrorActionPreference = "Stop"

$resolvedBundleRoot = (Resolve-Path -LiteralPath $BundleRoot).Path
$nsisInstallers = @(
    Get-ChildItem -LiteralPath $resolvedBundleRoot -Recurse -File |
        Where-Object { $_.Name -like "*-setup.exe" }
)
$msiInstallers = @(
    Get-ChildItem -LiteralPath $resolvedBundleRoot -Recurse -File |
        Where-Object { $_.Extension -ieq ".msi" }
)
if ($nsisInstallers.Count -ne 1) {
    throw "Expected exactly one NSIS setup executable under $resolvedBundleRoot; found $($nsisInstallers.Count)"
}
if ($msiInstallers.Count -ne 1) {
    throw "Expected exactly one MSI installer under $resolvedBundleRoot; found $($msiInstallers.Count)"
}

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
    $InstallRoot = Join-Path ([System.IO.Path]::GetTempPath()) "kqode-package-smoke-$PID"
}
$resolvedInstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)

function Invoke-PackagedDiagnostic {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,

        [Parameter(Mandatory = $true)]
        [string]$BundleName
    )

    $application = Get-ChildItem -LiteralPath $Root -Recurse -File |
        Where-Object { $_.Name -ieq "kqode-desktop.exe" } |
        Select-Object -First 1
    if ($null -eq $application) {
        throw "$BundleName did not install kqode-desktop.exe under $Root"
    }

    $diagnostic = Start-Process -FilePath $application.FullName `
        -ArgumentList "--verify-copilot-sdk-bundle" `
        -PassThru
    if (-not $diagnostic.WaitForExit(60000)) {
        $diagnostic.Kill($true)
        throw "$BundleName Copilot SDK diagnostic timed out after 60 seconds"
    }
    if ($diagnostic.ExitCode -ne 0) {
        throw "$BundleName Copilot SDK diagnostic exited with code $($diagnostic.ExitCode)"
    }

    if ($VerifyCopilotLogin) {
        $authentication = Start-Process -FilePath $application.FullName `
            -ArgumentList "--verify-copilot-sdk-auth" `
            -PassThru
        if (-not $authentication.WaitForExit(60000)) {
            $authentication.Kill($true)
            throw "$BundleName Copilot authentication diagnostic timed out after 60 seconds"
        }
        if ($authentication.ExitCode -ne 0) {
            throw "$BundleName Copilot authentication diagnostic exited with code $($authentication.ExitCode)"
        }
    }
}

$nsisRoot = "$resolvedInstallRoot-nsis"
$msiRoot = "$resolvedInstallRoot-msi"
foreach ($root in @($nsisRoot, $msiRoot)) {
    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}

try {
    $nsisInstall = Start-Process -FilePath $nsisInstallers[0].FullName `
        -ArgumentList "/S", "/D=$nsisRoot" `
        -Wait -PassThru
    if ($nsisInstall.ExitCode -ne 0) {
        throw "NSIS installer exited with code $($nsisInstall.ExitCode)"
    }
    Invoke-PackagedDiagnostic -Root $nsisRoot -BundleName "NSIS"

    New-Item -ItemType Directory -Path $msiRoot -Force | Out-Null
    $msiArguments = @(
        "/a",
        "`"$($msiInstallers[0].FullName)`"",
        "/qn",
        "/norestart",
        "TARGETDIR=`"$msiRoot`""
    )
    $msiInstall = Start-Process -FilePath "msiexec.exe" `
        -ArgumentList $msiArguments `
        -Wait -PassThru
    if ($msiInstall.ExitCode -ne 0) {
        throw "MSI administrative install exited with code $($msiInstall.ExitCode)"
    }
    Invoke-PackagedDiagnostic -Root $msiRoot -BundleName "MSI"
}
finally {
    $uninstaller = Get-ChildItem -LiteralPath $nsisRoot -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "uninstall*.exe" } |
        Select-Object -First 1
    if ($null -ne $uninstaller) {
        $uninstall = Start-Process -FilePath $uninstaller.FullName `
            -ArgumentList "/S" `
            -Wait -PassThru
        if ($uninstall.ExitCode -ne 0) {
            Write-Warning "NSIS uninstaller exited with code $($uninstall.ExitCode)"
        }
    }
    foreach ($root in @($nsisRoot, $msiRoot)) {
        if (Test-Path -LiteralPath $root) {
            Remove-Item -LiteralPath $root -Recurse -Force
        }
    }
}
