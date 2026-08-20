import type { Page } from "playwright";
import { cenaIz, izOpisa } from "../parse.js";
import type { NormaliziranOglas } from "../db.js";
import type { Detajl, Rezina as BazniRezina, SurovaKartica, VirAdapter } from "./vmesnik.js";

/**
 * Adapter za oglasi.svet24.si (Salomonov oglasnik), kategorija nepremičnine.
 *
 * Najcenejši vir po številu zahtevkov, kar jih poznamo: seznam podpira
 * `?onPage=100`, zato je cel obhod nekaj deset strani namesto nekaj sto.
 *
 * robots.txt (preverjeno 20. 8. 2026) prepoveduje samo `/admin`, `/oddaja`
 * (vnos oglasa) in `/moj-salomon` (uporabniški račun) — teh ne odpiramo.
 * Crawl-delay ni določen; uporabimo 8 s.
 *
 * Pogoji uporabe scrapinga ne omenjajo, prepovedujejo pa "prepisovati, ponovno
 * objavljati in razširjati" vsebino brez pisnega dovoljenja. Ker to ni
 * enoznačno dovoljenje, je vir tako kot vsi novi privzeto IZKLOPLJEN.
 *
 * Dve pasti tega vira, obe upoštevani spodaj:
 *  - med oglasi so tudi POVPRAŠEVANJA ("Kupim", "Najamem"); ločimo jih že z
 *    URL parametrom advertType, tako da v bazo sploh ne pridejo,
 *  - baza vsebuje precej zelo starih oglasov (slike iz 2016–2018), zato je
 *    datum objave z detajlne strani tu pomembnejši kot pri drugih virih.
 */

export const VIR = "oglasi.svet24.si";

type SalomonRezina = BazniRezina & { pot: string; posel: "prodaja" | "oddaja"; tip: string };

const KATEGORIJE: { pot: string; tip: string }[] = [
  { pot: "stanovanje", tip: "stanovanje" },
  { pot: "hisa", tip: "hisa" },
  { pot: "poslovni-prostor", tip: "poslovni_prostor" },
  { pot: "garaza-parkirno-mesto", tip: "garaza" },
  { pot: "pocitniski-objekti", tip: "pocitniski_objekt" },
  { pot: "stavbno-zemljisce-parcela", tip: "posest" },
  { pot: "kmetijska-zemljisca", tip: "posest" },
  { pot: "kmetije", tip: "posest" },
];

/** Koliko oglasov zahtevamo na stran. Vir podpira 25/50/100. */
const NA_STRAN = 100;

function vseRezine(): SalomonRezina[] {
  const out: SalomonRezina[] = [];
  for (const k of KATEGORIJE) {
    out.push({ oznaka: `prodaja/${k.tip}/${k.pot}`, pot: k.pot, posel: "prodaja", tip: k.tip });
    out.push({ oznaka: `oddaja/${k.tip}/${k.pot}`, pot: k.pot, posel: "oddaja", tip: k.tip });
  }
  return out;
}

function seznamUrl(r: SalomonRezina, stran: number): string {
  // advertType 1 = Prodam, 3 = Oddam. Povpraševanj (2 = Kupim, 4 = Najamem)
  // namenoma ne zajemamo — to ni ponudba in bi popačilo vsako statistiko.
  const q = new URLSearchParams({
    advertType: r.posel === "prodaja" ? "1" : "3",
    onPage: String(NA_STRAN),
  });
  if (stran > 1) q.set("page", String(stran));
  return `https://oglasi.svet24.si/oglasi/nepremicnine/${r.pot}?${q.toString()}`;
}

