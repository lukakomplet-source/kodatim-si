# Slike in novi viri — načrt (20. 8. 2026)

Dve vprašanji: **ali se splača hraniti slike lokalno** in **kje še legalno dobiti oglase**.
Vse številke spodaj so izmerjene na tem računalniku, na naših podatkih ali prebrane iz
robots.txt posameznega vira. Kar ni preverjeno, je označeno kot ocena.

Skripte za ponovitev: `worker-avtonet/src/meritev-slik.ts`, `izracun-prostora.ts`,
`galerije.ts`.

---

# DEL 1 — SLIKE

## 1.1 Koliko slike tehtajo (izmerjeno na 29 resničnih slikah)

| Različica | nepremicnine.net (1280×960) | avto.net (800×600) | povprečje |
|---|---|---|---|
| izvirnik pri viru | 202 kB | 94 kB | **146 kB** |
| sličica 400 px, WebP q75 | 19,8 kB (10 %) | 19,1 kB (20 %) | **19,5 kB** |
| srednja 1000 px, **AVIF** q50 | 61,4 kB (30 %) | 38,9 kB (41 %) | **49,8 kB** |
| srednja 1000 px, WebP q80 | 122,8 kB (61 %) | 75,7 kB (80 %) | 98,5 kB |
| polna 1600 px, WebP q82 | 195,1 kB (97 %) | 81 kB (86 %) | 136,1 kB |

Dvoje, kar se pokaže šele iz meritve:

- **AVIF je pol cenejši od WebP** pri enaki velikosti prikaza. Pri milijonu slik je to razlika
  med 50 in 100 GB.
- **Polna različica 1600 px nima smisla.** Izvirniki so 1280 px (nepremičnine) oziroma 800 px
  (avti), zato "polna" različica samo prepiše izvirnik. Največ, kar rabimo, je 1000–1280 px.

## 1.2 Koliko slik je (izmerjeno, ne ocenjeno)

| | aktivnih oglasov | slik na oglas | slik skupaj |
|---|---|---|---|
| avti (avto.net) | 53.790 | **25** (izmerjeno: 12–40) | 1.344.750 |
| nepremičnine | 10.643 | ~15 (na preverjenem oglasu 12) | 159.645 |
| **skupaj** | **64.433** | | **1,5 milijona** |

Številka 25 je presenečenje in spremeni celoten izračun: prej smo hranili le tri slike na
oglas, zato je vse kazalo na ~9. Ko sem zajel celo galerijo (glej 1.5), so oglasi pokazali
12, 34, 40 in 12 fotografij.

⚠️ **Stolpec `nep_oglasi.st_slik` je nezanesljiv.** Porazdelitev je dvovrhova (6.919 vrstic
ima 1–2, 223 vrstic pa 31–94), živa preverba pa je pri oglasih, ki jim baza pripisuje 2
sliki, našla 8–22. Vsota 28.115 torej podcenjuje resnično število za 2,4- do 4-krat. Za
nepremičnine je zato v izračunu uporabljena delovna številka 15, ne vrednost iz baze.

## 1.3 Koliko prostora bi to vzelo

Prostor: **C: 46 GB prostega od 224 GB**, **E: 229 GB prostega od 233 GB**. Baza je 635 MB,
od tega `avtonet_oglasi` 527 MB. Slike sodijo na **E:**, nikoli na sistemski disk — na C:
teče tudi Docker z bazo in tam 46 GB ni rezerva, s katero bi se igrali.

| Scenarij | Zasedenost |
|---|---|
| A) samo naslovna slika, sličica | 1,2 GB |
| B) samo naslovna slika, sličica + srednja (AVIF) | 4,3 GB |
| C) vse slike, samo sličice | 28 GB |
| D) vse slike, sličica + srednja (AVIF) | **99,4 GB** |
| E) vse slike, sličica + srednja (WebP) | 169,3 GB |
| F) vse slike, izvirniki brez stiskanja | 209,8 GB |

**Rast** (izmerjeno: mediana 1.528 novih avtomobilskih oglasov na dan):

| | na dan | na mesec | na leto |
|---|---|---|---|
| vse slike, sličica + srednja (AVIF) | 2,5 GB | 75,7 GB | 921 GB |
| samo sličice | 0,7 GB | 21,3 GB | 259 GB |

