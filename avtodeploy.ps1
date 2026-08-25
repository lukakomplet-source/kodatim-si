# KodaTim - avtomatski deploy spletne strani (kodatim.si tece s tega racunalnika).
#
# Skripto vsakih 5 minut pozene Nacrtovano opravilo "KodaTim avtodeploy"
# (namesti ga avtodeploy-namesti.ps1). Ob vsakem zagonu:
#   1. git fetch - preveri, ali je na GitHubu (veja main) kaj novega
#   2. ce je: git pull --ff-only, ob spremembi paketov npm install, nato build
#   3. poskrbi, da produkcijski streznik (next start, port spodaj) tece,
#      in ga po uspesnem buildu znova zazene
#
# Varnostna pravila:
#   - nikoli ne ustavi procesa, ki ga ni sama zagnala (dev streznik ostane pri miru;
#     ce vrata zaseda tuj proces, se samo zabelezi in nic ne zaganja)
#   - ce build pade, se vrne prejsnja verzija in stran tece naprej
#   - ce git pull ne gre gladko (lokalne spremembe), se ustavi in zapise napako;
#     nikoli ne uporablja force
#
# Rocni zagon:  powershell -ExecutionPolicy Bypass -File .\avtodeploy.ps1
# Dnevnik:      .avtodeploy\dnevnik.log
#
# OPOMBA O ZNAKIH: enako kot worker-avtonet\setup.ps1 - datoteka je ASCII brez
# sumnikov in tipografskih locil ter shranjena z BOM, ker Windows PowerShell 5.1
# brez BOM bere Windows-1252 in se skripta sicer razsuje.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

# Ce cloudflared tunel ne kaze na 3000, popravi tukaj.
$vrata = 3000

$mapa = Join-Path $PSScriptRoot ".avtodeploy"
$dnevnik = Join-Path $mapa "dnevnik.log"
$pidDatoteka = Join-Path $mapa "streznik.pid"
$buildLog = Join-Path $mapa "build.log"
# Ce se streznik sesuje takoj ob zagonu, ta zastavica prepreci, da bi ga
# vsakih 5 minut znova zaganjali; pobrise se ob naslednjem uspesnem buildu.
$zastavicaNapake = Join-Path $mapa "start-ne-deluje.flag"
if (-not (Test-Path $mapa)) { New-Item -ItemType Directory -Path $mapa | Out-Null }

function Zapisi([string]$sporocilo) {
    $vrstica = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $sporocilo
    Add-Content -Path $dnevnik -Value $vrstica
    Write-Host $vrstica
}

# node in git nista vedno v PATH sveze zagnanega opravila (isti prijem kot
# v worker-avtonet\setup.ps1).
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

# Dnevnik naj ne raste v nedogled.
if (Test-Path $dnevnik) {
    $vrstic = @(Get-Content $dnevnik -ErrorAction SilentlyContinue).Count
    if ($vrstic -gt 2000) {
        Get-Content $dnevnik | Select-Object -Last 500 | Set-Content $dnevnik
    }
}

# En zagon naenkrat. Opravilo ima sicer IgnoreNew, to je varovalka za rocne
# zagone; obvisela kljucavnica po sesutju se ignorira po 30 minutah.
$kljucavnica = Join-Path $mapa "tece.lock"
if (Test-Path $kljucavnica) {
    $starost = (Get-Date) - (Get-Item $kljucavnica).LastWriteTime
    if ($starost.TotalMinutes -lt 30) { exit 0 }
}
Set-Content -Path $kljucavnica -Value $PID

