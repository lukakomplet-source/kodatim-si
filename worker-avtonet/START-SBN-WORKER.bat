@echo off
setlocal enabledelayedexpansion
title SBN Auto - Worker
cd /d "%~dp0"

rem SBN Auto local worker launcher.
rem
rem The worker talks straight to Supabase and to avto.net; it needs neither
rem Vercel nor an open browser. Leave this window open while collecting. Closing
rem it (or Ctrl+C) stops the sweep cleanly and it resumes from its last slice
rem next time.

if not exist ".env" (
  echo [NAPAKA] Ni .env datoteke. Najprej zazenite SETUP-SBN-WORKER.bat.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo [NAPAKA] Node.js ni najden. Zazenite SETUP-SBN-WORKER.bat.
  pause
  exit /b 1
)

rem Restart loop with growing backoff, so a crash does not become a tight loop.
rem A clean stop (Ctrl+C, exit code 0) leaves the loop instead of restarting.
set /a ATTEMPT=0

:run
echo ============================================================
echo   SBN AUTO WORKER
echo   %DATE% %TIME%
echo   Za zaustavitev: zaprite okno ali pritisnite Ctrl+C
echo ============================================================
call npm start
set EXITCODE=!ERRORLEVEL!

if "!EXITCODE!"=="0" (
  echo.
  echo Worker se je koncal normalno. Zapiram.
  goto end
)

set /a ATTEMPT+=1
set /a WAIT=ATTEMPT*10
if !WAIT! GTR 120 set WAIT=120
echo.
echo [OPOZORILO] Worker se je ustavil ^(koda !EXITCODE!^). Ponoven zagon cez !WAIT! s ^(poskus !ATTEMPT!^).
echo             Za dokoncno ustavitev zaprite to okno.
timeout /t !WAIT! /nobreak >nul
goto run

:end
pause
