import "dotenv/config";
import { readFileSync, existsSync, writeFileSync, readdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { connect, type Db } from "./db.js";

/**
 * Vizualni pregled oglasov z LOKALNIM modelom (Ollama, RTX 3060).
 *
 * Zakaj sploh: besedilo oglasa pove opremo tako, kot jo je vpisal prodajalec —
 * pogosto na pol, včasih napačno. Facelift pa iz besedila skoraj nikoli ne
 * pride (od 66.000 oglasov ga ima določenega 486). Oboje se VIDI na slikah,
 * zato jih pogleda model, ki teče tu doma in ne stane nič.
 *
 * Kar model pove, NI dejstvo, ampak mnenje s stopnjo zaupanja. Zato živi v
 * svoji tabeli (avtonet_vid) in ne piše čez podatke z oglasnika; v cenilnik
 * gre samo tisto, kar prestane prag. Model, ki v petini primerov vidi usnje,
 * kjer ga ni, bi primerjavo vozil pokvaril bolj, kot bi jo izboljšal.
 *
 * Slike NIKOLI ne pridejo z avto.neta: uporabimo tiste, ki jih je PDF arhivar
 * že prenesel in shranil ob PDF-ju. Vir s tem ne dobi niti enega zahtevka več.
 */

const OLLAMA = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const MODEL = process.env.AVTONET_VID_MODEL ?? "qwen2.5vl:7b";
const MAPA = process.env.AVTONET_PDF_MAPA ?? "C:\\avtonet-arhiv";
const LOG = process.env.AVTONET_VID_LOG ?? "C:\\Users\\lukak\\avtonet-db\\vid.log";
const UTRIP = process.env.AVTONET_VID_UTRIP ?? "C:\\Users\\lukak\\avtonet-db\\vid.utrip";
const ZAKLEP = process.env.AVTONET_VID_ZAKLEP ?? "C:\\Users\\lukak\\avtonet-db\\vid.lock";
/** Koliko oglasov naenkrat vzamemo iz vrste. */
const SVEZENJ = 8;

function log(sporocilo: string): void {
  const vrstica = `${new Date().toISOString()} ${sporocilo}`;
  console.log(vrstica);
  try {
    appendFileSync(LOG, vrstica + "\n");
  } catch {
    // Dnevnik ni razlog za padec.
  }
}

function utrip(stanje: string): void {
  try {
    writeFileSync(UTRIP, `${new Date().toISOString()} ${stanje}`);
  } catch {
    // Utrip ni razlog za padec.
  }
}

/** Enak zaklep kot pri arhivarju: dva procesa bi delala isto delo dvakrat. */
function zivProces(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function prevzemiZaklep(): boolean {
  try {
    writeFileSync(ZAKLEP, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    let stari = 0;
    try {
      stari = Number(readFileSync(ZAKLEP, "utf8").trim());
    } catch {
      // Nečitljiv zaklep je ostanek padlega procesa.
    }
    if (stari && stari !== process.pid && zivProces(stari)) return false;
    try {
      writeFileSync(ZAKLEP, String(process.pid));
      return true;
    } catch {
      return false;
    }
  }
}

async function spanec(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Kaj sprašujemo in na kateri sliki.
 *
 * Merjeno na tem stroju: odprto vprašanje ("naštej opremo") daje slabe odgovore
 * — model bodisi prepiše primere iz navodila bodisi vrne prazno. Eno konkretno
 * vprašanje na eno sliko pa je hitro (1–2 s) in odgovori se med avtomobili
 * razlikujejo, kar je prvi pogoj, da sploh kaj merijo.
 *
 * "kje" pove, katero sliko dobi model: zunanjost je prva (sprednja polovica
 * vozila), notranjost pa predzadnja — vprašanje o sedežih na sliki motorja je
 * zapravljena sekunda.
 */
const VPRASANJA: {
  kljuc: string;
  oznaka: string;
  kje: "zunaj" | "znotraj";
  vprasanje: string;
  /** Po teh besedah se ista lastnost prepozna v besedilu oglasa. */
  besedilo: string[];
}[] = [
  {
    kljuc: "led_zarometi",
    oznaka: "LED žarometi",
    besedilo: ["led žarom", "led luč", "matrix", "full led"],
    kje: "zunaj",
    vprasanje:
      "Ali ima ta avto LED prednje žaromete? LED se prepozna po ostri beli svetlobni črti ali več ločenih segmentih znotraj žarometa.",
  },
  {
    kljuc: "alu_platisca",
    oznaka: "Alu platišča",
    besedilo: ["alu platišč", "aluminij", "lito platišč"],
    kje: "zunaj",
    vprasanje:
      "Ali so platišča na tem avtu aluminijasta (kovinski kraki, vidni skozi odprtine), ne jeklena s plastičnim pokrovom?",
  },
  {
    kljuc: "stresno_okno",
    oznaka: "Strešno okno",
    besedilo: ["strešno okno", "panorams", "šiber", "sunroof"],
    kje: "zunaj",
    vprasanje: "Ali ima ta avto na strehi strešno okno ali panoramsko streho?",
  },
  {
    kljuc: "vlecna_kljuka",
    oznaka: "Vlečna kljuka",
    besedilo: ["vlečna", "kljuka", "avtovlečn"],
    kje: "zunaj",
    vprasanje: "Ali je na zadnjem odbijaču vidna vlečna kljuka ali njeno nosilno grlo?",
  },
  {
    kljuc: "usnje",
    oznaka: "Usnjeni sedeži",
    besedilo: ["usnj", "leather"],
    kje: "znotraj",
    vprasanje: "Ali so sedeži usnjeni (gladka, sijoča površina s šivi), ne blago?",
  },
  {
    kljuc: "sportni_sedezi",
    oznaka: "Športni sedeži",
    besedilo: ["športni sedež", "sport seat", "recaro"],
    kje: "znotraj",
    vprasanje: "Ali imajo sprednji sedeži izrazito oblikovane stranske opornike (športni sedeži)?",
  },
  {
    kljuc: "zaslon",
    oznaka: "Navigacijski zaslon",
    besedilo: ["navigacij", "zaslon", "multimedij", "carplay"],
    kje: "znotraj",
    vprasanje: "Ali je na sredinski konzoli zaslon za navigacijo ali multimedijo?",
  },
  {
    kljuc: "digitalni_merilniki",
    oznaka: "Digitalni merilniki",
    besedilo: ["digitalni merilnik", "virtual cockpit", "digitalna armaturna"],
    kje: "znotraj",
    vprasanje: "Ali so merilniki za volanom digitalni (zaslon namesto klasičnih okroglih števcev)?",
  },
];

/**
 * Model sme reči "ne vem" in sme biti negotov.
 *
 * Brez teh dveh možnosti model ugiba, ugibanje pa je tu dražje od tišine:
 * napačno pripisana oprema pokvari primerjavo vozil bolj kot manjkajoča.
 */
const MOZNOSTI = ["zagotovo da", "verjetno da", "ne", "ne vem"] as const;

const SHEMA_DA_NE = {
  type: "object",
  properties: {
    odgovor: { type: "string", enum: [...MOZNOSTI] },
    razlog: { type: "string" },
  },
  required: ["odgovor", "razlog"],
} as const;

const SHEMA_FACELIFT = {
  type: "object",
  properties: {
    odgovor: { type: "string", enum: ["facelift", "predfacelift", "ne vem"] },
    razlog: { type: "string" },
  },
  required: ["odgovor", "razlog"],
} as const;

/** Slike enega oglasa, ki jih je arhivar pustil ob PDF-ju. */
function slikeOglasa(avtonetId: string): string[] {
  const mapa = join(MAPA, avtonetId, "vid");
  if (!existsSync(mapa)) return [];
  return readdirSync(mapa)
    .filter((v) => v.toLowerCase().endsWith(".jpg"))
    .sort()
    .map((v) => join(mapa, v));
}

type Odgovor = { odgovor?: string; razlog?: string };

async function vprasaj(slika: string, vprasanje: string, shema: unknown): Promise<Odgovor> {
  const r = await fetch(`${OLLAMA}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt: vprasanje,
      images: [readFileSync(slika).toString("base64")],
      stream: false,
      format: shema,
      options: { temperature: 0, num_ctx: 4096 },
    }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const telo = (await r.json()) as { response?: string };
  try {
    return JSON.parse(telo.response ?? "{}") as Odgovor;
  } catch {
    return {};
  }
}

/** Iz besednega odgovora naredi stopnjo zaupanja, ki jo razume ostali sistem. */
function zaupanjeIz(odgovor: string | undefined): number | null {
  if (odgovor === "zagotovo da") return 0.95;
  if (odgovor === "verjetno da") return 0.7;
  return null;
}

type Izid = {
  oprema: { znacilka: string; zaupanje: number; kje: string }[];
  facelift: boolean | null;
  facelift_zaupanje: number | null;
  facelift_razlog: string;
  vsi: Record<string, string>;
  razlogi: Record<string, string>;
  slikaZa: Record<string, string>;
  ms: number;
};

async function pregledOglasa(slike: string[]): Promise<Izid> {
  const zacetek = Date.now();
  const zunaj = slike[0];
  const znotraj = slike.length > 2 ? slike[slike.length - 2] : slike[slike.length - 1];

  const oprema: Izid["oprema"] = [];
  const vsi: Record<string, string> = {};
  const razlogi: Record<string, string> = {};
  const slikaZa: Record<string, string> = {};

  for (const v of VPRASANJA) {
    const o = await vprasaj(v.kje === "zunaj" ? zunaj : znotraj, v.vprasanje, SHEMA_DA_NE);
    vsi[v.kljuc] = o.odgovor ?? "brez odgovora";
    const zaupanje = zaupanjeIz(o.odgovor);
    if (zaupanje !== null) {
      oprema.push({ znacilka: v.oznaka, zaupanje, kje: (o.razlog ?? "").slice(0, 140) });
    }
    razlogi[v.kljuc] = (o.razlog ?? "").slice(0, 200);
    slikaZa[v.kljuc] = v.kje === "zunaj" ? zunaj : znotraj;
  }

  const f = await vprasaj(
    zunaj,
    "Ali je to facelift (prenovljena različica serije) ali predfacelift? Poglej obliko žarometov, maske in odbijača.",
    SHEMA_FACELIFT
  );
  vsi["facelift"] = f.odgovor ?? "brez odgovora";

  return {
    oprema,
    facelift: f.odgovor === "facelift" ? true : f.odgovor === "predfacelift" ? false : null,
    facelift_zaupanje: f.odgovor === "ne vem" || !f.odgovor ? null : 0.7,
    facelift_razlog: (f.razlog ?? "").slice(0, 200),
    vsi,
    razlogi,
    slikaZa,
    ms: Date.now() - zacetek,
  };
}

type Naloga = { avtonet_id: string; naziv: string | null; letnik: number | null; oprema: unknown };

async function vrsta(db: Db, koliko: number): Promise<Naloga[]> {
  const { data } = await db
    .from("avtonet_vid_kandidati")
    .select("avtonet_id, naziv, letnik, oprema")
    .limit(koliko);
  return (data ?? []) as Naloga[];
}


/**
 * Iz odgovora modela in besedila oglasa naredi eno strukturirano trditev.
 *
 * Pravila, ki se jih drzi:
 *  - NEZNANO se NIKOLI ne prevede v NE. Manjkajoc dokaz in odsotnost opreme
 *    nista isto; ce bi ju enacili, bi baza scasoma trdila, da polovica vozil
 *    nima stresnega okna, ker ga na sliki ni bilo videti.
 *  - KONFLIKT samo pri PRAVEM nasprotju: oglas opremo NASTEJE, model pa jo na
 *    sliki izrecno zanika. Molk oglasa ni zanikanje - seznami opreme so skoraj
 *    vedno nepopolni, zato "besedilo molci, model vidi" ni konflikt.
 */
function zdruzi(
  vizija: string,
  vBesedilu: boolean
): { vrednost: "DA" | "NE" | "NEZNANO" | "KONFLIKT"; vir: "besedilo" | "vizija" | "zdruzeno" } {
  const vidiDa = vizija === "zagotovo da" || vizija === "verjetno da";
  const vidiNe = vizija === "ne";
  if (vBesedilu && vidiNe) return { vrednost: "KONFLIKT", vir: "zdruzeno" };
  if (vBesedilu && vidiDa) return { vrednost: "DA", vir: "zdruzeno" };
  if (vBesedilu) return { vrednost: "DA", vir: "besedilo" };
  if (vidiDa) return { vrednost: "DA", vir: "vizija" };
  if (vidiNe) return { vrednost: "NE", vir: "vizija" };
  return { vrednost: "NEZNANO", vir: "vizija" };
}

/** Besedilo oglasa, v katerem iscemo omembe opreme. */
function besediloOglasa(n: Naloga): string {
  const kosi = [Array.isArray(n.oprema) ? (n.oprema as unknown[]).join(" ") : "", n.naziv ?? ""];
  return kosi.join(" ").toLowerCase();
}

async function zapisiLastnosti(db: Db, n: Naloga, izid: Izid): Promise<void> {
  const besedilo = besediloOglasa(n);
  const vrstice = VPRASANJA.map((v) => {
    const vBesedilu = v.besedilo.some((b) => besedilo.includes(b));
    const { vrednost, vir } = zdruzi(izid.vsi[v.kljuc] ?? "", vBesedilu);
    return {
      avtonet_id: n.avtonet_id,
      lastnost: v.kljuc,
      vrednost,
      zaupanje: zaupanjeIz(izid.vsi[v.kljuc]),
      vir,
      dokaz: izid.razlogi[v.kljuc] || null,
      slika: izid.slikaZa[v.kljuc] ? izid.slikaZa[v.kljuc].replace(MAPA, "") : null,
      posodobljen: new Date().toISOString(),
    };
  });
  vrstice.push({
    avtonet_id: n.avtonet_id,
    lastnost: "facelift",
    vrednost: izid.facelift === true ? "DA" : izid.facelift === false ? "NE" : "NEZNANO",
    zaupanje: izid.facelift_zaupanje,
    vir: "vizija",
    dokaz: izid.facelift_razlog || null,
    slika: izid.slikaZa["led_zarometi"] ? izid.slikaZa["led_zarometi"].replace(MAPA, "") : null,
    posodobljen: new Date().toISOString(),
  });
  const { error } = await db.from("avtonet_lastnosti").upsert(vrstice, { onConflict: "avtonet_id,lastnost" });
  if (error) log(`  lastnosti ni bilo mogoce zapisati (${n.avtonet_id}): ${error.message}`);
}

async function shrani(db: Db, n: Naloga, izid: Izid, stSlik: number): Promise<void> {
  await db.from("avtonet_vid").upsert({
    avtonet_id: n.avtonet_id,
    status: "koncano",
    model: MODEL,
    slik: stSlik,
    ms: izid.ms,
    oprema: izid.oprema,
    facelift: izid.facelift,
    facelift_zaupanje: izid.facelift_zaupanje,
    obrazlozitev: izid.facelift_razlog || null,
    surovo: { odgovori: izid.vsi },
    napaka: null,
    posodobljen: new Date().toISOString(),
  });
}

async function objaviStanje(db: Db, dodatno: Record<string, unknown>): Promise<void> {
  try {
    const [{ count: obdelanih }, { count: cakajocih }, { count: v24h }] = await Promise.all([
      db.from("avtonet_vid").select("avtonet_id", { count: "exact", head: true }).eq("status", "koncano"),
      db.from("avtonet_vid_kandidati").select("avtonet_id", { count: "exact", head: true }),
      db
        .from("avtonet_vid")
        .select("avtonet_id", { count: "exact", head: true })
        .gte("ustvarjen", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);
    await db.from("avtonet_statistika").upsert({
      kljuc: "vid",
      podatki: {
        model: MODEL,
        obdelanih: Number(obdelanih ?? 0),
        cakajocih: Number(cakajocih ?? 0),
        v24h: Number(v24h ?? 0),
        ...dodatno,
      },
      izracunano: new Date().toISOString(),
    });
  } catch {
    // Števec je informativen.
  }
}

async function main(): Promise<void> {
  const i = process.argv.indexOf("--test");
  const testnih = i >= 0 ? Number(process.argv[i + 1] ?? 5) : null;

  if (!prevzemiZaklep()) {
    log("Vizualni pregled ze tece (zaklep drzi ziv proces) - ta zagon se konca.");
    return;
  }

  const db = connect();
  log(`Vizualni pregled zagnan. Model: ${MODEL}, slike iz: ${MAPA}${testnih ? `, TEST ${testnih}` : ""}`);

  let odZagona = 0;
  for (;;) {
    try {
      utrip("iscem delo");
      const naloge = await vrsta(db, testnih ?? SVEZENJ);
      if (naloge.length === 0) {
        await objaviStanje(db, { stanje: "vse_obdelano" });
        if (testnih !== null) break;
        log("Vrsta je prazna - preverim cez 10 min.");
        await spanec(10 * 60_000);
        continue;
      }

      for (const n of naloge) {
        utrip("berem " + n.avtonet_id);
        const slike = slikeOglasa(n.avtonet_id);
        if (slike.length === 0) {
          // Arhivar tega oglasa se ni posnel; poskusimo kdaj drugic.
          await db.from("avtonet_vid").upsert({
            avtonet_id: n.avtonet_id,
            status: "brez_slik",
            posodobljen: new Date().toISOString(),
          });
          continue;
        }
        try {
          const izid = await pregledOglasa(slike);
          await shrani(db, n, izid, slike.length);
          await zapisiLastnosti(db, n, izid);
          odZagona++;
          log(
            `  ${n.avtonet_id}: ${slike.length} slik, ${(izid.ms / 1000).toFixed(1)} s, ` +
              `oprema ${izid.oprema.length}, facelift ${String(izid.facelift ?? "?")}`
          );
        } catch (e) {
          const sporocilo = e instanceof Error ? e.message : String(e);
          log(`  Napaka pri ${n.avtonet_id}: ${sporocilo}`);
          await db.from("avtonet_vid").upsert({
            avtonet_id: n.avtonet_id,
            status: "napaka",
            napaka: sporocilo.slice(0, 300),
            posodobljen: new Date().toISOString(),
          });
        }
        if (odZagona % 5 === 0) await objaviStanje(db, { stanje: "tece", odZagona });
      }

      await objaviStanje(db, { stanje: "tece", odZagona });
      if (testnih !== null) break;
    } catch (e) {
      log(`Napaka zanke: ${e instanceof Error ? e.message : String(e)} - nadaljujem cez 2 min.`);
      await spanec(2 * 60_000);
    }
  }

  log(`Konec. Obdelanih: ${odZagona}.`);
  process.exit(0);
}

main().catch((e) => {
  log(`Usodna napaka: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
