import type { Page } from "playwright";
import { cenaIz, izOpisa } from "../parse.js";
import type { NormaliziranOglas } from "../db.js";
import type { Detajl, Rezina as BazniRezina, SurovaKartica, VirAdapter } from "./vmesnik.js";

/**
 * Adapter za nepremicnine.siol.net (platforma Arvio).
 *
 * ZAKAJ JE PRIVZETO IZKLOPLJEN. Njihovi splošni pogoji (razdelek 8) izrecno
 * prepovedujejo "uporabo avtomatskih poizvedb ali drugih robotov, ki
 * avtomatsko pridobivajo podatke", izjema pa velja samo za SPLOŠNE spletne
 * iskalnike — vertikalni, kar smo mi, so izvzeti. robots.txt tega ne pove;
 * pove ga pogodba. Zato adapter obstaja, vir pa se ne vklopi sam: vklopi ga
 * lahko samo človek v konzoli, kjer je ob gumbu izpisano tudi besedilo
 * pogojev. Odločitev je njegova, ne kodina.
 *
 * robots.txt (preverjeno 20. 8. 2026) prepoveduje `/userarea/`, `/accounts/`,
 * `/api/v1/userarea/` in `/listing-mortgage-inquiry/`. Kartica na seznamu ima
 * povezavo na `/userarea/team/<id>` (stran agencije) — te NIKOLI ne odpremo;
 * ime agencije preberemo iz besedila kartice, ki je na dovoljeni strani.
 * Crawl-delay ni naveden, zato uporabimo 6 s, enako kot pri drugih virih.
 */

export const VIR = "nepremicnine.siol.net";

type SiolRezina = BazniRezina & { posel: "prodaja" | "oddaja"; tipId: number; tip: string };

/**
 * Tipi, ki jih znamo umestiti v naš besednjak. Soba (300), parkirišče (800) in
 * klet (900) so namenoma izpuščeni — zanje nimamo ne filtrov ne razumne
 * primerjave, izmišljena oznaka pa bi bila slabša od odsotnosti.
 */
const TIPI: { id: number; tip: string }[] = [
  { id: 100, tip: "stanovanje" },
  { id: 200, tip: "hisa" },
  { id: 400, tip: "poslovni_prostor" },
  { id: 500, tip: "pocitniski_objekt" },
  { id: 600, tip: "posest" },
  { id: 700, tip: "garaza" },
];

function vseRezine(): SiolRezina[] {
  const out: SiolRezina[] = [];
  for (const [posel, listingType] of [
    ["prodaja", 1],
    ["oddaja", 2],
  ] as const) {
    for (const t of TIPI) {
      out.push({ oznaka: `${posel}/${t.tip}`, posel, tipId: t.id, tip: t.tip });
    }
  }
  return out;
}

function seznamUrl(r: SiolRezina, stran: number): string {
  const listingType = r.posel === "prodaja" ? 1 : 2;
  // country=1 omeji na Slovenijo; brez tega seznam vsebuje tudi Hrvaško in
  // Italijo, kar bi našo statistiko slovenskega trga popačilo.
  const q = new URLSearchParams({
    listing_type: String(listingType),
    real_estate_type: String(r.tipId),
    country: "1",
    sort_by: "-created_at",
  });
  if (stran > 1) q.set("page", String(stran));
  return `https://nepremicnine.siol.net/iskanje?${q.toString()}`;
}

const MESECI = [
  "januar", "februar", "marec", "april", "maj", "junij",
  "julij", "avgust", "september", "oktober", "november", "december",
];

/** "Objavljeno 25. julij 2026" -> "2026-07-25". Brez ujemanja: null. */
export function datumIzSlovenskega(besedilo: string | null): string | null {
  const m = besedilo?.match(/(\d{1,2})\.\s*([a-zžčš]+)\s*(\d{4})/i);
  if (!m) return null;
  const mesec = MESECI.indexOf(m[2].toLowerCase());
  if (mesec < 0) return null;
  const dan = Number(m[1]);
  if (!Number.isInteger(dan) || dan < 1 || dan > 31) return null;
  return `${m[3]}-${String(mesec + 1).padStart(2, "0")}-${String(dan).padStart(2, "0")}`;
}

