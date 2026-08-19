/**
 * Normalizacija krajevnih imen — ENA logika za uvoz šifranta (worker) in
 * iskanje (UI), da se obe strani vedno strinjata, kaj je "isti kraj".
 *
 * Viri pišejo kraj prosto: "Lj. Center", "Mb - Center", "Bakarac, Kraljevica",
 * "Brezovica pri Ljubljani". Ujemamo normalizirano ime; pri mestnih četrtih
 * (Lj./Mb. predpone, znane četrti) se kraj prevede v mesto — koordinata je
 * potem centroid mesta in je povsod označena kot "približno".
 */

export function normKraj(s: string): string {
  return s
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "dj")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Četrti in oznake, ki pomenijo mesto — samo nedvoumne. */
const CETRTI: Record<string, string> = {
  btc: "ljubljana",
  "lj bezigrad": "ljubljana",
  "lj center": "ljubljana",
  "lj siska": "ljubljana",
  "lj vic": "ljubljana",
  "lj moste": "ljubljana",
  "lj rudnik": "ljubljana",
  "lj polje": "ljubljana",
  "lj crnuce": "ljubljana",
  "mb center": "maribor",
  "mb tabor": "maribor",
  "mb pobrezje": "maribor",
  "mb tezno": "maribor",
  "mb studenci": "maribor",
  "mb koroska vrata": "maribor",
  "koroska vrata": "maribor",
  tezno: "maribor",
  pobrezje: "maribor",
  studenci: "maribor",
};

/**
 * Kandidati za ujemanje, urejeni od najbolj do najmanj specifičnega.
 * "Bakarac, Šmrika, Kraljevica" -> ["bakarac", "smrika", "kraljevica"].
 */
export function kandidatiIzKraja(kraj: string): string[] {
  const mesta: string[] = []; // prevodi četrti -> mesto imajo prednost
  const ostali: string[] = [];
  const dodaj = (k: string, jeMesto: boolean) => {
    if (!k || k.length < 2) return;
    const cilj = jeMesto ? mesta : ostali;
    if (!mesta.includes(k) && !ostali.includes(k)) cilj.push(k);
  };

  for (const surov of kraj.split(",")) {
    const izvirni = normKraj(surov);
    if (!izvirni) continue;
    let n = izvirni;
    // predponi "lj"/"mb" -> mesto
    if (/^lj\b/.test(n)) n = CETRTI[n] ?? "ljubljana";
    else if (/^mb\b/.test(n)) n = CETRTI[n] ?? "maribor";
    else if (CETRTI[n]) n = CETRTI[n];
    dodaj(n, n !== izvirni);
    // "brezovica pri ljubljani" naj najde tudi "brezovica"
    const pri = n.match(/^(.+?)\s+(?:pri|ob|na|v)\s+/);
    if (pri) dodaj(pri[1], false);
  }
  return [...mesta, ...ostali];
}

export type KrajVrstica = {
  ime: string;
  ime_norm: string;
  drzava: string;
  lat: number;
  lng: number;
  prebivalcev: number | null;
};

/**
 * Izbere najboljši zadetek med vrsticami šifranta za dano prosto besedilo.
 *
 * Vrstni red presoje: prvi kandidat, ki obstaja; med istoimenskimi najprej
 * ŽELENA DRŽAVA (privzeto SI), šele nato velikost kraja. Obratni vrstni red je
 * slovenske Bistrice, Vrhe in Loke selil na Hrvaško, ker je istoimenski
 * hrvaški kraj večji — država je močnejši signal od števila prebivalcev.
 */
export function najdiKraj(
  kraj: string,
  poNorm: Map<string, KrajVrstica[]>,
  zeljenaDrzava: string = "SI"
): KrajVrstica | null {
  for (const kandidat of kandidatiIzKraja(kraj)) {
    const zadetki = poNorm.get(kandidat);
    if (!zadetki || zadetki.length === 0) continue;
    return [...zadetki].sort((a, b) => {
      const da = a.drzava === zeljenaDrzava ? 0 : 1;
      const db = b.drzava === zeljenaDrzava ? 0 : 1;
      if (da !== db) return da - db;
      return (b.prebivalcev ?? 0) - (a.prebivalcev ?? 0);
    })[0];
  }
  return null;
}

/**
 * Kandidati za SREDIŠČE radija iz besedila v sklonu: "okoli Maribora" ->
 * ["maribora", "maribor", "maribo"]. Zadnji je predpona za DB `like` rezervo
 * ("kopra" -> "kop%" najde Koper, ker skloni radi požrejo samoglasnik).
 */
export function kandidatiZaSredisce(ime: string): { tocni: string[]; predpona: string | null } {
  const n = normKraj(ime);
  const tocni = [n];
  if (n.length > 4) tocni.push(n.slice(0, -1), n.slice(0, -2));
  const predpona = n.length >= 5 ? n.slice(0, n.length - 2) : null;
  return { tocni: tocni.filter((x) => x.length >= 3), predpona };
}

/** Razdalja med koordinatama v km (haversine) — za radij in prikaz. */
export function razdaljaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Pravokotnik okoli središča — grobi DB filter, natančni je razdaljaKm. */
export function bboxOkoli(lat: number, lng: number, km: number): { latMin: number; latMax: number; lngMin: number; lngMax: number } {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return { latMin: lat - dLat, latMax: lat + dLat, lngMin: lng - dLng, lngMax: lng + dLng };
}
