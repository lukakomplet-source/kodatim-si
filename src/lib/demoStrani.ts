/**
 * Demo sites and apps parked on our own domain until they move to the
 * client's. Shared types and the slug rules — imported by both the server
 * action and the client screen, so the two can never disagree about what a
 * valid slug is.
 */

export type DemoVrsta = "spletna_stran" | "aplikacija" | "program";
export type DemoStatus = "v_izdelavi" | "za_predogled" | "pri_stranki" | "odobreno" | "preseljeno";

export const DEMO_VRSTE: readonly DemoVrsta[] = ["spletna_stran", "aplikacija", "program"];
export const DEMO_STATUSI: readonly DemoStatus[] = [
  "v_izdelavi",
  "za_predogled",
  "pri_stranki",
  "odobreno",
  "preseljeno",
];

export const DEMO_VRSTA_LABELS: Record<DemoVrsta, string> = {
  spletna_stran: "Spletna stran",
  aplikacija: "Aplikacija",
  program: "Program",
};

export const DEMO_STATUS_LABELS: Record<DemoStatus, string> = {
  v_izdelavi: "V izdelavi",
  za_predogled: "Za predogled",
  pri_stranki: "Pri stranki",
  odobreno: "Odobreno",
  preseljeno: "Preseljeno na domeno",
};

export const DEMO_STATUS_STYLES: Record<DemoStatus, string> = {
  v_izdelavi: "bg-zinc-100 text-zinc-600",
  za_predogled: "bg-blue-50 text-blue-600",
  pri_stranki: "bg-violet-50 text-violet-600",
  odobreno: "bg-emerald-50 text-emerald-600",
  preseljeno: "bg-amber-50 text-amber-700",
};

export type DemoStran = {
  id: string;
  slug: string;
  naziv: string;
  stranka: string | null;
  vrsta: DemoVrsta;
  status: DemoStatus;
  opombe: string | null;
  koncna_domena: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Demos that exist as real routes in this repository rather than as rows in the
 * database.
 *
 * They are listed here so the admin screen can always link to them. Relying on
 * somebody remembering to add a matching row by hand is how a finished app ends
 * up with no way to reach it — which is exactly what happened to SBN Auto: the
 * page was live at /avtonet and there was no click-path to it anywhere.
 *
 * Being code and not data, they cannot be edited or deleted from the screen.
 * Adding one is a line here, next to the route it describes.
 */
export type VgrajenaDemoStran = {
  slug: string;
  naziv: string;
  stranka: string | null;
  vrsta: DemoVrsta;
  opis: string;
  /**
   * Celoten naslov, kadar aplikacija ne živi na tej domeni.
   *
   * Brez tega je bil ta seznam uporaben samo za poti v tem repozitoriju,
   * aplikacije na lastnih domenah pa nikjer — kar je natanko težava, ki jo
   * seznam rešuje: dokončana aplikacija, do katere ni klika od nikoder.
   */
  url?: string;
};

export const VGRAJENE_DEMO_STRANI: readonly VgrajenaDemoStran[] = [
  {
    slug: "avtonet",
    naziv: "SBN Auto — spremljanje trga vozil",
    stranka: "SBN Auto",
    vrsta: "aplikacija",
    opis:
      "Nadzorna plošča nad oglasi z Avto.net: zgodovina trga, spremembe cen in gumb za zagon raziskave (viden samo adminu).",
  },
  {
    slug: "nepremicnine",
    naziv: "SBN Nepremičnine — lastna baza trga",
    stranka: "SBN Auto",
    vrsta: "aplikacija",
    opis:
      "Iskanje po lastni bazi nepremičninskih oglasov (nepremicnine.net, dnevno): AI vrstica v naravnem jeziku, filtri, zgodovina cen, večenotni objekti za investitorje.",
  },
  {
    slug: "3d-hisa",
    naziv: "3D model hiše — Parmova 4, Vojnik",
    stranka: null,
    vrsta: "aplikacija",
    opis:
      "Interaktivni 3D sprehod okoli hiše (WASD + miška, dan/zahod/noč, ogled okolice). Obstoječe stanje po Street View; prenova po PZI načrtih sledi.",
  },
  {
    slug: "kompletko",
    naziv: "EscortOps — Kompletko",
    stranka: "Kompletko d.o.o.",
    vrsta: "aplikacija",
    url: "https://app.kompletko.com",
    opis:
      "Naročila in razporejanje spremljevalnih vozil: pregled voženj, voznikov in dokumentov. Teče na lastni domeni.",
  },
  {
    slug: "prevzemavto",
    naziv: "PrevzemAvto — uvoz vozil",
    stranka: null,
    vrsta: "aplikacija",
    url: "https://uvozi.kodatim.si",
    opis:
      "Aplikacija za uvoz vozil: izračun stroškov, dokumentacija in vodenje prevzemov. Teče na poddomeni kodatim.si.",
  },
];

/**
 * Paths the public site already owns. A demo on one of these would shadow a
 * real page — "kodatim.si/cenik" must stay the price list — so they are
 * refused before anything reaches the database.
 *
 * The built-in demos above belong here too: their slug is already taken by a
 * route in the repository, so a database row with the same slug would never be
 * reachable.
 */
export const REZERVIRANI_SLUGI = [
  ...VGRAJENE_DEMO_STRANI.map((d) => d.slug),
  "admin",
  "api",
  "auth",
  "prijava",
  "odjava",
  "nastavi-geslo",
  "partner",
  "partnerji",
  "resitve",
  "reference",
  "cenik",
  "o-nas",
  "kontakt",
  "blog",
  "demo",
  "_next",
];

/** Cleans free text into a usable slug: "Keramika Novak" -> "keramika-novak". */
export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "dj")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Null when the slug is usable, otherwise the reason it is not. */
export function slugError(slug: string): string | null {
  if (!slug) return "Vnesite naslov strani (slug).";
  if (!/^[a-z0-9-]+$/.test(slug)) return "Slug lahko vsebuje samo male črke, številke in vezaje.";
  if (slug.length < 2) return "Slug je prekratek.";
  if (REZERVIRANI_SLUGI.includes(slug)) {
    return `„${slug}“ je rezerviran za obstoječo stran na kodatim.si — izberite drug slug.`;
  }
  return null;
}
