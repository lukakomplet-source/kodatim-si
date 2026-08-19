# Slike in novi viri — načrt (20. 8. 2026)

Dve vprašanji: **ali se splača hraniti slike lokalno** in **kje še legalno dobiti oglase**.
Vse spodnje številke so IZMERJENE na tem računalniku in na naših podatkih, ne ocenjene.
Skripta za ponovitev: `worker-avtonet/src/meritev-slik.ts` in `izracun-prostora.ts`.

## 1. Koliko slike sploh tehtajo (izmerjeno na 29 resničnih slikah)

| Različica | nepremicnine.net (1280×960) | avto.net (800×600) | povprečje |
|---|---|---|---|
| izvirnik pri viru | 202 kB | 94 kB | **146 kB** |
| sličica 400 px, WebP q75 | 19,8 kB (10 %) | 19,1 kB (20 %) | **19,5 kB** |
| srednja 1000 px, AVIF q50 | 61,4 kB (30 %) | 38,9 kB (41 %) | **49,8 kB** |
| srednja 1000 px, WebP q80 | 122,8 kB (61 %) | 75,7 kB (80 %) | 98,5 kB |
| polna 1600 px, WebP q82 | 195,1 kB (97 %) | 81 kB (86 %) | 136,1 kB |

Dvoje, kar se vidi šele iz meritve:

- **AVIF je pol cenejši od WebP** pri enaki velikosti prikaza (49,8 proti 98,5 kB). Za galerijo
  je to razlika med 42 GB in 72 GB.
- **Polna različica 1600 px nima smisla**: izvirniki so 1280 px (nepremičnine) oziroma 800 px
  (avti), zato "polna" različica samo prepiše izvirnik (97 % oziroma 86 %). Največ, kar
  potrebujemo, je 1000–1280 px.

## 2. Koliko slik je

| | aktivnih oglasov | slik na oglas | slik skupaj |
|---|---|---|---|
| avti (avto.net) | 53.790 | 9 (izmerjeno na oglasu) | 484.110 |
| nepremičnine | 10.643 | ~15 (ocena, glej opozorilo) | 159.645 |
| **skupaj** | **64.433** | | **643.755** |

Število slik na nepremičninski oglas je preverjeno na vzorcu: na detajlni strani oglasa, ki
mu kartica pripisuje 25 slik, jih je v galeriji dejansko 12 (`slonep_oglasi2/*.jpg`). Delovna
številka 15 je torej realna; če je povprečje 10, se spodnje številke znižajo za tretjino.

## 3. Koliko prostora bi to vzelo

Prostor na računalniku: **C: 46 GB prostega od 224 GB**, **E: 229 GB prostega od 233 GB**.
Baza je zdaj 635 MB. Slike zato sodijo na **E:**, nikakor ne na sistemski disk.

| Scenarij | Zasedenost |
|---|---|
| A) samo naslovna slika, sličica | 1,2 GB |
| B) samo naslovna slika, sličica + srednja (AVIF) | 4,3 GB |
| C) vse slike, samo sličice | 12 GB |
| **D) vse slike, sličica + srednja (AVIF)** | **42,5 GB** |
| E) vse slike, sličica + srednja (WebP) | 72,4 GB |
| F) vse slike, izvirniki brez stiskanja | 89,8 GB |

**Rast** (izmerjeno: mediana 1.528 novih avtomobilskih oglasov na dan):

| | na dan | na mesec | na leto |
|---|---|---|---|
| sličica + srednja (AVIF) | 0,9 GB | 27,3 GB | 331,7 GB |
| samo sličice | 0,3 GB | 7,7 GB | 93,3 GB |

Brez brisanja bi torej v enem letu prerasli disk. Z brisanjem slik, ko oglas izgine, pa se
zasedenost **ustali**:

| Slike izginulih oglasov brišemo po | Ustaljena zasedenost |
|---|---|
| takoj | 42,5 GB |
| **30 dneh** | **69,8 GB** |
| 90 dneh | 124,3 GB |
| 180 dneh | 206,1 GB |

