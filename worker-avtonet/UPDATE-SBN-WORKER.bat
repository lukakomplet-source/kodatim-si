@echo off
setlocal
title SBN Auto - Update
cd /d "%~dp0"

echo ============================================================
echo   SBN AUTO WORKER - POSODOBITEV
echo ============================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [NAPAKA] git ni nameoscen, zato samodejna posodobitev ni mogoca.
  echo         Namestite Git for Windows ^(https://git-scm.com/download/win^).
  pause
  exit /b 1
)

echo Potegujem najnovejso kodo z GitHuba...
rem --ff-only: nikoli ne poskusi zdruzevati; ce so lokalne spremembe, raje odpove
rem in nic ne pokvari. .env ni v gitu, zato ga posodobitev ne more povoziti.
git pull --ff-only
if errorlevel 1 (
  echo.
  echo [OPOZORILO] git pull ni uspel ^(morda imate lokalne spremembe^).
  echo             .env je varen - ni v gitu. Resite git stanje in poskusite znova.
  pause
  exit /b 1
)

echo.
echo Posodabljam pakete...
call npm install --no-audit --no-fund

echo.
echo Preverjam brskalnik...
call npx playwright install chromium

echo.
echo ============================================================
echo   POSODOBITEV KONCANA
echo   Worker zazenete z START-SBN-WORKER.bat
echo ============================================================
pause
