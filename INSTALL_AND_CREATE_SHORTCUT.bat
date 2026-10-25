@echo off
setlocal EnableExtensions
title KANHA // SPATIAL OS - Installer
cd /d "%~dp0"

echo.
echo  ================================================================
echo     KANHA // SPATIAL OS  -  v1.0.0  -  One-Click Installer
echo     Gesture-Driven Spatial Maritime Operating System
echo  ================================================================
echo.

rem ---------------------------------------------------------------
rem  1. Node.js runtime check (auto-install via winget when possible)
rem ---------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  [!] Node.js was not found on this machine.
  where winget >nul 2>nul
  if errorlevel 1 goto :no_node
  echo  [*] Installing Node.js LTS with winget ...
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  rem winget updates PATH for new shells only - pick up the default install dir.
  if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
  where node >nul 2>nul
  if errorlevel 1 goto :no_node
)
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo  [OK] Node.js %NODE_VER% detected.

rem ---------------------------------------------------------------
rem  2. Dependencies
rem ---------------------------------------------------------------
if not exist "node_modules\" (
  echo  [*] node_modules missing - running npm install ^(first run only^) ...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo  [X] npm install failed. Check your internet connection and retry.
    pause
    exit /b 1
  )
) else (
  echo  [OK] Dependencies already installed.
)

rem ---------------------------------------------------------------
rem  3. Offline hand-tracking model (optic sensors fall back to CDN)
rem ---------------------------------------------------------------
if not exist "public\models\hand_landmarker.task" (
  echo  [*] Downloading MediaPipe hand landmark model ...
  if not exist "public\models\" mkdir "public\models"
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { Invoke-WebRequest -UseBasicParsing -Uri 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task' -OutFile 'public\models\hand_landmarker.task'; exit 0 } catch { exit 1 }"
  if errorlevel 1 (
    echo  [!] Model download failed - optic sensors will stream it from the CDN instead.
  ) else (
    echo  [OK] Hand model cached locally.
  )
)

rem ---------------------------------------------------------------
rem  4. Desktop shortcut "KANHA Spatial OS" -> LAUNCH_KANHA.bat
rem     GetFolderPath('Desktop') resolves OneDrive-redirected desktops.
rem ---------------------------------------------------------------
echo  [*] Creating Desktop shortcut "KANHA Spatial OS" ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desk = [Environment]::GetFolderPath('Desktop');" ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$lnk = $ws.CreateShortcut((Join-Path $desk 'KANHA Spatial OS.lnk'));" ^
  "$lnk.TargetPath = '%~dp0LAUNCH_KANHA.bat';" ^
  "$lnk.WorkingDirectory = '%~dp0';" ^
  "$lnk.WindowStyle = 7;" ^
  "$lnk.Description = 'KANHA // SPATIAL OS - Gesture-Driven Spatial Maritime Operating System';" ^
  "$lnk.IconLocation = $env:SystemRoot + '\System32\shell32.dll,13';" ^
  "$lnk.Save();" ^
  "Write-Host ('  [OK] Shortcut created at ' + (Join-Path $desk 'KANHA Spatial OS.lnk'))"
if errorlevel 1 echo  [!] Shortcut creation failed - you can still double-click LAUNCH_KANHA.bat.

echo.
echo  [*] Booting KANHA // SPATIAL OS ...
call "%~dp0LAUNCH_KANHA.bat"
exit /b 0

:no_node
echo.
echo  [X] Node.js 20.19+ is required. Opening the download page ...
echo      Install the LTS build, then double-click this installer again.
start "" "https://nodejs.org/en/download"
pause
exit /b 1
