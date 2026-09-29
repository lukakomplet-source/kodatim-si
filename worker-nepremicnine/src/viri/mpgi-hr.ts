import type { NormaliziranOglas } from "../db.js";
import type { Rezina, SurovaKartica, VirAdapter } from "./vmesnik.js";
import { brezEntitet, goloBesedilo, prenesi } from "./http.js";

/**
 * mpgi.gov.hr — hrvaško Ministrstvo za prostor, gradnjo in državno imovino:
 * NATEČAJI ZA PRODAJO (in zakup) DRŽAVNIH NEPREMIČNIN.
 *
 * Zakaj ta vir, čeprav je majhen: tu država objavi prodajo PRVA — ministrstvo
 * ali županija je prodajalec, posrednika ni, in oglas se tu pojavi, preden ga
 * kdo prepiše. Obseg je skromen (29. 9. 2026: 10 odprtih natečajev, 3–5 novih
 * na mesec), večinoma zemljišča v celinskih županijah. Hotelov med njimi
 * nismo videli; nacionalni poziv 2/26 (Kumrovec, 50.688 m², turistična cona
 * T1 s stavbo) je edini, ki bi utegnil zanimati iskalca nastanitev.
 *
 * Pravna presoja (28.–29. 9. 2026, presoja + dva neodvisna skeptika):
 *   - robots.txt NE OBSTAJA (HTTP 404 s stranjo napake, ne 5xx). Po RFC 9309
 *     to pomeni, da pravil ni: ne prepovedanih poti ne Crawl-delay.
 *   - Uvjeti korištenja (/uvjeti-koristenja/76, prebrani v celoti) o robotih,
 *     zajemu in zbirkah ne pravijo nič; izrecno pa dovolijo prenos vsebine
 *     "bez posebne dozvole uz navođenje izvora". Ministrstvo po ZPPI in
 *     pravilniku NN 67/17 daje informacije z odprto dovoljenko (tudi za
 *     komercialno rabo) — edini pogoj je navedba vira.
 *   - POGOJ 1: vsak prikazan zapis nosi "Izvor: Ministarstvo …, mpgi.gov.hr"
 *     in povezavo nazaj. Zato je navedba v opisu IN v polju agencija — kjer
 *     koli se oglas pokaže, se pokaže z virom.
 *   - POGOJ 2: dovoljenje NE velja za vsebino, "prenesen iz drugog izvora".
 *     Pozivi županij in mest (s ceno, varščino, parcelo) so na njihovih
 *     domenah (npr. www.pgz.hr, www2.pgz.hr/…/jp.docx) z lastnimi pogoji, ki
 *     jih nihče ni preveril. Teh povezav NE sledimo in njihovih dokumentov ne
 *     kopiramo. Vsaka taka domena rabi svojo presojo, preden bi brali ceno.
 *   - Pogoji se lahko spremenijo brez najave — ob vsakem ponovnem vklopu vira
 *     jih je treba znova prebrati.
 *
 * Tehnično: uradni vir RSS 2.0 "Natječaji državna imovina", povezan iz glave
 * spletišča (/rss-8447/8447) — namenjen strojnemu branju, ne notranja pot.
 * Ena stran brez oštevilčenja; vsebuje SAMO trenutno odprte natečaje, zato je
 * en zahtevek cel katalog. Vir sam pravi <ttl>30</ttl>, a natečaj traja
 * tedne: en obisk na dan je več kot dovolj.
 *
 * Česar RSS nima in česar zato NE izmišljujemo: cene, površine, vrste
 * nepremičnine, slik. Rok (description) je prosto besedilo in je lahko
 * relativen ("30 (trideset) dana od dana objave poziva …").
 */

const VIR = "mpgi.gov.hr";
const OSNOVA = "https://mpgi.gov.hr";
const RSS = `${OSNOVA}/rss.aspx?ID=13546`;

/** Navedba vira, kakor jo zahtevajo pogoji — dobesedno, ne povzeto. */
export const NAVEDBA_VIRA =
  "Izvor: Ministarstvo prostornoga uređenja, graditeljstva i državne imovine, mpgi.gov.hr";
const AGENCIJA = "Ministarstvo prostornoga uređenja, graditeljstva i državne imovine (mpgi.gov.hr)";

