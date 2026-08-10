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

`npm run once` naredi en krog in konča. `npm start` teče naprej in se sam
razporeja.

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
npm run test:parse     # razčlenjevalnik na resničnem besedilu strani (brez omrežja)
npm run test:collect   # živi zajem ene strani z avto.net (brez baze)
npm run test:health    # pogodba health endpointa (200 pri opozorilu, 503 pri ustavljenem)
npm run typecheck
```

`test:collect` je najbolj poveden: če se struktura strani spremeni, pade tam
in ne šele v produkciji.

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
| `AVTONET_ZNAMKE` | `BMW` | znamke, ločene z vejico |
| `AVTONET_INTERVAL_MIN` | `60` | minute med krogi |
| `AVTONET_MAX_PAGES` | `3` | strani rezultatov na znamko |
| `AVTONET_CRAWL_DELAY_MS` | `10000` | razmik med zahtevki — **ne nižajte** |
| `AVTONET_MAX_FAILURES` | `5` | zaporednih neuspehov do `ustavljeno` |
| `PORT` | `8080` | port za health |