/** Prebere kartice s trenutno naložene strani seznama. */
async function preberiSeznam(page: Page): Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null }> {
  return page.evaluate(() => {
    const kartice: SurovaKartica[] = [];
    for (const el of Array.from(document.querySelectorAll("div.item[data-listingPk]"))) {
      const virId = el.getAttribute("data-listingPk");
      const povezava = el.querySelector("h6.list-title a, a.list-thumb") as HTMLAnchorElement | null;
      if (!virId || !povezava) continue;

      const meta = Array.from(el.querySelectorAll("div.list-meta a")).map((a) =>
        (a as HTMLElement).innerText.replace(/\s+/g, " ").trim()
      );
      const vrstice = Array.from(el.querySelectorAll("p.list-text.mb0 span")).map((s) =>
        (s as HTMLElement).innerText.trim()
      );

      kartice.push({
        url: povezava.href,
        virId,
        lokacija: (el.querySelector("div.address-text p.list-text") as HTMLElement | null)?.innerText?.trim() ?? null,
        naslovVrstica: (el.querySelector("h6.list-title a") as HTMLElement | null)?.innerText?.trim() ?? null,
        // Kartica nima opisa; nadomestek je vrstica s tipom in sobnostjo
        // ("Stanovanje, 2,5-sobno") in meta vrstice s površino.
        opis: [...vrstice, ...meta].join(" · ") || null,
        cenaBesedilo: (el.querySelector("div.list-price") as HTMLElement | null)?.innerText?.trim() ?? null,
        telefon: null,
        agencija:
          (el.querySelector(".listing-card__agent-section .listing-team-name") as HTMLElement | null)?.innerText?.trim() ??
          null,
        slika: (el.querySelector("a.list-thumb img") as HTMLImageElement | null)?.src ?? null,
        stSlik: null,
      });
    }

    // "Prikazanih 1-30 od 498 oglasov" pri 30 na stran; števila strani v
    // navigaciji ni vedno vse, zato ga raje izračunamo iz skupnega števila.
    const povzetek = (document.querySelector("p.pagination_page_count") as HTMLElement | null)?.innerText ?? "";
    const skupaj = Number((povzetek.match(/od\s+([\d.]+)/)?.[1] ?? "").replace(/\./g, ""));
    const zadnjaStran = Number.isFinite(skupaj) && skupaj > 0 ? Math.ceil(skupaj / 30) : null;
    return { kartice, zadnjaStran };
  }) as Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null }>;
}

function normaliziraj(r: SurovaKartica, rezina: SiolRezina): NormaliziranOglas {
  const opis = r.opis ?? "";
  const iz = izOpisa(opis);
  // "87,40 m²" iz meta vrstic; izOpisa lovi tudi "m2", tu pa je vedno "m²".
  const povrsina =
    iz.povrsinaM2 ??
    (() => {
      const m = opis.match(/([\d.]+(?:,\d+)?)\s*m²/);
      if (!m) return null;
      const n = Number(m[1].replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) && n > 1 ? n : null;
    })();
  // "Stanovanje, 2,5-sobno" -> podtip "2,5-sobno"
  const podtip = opis.match(/,\s*([\d,.]+-sobno|garsonjera|dvojček|vrstna|samostojna)/i)?.[1]?.toLowerCase() ?? null;

  return {
    vir: VIR,
    virId: r.virId,
    url: r.url,
    naslov: r.naslovVrstica,
    tip: rezina.tip,
    podtip,
    posel: rezina.posel,
    regija: null, // seznam pove kraj, regijo dobimo iz šifranta krajev
    kraj: r.lokacija?.split(",")[0]?.trim() || null,
    cenaEur: r.cenaBesedilo ? cenaIz(r.cenaBesedilo) : null,
    povrsinaM2: povrsina,
    zemljisceM2: iz.zemljisceM2,
    letoIzgradnje: iz.letoIzgradnje,
    letoAdaptacije: iz.letoAdaptacije,
    nadstropje: iz.nadstropje,
    vecEnot: iz.vecEnot,
    stEnot: iz.stEnot,
    stEnotOcena: iz.stEnotOcena,
    loceneKuhinje: iz.loceneKuhinje,
    looceniVhodi: iz.looceniVhodi,
    zaObnovo: iz.zaObnovo,
    zaInvesticijo: iz.zaInvesticijo,
    opis: opis || null,
    prodajalec: r.agencija ? "agencija" : null,
    agencija: r.agencija,
    telefon: null,
    slikaUrl: r.slika,
    stSlik: null,
    raw: r as unknown as Record<string, unknown>,
  };
}

/** Kar brskalnik vrne z detajlne strani — brez logike, ta teče v Node. */
export type SurovDetajlSiol = {
  pari: string[];
  meta: string[];
  slike: string[];
  stMedijev: string | null;
  opis: string | null;
  cena: string | null;
};