try {

    # --- pomozne funkcije za streznik -------------------------------------

    function StreznikPid {
        if (-not (Test-Path $pidDatoteka)) { return $null }
        $id = Get-Content $pidDatoteka -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $id) { return $null }
        $p = Get-CimInstance Win32_Process -Filter "ProcessId = $id" -ErrorAction SilentlyContinue
        # PID se lahko reciklira: sprejmemo samo node, ki tece iz te mape.
        if ($p -and $p.Name -eq "node.exe" -and $p.CommandLine -like "*next*start*" -and $p.CommandLine -like "*$PSScriptRoot*") {
            return [int]$id
        }
        return $null
    }

    function VrataZasedaPid {
        $povezava = Get-NetTCPConnection -LocalPort $vrata -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($povezava) { return [int]$povezava.OwningProcess }
        return $null
    }

    function UstaviStreznik {
        $id = StreznikPid
        if ($id) {
            Zapisi "Ustavljam svoj streznik (PID $id)."
            Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
        Remove-Item $pidDatoteka -ErrorAction SilentlyContinue
    }

    function ZazeniStreznik {
        if (Test-Path $zastavicaNapake) {
            # Zadnji zagon se je takoj sesul; ne ponavljamo do naslednjega builda.
            return
        }
        $zasede = VrataZasedaPid
        if ($zasede) {
            $moj = StreznikPid
            if ($moj -and ($zasede -eq $moj)) { return }
            Zapisi "Vrata $vrata zaseda tuj proces (PID $zasede, verjetno dev streznik) - produkcijskega ne zaganjam."
            return
        }
        $nextBin = Join-Path $PSScriptRoot "node_modules\next\dist\bin\next"
        $izhodLog = Join-Path $mapa "streznik.log"
        $napakeLog = Join-Path $mapa "streznik-napake.log"
        $p = Start-Process -FilePath "node" -ArgumentList "`"$nextBin`" start -p $vrata" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput $izhodLog -RedirectStandardError $napakeLog -PassThru
        Set-Content -Path $pidDatoteka -Value $p.Id
        Start-Sleep -Seconds 3
        if ($p.HasExited) {
            Set-Content -Path $zastavicaNapake -Value (Get-Date)
            Remove-Item $pidDatoteka -ErrorAction SilentlyContinue
            Zapisi "NAPAKA: streznik se je takoj sesul - poglej $napakeLog. Znova poskusim ob naslednjem buildu."
            return
        }
        Zapisi "Streznik zagnan (PID $($p.Id), vrata $vrata)."
    }

    function ZgradiInZazeni {
        # Ce vrata zaseda tuj proces (najverjetneje next dev), .next uporablja
        # on - vanj ne smemo graditi. Koda je ze potegnjena, dev jo pobere sam;
        # produkcijski build pride na vrsto, ko dev streznika ne bo vec.
        $zasede = VrataZasedaPid
        $moj = StreznikPid
        if ($zasede -and (-not ($moj -and ($zasede -eq $moj)))) {
            Zapisi "Na vratih $vrata tece tuj proces (dev streznik?) - koda je potegnjena, build in restart preskocim."
            return $true
        }
        # Streznik ustavimo pred buildom (Windows ne mara prepisovanja odprtih
        # datotek v .next), prejsnji build pa spravimo za rollback.
        UstaviStreznik
        $prejsnja = Join-Path $PSScriptRoot ".next_prejsnja"
        $trenutna = Join-Path $PSScriptRoot ".next"
        if (Test-Path $prejsnja) { Remove-Item $prejsnja -Recurse -Force }
        if (Test-Path $trenutna) { Rename-Item $trenutna ".next_prejsnja" }

        Zapisi "npm run build ..."
        npm run build *> $buildLog
        if ($LASTEXITCODE -ne 0) {
            Zapisi "NAPAKA: build ni uspel - vracam prejsnjo verzijo. Podrobnosti: $buildLog"
            if (Test-Path $trenutna) { Remove-Item $trenutna -Recurse -Force }
            if (Test-Path $prejsnja) {
                Rename-Item $prejsnja ".next"
                ZazeniStreznik
                Zapisi "Tece prejsnja verzija. Popravi kodo in pushni nov commit."
            }
            return $false
        }
        if (Test-Path $prejsnja) { Remove-Item $prejsnja -Recurse -Force }
        Remove-Item $zastavicaNapake -ErrorAction SilentlyContinue
        ZazeniStreznik
        return $true
    }

    # --- 1. je na GitHubu kaj novega? -------------------------------------

    $veja = (git rev-parse --abbrev-ref HEAD)
    if ($veja -ne "main") {
        Zapisi "OPOZORILO: checkout ni na veji main (je: $veja) - ne delam nicesar."
        exit 0
    }

    git fetch origin main --quiet
    if ($LASTEXITCODE -ne 0) {
        Zapisi "NAPAKA: git fetch ni uspel (ni interneta?)."
        exit 1
    }

    $lokalno = (git rev-parse HEAD).Trim()
    $oddaljeno = (git rev-parse origin/main).Trim()

    if ($lokalno -eq $oddaljeno) {
        # Nic novega. Poskrbimo samo, da streznik sploh tece (npr. po
        # ponovnem zagonu racunalnika); ce tece - nas ali tuj (dev) -
        # koncamo tiho, da dnevnik ne raste.
        if ($null -ne (StreznikPid)) { exit 0 }
        if ($null -ne (VrataZasedaPid)) { exit 0 }
        if (Test-Path $zastavicaNapake) { exit 0 }
        if (Test-Path (Join-Path $PSScriptRoot ".next\BUILD_ID")) {
            Zapisi "Streznik ne tece (ponovni zagon racunalnika?) - ga zaganjam."
            ZazeniStreznik
        } else {
            Zapisi "Prvi zagon: builda se ni - gradim in zaganjam."
            $null = ZgradiInZazeni
        }
        exit 0
    }

    # --- 2. deploy --------------------------------------------------------

    $od = $lokalno.Substring(0, 7)
    $do2 = $oddaljeno.Substring(0, 7)
    Zapisi "Novi commiti na GitHubu ($od -> $do2) - zacenjam deploy."

    git pull --ff-only origin main --quiet
    if ($LASTEXITCODE -ne 0) {
        Zapisi "NAPAKA: git pull --ff-only ni uspel (lokalne spremembe?). Rocno preveri: git status"
        exit 1
    }

    $paketi = git diff --name-only $lokalno $oddaljeno -- package.json package-lock.json
    if ($paketi) {
        Zapisi "Spremenjeni paketi - npm install ..."
        npm install --no-fund --no-audit *>> $buildLog
        if ($LASTEXITCODE -ne 0) {
            Zapisi "NAPAKA: npm install ni uspel. Stara verzija tece naprej. Podrobnosti: $buildLog"
            exit 1
        }
    }

    if (ZgradiInZazeni) {
        $zadnji = (git log -1 --pretty=%s).Trim()
        Zapisi "Deploy koncan: $zadnji"
    }

} finally {
    Remove-Item $kljucavnica -ErrorAction SilentlyContinue
}
