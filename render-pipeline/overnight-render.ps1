# Lokalni AI render (GPU) - poslje kadre iz vhod/ v ComfyUI in shrani izhod.
#
#   powershell -ExecutionPolicy Bypass -File .\overnight-render.ps1
#   powershell -ExecutionPolicy Bypass -File .\overnight-render.ps1 -Nocni
#   powershell -ExecutionPolicy Bypass -File .\overnight-render.ps1 -Kader EXTERIOR_FRONT -Denoise 0.5
#
# Pogoji: ComfyUI tece na http://127.0.0.1:8188, modeli so namesceni
# (glej README.md). Kadri (12 x beauty/depth/normal PNG iz aplikacije
# /3d-hisa, gumb "Render") so v mapi vhod/.
#
# OPOMBA O ZNAKIH: ASCII brez sumnikov, shranjeno z BOM (glej opombo v
# worker-avtonet\setup.ps1).

param(
    [double]$Denoise = 0.45,
    [switch]$Nocni,
    [string]$Kader = ""
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$comfy = "http://127.0.0.1:8188"
$vhod = Join-Path $PSScriptRoot "vhod"
$izhod = Join-Path $PSScriptRoot "izhod"
if (-not (Test-Path $vhod)) { New-Item -ItemType Directory -Path $vhod | Out-Null }
if (-not (Test-Path $izhod)) { New-Item -ItemType Directory -Path $izhod | Out-Null }

# ComfyUI ziv?
try { Invoke-RestMethod -Uri "$comfy/system_stats" -TimeoutSec 5 | Out-Null }
catch {
    Write-Host "ComfyUI ne tece na $comfy - zazeni ga in poskusi znova." -ForegroundColor Red
    exit 1
}

$predloga = Get-Content (Join-Path $PSScriptRoot "comfy-workflow.json") -Raw

$kadri = Get-ChildItem $vhod -Filter "*_beauty.png" | ForEach-Object { $_.BaseName -replace "_beauty$", "" }
if ($Kader) { $kadri = $kadri | Where-Object { $_ -eq $Kader } }
if (-not $kadri) {
    Write-Host "V mapi vhod/ ni kadrov (*_beauty.png). V aplikaciji klikni 'Render - izvozi kadre'." -ForegroundColor Red
    exit 1
}

$stopnje = if ($Nocni) { @(0.35, 0.45, 0.55) } else { @($Denoise) }
Write-Host ("Kadrov: {0}, denoise stopnje: {1}" -f @($kadri).Count, ($stopnje -join ", ")) -ForegroundColor Cyan

function PosljiKader([string]$ime, [double]$moc) {
    $beauty = Join-Path $vhod "$ime`_beauty.png"
    $depth = Join-Path $vhod "$ime`_depth.png"
    if (-not (Test-Path $depth)) { $depth = $beauty }

    # nalozi obe sliki v ComfyUI
    foreach ($pot in @($beauty, $depth)) {
        $imeDat = Split-Path $pot -Leaf
        curl.exe -s -X POST "$comfy/upload/image" -F "image=@$pot" -F "overwrite=true" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Nalaganje $imeDat ni uspelo." }
    }

    $seed = Get-Random -Maximum 2000000000
    $prefix = "hisa_{0}_d{1}" -f $ime, ($moc.ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture) -replace "\.", "")
    $graf = $predloga.
        Replace('"{BEAUTY}"', ('"{0}"' -f (Split-Path $beauty -Leaf))).
        Replace('"{DEPTH}"', ('"{0}"' -f (Split-Path $depth -Leaf))).
        Replace('"{DENOISE}"', $moc.ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture)).
        Replace('"{SEED}"', $seed).
        Replace('"{PREFIX}"', ('"{0}"' -f $prefix)).
        Replace('{BEAUTY}', (Split-Path $beauty -Leaf)).
        Replace('{DEPTH}', (Split-Path $depth -Leaf)).
        Replace('{PREFIX}', $prefix)

    $telo = @{ prompt = ($graf | ConvertFrom-Json) } | ConvertTo-Json -Depth 12
    $odgovor = Invoke-RestMethod -Uri "$comfy/prompt" -Method Post -Body $telo -ContentType "application/json"
    return @{ id = $odgovor.prompt_id; prefix = $prefix }
}

foreach ($ime in $kadri) {
    foreach ($moc in $stopnje) {
        Write-Host ("Render: {0} (denoise {1}) ..." -f $ime, $moc) -ForegroundColor Cyan
        $posel = PosljiKader $ime $moc
        # pocakaj, da ComfyUI konca ta prompt
        $krogov = 0
        do {
            Start-Sleep -Seconds 3
            $krogov++
            $zgodovina = Invoke-RestMethod -Uri ("$comfy/history/{0}" -f $posel.id)
            $koncano = $zgodovina.PSObject.Properties.Name -contains $posel.id
        } while (-not $koncano -and $krogov -lt 400)
        if (-not $koncano) { Write-Host "  Casovna omejitev - preskocim." -ForegroundColor Yellow; continue }
        # prekopiraj izhodne slike iz ComfyUI output mape, ce jo najdemo; sicer
        # ostanejo v ComfyUI/output (filename_prefix jih loci po kadrih)
        Write-Host ("  Koncano: ComfyUI output/{0}_*.png" -f $posel.prefix) -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Vse poslano. Rezultati so v ComfyUI\output\ (hisa_<kader>_dXX_*.png)." -ForegroundColor Green
Write-Host "V nocnem nacinu primerjaj tri denoise verzije in obdrzi najboljso." -ForegroundColor Gray
