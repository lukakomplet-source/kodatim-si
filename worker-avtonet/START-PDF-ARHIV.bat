@echo off
setlocal enabledelayedexpansion
title SBN Auto - PDF arhivar
cd /d "%~dp0"

rem PDF arhivar: shranjuje kopije oglasov (stran + slike) na zunanji disk,
rem preden oglasi izginejo z avto.neta. Locen proces od glavnega workerja -
rem lahko tece hkrati z njim in ga ne moti. Zapiranje okna ga ustavi;
rem nadaljuje tam, kjer je ostal (vrsto vodi baza).

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

set /a ATTEMPT=0

:run
echo ============================================================
echo   SBN AUTO - PDF ARHIVAR
echo   %DATE% %TIME%
echo   Arhiv: E:\Samo slike od avtonet baza koda tim
echo   Za zaustavitev: zaprite okno ali pritisnite Ctrl+C
echo ============================================================
call npm run pdf
set EXITCODE=!ERRORLEVEL!

if "!EXITCODE!"=="0" (
  echo.
  echo Arhivar se je koncal normalno. Zapiram.
  goto end
)

set /a ATTEMPT+=1
set /a WAIT=ATTEMPT*15
if !WAIT! GTR 180 set WAIT=180
echo.
echo [OPOZORILO] Arhivar se je ustavil ^(koda !EXITCODE!^). Ponoven zagon cez !WAIT! s ^(poskus !ATTEMPT!^).
timeout /t !WAIT! /nobreak >nul
goto run

:end
pause
