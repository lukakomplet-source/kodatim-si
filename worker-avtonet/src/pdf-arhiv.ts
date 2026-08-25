import "dotenv/config";
import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync, statfsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { connect, type Db } from "./db.js";
import { preberiBlokado, blokiran, minutDoKonca } from "./blokada.js";

/**
 * PDF arhivar — LOČEN proces od glavnega zbiralnika.
 *
 * Oglas, ki izgine z avto.neta, je izgubljen: strani ni več, slik ni več.
 * Podatke (cena, km, oprema …) baza že hrani za vedno; ta proces zraven shrani
 * še VIZUALNO kopijo — en PDF s stranjo oglasa in vsemi slikami avta — na
 * zunanji disk (AVTONET_PDF_MAPA). Ob spremembi cene nastane nova, manjša
 * verzija (samo stran, slike so že v prvi), tako da se pri izginulem oglasu
 * vidi celotna zgodba: kako je bil objavljen, kdaj se je cena premaknila in
 * s kakšno ceno je šel dol.
 *
 * Zakaj ločen proces: glavni zbiralnik je dokazano stabilen in ga ta funkcija
 * ne sme ogroziti. Arhivar zato:
 *  - BERE skupno blokado (blokada.ts) in počiva, dokler je vir blokiran,
 *  - na lastni 403/429 počiva po svoji lestvici (30 min → 4 h), ne piše
 *    v skupno stanje,
 *  - hodi počasneje od glavnega workerja (6–10 s med oglasi),
 *  - ob kakršnikoli svoji napaki nikoli ne podre ničesar drugega.
 *
 * Vrstni red iz pogleda avtonet_pdf_kandidati: spremembe cene pred novimi,
 * novi od najnovejšega nazaj — sveži oglasi (posli!) izginejo v dnevih,
 * stari pa počakajo.
 */

const MAPA = process.env.AVTONET_PDF_MAPA ?? "E:\\Samo slike od avtonet baza koda tim";
const KAPICA_GB = Number(process.env.AVTONET_PDF_KAPICA_GB ?? 150);
const MIN_PROSTO_GB = 5;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const LOG = process.env.AVTONET_PDF_LOG ?? "C:\\Users\\lukak\\avtonet-db\\pdf-arhiv.log";
/**
 * Utrip za NADZORNIK: datoteka, ki jo arhivar osveži vsaj enkrat na minuto,
 * tudi med vsemi oblikami počitka. Nadzornik meri njeno starost — proces, ki
 * je "živ" (okno odprto, node teče), a utripa ne piše, je obešen in ga
 * nadzornik pobije ter zažene znova.
 */
const UTRIP = process.env.AVTONET_PDF_UTRIP ?? "C:\\Users\\lukak\\avtonet-db\\pdf-arhiv.utrip";
/**
 * Zaklep enega samega arhivarja.
 *
 * 24. 8. sta minuto tekla dva hkrati (rocni zagon in nadzornikov sta se srecala)
 * in isti oglas je bil posnet dvakrat v 0,2 sekunde. To ni le podvojeno delo:
 * podvoji tudi klice na avto.net, kar je natanko tisto, cesar temu procesu ne
 * dovolimo. Zaklep drzi PID; ce proces v njem ne zivi vec, ga nov prevzame,
 * tako da padec ne pusti arhivarja trajno zaklenjenega.
 */
/**
 * Poševnice morajo biti podvojene: TypeScript zaporedij \U in \l ne pozna in
 * ju preprosto poje, zato je iz poti nastalo relativno ime
 * "C:Userslukakavtonet-dbpdf-arhiv.lock". Zaklep je nastajal v delovni mapi
 * (in obležal v repozitoriju), dva arhivarja iz različnih map pa se ne bi
 * videla — kar je natanko to, kar naj bi zaklep preprečil.
 */
const ZAKLEP = process.env.AVTONET_PDF_ZAKLEP ?? "C:\Users\lukak\avtonet-db\pdf-arhiv.lock";

