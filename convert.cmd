@echo off
rem ==============================================================================
rem convert.cmd — Ultra-Resilient 3D Reverse-Engineering Pipeline Runner (Windows CMD)
rem Supports Windows 10, 11, Server (x64 / ARM64)
rem ==============================================================================
setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

where node >nul 2>nul
if %errorlevel% neq 0 (
    where bun >nul 2>nul
    if %errorlevel% neq 0 (
        echo [ERROR] Node.js (v20+) or Bun is required to run ReverseCAD.
        exit /b 1
    )
    set "RUNTIME=bun"
) else (
    set "RUNTIME=node"
)

if not exist "%SCRIPT_DIR%\node_modules" (
    echo [INFO] First run: Installing dependencies...
    pushd "%SCRIPT_DIR%"
    call npm install --no-audit --no-fund
    popd
)

if not exist "%SCRIPT_DIR%\dist\cli.js" (
    echo [INFO] Compiling TypeScript pipeline...
    pushd "%SCRIPT_DIR%"
    call npx tsc
    popd
)

set "TARGET_SCRIPT=%SCRIPT_DIR%\dist\cli.js"
for %%A in (%*) do (
    if "%%A"=="--test" (
        set "TARGET_SCRIPT=%SCRIPT_DIR%\dist\test\run-tests.js"
    )
)

if "%RUNTIME%"=="node" (
    node --max-old-space-size=8192 --stack-size=8192 --expose-gc "%TARGET_SCRIPT%" %*
) else (
    bun run "%TARGET_SCRIPT%" %*
)
exit /b %errorlevel%
