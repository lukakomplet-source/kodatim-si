@echo off
setlocal enabledelayedexpansion
title SBN Auto - Setup
cd /d "%~dp0"

echo ============================================================
echo   SBN AUTO WORKER - ZACETNA NAMESTITEV
echo ============================================================
echo.

rem --- 1. Node.js -------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [NAPAKA] Node.js ni nameoscen.
  echo         Namestite ga z https://nodejs.org ^(LTS^), nato znova zazenite to datoteko.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODEV=%%v
echo [OK] Node.js !NODEV!

rem --- 2. npm -----------------------------------------------------------
where npm >nul 2>nul
if errorlevel 1 (
  echo [NAPAKA] npm ni na voljo ^(obicajno pride z Node.js^).
  pause
  exit /b 1
)
echo [OK] npm na voljo

rem --- 3. Odvisnosti ----------------------------------------------------
echo.
echo Namescam pakete ^(npm install^)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [NAPAKA] npm install ni uspel. Preverite internetno povezavo.
  pause
  exit /b 1
)
echo [OK] Paketi nameosceni

rem --- 4. Playwright Chromium ------------------------------------------
echo.
echo Namescam brskalnik Chromium za Playwright...
call npx playwright install chromium
if errorlevel 1 (
  echo [OPOZORILO] Namestitev Chromiuma ni uspela. Poskusite znova ali zazenite:
  echo             npx playwright install chromium
)
echo [OK] Chromium pripravljen

rem --- 5. .env ----------------------------------------------------------
echo.
if exist ".env" (
  echo [OK] .env ze obstaja - ohranjam.
) else (
  copy ".env.example" ".env" >nul
  echo [POZOR] Ustvaril sem .env iz predloge.
  echo         Odprite datoteko .env in vpisite:
  echo           SUPABASE_URL=...
  echo           SUPABASE_SERVICE_ROLE_KEY=...
  echo         ^(vrednosti dobite v Supabase: Settings -^> API^)
  echo.
  echo         Odpiram .env v Beleznici...
  start notepad ".env"
  echo.
  echo Ko vpisete oba podatka in shranite, pritisnite tipko za nadaljevanje.
  pause
)

rem --- 6. Preverjanje povezave -----------------------------------------
echo.
echo Preverjam povezavo s Supabase...
call npm run --silent test:db
if errorlevel 1 (
  echo.
  echo [NAPAKA] Povezava s Supabase ni uspela.
  echo         Najpogosteje: manjkata ali sta napacna SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY v .env.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   SETUP USPESEN
echo ============================================================
echo   Zdaj lahko zazenete worker z dvoklikom na:
echo       START-SBN-WORKER.bat
echo ============================================================
echo.
pause