/** Ena postavka RSS, razčlenjena — v bazo gre samo prek raw. */
type Postavka = {
  naslov: string;
  povezava: string;
  guid: string | null;
  opisRss: string | null;
  /** Rok za ponudbe, kakor ga vir napiše (brez predpone "ROK ZA PODNOŠENJE PONUDA:"). */
  rok: string | null;
  /** Rok kot datum, SAMO kadar je zapisan kot datum — relativnega ne preračunavamo. */
  rokIso: string | null;
  objavljeno: string | null;
  objavljenoIso: string | null;
  posel: "prodaja" | "oddaja";
  /** "Primorsko-goranska županija", "Grad Čakovec"; null pri nacionalnem pozivu. */
  obmocje: string | null;
  vrstaObmocja: "zupanija" | "grad" | "opcina" | "drzava" | null;
  /** Številka nacionalnega poziva ("2/26"). */
  stevilkaPoziva: string | null;
  tip: string | null;
  /** "naslov" = vrsta prebrana iz naslova; "neznano" = naslov je ne pove (tip ostane prazen). */
  tipIzvor: "naslov" | "neznano";
};

const REZINE: Rezina[] = [{ oznaka: "natjecaji-nekretnine" }];

/** Oštevilčenja ni: vsaka "stran" je isti vir, glavna zanka pa se ustavi po prvi (zadnjaStran = 1). */
function seznamUrl(): string {
  return RSS;
}

async function preberiHttp(
  _r: Rezina,
  stran: number,
  ua: string
): Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov?: number | null }> {
  return karticeIzHtml(await prenesi(RSS, ua, { jezik: "hr-HR,hr;q=0.9,en;q=0.6" }), stran);
}

/** Vsebina oznake: CDATA dobesedno (lahko je HTML), sicer XML z entitetami. */
function polje(xml: string, oznaka: string): string | null {
  const m = xml.match(new RegExp(`<${oznaka}(?:\\s[^>]*)?>([\\s\\S]*?)</${oznaka}>`, "i"));
  if (!m) return null;
  const v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  const besedilo = goloBesedilo(cdata ? cdata[1] : brezEntitet(v));
  return besedilo || null;
}

const MESECI: Record<string, number> = {
  siječnja: 1, sijecnja: 1, veljače: 2, veljace: 2, ožujka: 3, ozujka: 3, travnja: 4,
  svibnja: 5, lipnja: 6, srpnja: 7, kolovoza: 8, rujna: 9, listopada: 10,
  studenoga: 11, studenog: 11, prosinca: 12,
};

