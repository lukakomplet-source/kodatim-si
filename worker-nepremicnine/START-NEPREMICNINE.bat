@echo off
title SBN Nepremicnine (lokalna baza)
echo ============================================================
echo   SBN NEPREMICNINE - zbiralnik z nepremicnine.net
echo   Izpis: C:\Users\lukak\avtonet-db\nepremicnine.log
echo ============================================================
cd /d "C:\Users\lukak\Documents\AI AGENCIJA WEB\kodatim-si\worker-nepremicnine"
powershell -NoProfile -Command "$l='C:\Users\lukak\avtonet-db\nepremicnine.log'; if ((Test-Path $l) -and ((Get-Item $l).Length -gt 20MB)) { Move-Item $l ($l + '.1') -Force }"
:zagon
echo. >> "C:\Users\lukak\avtonet-db\nepremicnine.log"
call npm run start >> "C:\Users\lukak\avtonet-db\nepremicnine.log" 2>&1
echo Zbiralnik se je ustavil. Cez 10 s znova... >> "C:\Users\lukak\avtonet-db\nepremicnine.log"
timeout /t 10 >nul
goto zagon
