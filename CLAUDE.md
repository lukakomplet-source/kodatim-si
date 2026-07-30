@AGENTS.md

# Navodila za delo na KodaTim.si (za Claude)

Ta datoteka se samodejno naloži ob vsakem odprtju nove seje v tem projektu. Namen: da lahko delo nadaljuješ pravilno tudi v popolnoma novem chat oknu, brez da uporabnik znova razlaga pravila.

## 1. Delovni proces — VEDNO plan pred spremembo

Pred **vsako** spremembo kode — ne glede na to, ali gre za majhen popravek (npr. sprememba ene vrstice besedila) ali velik nov modul — najprej v klepetu na kratko (par vrstic) napiši plan: kaj boš spremenil in kje. Počakaj na eksplicitno potrditev uporabnika (npr. "ok", "pojdi", "ja"), šele nato začni spreminjati datoteke.

- To velja za VSAKO zahtevo, ne samo za "velike" funkcionalnosti.
- Za res majhne, nedvoumne popravke (typo, ena barva, en tekst) je lahko plan ena sama poved.
- Za večje funkcionalnosti uporabi EnterPlanMode orodje, če je na voljo, sicer napiši plan neposredno v odgovor.
- Uporabnikov citat, ki je to pravilo sprožil: *"vsakič ko napišem napiši plan v parih vrsticah pa da potrdim tak kot replit."*

## 2. Med delom — sproti sporočaj napredek

Ne delaj tiho v ozadju. Med izvajanjem daj kratke vmesne posodobitve (ena poved) ob pomembnih trenutkih: ko nekaj najdeš, ko spremeniš pristop, ko naletiš na oviro.

## 3. Ob koncu naloge — VIDEN znak "končano"

Ko je naloga (vse iz potrjenega plana) dokončana, to jasno označi z velikim, vizualno nespregledljivim naslovom — ne samo z majhnim "✅ Končano" v besedilu:

```
---
## ✅ KONČANO
---
```

Sledi kratek povzetek, kaj je bilo narejeno. Tega znaka NE daj, dokler vsi deli potrjenega plana niso zaključeni (če plan pokriva več stvari, npr. dve strani, počakaj z znakom do konca obeh).

## 4. Jezik uporabniškega vmesnika

Vse besedilo v adminu/CRM-ju (gumbi, oznake, sporočila, placeholderji) mora biti v **slovenščini**. To velja za ves obstoječi in nov UI. Komentarji v kodi in commit sporočila so lahko v angleščini.

## 5. Kontekst projekta

**KodaTim.si** je Next.js 16 (App Router) + React 19 + Tailwind v4 + Supabase spletna stran slovenske razvojne agencije.

Glavni deli:
- **Javna stran** — kratka 6-sekcijska domača stran (Hero, AI Business Consultant, References Preview, Why Choose Us/garancija, Partner Program Preview, Final CTA). Druge strani (`/resitve`, `/reference`, `/partnerji`, `/cenik`, `/o-nas`) so ločene namenske strani.
- **Lead Intelligence** (`/admin/lead-intelligence`) — CRM baza leadov: ročni vnos, AI uvoz iz slik (multi-podjetje detekcija), AI web-search auto-complete (Firecrawl, nikoli ne izmišljuje podatkov), SKD šifra+naziv, inline urejanje, brisanje, filtri (vključno z novim date-range + status tabs, glej spodaj).
- **Promocije** (`/admin/promocije`) — Sales & Marketing OS: kampanje, AI Sales Consultant, AI Company Analysis, AI Proposal Generator, kanban pipeline, naloge (tasks), email sekvence (Resend), poročila.

Stanje, ki še čaka:
- `supabase/migration_promocije.sql` je treba pognati ročno v Supabase SQL Editorju (po `migration_lead_intelligence.sql`, ki naj bi že bila pognana).
- Resend ni konfiguriran (`RESEND_API_KEY` / `RESEND_FROM_EMAIL` manjkata) — pošiljanje emailov je namerno neaktivno, dokler uporabnik ne doda ključev; `sendEmail()` vrže jasno napako namesto da simulira uspeh.

## 6. Infrastruktura

