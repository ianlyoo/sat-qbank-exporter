@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js 20+ is required to run SAT Question Bank Exporter.
  echo Install Node.js from https://nodejs.org/ and run this launcher again.
  echo.
  pause
  exit /b 1
)

node scripts\launch.mjs
if errorlevel 1 (
  echo.
  echo The launcher did not finish successfully.
  echo.
  pause
  exit /b 1
)

endlocal
