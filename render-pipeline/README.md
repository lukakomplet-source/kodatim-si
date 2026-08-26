# Lokalni AI render pipeline — 3D hiša Parmova 4

Fotorealistični sloj se **NE** računa v oblaku in ne troši Claude tokenov:
geometrijo in kadre pripravi aplikacija `/3d-hisa`, fotorealizem pa naredi
**tvoja grafična kartica** prek ComfyUI (SDXL img2img + ControlNet depth).

## Kako deluje

```
/3d-hisa (three.js)                tvoj PC (GPU)
┌─────────────────────┐            ┌────────────────────────────┐
│ 🎬 Render — izvozi  │  12 kadrov │ ComfyUI (SDXL + ControlNet)  │
│ kadre (12 × 3)      ├──────────►│ img2img po beauty kadru,     │
│ beauty/depth/normal │   *.png    │ depth drži geometrijo        │
└─────────────────────┘            │ → izhod/<kader>_final.png    │
                                   └────────────────────────────┘
```

Ker AI dobi poleg beauty slike še **depth pass**, ohrani NATANČNO geometrijo
hiše iz PZI — polepša materiale, svetlobo in vegetacijo, ne izmišlja pa si
druge hiše.

## Enkratna namestitev (na tem PC-ju) — en ukaz

```powershell
cd render-pipeline
powershell -ExecutionPolicy Bypass -File .\namesti-comfyui.ps1
```

Skripta sama prenese ComfyUI (portable za Windows + NVIDIA), SDXL checkpoint
(`sd_xl_base_1.0.safetensors`, ~6,9 GB) in depth ControlNet
(`control-lora-depth-rank256.safetensors`, ~0,7 GB) točno pod imeni, ki ju
`comfy-workflow.json` že pričakuje — nič ni treba preimenovati. Prenosov je
za ~9 GB, zato traja; če se prekine, skripto samo še enkrat poženeš
(nadaljuje, kjer je ostala). Na koncu ustvari `zazeni-comfyui.bat`.

Ročna pot (če bi hotel drug checkpoint, npr. Juggernaut XL): modele daš v
`ComfyUI/models/checkpoints/` oz. `ComfyUI/models/controlnet/` in imeni
popraviš v vozliščih `CheckpointLoaderSimple` / `ControlNetLoader` v
`comfy-workflow.json`.

## Uporaba

0. Zaženi ComfyUI: `.\zazeni-comfyui.bat` (okno pusti odprto — API posluša
   na `http://127.0.0.1:8188`).
1. Odpri `kodatim.si/3d-hisa`, način **Ogled**, klikni
   **„🎬 Render — izvozi kadre“**. Brskalnik prenese 36 PNG-jev
   (12 kadrov × beauty/depth/normal). Dovoli večkratne prenose, ko vpraša.
2. Vse prenesene PNG-je premakni v `render-pipeline/vhod/`.
3. Poženi (ComfyUI mora teči):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\overnight-render.ps1
   ```

   Skripta za vsak kader pošlje beauty+depth v ComfyUI in shrani rezultat v
   `izhod/`. Z `-Nocni` preizkusi tri stopnje preoblikovanja (denoise
   0.35/0.45/0.55) za vsak kader — zjutraj izbereš najboljšo verzijo.

## Parametri (v overnight-render.ps1)

- `-Denoise 0.45` — koliko sme AI preoblikovati (0.3 = zvesto, 0.6 = drzno)
- `-Nocni` — OVERNIGHT način: vse kadre × tri denoise stopnje
- `-Kader EXTERIOR_FRONT` — samo en kader

Prompt v workflowu opisuje dejanske PZI materiale (bel omet, Prefalz,
lesene lamele, travertin) — po želji ga prilagodi v `comfy-workflow.json`
(vozlišče `CLIPTextEncode`).