| Slike izginulih oglasov brišemo po | Ustaljena zasedenost |
|---|---|
| takoj | 99,4 GB |
| 30 dneh | 175,2 GB |
| 90 dneh | 326,6 GB (**ne gre več na disk**) |

## 1.4 Priporočilo: ne kopirati vsega, ampak kar se gleda

Polna kopija vsega ni vzdržna: 99 GB takoj in 76 GB vsak mesec bi E: napolnilo v treh
mesecih. Predlagam štiristopenjski model, ki da **enak občutek** ("vidim vse slike"), a stane
delček tega:

1. **Prikaz s sklicem (privzeto, 0 GB).** Slike se prikažejo neposredno z vira. **To je že
   narejeno** — glej 1.5. Pravno je to edina pot, ki po sodni praksi EU zdrži brez licence
   (Svensson, BestWater) — glej DEL 3.
2. **Predpomnjenje ob ogledu (~10–20 GB, z zgornjo mejo).** Ko uporabnik odpre galerijo, se
   tiste slike shranijo (sličica + srednja AVIF). Večina oglasov se nikoli ne odpre, zato je
   to poceni; kar se gleda, pa ostane tudi potem, ko vir oglas umakne. Meja se drži z LRU
   brisanjem najdlje neuporabljenih.
3. **Vnaprej samo tisto, kar šteje (~1 GB).** Oglasi iz feeda poslov (404 poslov × 25 slik ≈
   10.000 slik ≈ 0,7 GB) in iz shranjenih iskanj se prenesejo vnaprej, da se odprejo takoj.
4. **Trajni arhiv le za izginule oglase (~28 GB v sličicah).** Ko oglas izgine, povezava
   neha delovati — takrat je kopija edini način, da posel ostane dokumentiran. Za dokaz
   zadošča sličica.

Skupaj: **30–50 GB namesto 99 GB**, brez neomejene rasti, in uporabnik vidi vse slike.

⚠️ **Stopnje 2–4 pomenijo lokalne kopije fotografij, kar je pravno sporno** — glej DEL 3.
Vrstni red zato ni tehnično, ampak pravno vprašanje: brez licence portala ostanemo pri
stopnji 1.

## 1.5 Kaj je že narejeno (danes)

- Zbiralnik shrani **cele galerije** kot seznam URL-jev (prej samo tri kot prstni odtis).
  Slike se pri tem ne prenašajo — hranimo naslove.
- Detajl oglasa (`/avtonet/oglas/[id]`) ima **galerijo**, ki slike kaže s sklicem na vir;
  klik odpre izvirni oglas.
- Ker se detajlna stran vsakega oglasa odpre samo enkrat, ima galerijo zaenkrat le peščica
  oglasov. `npm run galerije` (`src/galerije.ts`) jih dopolnjuje po vrstnem redu, ki šteje:
  najprej oglasi iz feeda poslov, nato najnovejši. Hitrost je nastavljiva; privzeto 10 s.

## 1.6 Kje in kako hraniti (ko preidemo na 2. stopnjo)

```
E:\sbn-slike\<vir>\<oglas-id>\<zaporedna>-<sha8>-<velikost>.avif
```

- Ime nosi prvih 8 znakov `sha256`, zato je datoteka nespremenljiva in jo brskalnik lahko
  predpomni za vedno (`Cache-Control: immutable`).
- Ista fotografija pri ponovni objavi istega vozila se hrani enkrat (isti `sha256`).
- Tabeli: `nep_slike` (že obstaja) in nova `avtonet_slike` z enakimi polji.
- Streženje prek poti `/api/slike/...` v Next.js, ki bere z E: — dostop ostane za prijavljene,
  kot velja za ves modul.
- Brisanje se pripne na obstoječi `retention` korak.

---

# DEL 2 — NOVI VIRI

Preverjenih je bilo 60 virov; spodaj so tisti, ki se splačajo. Pri vsakem je robots.txt
prebran dobesedno.

## 2.1 Prva liga — to spremeni igro

### 1. GURS: Evidenca trga nepremičnin (ETN) — **dosežene cene, ne zahtevane**

- <https://ipi.eprostor.gov.si/jgp/> (prenos), <https://podatki.gov.si/dataset/evidenca-trga-nepremicnin>
- **Uradna državna baza dejansko sklenjenih poslov od 2007** (kupoprodajni in najemni),
  CSV, licenca **CC BY 4.0** — komercialna uporaba dovoljena ob navedbi vira. Osebni podatki
  strank so izvzeti.
