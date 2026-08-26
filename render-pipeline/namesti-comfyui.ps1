# namesti-comfyui.ps1 - enkratna namestitev lokalnega AI render okolja
#
# Prenese in razpakira ComfyUI (portable, NVIDIA) ter oba modela, ki ju
# potrebuje comfy-workflow.json:
#   - sd_xl_base_1.0.safetensors            (SDXL checkpoint, ~6,9 GB)
#   - control-lora-depth-rank256.safetensors (depth ControlNet, ~0,7 GB)
# Na koncu ustvari zazeni-comfyui.bat. Vse tece IZKLJUCNO na tem PC-ju.
#
# Uporaba (PowerShell, v mapi render-pipeline):
#   powershell -ExecutionPolicy Bypass -File .\namesti-comfyui.ps1
#
# Skripta je nadaljevalna: ze prenesene datoteke preskoci, prekinjen prenos
# nadaljuje (curl -C -). Ce kaj pade, jo samo se enkrat pozeni.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$koren = $PSScriptRoot
$comfyKoren = Join-Path $koren "ComfyUI_windows_portable"
$sedmica = Join-Path $koren "7zr.exe"
$arhiv = Join-Path $koren "ComfyUI_windows_portable_nvidia.7z"

function Sporoci([string]$b) { Write-Host ("==> " + $b) -ForegroundColor Cyan }

# curl.exe je na Windows 10/11 vgrajen in edini zna zanesljivo nadaljevati
# velike prenose; brez njega ne zacnemo.
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if (-not $curl) { throw "curl.exe ni na voljo (Windows 10 1803+ ga ima vgrajenega)." }

function Prenesi([string]$url, [string]$cilj, [long]$pricakovanoVsajB) {
    if ((Test-Path $cilj) -and (Get-Item $cilj).Length -ge $pricakovanoVsajB) {
        Sporoci ("ze preneseno: " + (Split-Path $cilj -Leaf))
        return
    }
    Sporoci ("prenasam: " + $url)
    & curl.exe -L --fail --retry 5 --retry-delay 5 -C - -o $cilj $url
    if ($LASTEXITCODE -ne 0) { throw ("prenos ni uspel: " + $url) }
    if ((Get-Item $cilj).Length -lt $pricakovanoVsajB) {
        throw ("datoteka je premajhna (nepopoln prenos?): " + $cilj)
    }
}

# 0) opozorilo, ce ni NVIDIA GPU (portable paket je CUDA verzija)
if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
    Write-Host "OPOZORILO: nvidia-smi ni najden - ComfyUI bo tekel na CPU (zelo pocasi)." -ForegroundColor Yellow
}

# 1) 7zr.exe (samostojni razpakirnik za .7z, ~0,6 MB)
Prenesi "https://www.7-zip.org/a/7zr.exe" $sedmica 400000

# 2) ComfyUI portable (NVIDIA), ~1,5 GB, z GitHub releases
if (-not (Test-Path (Join-Path $comfyKoren "ComfyUI\main.py"))) {
    Prenesi "https://github.com/comfyanonymous/ComfyUI/releases/latest/download/ComfyUI_windows_portable_nvidia.7z" $arhiv 500000000
    Sporoci "razpakiram ComfyUI (nekaj minut) ..."
    & $sedmica x $arhiv ("-o" + $koren) -y | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "razpakiranje .7z ni uspelo" }
    Remove-Item $arhiv -ErrorAction SilentlyContinue
} else {
    Sporoci "ComfyUI je ze razpakiran"
}
if (-not (Test-Path (Join-Path $comfyKoren "ComfyUI\main.py"))) {
    throw ("po razpakiranju ni pricakovane mape: " + $comfyKoren)
}

# 3) modela - TOCNO ti imeni pricakuje comfy-workflow.json
$mapaCkpt = Join-Path $comfyKoren "ComfyUI\models\checkpoints"
$mapaCtrl = Join-Path $comfyKoren "ComfyUI\models\controlnet"
New-Item -ItemType Directory -Force -Path $mapaCkpt, $mapaCtrl | Out-Null

Prenesi "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors" `
    (Join-Path $mapaCkpt "sd_xl_base_1.0.safetensors") 6000000000

Prenesi "https://huggingface.co/stabilityai/control-lora/resolve/main/control-LoRAs-rank256/control-lora-depth-rank256.safetensors" `
    (Join-Path $mapaCtrl "control-lora-depth-rank256.safetensors") 700000000

# 4) mapa za kadre iz aplikacije + zagonski bat
New-Item -ItemType Directory -Force -Path (Join-Path $koren "vhod"), (Join-Path $koren "izhod") | Out-Null

$bat = Join-Path $koren "zazeni-comfyui.bat"
@(
    "@echo off"
    "rem zazene ComfyUI (API na http://127.0.0.1:8188) - okno pusti odprto"
    ('cd /d "' + $comfyKoren + '"')
    "call run_nvidia_gpu.bat"
) | Set-Content -Path $bat -Encoding ASCII

Sporoci "KONCANO. Naslednji koraki:"
Write-Host ""
Write-Host "  1) Zazeni ComfyUI:   .\zazeni-comfyui.bat   (pusti okno odprto)"
Write-Host "  2) Na kodatim.si/3d-hisa (nacin Ogled) klikni '3D Render - izvozi kadre'"
Write-Host "     in prenesene PNG-je premakni v mapo:  render-pipeline\vhod\"
Write-Host "  3) Pozeni render:    powershell -ExecutionPolicy Bypass -File .\overnight-render.ps1"
Write-Host "     (cez noc z vec verzijami:  ... .\overnight-render.ps1 -Nocni)"
Write-Host "  4) Rezultati:        render-pipeline\izhod\"
Write-Host ""
