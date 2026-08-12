# KodaTim e-pošta: Listmonk + SMTP

Ta dokument je **runbook za dele, ki jih koda ne more narediti sama** — gostovanje
Listmonka, DNS in Vercel skrivnosti. Koda v aplikaciji je že narejena in
deployana; ko izpolniš spodnje korake in vpišeš `LISTMONK_*` skrivnosti, se
pošiljanje samodejno preklopi z Resenda na Listmonk. Brez teh korakov vse še
naprej dela prek Resenda — nič ni pokvarjeno.

```
KodaTim (Vercel) → Listmonk /api/tx → Listmonk → SMTP relay → prejemnik
```

Koda pošilja **samo do Listmonka**. Kateri SMTP dejansko dostavi pošto, je
nastavitev **znotraj Listmonka** — zato menjava relaya (tudi opustitev Resenda)
ne zahteva nobene spremembe kode.

---

## 0. Kaj je že narejeno (v kodi, ni ti treba)

- `src/lib/email.ts` — dispečer: Listmonk če je nastavljen, sicer Resend.
- `src/lib/listmonk.ts` — klic na `/api/tx`, retry samo na 502/503/504 in
  omrežne napake, **brez** ponovnega pošiljanja ob timeoutu (nič dvojnikov).
- `src/lib/resend.ts` — Resend samo še kot fallback.
- `POST /api/admin/email/test` — pošlje testni mail skozi aktivni prenos
  (samo admin).
- `.env.example` — vse potrebne spremenljivke.

---

## 1. Kje bo Listmonk tekel (izberi eno)

Listmonk **mora biti javno dosegljiv prek HTTPS**, ker ga kliče Vercel.
`localhost` ne pride v poštev za produkcijo.

Najlažje: majhen VPS (Hetzner ~4 €/mes, DigitalOcean, itd.) + domena
`listmonk.kodatim.si`.

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: listmonk
      POSTGRES_PASSWORD: <MOCNO_GESLO>
      POSTGRES_DB: listmonk
    volumes: [listmonk-db:/var/lib/postgresql/data]
    restart: unless-stopped

  app:
    image: listmonk/listmonk:latest
    depends_on: [db]
    ports: ["9000:9000"]
    environment:
      LISTMONK_app__address: 0.0.0.0:9000
      LISTMONK_db__host: db
      LISTMONK_db__user: listmonk
      LISTMONK_db__password: <MOCNO_GESLO>
      LISTMONK_db__database: listmonk
    restart: unless-stopped

volumes:
  listmonk-db:
```

```bash
docker compose up -d
docker compose run --rm app ./listmonk --install   # enkratna inicializacija baze
```

Pred njega daj **HTTPS reverse proxy** (Caddy je najhitrejši):

```
listmonk.kodatim.si {
    reverse_proxy localhost:9000
}
```

Caddy si sam pridobi TLS certifikat. Odpri `https://listmonk.kodatim.si`,
prijava z admin računom, ki ga nastaviš ob prvem obisku.

---

## 2. SMTP relay v Listmonku (Settings → SMTP)

Listmonk sam ne pošilja — potrebuje SMTP. Tri poštene možnosti:

| Relay | Cena | Opomba |
|---|---|---|
| **Resend SMTP** | plačilo po št. mailov (brezpl. ~100/dan) | že imaš potrjeno domeno; najlažji začetek |
| **Brevo / MailerLite free** | 300/dan brezpl. | zamenjaš, če hočeš stran od Resenda |
| **Lasten strežnik** (Postal/Mailu) | infrastruktura | brezplačno, a ti nosiš IP-reputacijo in warmup — najtežje za inbox |

Za **Resend SMTP** vpiši:

```
Host:        smtp.resend.com
Port:        465
Auth:        LOGIN
Username:    resend
Password:    <RESEND_API_KEY>        ← API ključ je geslo
TLS:         SSL/TLS
From email:  KodaTim <obvestila@kodatim.si>
```

> **Da se znebiš Resenda kasneje:** samo zamenjaj teh nekaj polj v Listmonku za
> drug relay. Koda ostane ista. `RESEND_*` v Vercelu lahko odstraniš šele, ko
> Listmonk dokazano pošilja (glej korak 8), sicer padeš na prazen fallback.

Klikni **"Send test"** v Listmonku. Če testni mail ne pride, **ne nadaljuj** —
najprej popravi SMTP.

---

## 3. Verificiran pošiljatelj

- Preveri v Resendu (Domains), katera domena je **verified**.
- Trenutno KodaTim pošilja iz `security@kompletko.com` → torej je verjetno
  potrjena `kompletko.com`.
- Če hočeš pošiljati iz `@kodatim.si`, moraš to domeno **najprej potrditi v
  Resendu** (doda ti DNS zapise). Ne izmišljaj pošiljatelja — nepotrjena domena
  = zavrnjeno.

---

