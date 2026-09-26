<#
==============================================================================
convert.ps1 — Ultra-Resilient 3D Reverse-Engineering Pipeline Runner (Windows PowerShell)
Supports Windows 10, 11, Server (x64 / ARM64) on PowerShell 5.1 & PowerShell Core 7+
==============================================================================
#>
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArgs
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Detect Node.js or Bun runtime
$Runtime = $null
if (Get-Command node -ErrorAction SilentlyContinue) {
    $Runtime = "node"
} elseif (Get-Command bun -ErrorAction SilentlyContinue) {
    $Runtime = "bun"
}

if (-not $Runtime) {
    Write-Host "[ERROR] Node.js (v20+) or Bun is required. Please install Node.js (https://nodejs.org)." -ForegroundColor Red
    exit 1
}

# 2. Memory & Core budget calculation
try {
    $TotalMemBytes = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
    $TotalMemMB = [math]::Floor($TotalMemBytes / 1MB)
} catch {
    $TotalMemMB = 8192
}

$HeapMB = [math]::Floor($TotalMemMB * 0.6)
if ($HeapMB -gt 8192) { $HeapMB = 8192 }
if ($HeapMB -lt 2048) { $HeapMB = 2048 }

# 3. Check node_modules
$NodeModules = Join-Path $ScriptDir "node_modules"
if (-not (Test-Path $NodeModules)) {
    Write-Host "[INFO] Installing dependencies..." -ForegroundColor Cyan
    Push-Location $ScriptDir
    try {
        if ($Runtime -eq "bun") {
            bun install
        } else {
            npm install --no-audit --no-fund
        }
    } finally {
        Pop-Location
    }
}

# 4. Check or compile TypeScript
$DistCli = Join-Path $ScriptDir "dist\cli.js"
$SrcDir = Join-Path $ScriptDir "src"

$NeedCompile = $false
if (-not (Test-Path $DistCli)) {
    $NeedCompile = $true
} else {
    $CliTime = (Get-Item $DistCli).LastWriteTime
    $LatestSrc = (Get-ChildItem -Path $SrcDir -Recurse -Filter *.ts | Measure-Object -Property LastWriteTime -Maximum).Maximum
    if ($LatestSrc -gt $CliTime) {
        $NeedCompile = $true
    }
}

if ($NeedCompile) {
    Write-Host "[INFO] Compiling TypeScript pipeline..." -ForegroundColor Cyan
    Push-Location $ScriptDir
    try {
        npx tsc
        Write-Host "[SUCCESS] TypeScript compilation completed." -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# 5. Check test mode
$IsTestMode = $false
foreach ($arg in $ScriptArgs) {
    if ($arg -eq "--test") {
        $IsTestMode = $true
        break
    }
}

$TargetScript = if ($IsTestMode) { Join-Path $ScriptDir "dist\test\run-tests.js" } else { $DistCli }

# 6. Execute pipeline
$NodeArgs = @(
    "--max-old-space-size=$HeapMB",
    "--stack-size=8192",
    "--expose-gc",
    $TargetScript
) + $ScriptArgs

if ($Runtime -eq "node") {
    & node $NodeArgs
    exit $LASTEXITCODE
} else {
    & bun run $TargetScript $ScriptArgs
    exit $LASTEXITCODE
}
