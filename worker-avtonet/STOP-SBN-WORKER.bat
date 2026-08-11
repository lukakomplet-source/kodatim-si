@echo off
setlocal
title SBN Auto - Ustavi worker
cd /d "%~dp0"

echo ============================================================
echo   SBN AUTO - USTAVITEV WORKERJA
echo ============================================================
echo.

rem The work is in ustavi-worker.ps1, not inline here: quoting a script of that
rem shape through cmd.exe is fragile enough that it broke while being written.
powershell -NoProfile -ExecutionPolicy Bypass -File ".\ustavi-worker.ps1"

echo.
echo ============================================================
echo   Zdaj lahko zazenete START-SBN-WORKER.bat
echo   Pregled se nadaljuje tam, kjer je ostal - nic ni izgubljeno.
echo ============================================================
echo.
pause
