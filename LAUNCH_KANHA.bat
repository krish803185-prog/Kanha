@echo off
setlocal EnableExtensions
title KANHA // SPATIAL OS - Launcher
cd /d "%~dp0"

set "KANHA_URL=http://localhost:5173"
set "KANHA_PROFILE=%LOCALAPPDATA%\KANHA\app-profile"

where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js not found. Run INSTALL_AND_CREATE_SHORTCUT.bat first.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo  [*] First run - installing dependencies ...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo  [X] npm install failed.
    pause
    exit /b 1
  )
)

rem ---------------------------------------------------------------
rem  Start Vite (5173) + Neural WebSocket Relay (8081) unless they are
rem  already running from an earlier launch.
rem ---------------------------------------------------------------
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%KANHA_URL%') > $null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo  [*] Starting Nexus servers ^(Vite + Neural Relay^) ...
  start "KANHA Nexus Servers" /min cmd /c "npm run start"
) else (
  echo  [OK] Nexus servers already online.
)

echo  [*] Waiting for %KANHA_URL% ...
powershell -NoProfile -Command ^
  "$deadline = (Get-Date).AddSeconds(90);" ^
  "while ((Get-Date) -lt $deadline) { try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%KANHA_URL%') > $null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }" ^
  "exit 1"
if errorlevel 1 (
  echo  [X] Server did not come up within 90 s. Check the "KANHA Nexus Servers" window.
  pause
  exit /b 1
)

rem ---------------------------------------------------------------
rem  Borderless full-screen App Mode. A dedicated profile guarantees the
rem  flags apply even when the browser is already open.
rem ---------------------------------------------------------------
rem Paths such as "Program Files (x86)" contain ")" which breaks cmd's
rem parenthesised blocks, so this section uses single-line IFs and GOTO only.
set "BROWSER="
set "PF86=%ProgramFiles(x86)%"
if not defined BROWSER if exist "%PF86%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%PF86%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%PF86%\Google\Chrome\Application\chrome.exe" set "BROWSER=%PF86%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER goto :default_browser

echo  [OK] Launching App Mode: "%BROWSER%"
start "" "%BROWSER%" --app=%KANHA_URL% --start-fullscreen --user-data-dir="%KANHA_PROFILE%" --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required
goto :launched

:default_browser
echo  [!] Edge/Chrome not found - opening default browser instead.
start "" "%KANHA_URL%"

:launched

echo.
echo  KANHA // SPATIAL OS is running.
echo  Close the "KANHA Nexus Servers" window to shut the servers down.
timeout /t 4 >nul
exit /b 0
