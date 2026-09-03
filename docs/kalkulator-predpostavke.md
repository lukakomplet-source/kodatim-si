# Investicijski kalkulator — od kod je vsaka številka

Preverjeno 3. 9. 2026 z devetimi neodvisnimi raziskavami po javnih virih
(FURS, PIS, Banka Slovenije, SZ-1, koalicijska pogodba). Kar je tu zapisano,
je bilo **prebrano v viru**, ne ugibano. Kjer vira ni bilo, tako tudi piše.

Namen dokumenta: ko se čez pol leta spremeni zakon, naj bo jasno, katera
vrstica v kodi se popravi in zakaj je bila taka, kot je bila.

---

## 1. Kaj je bilo POTRJENO (koda je bila pravilna)

| Predpostavka | Vrednost | Vir |
|---|---|---|
| Dohodnina od najemnin, fizična oseba | **25 %**, cedularno in dokončno (135.č člen ZDoh-2); velja od 1. 1. 2023 in nespremenjeno v 2026 | FURS, stran posodobljena 13. 2. 2026 |
| Normirani stroški | **10 %** → davek = 25 % od 90 % najemnine = **22,5 % bruto** (77. člen ZDoh-2) | FURS „Podrobnejši opis", izdaja januar 2026 |
| Najemnina se ne všteva v letno dohodninsko osnovo | drži — cedularna obdavčitev; možnost sintetične obdavčitve je veljala samo za leto 2022 | FURS |
| Osnova je čista najemnina | brez obratovalnih stroškov, ki jih po pogodbi plača najemnik | FURS |
| DDPO za d.o.o. | **22 %** za davčna leta 2024–2028, nato 19 % | ZDDPO-2 + ZORZFS |
| Amortizacijske stopnje | 3 % celoten objekt, 6 % del objekta, 10 % drugo, 20 % oprema, 50 % računalniška | ZDDPO-2, 33. člen |
| Anuiteta, amortizacijski načrt, NOI, DSCR, LTV, cash-on-cash, prag zasedenosti | formule ustrezajo standardnim definicijam | strokovni viri |

---

## 2. Kaj je bilo POPRAVLJENO

### 2.1 Cap rate ni donos na strošek
`NOI / (kupnina + prenova + stroški)` **ni** cap rate — to je *donos na strošek*
(yield on cost). Cap rate je `NOI / kupnina`. Stara stran je drugo številko
imenovala „cap rate pri tej ceni", kar je zavajalo pri vsaki primerjavi s
tržnimi cap rati.

**Zdaj:** obe številki, vsaka s svojim imenom in enim stavkom razlage.

### 2.2 Banka Slovenije LTV ne predpisuje, DSTI pa
- LTV 80 % / 70 % je **nezavezujoče priporočilo**; banka sme odstopiti, mora
  pa odstopanje evidentirati in obrazložiti (14. člen sklepa).
- **DSTI 50 % je zavezujoč** in enoten od 1. 7. 2023 (prej stopnjevano 50/67 %).
  Banka sme mejo preseči pri največ 3 % novih stanovanjskih kreditov na
  četrtletje (prej 10 %).
- **Ročnosti stanovanjskih kreditov Banka Slovenije NE omejuje.** 30 let je
  bančna praksa (NLB, Intesa do 30; SKB do 25), ne predpis. Zavezujočih 84
  mesecev velja samo za potrošniške kredite brez hipoteke.

**Zdaj:** kalkulator ima neobvezno polje za neto dohodek in preveri DSTI —
edino omejitev, ki jo banka res mora spoštovati. Namig pri dobi kredita ne
trdi več, da je 30 let zakonska meja.

### 2.3 Fizična oseba ne more uveljavljati amortizacije
Po 77. členu ZDoh-2 je osnova najemnina minus 10 % normiranih **ali** dejanski
stroški **vzdrževanja** (računi, plačani med oddajanjem). Amortizacija ni
priznan strošek. Prav tako se **investicije** (nova streha, dozidava, nova
kopalnica) ne priznajo — te povečajo nabavno vrednost pri kasnejšem davku na
kapitalski dobiček (98. člen).

**Zdaj:** razčlenitev prenove po postavkah in polji za amortizacijo se
pokažejo **samo pri d.o.o.**; pri fizični osebi kalkulator amortizacije ne
odbije.

### 2.4 Obratovalni stroški niso nič
Po SZ-1 lastnik obvezno nosi upravnika, rezervni sklad, zavarovanje stavbe in
vzdrževanje; najemnik nosi obratovalne stroške (elektrika, voda, ogrevanje,
smeti). Realen delež lastnikovih stroškov brez CAPEX je **8–15 % najemnine**.

