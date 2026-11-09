# Install this fork's standalone omp from GitHub Releases.
# Usage:
#   irm https://raw.githubusercontent.com/incloon/oh-my-pi/dev/scripts/github-install.ps1 | iex
#
# Pin a tag:
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/incloon/oh-my-pi/dev/scripts/github-install.ps1))) -Ref v18.18.0

param(
    [string]$Ref
)

$ProgressPreference = "SilentlyContinue"
if ($PSVersionTable.PSVersion -lt [version]"5.1") {
    throw "Windows PowerShell 5.1 or newer is required."
}

$Repo = "incloon/oh-my-pi"
$InstallDir = if ($env:PI_INSTALL_DIR) { $env:PI_INSTALL_DIR } else { "$env:LOCALAPPDATA\omp" }
$RawArchitecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
if ($RawArchitecture -ne "AMD64") {
    throw "This fork publishes windows-x64 only (found $RawArchitecture)."
}

$Asset = "omp-windows-x64.exe"
$Tag = if ($Ref) { $Ref } else { "latest" }
$Base = if ($Tag -eq "latest") {
    "https://github.com/$Repo/releases/latest/download"
} else {
    "https://github.com/$Repo/releases/download/$Tag"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$DownloadPath = Join-Path $InstallDir ".omp.download.exe"
$OutPath = Join-Path $InstallDir "omp.exe"
try {
    Write-Host "Downloading $Asset from $Repo ($Tag)..."
    curl.exe -fsSL --retry 3 -o $DownloadPath "$Base/$Asset"
    if ($LASTEXITCODE -ne 0) { throw "Failed to download $Asset" }
    $Expected = (curl.exe -fsSL --retry 3 "$Base/$Asset.sha256").Trim().Split()[0].ToLowerInvariant()
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($DownloadPath)
    try { $hash = $sha.ComputeHash($stream) } finally { $stream.Dispose() }
    $Actual = ([System.BitConverter]::ToString($hash) -replace "-", "").ToLowerInvariant()
    if ($Actual -ne $Expected) {
        throw "Checksum mismatch: expected $Expected, got $Actual"
    }
    Move-Item -Force -LiteralPath $DownloadPath -Destination $OutPath
} finally {
    Remove-Item -Force -LiteralPath $DownloadPath -ErrorAction SilentlyContinue
}

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
    Write-Host "Added $InstallDir to user PATH. Restart the terminal, then run omp."
} else {
    Write-Host "Installed $OutPath"
    Write-Host "Run omp to get started."
}