- Ni scrapanja: gre za uraden prenos datotek. robots.txt prepoveduje samo WFS servise.
- **Zakaj je to najpomembnejše odkritje raziskave:** vsi oglasniki dajo le *zahtevano* ceno.
  ETN da *doseženo*. Kombinacija "oglas + realizirana transakcija" je natanko tisto, česar
  konkurenca nima — in odgovori na vprašanje, ki ga zdaj ne moremo: za koliko se je res
  prodalo.

### 2. sodnedrazbe.si — sodne dražbe, javni API, **pokriva oba modula**

- <https://sodnedrazbe.si/>, API: `POST https://api.sodnedrazbe.si/public/publication/list`
- robots.txt v celoti: `User-agent: *` / `Disallow:` — **izrecno dovoljeno vse**.
- Izmerjeno 20. 8. 2026: **1.286 aktivnih objav** — 645 nepremičnin (385 zemljišč, 76 hiš,
  39 stanovanj …) in 607 premičnin, med njimi **49 avtomobilov z VIN in registrsko**.
- Izklicne cene so sistematično pod tržnimi — to je investicijski signal, ki ga iščemo.
- Prijava (SI-PASS) je potrebna samo za licitiranje, ne za branje.

### 3. doberavto.si (NLB Car&Go) — **21.827 vozil in oznaka „prodano"**

- robots.txt prepoveduje `/internal-api/`, `/administracija/` in podobno; oglasi so dovoljeni.
  Vsebuje `Content-Signal: ai-train=no, search=yes` → zajem za iskalnik da, učenje modelov ne.
