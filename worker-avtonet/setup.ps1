# SBN Auto - lokalna namestitev zbiralnika.
#
# Zagon:
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
#
# Skripta naredi vse, cesar ni treba odlocati: namesti pakete, prenese
# Chromium, pripravi .env. Edino, cesar ne more narediti, sta dve skrivnosti
# iz Supabase - nanju vas opozori na koncu.
#
# OPOMBA O ZNAKIH: datoteka je namenoma brez pomisljajev in tipografskih
# narekovajev. Windows PowerShell 5.1 bere .ps1 kot Windows-1252, kadar ni
# BOM-a, in bajt 0x94 iz pomisljaja se prebere kot zakljucni pametni
# narekovaj - kar je parser razumel kot zacetek niza in razsulo celo skripto.
# Datoteka se zato hrani z BOM, dodatno pa se posebnim locilom izogibamo.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "SBN Auto - namestitev zbiralnika" -ForegroundColor Cyan
Write-Host ""

# Node in npm nista vedno v PATH sveze odprtega okna. Vsak del v svoji
# spremenljivki: nadaljevanje vrstice z zakljucnim + je krhko in je bilo
# eden od razlogov, da se skripta prej ni prevedla.
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

$nodeVersion = $null
try {
    $nodeVersion = (node --version) 2>$null
} catch {
    $nodeVersion = $null
}

if (-not $nodeVersion) {
    Write-Host "Node.js ni namescen ali ni v PATH." -ForegroundColor Red
    Write-Host "Namestite LTS z https://nodejs.org in pozenite skripto znova." -ForegroundColor Red
    exit 1
}
Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
Write-Host ""

Write-Host "1/3  Namescam pakete ..." -ForegroundColor Cyan
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) {
    Write-Host "Namestitev paketov ni uspela." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "2/3  Prenasam brskalnik Chromium ..." -ForegroundColor Cyan
Write-Host "     (potreben je, ker avto.net navadnih zahtevkov ne postreze)" -ForegroundColor DarkGray
npx playwright install chromium
if ($LASTEXITCODE -ne 0) {
    Write-Host "Prenos brskalnika ni uspel." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "3/3  Pripravljam .env ..." -ForegroundColor Cyan
$envPath = Join-Path $PSScriptRoot ".env"
$examplePath = Join-Path $PSScriptRoot ".env.example"

if (-not (Test-Path $envPath)) {
    Copy-Item $examplePath $envPath
    Write-Host "     Ustvarjen .env" -ForegroundColor Green
} else {
    Write-Host "     .env ze obstaja - pustim ga pri miru" -ForegroundColor Green
}

# Prazen kljuc je najpogostejsi razlog, da prvi zagon "ne dela". Preverimo
# zdaj, ne sele ob napaki.
$envText = Get-Content $envPath -Raw
$urlSet = $envText -match "SUPABASE_URL\s*=\s*https?://\S+"
$keySet = $envText -match "SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+"

Write-Host ""
if ($urlSet -and $keySet) {
    Write-Host "Vse pripravljeno." -ForegroundColor Green
    Write-Host ""
    Write-Host "  Test enega kroga:   npm run once" -ForegroundColor White
    Write-Host "  Stalno delovanje:   npm start" -ForegroundColor White
} else {
    Write-Host "OSTAL JE EN KORAK - samo ta, in samo enkrat:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Odprite Supabase -> projekt kodatim-si -> Settings -> API" -ForegroundColor White
    Write-Host "  2. V datoteko worker-avtonet\.env prepisite dve vrednosti:" -ForegroundColor White
    Write-Host ""
    Write-Host "       SUPABASE_URL=              (Project URL)" -ForegroundColor White
    Write-Host "       SUPABASE_SERVICE_ROLE_KEY= (service_role secret)" -ForegroundColor White
    Write-Host ""
    Write-Host "  3. Nato:  npm run once" -ForegroundColor White
    Write-Host ""
    Write-Host "  Ta kljuc je skrivnost. Ne delite ga in ne shranjujte v git." -ForegroundColor DarkYellow
    Write-Host "  .env je ze v .gitignore, zato v repozitorij ne more priti." -ForegroundColor DarkYellow
}
Write-Host ""