## 4. Priporočilo glede slik

**Da, splača se — v obliki D z brisanjem po 30–90 dneh (70–125 GB na E:).** Utemeljitev:

- 70 GB je četrtina praznega diska E:; sistemskega diska se sploh ne dotakne.
- Uporabniška izkušnja: galerija se odpre takoj in ostane, tudi ko oglas pri viru izgine —
  prav takrat je slika najbolj dragocena (primerjava s prodanimi vozili).
- Hkrati je to pogoj za kasnejše prepoznavanje istega objekta prek slik (perceptual hash),
  ki je v shemi `nep_slike` že predviden.

Kar pa je treba vedeti, preden se to vklopi (glej razdelek 5): **hranjenje kopij fotografij ni
isto kot hranjenje povezav.** Zato predlagam stopnjevanje:

1. **Takoj, brez tveganja:** sličice (400 px) samo za oglase, ki so pri viru že izginili —
   tam povezava tako ali tako ne dela več, kopija pa je edini način, da posel ostane
   dokumentiran. ~1–2 GB.
2. **Ko je pravna slika jasna:** polne galerije za vire, ki to izrecno dovolijo.
3. **Nikoli:** kopiranje slik z virov, ki to prepovedujejo (bolha.com slikovne poti so v
   njihovem robots.txt izrecno prepovedane).

## 5. Kaj o slikah pravijo viri (stanje ob pisanju)

- **avto.net** — `robots.txt`: `User-agent: *`, `Disallow:` (prazno) in `Crawl-delay: 10`.
  Nič ni prepovedano, tudi slike ne. Zahteva pa 10 s med zahtevki; naš dnevni pregled dela
  s 3 s (seznami) in 2,5 s (detajli) — to je bila zavestna odločitev z varovalko
  (`blokada.ts`), a je ob morebitnem prenosu slik vredno premisliti znova.
- **nepremicnine.net** — `robots.txt` z oznakami `search=yes, ai-train=no, use=reference`.
  "use=reference" po naši dosedanji razlagi pomeni: kaži s sklicem na izvirnik, ne kopiraj.
  Zato tam danes hranimo samo URL.
- **bolha.com** — `robots.txt` izrecno prepoveduje `/image-80x60`, `/image-w185`,
  `/image-165x100`, `/image-140x140`, `/image-VL`, `/image-w620` in `/image-200x150`.
  Slik torej ne pobiramo; poleg tega je edino, kar je na seznamu na voljo, sličica 200×150.

## 6. Kam in kako (tehnično)

```
E:\sbn-slike\<vir>\<oglas-id>\<zaporedna>-<velikost>.<avif|webp>
```

- Ime datoteke nosi tudi `sha256` prvih 8 znakov, da se ista fotografija (ponovna objava
  istega vozila) hrani enkrat in se le poveže.
- V bazi: `nep_slike` (že obstaja) in nova `avtonet_slike` z istimi polji —
  `oglas_id, source_url, lokalna_pot, sha256, phash, sirina, visina, pozicija, glavna`.
- Streženje: pot `/api/slike/[...]` v Next.js, ki bere z E: in postavi `Cache-Control:
  immutable` (ime datoteke vsebuje hash, zato je varno). Dostop ostane za prijavljene, kot
  velja za ves demo modul.
- Prenos: ločen, počasen delavec (kot zbiralnik), ki zna nadaljevati, ima omejitev hitrosti
  na vir in nikoli ne prenaša slik oglasa, ki se ni spremenil (`sha256` že v bazi).
- Brisanje: ob `retention` koraku, ki že obstaja — slike izginulega oglasa gredo po 30
  (nastavljivo) dneh.

## 7. Novi viri oglasov

_(Razdelek se dopolni z izidom raziskave, ki teče — spodaj bodo viri s preverjenim
robots.txt, obsegom in oceno vrednosti.)_
