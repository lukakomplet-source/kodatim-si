# SBN Auto — zbiralnik

Bere oglase z Avto.net, jih shranjuje v Supabase in vodi zgodovino trga.
Teče ločeno od spletne strani: KodaTim ostane na Vercelu, ta proces pa
kjerkoli, kjer lahko teče 24/7.

## Lokalno (za test)

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
npm run once
```

`setup.ps1` namesti pakete, prenese Chromium in pripravi `.env`. Edino, česar
ne more narediti, sta dve vrednosti iz Supabase (Settings → API) — nanju vas
opozori na koncu.

`npm run once` naredi en krog in konča. `npm start` teče naprej in **čaka na
zahteve iz nadzorne plošče**.

## Kako se pregled zažene

Sam od sebe se ne zažene nič. Na `kodatim.si/avtonet` je gumb **ZAŽENI
RESEARCH** (viden samo adminu); klik zapiše eno vrstico v
`avtonet_raziskave`, worker jo pobere in vanjo sproti piše napredek — od koder
ga nadzorna plošča bere v živo.

Ta ovinek ni izbira estetike: pregled hodi po ~1.100 straneh rezultatov in nato
še po strani vsakega oglasa, z 10-sekundnim premorom, ki ga vir prosi. To je več
ur, Vercel pa funkcijo ustavi po nekaj minutah in brskalnika sploh nima.

Pregled teče v dveh fazah:

1. **Celoten trg** — vsaka stran rezultatov se takoj zapiše v bazo in številka
   strani z njo. Padec pri strani 500 stane eno stran, ne petih ur: naslednji
   zagon nadaljuje pri 501.
2. **Podrobnosti** — odpre stran vsakega oglasa in zajame, česar v seznamu ni
   (oprema, kraj ogleda, prodajalec, barva, karoserija, opis). Za testno
   verzijo namenoma **vseh**, brez optimizacije hitrosti.

Preklic v nadzorni plošči ni ubijanje procesa: pregled to opazi ob naslednjem
zapisu napredka, dokonča stran, na kateri je, in pusti uporaben checkpoint.

Urnik (dvakrat dnevno) obstaja, a je **privzeto izklopljen** — prižge se z
`AVTONET_URNIK=1`, ko bo ročni pregled preverjen v celoti.

## Produkcija — Railway (priporočeno)

Konfiguracija je v `worker-avtonet/railway.json`; Railway po povezavi
repozitorija sam zgradi Dockerfile in ob vsakem pushu na `main` objavi novo
različico.

**Zakaj Railway in ne Render:** preverjeno v Renderjevi dokumentaciji —
brezplačne spletne storitve **zaspijo po 15 minutah brez prometa**, delavci v
ozadju pa so izključno plačljivi. Zaspana storitev pomeni ustavljen
razporejevalnik, torej nič zbiranja; ravno tisto, kar ta worker mora početi
sam. Railway takega ugašanja nima, je Docker-native in ima preprost vnos
skrivnosti.

`render.yaml` v korenu repozitorija ostaja kot delujoča druga možnost — a
samo na plačljivem paketu, kjer storitve ne zaspijo.

Obakrat je treba vnesti le dve skrivnosti (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`) v nastavitve gostovanja. V repozitorij ne gresta.

## Testi

```
npm run test:parse      # razčlenjevalnik na resničnem besedilu strani (brez omrežja)
npm run test:collect    # živi zajem ene strani z avto.net (brez baze)
npm run test:detail     # živo branje strani posameznih oglasov (2. faza)
npm run test:health     # pogodba health endpointa (200 pri opozorilu, 503 pri ustavljenem)
npm run test:misconfig  # zagon brez skrivnosti pove razlog in vrne 503
npm run test:db         # tabele in resničen zapis/izbris
npm run test:research   # CELA pot: zahteva -> prevzem -> 2 fazi -> checkpoint -> preklic
npm run typecheck
```

`test:collect` in `test:detail` sta najbolj povedna: če se struktura strani
spremeni, padeta tam in ne šele v produkciji.

`test:research` je omejen na 2 strani in 2 oglasa, sicer pa teče popolnoma
zares — resnične strani, resnični 10-sekundni premor, resnični zapisi. Traja
nekaj minut in preveri tudi tisto, kar se pri branju kode ne vidi: da se ista
zahteva prevzame samo enkrat, da nadaljevanje začne **za** checkpointom, da
ponovni pregled istih strani ne podvaja oglasov in da tekoč pregled izve za
preklic.

## Kako se obnaša do vira

Avto.netov `robots.txt` ne prepoveduje ničesar in prosi za `Crawl-delay: 10`.
Zbiralnik ta razmik spoštuje med vsako stranjo. Ob **403 ali 429** krog
**ustavi** in zapiše razlog — brez proxyjev, brez menjave IP-jev, brez
obhajanja zaščit. Če vir reče ne, je odgovor počakati.

## Zdravje

Worker odgovarja na `GET /` (privzeto port 8080) s svojim stanjem, isto pa
zapisuje v tabelo `avtonet_zdravje`, ki jo bere nadzorna plošča
`kodatim.si/avtonet`.

| Stanje | Pomen | HTTP |
|---|---|---|
| `ok` | zadnji krog uspel | 200 |
| `opozorilo` | krog ni uspel, poskuša naprej z daljšim premorom | 200 |
| `ustavljeno` | več zaporednih neuspehov | 503 |

Opozorilo namenoma ostane 200: gostitelj, ki bi vsebnik ponovno zagnal ob
prvem neuspehu, bi začasno blokado na viru spremenil v neskončno vrtenje —
in prav to je način, kako trajna okvara ostane skrita. Šele `ustavljeno`
pomeni, da je ponovni zagon smiseln.

Premor med poskusi se ob napakah podvaja do največ 6 ur.

## Nastavitve

| Spremenljivka | Privzeto | Kaj pomeni |
|---|---|---|
| `SUPABASE_URL` | — | **skrivnost**, iz Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **skrivnost**, iz Supabase |
| `AVTONET_ZNAMKE` | prazno | znamke, ločene z vejico; prazno = cel trg |
| `AVTONET_URNIK` | prazno | `1` prižge samodejni urnik; privzeto samo ročni gumb |
| `AVTONET_POLL_MS` | `15000` | kako pogosto pogleda za zahtevo iz plošče |
| `AVTONET_RESEARCH_HOURS` | `6,18` | ure pregleda — velja samo pri `AVTONET_URNIK=1` |
| `AVTONET_MAX_PAGES` | `0` | strani rezultatov; 0 = cel trg |
| `AVTONET_DETAIL_LIMIT` | `0` | oglasov v 2. fazi; 0 = vsi brez podrobnosti |
| `AVTONET_STALE_AFTER_MS` | `900000` | po tem molku se raziskava prevzame v nadaljevanje |
| `AVTONET_CRAWL_DELAY_MS` | `10000` | razmik med zahtevki — **ne nižajte** |
| `AVTONET_MAX_FAILURES` | `5` | zaporednih neuspehov do `ustavljeno` |
| `PORT` | `8080` | port za health |
