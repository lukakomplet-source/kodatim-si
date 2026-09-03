import "dotenv/config";
import { mkdirSync, existsSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { connect, type Db } from "./db.js";
import { uporabniskiAgent } from "./identiteta.js";
import { jeIzziv } from "./izziv.js";
import { hlajenjeDo, zabelezBlokado } from "./samopopravilo.js";
import { dodajPoraboArhiva, klasificiraj, OPIS_NAPAKE, pocakajNaVrsto, proracunVira, zabelezDogodek } from "./stanje-vira.js";
import { najdiVir } from "./viri/index.js";

/**
 * PDF arhivar za nepremičnine — LOČEN proces od zbiralnika, isti sistem kot
 * pri SBN Auto.
 *
 * Oglas, ki izgine z vira, je izgubljen: strani ni več, slik ni več. Podatke
 * (cena, m², kraj, oprema) baza hrani za vedno; ta proces zraven shrani še
 * VIZUALNO kopijo — en PDF s stranjo oglasa in fotografijami — na OneDrive
 * (rclone priklop, privzeto G:). Ob spremembi cene nastane nova, manjša
 * verzija brez slik, tako da se pri izginulem oglasu vidi cela zgodba: kako
 * je bil objavljen, kdaj se je cena premaknila in s kakšno je šel dol. Prav
 * to je podlaga za statistiko prodanih.
 *
 * ZAKAJ LOČEN PROCES: zbiralnik je bil s trudom pripeljan do stanja, ko ga
 * bolha ne zavrača. Arhivar ga ne sme ogroziti, zato:
 *  - bere ISTO hlajenje kot zbiralnik in počiva, dokler je vir v njem,
 *  - ima SVOJ dnevni proračun zahtevkov, ločen od zbiralnikovega,
 *  - ob lastni zavrnitvi zapiše hlajenje in se ustavi — brez ponovnega poskusa,
 *  - hodi počasneje od zbiralnika,
 *  - ob katerikoli svoji napaki ne podre ničesar drugega.
 *
 * KOLIKO STANE. Vsak oglas je en obisk strani plus do NAJVEC_SLIK prenosov
 * fotografij — torej do devet zahtevkov na oglas. Pri 4.628 čakajočih oglasih
 * je to okoli 40.000 zahtevkov. Pri dnevnem proračunu 400 in ritmu, ki ga vir
 * prenese, je to okoli štirideset oglasov na dan in sto dni za zaostanek.
 *
 * Ta številka je neprijetna in prav zato je zapisana tu in v konzoli. Hitreje
 * ne gre: prvi poskus z ritmom 900 ms med slikami je pri DRUGEM oglasu dobil
 * CAPTCHO in stal dvanajst ur hlajenja. Če je sto dni predolgo, je odgovor
 * dogovor z virom (docs/pismo-bolha.md), ne hitrejše branje.
 */

// Priklop OneDrive je 26. 8. presel s crke G: na mapo: ko rclone umre, Windows
// crke ne sprosti in vsak nadaljnji dostop visi. Ta arhivar je se kazal na
// staro crko, zato se je 202-krat zagnal in takoj koncal.
const MAPA = process.env.NEP_PDF_MAPA ?? "C:\\avtonet-arhiv\\nepremicnine";
const LOG = process.env.NEP_PDF_LOG ?? "C:\\Users\\lukak\\avtonet-db\\nep-pdf-arhiv.log";
const UTRIP = process.env.NEP_PDF_UTRIP ?? "C:\\Users\\lukak\\avtonet-db\\nep-pdf-arhiv.utrip";
const ZAKLEP = process.env.NEP_PDF_ZAKLEP ?? "C:\\Users\\lukak\\avtonet-db\\nep-pdf-arhiv.lock";

/** Dnevni proračun ZAHTEVKOV (stran + vsaka slika), ne oglasov. */
/**
 * PRORAČUNA SI ARHIVAR NE DOLOČA SAM.
 *
 * Prej je imel svojega (400 zahtevkov na dan) in zbiralnik svojega (40 strani).
 * Vsak je bil zase v mejah, vir pa je dobil vsoto — in 24. 8. 2026 vrnil
 * CAPTCHO. Zdaj je proračun na VIR (adapter, dnevniProracunVira), zbiralnik
 * ima znotraj njega rezervacijo, arhivar dobi to, kar ostane nad njo.
 *
 * Spremenljivka okolja ostaja kot ZGORNJA meja za preizkuse, ne kot dovoljenje:
 * nikoli ne poviša tega, kar dovoli vir.
 */
const STROP_IZ_OKOLJA = Number(process.env.NEP_PDF_DNEVNI_PRORACUN ?? Number.POSITIVE_INFINITY);
/** Največ fotografij na oglas — meja stroška, ne meja kakovosti. */
const NAJVEC_SLIK = Number(process.env.NEP_PDF_NAJVEC_SLIK ?? 8);
const ZAMIK_OGLAS_MS = Number(process.env.NEP_PDF_ZAMIK_MS ?? 30_000);
/**
 * RITEM MED SLIKAMI — izmerjen, ne ocenjen.
 *
 * Prva različica je jemala slike na 900 ms. Prvi oglas je šel skozi (12 slik),
 * pri drugem je bolha vrnila CAPTCHO — trinajst zahtevkov v petindvajsetih
 * sekundah je bilo prehitro. Cena tega poskusa je bilo dvanajst ur hlajenja
 * vira in podvojen faktor razmikov tudi za zbiralnik.
 *
 * Zbiralnik je pri 15 s med stranmi dokazano varen, zato se arhivar drži
 * istega reda velikosti. Slika je lažja od strani, a pride z istega
 * gostitelja in šteje v isto oceno obiskovalca.
 */
const ZAMIK_SLIKA_MS = Number(process.env.NEP_PDF_ZAMIK_SLIKA_MS ?? 12_000);

const spanec = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(msg: string): void {
  const vrstica = `${new Date().toISOString()} ${msg}`;
  console.log(vrstica);
  try {
    appendFileSync(LOG, vrstica + "\n");
  } catch {
    // Dnevnik ni razlog, da pade arhiv.
  }
}

function utrip(stanje: string): void {
  try {
    writeFileSync(UTRIP, `${new Date().toISOString()} ${stanje}`);
  } catch {
    // isto
  }
}

function zivProces(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Zaklep enega samega arhivarja. Dva hkrati ne pomenita le podvojenega dela,
 * ampak podvojene klice na vir — natanko tisto, česar temu procesu ne
 * dovolimo. Zaklep drži PID; če proces v njem ne živi več, ga nov prevzame,
 * da padec ne pusti arhivarja trajno zaklenjenega.
 */
function prevzemiZaklep(): boolean {
  try {
    writeFileSync(ZAKLEP, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    try {
      /**
       * PRAZEN ZAKLEP NI ŽIV ZAKLEP.
       *
       * Datoteka zaklepa je 24. 8. 2026 ostala za sabo prazna (0 bajtov).
       * `Number("")` je 0, `zivProces(0)` pa na Windowsu ne javi napake — zato
       * je arhivar ob vsakem zagonu javil "že teče" in se ustavil, čeprav ni
       * tekel nihče. Zaklep, ki se ne zna prepoznati za truplo, ustavi sistem
       * bolj zanesljivo kot okvara, ki naj bi jo preprečeval.
       */
      const pid = Number(readFileSync(ZAKLEP, "utf8").trim());
      if (Number.isFinite(pid) && pid > 0 && pid !== process.pid && zivProces(pid)) return false;
      writeFileSync(ZAKLEP, String(process.pid));
      return true;
    } catch {
      return false;
    }
  }
}

type Kandidat = {
  vir: string;
  vir_id: string;
  url: string;
  cena_eur: number | string | null;
  razlog: "nov" | "cena";
};

class LastnaBlokada extends Error {
  constructor(public status: number | string) {
    super(`zavrnitev: ${status}`);
  }
}

/**
 * Katere fotografije smemo vzeti.
 *
 * Vir sam pove, katerih slikovnih poti ne smemo jemati — bolhin robots.txt
 * prepoveduje /image-80x60, /image-w185, /image-165x100, /image-140x140,
 * /image-VL in /image-w620. Teh se ne dotaknemo. Naslov, ki ga stran uporablja
 * za veliko sliko (/image-w920x690), na tem seznamu ni. Seznam je zapisan tu,
 * v kodi, in ne le v komentarju — da ga ob naslednji spremembi ni mogoče
 * spregledati.
 */
const PREPOVEDANE_SLIKOVNE_POTI = [
  "/image-80x60",
  "/image-w185",
  "/image-165x100",
  "/image-140x140",
  "/image-VL",
  "/image-w620",
  "/image-200x150",
];

export function uporabneSlike(urlji: string[], vir: string): string[] {
  const out: string[] = [];
  for (const u of urlji) {
    if (!u || !/^https?:\/\//.test(u)) continue;
    let pot: string;
    try {
      pot = new URL(u).pathname;
    } catch {
      continue;
    }
    if (PREPOVEDANE_SLIKOVNE_POTI.some((p) => pot.startsWith(p))) continue;
    if (vir === "bolha.com" && !/^\/image-/.test(pot)) continue;
    if (vir === "nepremicnine.net" && !/img\.nepremicnine\.net/.test(u)) continue;
    out.push(u);
  }
  return [...new Set(out)];
}

/**
 * En oglas → en PDF: stran (brez naloženih slik, da je majhna) + vsaka
 * fotografija kot svoja stran. Pri verziji "cena" so slike izpuščene — že so
 * v prvi verziji, nova cena pa je vidna na strani.
 *
 * Vrne tudi, koliko zahtevkov je oglas stal, ker je proračun v zahtevkih.
 */
async function zajemi(
  browser: Browser,
  k: Kandidat,
  /** Za skupni ritem in knjigo porabe; brez njega arhivar teče brez varovalk. */
  db?: Db
): Promise<{ pdf: Buffer; stSlik: number; zahtevkov: number } | "nedosegljiv"> {
  const ctx = await browser.newContext({ locale: "sl-SI", userAgent: uporabniskiAgent() });
  let zahtevkov = 0;
  try {
    const page = await ctx.newPage();
    // Slik, pisav in oglasnih skript pri izrisu strani NE nalagamo: fotografije
    // poberemo posebej in nadzorovano, oglasni okvirji pa v arhiv ne sodijo.
    await page.route(
      (u) =>
        /\.(?:jpe?g|png|gif|webp|woff2?)(?:\?|$)/i.test(u.pathname) ||
        /cookiebot|googlesyndication|doubleclick|googletagmanager|google-analytics|adservice|adsbygoogle/i.test(
          u.hostname + u.pathname
        ),
      (r) => r.abort()
    );

    // SKUPEN RITEM: razmik se meri od zadnjega zahtevka kateregakoli našega
    // procesa. Če je zbiralnik pravkar bral seznam, arhivar počaka — vir vidi
    // en sam curek zahtevkov, ne dveh vljudnih procesov.
    if (db) await pocakajNaVrsto(db, k.vir, ZAMIK_OGLAS_MS);
    const odgovor = await page.goto(k.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    zahtevkov += 1;
    const status = odgovor?.status() ?? 0;
    if (status === 403 || status === 429) throw new LastnaBlokada(status);
    if (status >= 400) return "nedosegljiv";

    await page.waitForTimeout(1500);
    const naslov = await page.title().catch(() => "");
    const telo = (await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 500) : ""))) as string;
    // Zaslon preverjanja pride s statusom 200 — brez te preverbe bi ga
    // shranili kot "oglas" in mislili, da arhiv dela.
    if (jeIzziv(naslov, telo)) throw new LastnaBlokada("preverjanje CAPTCHA");
    if (/oglas ne obstaja|oglas je bil izbrisan|ni ve[cč] (?:objavljen|na voljo)/i.test(telo)) return "nedosegljiv";

    const surovi = (await page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .map((i) => i.getAttribute("data-src") ?? i.getAttribute("src") ?? "")
        .filter(Boolean)
    )) as string[];

    // Kar se je kljub blokadi izrisalo: privolitveni dialogi in celozaslonska
    // fiksna prekritja ne sodijo v arhiv.
    await page.evaluate(() => {
      const moteci = [
        "[id^=CybotCookiebot]",
        ".fc-consent-root",
        "#onetrust-consent-sdk",
        "ins.adsbygoogle",
        "iframe[src*=doubleclick]",
        "iframe[src*=googlesyndication]",
      ].join(", ");
      document.querySelectorAll(moteci).forEach((e) => e.remove());
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const s = getComputedStyle(el);
        if (s.position === "fixed" && (el as HTMLElement).offsetHeight > window.innerHeight * 0.5) el.remove();
      }
      document.documentElement.style.overflow = "auto";
      document.body.style.overflow = "auto";
    });

    const stranPdf = await page.pdf({ format: "A4", printBackground: true });
    const dokument = await PDFDocument.load(stranPdf);
    let stSlik = 0;

    if (k.razlog !== "cena") {
      for (const slikaUrl of uporabneSlike(surovi, k.vir).slice(0, NAJVEC_SLIK)) {
        try {
          if (db) await pocakajNaVrsto(db, k.vir, ZAMIK_SLIKA_MS);
          const odziv = await ctx.request.get(slikaUrl, { timeout: 20_000 });
          zahtevkov += 1;
          if (odziv.status() === 403 || odziv.status() === 429) throw new LastnaBlokada(odziv.status());
          if (!odziv.ok()) continue;
          const surova = await odziv.body();
          if (surova.length < 3_000) continue; // ikone, nadomestne slike
          const jpeg = await sharp(surova)
            .rotate()
            .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 72 })
            .toBuffer();
          const vlozena = await dokument.embedJpg(jpeg);
          const stran = dokument.addPage([vlozena.width, vlozena.height]);
          stran.drawImage(vlozena, { x: 0, y: 0, width: vlozena.width, height: vlozena.height });
          stSlik += 1;
          // Razmik do naslednje slike prevzame skupni ritem ob naslednjem
          // zahtevku; dvojno čakanje bi samo skrajšalo dan brez koristi.
        } catch (e) {
          if (e instanceof LastnaBlokada) throw e;
          // Ena slika ni razlog, da pade cel oglas.
        }
      }
    }

    return { pdf: Buffer.from(await dokument.save()), stSlik, zahtevkov };
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function shrani(db: Db, k: Kandidat, pdf: Buffer, stSlik: number): Promise<void> {
  const dan = new Date().toISOString().slice(0, 10);
  const cena = k.cena_eur !== null ? Math.round(Number(k.cena_eur)) : "brez-cene";
  const mapaOglasa = join(MAPA, k.vir, k.vir_id);
  mkdirSync(mapaOglasa, { recursive: true });
  const ime = `${dan}_${k.razlog}_${cena}.pdf`;
  writeFileSync(join(mapaOglasa, ime), pdf);
  await db.from("nep_pdfji").insert({
    vir: k.vir,
    vir_id: k.vir_id,
    url: k.url,
    razlog: k.razlog,
    cena_eur: k.cena_eur,
    datoteka: `${k.vir}/${k.vir_id}/${ime}`,
    velikost: pdf.length,
    stevilo_slik: stSlik,
  });
}

