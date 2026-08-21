# Prošnja bolha.com za dovoljen dostop — osnutek

**Status: OSNUTEK. Ni poslano.** Pred pošiljanjem preveri podatke, označene z
`[…]`, in se odloči, koliko želiš razkriti o namenu.

---

## Zakaj to pismo sploh obstaja

21. 8. 2026 je bolha.com našemu zbiralniku začela vračati zaslon Radware Bot
Managerja s CAPTCHA. Tehnične poti mimo tega ne bomo iskali — to je pravilo
projekta in tudi razlog, da je bil isti dan izklopljen nepremicnine.net.

Raziskava je pokazala dvoje:

1. **Uradne, samopostrežne poti do podatkov bolha.com ni.** Ni razvijalskega
   portala, ni javnega API-ja, ni dokumentiranega XML izvoza za tretje osebe.
   XML dovodi, ki obstajajo, gredo v nasprotno smer — trgovci z njimi oglase
   *objavljajo*. Uradni center za pomoč (bolha.freshdesk.com) o podatkovnem
   dostopu nima nobenega članka.
2. **Dovoljeni seznam pri Radwaru upravlja lastnik strani, ne bot.** Radware v
   svoji dokumentaciji navaja, da izjeme ureja stranka prek svojega Bot Manager
   portala. Pisanje Radwaru je torej brezpredmetno — odloča bolha.

Zato je edina poštena pot vprašati bolho. Radwarova lastna klasifikacija ima
kategorijo **„Aggregator Bots" s priporočeno akcijo „Allow"** — to je koristen
argument, ker ne prosimo za izjemo od pravila, ampak za uvrstitev v kategorijo,
ki jo njihov lastni ponudnik zaščite priporoča spuščati.

## Naslovnik

- **Podjetje:** Styria digital marketplaces, spletni marketing in spletno
  oglaševanje, d.o.o., Verovškova ulica 55, 1000 Ljubljana
- **E-pošta podpore:** `podpora@bolha.com` — najdeno v poslovnih imenikih
  (bizi.si, companywall.si, itis.siol.net), **ne** na bolha.com, ker se vira
  med hlajenjem nismo dotikali. Pred pošiljanjem potrdi na njihovi strani.
- **Telefon:** `01 420 16 40` (isti vir, ista pripomba).
- Če obstaja poslovni/partnerski kontakt, je ta boljši naslovnik od splošne
  podpore.

### Prosi za PRAVO stvar

Bolha je okoli 2007–2009 imela XML endpointe (`/xml/izvoz/navadni.php`,
`/xml/test/html2xmlNepremicnine.php?agenc=…`) in tudi danes obstajajo
integracije prek partnerjev. Vse tečejo v **nasprotno smer**: to so kanali, po
katerih agencije in trgovci oglase *objavljajo* na Bolho. Tudi če bi jutri
dobili dostop do takega XML-a, naš bralnik od tega ne bi imel nič.

Prositi je torej treba za **dostop do podatkov** (licenčni/podatkovni dogovor
ali uvrstitev na dovoljeni seznam), ne za priklop na oglaševalski XML uvoz. Ta
razlika naj bo v pogovoru izrečena zgodaj.

### Česa NE počnemo, tudi če se ponudi samo od sebe

Arhiv kaže sledi nedokumentiranih notranjih poti (`api.bolha.com`,
`/api/*.json`). To **ni** zakonita alternativa. „Ni javne dokumentacije" se
zlahka bere kot povabilo, naj poiščemo skriti vmesnik — ni. Uporaba
nerazkritega vmesnika je izkoriščanje nenamerno izpostavljene poti in po
pravilu projekta neuporabna ne glede na to, ali bi tehnično delovala.

---

## Osnutek pisma

> **Zadeva: prošnja za dovoljen strojni dostop do javnih oglasov (nepremičnine)**
>
> Spoštovani,
>
> smo `[KodaTim / naziv podjetja]` iz Slovenije. Za stranko razvijamo orodje za
> analizo slovenskega nepremičninskega trga — iskalnik in kalkulator donosnosti,
> ki delujeta nad lastno bazo oglasov.
>
> Del te baze zajemamo tudi z bolha.com. Ker želimo to početi na način, s
> katerim se strinjate, vas prosimo za dogovor. Trenutno nam vaša zaščita
> (Radware Bot Manager) dostop zavrača, in tega ne poskušamo zaobiti.
>
> **Kako beremo danes:**
> - izključno javne kategorijske strani (`/prodaja-hise`, `/prodaja-stanovanja`
>   in podobne); `/search`, `/hitro-iskanje` in slikovnih končnih točk ne
>   odpiramo, ker jih vaš robots.txt prepoveduje;
> - največ **30 obiskov strani na dan**, z najmanj **15 sekundami** med njimi —
>   to je nekaj minut stika dnevno;
> - predstavljamo se z lastnim imenom `KodaTimBot/1.0 (+https://kodatim.si)` in
>   se ne pretvarjamo, da smo navaden brskalnik;
> - fotografij **ne kopiramo**. Hranimo samo naslove slik, prikaz je s sklicem
>   na vaš strežnik, vsak oglas pa ima vidno povezavo na izvirnik pri vas;
> - vsebine oglasov ne uporabljamo za učenje jezikovnih modelov.
>
> **Kaj prosimo:**
> 1. da nas uvrstite na dovoljeni seznam v vašem Bot Managerju — po imenu
>    odjemalca ali po naslovu IP, ki vam ga posredujemo; ali
> 2. da nam ponudite podatkovni dostop (feed ali API) pod vašimi pogoji,
>    vključno s plačljivim, če je tak dostop na voljo.
>
> Če za kaj od tega ni podlage, nam prosim to sporočite — v tem primeru bomo
> zajemanje z bolha.com ustavili in tega ne bomo poskušali nadomestiti s
> tehničnimi obhodi.
>
> Za vsa vprašanja o obsegu, ritmu ali namenu smo na voljo.
>
> Lep pozdrav,
> `[ime in priimek]`
> `[naziv podjetja, naslov, telefon, e-pošta]`

---

## Kaj priložiti, če vprašajo

- **Naslov IP zbiralnika** (statični naslov domačega omrežja oz. strežnika, s
  katerega teče `worker-nepremicnine`).
- **User-Agent**, s katerim se predstavljamo: `KodaTimBot/1.0 (+https://kodatim.si; zbiralnik nepremicninskih oglasov)`.
- **Točen obseg**: 11 kategorij nepremičnin, ~30 obiskov strani na dan,
  15 sekund med zahtevki, brez slik in brez podvirov.

## Česa v pismu namerno NI

- Nobene obljube, da bomo „samo indeksirali" — bazo res gradimo in to je v
  pismu povedano.
- Nobenega sklicevanja na `use=reference` ali podobne signale kot dovoljenje;
  to niso dovoljenja.
- Nobene prošnje Radwaru — niso stranka, ki odloča.

## Če odgovora ne bo

Molk ni dovoljenje. V tem primeru vir ostane izklopljen, tako kot
nepremicnine.net. Vrednost izdelka je mogoče graditi naprej na virih, kjer
tega vprašanja ni: **GURS ETN** (dosežene cene, CC BY 4.0, uraden prenos) in
**sodnedrazbe.si** (uraden portal Vrhovnega sodišča, robots.txt brez omejitev,
javni JSON API). Oba sta opisana v `docs/nacrt-slike-in-viri.md`, DEL 2, in
nobeden od njiju ni implementiran — tam je največ neizkoriščene vrednosti.
