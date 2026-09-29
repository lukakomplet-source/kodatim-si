# Prošnje za dovoljenje — viri, kjer so dražbe in deali

Osnutki pisem za vire, ki jih raziskava 28.–29. 9. 2026 **ni zavrnila zaradi prepovedi, ampak zaradi manjkajočega dovoljenja**.
Pri vseh je tehnični dostop odprt (brez CAPTCHE, brez zaščite), a pogoji, licenca ali robots.txt zahtevajo, da najprej vprašamo.
Brez dovoljenja jih ne beremo — to je pravilo projekta (glej CLAUDE.md).

Polja v `[oglatih oklepajih]` izpolni pred pošiljanjem. **Naslovov, ki jih raziskava ni našla, nisem izmislil** — označeni so.

| Vir | Kaj prinese | Kdo odloča | Stanje |
|---|---|---|---|
| sodnedrazbe.si | vse sodne dražbe in stečajne prodaje v SI; izklicna cena + ocenjena vrednost (npr. 109.200 € pri oceni 156.000 € = 70 %) | Vrhovno sodišče RS, Center za informatiko | pismo 1 |
| AJPES eObjave (insolventnost) | najzgodnejši znak stečaja podjetja — preden pride premoženje na dražbo | isti naslov (AJPES pogoji 7. člen ga napotijo tja) | pismo 1 |
| e-obcina.si (148 občin) | javne dražbe in zbiranja ponudb občin — pogosto EDINO mesto objave (npr. „Bivši Hotel Ormož") | Sigmateh d.o.o. | pismo 2 |
| edrazbe.si | ~70 aktivnih dražb, objavljenih 3–6 tednov pred dražbo | Praetor d.o.o. | pismo 3 |
| Ediktsdatei (AT) | avstrijske sodne dražbe, Koroška/Štajerska; Schätzwert 1.339.000 € → najnižja ponudba 669.500 € (50 %) | BMJ, licenca IWG | pismo 4 (plačljivo) |
| ponip.fina.hr (HR) | 11.098 hrvaških sodnih prodaj, CSV; ugotovljena vrednost proti začetni ceni | FINA | pismo 5 |
| Portale Vendite Pubbliche (IT) | italijanske sodne dražbe; ima kategorijo „ALBERGHI_E_PENSIONI" | Ministero della Giustizia (DGSIA) | pismo 6 |

**Kaj v vseh pismih obljubimo — in moramo tudi držati:** iskrena identiteta (`KodaTimBot/1.0 (+https://kodatim.si)`),
1–2 zahtevka na dan, vsak zadetek vodi na izvirno objavo, ne hranimo osebnih podatkov (sodnik, dolžnik, upravitelj),
ne kopiramo slik, vir navedemo, izbrišemo na zahtevo.

---

## Pismo 1 — Vrhovno sodišče RS, Center za informatiko

**Za:** `[naslov: Center za informatiko / glavna pisarna Vrhovnega sodišča RS — preveri na sodisce.si]`
**Zadeva:** Prošnja za dovoljenje za samodejni prevzem javnih objav s portala sodnedrazbe.si in objav v postopkih zaradi insolventnosti

Spoštovani,

v podjetju `[naziv podjetja]` razvijamo SBN Nepremičnine, orodje, ki kupcem nepremičnin na enem mestu pokaže ponudbo na trgu
in jo primerja s tržnimi cenami. Sodne dražbe so za kupce pomemben, a razpršen del trga; radi bi jih vključili tako, kot je
za portal primerno.

Prosimo za dovoljenje za:

1. **sodnedrazbe.si** — prevzem objav o prodaji nepremičnin prek vira RSS (`https://api.sodnedrazbe.si/public/publication/feed?type=rss`),
   ki ga portal oglašuje v glavi strani, oziroma prek vmesnika `/public/publication/list`, če ga dovolite. Datoteka
   `api.sodnedrazbe.si/robots.txt` trenutno vrne napako HTTP 500, zato brez vašega soglasja ne moremo zanesljivo presoditi,
   ali je samodejni dostop dovoljen.
2. **objave v postopkih zaradi insolventnosti** — AJPES v 7. členu splošnih pogojev za samodejni prevzem teh dokumentov
   napoti na vaš Center za informatiko.

Kako bi prevzemali: največ dva zahtevka na dan, z iskreno identifikacijo `KodaTimBot/1.0 (+https://kodatim.si)`. Prikazali bi
samo podatke o predmetu prodaje (vrsta, lokacija, površina, ocenjena vrednost, izklicna cena, datum in krog prodaje) in vsak
zadetek povezali na izvirno objavo. **Podatkov o sodniku, dolžniku, upniku, izvršitelju in upravitelju ne bi hranili** —
zavedamo se 5. člena Pravilnika (Uradni list RS, 13/2026), po katerem ti podatki niso javno prikazani. Slik ne kopiramo.
Na zahtevo kar koli takoj izbrišemo.

Če obstaja uradna pot za odprte podatke (izvoz, licenca, pogodba), bomo z veseljem uporabili njo.

Lep pozdrav,
`[ime, priimek, funkcija]` · `[naziv podjetja, naslov, matična številka]` · `[e-pošta, telefon]`

---

## Pismo 2 — Sigmateh d.o.o. (e-obcina.si)

**Za:** info@e-obcina.si, podpora@e-obcina.si
**Zadeva:** Prošnja za dovoljenje za samodejni prevzem javnih objav o prodaji nepremičnin z občinskih spletnih strani e-obcina.si

Spoštovani,

v podjetju `[naziv podjetja]` razvijamo SBN Nepremičnine, orodje, ki kupcem na enem mestu pokaže ponudbo nepremičnin.
Občine po ZSPDSLS-1 javne dražbe in javna zbiranja ponudb pogosto objavijo samo na svoji spletni strani; 148 občin to počne
na vaši platformi.

Vaši Splošni pogoji spletne strani (veljavni od 1. 1. 2026) dovoljujejo uporabo vsebin „zgolj za zasebne namene", zato vas
pred kakršnim koli samodejnim dostopom prosimo za dovoljenje za prevzem **samo objav o prodaji in oddaji nepremičnin** prek
vira RSS (`/RazpisiRSS`), ki ga robots.txt vaših strani dovoljuje.

Kako bi prevzemali: en zahtevek na občino na dan, z iskreno identifikacijo `KodaTimBot/1.0 (+https://kodatim.si)`. Prikazali
bi naslov objave, vrsto in lokacijo nepremičnine, izklicno ceno in rok, in vsako objavo povezali nazaj na stran občine.
Besedil in prilog ne bi objavljali v celoti; osebnih podatkov ne hranimo. Na zahtevo takoj prenehamo in izbrišemo.

Če bi vam bolj ustrezala druga oblika (izvoz, API, pogodba), smo odprti za dogovor.

Lep pozdrav,
`[ime, priimek, funkcija]` · `[naziv podjetja, naslov]` · `[e-pošta, telefon]`

---

## Pismo 3 — Praetor d.o.o. (edrazbe.si)

**Za:** `[naslov Praetor d.o.o. — raziskava ga ni našla; živa podpora: livesupport.praetor.si]`
**Zadeva:** Pogoji uporabe portala eDražbe in dovoljenje za prevzem vira RSS

Spoštovani,

razvijamo SBN Nepremičnine, orodje za kupce nepremičnin. Portal eDražbe v glavi vsake strani oglašuje vir RSS/Atom
(`api.sys.edrazbe.si/public/publication/feed`), vaših splošnih pogojev uporabe pa na portalu nismo mogli prebrati
(stran `/licence` se izriše samo z JavaScriptom, besedila v njej ni).

Prosimo vas (1) za besedilo veljavnih pogojev uporabe portala in (2) za dovoljenje, da vir RSS prevzemamo enkrat na dan, z
iskreno identifikacijo `KodaTimBot/1.0 (+https://kodatim.si)`, pri čemer vsako dražbo povežemo nazaj na vaš portal, ne
kopiramo slik in ne hranimo osebnih podatkov.

Lep pozdrav,
`[ime, priimek]` · `[naziv podjetja]` · `[e-pošta, telefon]`

---

## Pismo 4 — Bundesministerium für Justiz (Ediktsdatei, licenca IWG) — PLAČLJIVO

**Za:** IWG-Antrag@bmj.gv.at (ali pisno: BMJ Abt. III 3, Museumstraße 7, 1070 Wien)
**Pogoji iz „IWG-Vereinbarung Ediktsdatei" (maj 2024):** 90 € enkratno + 90 € na mesec (+ DDV), odločitev v 4 tednih.
**Odločitev o strošku je tvoja.** Vrednost: avstrijske sodne dražbe s Schätzwertom in najnižjo ponudbo (pogosto 50 %).

**Betreff:** Antrag auf Weiterverwendung gemäß IWG — Ediktsdatei, Kategorie „Gerichtliche Versteigerungen – Liegenschaften"

Sehr geehrte Damen und Herren,

wir, `[Firmenname, Anschrift, Firmenbuch-/Registernummer]`, entwickeln „SBN Nepremičnine", eine Plattform, die Käufern von
Immobilien einen Marktüberblick bietet. Wir beantragen die Weiterverwendung der Daten der Ediktsdatei für die Kategorien
„Gerichtliche Versteigerungen – Liegenschaften" sowie „Verkäufe und Verpachtungen in Insolvenzverfahren" gemäß der
IWG-Vereinbarung Ediktsdatei (Stand Mai 2024), einschließlich der laufenden Änderungslieferung.

Wir verwenden ausschließlich objektbezogene Angaben (Art, Lage, Fläche, Schätzwert, geringstes Gebot, Termin) mit Verweis auf
das Originaledikt; personenbezogene Daten werden nicht gespeichert. Die Nutzungsbedingungen und Entgelte (EUR 90 einmalig,
EUR 90 monatlich zzgl. USt.) haben wir zur Kenntnis genommen.

Mit freundlichen Grüßen
`[Name, Funktion]` · `[E-Mail, Telefon]`

---

## Pismo 5 — FINA (ponip.fina.hr, e-Oglasna ploča)

**Za:** `[naslov FINA — raziskava ga ni našla; preveri na fina.hr, kontakt]`
**Subject:** Permission for automated retrieval of the public CSV export of ponip.fina.hr for a commercial property search service

Dear Sir or Madam,

`[Company]` is developing "SBN Nepremičnine", a property search service for buyers in Slovenia and the neighbouring
Croatian coast. ponip.fina.hr publishes a public CSV export (`/ocevidnik-web/preuzmi/csv`), and data.gov.hr lists it under the
Otvorena dozvola. Your website terms (fina.hr/info/uvjeti-koristenja), however, limit use to private, non-commercial purposes
and require your written consent for distribution.

To be certain we act within your rules, we ask for written permission to download the CSV export **once a day** with an
honest identification (`KodaTimBot/1.0 (+https://kodatim.si)`), to use only property-level fields (type, location, area,
assessed value, starting price, sale date) with a link to the original notice, and not to store any personal data. We will
stop and delete on request.

Kind regards,
`[Name, title]` · `[Company, address]` · `[e-mail, phone]`

---

## Pismo 6 — Ministero della Giustizia, Portale delle Vendite Pubbliche

**Za:** `[naslov DGSIA / PVP — raziskava ga ni našla; preveri na pvp.giustizia.it, contatti]`
**Subject:** Request for authorisation to reuse Portale delle Vendite Pubbliche notices for a commercial property service

Dear Sir or Madam,

`[Company]` is developing "SBN Nepremičnine", a property search service for buyers in Slovenia and neighbouring regions,
including Friuli-Venezia Giulia and Veneto. The Ministry's Note legali (2 December 2025) allow reuse of site content for
non-commercial purposes and state that the administration identifies the cases in which commercial use is possible.

We therefore ask for authorisation to retrieve, at most once a day and with an honest identification
(`KodaTimBot/1.0 (+https://kodatim.si)`), the public notices for real-estate lots (in particular category
„Alberghi e pensioni"), to display only lot-level data (type, location, area, valuation, base price, sale date) with a
transparent link to the original notice, and not to store personal data. If a documented export or API exists, we will use it.

Kind regards,
`[Name, title]` · `[Company, address]` · `[e-mail, phone]`

---

# Agencije z izključnim inventarjem (drugi krog, 29. 9. 2026)

Po naših podatkih se deal pokaže **prvi** tam, kjer oglasa ni na nepremicnine.net. Delež aktivnih oglasov posamezne
agencije, ki jih nepremicnine.net nima: RE/MAX 78 %, Ljubljana nepremičnine 63 %, INSA 48 %, Mesto nepremičnin 41 %,
Borza nepremičnin 32 %. Pri vseh petih je tehnični dostop odprt, pravno obvestilo pa rabo omejuje na nekomercialno
ali pogojev ni mogoče prebrati — zato prosimo. (MONDREAL in Stoja trade sta presojo prestala in sta že v zbiralniku.)

| Agencija | Oglasov | Zakaj dovoljenje | Kontakt |
|---|---|---|---|
| Ljubljana nepremičnine d.o.o. | ~5.700 (SI + HR) | pravno obvestilo: „le v nekomercialne namene … ne sme se jih kopirati … brez pisnega dovoljenja" | info@ljn.si, 01 244 50 00 |
| INSA d.o.o. (Maribor) | 65 | „vsaka druga oblika uporabe … v komercialne namene je prepovedana … brez predhodnega pisnega dovoljenja" | nepremicnine@insa.si, 02 33 05 800 |
| Mesto nepremičnin d.o.o. | 436 | stran „Avtorske pravice": samo nekomercialna, osebna raba | info@mestonepremicnin.si |
| Borza nepremičnin d.o.o. | ~48 | pogoji v PDF vrnejo HTTP 403 — ni jih mogoče prebrati; Crawl-delay 120 | info@b-n.si, 03 492 42 22 |
| RE/MAX Slovenija | 2.518 | trenutnih pogojev ni (SPA brez strani s pogoji); zadnji berljivi (2013) prepovedujejo obdelavo podatkov | preveri na re-max.si |

## Pismo 7 — agenciji (enak osnutek za vse zgoraj, zamenjaj ime)

**Zadeva:** Prošnja za dovoljenje za prikaz vaših oglasov v iskalniku SBN Nepremičnine

Spoštovani,

v podjetju `[naziv podjetja]` razvijamo SBN Nepremičnine, iskalnik, ki kupcem na enem mestu pokaže ponudbo nepremičnin
in vsakega obiskovalca pošlje na izvirni oglas. Vaši oglasi so pogosto objavljeni samo na vaši strani — prav zato bi jih
radi pokazali, a vaše pravno obvestilo rabo omejuje na nekomercialne namene, zato vas prosimo za dovoljenje.

Kako bi jih prikazovali: samo dejstva (vrsta, lokacija, površina, cena), **vsak zadetek s povezavo na vaš oglas**, brez
kopiranja fotografij in besedil opisov, brez podatkov o agentih. Stran bi obiskali enkrat na dan, z iskreno
identifikacijo `KodaTimBot/1.0 (+https://kodatim.si)` in razmikom, ki ga določite vi. Na zahtevo takoj prenehamo in
izbrišemo. Če vam je ljubši izvoz (XML/feed), ga z veseljem uporabimo namesto branja strani.

Za vas to pomeni dodatne obiske kupcev na vaših oglasih, brez stroškov.

Lep pozdrav,
`[ime, priimek, funkcija]` · `[naziv podjetja]` · `[e-pošta, telefon]`
