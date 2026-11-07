# KodaTim - rocna objava spletne strani (objava.ps1).
#
# Zapis ukaza, ki se je doslej ob vsaki objavi tipkal na roko v eno vrstico.
# Koraki, poti, stevila poskusov in pogoji za prekinitev so isti kot v zadnji
# tipkani razlicici; pri vsakem koraku spodaj pise, zakaj je tam.
#
# Bistvo: nova verzija se zgradi POLEG tekoce (v .next_nova) in sele ko je
# gradnja cela, se stran ustavi, mapi zamenjata in stran znova zazene. Stran
# je zato dol samo cas menjave in zagona (ok. 12 s), ne cel build - in ce
# gradnja pade, se tekoce strani sploh ne dotaknemo.
#
# Zagon (PowerShell v mapi projekta):
#   powershell -ExecutionPolicy Bypass -File .\objava.ps1
#
# Kdaj ta skripta in kdaj avtodeploy.ps1:
#   objava.ps1       objavi, kar je ZDAJ v tej mapi - tudi brez commita.
#   avtodeploy.ps1   Nacrtovano opravilo, vsakih 5 minut objavi, kar je novega
#                    na GitHubu (veja main). Objava iz oblacne seje gre prek
#                    njega: push na main JE objava.
#
# Izhodna koda: 0 = objavljeno, 1 = prekinjeno (kaj in zakaj pise v izpisu).
#
# OPOMBA O ZNAKIH: enako kot avtodeploy.ps1 - datoteka je ASCII brez sumnikov
# in tipografskih locil ter shranjena z BOM, ker Windows PowerShell 5.1 brez
# BOM bere Windows-1252 in se skripta sicer razsuje.

