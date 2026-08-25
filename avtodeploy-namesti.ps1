# KodaTim - namestitev avtomatskega deploya (pozenes ENKRAT, potem gre samo).
#
# Zagon (PowerShell v mapi projekta):
#   powershell -ExecutionPolicy Bypass -File .\avtodeploy-namesti.ps1
#
# Kaj naredi:
#   1. preveri git in node, namesti pakete (npm install)
#   2. registrira Nacrtovano opravilo "KodaTim avtodeploy", ki vsakih 5 minut
#      in ob vsaki prijavi pozene avtodeploy.ps1 (git pull + build + streznik)
#   3. takoj pozene prvi deploy, da stran zacne teci ze zdaj
#
# Od takrat naprej: vsak push na GitHub (main) se v najvec ~5 minutah sam
# prenese, zgradi in objavi. Racunalnik mora biti prizgan in uporabnik prijavljen.
#
# Izklop:  Unregister-ScheduledTask -TaskName "KodaTim avtodeploy" -Confirm:$false
# Dnevnik: .avtodeploy\dnevnik.log
#
# OPOMBA O ZNAKIH: ASCII brez sumnikov, shranjeno z BOM - glej opombo v
# worker-avtonet\setup.ps1.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "KodaTim - namestitev avtomatskega deploya" -ForegroundColor Cyan
Write-Host ""

# PATH osvezitev (node/git nista vedno v PATH sveze odprtega okna).
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

$nodeVersion = $null
try { $nodeVersion = (node --version) } catch { $nodeVersion = $null }
if (-not $nodeVersion) {
    Write-Host "Node.js ni namescen ali ni v PATH." -ForegroundColor Red
    exit 1
}
$gitVersion = $null
try { $gitVersion = (git --version) } catch { $gitVersion = $null }
if (-not $gitVersion) {
    Write-Host "Git ni namescen ali ni v PATH." -ForegroundColor Red
    exit 1
}
Write-Host "Node.js: $nodeVersion, $gitVersion" -ForegroundColor Green
Write-Host ""

Write-Host "1/3  Namescam pakete (npm install) ..." -ForegroundColor Cyan
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) {
    Write-Host "Namestitev paketov ni uspela." -ForegroundColor Red
    exit 1
}
Write-Host ""

Write-Host "2/3  Registriram Nacrtovano opravilo 'KodaTim avtodeploy' ..." -ForegroundColor Cyan
$skripta = Join-Path $PSScriptRoot "avtodeploy.ps1"
$argumenti = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$skripta`""
$akcija = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argumenti -WorkingDirectory $PSScriptRoot

# Vsakih 5 minut (repeticija se po ponovnem zagonu racunalnika nadaljuje sama)
# in se ob vsaki prijavi, da stran po rebootu takoj ozivi.
$vsakih5 = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$obPrijavi = New-ScheduledTaskTrigger -AtLogOn

$nastavitve = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable

# Register-ScheduledTask zna brez skrbniskih pravic vrniti "Access is denied"
# (0x80070005) - v tem primeru isto opravilo ustvarimo prek schtasks.exe, ki
# za navadnega uporabnika deluje (le prozilca "ob prijavi" ne zna brez admina;
# 5-minutni razpored po prijavi tako ali tako stece v nekaj minutah).
try {
    Register-ScheduledTask -TaskName "KodaTim avtodeploy" -Action $akcija -Trigger $vsakih5, $obPrijavi -Settings $nastavitve -Description "Vsakih 5 minut potegne novosti z GitHuba (main), zgradi stran in skrbi, da next start tece za kodatim.si tunel." -Force | Out-Null
    Write-Host "     Opravilo registrirano (vsakih 5 minut + ob prijavi)." -ForegroundColor Green
} catch {
    Write-Host "     Register-ScheduledTask ni sel skozi - poskusam schtasks ..." -ForegroundColor Yellow
    $tr = 'powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $skripta + '"'
    schtasks /Create /TN "KodaTim avtodeploy" /TR $tr /SC MINUTE /MO 5 /F | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Tudi schtasks ni uspel - odpri PowerShell z 'Zazeni kot skrbnik' in ponovi to skripto." -ForegroundColor Red
        exit 1
    }
    Write-Host "     Opravilo registrirano prek schtasks (vsakih 5 minut)." -ForegroundColor Green
}
Write-Host ""

Write-Host "3/3  Prvi deploy (build + zagon streznika) - traja minuto ali dve ..." -ForegroundColor Cyan
& $skripta
Write-Host ""

Write-Host "Narejeno." -ForegroundColor Green
Write-Host "  - Vsak push na GitHub (main) bo odslej na strani v najvec ~5 minutah." -ForegroundColor Gray
Write-Host "  - Dnevnik: .avtodeploy\dnevnik.log" -ForegroundColor Gray
Write-Host "  - Streznik tece na vratih 3001 (tja kaze cloudflared tunel); ce se" -ForegroundColor Gray
Write-Host "    port spremeni, popravi vrednost `$vrata na vrhu avtodeploy.ps1." -ForegroundColor Gray
Write-Host "  - Izklop: Unregister-ScheduledTask -TaskName 'KodaTim avtodeploy' -Confirm:`$false" -ForegroundColor Gray