## 4. DNS avtentikacija (KLJUČNO za inbox, ne spam)

Na domeni, iz katere pošiljaš, morajo biti vsi trije. Brez njih bulk pošto
Gmail/Outlook zavrneta.

- **SPF** — Resend ti da točen TXT zapis.
- **DKIM** — Resend ti da CNAME/TXT zapise; dodaj vse.
- **DMARC** — TXT na `_dmarc.<domena>`:
  ```
  v=DMARC1; p=none; rua=mailto:dmarc@kodatim.si; adkim=s; aspf=s
  ```
  Začni s `p=none`, po nekaj tednih čistih poročil dvigni na `quarantine`.

Preveri na [mail-tester.com](https://www.mail-tester.com) — cilj 10/10.

---

## 5. API uporabnik v Listmonku (ne admin!)

Listmonk → Users → nov API user, npr. `kodatim-api`, s pravico
**`tx:send`** (in nič več). Skopiraj token.

---

## 6. Passthrough predloga (Settings → Campaigns → Templates → nova, tip *Transactional*)

KodaTim pošlje gotov HTML kot `data.content`. Ta predloga ga izriše:

- **Ime:** `KodaTim passthrough`
- **Subject:** `{{ .Tx.Subject }}`
- **Body:**
  ```
  {{ .Tx.Data.content }}
  ```

> Če se HTML prikaže kot besedilo (znaki `&lt;`), Listmonk vsebino uhaja.
> Takrat uporabi `{{ .Tx.Data.content | safeHTML }}` ali (odvisno od verzije)
> `{{ raw .Tx.Data.content }}`. Preveri s test pošiljanjem (korak 8) — tega z
> našega konca ni mogoče preveriti.

Zapomni si **ID predloge** (v URL-ju predloge) — to je `LISTMONK_TX_TEMPLATE_ID`.

---

## 7. Vercel skrivnosti (Settings → Environment Variables → Production)

```
LISTMONK_URL=https://listmonk.kodatim.si
LISTMONK_API_USER=kodatim-api
LISTMONK_API_TOKEN=<token iz koraka 5>
LISTMONK_TX_TEMPLATE_ID=<ID iz koraka 6>
```

Redeploy. Od tega trenutka gre pošta prek Listmonka; brez teh gre prek Resenda.
Nič ne daj v frontend/browser — vse je server-side.

---

## 8. Dokaz od konca do konca

1. Prijavljen kot admin na KodaTim, pokliči:
   ```bash
   curl -X POST https://www.kodatim.si/api/admin/email/test \
     -H "Content-Type: application/json" \
     --cookie "<tvoj admin cookie>" \
     -d '{"to":"tvoj-test@gmail.com"}'
   ```
   Odgovor mora biti `{"ok":true,"transport":"listmonk"}`.
2. Preveri **Listmonk logs** → sprejeto.
3. Preveri **Resend logs** (ali relay) → poslano.
4. Preveri **predal** → prišlo, HTML pravilno izrisan, pravi pošiljatelj.
5. Preveri glave: SPF `pass`, DKIM `pass`, DMARC `pass`.

Ko `transport: listmonk` dela od konca do konca, je migracija zaključena.

---

## 9. Realnost glede "Primary" in količine

- **Transakcijski** maili KodaTima (obvestila, prijave) z urejenim SPF/DKIM/DMARC
  in dobrim relayem **pristanejo v predalu**. Marketinški pogosto v zavihku
  *Promocije* — to je normalno in ni napaka.
- **Zbrani (skrejpani) naslovi**: pošiljanje trženjske pošte nanje brez soglasja
  je po GDPR/ePrivacy prepovedano in v praksi ubije domeno (pritožbe > 0,3 % →
  črne liste → nič več ne pride niti legitimna pošta). Nobena nastavitev tega ne
  obide. Edina delujoča pot je **opt-in lista** (prijavni obrazec + double
  opt-in — Listmonk oboje podpira) in **ogrevanje domene** (začni z nekaj deset
  maili/dan, dvigaj postopno tedne).
- Pri ~5.000 mailih/dan te Gmail/Yahoo/Microsoft obravnavajo kot **bulk sender**:
  obvezni SPF/DKIM/DMARC, one-click unsubscribe (List-Unsubscribe), stopnja
  pritožb pod 0,1 %. Listmonk unsubscribe in bounce obdeluje sam.

---

## Kaj NI migrirano (namenoma)

- **SBN Auto worker** (`worker-avtonet/src/alerts.ts`, `report.ts`) pošilja
  obvestila o novih avtih še vedno direktno prek Resenda. Teče lokalno na tvojem
  PC-ju (ne na Vercelu) in dela; ko bo Listmonk stabilen, ga po istem vzorcu
  preklopimo (worker bi klical isti `/api/tx`).
- **Supabase Auth** maili (potrditev, reset gesla) gredo prek Supabase SMTP —
  ločena pot, ni del tega.
