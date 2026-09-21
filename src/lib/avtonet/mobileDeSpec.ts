import "server-only";
import { chatJSON } from "@/lib/openai";
import { OPREMA_FILTRI } from "@/lib/avtonet/konfiguracije";

/**
 * Iskalna specifikacija za mobile.de iz enega slovenskega oglasa.
 *
 * Zakaj: ko avto izgine z avto.neta, veš, za koliko je šel pri nas — vprašanje
 * je, ali je isti avto na nemškem trgu cenejši. Iskanje tam se začne z nemškimi
 * izrazi (Kombi namesto karavan, Standheizung, Anhängerkupplung) in s pravimi
 * razponi, ne z imenom slovenskega oglasa.
 *
 * Delitev dela je namerna: AI PREVAJA (nemški izrazi, kot jih mobile.de res
 * uporablja), številke pa izračuna koda. Letnica, kilometri in moč so
 * aritmetika — model, ki bi jih „ocenil“, bi jih prej ali slej izmislil, tu pa
 * vsaka napaka pomeni napačno iskanje in zapravljen večer.
 *
 * Logika živi v knjižnici in ne v poti, da jo je mogoče pognati na pravih
 * vrsticah iz baze (scripts/preveri-mobilede.ts) brez prijavne seje.
 */

export type VhodMobileDe = {
  znamka?: unknown;
  model?: unknown;
  izvedenka?: unknown;
  generacija?: unknown;
  naziv?: unknown;
  letnik?: unknown;
  km?: unknown;
  kw?: unknown;
  gorivo?: unknown;
  menjalnik?: unknown;
  pogon?: unknown;
  karoserija?: unknown;
  oprema?: unknown;
  cena?: unknown;
};

export type Razponi = {
  letoOd: number | null;
  letoDo: number | null;
  kmDo: number | null;
  kwOd: number | null;
  kwDo: number | null;
  psOd: number | null;
  psDo: number | null;
};

export type IzidMobileDe = {
  iskalniNiz: string;
  nemsko: {
    model: string | null;
    karoserija: string | null;
    getriebe: string | null;
    kraftstoff: string | null;
    antrieb: string | null;
    obveznaOprema: string[];
    zazelenaOprema: string[];
    opozorila: string[];
  } | null;
  razponi: Razponi;
  cenaSlo: number | null;
  /** Kaj ni uspelo; null, kadar je vse po načrtu. */
  opozorilo: string | null;
};

type AiIzid = {
  iskalniNiz?: unknown;
  modelNemsko?: unknown;
  getriebe?: unknown;
  kraftstoff?: unknown;
  antrieb?: unknown;
  opozorila?: unknown;
};

/** Slovenska oznaka za ključ opreme — za pojme, ki nemškega prevoda nimajo. */
const OZNAKA_OPREME = new Map<string, string>(
  OPREMA_FILTRI.flatMap((s) => s.lastnosti.map((l) => [l.kljuc, l.oznaka] as const))
);

/**
 * Oprema v nemščini — preslikana v kodi, ne pri modelu.
 *
 * Ključi so naši (OPREMA_FILTRI), izrazi pa taki, kot jih mobile.de uporablja
 * v filtru „Ausstattung“. Ko je to prevajal model, je vrnil „Anhängerkuplung“
 * (brez enega p) — tak izraz na mobile.de ne najde ničesar, napake pa ne vidiš,
 * ker je rezultat samo prazen seznam.
 */
const OPREMA_NEM: Record<string, string> = {
  zracno_vzmetenje: "Luftfederung",
  adaptivno_vzmetenje: "Adaptives Fahrwerk",
  sport_diferencial: "Sperrdifferenzial",
  keramicne_zavore: "Keramikbremsen",
  zadnje_krmiljenje: "Hinterachslenkung",
  sport_chrono: "Sport Chrono Paket",
  sportni_izpuh: "Sportauspuff",
  matrix_led: "Matrix-LED",
  laser_luci: "Laserlicht",
  adaptive_light: "Kurvenlicht",
  nocni_vid: "Nachtsichtassistent",
  virtualni_kokpit: "Virtual Cockpit",
  hud: "Head-up-Display",
  panorama: "Panoramadach",
  streha_odpiranje: "Schiebedach",
  premium_audio: "Soundsystem",
  ambientna: "Ambientebeleuchtung",
  navigacija: "Navigationssystem",
  carplay: "Apple CarPlay",
  sedezi_hlajenje: "Sitzbelüftung",
  sedezi_masaza: "Massagesitze",
  sedezi_gretje: "Sitzheizung",
  memory_sedezi: "Memory-Sitze",
  skoljkasti_sedezi: "Sportsitze",
  acc: "Abstandstempomat",
  lane_assist: "Spurhalteassistent",
  blind_spot: "Totwinkelassistent",
  kamera_360: "360-Grad-Kamera",
  keyless: "Keyless Go",
  paket_m_sport: "M Sportpaket",
  paket_amg: "AMG Line",
  paket_sline: "S line",
  karbon_paket: "Carbon",
  velika_platisca: "19 Zoll Felgen",
  vlecna: "Anhängerkupplung",
  el_prtljaznik: "Elektrische Heckklappe",
  // Ni v OPREMA_FILTRI (tam so „težki“ pojmi), v bazi pa je najpogostejši od vseh.
  alu_platisca: "Alufelgen",
};

