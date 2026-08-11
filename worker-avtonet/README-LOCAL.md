# SBN Auto — lokalni worker (Windows)

Scraper SBN Auto teče **na tvojem računalniku**, ne na Vercelu. Tako dolgotrajno
zbiranje ne obremenjuje Vercela — ta samo prikazuje podatke iz Supabase.

```
GitHub → Vercel (SBN Auto UI/API)         ← koda in stran
                     ↓
                 Supabase (baza)
                     ↑
        TVOJ RAČUNALNIK (ta worker) → avto.net   ← scraping
```

Worker se poveže **naravnost na Supabase in avto.net**. Ne potrebuje ne Vercela,
ne odprtega brskalnika, ne odprte KodaTim strani. Ko je računalnik prižgan,
zbira; ko ga ugasneš, se ustavi in podatki ostanejo — ob naslednjem zagonu
nadaljuje, kjer je ostal.

## Prvič (enkrat)

1. Dvoklikni **`SETUP-SBN-WORKER.bat`**.
   Preveri Node.js, namesti pakete in Chromium, pripravi `.env` in preveri
   povezavo s Supabase.
2. Ko odpre `.env` v Beležnici, vpiši dve vrstici (dobiš ju v Supabase →
   Settings → API) in shrani:
   ```
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
   `service_role` ključ je poln dostop do baze — ostane samo tu, nikamor drugam.
   `.env` ni v gitu in ne gre na GitHub.

## Vsak dan

Dvoklikni **`START-SBN-WORKER.bat`** in pusti okno odprto.

- Worker sam ob **5.00, 10.00 in 22.00** požene pregled (nastavljeno v `.env`,
  `AVTONET_RESEARCH_HOURS`). Če je računalnik takrat ugasnjen, se termin
  preskoči — nič se ne pokvari.
- Kadarkoli lahko pregled sprožiš tudi z gumbom **ZAŽENI RESEARCH** na
  `kodatim.si/avtonet/pregled`. Worker ga pobere v nekaj sekundah.
- Če worker pade, ga `START` sam znova zažene (z naraščajočim premorom, brez
  hitre zanke).

## Kako veš, da dela

V oknu vidiš:

```
{"msg":"zbiralnik zagnan","nacin":"urnik + rocne zahteve","urnikOb":[5,10,22]}
{"msg":"health na portu 8080"}
```

Na `kodatim.si/avtonet/pregled` je **Zbiralnik deluje** (zeleno) in dnevnik, ki
se med pregledom polni v živo. Če je računalnik ugasnjen, plošča po nekaj minutah
pokaže **Zbiralnik ne javlja** — to je pričakovano, ne napaka.

## Ustavljanje

Zapri okno ali pritisni **Ctrl+C**. Worker dokonča trenutno stran, pusti
checkpoint in se ustavi. Naslednji zagon nadaljuje od tam.

## Posodobitev

Dvoklikni **`UPDATE-SBN-WORKER.bat`** — potegne novo kodo z GitHuba in posodobi
pakete. `.env` ostane nedotaknjen.

## Hitrost in vljudnost do vira

Privzeto 3 s med stranmi seznama, 2,5 s med oglasi, 2 vzporedno. Ob znaku
omejevanja (429/403) se sam upočasni in po nekaj blokadah ustavi. Če želiš nazaj
na najbolj varno (kot avto.net prosi v robots.txt), v `.env`:

```
AVTONET_DELAY_LIST_MS=10000
AVTONET_DELAY_DETAIL_MS=10000
AVTONET_DETAIL_CONCURRENCY=1
```

Brez proxyjev, brez zaobhajanja zaščit — če vir reče ne, worker počaka ali se
ustavi.

## Prvo polnjenje vs. dnevno

Prvi pregled celega trga je velik: ~54.000 oglasov v fazi 1 (~2 h), nato
podrobnosti za vse (~18 h, teče lahko čez več zagonov). **Vsak naslednji** pregled
je hiter — podrobnosti se odpirajo samo za **nove** oglase, teh je na dan nekaj
sto, torej minute.