[CmdletBinding()]
param(
    # Tunel kodatim-stran kaze na localhost:3001. Ce se port kdaj spremeni,
    # popravi tudi v avtodeploy.ps1 in v START-STRAN.bat.
    [int]$Vrata = 3001,

    # Mapa, kjer zaganjalnik in cuvaj puscata zastavice in dnevnike
    # (ista pot kot NADZOR_MAPA v src/lib/nadzor.ts).
    [string]$MapaStanja = "C:\Users\lukak\avtonet-db",

    # Menjava map: 6 poskusov na 3 s. Windows datoteke v .next spusti z
    # zamikom, zato prvi poskus redno pade z "used by another process".
    [int]$PoskusovMenjave = 6,
    [int]$PremorMenjaveS = 3,

    # Cakanje, da stran po zagonu odgovori: 45 x 2 s = 90 s.
    [int]$PoskusovOdziva = 45,
    [int]$PremorOdzivaS = 2
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$mapaAvtodeploy = Join-Path $PSScriptRoot ".avtodeploy"
$kljucavnica = Join-Path $mapaAvtodeploy "tece.lock"
$tekocaGradnja = Join-Path $mapaAvtodeploy "tekoca-gradnja.txt"
$zastavicaMenjave = Join-Path $MapaStanja "stran.menjava"
$startStran = Join-Path $MapaStanja "START-STRAN.bat"
$mapaNova = Join-Path $PSScriptRoot ".next_nova"
$mapaTekoca = Join-Path $PSScriptRoot ".next"
$mapaPrejsnja = Join-Path $PSScriptRoot ".next_prejsnja"
$naslov = "http://127.0.0.1:$Vrata/"

function Korak([string]$s) { Write-Host ""; Write-Host $s -ForegroundColor Cyan }
function Vredu([string]$s) { Write-Host "  $s" -ForegroundColor Green }
function Opomba([string]$s) { Write-Host "  $s" -ForegroundColor DarkGray }
function Opozorilo([string]$s) { Write-Host "  $s" -ForegroundColor Yellow }
function Napaka([string]$s) { Write-Host "  $s" -ForegroundColor Red }

# node in npx nista vedno v PATH sveze odprtega okna (isti prijem kot v
# avtodeploy.ps1 in worker-avtonet\setup.ps1).
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

Write-Host ""
Write-Host "KodaTim - objava strani" -ForegroundColor Cyan
Write-Host "  Mapa:   $PSScriptRoot"
Write-Host "  Vrata:  $Vrata"
Write-Host "  Stanje: $MapaStanja"

# --- zaklep -----------------------------------------------------------------
#
# Ista kljucavnica kot avtodeploy.ps1, da Nacrtovano opravilo sredi nase
# menjave ne zazene svojega builda: dva Next builda hkrati temu racunalniku
# pojesta pomnilnik, avtodeploy pa bi nam vmes se ustavil streznik.
# Obvisela kljucavnica se po 30 minutah ignorira - enako pravilo kot tam.
if (-not (Test-Path $mapaAvtodeploy)) { New-Item -ItemType Directory -Path $mapaAvtodeploy | Out-Null }
if (Test-Path $kljucavnica) {
    $starost = (Get-Date) - (Get-Item $kljucavnica).LastWriteTime
    if ($starost.TotalMinutes -lt 30) {
        Napaka "PREKINJAM: avtodeploy ravno tece (kljucavnica $kljucavnica)."
        Opomba "Pocakaj minuto ali dve in pozeni znova. Stran tece naprej."
        exit 1
    }
    Opozorilo "Obvisela kljucavnica (stara $([int]$starost.TotalMinutes) min) - jo prevzemam."
}
Set-Content -Path $kljucavnica -Value $PID

$zastavicaPostavljena = $false

try {

    # --- 1. tipi ------------------------------------------------------------
    #
    # Gradnja tipov NE preverja: next.config.ts ima typescript.ignoreBuildErrors
    # = true, ker tsc znotraj builda na tem racunalniku ostane brez pomnilnika.
    # To je torej edini kraj, kjer se tipska napaka pokaze - in zato prva
    # tocka, na kateri se ustavimo, preden karkoli zgradimo.
    Korak "1/8  Preverjam tipe: npx tsc --noEmit"
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) {
        Napaka "PREKINJAM: tsc javlja napake. Stran tece naprej, nic ni bilo spremenjeno."
        exit 1
    }
    Vredu "Tipi so v redu."

    # --- 2. gradnja v .next_nova --------------------------------------------
    #
    # V .next_nova in ne v .next, ker .next ta hip streze tekoca stran: Windows
    # datotek, ki jih drzi next start, ne pusti prepisati. Mapo pred gradnjo
    # pobrisemo, da v njej ne ostane nic od morebitne prejsnje prekinjene
    # objave.
    #
    # POGOJ: v next.config.ts mora biti vrstica
    #     distDir: process.env.NEXT_DIST_DIR || ".next",
    # Next 16 nima stikala --dist-dir in NEXT_DIST_DIR sam po sebi ne bere
    # nikjer, zato je brez te vrstice spodnja nastavitev tiho brez ucinka in
    # gradnja gre v .next pod nogami tekoce strani. Ce te vrstice ni, se
    # objava ustavi na preverjanju BUILD_ID nekaj vrstic nize.
    Korak "2/8  Gradim novo verzijo v .next_nova"
    Opomba "Stran med tem tece naprej na stari zgradbi."
    if (Test-Path $mapaNova) { Remove-Item $mapaNova -Recurse -Force }
    $env:NEXT_DIST_DIR = ".next_nova"
    try {
        npm run build
        $kodaGradnje = $LASTEXITCODE
    } finally {
        # Spremenljivko POCISTIMO takoj: Start-Process nize podeduje okolje
        # starsa, zato bi streznik sicer stregel iz .next_nova, ki jo tik
        # zatem preimenujemo - in stran bi ostala brez svoje izhodne mape.
        Remove-Item Env:\NEXT_DIST_DIR -ErrorAction SilentlyContinue
    }
    if ($kodaGradnje -ne 0) {
        Napaka "PREKINJAM: gradnja ni uspela. Stran tece naprej na stari zgradbi."
        exit 1
    }
    # Gradnja je na tem racunalniku ze tiho umrla sredi izvoza in pustila mapo
    # brez prerender-manifest.json - z izhodno kodo 0. BUILD_ID je prvo, kar
    # takrat manjka; brez tega preverjanja bi tako pohabljeno zgradbo
    # prestavili cez delujoco. Ista preverba ujame tudi manjkajoci distDir:
    # takrat .next_nova sploh ne nastane.
    $potNoveGradnje = Join-Path $mapaNova "BUILD_ID"
    if (-not (Test-Path $potNoveGradnje)) {
        if (-not (Test-Path $mapaNova)) {
            Napaka "PREKINJAM: mape .next_nova ni - gradnja je sla drugam."
            Opomba "Manjka vrstica distDir: process.env.NEXT_DIST_DIR || `".next`", v next.config.ts."
        } else {
            Napaka "PREKINJAM: v .next_nova ni BUILD_ID - gradnja je nepopolna."
        }
        Opomba "Stran tece naprej na stari zgradbi."
        exit 1
    }
    $idNove = (Get-Content $potNoveGradnje -Raw).Trim()
    Vredu "Zgrajeno. Nova zgradba: $idNove"

    # --- 3. zastavica menjave -----------------------------------------------
    #
    # Pove zaganjalniku in cuvaju, naj strani med menjavo NE zaganjata.
    # 19. 9. 2026 jo je eden od njiju v tistih sekundah zagnal iz stare .next,
    # mapa pa je bila zamenjana pod njo: naslovnica je vracala 200, podstrani
    # so padale na manjkajocih kosih, in tako je ostalo 34 ur.
    # START-STRAN.bat na to datoteko CAKA, zato mora iti stran takoj po
    # menjavi (korak 5) - sicer se stran sploh ne more zagnati.
    Korak "3/8  Postavljam zastavico stran.menjava"
    if (-not (Test-Path $MapaStanja)) {
        Napaka "PREKINJAM: mape $MapaStanja ni. Stran tece naprej na stari zgradbi."
        exit 1
    }
    Set-Content -Path $zastavicaMenjave -Value (Get-Date -Format "s")
    $zastavicaPostavljena = $true
    Opomba $zastavicaMenjave

    # --- 4. ustavitev strani ------------------------------------------------
    #
    # Najprej node na vratih, nato se cmd okno zaganjalnika. Zaganjalnik ima
    # zanko, ki streznik po ustavitvi cez 10 s zazene znova - zaradi zastavice
    # iz koraka 3 obvisi na cakanju, vseeno pa ga ustavimo, da nam med menjavo
    # ne drzi datotek.
    Korak "4/8  Ustavljam stran"
    $pidi = @(Get-NetTCPConnection -LocalPort $Vrata -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($p in $pidi) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
    Opomba "Streznik na vratih ${Vrata}: ustavljenih procesov $($pidi.Count)."

    $oken = 0
    Get-CimInstance Win32_Process -Filter "name='cmd.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'START-STRAN' } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            $oken++
        }
    Opomba "Zaganjalnik START-STRAN: ustavljenih oken $oken."

    # --- 5. menjava map -----------------------------------------------------
    #
    # V zanki in s premorom PRED prvim poskusom, ker Windows datoteke spusti
    # sele nekaj trenutkov za tem, ko proces izgine. Vrstni red je pomemben:
    # najprej gre tekoca zgradba na stran (da se jo da vrniti), sele nato nova
    # na njeno mesto. .next_prejsnja je varnostna kopija za hitro vrnitev.
    #
    # Umik tekoce zgradbe je ZNOTRAJ pogoja "ce .next se obstaja" in ne na
    # zacetku poskusa. Sicer se zgodi tole: prvi poskus umakne .next v
    # .next_prejsnja in pade sele na drugem preimenovanju, drugi poskus pa
    # varnostno kopijo pobrise kot "staro" - in po sestih poskusih ni ne .next
    # ne .next_prejsnja, stran pa nima cesa streci.
    Korak "5/8  Menjam .next_nova -> .next"
    $menjavaUspela = $false
    for ($i = 1; $i -le $PoskusovMenjave; $i++) {
        Start-Sleep -Seconds $PremorMenjaveS
        try {
            if (Test-Path $mapaTekoca) {
                if (Test-Path $mapaPrejsnja) { Remove-Item $mapaPrejsnja -Recurse -Force -ErrorAction Stop }
                Rename-Item $mapaTekoca ".next_prejsnja" -ErrorAction Stop
            }
            Rename-Item $mapaNova ".next" -ErrorAction Stop
            $menjavaUspela = $true
            Vredu "Zamenjano v $i. poskusu."
            break
        } catch {
            $sporocilo = $_.Exception.Message
            Opomba "poskus ${i}: $($sporocilo.Substring(0, [Math]::Min(70, $sporocilo.Length)))"
        }
    }

    if (-not $menjavaUspela) {
        # Stran ne sme ostati brez .next. Ce je tekoca zgradba ze odsla na
        # stran, jo vrnemo, da se stran zazene vsaj na stari verziji.
        if ((-not (Test-Path $mapaTekoca)) -and (Test-Path $mapaPrejsnja)) {
            try {
                Rename-Item $mapaPrejsnja ".next" -ErrorAction Stop
                Opozorilo "Vrnil sem prejsnjo zgradbo."
            } catch {
                Napaka "Prejsnje zgradbe ni bilo mogoce vrniti: $($_.Exception.Message)"
            }
        }
        Napaka "MENJAVA NI USPELA - objavljena ostane STARA verzija."
    }

    # Zastavica gre proc TAKOJ po menjavi: START-STRAN.bat v zanki caka, da
    # izgine, in se brez tega sploh ne zazene.
    Remove-Item $zastavicaMenjave -Force -ErrorAction SilentlyContinue
    $zastavicaPostavljena = $false

    # --- 6. zagon -----------------------------------------------------------
    Korak "6/8  Zaganjam stran (START-STRAN.bat)"
    if (-not (Test-Path $startStran)) {
        Napaka "PREKINJAM: zaganjalnika ni na $startStran - stran je DOL."
        Opomba "Zazeni streznik rocno ali popravi pot s parametrom -MapaStanja."
        exit 1
    }
    Start-Process -FilePath $startStran -WindowStyle Minimized
    Opomba $startStran

    # --- 7. cakanje na odziv ------------------------------------------------
    #
    # Steje vsak odgovor, tudi 3xx/4xx/5xx: pomeni, da streznik stoji. Ali je
    # odgovor pravi, pove korak 8.
    Korak "7/8  Cakam, da stran odgovori ($naslov)"
    $koda = $null
    $n = 0
    do {
        Start-Sleep -Seconds $PremorOdzivaS
        $n++
        try {
            $koda = (Invoke-WebRequest -Uri $naslov -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop).StatusCode
        } catch {
            $koda = $null
            if ($_.Exception.Response) { $koda = $_.Exception.Response.StatusCode.value__ }
        }
    } while ((-not $koda) -and ($n -lt $PoskusovOdziva))

    if (-not $koda) {
        Napaka "Stran se v $($PoskusovOdziva * $PremorOdzivaS) s ni oglasila."
        Opomba "Zakaj streznik ne vzide, pise v $(Join-Path $MapaStanja 'stran.log')."
        exit 1
    }
    Vredu "Odgovorila po ok. $($n * $PremorOdzivaS) s (HTTP $koda)."
    if ($koda -ne 200) {
        Opozorilo "Naslovnica vraca HTTP $koda, ne 200 - streznik stoji, stran pa ne dela prav."
        Opomba "Kaj se je zgodilo, pise v $(Join-Path $MapaStanja 'stran.log')."
    }

    # --- 8. katero zgradbo res streze ---------------------------------------
    #
    # Edini zanesljiv odgovor na "sem res objavil, kar mislim". Next 16 oznake
    # gradnje ne pise v HTML, zato je od zunaj ni mogoce izmeriti; ve jo samo
    # proces sam in jo ob zagonu zapise v .avtodeploy\tekoca-gradnja.txt
    # (src/instrumentation.ts) v obliki "<BUILD_ID> <PID> <cas>". PID je tam
    # zato, da bralec loci tekoci proces od ostanka prejsnjega zagona.
    # Premor pred branjem: sveze zagnani streznik datoteko sele pise.
    Korak "8/8  Katera zgradba tece"
    Start-Sleep -Seconds 3
    $potNaDisku = Join-Path $mapaTekoca "BUILD_ID"
    $idDisk = $null
    if (Test-Path $potNaDisku) { $idDisk = (Get-Content $potNaDisku -Raw).Trim() }

    $idTece = $null
    $pidTece = $null
    if (Test-Path $tekocaGradnja) {
        $deli = ((Get-Content $tekocaGradnja -Raw).Trim() -split '\s+')
        if ($deli.Count -ge 1) { $idTece = $deli[0] }
        if ($deli.Count -ge 2) { $pidTece = $deli[1] }
    }

    if ($idTece) { Write-Host "  Tece:     $idTece (PID $pidTece)" } else { Write-Host "  Tece:     (ni zapisa v $tekocaGradnja)" }
    if ($idDisk) { Write-Host "  Na disku: $idDisk" } else { Write-Host "  Na disku: (ni $potNaDisku)" }

    $pidNaVratih = @(Get-NetTCPConnection -LocalPort $Vrata -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
    if ($pidTece -and $pidNaVratih.Count -gt 0 -and ($pidNaVratih -notcontains [int]$pidTece)) {
        Opozorilo "Zapis je od procesa $pidTece, na vratih pa je $($pidNaVratih -join ', ') - zapis je ostanek prejsnjega zagona."
    }

    Write-Host ""
    if (-not $menjavaUspela) {
        Napaka "NI OBJAVLJENO - menjava map ni uspela, tece stara verzija."
        exit 1
    }
    if ($idTece -and $idDisk -and ($idTece -eq $idDisk)) {
        if ($koda -ne 200) {
            Opozorilo "OBJAVLJENO ($idDisk), a naslovnica vraca HTTP $koda - preveri stran."
            exit 1
        }
        Write-Host "OBJAVLJENO - streze se nova zgradba ($idDisk)." -ForegroundColor Green
        exit 0
    }
    if ($idTece -and $idDisk) {
        Opozorilo "Streznik streze DRUGO zgradbo, kot lezi na disku - stran vraca 200, podstrani pa lahko padajo."
        Opomba "Ustavi streznik, da ga zaganjalnik vrne na novi zgradbi, in pozeni objavo znova."
        exit 1
    }
    Opozorilo "Zgradb ni bilo mogoce primerjati - glej poti zgoraj."
    Opomba "Ce tekoca-gradnja.txt manjka, na tem odjavku ni src/instrumentation.ts."
    exit 1

} finally {
    Remove-Item $kljucavnica -ErrorAction SilentlyContinue
    # Varovalka: zastavica gre proc tudi, ce se je skripta ustavila prej.
    # Ce ostane, START-STRAN.bat caka nanjo in strani ne zazene.
    if ($zastavicaPostavljena) { Remove-Item $zastavicaMenjave -Force -ErrorAction SilentlyContinue }
}