Zakonski minimum v rezervni sklad (samo skupni deli): stavba do 10 let 0 €;
11–30 let 0,20 €/m²/mesec; 31–60 let 0,25; nad 60 let 0,30 (= 2,40–3,60 €/m²
na leto). Za notranjost stanovanja slovenskega normativa ni; mednarodna praksa
je 5–10 % bruto najemnine ali ~1 % vrednosti na leto.

**Zdaj:** privzetki 8 % vzdrževanje + 5 % CAPEX + 400 € zavarovanje.

### 2.5 NUSZ in davek od premoženja obstajata
- **NUSZ** se odmerja tudi v 2026; zavezanec je praviloma lastnik. Okvirno
  **1,4–1,7 €/m² na leto v Ljubljani**, 0,7–1,3 €/m² v drugih mestnih občinah
  (300 m² v Ljubljani ≈ 460 €/leto).
- Poleg tega obstaja **davek od premoženja** po Zakonu o davkih občanov —
  velja tudi za 2026 in ga plača fizična oseba, „ne glede na to, ali lastnik
  premoženje uporablja sam ali ga daje v najem".

**Zdaj:** polje „Davki na nepremičnino" z okvirnimi zneski v namigu. Prej ta
strošek v izračunu sploh ni obstajal.

### 2.6 Cilji so bili ameriški
Privzeti cilj 8 % cash-on-cash in 12 % ROI je iz ameriške literature. Pri
slovenskih cenah in najemninah je **5 % na vloženi denar dober posel**, nad
8 % pa razlog, da še enkrat preveriš predpostavke.

**Zdaj:** privzetka 5 % in 10 %, oba še vedno uporabnikova izbira.

### 2.7 Praznine so se štele dvakrat
Staro besedilo pri stroških je navajalo „praznine" med obratovalnimi stroški,
čeprav so že odštete prek zasedenosti.

**Zdaj:** praznine so svoje polje, med stroški niso omenjene.

---

## 3. Kaj je ostalo NEGOTOVO

| Vprašanje | Stanje 3. 9. 2026 |
|---|---|
| Nov davek na nepremičnine | Januarja 2025 so bila v javni razpravi izhodišča (1,45 % posplošene tržne vrednosti za nepremičnine, v katerih lastnik ne prebiva, z znižanjem ob oddaji). **Koalicijska pogodba nove koalicije (maj 2026) nepremičninskega davka ne predvideva.** Sprejetega zakona ni bilo mogoče potrditi. |
| Napovedano znižanje davka na najemnine | Nova koalicija napoveduje „nižjo obdavčitev dolgoročnega oddajanja"; sprejete spremembe ZDoh-2 do septembra 2026 ni. |
| Delež zemljišča v kupnini | Zakonskega odstotka ni. Določi se po pogodbi, cenitvi ali GURS. Primeri iz literature: 9 % (poslovni prostor v etažni lastnini) do 32 % (hiša z zemljiščem). Privzetih 20 % je sredina, ne pravilo. |
| Lastna udeležba pri financiranju d.o.o. | Uradnega pravila ni, bančna praksa ni javno objavljena kot fiksen odstotek. 30–40 % je izkustvena ocena. |

Vse štiri so v vmesniku vidne kot **predpostavke**, ne kot dejstva.

---

## 4. Kar zavestno NI vključeno

- **Prenos davčne izgube** (36. člen ZDDPO-2: do 50 % osnove na leto, od
  1. 1. 2025 največ pet obdobij). Kalkulator računa eno tipično leto, ne
  večletne davčne bilance — vključitev bi zahtevala projekcijo po letih.
- **Omejitev obresti med povezanimi osebami** (19. člen ZDDPO-2, priznana
  obrestna mera ministrstva). Velja le, če posojilo da družbenik; pri bančnem
  kreditu omejitve ni.
- **Normirani odhodki za d.o.o.** — ukinjeni od 1. 1. 2025 (ZDDPO-2U), zato
  jih kalkulator pravilno ne ponuja.
- **Kratkoročno turistično oddajanje** (Airbnb) — to je dohodek iz dejavnosti
  z drugim davčnim režimom. Kalkulator računa dolgoročni najem.

---

## 5. Merilo prenosa

`npm run test:posel` primerja izračun z izidom Kompletka za posel „Parmova
ulica 4, Vojnik" (31. 8. 2026): vložek 106.800 €, tok 634 €/mes, CoC 7,1 %,
LTV 46,8 %, DSCR 1,64, ROI 23,3 %, equity iz prenove 132.500 €, ocena 85/100.

Če se katera od teh številk razide, prenos ni prenos, ampak nov kalkulator — in
obe aplikaciji bi za isti posel kazali različni resnici.