async function preberiSeznam(page: Page): Promise<{
  kartice: SurovaKartica[];
  zadnjaStran: number | null;
  skupajZadetkov: number | null;
}> {
  return page.evaluate(
    (naStran: number) => {
      const kartice: SurovaKartica[] = [];
      for (const el of Array.from(document.querySelectorAll("#advertList article"))) {
        const slikaPovezava = el.querySelector("a.img") as HTMLAnchorElement | null;
        const naslovPovezava = el.querySelector(".title h4 a") as HTMLAnchorElement | null;
        const povezava = naslovPovezava ?? slikaPovezava;
        if (!povezava || !slikaPovezava) continue; // pasice nimajo slike-povezave

        const url = povezava.href;
        // "/oglas/nepremicnine/stanovanje/nekaj-slug/26.DRA4A"
        const virId = url.match(/\/(\d{2}\.[A-Z0-9]{4,6})\/?$/)?.[1];
        if (!virId) continue;

        const oznaka = (el.querySelector("span.label") as HTMLElement | null)?.innerText?.trim() ?? "";
        // Varovalka, če bi filter advertType kdaj odpovedal: povpraševanje ni ponudba.
        if (/kupim|najamem/i.test(oznaka)) continue;

        const cenaEl = el.querySelector("div.price") as HTMLElement | null;
        const staraCena = (cenaEl?.querySelector("span.oldPrice") as HTMLElement | null)?.innerText?.trim() ?? null;
        // innerText vsebuje tudi staro ceno; odstranimo jo, da ostane veljavna.
        const cena = cenaEl ? cenaEl.innerText.replace(staraCena ?? "", "").replace(/\s+/g, " ").trim() : null;

        kartice.push({
          url,
          virId,
          lokacija: null, // lokacija je zlita v opis; izlušči se ob normalizaciji
          naslovVrstica: naslovPovezava?.innerText?.trim() ?? null,
          opis: (el.querySelector("div.desc") as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim() ?? null,
          cenaBesedilo: cena && /\d/.test(cena) ? cena : null,
          telefon: null,
          agencija: null,
          slika: (slikaPovezava.querySelector("img") as HTMLImageElement | null)?.src ?? null,
          stSlik: null,
        });
      }

      // Navigacija pokaže samo deset oštevilčenih strani, zato zadnjo stran
      // izračunamo iz skupnega števila zadetkov.
      const besedilo = document.body.innerText;
      const najdenih = Number((besedilo.match(/Najdenih oglasov[:\s]*([\d.]+)/i)?.[1] ?? "").replace(/\./g, ""));
      const veljavno = Number.isFinite(najdenih);
      const zadnjaStran = veljavno && najdenih > 0 ? Math.ceil(najdenih / naStran) : null;
      return { kartice, zadnjaStran, skupajZadetkov: veljavno ? najdenih : null };
    },
    NA_STRAN
  ) as Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null }>;
}

/** "Lokacija: Ljubljana" ali prvi del opisa do vejice — brez ugibanja. */
export function krajIzOpisa(opis: string | null): string | null {
  const m = opis?.match(/Lokacija:\s*([^,|]{2,40})/i);
  return m ? m[1].trim() : null;
}

function normaliziraj(r: SurovaKartica, rezina: SalomonRezina): NormaliziranOglas {
  const opis = r.opis ?? "";
  const iz = izOpisa(`${r.naslovVrstica ?? ""} ${opis}`);
  return {
    vir: VIR,
    virId: r.virId,
    url: r.url,
    naslov: r.naslovVrstica,
    tip: rezina.tip,
    podtip: null,
    posel: rezina.posel,
    regija: null,
    kraj: krajIzOpisa(opis),
    cenaEur: r.cenaBesedilo ? cenaIz(r.cenaBesedilo) : null,
    povrsinaM2: iz.povrsinaM2,
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
    prodajalec: null,
    agencija: null,
    telefon: null,
    slikaUrl: r.slika,
    stSlik: null,
    raw: r as unknown as Record<string, unknown>,
  };
}

/** Kar brskalnik vrne z detajlne strani; razčlenitev teče v Node. */
export type SurovDetajlSalomon = {
  /**
   * Tabela atributov po vrsticah. Salomon postavi DVA ključa v eno vrstico
   * (`th`) in njuni vrednosti v NASLEDNJO vrstico (`td`), zato zaporedno
   * branje celic pare zamakne: "Država | Slovenija | Površina | 84 m2" je bilo
   * prebrano kot ključa "Država"→"Slovenija" in "Površina"→"84 m2" samo na
   * videz — v resnici je vsak drugi element postal ključ. Vrstice zato ostanejo
   * ločene in se sparijo po stolpcih.
   */
  vrstice: { glava: boolean; celice: string[] }[];
  slike: string[];
  opis: string | null;
  cena: string | null;
  sifra: string | null;
  objava: string | null;
  telefon: string | null;
  prodajalec: string | null;
};