/** "27. listopada 2026." ali "27.10.2026." -> "2026-10-27". Relativni rok ostane null. */
function datumIz(besedilo: string): string | null {
  const iso = (d: number, m: number, l: number) =>
    d >= 1 && d <= 31 && m >= 1 && m <= 12 ? `${l}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
  const b = besedilo.match(/(\d{1,2})\.\s*([a-zčćđšž]+)\s+(\d{4})/i);
  if (b && MESECI[b[2].toLowerCase()]) return iso(Number(b[1]), MESECI[b[2].toLowerCase()], Number(b[3]));
  const s = besedilo.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  return s ? iso(Number(s[1]), Number(s[2]), Number(s[3])) : null;
}

/**
 * Vrsta iz naslova — SAMO kadar jo naslov pove. Današnji naslovi je ne povedo
 * ("Kupnja nekretnina u vlasništvu RH - Grad Čakovec"), zato velja privzeto
 * "posest": natečaji ministrstva so pretežno zemljišča (edini odprti vzorec je
 * bila parcela 732 m², nacionalni 2/26 je 50.688 m² zemljišča s stavbo).
 * Privzetek je označen v raw (tipIzvor), da ga je mogoče ločiti od trditve.
 */
function tipIzNaslova(t: string): { tip: string | null; tipIzvor: "naslov" | "neznano" } {
  const s = t.toLowerCase();
  if (/\bstan(?:a|ova|ovi)?\b|stambenog?\s+prostor/.test(s)) return { tip: "stanovanje", tipIzvor: "naslov" };
  if (/\bkuć[aeiu]\b|obiteljsk\w*\s+kuć/.test(s)) return { tip: "hisa", tipIzvor: "naslov" };
  if (/poslovn\w*\s+(?:prostor|zgrad|objekt)/.test(s)) return { tip: "poslovni_prostor", tipIzvor: "naslov" };
  if (/garaž|parkirn\w*\s+mjest/.test(s)) return { tip: "garaza", tipIzvor: "naslov" };
  if (/zemljišt|parcel|oranic|livad|šum[aeu]\b/.test(s)) return { tip: "posest", tipIzvor: "naslov" };
  // Vir vrste ne pove — prazno polje je poštenejše od izmišljenega (recenzija
  // 29. 9. 2026: vseh 10 razpisov bi sicer v konzoli veljalo za zemljišča).
  return { tip: null, tipIzvor: "neznano" };
}

/**
 * Naslov: "<Kupnja|Zakup> nekretnina u vlasništvu Republike Hrvatske - <območje>"
 * ali nacionalni "… Republike Hrvatske 2/26". Kupnja = država prodaja (poziv
 * kupcem), Zakup = oddaja. Drugačna predpona (npr. obvestilo o razveljavitvi)
 * ni ponudba nepremičnine — vrne null in postavka se preskoči.
 */
function izNaslova(naslov: string): Pick<Postavka, "posel" | "obmocje" | "vrstaObmocja" | "stevilkaPoziva"> | null {
  const p = naslov.match(/^\s*(kupnja|prodaja|zakup|najam)\b/i);
  if (!p) return null;
  const posel = /^(zakup|najam)$/i.test(p[1]) ? "oddaja" : "prodaja";
  const obmocje = naslov.match(/\s[-–]\s+(.+)$/)?.[1]?.trim() ?? null;
  const stevilkaPoziva = obmocje ? null : naslov.match(/\b(\d{1,3}\/\d{2,4})\s*$/)?.[1] ?? null;
  const vrstaObmocja = !obmocje
    ? "drzava"
    : /županij/i.test(obmocje)
      ? "zupanija"
      : /^grad\s/i.test(obmocje)
        ? "grad"
        : /^općin/i.test(obmocje)
          ? "opcina"
          : null;
  return { posel, obmocje, vrstaObmocja, stevilkaPoziva };
}

/** Čisto razčlenjevanje vira RSS — brez omrežja, zato ga je mogoče preizkusiti na shranjeni datoteki. */
export function karticeIzHtml(
  xml: string,
  stran: number
): { kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null } {
  // Stran napake ali vzdrževanja s statusom 200 ni "prazen vir" — brez tega bi
  // jo glavna zanka brala kot mehko blokado in viru po krivem zapisala hlajenje.
  if (!/<rss[\s>]/i.test(xml) || !/<channel[\s>]/i.test(xml)) {
    throw new Error("mpgi.gov.hr: odgovor ni vir RSS (ni <rss>/<channel>) — spremenjena struktura?");
  }
  const postavke = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);

  const kartice: SurovaKartica[] = [];
  const videni = new Set<string>();
  for (const x of postavke) {
    const naslov = polje(x, "title");
    const povezavaSurova = polje(x, "link") ?? polje(x, "guid");
    if (!naslov || !povezavaSurova) continue;
    const izN = izNaslova(naslov);
    if (!izN) continue;
    const povezava = povezavaSurova.startsWith("http") ? povezavaSurova : `${OSNOVA}${povezavaSurova}`;
    const guid = polje(x, "guid");
    // Stabilna identiteta je končni /<id> povezave; slug pred njim se ob
    // popravku naslova spremeni.
    const id = povezava.match(/\/(\d+)\/?$/)?.[1] ?? guid ?? povezava;
    if (videni.has(id)) continue;
    videni.add(id);

    const opisRss = polje(x, "description");
    const rok = opisRss?.replace(/^\s*rok\s+za\s+podnošenje\s+ponuda\s*:\s*/i, "").trim() || null;
    const objavljeno = polje(x, "pubDate");
    const objDatum = objavljeno ? new Date(objavljeno) : null;
    const objavljenoIso = objDatum && !Number.isNaN(objDatum.getTime()) ? objDatum.toISOString() : null;
    const { tip, tipIzvor } = tipIzNaslova(naslov);

    const postavka: Postavka = {
      naslov,
      povezava,
      guid,
      opisRss,
      rok,
      rokIso: rok ? datumIz(rok) : null,
      objavljeno,
      objavljenoIso,
      ...izN,
      tip,
      tipIzvor,
    };

    kartice.push({
      url: povezava,
      virId: id,
      lokacija: izN.obmocje ? `${izN.obmocje}, Hrvaška` : "Hrvaška (nacionalni natečaj)",
      naslovVrstica: naslov,
      // Kartica ima samo naslov in rok; dodamo, kar je iz njiju gotovo, in
      // navedbo vira, ki jo pogoji zahtevajo pri vsakem prikazu.
      opis: [
        naslov,
        izN.posel === "prodaja"
          ? "javni natečaj za prodajo državne nepremičnine (prodajalec: Republika Hrvatska)"
          : "javni natečaj za zakup državne nepremičnine (Republika Hrvatska)",
        opisRss,
        objavljenoIso ? `objavljeno ${objavljenoIso.slice(0, 10)}` : null,
        "cena in predmet sta v pozivu, povezanem z izvirno stranjo",
        NAVEDBA_VIRA,
      ]
        .filter((s): s is string => Boolean(s))
        // Rok v RSS se konča s piko ("… do 12:00 sati.") — brez tega "sati.. objavljeno".
        .map((s) => s.replace(/[.\s]+$/, ""))
        .join(". "),
      // RSS cene nima; cena je v pozivu, ki je pri županijah na tuji domeni.
      cenaBesedilo: null,
      telefon: null,
      agencija: AGENCIJA,
      slika: null, // RSS slik nima; priloženih dokumentov in fotografij ne kopiramo
      stSlik: null,
      surovo: postavka as unknown as Record<string, unknown>,
    });
  }

  // Vir pove sam, koliko postavk ima: 0 pri veljavnem RSS pomeni "ni odprtih
  // natečajev" in ne blokade.
  return { kartice, zadnjaStran: Math.max(1, stran), skupajZadetkov: postavke.length };
}

export function normaliziraj(k: SurovaKartica, r: Rezina): NormaliziranOglas {
  const p = (k.surovo ?? {}) as Partial<Postavka>;
  // Kraj je naselje: "Grad Čakovec" -> Čakovec, "Općina Malinska" -> Malinska.
  // Županija ni naselje, zato ostane v lokaciji in opisu, kraj pa prazen.
  const kraj =
    p.vrstaObmocja === "grad" || p.vrstaObmocja === "opcina"
      ? (p.obmocje ?? "").replace(/^(grad|općina)\s+/i, "").trim() || null
      : null;
  return {
    vir: VIR,
    virId: k.virId,
    url: k.url,
    naslov: k.naslovVrstica,
    tip: p.tip ?? null,
    podtip: null,
    posel: p.posel ?? "prodaja",
    regija: null, // hrvaška županija ni slovenska statistična regija
    kraj,
    cenaEur: null,
    povrsinaM2: null,
    zemljisceM2: null,
    letoIzgradnje: null,
    letoAdaptacije: null,
    nadstropje: null,
    vecEnot: false,
    stEnot: null,
    stEnotOcena: null,
    loceneKuhinje: null,
    looceniVhodi: null,
    zaObnovo: false,
    zaInvesticijo: false,
    opis: k.opis,
    prodajalec: null,
    agencija: k.agencija,
    telefon: null,
    slikaUrl: null,
    stSlik: null,
    raw: { postavka: p, rezina: r.oznaka, navedbaVira: NAVEDBA_VIRA },
  };
}

export const adapter: VirAdapter = {
  vir: VIR,
  // robots.txt ne obstaja, Crawl-delay torej ni naveden; 8 s je naš privzeti
  // razmik za tuje vire (pri enem zahtevku na dan velja bolj za načelo).
  omejitve: { zamikMs: 8_000 },
  crawlDelayS: null,
  // Vir RSS nima oštevilčenja in nosi le odprte natečaje (29. 9. 2026: 10).
  // 0 pomeni pokvarjeno branje; čez 60 je vir začel vračati kaj drugega.
  pricakovanRazpon: [1, 60],
  slikePolitika: "referenca",
  dovoljenArhivSlik: false,
  svezKontekstNaStran: false,
  // Cel katalog je en zahtevek. Presoja: "one fetch a day is enough" —
  // zato en obisk na krog in en na dan; drugi krog dneva vir preskoči.
  najvecStrani: 1,
  najvecStraniNaRezino: 1,
  dnevnaMejaStrani: 1,
  dnevniProracunVira: 2,
  // Seznam JE razvrščen od najnovejšega (pubDate 25. 9. -> 12. 6.), a pri eni
  // strani inkrementalni prelet nič ne prihrani; pri proračunu 1 bi celo
  // porabil edini zahtevek v delu A, rotacija se ne bi nikoli sklenila in
  // zaprti natečaji ne bi bili nikoli označeni kot izginuli.
  razvrsceniPoNovosti: false,
  hlajenjeUr: 24,
  pravno:
    "robots.txt ne obstaja (HTTP 404, preverjeno 28. in 29. 9. 2026), zato ni ne prepovedanih poti ne " +
    "Crawl-delay; beremo samo uradni vir RSS https://mpgi.gov.hr/rss.aspx?ID=13546, enkrat na dan. " +
    "Uvjeti korištenja (/uvjeti-koristenja/76) o robotih in zajemu ne govorijo, izrecno pa dovolijo prenos " +
    "vsebine brez posebnega dovoljenja ob navedbi vira (ministrstvo daje podatke z odprto dovoljenko po NN 67/17); " +
    "presoja in dva neodvisna skeptika (pravni + tehnični) niso našli omejitve. POGOJI: vsak prikazan zapis nosi " +
    "\"Izvor: Ministarstvo prostornoga uređenja, graditeljstva i državne imovine, mpgi.gov.hr\" in povezavo nazaj; " +
    "pozivov na županijskih in mestnih domenah (npr. pgz.hr) ter priloženih dokumentov ne beremo, ker so " +
    "\"preneseni iz drugega vira\" in niso preverjeni; slik ni.",
  rezine: () => REZINE,
  seznamUrl,
  preberiHttp,
  preberiSeznam: async () => {
    throw new Error("mpgi.gov.hr se bere brez brskalnika (preberiHttp, vir RSS)");
  },
  normaliziraj,
};