/**
 * Karoserija v nemščino — po kategorijah, kot jih ima filter na mobile.de.
 *
 * Tudi to je preslikava in ne prevod: model je za „kombilimuzina / hatchback“
 * vrnil „Kombilimuzina“, kar ni nemška beseda in v filtru ne obstaja.
 */
const KAROSERIJA_NEM: { vzorec: RegExp; nem: string }[] = [
  { vzorec: /terensk|suv/i, nem: "SUV/Geländewagen" },
  // Vrstni red je pomemben: „kombilimuzina“ vsebuje „kombi“, zato mora biti
  // pred pravilom za karavan — sicer bi Golf na mobile.de iskali kot karavan.
  { vzorec: /kombilimuzina|hatchback/i, nem: "Limousine" },
  { vzorec: /karavan|kombi/i, nem: "Kombi" },
  { vzorec: /enoprostorec|van/i, nem: "Van/Kleinbus" },
  { vzorec: /limuzina/i, nem: "Limousine" },
  { vzorec: /coupe|kupe/i, nem: "Sportwagen/Coupé" },
  { vzorec: /cabrio|kabrio/i, nem: "Cabrio/Roadster" },
  { vzorec: /pick-?up/i, nem: "Pickup" },
  { vzorec: /microcar|mikro/i, nem: "Kleinwagen" },
];

/** Nemški izraz za en ključ opreme; izvožen, da ga lahko preveri sonda. */
export function nemskiIzrazZaOpremo(slug: string): string | undefined {
  return OPREMA_NEM[slug];
}

function karoserijaNem(v: string | null): string | null {
  if (!v) return null;
  return KAROSERIJA_NEM.find((k) => k.vzorec.test(v))?.nem ?? null;
}

function niz(v: unknown, najvec = 120): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, najvec) : null;
}

function stevilka(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function seznam(v: unknown, najvec: number, dolzina = 60): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim().slice(0, dolzina) : ""))
    .filter(Boolean)
    .slice(0, najvec);
}

/**
 * Razponi, ki jih na mobile.de res nastaviš.
 *
 * Letnik ±1 leto: isti model in ista oprema, faceliftu pa se s tem ne izognemo
 * — zato je ta v opozorilih. Kilometri navzgor do +15 %, zaokroženo na 10.000,
 * ker mobile.de filtrira po okroglih pragovih. Moč ±8 kW zajame isto
 * motorizacijo z drugačno homologacijo.
 */
export function razponiIz(letnik: number | null, km: number | null, kw: number | null): Razponi {
  const naGor = (n: number, korak: number) => Math.ceil(n / korak) * korak;
  return {
    letoOd: letnik ? letnik - 1 : null,
    letoDo: letnik ? letnik + 1 : null,
    kmDo: km ? naGor(km * 1.15, 10_000) : null,
    kwOd: kw ? Math.max(1, Math.round(kw) - 8) : null,
    kwDo: kw ? Math.round(kw) + 8 : null,
    psOd: kw ? Math.round((kw - 8) * 1.35962) : null,
    psDo: kw ? Math.round((kw + 8) * 1.35962) : null,
  };
}

const SISTEM = `Si poznavalec nemškega trga rabljenih vozil (mobile.de).
Iz specifikacije slovenskega oglasa sestaviš iskanje za mobile.de.

PRAVILA:
- NE izmišljuj opreme, motorizacije ali lastnosti, ki niso v vhodnih podatkih. Kar ni podano, izpusti.
- Uporabljaj izraze, KOT SO ZAPISANI NA mobile.de v nemščini (Kombi, Limousine, SUV/Geländewagen,
  Automatik, Schaltgetriebe, Diesel, Benzin, Allrad, Standheizung, Anhängerkupplung, Panoramadach,
  Matrix-LED, Head-up-Display, Sitzheizung, Sitzbelüftung, Massagesitze, Luftfederung, virtuelles Cockpit).
- "iskalniNiz" je kratek niz za iskalno polje: znamka, model, motorizacija in oznaka opreme
  (npr. "Audi A6 Avant 40 TDI quattro S line"). Brez letnic, kilometrov in cen.
- "obveznaOprema", "zazelenaOprema" in "karoserija" pusti PRAZNE — te prevede koda sama.
- "opozorila" so 2-4 kratki nasveti v SLOVENŠČINI, SPECIFIČNI za TA model, letnik in motor:
  leto facelifta, oznaka motorja/menjalnika, znana šibka točka te generacije, razlika v opremi
  med nemškim in slovenskim trgom. Splošni nasveti ("preverite stanje motorja", "oglejte si
  servisno knjižico") so PREPOVEDANI — če o modelu ničesar specifičnega ne veš, vrni prazen seznam.
Odgovori IZKLJUČNO z JSON:
{"iskalniNiz":"","modelNemsko":"","getriebe":"","kraftstoff":"","antrieb":"","opozorila":[]}`;