export function detajlIzSurovegaSalomon(s: SurovDetajlSalomon): Detajl {
  const lastnosti: Record<string, string> = {};
  // Vrstica z glavo nosi ključe, naslednja vrstica njihove vrednosti — parimo
  // po stolpcih, ne zaporedno.
  for (let i = 0; i < s.vrstice.length; i++) {
    const glava = s.vrstice[i];
    const vrednosti = s.vrstice[i + 1];
    if (!glava.glava || !vrednosti || vrednosti.glava) continue;
    for (let stolpec = 0; stolpec < glava.celice.length; stolpec++) {
      const kljuc = glava.celice[stolpec]?.trim();
      const vrednost = vrednosti.celice[stolpec]?.trim();
      if (kljuc && vrednost) lastnosti[kljuc] = vrednost;
    }
    i++; // vrstica z vrednostmi je porabljena
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
  const kraj = [najdi("Naselje"), najdi("Občina")].find((v) => v && v.length > 1) ?? null;
  const slike = [...new Set(s.slike)];

  return {
    povrsinaM2: stevilka("Površina"),
    zemljisceM2: stevilka("Velikost parcele", "Parcela"),
    letoIzgradnje: stevilka("Letnik izgradnje", "Leto izgradnje"),
    nadstropje: najdi("V nadstropju", "Nadstropje"),
    parkirno: najdi("Parkirna mesta", "Parkir"),
    energetskiRazred: najdi("Energijski razred", "Energetski razred"),
    ogrevanje: najdi("Ogrevanje"),
    opremljenost: najdi("Opremljenost", "Opremljeno"),
    stanje: najdi("Stanje"),
    balkon: najdi("Balkon") ? true : null,
    terasa: najdi("Terasa") ? true : null,
    vrt: najdi("Atrij", "Vrt") ? true : null,
    kraj,
    sifraOglasa: s.sifra,
    // datetime atribut je že ISO ("2026-08-12T08:11:20+02:00").
    datumObjave: s.objava ? s.objava.slice(0, 10) : null,
    telefon: s.telefon,
    posrednik: s.prodajalec,
    opis: s.opis || null,
    cenaEur: s.cena ? cenaIz(s.cena) : null,
    slikeUrls: slike.length > 0 ? slike : null,
    lastnosti,
  };
}

export async function preberiDetajl(page: Page): Promise<Detajl> {
  const surovo = (await page.evaluate(() => ({
    // Vrstice ostanejo ločene; parjenje po stolpcih naredi Node.
    vrstice: Array.from(document.querySelectorAll("#advAttr table tr")).map((tr) => ({
      glava: tr.querySelectorAll("th").length > 0,
      celice: Array.from(tr.querySelectorAll("th, td")).map((c) =>
        (c as HTMLElement).innerText.replace(/\s+/g, " ").trim()
      ),
    })),
    slike: Array.from(document.querySelectorAll("#advGallery .thumbsList a"))
      .map((a) => (a as HTMLAnchorElement).href ?? "")
      .filter((u) => u.length > 0),
    opis: (document.querySelector("#advDesc article.desc, #advDesc .tab.desc") as HTMLElement | null)?.innerText?.trim() ?? null,
    cena: (document.querySelector('[itemprop="price"]') as HTMLElement | null)?.innerText?.trim() ?? null,
    sifra: (document.querySelector('[itemprop="productID"]') as HTMLElement | null)?.innerText?.trim() ?? null,
    objava: document.querySelector("footer time[datetime]")?.getAttribute("datetime") ?? null,
    telefon:
      (document.querySelector('#advSeller a[href^="tel:"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? null,
    prodajalec: (document.querySelector("#advSeller a.name") as HTMLElement | null)?.innerText?.trim() ?? null,
  }))) as SurovDetajlSalomon;
  return detajlIzSurovegaSalomon(surovo);
}

export const adapter: VirAdapter = {
  vir: VIR,
  omejitve: { zamikMs: 8000 },
  // Vir je majhen: izmerjenih ~1.170 uporabnih oglasov v vseh kategorijah.
  pricakovanRazpon: [200, 5000],
  slikePolitika: "referenca",
  svezKontekstNaStran: false,
  crawlDelayS: 0,
  pravno:
    "Pogoji uporabe scrapinga ne omenjajo, prepovedujejo pa vsebino »prepisovati, ponovno objavljati in razširjati« brez pisnega dovoljenja družbe Salomon d.o.o. robots.txt prepoveduje /admin, /oddaja in /moj-salomon — teh ne odpiramo. Ker dovoljenje ni izrecno, je vir privzeto IZKLOPLJEN.",
  hlajenjeUr: 6,
  detajli: { zamikMs: 8000, kvota: 120, preberi: preberiDetajl },
  rezine: vseRezine,
  seznamUrl: (r, stran) => seznamUrl(r as SalomonRezina, stran),
  preberiSeznam,
  normaliziraj: (k, r) => normaliziraj(k, r as SalomonRezina),
};