- GitHub repo: `lukakomplet-source/kodatim-si`.
- Supabase projekt se imenuje **"kodatim-si"** — NE "supabase-red-grass" (to je nepovezan/pavziran projekt).
- Za lokalni razvoj vedno uporabi `npm run dev`, NIKOLI `npm start` / `next start`. Produkcijski `next start` proces, ki ostane teči v ozadju, se "prilepi" na port 3000 in ne podpira HMR — to je enkrat povzročilo dolgotrajno zmedo ("spremembe se ne prikažejo"). Če se `preview_start` pritoži, da je port 3000 zaseden, najprej preveri proces (`Get-CimInstance Win32_Process -Filter "ProcessId = <pid>"`) — če gre za `next dev`, ga pusti pri miru in samo navigiraj nanj; če je stara `next start` seja, jo ustavi (`Stop-Process -Force`) in znova zaženi dev server.
- GitHub PAT je bil nekoč najden zapisan v čistem besedilu v `git remote -v` — če se to spet pojavi, takoj opozori uporabnika, naj ga rotira.

## 7. Preverjanje sprememb

Po vsaki spremembi kode:
1. `npm run lint` in `npx tsc --noEmit` (PowerShell, z osvežitvijo PATH: `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")`, ker Bash orodje nima node/npm v PATH).
2. Za UI spremembe preveri v brskalniku (`mcp__Claude_Browser__*`): ker večina admin poti zahteva prijavo, do katere Claude nima dostopa, je "preverjeno" običajno = čist compile + pravilna preusmeritev na `/prijava` + brez napak v konzoli. Dejansko avtenticirano testiranje (klikanje po adminu) opravi uporabnik sam.
3. Nikoli ne trdi, da je funkcionalnost "delujoča", če ni bila dejansko preverjena — jasno povej, kaj je preverjeno in kaj čaka na uporabnikovo ročno testiranje.

## 8. Tehnični vzorci v tej kodni bazi

- `createAdminClient()` (service-role, obide RLS) se uporablja po `requireAdmin()` preverjanju v server actions/routes; RLS politike so dodatna varnostna plast.
- Migracije so navadne `.sql` datoteke, ki jih uporabnik ročno požene v Supabase SQL Editorju — Claude jih ne poganja sam.
- Server Actions: `"use server"` datoteke `actions.ts`, bodisi `useActionState`-kompatibilne `(prevState, formData) => ActionResult`, bodisi navadne `async (id, data) => ActionResult`, klicane neposredno iz client kode.
- `chatJSON` / `chatJSONWithImages` / `chatJSONWithImage` (`src/lib/openai.ts`) — vision klici naj uporabljajo `detail: "high"` za natančno branje gostih tabel/screenshotov.
- Firecrawl (`src/lib/firecrawl.ts`): `scrapeUrl` in `searchWeb` — resnično spletno iskanje/scrape, nikoli izmišljeni podatki. AI funkcije v tem projektu nikoli ne izmišljujejo podatkov (telefon, email, SEO ocene ipd.) — če podatka ni mogoče najti, pusti polje prazno namesto da ga izmisli.
- `custom_fields jsonb` na `intel_leads` je prilagodljiva razširitvena točka (revenue, SKD ipd.), da se izognemo novim DB migracijam za manjše dodatke.
- Filtriranje: strani, kjer se podatki nalagajo server-side s paginacijo (Leadi), filtrirajo prek URL search params + GET `<form>`. Strani, kjer so podatki že naloženi kot prop brez paginacije (npr. Promocije → Naloge), filtrirajo client-side v `useMemo`, brez URL round-trip.
- Skupna pomožna datoteka za hitre datumske filtre: `src/lib/dateRangePresets.ts` (`getPresetRange`, `DATE_RANGE_PRESET_LABELS` — Danes/Ta teden/Ta mesec). Uporabljena tako na Leadih (`DateRangeFilter.tsx`, server-side) kot na Nalogah (`TasksTab.tsx`, client-side).
- Status seznami (npr. `LEAD_STATUSES`, statusi nalog) se prikazujejo kot zavihki s štetjem (badge s številom), ne kot dropdown — to je uveljavljen UI vzorec za filtriranje po statusu v tem projektu.
