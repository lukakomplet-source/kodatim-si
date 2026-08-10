# SBN Auto — lokalna namestitev zbiralnika.
#
# Poženite enkrat:
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
#
# Skripta naredi vse, česar ni treba odločati: namesti pakete, prenese
# Chromium, pripravi .env. Edina stvar, ki je ne more narediti, sta dve
# skrivnosti iz Supabase — za tisti korak vas na koncu izrecno opozori.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "SBN Auto — namestitev zbiralnika" -ForegroundColor Cyan
Write-Host ""

# Node/npm nista vedno v PATH sveže odprtega okna.
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path", "User")

try {
  $nodeVersion = node --version
  Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
} catch {
  Write-Host "Node.js ni nameščen. Namestite ga z https://nodejs.org (LTS) in poženite skripto znova." -ForegroundColor Red
  exit 1
}

Write-Host "1/3  Nameščam pakete ..." -ForegroundColor Cyan
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Write-Host "Namestitev paketov ni uspela." -ForegroundColor Red; exit 1 }

Write-Host "2/3  Prenašam brskalnik Chromium (potreben, ker avto.net navadnih zahtevkov ne postreže) ..." -ForegroundColor Cyan
npx playwright install chromium
if ($LASTEXITCODE -ne 0) { Write-Host "Prenos brskalnika ni uspel." -ForegroundColor Red; exit 1 }

Write-Host "3/3  Pripravljam .env ..." -ForegroundColor Cyan
$envPath = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envPath)) {
  Copy-Item (Join-Path $PSScriptRoot ".env.example") $envPath
  Write-Host "     Ustvarjen .env" -ForegroundColor Green
} else {
  Write-Host "     .env že obstaja — pustim ga pri miru" -ForegroundColor Green
}

# Ali sta skrivnosti dejansko izpolnjeni? Prazen ključ je najpogostejši razlog,
# da prvi zagon "ne dela", zato to preverimo zdaj in ne šele ob napaki.
$envText = Get-Content $envPath -Raw
$urlSet = $envText -match "SUPABASE_URL=\s*https?://\S+"
$keySet = $envText -match "SUPABASE_SERVICE_ROLE_KEY=\s*\S+"

Write-Host ""
if ($urlSet -and $keySet) {
  Write-Host "Vse pripravljeno." -ForegroundColor Green
  Write-Host ""
  Write-Host "Test enega kroga:   npm run once" -ForegroundColor White
  Write-Host "Stalno delovanje:   npm start" -ForegroundColor White
} else {
  Write-Host "OSTAL JE EN KORAK — samo ta, in samo enkrat:" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  Odprite Supabase -> projekt kodatim-si -> Settings -> API" -ForegroundColor White
  Write-Host "  in v datoteko worker-avtonet\.env prepišite dve vrednosti:" -ForegroundColor White
  Write-Host ""
  Write-Host "     SUPABASE_URL=              (Project URL)" -ForegroundColor White
  Write-Host "     SUPABASE_SERVICE_ROLE_KEY= (service_role secret)" -ForegroundColor White
  Write-Host ""
  Write-Host "  Nato poženite:  npm run once" -ForegroundColor White
  Write-Host ""
  Write-Host "  Ta ključ je skrivnost — ne deli ga in ne shranjuj v git (.env je že v .gitignore)." -ForegroundColor DarkYellow
}
Write-Host ""