- Statični HTML (Nuxt SSR), sitemap z 24 datotekami kot vstopna točka.
- **Ključno:** oglas prodano vozilo izrecno označi („Ta avto je že našel novega lastnika").
  Naš sistem danes prodajo le ugiba iz izginotja — tu bi jo končno *vedeli*.

## 2.2 Druga liga — hitre zmage

| Vir | Obseg | robots.txt | Opomba |
|---|---|---|---|
| **nepremicnine.siol.net** | 2.896 oglasov | prepovedani le uporabniški deli | najbolj permisiven portal; statični HTML |
| **mojikvadrati.com** | 7.736 nepremičnin | `Allow: /` + **`Crawl-delay: 30`** | edini nov vir po obsegu primerljiv z nepremicnine.net; zahteva 30 s razmika |
| **bolha.com — avto-moto** | 5.155 vozil | kategorije dovoljene, `/search` ne | zbiralnik že imamo; 1.603 karamboliranih vozil je segment, ki ga avto.net nima |
| **OPSI: tehnični pregledi** | ZIP ~373 MB/leto | `Disallow: /dataset/*/resource/*/download/` | **stanje števca kilometrov za vsako registrirano vozilo** → odkrivanje zavrtenih števcev; prenos ročno, ne s crawlerjem |
| **OPSI: registrirana vozila** | CSV v ZIP | isto | imenovalec za likvidnost: koliko primerkov modela sploh vozi po Sloveniji |

## 2.3 Kar se ne splača ali ne gre

- **nepremicnine24.si, kvadrati.info, planetnepremicnine** — ne obstajajo več (preverjeno z
  nslookup; ena domena je naprodaj).
- **hisa.si, dom.si, 24ur, zurnal24** — niso oglasniki.
- **Facebook Marketplace, Indomio.si** — robots.txt oziroma prijava to prepovedujeta.
- **RE/MAX, Stoja Trade, večina agencij** — malo lastnih oglasov ali brez strukturiranega
  seznama; mojikvadrati/24nep/kwslovenija/dodoma tečejo na isti platformi, zato bi en adapter
  pokril več strani hkrati.

## 2.4 Neskladja, ki jih je treba popraviti pri obstoječem zajemu

1. **avto.net zahteva `Crawl-delay: 10`**, naš dnevni pregled pa uporablja 3 s (seznami) in
   2,5 s (detajli). V kodi piše, da je bila hitrejša nastavitev zavestna odločitev z
   varovalko — a to je odstopanje od našega lastnega pravila „robots.txt spoštujemo
   dobesedno" in verjeten vzrok blokad, ki smo jih že imeli.
2. **mojikvadrati.com zahteva 30 s** — če ga dodamo, mora imeti svoj, počasnejši urnik.
3. **nepremicnine.net blokira ClaudeBot, GPTBot, CCBot in druge AI-crawlerje.** Naš zbiralnik
   se ne sme predstavljati kot kateri od njih; predstaviti se mora iskreno (npr.
   `KodaTimBot (+https://kodatim.si/bot)`), sicer bi se skrivali za tujo identiteto.
4. **`ai-train=no` na nepremicnine.net in doberavto.si** pomeni: podatke smemo uporabljati
   kot referenčno bazo dejstev in za iskalnik, **ne** pa za učenje modelov. To je treba
   zapisati v politiko projekta, ker je izrecen pridržek pravic.
5. **bolha.com prepoveduje slikovne poti** (`/image-200x150` in druge) — slik s tega vira
   torej ne prenašamo; edino, kar ponuja seznam, je tako ali tako sličica 200×150.

## 2.5 Predlagan vrstni red dela (glej tudi DEL 3)

1. **ETN (GURS)** — največja vrednost, brez scrapanja, brez pravnega tveganja. Enkraten uvoz
   + letna osvežitev; iz tega dobimo dosežene cene za primerjavo z zahtevanimi.
2. **sodnedrazbe.si** — javni API, en adapter, koristi obema moduloma.
3. **doberavto.si** — potrjena prodaja + 21.827 vozil.
4. **nepremicnine.siol.net** in **bolha avto-moto** — poceni razširitvi obstoječih adapterjev.
5. **mojikvadrati.com** — obsežen, a s 30-sekundnim razmikom, torej svoj urnik.
6. **OPSI (tehnični pregledi + registrirana vozila)** — ročni letni uvoz; da nam podatke o
   kilometrih in voznem parku, ki jih nima nihče.
7. Slike: 2. in 3. stopnja iz razdelka 1.4 **samo, če se uredi licenca** (DEL 3).

---

# DEL 3 — PRAVNI OKVIR

Raziskava s citati virov in sodne prakse. **To ni pravno mnenje** — pripravil ga je AI
agent, ne odvetnik; slovenske sodne prakse o teh vprašanjih praktično ni, dobesednih pogojev
uporabe portalov pa ni bilo mogoče prenesti (strežniki vračajo 403 za avtomatski dostop),
zato so navedbe iz iskalnih izvlečkov in jih je treba pred uporabo preveriti ročno.

## 3.1 Kar že počnemo (dejstvo, ne načrt)

`worker-avtonet/src/pdf-arhiv.ts` **že danes prenaša vse slike vozila v polni ločljivosti**,
jih stisne in trajno shrani v PDF na `E:\Samo slike od avtonet baza koda tim` s kapico
150 GB in **brez retencije**. Preverjeno 20. 8. 2026 ob 1:47: 2.655 datotek, 3,73 GB,
arhivar teče. Vprašanje torej ni „ali naj začnemo hraniti slike", ampak „ali naj s tem
nadaljujemo".

## 3.2 Fotografije: kopija proti sklicu

- **Sklic (hotlink/vgrajevanje) je dopusten** — Svensson C-466/12, BestWater C-348/13. Dokler
  vir ne uvede tehničnih ukrepov; če jih (VG Bild-Kunst C-392/19), vgrajevanje postane
  kršitev. Gola prepoved v pogojih uporabe za ta namen ne zadošča.
- **Lokalna kopija ni dopustna, tudi za prijavljene in z navedbo vira.** Renckhoff C-161/17
  je izrecno zavrnil vse tri običajne obrambe: prosto dostopen izvirnik (t. 35), odsotnost
  tehnične zaščite (t. 36), nekomercialno rabo (t. 42) — in razlikoval kopijo od povezave
  (t. 44): pri povezavi delo izgine, ko ga avtor umakne, pri kopiji ostane. To je natanko
  namen našega PDF arhiva.
- Že sam **prenos je reproduciranje** (ZASP 23) — samostojna kršitev, neodvisna od tega,
  komu sliko pokažemo.
- Izjema za privatno reproduciranje (ZASP 50) ne velja: samo za fizične osebe, brez
  gospodarske koristi, in izrecno **izvzema elektronske baze podatkov**.

## 3.3 „use=reference" — moja prejšnja razlaga je bila preohlapna

Uradna specifikacija Content Signals pozna **tri** signale: `search`, `ai-input`, `ai-train`.
**`use=reference` v njej ne obstaja** — je Cloudflarova razširitev s pomenom „Index, excerpt,
and link back". To je ožje od tega, kar počnemo: gradnja trajne lastne baze zapisov ni
indeksiranje z izsekom in povezavo. Ta signal je torej argument nasprotne strani, ne naš.

Slovenski prenos TDM izjeme je **ZASP 57.a**: pridržek pravic je veljaven „zlasti" s strojno
berljivimi sredstvi, torej **tudi prek splošnih pogojev**; peti odstavek pa določa, da so
nasprotna pogodbena določila nična. Slovenske sodne prakse o tem členu ni.

## 3.4 Pravica izdelovalca baze (sui generis)

ZASP 141.a–141.g. Varovani so tudi nebistveni deli, kadar se jemljejo **ponavljajoče in
sistematično** — kar dnevni zajem je. Nam v prid govori BHB C-203/02 (varovana je naložba v
pridobitev, ne v ustvarjanje podatkov; oglase prispevajo oglaševalci). Proti nam govorita
**Innoweb C-202/12** (namenski metaiskalnik prav po avtomobilskem oglasniku) in **CV-Online
Latvia C-762/19**, katerega izrek opisuje naš sistem skoraj dobesedno. Merilo ni količina,
ampak ali ogrožamo povrnitev naložbe vira.

## 3.5 Pogoji uporabe

nepremicnine.net po izvlečkih prepoveduje avtomatske poizvedbe in robote, **izjemo pa daje
samo univerzalnim iskalnikom** — specializirani (vertikalni) iskalniki so iz izjeme izrecno
izvzeti. Naš sistem je vertikalni iskalnik. avto.net prepoveduje uporabo elementov strani za
vse razen lastne nekomercialne rabe. Pogojev bolha.com ni bilo mogoče pridobiti.

## 3.6 GDPR — telefonske številke zasebnikov

Hranimo imena in telefonske številke fizičnih oseb, trajno, brez roka hrambe, jih uporabljamo
kot ključ za povezovanje in prikazujemo kot klikljive `tel:` povezave. Mnenje Informacijskega
pooblaščenca **07121-1/2025/1552 (6. 1. 2026)** obravnava skoraj enak primer (aplikacija za
zgodovino cen oglasov) in pravi: javna dostopnost podatka ne pomeni, da ga je dovoljeno
neomejeno uporabljati; kdor tako zajema, je upravljavec. Starejše mnenje dodaja, da iz javno
dostopnih podatkov ni dovoljeno ustvariti **nove zbirke** osebnih podatkov. Člen 14 GDPR
zahteva obvestilo posamezniku najkasneje ob prvem kontaktu; izjema „nesorazmeren napor" pri
nas verjetno ne velja, ker kontaktne podatke imamo (primer Bisnode, ~220.000 EUR).

Pomembno: **agregirana analitika brez osebnih podatkov je zunaj dosega GDPR** — naše javne
strani `/avtonet/trg` in `/avtonet/analiza` so v tem razredu.

## 3.7 Priporočila, urejena po razmerju korist/strošek

1. **Iskren User-Agent** (`KodaTimBot (+https://kodatim.si/bot)`) namesto lažnega Chroma.
   Poceni, odstrani najlažji očitek.
2. **Anonimizacija ob izginotju oglasa**: ime in telefon ven, cena/model/letnik/km/regija
   ostanejo. Analitični izdelek s tem ne izgubi ničesar.
3. **Spoštovanje `Crawl-delay: 10` na avto.netu** (zdaj 3 s / 2,5 s). Odločitev je bila
   zavestna, a v sporu je hitrejši zajem najslabše možno izhodišče.
4. **Odločitev o PDF arhivu**: ali ga omejiti na podatke brez fotografij, ali pridobiti
   dovoljenje portala. Trenutna oblika je največja izpostavljenost.
5. **Politika projekta**, ki zapiše: `ai-train=no` spoštujemo (baza kot iskalnik da, učenje
   modelov ne), slik ne kopiramo brez licence, osebne podatke hranimo omejen čas.
6. Če želimo slike zares hraniti: **pisno dovoljenje portala** — pri čemer je treba preveriti,
   ali portal sploh sme podeliti pravice naprej (od oglaševalcev jih ima za objavo pri sebi).
