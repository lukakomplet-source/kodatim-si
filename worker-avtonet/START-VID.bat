@echo off
setlocal enabledelayedexpansion
title SBN Auto - vizualni pregled slik (lokalni AI)
cd /d "%~dp0"

rem Lokalni vizualni model pogleda slike novih oglasov in pove, kaksno opremo
rem vidi in ali gre za facelift. Slike bere z diska (shranil jih je PDF arhivar),
rem zato avto.net ne dobi niti enega zahtevka. Model tece prek Ollame na tej
rem grafcni kartici - nic ne gre v oblak in nic ne stane.

if not exist ".env" (
  echo [NAPAKA] Ni .env datoteke.
  pause
  exit /b 1
)

set /a ATTEMPT=0
:run
echo ============================================================
echo   SBN AUTO - VIZUALNI PREGLED SLIK
echo   %DATE% %TIME%
echo ============================================================
call npm run vid
set EXITCODE=!ERRORLEVEL!
if "!EXITCODE!"=="0" goto end
set /a ATTEMPT+=1
set /a WAIT=ATTEMPT*15
if !WAIT! GTR 180 set WAIT=180
echo [OPOZORILO] Ustavil se je ^(koda !EXITCODE!^). Ponoven zagon cez !WAIT! s.
timeout /t !WAIT! /nobreak >nul
goto run
:end
pause