export function detajlIzSurovegaSiol(s: SurovDetajlSiol): Detajl {
  const lastnosti: Record<string, string> = {};
  for (let i = 0; i + 1 < s.pari.length; i += 2) {
    const kljuc = s.pari[i].trim();
    if (kljuc) lastnosti[kljuc] = s.pari[i + 1].trim();
  }

  const najdi = (...kljuci: string[]): string | null => {
    for (const k of kljuci) {
      for (const [ime, vrednost] of Object.entries(lastnosti)) {
        if (ime.toLowerCase().includes(k.toLowerCase())) return vrednost;
      }
    }
    return null;
  };
  const stevilka = (...kljuci: string[]): number | null => {
    const v = najdi(...kljuci);
    const m = v?.match(/(\d[\d.]*(?:,\d+)?)/);
    if (!m) return null;
    const n = Number(m[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  // "Nadstropje: 1/2" je etaža/etažnost v enem zapisu.
  const nadstropje = najdi("Nadstropje");
  const [etaza, etaznost] = (nadstropje ?? "").split("/").map((x) => x.trim());
  const objava = s.meta.find((m) => /\d{1,2}\.\s*[a-zžčš]+\s*\d{4}/i.test(m)) ?? null;
  const slike = [...new Set(s.slike)];

  return {
    povrsinaM2: stevilka("Velikost", "Površina"),
    zemljisceM2: stevilka("Parcela", "Zemljišče"),
    // Blok "Lokacija" na detajlni strani je natančnejši od kartice, ki pri
    // delu oglasov navede samo regijo ("Podravska") namesto kraja.
    kraj: najdi("Naselje") ?? najdi("Področje"),
    stSob: stevilka("Število sob"),
    stSpalnic: stevilka("Število spalnic"),
    stKopalnic: stevilka("Število kopalnic"),
    letoIzgradnje: stevilka("Leto izgradnje", "Leto gradnje"),
    letoAdaptacije: stevilka("Obnove", "Adaptacija"),
    nadstropje: etaza || null,
    etaznost: etaznost || null,
    parkirno: najdi("parkirnih mest", "Parkir"),
    energetskiRazred: najdi("Energetski razred", "Energetska"),
    ogrevanje: najdi("Ogrevanje"),
    stanje: najdi("Stanje"),
    lastnistvo: najdi("Lastništvo"),
    datumObjave: datumIzSlovenskega(objava),
    sifraOglasa: s.meta.find((m) => /^[A-Z]{2}\d{3,}/.test(m)) ?? null,
    opis: s.opis || null,
    cenaEur: s.cena ? cenaIz(s.cena) : null,
    slikeUrls: slike.length > 0 ? slike : null,
    lastnosti,
  };
}

export async function preberiDetajl(page: Page): Promise<Detajl> {
  const surovo = (await page.evaluate(() => ({
    // Tabela "Podrobnosti": vsak par je oznaka + vrednost v svoji vrstici.
    // Namenoma NE beremo bloka "Oprema in ostalo" — to ni oprema oglasa,
    // ampak stranska vrstica iskalnega obrazca s 47 možnostmi, ki bi jo
    // dobili pri vsakem oglasu enako.
    pari: Array.from(document.querySelectorAll("p.col-6.fw600, p.col-6.text")).map((p) =>
      (p as HTMLElement).innerText.replace(/\s+/g, " ").trim()
    ),
    meta: Array.from(document.querySelectorAll("div.pd-meta a, div.property-meta a")).map((a) =>
      (a as HTMLElement).innerText.replace(/\s+/g, " ").trim()
    ),
    slike: Array.from(document.querySelectorAll("div.sp-img-content a.sp-img"))
      .map((a) => (a as HTMLAnchorElement).href ?? "")
      .filter((u) => u.length > 0),
    stMedijev: document.querySelector("[class*='listing-image-preview-']")?.className ?? null,
    opis: (document.querySelector("#description, .property-desc, [class*='desc']") as HTMLElement | null)?.innerText?.trim() ?? null,
    cena: (document.querySelector("h3.price") as HTMLElement | null)?.innerText?.trim() ?? null,
  }))) as SurovDetajlSiol;
  return detajlIzSurovegaSiol(surovo);
}

export const adapter: VirAdapter = {
  vir: VIR,
  // Crawl-delay ni naveden; 6 s je naša privzeta vljudnost.
  omejitve: { zamikMs: 6000 },
  pricakovanRazpon: [200, 20000],
  slikePolitika: "referenca",
  svezKontekstNaStran: false,
  crawlDelayS: 0,
  pravno:
    "Splošni pogoji, razdelek 8: prepovedano je meta-iskanje in »uporaba avtomatskih poizvedb ali drugih robotov«; izjema velja SAMO za splošne spletne iskalnike, vertikalni so izvzeti. Prepovedano je tudi kopiranje vsebine oglasov in vključevanje v drugo storitev. Zato je vir privzeto IZKLOPLJEN — vklopi ga lahko samo človek. robots.txt prepoveduje /userarea/, /accounts/, /api/v1/userarea/, /listing-mortgage-inquiry/ — teh ne odpiramo nikoli.",
  najvecStrani: 120,
  hlajenjeUr: 6,
  detajli: { zamikMs: 6000, kvota: 150, preberi: preberiDetajl },
  rezine: vseRezine,
  seznamUrl: (r, stran) => seznamUrl(r as SiolRezina, stran),
  preberiSeznam,
  normaliziraj: (k, r) => normaliziraj(k, r as SiolRezina),
};