/** Ali je v vhodu dovolj, da ima iskanje sploh smisel. */
export function dovoljPodatkov(vhod: VhodMobileDe): boolean {
  return Boolean(niz(vhod.znamka, 40) || niz(vhod.model, 60) || niz(vhod.naziv, 200));
}

export async function pripraviMobileDe(vhod: VhodMobileDe): Promise<IzidMobileDe> {
  const znamka = niz(vhod.znamka, 40);
  const model = niz(vhod.model, 60);
  const letnik = stevilka(vhod.letnik);
  const km = stevilka(vhod.km);
  const kw = stevilka(vhod.kw);
  const cena = stevilka(vhod.cena);
  const razponi = razponiIz(letnik, km, kw);

  const slugi = seznam(vhod.oprema, 30);
  const opremaSlo = slugi.map((s) => OZNAKA_OPREME.get(s) ?? s.replace(/_/g, " "));
  // Prevedena oprema je znana pred klicem AI in se ne spreminja z njim.
  const opremaNem = slugi.map((s) => OPREMA_NEM[s]).filter(Boolean);
  const besedilo = [
    `Znamka: ${znamka ?? "—"}`,
    `Model: ${model ?? "—"}`,
    `Izvedenka: ${niz(vhod.izvedenka, 120) ?? "—"}`,
    `Generacija: ${niz(vhod.generacija, 60) ?? "—"}`,
    `Naziv oglasa: ${niz(vhod.naziv, 200) ?? "—"}`,
    `Letnik: ${letnik ?? "—"}`,
    `Kilometri: ${km ?? "—"}`,
    `Moč: ${kw ? `${kw} kW` : "—"}`,
    `Gorivo: ${niz(vhod.gorivo, 30) ?? "—"}`,
    `Menjalnik: ${niz(vhod.menjalnik, 30) ?? "—"}`,
    `Pogon: ${niz(vhod.pogon, 30) ?? "—"}`,
    `Karoserija: ${niz(vhod.karoserija, 30) ?? "—"}`,
    `Oprema: ${opremaSlo.length > 0 ? opremaSlo.join(", ") : "—"}`,
  ].join("\n");

  let ai: AiIzid;
  try {
    ai = await chatJSON<AiIzid>(SISTEM, besedilo, { temperature: 0.2 });
  } catch (err) {
    // Napaka AI ni razlog za prazen zaslon: razponi in osnovni niz so znani
    // tudi brez modela, zato jih vrnemo in povemo, česa ni.
    return {
      iskalniNiz: [znamka, model, niz(vhod.izvedenka, 120)].filter(Boolean).join(" "),
      nemsko: null,
      razponi,
      cenaSlo: cena,
      opozorilo:
        err instanceof Error
          ? `Prevod v nemščino ni uspel: ${err.message.slice(0, 160)}`
          : "Prevod v nemščino ni uspel.",
    };
  }

  return {
    iskalniNiz: niz(ai.iskalniNiz, 120) ?? [znamka, model].filter(Boolean).join(" "),
    nemsko: {
      model: niz(ai.modelNemsko, 60),
      karoserija: karoserijaNem(niz(vhod.karoserija, 40)),
      getriebe: niz(ai.getriebe, 40),
      kraftstoff: niz(ai.kraftstoff, 40),
      antrieb: niz(ai.antrieb, 40),
      // Oprema je IZKLJUČNO iz preslikave. Ko je smel dodajati svoje izraze,
      // je model Fordu Mondeo pripisal „Standheizung“, ki je v oglasu ni bilo,
      // in podvajal iste pojme v dveh jezikih („Navigationssystem“ +
      // „Navigacija“). Iskanje po opremi, ki je avto nima, ne najde nič.
      obveznaOprema: opremaNem.slice(0, 6),
      zazelenaOprema: opremaNem.slice(6, 12),
      opozorila: seznam(ai.opozorila, 4, 200),
    },
    razponi,
    cenaSlo: cena,
    opozorilo: null,
  };
}
