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
#   - dev streznika in drugih aplikacij se nikoli ne dotakne; ustavi kvecjemu
#     "next start" te iste strani (prejsnjo verzijo), ki jo nadzornik iz
#     Startup mape potem sam znova zazene na svezem buildu
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

# kodatim.si tunel kaze na localhost:3001 (stran je tekla kot "next start -p 3001").
# Ce se port kdaj spremeni, popravi tukaj.
$vrata = 3001

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
            Zapisi "Vrata $vrata ze streze drug proces (PID $zasede) - najverjetneje nadzornik; svojega ne zaganjam."
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

    <#
      Po zamenjavi map preveri, da postrezena razlicica RES ustreza tisti na
      disku. 19. 9. 2026 je med ustavitvijo in preimenovanjem nekdo (cuvaj ali
      zaganjalnik) zagnal stran iz STARE .next, mapa pa je bila zamenjana pod
      njo: naslovnica je vracala 200, vsaka se nenalozena podstran pa je padla
      na manjkajocem kosu. Ker je bilo videti zdravo, je tako ostalo 34 ur.
      Tiha neskladnost tu postane samodejni popravek.
    #>
    function PreveriDaTeceNovaGradnja {
        $naDisku = ""
        try { $naDisku = (Get-Content (Join-Path $PSScriptRoot ".next\BUILD_ID") -Raw).Trim() } catch { return }
        if (-not $naDisku) { return }
        # Oznake gradnje NI mogoce prebrati iz odgovora: Next 16 (App Router)
        # je ne piše v HTML (preverjeno 21. 9. 2026). Zato jo proces ob zagonu
        # zapise sam - glej src\instrumentation.ts - skupaj s svojim PID.
        $zapis = Join-Path $mapa "tekoca-gradnja.txt"
        for ($i = 1; $i -le 10; $i++) {
            Start-Sleep -Seconds 3
            $zasede = VrataZasedaPid
            if (-not $zasede) { continue }
            $vrstica = ""
            try { $vrstica = (Get-Content $zapis -Raw -ErrorAction Stop).Trim() } catch { continue }
            $deli = $vrstica -split '\s+'
            if ($deli.Count -lt 2) { continue }
            $tece = $deli[0]
            $zapisalPid = [int]$deli[1]
            # Zapis mora biti od procesa, ki TA HIP posluša; sicer je ostanek
            # prejsnjega zagona in o tekoci gradnji ne pove nicesar.
            if ($zapisalPid -ne $zasede) { continue }
            if ($tece -eq $naDisku) {
                Zapisi "Preverjeno: stran tece na gradnji $tece (enaka kot na disku)."
                return
            }
            Zapisi "NESKLADJE: stran tece na gradnji $tece, na disku je $naDisku - zaganjam znova."
            Stop-Process -Id $zasede -Force -ErrorAction SilentlyContinue
            UstaviStreznik
            Start-Sleep -Seconds 3
            ZazeniStreznik
            return
        }
        Zapisi "OPOZORILO: tekoce gradnje ni bilo mogoce preveriti (ni zapisa od procesa na vratih $vrata)."
    }

    function ZgradiInZazeni {
        # Ce vrata zaseda tuj proces, ki NI ta stran (dev streznik), se ne
        # vtikamo: koda je potegnjena, build in restart preskocimo.
        $zasede = VrataZasedaPid
        $moj = StreznikPid
        if ($zasede -and (-not ($moj -and ($zasede -eq $moj)))) {
            $tujec = Get-CimInstance Win32_Process -Filter "ProcessId = $zasede" -ErrorAction SilentlyContinue
            $staraVerzijaStrani = ($tujec -and $tujec.Name -eq "node.exe" -and $tujec.CommandLine -like "*$PSScriptRoot*" -and $tujec.CommandLine -like "*next*start*")
            if (-not $staraVerzijaStrani) {
                Zapisi "Na vratih $vrata tece tuj proces (dev streznik?) - koda je potegnjena, build in restart preskocim."
                return $true
            }
        }

        $prejsnja = Join-Path $PSScriptRoot ".next_prejsnja"
        $trenutna = Join-Path $PSScriptRoot ".next"
        $nova = Join-Path $PSScriptRoot ".next_nova"

        # 1. GRADIMO, MEDTEM KO STARA VERZIJA SE STREZE.
        #
        # Prej je bil vrstni red obrnjen: najprej Stop-Process na strezniku,
        # nato build. Ker build traja 5-9 minut, je bila kodatim.si ves ta cas
        # nedosegljiva (Cloudflare 502) - 17. 9. 2026 med 14:58 in 15:59
        # sedemkrat zapored. Z lastno izhodno mapo (NEXT_DIST_DIR) build ne
        # povozi odprtih datotek v .next, zato streznik lahko tece do konca.
        if (Test-Path $nova) { Remove-Item $nova -Recurse -Force }
        Zapisi "npm run build (v .next_nova; stran medtem tece) ..."
        $env:NEXT_DIST_DIR = ".next_nova"
        npm run build *> $buildLog
        $izidBuilda = $LASTEXITCODE
        # Spremenljivko POCISTIMO takoj: Start-Process podeduje okolje starsa,
        # zato bi streznik sicer stregel iz .next_nova, ki jo tik zatem
        # preimenujemo - in stran bi ostala brez svoje izhodne mape.
        Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
        if ($izidBuilda -ne 0) {
            Zapisi "NAPAKA: build ni uspel - stran tece naprej v STARI verziji, brez izpada. Podrobnosti: $buildLog"
            if (Test-Path $nova) { Remove-Item $nova -Recurse -Force }
            return $false
        }

        # 2. Sele zdaj zamenjamo mapo in znova zazenemo: izpad je nekaj
        #    sekund namesto celega builda.
        #
        # Zastavica pove cuvaju in zaganjalniku (START-STRAN.bat), naj strani
        # med tem NE zaganjata: 19. 9. 2026 je eden od njiju v tistih sekundah
        # zagnal stran iz stare .next, mapa pa je bila zamenjana pod njo.
        $zastavicaMenjave = "C:\Users\lukak\avtonet-db\stran.menjava"
        Set-Content -Path $zastavicaMenjave -Value (Get-Date -Format "s") -ErrorAction SilentlyContinue
        $zasede = VrataZasedaPid
        if ($zasede) {
            Zapisi "Nova verzija zgrajena - ustavljam staro (PID $zasede) za zamenjavo."
            Stop-Process -Id $zasede -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
        UstaviStreznik
        # Windows datoteke sprosti z zamikom: prvi poskus preimenovanja .next
        # takoj po ustavitvi je 18. 9. 2026 vrnil "Access to the path is
        # denied", cez tri sekunde pa je isti ukaz uspel. Zato poskusimo
        # veckrat; ce ne gre, pustimo staro verzijo pri zivljenju.
        $zamenjano = $false
        for ($poskus = 1; $poskus -le 6; $poskus++) {
            try {
                if (Test-Path $prejsnja) { Remove-Item $prejsnja -Recurse -Force -ErrorAction Stop }
                if (Test-Path $trenutna) { Rename-Item $trenutna ".next_prejsnja" -ErrorAction Stop }
                Rename-Item $nova ".next" -ErrorAction Stop
                $zamenjano = $true
                break
            } catch {
                Start-Sleep -Seconds 3
            }
        }
        if (-not $zamenjano) {
            Zapisi "NAPAKA: nove verzije ni bilo mogoce postaviti na mesto (.next je zaklenjen) - zaganjam staro."
            Remove-Item $zastavicaMenjave -ErrorAction SilentlyContinue
            ZazeniStreznik
            return $false
        }
        Remove-Item $zastavicaNapake -ErrorAction SilentlyContinue
        Remove-Item $zastavicaMenjave -ErrorAction SilentlyContinue
        ZazeniStreznik
        PreveriDaTeceNovaGradnja

        # Ce se nova verzija ob zagonu takoj sesuje, vrnemo prejsnjo - ta je
        # ze zgrajena, zato je vrnitev hitra.
        if ((Test-Path $zastavicaNapake) -and (Test-Path $prejsnja)) {
            Zapisi "Nova verzija se ob zagonu sesula - vracam prejsnjo."
            if (Test-Path $trenutna) { Remove-Item $trenutna -Recurse -Force }
            Rename-Item $prejsnja ".next"
            Remove-Item $zastavicaNapake -ErrorAction SilentlyContinue
            ZazeniStreznik
            return $false
        }
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

    # Deploy samo, kadar je GitHub RES pred nami. Prej je tu stalo golo
    # "$lokalno -eq $oddaljeno", kar je vsako razliko bralo kot novo verzijo -
    # tudi kadar smo MI pred GitHubom (lokalni commit brez push). Takrat je
    # git pull --ff-only tiho uspel (ni cesa potegniti), skripta pa je vseeno
    # gradila: vsakih 5 minut je ustavila streznik, zacela build in nikoli
    # prisla do enakosti. 17. 9. 2026 med 14:58 in 16:05 stran zato skoraj ni
    # delovala - v dnevniku osem zaporednih "47ed28e -> 1b8c7a6" brez konca.
    # merge-base --is-ancestor pove, kdo je pred kom: 0 = lokalno je prednik
    # oddaljenega, torej je na GitHubu res nekaj novega.
    git merge-base --is-ancestor $lokalno $oddaljeno *> $null
    $oddaljenoJePredNami = ($LASTEXITCODE -eq 0) -and ($lokalno -ne $oddaljeno)

    if (-not $oddaljenoJePredNami) {
        # Nic novega. Poskrbimo samo, da streznik sploh tece (npr. po
        # ponovnem zagonu racunalnika); ce tece - nas ali tuj (dev) -
        # koncamo tiho, da dnevnik ne raste.
        if ($null -ne (StreznikPid)) { exit 0 }
        $zeStreze = VrataZasedaPid
        if ($null -ne $zeStreze) {
            # Ce nadzornikov streznik tece brez builda (npr. po pobrisanem
            # .next), BUILD_ID manjka - takrat vseeno zgradimo.
            if (Test-Path (Join-Path $PSScriptRoot ".next\BUILD_ID")) { exit 0 }
        }
        if (Test-Path $zastavicaNapake) { exit 0 }
        if (Test-Path (Join-Path $PSScriptRoot ".next\BUILD_ID")) {
            Zapisi "Streznik ne tece (ponovni zagon racunalnika?) - ga zaganjam."
            ZazeniStreznik
        } else {
            Zapisi "Builda se ni - gradim in zaganjam."
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
