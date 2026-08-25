# Načrti hiše — Parmova ulica 4, Vojnik

Vhodna mapa za 3D model na `kodatim.si/3d-hisa`.

## Kaj sodi sem (skopiraj z `C:\Users\lukak\Desktop\KOMPLETKO GRADNJE\vojnik načrti`)

- vsi PZI PDF-ji (tlorisi pritličja / 1. nadstropja / podstrehe, fasade, prerezi,
  zunanje stopnišče, detajli, sheme stavbnega pohištva, tehnični opis),
- IDZ PDF-ji in situacija,
- `PZI POPISI DEL 19.6.2026.xlsx`,
- lastne fotografije hiše in okolice (obstoječe stanje),
- po želji HTML prototip iz Claude Chata (kot referenca, kaj je bilo všeč).

Po kopiranju: **commit + push na `main`** — Claude v naslednji seji naredi
FAZO 1 (analiza → `HOUSE_ANALYSIS.md` + `MODEL_PLAN.md`), šele nato natančno
geometrijo.

## reference/streetview/

Google Street View posnetki lokacije (april 2025), ki jih je Claude potegnil
za rekonstrukcijo obstoječega stanja in okolice: `sv_yaw<stopinje>.jpg` je
pogled iz panorame pred hišo (93° = hiša, 0° = sever po ulici, 180° = jug s
cerkvijo, 270° = bloki čez cesto), `sv_yaw93_roof.jpg` pogled na streho.

## Status kategorij podatkov

- **A (dokumentirano)** — iz PZI/IDZ: *še nič, načrtov še ni v repu.*
- **B (inferirano)** — izpeljano iz načrtov: *še nič.*
- **C (predlog/približek)** — trenutni celoten 3D model obstoječega stanja
  (mere odčitane s Street View) in celotna okolica.

## Opomba o slikah in lockfilu (seja 25. 8. 2026)

Git push iz Claudove oblačne seje ni bil mogoč (Claude GitHub App ni nameščen
za ta repo — glej https://github.com/apps/claude/installations/select_target),
zato je koda pushana prek GitHub API-ja, ki pa ne prenese binarnih datotek:

- **Street View JPG-ji** zato še niso v repu. Znova jih potegneš (ali Claude v
  prihodnji seji) s: `https://streetviewpixels-pa.googleapis.com/v1/thumbnail?cb_client=maps_sv.tactile&w=2048&h=1152&pitch=0&panoid=txjIo2-FqQn67f4YzKlH-A&yaw=<0|45|93|135|180|225|270|315>`
  (obvezen header `Referer: https://www.google.com/`; za streho `pitch=-25&yaw=93`).
- **package-lock.json** še ne vsebuje `three` — po `git pull` na svojem
  računalniku poženi `npm install` (doda three in posodobi lock) in commitaj.