/** Kolikšen del dnevnega proračuna je danes že porabljen. */
async function porabaDanes(db: Db): Promise<number> {
  const { data } = await db.from("nep_statistika").select("podatki").eq("kljuc", "pdf_arhiv_poraba").maybeSingle();
  const p = (data?.podatki ?? {}) as { dan?: string; zahtevkov?: number };
  return p.dan === new Date().toISOString().slice(0, 10) ? Number(p.zahtevkov ?? 0) : 0;
}

async function zapisiPorabo(db: Db, zahtevkov: number): Promise<void> {
  await db.from("nep_statistika").upsert({
    kljuc: "pdf_arhiv_poraba",
    podatki: { dan: new Date().toISOString().slice(0, 10), zahtevkov },
    izracunano: new Date().toISOString(),
  });
}

async function objaviStanje(db: Db, stanje: string, dodatno: Record<string, unknown> = {}): Promise<void> {
  await db.from("nep_statistika").upsert({
    kljuc: "pdf_arhiv",
    podatki: { stanje, ob: new Date().toISOString(), mapa: MAPA, ...dodatno },
    izracunano: new Date().toISOString(),
  });
}

async function main(): Promise<void> {
  const testnih = Number(process.argv.find((a) => a.startsWith("--test="))?.slice(7) ?? 0);
  if (!prevzemiZaklep()) {
    console.error("Arhivar že teče (zaklep).");
    process.exit(3);
  }
  process.on("exit", () => {
    try {
      writeFileSync(ZAKLEP, "");
    } catch {
      /* nič */
    }
  });

  const db = connect();
  if (!existsSync(MAPA)) mkdirSync(MAPA, { recursive: true });
  log(
    `PDF arhivar zagnan. Mapa: ${MAPA}, proračun določi vir (skupen z zbiralnikom)` +
      (testnih ? `, TEST ${testnih} oglasov` : "")
  );

  let porabljeno = await porabaDanes(db);
  let obdelanih = 0;
  /** Koliko zahtevkov sme arhivar danes še porabiti pri tem viru. */
  let naVoljo = Number.POSITIVE_INFINITY;
  const browser = await chromium.launch({ args: ["--no-sandbox"] });

  try {
    for (;;) {
      utrip("iscem");
      if (testnih && obdelanih >= testnih) break;

      const { data } = await db
        .from("nep_pdf_kandidati")
        .select("vir, vir_id, url, cena_eur, razlog")
        .order("razlog", { ascending: true }) // "cena" pred "nov"
        .order("first_seen", { ascending: false })
        .limit(1);
      const k = (data ?? [])[0] as Kandidat | undefined;
      if (!k) {
        log("ni kandidatov — arhiv je dohiten");
        await objaviStanje(db, "dohiteno", { porabljeno });
        break;
      }

      /**
       * PRORAČUN JE VIROV, NE NAŠ. Preberemo ga za vir tega kandidata in za
       * arhivarja vzamemo samo tisto, kar ostane nad zbiralnikovo rezervacijo.
       * Če zbiralnik danes še ni tekel, arhivar vseeno ne sme poseči v njegov
       * del — novi oglasi so hitro pokvarljivi, arhiv pa lahko počaka dan.
       */
      const adapter = najdiVir(k.vir);

      /**
       * ARHIV SAMO TAM, KJER JE IZRECNO DOVOLJEN.
       *
       * Pogled kandidatov gleda `omogocen` — torej ali vir zbiramo. To ni isto
       * kot "smemo delati kopijo strani in fotografij". Ko je bil 3. 9. 2026
       * vklopljen nepremicnine.net, ki ima v robots.txt
       * `Content-Signal: use=reference` (izrecen pridržek pravic po 4. členu
       * direktive EU 2019/790), ga je arhivar začel kopirati skupaj s
       * fotografijami. Zastavico postavi človek po pregledu pogojev, koda pa
       * privzeto ne kopira ničesar.
       */
      if (!adapter?.dovoljenArhivSlik) {
        log(`${k.vir}: arhiv slik pri tem viru ni dovoljen — preskakujem (glej dovoljenArhivSlik)`);
        await db.from("nep_pdfji").insert({
          vir: k.vir,
          vir_id: k.vir_id,
          url: k.url,
          razlog: "nedovoljen",
          cena_eur: k.cena_eur,
        });
        continue;
      }

      if (adapter?.dnevniProracunVira !== undefined && adapter.dnevnaMejaStrani !== undefined) {
        const pr = await proracunVira(db, k.vir, {
          osnova: adapter.dnevniProracunVira,
          rezervacijaZbiralnika: adapter.dnevnaMejaStrani,
        });
        naVoljo = Math.min(pr.zaArhiv, STROP_IZ_OKOLJA);
        if (naVoljo < 3) {
          // Manj kot trije zahtevki ne zadoščajo niti za en oglas s tremi
          // slikami; začeti in obviseti na pol bi pomenilo porabiti zahtevke
          // za PDF, ki nikoli ne nastane.
          log(`dnevni proračun vira ${k.vir} je porabljen (${pr.porabljeno}/${pr.skupaj}) — arhivar počiva do jutri`);
          await objaviStanje(db, "proracun porabljen", { porabljeno, proracunVira: pr.skupaj, pojasnilo: pr.pojasnilo });
          break;
        }
      }

      // Isto hlajenje kot zbiralnik: če vir počiva, počiva tudi arhivar.
      const hlajenje = await hlajenjeDo(db, k.vir);
      if (hlajenje) {
        log(`vir ${k.vir} počiva do ${hlajenje} — arhivar se ustavi`);
        await objaviStanje(db, "vir v hlajenju", { porabljeno, do: hlajenje });
        break;
      }

      utrip(`zajemam ${k.vir}/${k.vir_id}`);
      try {
        const izid = await zajemi(browser, k, db);
        if (izid === "nedosegljiv") {
          porabljeno += 1;
          await dodajPoraboArhiva(db, k.vir, 1);
          await db.from("nep_pdfji").insert({
            vir: k.vir,
            vir_id: k.vir_id,
            url: k.url,
            razlog: "nedosegljiv",
            cena_eur: k.cena_eur,
          });
          log(`${k.vir}/${k.vir_id}: nedosegljiv`);
        } else {
          porabljeno += izid.zahtevkov;
          await dodajPoraboArhiva(db, k.vir, izid.zahtevkov);
          await shrani(db, k, izid.pdf, izid.stSlik);
          obdelanih += 1;
          log(
            `${k.vir}/${k.vir_id} [${k.razlog}]: ${Math.round(izid.pdf.length / 1024)} kB, ` +
              `${izid.stSlik} slik, ${izid.zahtevkov} zahtevkov ` +
              `(arhivu ostane ${Number.isFinite(naVoljo) ? Math.max(0, naVoljo - izid.zahtevkov) : "∞"} pri tem viru)`
          );
        }
        await zapisiPorabo(db, porabljeno);
        await objaviStanje(db, "tece", { porabljeno, zadnji: `${k.vir}/${k.vir_id}` });
      } catch (e) {
        if (e instanceof LastnaBlokada) {
          // Zavrnitev je odgovor vira, ne naša napaka. Zapišemo hlajenje —
          // isto, ki ga bere zbiralnik — in se ustavimo brez ponovnega poskusa.
          const virAdapter = najdiVir(k.vir);
          await zabelezBlokado(db, k.vir, virAdapter?.hlajenjeUr ?? 12, `PDF arhivar: ${e.message}`);
          const vrsta = klasificiraj(e.message);
          await zabelezDogodek(db, k.vir, {
            stanje: "hlajenje",
            kdo: "PDF arhivar",
            vrsta,
            kaj:
              `${OPIS_NAPAKE[vrsta]} pri arhiviranju oglasa ${k.vir_id}. ` +
              `Arhivar se ustavi brez ponovnega poskusa; hlajenje velja tudi za zbiralnik.`,
          });
          log(`ZAVRNITEV pri ${k.vir}: ${e.message} — hlajenje zapisano, arhivar se ustavi`);
          await objaviStanje(db, "zavrnjen", { porabljeno, razlog: e.message, vrsta });
          break;
        }
        log(`napaka pri ${k.vir}/${k.vir_id}: ${e instanceof Error ? e.message : String(e)}`);
        await db.from("nep_napake").insert({
          vir: k.vir,
          url: k.url,
          tip: "pdf",
          sporocilo: e instanceof Error ? e.message : String(e),
        });
        // Da isti pokvarjen oglas ne blokira vrste za vedno.
        await db.from("nep_pdfji").insert({
          vir: k.vir,
          vir_id: k.vir_id,
          url: k.url,
          razlog: "nedosegljiv",
          cena_eur: k.cena_eur,
        });
        porabljeno += 1;
        await zapisiPorabo(db, porabljeno);
      }

      utrip("premor");
      await spanec(ZAMIK_OGLAS_MS + Math.random() * 5_000);
    }
  } finally {
    await browser.close().catch(() => {});
    utrip("koncano");
    log(`arhivar končal: ${obdelanih} oglasov, ${porabljeno} zahtevkov danes`);
  }
}

main().catch((e) => {
  log(`USODNA NAPAKA: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