function zivProces(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM pomeni, da proces obstaja, le da vanj ne smemo poseci.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function prevzemiZaklep(): boolean {
  try {
    writeFileSync(ZAKLEP, String(process.pid), { flag: "wx" });
    log(`Zaklep prevzet (PID ${process.pid}, prost).`);
    return true;
  } catch {
    let vsebina = "";
    try {
      vsebina = readFileSync(ZAKLEP, "utf8").trim();
    } catch {
      // Necitljiv zaklep obravnavamo kot ostanek padlega procesa.
    }
    const stari = Number(vsebina);
    if (stari && stari !== process.pid && zivProces(stari)) {
      log(`Zaklep drzi ziv PID ${stari}.`);
      return false;
    }
    log(`Zaklep prevzet (PID ${process.pid}, star zapis "${vsebina}" ni ziv).`);
    try {
      writeFileSync(ZAKLEP, String(process.pid));
      return true;
    } catch {
      return false;
    }
  }
}

function sprostiZaklep(): void {
  try {
    if (Number(readFileSync(ZAKLEP, "utf8").trim()) === process.pid) unlinkSync(ZAKLEP);
  } catch {
    // Sproscanje je vljudnost; naslednji zagon zna prevzeti mrtev zaklep.
  }
}


function utrip(stanje: string): void {
  try {
    writeFileSync(UTRIP, `${new Date().toISOString()} ${stanje}`);
  } catch {
    // Utrip ni razlog za padec.
  }
}

/** Počitek, ki vsak\u00e0 minuto osveži utrip — da dolg premor ni videti kot obesitev. */
async function spanecZUtripom(ms: number, stanje: string): Promise<void> {
  const konec = Date.now() + ms;
  for (;;) {
    utrip(stanje);
    const ostane = konec - Date.now();
    if (ostane <= 0) return;
    await spanec(Math.min(55_000, ostane));
  }
}
/** Lestvica počitka ob lastni blokadi (minute). */
const LASTNA_LESTVICA = [30, 60, 120, 240];

function log(msg: string): void {
  const vrstica = `${new Date().toISOString()} ${msg}`;
  console.log(vrstica);
  try {
    appendFileSync(LOG, vrstica + "\n");
  } catch {
    // Dnevnik ni razlog za padec.
  }
}

function spanec(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Trda časovna omejitev okoli celotnega zajema enega oglasa.
 *
 * Playwrightovi posamezni klici imajo svoje omejitve, a ne vsi: newContext,
 * newPage in evaluate znajo obviseti za vedno — glavni zbiralnik je to isto
 * lekcijo plačal z 90-minutnim obeskom in jo rešil s svojim zOmejitvijo.
 * Arhivar te zaščite ni imel: 21. 8. ob 11:01 je en tak klic obvisel in
 * proces je bil "živ" ter popolnoma mrtev sedem ur in pol. Obešena obljuba
 * se ne da prekiniti, zato se ob izteku brskalnik ubije — s tem pade tudi
 * obešeni klic, zanka pa gre naprej s svežim.
 */
function zOmejitvijo<T>(p: Promise<T>, ms: number, oznaka: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${oznaka}: obtičal ${Math.round(ms / 1000)} s`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

type Kandidat = { avtonet_id: string; url: string; cena_eur: number | null; razlog: string };

async function kandidati(db: Db, koliko: number): Promise<Kandidat[]> {
  // Spremembe cene najprej (dogodek, ki ga sicer zamudimo), nato novi oglasi
  // od najnovejšega nazaj.
  const { data: cene } = await db
    .from("avtonet_pdf_kandidati")
    .select("avtonet_id, url, cena_eur, razlog")
    .eq("razlog", "cena")
    .order("first_seen", { ascending: false })
    .limit(koliko);
  const rezultat = (cene ?? []) as Kandidat[];
  if (rezultat.length < koliko) {
    const { data: novi } = await db
      .from("avtonet_pdf_kandidati")
      .select("avtonet_id, url, cena_eur, razlog")
      .eq("razlog", "nov")
      .order("first_seen", { ascending: false })
      .limit(koliko - rezultat.length);
    rezultat.push(...((novi ?? []) as Kandidat[]));
  }
  return rezultat;
}

/** Zasedenost arhiva iz baze (edini pisec je ta proces, zato je vsota točna). */
async function zasedenost(db: Db): Promise<{ datotek: number; bajtov: number }> {
  const { data } = await db.from("avtonet_pdf_povzetek").select("datotek, bajtov").maybeSingle();
  const p = data as { datotek: number; bajtov: number } | null;
  return { datotek: Number(p?.datotek ?? 0), bajtov: Number(p?.bajtov ?? 0) };
}

/**
 * Koliko oglasov čaka na arhiviranje. Brez te številke se "arhiv je poln"
 * opazi šele takrat, ko se zajem ustavi — konzola iz nje in iz povprečne
 * velikosti PDF-ja izračuna, za koliko oglasov je še prostora.
 */
async function cakajocih(db: Db): Promise<number> {
  try {
    const { count } = await db
      .from("avtonet_pdf_kandidati")
      .select("avtonet_id", { count: "exact", head: true });
    return Number(count ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Koliko PDF-jev je nastalo v zadnjih 24 urah.
 *
 * Iz te stevilke konzola izracuna, kdaj bo vrsta prazna. Merimo DEJANSKI izkupicek,
 * ne teoreticne hitrosti: blokade, hlajenja in padci so ze všteti, zato je ocena
 * postena tudi takrat, ko dan ni bil idealen.
 */
async function vZadnjihUrah(db: Db): Promise<number> {
  try {
    const od = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("avtonet_pdfji")
      .select("id", { count: "exact", head: true })
      .gte("ustvarjen", od);
    return Number(count ?? 0);
  } catch {
    return 0;
  }
}

async function objaviStanje(db: Db, dodatno: Record<string, unknown>): Promise<void> {
  try {
    const [z, caka, v24h] = await Promise.all([zasedenost(db), cakajocih(db), vZadnjihUrah(db)]);
    await db.from("avtonet_statistika").upsert({
      kljuc: "pdf_arhiv",
      podatki: { ...z, kapicaGb: KAPICA_GB, cakajocih: caka, v24h, ...dodatno },
      izracunano: new Date().toISOString(),
    });
  } catch {
    // Števec je informativen.
  }
}

/** Vse slike avta s strani: male sličice galerije nazaj v polno velikost. */
function polneSlike(urlji: string[]): string[] {
  const polni = urlji
    .filter((u) => /images\.avto\.net\/photo\//.test(u))
    .map((u) => u.replace(/_small(?=\.\w+$)/, ""));
  return [...new Set(polni)];
}

class LastnaBlokada extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

/**
 * En oglas → en PDF: stran (brez naloženih slik, da je majhna) + vsaka slika
 * avta kot svoja stran (stisnjena na ≤1400 px, JPEG q72). Pri verziji 'cena'
 * so slike izpuščene — že so v prvi verziji, cena pa je vidna na strani.
 */
async function zajemi(
  browser: Browser,
  k: Kandidat
): Promise<{ pdf: Buffer; stSlik: number; zaModel: Buffer[] } | "nedosegljiv"> {
  let ctx: BrowserContext | null = null;
  try {
    ctx = await browser.newContext({ locale: "sl-SI", userAgent: UA });
    const page = await ctx.newPage();
    // Slik med tiskanjem ne nalagamo: URL-je preberemo iz DOM-a in jih dodamo
    // kot lastne, stisnjene strani — PDF strani tako ne podvaja slik.
    // Consent (Cookiebot) in oglasne skripte blokiramo že pri nalaganju: brez
    // tega je bil PDF prekrit s cookie dialogom čez celo stran.
    await page.route(
      (u) =>
        /\.(?:jpe?g|png|gif|webp|woff2?)(?:\?|$)/i.test(u.pathname) ||
        /cookiebot|googlesyndication|doubleclick|googletagmanager|google-analytics|adservice|adsbygoogle/i.test(
          u.hostname + u.pathname
        ),
      (r) => r.abort()
    );
    const odgovor = await page.goto(k.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const status = odgovor?.status() ?? 0;
    if (status === 403 || status === 429) throw new LastnaBlokada(status);
    if (status >= 400) return "nedosegljiv";

    await page.waitForTimeout(1500);
    const telo = await page.evaluate(() => document.body.innerText.slice(0, 400));
    if (/oglas ne obstaja|oglas je bil izbrisan|ni ve[cč] objavljen/i.test(telo)) return "nedosegljiv";

    const surovi = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .map((i) => i.getAttribute("src") ?? i.getAttribute("data-src") ?? "")
        .filter(Boolean)
    );
    // Varovalka za vse, kar se je kljub blokadi izrisalo: consent dialogi,
    // oglasni okvirji in celozaslonska fiksna prekritja ne sodijo v arhiv.
    await page.evaluate(() => {
      document
        .querySelectorAll(
          '[id^="CybotCookiebot"], .fc-consent-root, #onetrust-consent-sdk, ins.adsbygoogle, iframe[src*="doubleclick"], iframe[src*="googlesyndication"]'
        )
        .forEach((e) => e.remove());
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
    // Slike za lokalni vizualni model. Nastanejo iz iste prenesene slike kot
    // stran v PDF-ju, zato vir ne dobi niti enega zahtevka vec. Izbor: prvi
    // dve (sprednja polovica avta, kjer se vidi facelift), sredinska in ena iz
    // zadnje tretjine (obicajno notranjost, kjer se vidi oprema) - stiri
    // slike istega kota avta modelu ne povedo nicesar.
    const zaModel: Buffer[] = [];
    const vsiUrlji = k.razlog !== "cena" ? polneSlike(surovi) : [];
    const izbrane = new Set(
      [0, 1, Math.floor(vsiUrlji.length / 2), Math.floor(vsiUrlji.length * 0.75)].filter(
        (i) => i >= 0 && i < vsiUrlji.length
      )
    );

    if (k.razlog !== "cena") {
      let indeks = -1;
      for (const slikaUrl of vsiUrlji) {
        indeks++;
        try {
          const odziv = await ctx.request.get(slikaUrl, { timeout: 20_000 });
          if (!odziv.ok()) continue;
          const surova = await odziv.body();
          if (surova.length < 3_000) continue; // ikone, placeholderji
          const jpeg = await sharp(surova)
            .rotate()
            .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 72 })
            .toBuffer();
          if (izbrane.has(indeks)) {
            zaModel.push(
              await sharp(jpeg)
                .resize({ width: 896, height: 896, fit: "inside", withoutEnlargement: true })
                .jpeg({ quality: 65 })
                .toBuffer()
            );
          }
          const vlozena = await dokument.embedJpg(jpeg);
          const stran = dokument.addPage([vlozena.width, vlozena.height]);
          stran.drawImage(vlozena, { x: 0, y: 0, width: vlozena.width, height: vlozena.height });
          stSlik++;
          await spanec(250 + Math.random() * 400);
        } catch {
          // Ena slika ni razlog, da pade cel oglas.
        }
      }
    }

    const koncni = Buffer.from(await dokument.save());
    return { pdf: koncni, stSlik, zaModel };
  } finally {
    await ctx?.close().catch(() => {});
  }
}

async function shrani(
  db: Db,
  k: Kandidat,
  pdf: Buffer,
  stSlik: number,
  zaModel: Buffer[] = []
): Promise<void> {
  const dan = new Date().toISOString().slice(0, 10);
  const cena = k.cena_eur !== null ? Math.round(Number(k.cena_eur)) : "brez-cene";
  const mapaOglasa = join(MAPA, k.avtonet_id);
  mkdirSync(mapaOglasa, { recursive: true });
  const ime = `${dan}_${k.razlog}_${cena}.pdf`;
  writeFileSync(join(mapaOglasa, ime), pdf);
  await db.from("avtonet_pdfji").insert({
    avtonet_id: k.avtonet_id,
    url: k.url,
    razlog: k.razlog,
    cena_eur: k.cena_eur,
    datoteka: `${k.avtonet_id}/${ime}`,
    velikost: pdf.length,
    stevilo_slik: stSlik,
  });

  // Slike za lokalni vizualni model in vpis v njegovo vrsto. Vrsto polni
  // arhivar in ne poizvedba po bazi zato, ker samo on ve, ali slike RES lezijo
  // na disku - sicer bi vrsta stela oglase, ki jih model ne more pogledati.
  if (zaModel.length > 0) {
    try {
      const mapaVid = join(mapaOglasa, "vid");
      mkdirSync(mapaVid, { recursive: true });
      zaModel.forEach((slika, i) => writeFileSync(join(mapaVid, `${i + 1}.jpg`), slika));
      await db.from("avtonet_vid").upsert({
        avtonet_id: k.avtonet_id,
        status: "cakanje",
        slik: zaModel.length,
        posodobljen: new Date().toISOString(),
      });
    } catch (e) {
      log(`  slik za model ni bilo mogoce shraniti (${k.avtonet_id}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function nagrobnik(db: Db, k: Kandidat): Promise<void> {
  await db.from("avtonet_pdfji").insert({
    avtonet_id: k.avtonet_id,
    url: k.url,
    razlog: "nedosegljiv",
    cena_eur: k.cena_eur,
    datoteka: "",
    velikost: 0,
  });
}

function prostoNaDiskuGb(): number {
  try {
    const s = statfsSync(MAPA);
    return (s.bavail * s.bsize) / 1e9;
  } catch {
    return Infinity;
  }
}

async function main(): Promise<void> {
  const testnih = (() => {
    const i = process.argv.indexOf("--test");
    return i >= 0 ? Number(process.argv[i + 1] ?? 3) : null;
  })();

  if (!prevzemiZaklep()) {
    log("Arhivar ze tece (zaklep drzi ziv proces) - ta zagon se konca.");
    return;
  }
  process.on("exit", sprostiZaklep);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(sig, () => {
      sprostiZaklep();
      process.exit(0);
    });
  }

  const db = connect();
  // Koren priklopljenega diska (npr. "G:\\" za OneDrive) ze obstaja in ga ni
  // mogoce ustvariti - mkdir nanj vrne EPERM in arhivar je padel v zanko.
  if (!existsSync(MAPA)) mkdirSync(MAPA, { recursive: true });
  log(`PDF arhivar zagnan. Mapa: ${MAPA}, kapica: ${KAPICA_GB} GB${testnih ? `, TEST ${testnih} oglasov` : ""}`);

  let browser: Browser | null = null;
  let lastnihBlokad = 0;
  let obdelanih = 0;
  let odZagona = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // 1. Skupna blokada: če je glavni worker naletel na 403, počivava oba.
      const skupna = await preberiBlokado(db);
      if (blokiran(skupna)) {
        const min = minutDoKonca(skupna);
        log(`Vir je blokiran (skupno stanje, še ${min} min) — arhivar počiva.`);
        await objaviStanje(db, { stanje: "blokada", doMinut: min });
        await spanecZUtripom(Math.min(min, 15) * 60_000 + 30_000, "skupna-blokada");
        continue;
      }

      // 2. Prostor: kapica arhiva in fizični disk.
      const z = await zasedenost(db);
      if (z.bajtov / 1e9 >= KAPICA_GB * 0.97) {
        log(`Arhiv je pri kapici (${(z.bajtov / 1e9).toFixed(1)} / ${KAPICA_GB} GB) — zajem ustavljen. Povečaj AVTONET_PDF_KAPICA_GB ali disk.`);
        await objaviStanje(db, { stanje: "polno" });
        await spanecZUtripom(60 * 60_000, "kapica");
        continue;
      }
      if (prostoNaDiskuGb() < MIN_PROSTO_GB) {
        log(`Na disku je manj kot ${MIN_PROSTO_GB} GB prostora — zajem ustavljen.`);
        await objaviStanje(db, { stanje: "disk_poln" });
        await spanecZUtripom(60 * 60_000, "disk-poln");
        continue;
      }

      // 3. Kandidati.
      const vrsta = await kandidati(db, testnih ?? 20);
      if (vrsta.length === 0) {
        log("Vrsta je prazna — vse aktivno je arhivirano. Preverim čez 15 min.");
        await objaviStanje(db, { stanje: "vse_arhivirano" });
        if (testnih !== null) break;
        await spanecZUtripom(15 * 60_000, "vrsta-prazna");
        continue;
      }

      browser ??= await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });

      for (const k of vrsta) {
        const zacetek = Date.now();
        utrip("zajem " + k.avtonet_id);
        try {
          // Brskalnik je lahko padel ali bil ubit ob prejšnji obesitvi.
          browser ??= await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
          // Cel zajem enega oglasa pod trdo omejitvijo — obeseni klic brskalnika
          // sicer ustavi ves arhiv, proces pa je videti ziv.
          const rezultat = await zOmejitvijo(zajemi(browser, k), 180_000, k.avtonet_id);
          if (rezultat === "nedosegljiv") {
            await nagrobnik(db, k);
            log(`  ${k.avtonet_id} ni več dosegljiv (verjetno ravno izginil) — preskočen.`);
          } else {
            await shrani(db, k, rezultat.pdf, rezultat.stSlik, rezultat.zaModel);
            obdelanih++;
            log(
              `  ${k.avtonet_id} [${k.razlog}] shranjen: ${(rezultat.pdf.length / 1024).toFixed(0)} KB, ${rezultat.stSlik} slik, ${Date.now() - zacetek} ms`
            );
          }
          lastnihBlokad = 0;
        } catch (e) {
          if (e instanceof LastnaBlokada) {
            const pavza = LASTNA_LESTVICA[Math.min(lastnihBlokad, LASTNA_LESTVICA.length - 1)];
            lastnihBlokad++;
            log(`403/429 pri ${k.avtonet_id} — arhivar počiva ${pavza} min (stopnja ${lastnihBlokad}).`);
            await objaviStanje(db, { stanje: "lastna_blokada", pavzaMin: pavza });
            await browser?.close().catch(() => {});
            browser = null;
            await spanecZUtripom(pavza * 60_000, "lastna-blokada");
            break;
          }
          const sporocilo = e instanceof Error ? e.message : String(e);
          log(`  Napaka pri ${k.avtonet_id}: ${sporocilo}`);
          if (sporocilo.includes("obtičal")) {
            // Obesenega klica se ne da prekiniti; pade sele, ko pade brskalnik.
            await browser?.close().catch(() => {});
            browser = null;
            log("  Brskalnik ubit zaradi obesitve — nadaljujem s svezim.");
          }
        }
        odZagona++;
        if (odZagona % 10 === 0) await objaviStanje(db, { stanje: "tece", obdelanihOdZagona: odZagona });
        // Počasneje od glavnega workerja: 6–10 s med oglasi.
        await spanec(6_000 + Math.random() * 4_000);
      }

      if (testnih !== null && obdelanih >= testnih) break;
    } catch (e) {
      log(`Napaka zanke: ${e instanceof Error ? e.message : String(e)} — nadaljujem čez 2 min.`);
      await spanec(2 * 60_000);
    }
  }

  await objaviStanje(db, { stanje: "test_koncan" });
  await browser?.close().catch(() => {});
  log(`Konec. Obdelanih: ${obdelanih}.`);
  process.exit(0);
}

main().catch((e) => {
  log(`Usodna napaka: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  process.exit(1);
});
