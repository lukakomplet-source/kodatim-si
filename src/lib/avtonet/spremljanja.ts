/**
 * Spremljanja — a user's saved car search, and how it reads on screen.
 *
 * Shared by the server action and the client screen so the two can never
 * disagree about what a valid filter is, the same reason `demoStrani.ts`
 * exists.
 *
 * The product promise is narrow and worth stating: a spremljanje is a set of
 * conditions plus "tell me when something NEW matches". Everything here serves
 * that sentence.
 */

export type ProdajalecFilter = "vsi" | "dealer" | "zasebnik";

export const PRODAJALEC_FILTRI: readonly ProdajalecFilter[] = ["vsi", "dealer", "zasebnik"];

export const PRODAJALEC_LABELS: Record<ProdajalecFilter, string> = {
  vsi: "Vsi prodajalci",
  dealer: "Samo avtohiše",
  zasebnik: "Samo fizične osebe",
};

export type Spremljanje = {
  id: string;
  naziv: string;
  znamka: string | null;
  model: string | null;
  letnik_min: number | null;
  letnik_max: number | null;
  km_min: number | null;
  km_max: number | null;
  moc_min: number | null;
  moc_max: number | null;
  cena_min: number | null;
  cena_max: number | null;
  gorivo: string | null;
  menjalnik: string | null;
  prodajalec_filter: ProdajalecFilter;
  email_obvestila: string | null;
  aktivno: boolean;
  zadnji_ogled: string | null;
  created_at: string;
  updated_at: string;
};

/** What the form may offer, read from the data rather than assumed. */
export type MoznostiFiltrov = {
  znamke: string[];
  goriva: string[];
  menjalniki: string[];
};

function stevilo(n: number): string {
  return n.toLocaleString("sl-SI");
}

/**
 * The filter as one line a person can read: "2020–2025 · <100.000 km · >300 KM
 * · <50.000 € · samo avtohiše".
 *
 * Only conditions that are actually set appear. A card listing every empty
 * field would bury the two or three that matter, and the whole point of the
 * card is to be understood at a glance.
 */
export function povzetekFiltra(s: Spremljanje): string {
  const deli: string[] = [];

  if (s.letnik_min !== null && s.letnik_max !== null) deli.push(`${s.letnik_min}–${s.letnik_max}`);
  else if (s.letnik_min !== null) deli.push(`od ${s.letnik_min}`);
  else if (s.letnik_max !== null) deli.push(`do ${s.letnik_max}`);

  if (s.km_min !== null && s.km_max !== null) deli.push(`${stevilo(s.km_min)}–${stevilo(s.km_max)} km`);
  else if (s.km_max !== null) deli.push(`< ${stevilo(s.km_max)} km`);
  else if (s.km_min !== null) deli.push(`> ${stevilo(s.km_min)} km`);

  if (s.moc_min !== null && s.moc_max !== null) deli.push(`${s.moc_min}–${s.moc_max} KM`);
  else if (s.moc_min !== null) deli.push(`> ${s.moc_min} KM`);
  else if (s.moc_max !== null) deli.push(`< ${s.moc_max} KM`);

  if (s.cena_min !== null && s.cena_max !== null)
    deli.push(`${stevilo(s.cena_min)}–${stevilo(s.cena_max)} €`);
  else if (s.cena_max !== null) deli.push(`< ${stevilo(s.cena_max)} €`);
  else if (s.cena_min !== null) deli.push(`> ${stevilo(s.cena_min)} €`);

  if (s.gorivo) deli.push(s.gorivo);
  if (s.menjalnik) deli.push(`${s.menjalnik} menjalnik`);
  if (s.prodajalec_filter !== "vsi") deli.push(PRODAJALEC_LABELS[s.prodajalec_filter].toLowerCase());

  return deli.length > 0 ? deli.join(" · ") : "Brez dodatnih pogojev — vsi oglasi";
}

/** The car being watched, for the card's heading. */
export function naslovVozila(s: Spremljanje): string {
  const iz = [s.znamka, s.model].filter(Boolean).join(" ").trim();
  return iz || s.naziv;
}

/**
 * Reads the form into a row, or says what is wrong with it.
 *
 * Ranges are checked here rather than left to the database: a search with a
 * maximum below its minimum matches nothing at all, and would sit on the
 * dashboard looking active and finding nothing forever.
 */
export type VnosSpremljanja = Omit<Spremljanje, "id" | "aktivno" | "zadnji_ogled" | "created_at" | "updated_at">;

export function preberiObrazec(fd: FormData): { vnos: VnosSpremljanja } | { napaka: string } {
  const text = (k: string): string | null => {
    const v = fd.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  const num = (k: string): number | null => {
    const s = text(k);
    if (s === null) return null;
    const n = Number(s.replace(/[.\s]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const znamka = text("znamka");
  const model = text("model");
  const naziv = text("naziv") ?? [znamka, model].filter(Boolean).join(" ").trim();
  if (!naziv) return { napaka: "Vnesite ime spremljanja ali izberite znamko." };

  const prodajalecRaw = text("prodajalec_filter") ?? "vsi";
  const prodajalec_filter = (PRODAJALEC_FILTRI as readonly string[]).includes(prodajalecRaw)
    ? (prodajalecRaw as ProdajalecFilter)
    : "vsi";

  const vnos: VnosSpremljanja = {
    naziv,
    znamka,
    model,
    letnik_min: num("letnik_min"),
    letnik_max: num("letnik_max"),
    km_min: num("km_min"),
    km_max: num("km_max"),
    moc_min: num("moc_min"),
    moc_max: num("moc_max"),
    cena_min: num("cena_min"),
    cena_max: num("cena_max"),
    gorivo: text("gorivo"),
    menjalnik: text("menjalnik"),
    prodajalec_filter,
    email_obvestila: text("email_obvestila"),
  };

  const obrnjeni: [string, number | null, number | null][] = [
    ["Letnik", vnos.letnik_min, vnos.letnik_max],
    ["Kilometri", vnos.km_min, vnos.km_max],
    ["Moč", vnos.moc_min, vnos.moc_max],
    ["Cena", vnos.cena_min, vnos.cena_max],
  ];
  for (const [ime, min, max] of obrnjeni) {
    if (min !== null && max !== null && min > max) {
      return { napaka: `${ime}: spodnja meja je višja od zgornje — tako spremljanje ne bi našlo ničesar.` };
    }
  }

  if (vnos.email_obvestila && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vnos.email_obvestila)) {
    return { napaka: "E-naslov ni videti veljaven." };
  }

  return { vnos };
}
