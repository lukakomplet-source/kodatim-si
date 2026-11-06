/**
 * Pregled (Luka, 6. 11. 2026): štetje iz dogodkov Harveyja Kompletko (harvey/pregled.py). Brez strežnika, zato ga
 * uporablja tudi brskalnik (izbira produkta in obdobja brez ponovnega nalaganja).
 *
 * Pravila:
 * - kartice in koledar štejejo DOGODKE po dnevu dogodka v izbranem obdobju;
 * - lijak spremlja PODJETJA, ki so bila prvič kontaktirana v obdobju, in kaj se je z njimi zgodilo do danes;
 * - dogodek brez znanega časa (starejši zapis) šteje samo pod »Vse«, nikoli na izmišljen dan;
 * - česar nihče ne beleži (video brez povezave, prihodki), je N/A, ne 0.
 */

export type Korak =
  | "prvi"
  | "follow_up"
  | "klic"
  | "video"
  | "zadnji"
  | "odgovor"
  | "lead"
  | "sestanek"
  | "posel";

export type Dogodek = {
  /** Lokalni čas »YYYY-MM-DD HH:MM«; null = čas ni znan. */
  cas: string | null;
  korak: Korak;
  domena: string;
  produkt: string;
  zadeva?: string;
  /** Vrstica posiljanje_dnevnik (mail iz admina) za »Poglej mail«. */
  zapis?: number | null;
  kdo?: string;
  izid?: string;
  nacin?: "mail" | "klic";
  negativen?: boolean;
  odlomek?: string;
  /** Harvey pri klicih: »zaporedje« ali »prej-zaporedje« (vpisano 30. 10. iz starejšega zaporedja). */
  vrsta?: string;
  /** Čas je čas vpisa, dan klica ni zapisan (glej oznaciNaknadne). */
  naknadno?: boolean;
  /** Samo za prikaz v predalu (akcijski center): zakaj je podjetje na seznamu. */
  razlog?: string;
};

export type PodjetjePregled = {
  podjetje: string;
  email: string;
  telefon: string;
  stanje: string;
  opomba: string;
  klicIzid: string;
  oseba: string;
  skrb: string;
  naslednji: string;
  naslednjiKdaj: string;
  steviloMailov: number;
  /** Dogovorjen sestanek »YYYY-MM-DD« ali »YYYY-MM-DD HH:MM«; prazno = ni sestanka (Harvey od 6. 11. zvečer). */
  sestanekKdaj?: string;
  /** Kampanja: različica prvega maila (posiljanja.varianta, npr. »J«, »M6«); prazno = ni zapisano. */
  kampanja?: string;
};

export type PregledPodatki = {
  dogodki: Dogodek[];
  podjetja: Record<string, PodjetjePregled>;
  /** Podjetja na seznamih kampanj, ki še niso kontaktirana (monitoring, spremstvo). */
  seznami: Record<string, number>;
  /** Povezave na Lukov video še ni, zato se korak »video« preskoči. */
  brezVidea: boolean;
  /** Harveyjev lokalni čas, iz njega je »danes«. */
  zdaj: string;
  /** Aktivni posli z vrednostjo, vpisani ročno (Harvey posli_vrednost, od 6. 11. 2026); starejši Harvey jih nima. */
  posli?: {
    id: number;
    domena: string;
    produkt: string;
    kampanja: string;
    vrsta: "enkratno" | "mesecno" | "letno";
    znesek: number;
    datum: string;
    zacetek: string;
    trajanje: number | null;
  }[];
};

export const PRODUKTI = [
  { kljuc: "vsi", ime: "Vsi produkti" },
  { kljuc: "panik", ime: "Panic button" },
  { kljuc: "monitoring", ime: "Monitoring" },
  // ključ ostane »spremstvo« (tako ga piše Harvey), ime je Lukovo (6. 11.): Escort
  { kljuc: "spremstvo", ime: "Escort" },
  { kljuc: "varovanje", ime: "Fizično varovanje" },
] as const;
export type Produkt = (typeof PRODUKTI)[number]["kljuc"];

export const AKTIVNOSTI: Korak[] = ["prvi", "follow_up", "klic", "video", "zadnji"];
export const REZULTATI: Korak[] = ["odgovor", "lead", "sestanek", "posel"];
export const MAILI: Korak[] = ["prvi", "follow_up", "video", "zadnji"];

export const IME_KORAKA: Record<Korak, string> = {
  prvi: "Predstavitveni maili",
  follow_up: "Follow-up maili",
  klic: "Follow-up klici",
  video: "Video follow-upi",
  zadnji: "Last follow-upi",
  odgovor: "Odzivi",
  lead: "Leadi",
  sestanek: "Catch-up sestanki",
  posel: "Zaključeni posli",
};

/** Ime koraka v ednini za vrstico seznama. */
export const KORAK_EDNINA: Record<Korak, string> = {
  prvi: "Predstavitveni mail",
  follow_up: "Follow-up mail",
  klic: "Klic",
  video: "Video follow-up",
  zadnji: "Last follow-up",
  odgovor: "Odziv",
  lead: "Lead",
  sestanek: "Catch-up sestanek",
  posel: "Zaključen posel",
};

export const IZID_KLICA: Record<string, string> = {
  sestanek: "dogovorjen sestanek",
  poslji_mail: "pošljite na mail",
  ni_dvignil: "ni dvignil",
  ne_zanima: "ne zanima",
  poklici_kasneje: "pokličite kasneje",
};

// ——— obdobja ———

export const OBDOBJA = [
  { kljuc: "danes", ime: "Danes" },
  { kljuc: "vceraj", ime: "Včeraj" },
  { kljuc: "ta_teden", ime: "Ta teden" },
  { kljuc: "prejsnji_teden", ime: "Prejšnji teden" },
  { kljuc: "ta_mesec", ime: "Ta mesec" },
  { kljuc: "prejsnji_mesec", ime: "Prejšnji mesec" },
  { kljuc: "7", ime: "Zadnjih 7 dni" },
  { kljuc: "30", ime: "Zadnjih 30 dni" },
  { kljuc: "90", ime: "Zadnjih 90 dni" },
  { kljuc: "letos", ime: "Letos" },
  { kljuc: "vse", ime: "Vse" },
  { kljuc: "poljubno", ime: "Poljubno" },
] as const;
export type ObdobjeKljuc = (typeof OBDOBJA)[number]["kljuc"];

/** Obdobje kot dva datuma »YYYY-MM-DD« (vključno); null pri »Vse«. */
export type Razpon = { od: string; do: string } | null;

function d(s: string): Date {
  const [y, m, dan] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dan));
}
function s(x: Date): string {
  return x.toISOString().slice(0, 10);
}
function plus(x: Date, dni: number): Date {
  return new Date(x.getTime() + dni * 86_400_000);
}
function zacetekTedna(x: Date): Date {
  return plus(x, -((x.getUTCDay() + 6) % 7)); // ponedeljek
}

export function jeDatum(v: string | undefined | null): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && s(d(v)) === v;
}

/** Izbrano obdobje in obdobje za primerjavo (enako dolgo, tik pred njim; mesec in teden: prejšnji mesec ali teden). */
export function razpon(
  kljuc: ObdobjeKljuc,
  danes: string,
  poljubno?: { od?: string; do?: string },
): { zdaj: Razpon; prej: Razpon } {
  const t = d(danes);
  const dolzina = (od: Date, doo: Date): { zdaj: Razpon; prej: Razpon } => {
    const n = Math.round((doo.getTime() - od.getTime()) / 86_400_000) + 1;
    return { zdaj: { od: s(od), do: s(doo) }, prej: { od: s(plus(od, -n)), do: s(plus(od, -1)) } };
  };
  switch (kljuc) {
    case "danes":
      return dolzina(t, t);
    case "vceraj":
      return dolzina(plus(t, -1), plus(t, -1));
    case "ta_teden":
      return { ...dolzina(zacetekTedna(t), t), prej: { od: s(plus(zacetekTedna(t), -7)), do: s(plus(t, -7)) } };
    case "prejsnji_teden": {
      const p = plus(zacetekTedna(t), -7);
      return dolzina(p, plus(p, 6));
    }
    case "ta_mesec": {
      const od = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
      const prejOd = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
      const konecPrej = plus(od, -1);
      // isti del prejšnjega meseca (1.–6. proti 1.–6.), da je primerjava poštena
      const prejDo = plus(prejOd, Math.min(t.getUTCDate(), konecPrej.getUTCDate()) - 1);
      return { zdaj: { od: s(od), do: s(t) }, prej: { od: s(prejOd), do: s(prejDo) } };
    }
    case "prejsnji_mesec": {
      const od = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
      const doo = plus(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)), -1);
      const prejOd = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 2, 1));
      return { zdaj: { od: s(od), do: s(doo) }, prej: { od: s(prejOd), do: s(plus(od, -1)) } };
    }
    case "7":
    case "30":
    case "90":
      return dolzina(plus(t, -(Number(kljuc) - 1)), t);
    case "letos": {
      const od = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      const prejOd = new Date(Date.UTC(t.getUTCFullYear() - 1, 0, 1));
      return { zdaj: { od: s(od), do: s(t) }, prej: { od: s(prejOd), do: s(plus(prejOd, Math.round((t.getTime() - od.getTime()) / 86_400_000))) } };
    }
    case "poljubno": {
      const od = jeDatum(poljubno?.od) ? poljubno.od : danes;
      const doo = jeDatum(poljubno?.do) ? poljubno.do : danes;
      return od <= doo ? dolzina(d(od), d(doo)) : dolzina(d(doo), d(od));
    }
    default:
      return { zdaj: null, prej: null };
  }
}

export function vRazponu(cas: string | null, r: Razpon): boolean {
  if (!r) return true;
  if (!cas) return false;
  const dan = cas.slice(0, 10);
  return dan >= r.od && dan <= r.do;
}

// ——— štetje ———

/**
 * Klici, ki jih je Harvey 30. 10. ob 16:01 vpisal naknadno iz starejšega zaporedja (vrsta »prej-zaporedje«,
 * 5 klicev v isti sekundi), in odzivi na teh klicih. Pravi dan klica ni zapisan nikjer (tudi posiljanja.klicano
 * ima čas vpisa), Luka ga 6. 11. ni vedel. Ostanejo na dnevu vpisa, v štetju enako, le z oznako; nič ni prestavljeno.
 */
export function oznaciNaknadne(dogodki: Dogodek[]): Dogodek[] {
  const kljuc = (e: Dogodek) => `${e.domena}|${e.cas}`;
  const jeNaknaden = (e: Dogodek) => e.korak === "klic" && e.vrsta === "prej-zaporedje";
  const klici = new Set(dogodki.filter(jeNaknaden).map(kljuc));
  if (!klici.size) return dogodki;
  return dogodki.map((e) =>
    jeNaknaden(e) || (e.korak === "odgovor" && e.nacin === "klic" && klici.has(kljuc(e))) ? { ...e, naknadno: true } : e,
  );
}

export function zaProdukt(dogodki: Dogodek[], produkt: Produkt): Dogodek[] {
  return produkt === "vsi" ? dogodki : dogodki.filter((e) => e.produkt === produkt);
}

export type Kartica = {
  kljuc: Korak | "kontaktirana" | "maili";
  /** Število dogodkov (aktivnosti) ali podjetij (kontaktirana, rezultati). */
  stevilo: number;
  prej: number | null;
  /** Enota pod številko. */
  enota: string;
  /** N/A: korak se ne beleži (video brez povezave). */
  na?: string;
  /** Drobna vrstica pod številko (npr. »0 da, 2 ne«). */
  dodatno?: string;
};

export function enaNaPodjetje(dogodki: Dogodek[], korak: Korak, r: Razpon): Set<string> {
  return new Set(dogodki.filter((e) => e.korak === korak && vRazponu(e.cas, r)).map((e) => e.domena));
}

/** Podjetja, ki so bila v obdobju prvič kontaktirana (prvi mail ali klic, kar je bilo prej). */
export function prviKontakt(dogodki: Dogodek[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const e of dogodki) {
    if (e.korak !== "prvi" && e.korak !== "klic") continue;
    // najzgodnejši znani čas; brez znanega časa ostane null (šteje samo pod »Vse«)
    const star = m.get(e.domena) ?? null;
    if (!m.has(e.domena) || (e.cas !== null && (star === null || e.cas < star))) m.set(e.domena, e.cas);
  }
  return m;
}

export function kontaktirana(dogodki: Dogodek[], r: Razpon): Set<string> {
  const out = new Set<string>();
  for (const [dom, cas] of prviKontakt(dogodki)) if (vRazponu(cas, r)) out.add(dom);
  return out;
}

export function kartice(dogodki: Dogodek[], zdaj: Razpon, prej: Razpon, brezVidea: boolean): Kartica[] {
  const st = (k: Korak, r: Razpon) => dogodki.filter((e) => e.korak === k && vRazponu(e.cas, r)).length;
  const imaPrej = prej !== null;
  // Luka 6. 11.: »dej sam eno ne pa 2x isto« — kontaktirana podjetja in predstavitveni maili sta ena kartica.
  // Vsako podjetje dobi en sam prvi mail, zato je število mailov enako številu podjetij; kdor je bil samo poklican,
  // je drobno pod številko.
  const out: Kartica[] = [];
  for (const k of AKTIVNOSTI) {
    const n = st(k, zdaj);
    const samoKlic = k === "prvi" ? samoSKlicem(dogodki, zdaj) : 0;
    out.push({
      kljuc: k,
      stevilo: n,
      prej: imaPrej ? st(k, prej) : null,
      enota: k === "klic" ? "klicev" : k === "prvi" ? "podjetij" : "mailov",
      na: k === "video" && brezVidea && n === 0 ? "povezave na video še ni" : undefined,
      dodatno: samoKlic ? `+${samoKlic} samo s klicem` : undefined,
    });
  }
  const leadi = new Set(dogodki.filter((e) => e.korak === "lead").map((e) => e.domena));
  for (const k of REZULTATI) {
    const podjetja = enaNaPodjetje(dogodki, k, zdaj);
    let dodatno: string | undefined;
    if (k === "odgovor" && podjetja.size) {
      // Luka: kdor je rekel ne ali »pokličite kasneje«, ni lead; da = podjetje, ki je postalo lead.
      // »ne« = podjetje je kadarkoli reklo ne (odziv ali kasnejši klic »ne zanima«), čeprav je prvi odziv bil drug
      const ne = new Set(
        dogodki
          .filter((e) => podjetja.has(e.domena) && ((e.korak === "odgovor" && e.negativen) || (e.korak === "klic" && e.izid === "ne_zanima")))
          .map((e) => e.domena),
      );
      const da = [...podjetja].filter((d) => leadi.has(d) && !ne.has(d)).length;
      dodatno = `${da} da, ${ne.size} ne, ${podjetja.size - da - ne.size} ne zdaj`;
    }
    out.push({
      kljuc: k,
      stevilo: podjetja.size,
      prej: imaPrej ? enaNaPodjetje(dogodki, k, prej).size : null,
      enota: "podjetij",
      dodatno,
    });
  }
  return out;
}

/** Odstotek kot »12 %« ali »12,5 %«; »–« brez imenovalca. */
export function odstotek(a: number, b: number): string {
  if (!b) return "–";
  const p = (a / b) * 100;
  const zaokr = p >= 10 || Number.isInteger(p) ? Math.round(p).toString() : p.toFixed(1).replace(".", ",");
  return `${zaokr} %`;
}

export type VrsticaLijaka = { kljuc: Korak; stevilo: number; odZacetka: string; odPrejsnje: string };

/** Podjetja, kontaktirana v obdobju, ki niso nikoli dobila prvega maila (samo klic). */
export function samoSKlicem(dogodki: Dogodek[], r: Razpon): number {
  const zMailom = new Set(dogodki.filter((e) => e.korak === "prvi").map((e) => e.domena));
  return [...kontaktirana(dogodki, r)].filter((d) => !zMailom.has(d)).length;
}

/**
 * Lijak po podjetjih: kohorta = podjetja, prvič kontaktirana v obdobju; pri vsakem koraku, koliko jih je do danes
 * prišlo do njega (kadarkoli, tudi brez znanega časa).
 */
export function lijak(dogodki: Dogodek[], r: Razpon): { vrstice: VrsticaLijaka[]; osnova: number; samoKlic: number } {
  const kohorta = kontaktirana(dogodki, r);
  const imajo = (k: Korak) => new Set(dogodki.filter((e) => e.korak === k && kohorta.has(e.domena)).map((e) => e.domena)).size;
  const vrstice: VrsticaLijaka[] = [];
  const n0 = kohorta.size;
  // Prva vrstica je »Predstavitveni maili« (Luka: ne dvakrat isto); osnova odstotkov ostanejo vsa kontaktirana podjetja.
  // Aktivnosti niso zaporedne (klic je lahko pred follow-upom), zato samo delež od začetka. Rezultati so veriga:
  // odziv od kontaktiranih, lead od odzivov, sestanek od leadov, posel od sestankov.
  for (const k of AKTIVNOSTI) {
    const n = imajo(k);
    vrstice.push({ kljuc: k, stevilo: n, odZacetka: odstotek(n, n0), odPrejsnje: "" });
  }
  let prej = n0;
  for (const k of REZULTATI) {
    const n = imajo(k);
    vrstice.push({ kljuc: k, stevilo: n, odZacetka: odstotek(n, n0), odPrejsnje: odstotek(n, prej) });
    prej = n;
  }
  return { vrstice, osnova: n0, samoKlic: samoSKlicem(dogodki, r) };
}

export type VrsticaListka = {
  aktivnost: Korak;
  stevilo: number;
  odziv: number;
  lead: number;
  sestanek: number;
  posel: number;
};

/**
 * Lukov listek: po kateri aktivnosti je prišel odziv. Odziv podjetja (in njegov lead, sestanek, posel) pripada
 * zadnji aktivnosti pred prvim odzivom tega podjetja. Aktivnosti so iz obdobja, rezultati do danes.
 */
export function poAktivnostih(dogodki: Dogodek[], r: Razpon): VrsticaListka[] {
  const poPodjetju = new Map<string, Dogodek[]>();
  for (const e of dogodki) {
    if (!poPodjetju.has(e.domena)) poPodjetju.set(e.domena, []);
    poPodjetju.get(e.domena)!.push(e);
  }
  const vrstice = new Map<Korak, VrsticaListka>(
    AKTIVNOSTI.map((a) => [a, { aktivnost: a, stevilo: 0, odziv: 0, lead: 0, sestanek: 0, posel: 0 }]),
  );
  for (const e of dogodki) if (AKTIVNOSTI.includes(e.korak) && vRazponu(e.cas, r)) vrstice.get(e.korak)!.stevilo++;
  for (const [, ev] of poPodjetju) {
    const rezultat = ev.filter((e) => REZULTATI.includes(e.korak));
    if (!rezultat.length) continue;
    const prvi = rezultat.reduce((a, b) => ((b.cas ?? "9999") < (a.cas ?? "9999") ? b : a));
    // klic, ki je bil sam odziv, pripada klicu
    const meja = prvi.cas ?? "9999";
    const pred = ev
      .filter((e) => AKTIVNOSTI.includes(e.korak) && (e.cas ?? "") <= meja)
      .sort((a, b) => (a.cas ?? "").localeCompare(b.cas ?? ""));
    const akt = pred.at(-1);
    if (!akt || !vRazponu(akt.cas, r)) continue;
    const v = vrstice.get(akt.korak)!;
    const ima = (k: Korak) => rezultat.some((e) => e.korak === k);
    if (ima("odgovor")) v.odziv++;
    if (ima("lead")) v.lead++;
    if (ima("sestanek")) v.sestanek++;
    if (ima("posel")) v.posel++;
  }
  return AKTIVNOSTI.map((a) => vrstice.get(a)!);
}

/** Koledar: po dnevih v mesecu maili, klici, odzivi. */
export type DanKoledarja = { dan: string; maili: number; klici: number; odzivi: number };

export function koledar(dogodki: Dogodek[], mesec: string): DanKoledarja[] {
  const [y, m] = mesec.split("-").map(Number);
  const dni = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: DanKoledarja[] = [];
  for (let i = 1; i <= dni; i++) {
    const dan = `${mesec}-${String(i).padStart(2, "0")}`;
    const ta = dogodki.filter((e) => e.cas?.startsWith(dan));
    out.push({
      dan,
      maili: ta.filter((e) => MAILI.includes(e.korak)).length,
      klici: ta.filter((e) => e.korak === "klic").length,
      odzivi: ta.filter((e) => e.korak === "odgovor").length,
    });
  }
  return out;
}

/** Dogodki za seznam za številko (drill-down). */
export function seznamZa(
  dogodki: Dogodek[],
  kljuc: Kartica["kljuc"],
  r: Razpon,
): Dogodek[] {
  let izbor: Dogodek[];
  if (kljuc === "kontaktirana") {
    const k = kontaktirana(dogodki, r);
    const prvi = prviKontakt(dogodki);
    izbor = dogodki.filter(
      (e) => (e.korak === "prvi" || e.korak === "klic") && k.has(e.domena) && e.cas === (prvi.get(e.domena) ?? null),
    );
    const videno = new Set<string>();
    izbor = izbor.filter((e) => (videno.has(e.domena) ? false : (videno.add(e.domena), true)));
  } else if (kljuc === "maili") {
    izbor = dogodki.filter((e) => MAILI.includes(e.korak) && vRazponu(e.cas, r));
  } else {
    izbor = dogodki.filter((e) => e.korak === kljuc && vRazponu(e.cas, r));
  }
  return [...izbor].sort((a, b) => (b.cas ?? "").localeCompare(a.cas ?? ""));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Pregled v2 (6. 11. 2026): nove funkcije za trende, primerjavo, tabelo, koledar (mesec, teden, dan), lijak in
// prihodke. Zgornje funkcije ostanejo nespremenjene (preverjeno s skripto parity na resničnih podatkih); vse spodaj
// je zgrajeno NA njih, nič ne šteje drugače.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// ——— datumi in oblika ———

export const MESECI = ["januar", "februar", "marec", "april", "maj", "junij", "julij", "avgust", "september", "oktober", "november", "december"] as const;
export const MESECI_KRATKO = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"] as const;
/** Dnevi v tednu od ponedeljka. */
export const DNEVI_KRATKO = ["pon", "tor", "sre", "čet", "pet", "sob", "ned"] as const;

/** »2026-11-06« → »6. 11. 2026«. */
export function lepDatum(dan: string): string {
  const [y, m, dd] = dan.split("-").map(Number);
  return `${dd}. ${m}. ${y}`;
}

/** Obdobje za besedilo: »vse«, »6. 11. 2026« ali »1. 11. 2026 – 6. 11. 2026«. */
export function opisRazpona(r: Razpon): string {
  if (!r) return "vse";
  return r.od === r.do ? lepDatum(r.od) : `${lepDatum(r.od)} – ${lepDatum(r.do)}`;
}

/** Datum, premaknjen za n dni (n je lahko negativen). */
export function premakniDan(dan: string, n: number): string {
  return s(plus(d(dan), n));
}

/** Mesec »YYYY-MM«, premaknjen za n mesecev. */
export function premakniMesec(mesec: string, n: number): string {
  const [y, m] = mesec.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Ponedeljek tedna, v katerem je dan. */
export function ponedeljek(dan: string): string {
  return s(zacetekTedna(d(dan)));
}

/** Znesek v evrih (»1.250 €«); null → »N/A«. */
export function evri(znesek: number | null): string {
  if (znesek === null) return "N/A";
  return new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(znesek);
}

// ——— obdobje s primerjavo ———

/** Prvi dan z zabeleženim časom (YYYY-MM-DD); null, ko ni nobenega. Računa se iz VSEH dogodkov, ne iz izbranega produkta. */
export function prviDan(dogodki: Dogodek[]): string | null {
  return dogodki.reduce<string | null>((a, e) => (e.cas && (!a || e.cas < a) ? e.cas : a), null)?.slice(0, 10) ?? null;
}

export type ObdobjeSPrimerjavo = {
  zdaj: Razpon;
  /** Obdobje za primerjavo; null pri »Vse« in kadar je prejšnje obdobje v celoti pred prvim zapisom. */
  prej: Razpon;
  /** Prejšnje obdobje po koledarju (tudi kadar zanj še ni podatkov). */
  prejCelo: Razpon;
  /** Prejšnje obdobje obstaja, a je pred prvim zapisom: »ni primerjave (prej še ni podatkov)«. */
  niPrimerjave: boolean;
};

/** razpon() + pravilo »ni primerjave«: primerjava samo, kadar je prejšnje obdobje (vsaj delno) po prvem zapisu. */
export function obdobjeSPrimerjavo(
  kljuc: ObdobjeKljuc,
  danes: string,
  poljubno: { od?: string; do?: string } | undefined,
  prvi: string | null,
): ObdobjeSPrimerjavo {
  const { zdaj, prej: prejCelo } = razpon(kljuc, danes, poljubno);
  const prej = prejCelo && prvi && prejCelo.do >= prvi ? prejCelo : null;
  return { zdaj, prej, prejCelo, niPrimerjave: prejCelo !== null && prej === null };
}

/** Zadnji dan obdobja za trende: konec obdobja, a nikoli po danes; pri »Vse« danes. */
export function konecObdobja(zdaj: Razpon, danes: string): string {
  return zdaj && zdaj.do < danes ? zdaj.do : danes;
}

// ——— trend (iskrica na kartici) ———

/** Časovni predal: od–do (vključno). */
export type Vedro = { od: string; do: string };

/** Zadnjih n tednov po 7 dni (starejši najprej); zadnji se konča na dan »konec«, zato noben teden ni okrnjen. */
export function tedni(konec: string, n = 8): Vedro[] {
  const k = d(konec);
  return Array.from({ length: n }, (_, i) => {
    const doo = plus(k, -7 * (n - 1 - i));
    return { od: s(plus(doo, -6)), do: s(doo) };
  });
}

/** Točka trenda: število v tednu; null = teden je v celoti pred prvim zapisom (ni podatkov, ne 0). */
export type TockaTrenda = Vedro & { stevilo: number | null };

/** Isto štetje kot kartice(): aktivnosti in maili = dogodki, rezultati in kontaktirana = podjetja. */
export function stejZaKartico(dogodki: Dogodek[], kljuc: Kartica["kljuc"], r: Razpon): number {
  if (kljuc === "kontaktirana") return kontaktirana(dogodki, r).size;
  if (kljuc === "maili") return dogodki.filter((e) => MAILI.includes(e.korak) && vRazponu(e.cas, r)).length;
  if (REZULTATI.includes(kljuc)) return enaNaPodjetje(dogodki, kljuc, r).size;
  return dogodki.filter((e) => e.korak === kljuc && vRazponu(e.cas, r)).length;
}

/** Število za kartico po tednih, zadnjih n tednov do »konec«. */
export function trend(dogodki: Dogodek[], kljuc: Kartica["kljuc"], konec: string, prvi: string | null, n = 8): TockaTrenda[] {
  return tedni(konec, n).map((v) => ({ ...v, stevilo: !prvi || v.do < prvi ? null : stejZaKartico(dogodki, kljuc, v) }));
}

// ——— sprememba proti prejšnjemu obdobju ———

export type Sprememba = {
  /** Sprememba v odstotkih (25 = +25 %); null, ko je ni mogoče izračunati (ni primerjave ali prej 0). */
  odstotek: number | null;
  /** Smer puščice; null = brez puščice. */
  smer: "gor" | "dol" | "enako" | null;
  /** »+25 %«, »−10 %«, »0 %«, »nova« (prej 0, zdaj več) ali »–« (ni primerjave ali oboje 0). */
  besedilo: string;
};

function stOdstotka(p: number): string {
  const a = Math.abs(p);
  return a >= 10 || Number.isInteger(a) ? Math.round(a).toString() : a.toFixed(1).replace(".", ",");
}

/** Sprememba zdaj proti prej. prej = null pomeni, da primerljivega obdobja ni. */
export function sprememba(zdaj: number, prej: number | null): Sprememba {
  if (prej === null) return { odstotek: null, smer: null, besedilo: "–" };
  if (prej === 0) return zdaj > 0 ? { odstotek: null, smer: "gor", besedilo: "nova" } : { odstotek: null, smer: null, besedilo: "–" };
  const p = ((zdaj - prej) / prej) * 100;
  if (p === 0) return { odstotek: 0, smer: "enako", besedilo: "0 %" };
  return { odstotek: p, smer: p > 0 ? "gor" : "dol", besedilo: `${p > 0 ? "+" : "−"}${stOdstotka(p)} %` };
}

// ——— kartice s trendom in spremembo ———

/** Ime kartice (vključno s starima ključema »kontaktirana« in »maili«, ki ju odprejo stare povezave). */
export function imeKartice(kljuc: Kartica["kljuc"]): string {
  return kljuc === "kontaktirana" ? "Kontaktirana podjetja" : kljuc === "maili" ? "Poslani maili" : IME_KORAKA[kljuc];
}

export type KarticaPolna = Kartica & {
  ime: string;
  skupina: "aktivnost" | "rezultat";
  sprememba: Sprememba;
  /** Zadnjih 8 tednov do konca obdobja; pri N/A same null. */
  trend: TockaTrenda[];
};

/** kartice() + ime, skupina, sprememba in trend. Številke so iste kot v kartice(). */
export function karticeSTrendom(
  dogodki: Dogodek[],
  zdaj: Razpon,
  prej: Razpon,
  brezVidea: boolean,
  konec: string,
  prvi: string | null,
  n = 8,
): KarticaPolna[] {
  return kartice(dogodki, zdaj, prej, brezVidea).map((k) => ({
    ...k,
    ime: imeKartice(k.kljuc),
    skupina: REZULTATI.includes(k.kljuc as Korak) ? "rezultat" : "aktivnost",
    sprememba: k.na ? sprememba(0, null) : sprememba(k.stevilo, k.prej),
    trend: k.na ? tedni(konec, n).map((v) => ({ ...v, stevilo: null })) : trend(dogodki, k.kljuc, konec, prvi, n),
  }));
}

// ——— tabela po aktivnostih ———

export type VrsticaAktivnosti = VrsticaListka & {
  /** Stopnja odziva: odziv / stevilo (»12 %«; »–« brez imenovalca). */
  odzivOdstotek: string;
  /** Konverzija: lead / stevilo (»3 %«; »–« brez imenovalca). */
  leadOdstotek: string;
  /** N/A: aktivnost se ne beleži (video brez povezave). */
  na?: string;
};

/** poAktivnostih() + stopnja odziva in konverzije na vrstico. */
export function tabelaAktivnosti(dogodki: Dogodek[], r: Razpon, brezVidea: boolean): VrsticaAktivnosti[] {
  return poAktivnostih(dogodki, r).map((v) => ({
    ...v,
    odzivOdstotek: odstotek(v.odziv, v.stevilo),
    leadOdstotek: odstotek(v.lead, v.stevilo),
    na: v.aktivnost === "video" && brezVidea && v.stevilo === 0 ? "povezave na video še ni" : undefined,
  }));
}

// ——— koledar: mesec, teden, dan ———

/** Dan koledarja z vsemi števci (dogodki tistega dne; maili, klici, odzivi so isti kot v koledar()). */
export type DanKoledarjaPolno = DanKoledarja & { leadi: number; sestanki: number; posli: number; skupaj: number };

function dnevi(dogodki: Dogodek[], seznamDni: string[]): DanKoledarjaPolno[] {
  const po = new Map<string, Dogodek[]>(seznamDni.map((x) => [x, []]));
  for (const e of dogodki) if (e.cas) po.get(e.cas.slice(0, 10))?.push(e);
  return seznamDni.map((dan) => {
    const ta = po.get(dan)!;
    const st = (k: Korak) => ta.filter((e) => e.korak === k).length;
    return {
      dan,
      maili: ta.filter((e) => MAILI.includes(e.korak)).length,
      klici: st("klic"),
      odzivi: st("odgovor"),
      leadi: st("lead"),
      sestanki: st("sestanek"),
      posli: st("posel"),
      skupaj: ta.length,
    };
  });
}

/** Vsi dnevi meseca »YYYY-MM«. */
export function koledarMesec(dogodki: Dogodek[], mesec: string): DanKoledarjaPolno[] {
  const [y, m] = mesec.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return dnevi(dogodki, Array.from({ length: n }, (_, i) => `${mesec}-${String(i + 1).padStart(2, "0")}`));
}

/** 7 dni (pon–ned) tedna, v katerem je dan. */
export function koledarTeden(dogodki: Dogodek[], dan: string): DanKoledarjaPolno[] {
  const p = ponedeljek(dan);
  return dnevi(dogodki, Array.from({ length: 7 }, (_, i) => premakniDan(p, i)));
}

/** Vsi dogodki dneva, najnovejši najprej (isto kot dosedanji seznam za dan). */
export function seznamDneva(dogodki: Dogodek[], dan: string): Dogodek[] {
  return [...dogodki.filter((e) => e.cas?.startsWith(dan))].sort((a, b) => (b.cas ?? "").localeCompare(a.cas ?? ""));
}

export type SkupinaDneva = { korak: Korak; dogodki: Dogodek[] };

/** Dogodki dneva po vrsti (aktivnosti, nato rezultati); samo neprazne skupine, v skupini najnovejši najprej. */
export function koledarDan(dogodki: Dogodek[], dan: string): SkupinaDneva[] {
  const ta = seznamDneva(dogodki, dan);
  return [...AKTIVNOSTI, ...REZULTATI]
    .map((korak) => ({ korak, dogodki: ta.filter((e) => e.korak === korak) }))
    .filter((g) => g.dogodki.length);
}

// ——— lijak s pretvorbo ———

export type StopnjaLijaka = {
  kljuc: Korak;
  ime: string;
  skupina: "aktivnost" | "rezultat";
  /** Podjetja iz kohorte, ki so prišla do tega koraka (kadarkoli). */
  stevilo: number;
  /** Delež od vseh kontaktiranih (»12 %«, »–«). */
  odZacetka: string;
  /** Pretvorba iz prejšnje relevantne stopnje: aktivnosti od kontaktiranih; odziv od kontaktiranih, lead od odzivov,
   *  sestanek od leadov, posel od sestankov. */
  pretvorba: string;
  /** »od kontaktiranih«, »od odzivov«, »od leadov«, »od sestankov«. */
  pretvorbaOd: string;
  /** Širina stolpca 0–100 glede na kontaktirana (0, ko kontaktiranih ni). */
  delez: number;
  /** N/A: korak se ne beleži (video brez povezave). */
  na?: string;
};

const PRETVORBA_OD: Record<string, string> = {
  odgovor: "od kontaktiranih",
  lead: "od odzivov",
  sestanek: "od leadov",
  posel: "od sestankov",
};

/** lijak() kot seznam stopenj s pretvorbo. Številke so iste kot v lijak(). */
export function stopnjeLijaka(
  dogodki: Dogodek[],
  r: Razpon,
  brezVidea: boolean,
): { stopnje: StopnjaLijaka[]; osnova: number; samoKlic: number } {
  const l = lijak(dogodki, r);
  const stopnje = l.vrstice.map((v): StopnjaLijaka => {
    const rezultat = REZULTATI.includes(v.kljuc);
    return {
      kljuc: v.kljuc,
      ime: IME_KORAKA[v.kljuc],
      skupina: rezultat ? "rezultat" : "aktivnost",
      stevilo: v.stevilo,
      odZacetka: v.odZacetka,
      pretvorba: rezultat ? v.odPrejsnje : v.odZacetka,
      pretvorbaOd: rezultat ? PRETVORBA_OD[v.kljuc] : "od kontaktiranih",
      delez: l.osnova ? (v.stevilo / l.osnova) * 100 : 0,
      na: v.kljuc === "video" && brezVidea && v.stevilo === 0 ? "povezave na video še ni" : undefined,
    };
  });
  return { stopnje, osnova: l.osnova, samoKlic: l.samoKlic };
}

/**
 * Seznam za stopnjo lijaka: podjetja iz kohorte (prvič kontaktirana v obdobju), ki so prišla do koraka; za vsako
 * podjetje en dogodek (najzgodnejši tega koraka), zato je vrstic toliko, kot kaže lijak.
 */
export function seznamLijaka(dogodki: Dogodek[], korak: Korak, r: Razpon): Dogodek[] {
  const kohorta = kontaktirana(dogodki, r);
  const prvi = new Map<string, Dogodek>();
  for (const e of dogodki) {
    if (e.korak !== korak || !kohorta.has(e.domena)) continue;
    const star = prvi.get(e.domena);
    if (!star || (e.cas !== null && (star.cas === null || e.cas < star.cas))) prvi.set(e.domena, e);
  }
  return [...prvi.values()].sort((a, b) => (b.cas ?? "").localeCompare(a.cas ?? ""));
}

/**
 * Seznam za kartico v predalu, vedno toliko vrstic, kot kaže kartica. Aktivnosti štejejo dogodke, zato vsi dogodki
 * (seznamZa); rezultati štejejo podjetja, zato ena vrstica na podjetje (najnovejši dogodek tega koraka v obdobju).
 * seznamZa() ostane nespremenjen (stare povezave, npr. seznam=maili iz Danes).
 */
export function seznamKartice(dogodki: Dogodek[], kljuc: Kartica["kljuc"], r: Razpon): Dogodek[] {
  const vse = seznamZa(dogodki, kljuc, r);
  if (!REZULTATI.includes(kljuc as Korak)) return vse;
  const videno = new Set<string>();
  return vse.filter((e) => (videno.has(e.domena) ? false : (videno.add(e.domena), true)));
}

// ——— prihodki ———

/**
 * Prihodek (pride kasneje iz aplikacije Kompletko, po Lukovem posebnem OK). Dokler ga ni, so vse vrednosti N/A.
 * datum »YYYY-MM-DD«; produkt: ključ iz PRODUKTI brez »vsi«; znesek v evrih, null = znesek ni znan;
 * nova: true = nova stranka (zaključen posel), false = ponavljajoč prihodek obstoječe stranke.
 */
export type Prihodek = { datum: string; produkt: string; znesek: number | null; stranka: string; nova: boolean };

export type PovzetekPrihodkov = {
  /** Prijazna vrstica, zakaj ni številk; null, ko podatki so. */
  na: string | null;
  skupaj: number | null;
  novi: number | null;
  ponavljajoci: number | null;
  /** Zaključeni posli = prihodki novih strank v obdobju. */
  steviloPoslov: number | null;
  /** Povprečna vrednost posla = novi / posli z znanim zneskom. */
  povprecje: number | null;
  /** Prihodki brez znanega zneska (niso v vsotah). */
  brezZneska: number;
  poProduktih: { produkt: Exclude<Produkt, "vsi">; ime: string; znesek: number | null }[];
  /** Zadnjih n mesecev do meseca »konec« (starejši najprej). */
  casovnica: (Vedro & { oznaka: string; znesek: number | null })[];
};

export const PRIHODKI_NA = "Zneski poslov se še ne beležijo. Prišli bodo iz aplikacije Kompletko, ko jo povežemo s Pregledom.";

function meseci(konec: string, n: number): (Vedro & { oznaka: string })[] {
  const zadnji = konec.slice(0, 7);
  return Array.from({ length: n }, (_, i) => {
    const m = premakniMesec(zadnji, -(n - 1 - i));
    const [y, mm] = m.split("-").map(Number);
    const zadnjiDan = String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, "0");
    return { od: `${m}-01`, do: `${m}-${zadnjiDan}`, oznaka: `${MESECI_KRATKO[mm - 1]} ${y}` };
  });
}

/** Prazno stanje: vse N/A z razlogom, struktura pa ista, kot bo s podatki. */
export function prazniPrihodki(konec: string, n = 6, razlog = PRIHODKI_NA): PovzetekPrihodkov {
  return {
    na: razlog,
    skupaj: null,
    novi: null,
    ponavljajoci: null,
    steviloPoslov: null,
    povprecje: null,
    brezZneska: 0,
    poProduktih: PRODUKTI.filter((p) => p.kljuc !== "vsi").map((p) => ({ produkt: p.kljuc as Exclude<Produkt, "vsi">, ime: p.ime, znesek: null })),
    casovnica: meseci(konec, n).map((v) => ({ ...v, znesek: null })),
  };
}

function znan(p: Prihodek): boolean {
  return p.znesek !== null && Number.isFinite(p.znesek);
}

/** Vsota znanih zneskov; null, ko so vsi zneski neznani (vsote ne poznamo, ni 0); 0 samo, ko prihodkov ni. */
function vsota(izbor: Prihodek[]): number | null {
  const znani = izbor.filter(znan);
  if (!znani.length) return izbor.length ? null : 0;
  return znani.reduce((a, p) => a + (p.znesek as number), 0);
}

/** Povzetek prihodkov za produkt in obdobje; brez podatkov (null/undefined) prazno stanje. Nič se ne izmišljuje. */
export function povzetekPrihodkov(
  prihodki: Prihodek[] | null | undefined,
  produkt: Produkt,
  r: Razpon,
  konec: string,
  n = 6,
): PovzetekPrihodkov {
  if (!prihodki) return prazniPrihodki(konec, n);
  const zaProd = prihodki.filter((p) => produkt === "vsi" || p.produkt === produkt);
  const vObdobju = zaProd.filter((p) => vRazponu(p.datum, r));
  const nove = vObdobju.filter((p) => p.nova);
  const noviZnani = nove.filter(znan).length;
  const novi = vsota(nove);
  return {
    na: null,
    skupaj: vsota(vObdobju),
    novi,
    ponavljajoci: vsota(vObdobju.filter((p) => !p.nova)),
    steviloPoslov: nove.length,
    povprecje: noviZnani && novi !== null ? novi / noviZnani : null,
    brezZneska: vObdobju.filter((p) => !znan(p)).length,
    poProduktih: PRODUKTI.filter((p) => p.kljuc !== "vsi").map((p) => ({
      produkt: p.kljuc as Exclude<Produkt, "vsi">,
      ime: p.ime,
      znesek: vsota(vObdobju.filter((x) => x.produkt === p.kljuc)),
    })),
    casovnica: meseci(konec, n).map((v) => ({ ...v, znesek: vsota(zaProd.filter((p) => vRazponu(p.datum, v))) })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Pregled v3 (6. 11. 2026, po pregledu podatkov): popravki štetja kot NOVE funkcije. Vse zgoraj ostane, kot je
// (parity); stran uporablja spodnje. Vsaka funkcija pove, kaj popravi in zakaj.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// ——— obdobje ———

/** Obdobje je v celoti pred prvim zapisom: številk ne poznamo (N/A), niso 0. */
export function predPrvimZapisom(zdaj: Razpon, prvi: string | null): boolean {
  return zdaj !== null && prvi !== null && zdaj.do < prvi;
}

/**
 * Kot obdobjeSPrimerjavo(), a primerja samo, kadar je CELO prejšnje obdobje na ali po prvem zapisu. Prej je bil dovolj
 * že en dan podatkov (npr. 16.–26. 10. z zapisi samo 26. 10.) in kartica je kazala »+1450 %«.
 */
export function obdobjeSCeloPrimerjavo(
  kljuc: ObdobjeKljuc,
  danes: string,
  poljubno: { od?: string; do?: string } | undefined,
  prvi: string | null,
): ObdobjeSPrimerjavo {
  const { zdaj, prej: prejCelo } = razpon(kljuc, danes, poljubno);
  const prej = prejCelo && prvi && prejCelo.od >= prvi ? prejCelo : null;
  return { zdaj, prej, prejCelo, niPrimerjave: prejCelo !== null && prej === null };
}

// ——— trend po koledarskih tednih ———

/**
 * Zadnjih n koledarskih tednov (pon–ned), starejši najprej. Zadnji je teden, v katerem je »konec«, in se konča na
 * »konec«, zato je zadnji stolpec isto kot »Ta teden« (pri koncu danes). Prej so bili tedni drseči (7 dni do konca).
 */
export function tedniPonNed(konec: string, n = 8): Vedro[] {
  const pon = ponedeljek(konec);
  return Array.from({ length: n }, (_, i) => {
    const od = premakniDan(pon, -7 * (n - 1 - i));
    return { od, do: i === n - 1 ? konec : premakniDan(od, 6) };
  });
}

/** Predstavitveni maili: podjetja (vsako enkrat), ne dogodki; drugo kot stejZaKartico(). */
export function stejZaKarticoPregleda(dogodki: Dogodek[], kljuc: Kartica["kljuc"], r: Razpon): number {
  if (kljuc === "prvi") return enaNaPodjetje(dogodki, "prvi", r).size;
  return stejZaKartico(dogodki, kljuc, r);
}

/** Trend po koledarskih tednih; teden v celoti pred prvim zapisom je null (ni podatkov, ne 0). */
export function trendPoTednih(dogodki: Dogodek[], kljuc: Kartica["kljuc"], konec: string, prvi: string | null, n = 8): TockaTrenda[] {
  return tedniPonNed(konec, n).map((v) => ({ ...v, stevilo: !prvi || v.do < prvi ? null : stejZaKarticoPregleda(dogodki, kljuc, v) }));
}

// ——— kartice ———

/** 1 nedostavljen mail, 2 nedostavljena maila, 3–4 nedostavljeni maili, 5+ nedostavljenih mailov. */
function nedostavljeniBesedilo(n: number): string {
  const r = n % 100;
  if (r === 1) return `${n} nedostavljen mail`;
  if (r === 2) return `${n} nedostavljena maila`;
  if (r === 3 || r === 4) return `${n} nedostavljeni maili`;
  return `${n} nedostavljenih mailov`;
}

function mailovBesedilo(n: number): string {
  const r = n % 100;
  return `${n} ${r === 1 ? "mail" : r === 2 ? "maila" : r === 3 || r === 4 ? "maili" : "mailov"}`;
}

/** Podjetja s predstavitvenim mailom v obdobju, ki imajo v Harveyju stanje »nedostavljeno« (mail se je vrnil). */
export function nedostavljeni(dogodki: Dogodek[], podjetja: PregledPodatki["podjetja"], r: Razpon): number {
  return [...enaNaPodjetje(dogodki, "prvi", r)].filter((dom) => podjetja[dom]?.stanje === "nedostavljeno").length;
}

/**
 * Odzivi v obdobju po stanju danes, po istem pravilu kot kartice(): ne = podjetje je kadarkoli reklo ne (odziv ali
 * kasnejši klic »ne zanima«); da = postalo je lead in ni reklo ne; ostalo ne zdaj. Za skupine v predalu Odzivi.
 */
export function razdeliOdzive(dogodki: Dogodek[], r: Razpon): { da: Set<string>; ne: Set<string>; neZdaj: Set<string> } {
  const podjetja = enaNaPodjetje(dogodki, "odgovor", r);
  const leadi = new Set(dogodki.filter((e) => e.korak === "lead").map((e) => e.domena));
  const ne = new Set(
    dogodki
      .filter((e) => podjetja.has(e.domena) && ((e.korak === "odgovor" && e.negativen) || (e.korak === "klic" && e.izid === "ne_zanima")))
      .map((e) => e.domena),
  );
  const da = new Set([...podjetja].filter((dom) => leadi.has(dom) && !ne.has(dom)));
  const neZdaj = new Set([...podjetja].filter((dom) => !da.has(dom) && !ne.has(dom)));
  return { da, ne, neZdaj };
}

export type KarticaPregleda = KarticaPolna & {
  /** Namig k drobni vrstici (npr. da/ne/ne zdaj je stanje danes). */
  dodatnoNamig?: string;
};

/** N/A za obdobje pred prvim zapisom (ena vrstica nad karticami pove, od kdaj so zapisi). */
export const NI_ZAPISOV = "ni zapisov";

/**
 * karticeSTrendom() s popravki:
 * - Predstavitveni maili štejejo PODJETJA (enota je »podjetij«; kartica je hkrati »kontaktirana podjetja«). Ko je
 *   mailov več kot podjetij (ponovno poslan mail, mail za drug produkt), je število mailov drobno pod številom.
 * - Nedostavljeni maili (Harvey: stanje »nedostavljeno«) so drobno pod številom; v številu ostanejo (odloči Luka).
 * - Trend po koledarskih tednih (pon–ned), kot Ta teden, Prejšnji teden in koledar.
 * - Obdobje v celoti pred prvim zapisom: vse kartice N/A, ne 0.
 */
export function karticePregleda(
  dogodki: Dogodek[],
  podjetja: PregledPodatki["podjetja"],
  zdaj: Razpon,
  prej: Razpon,
  brezVidea: boolean,
  konec: string,
  prvi: string | null,
  n = 8,
): KarticaPregleda[] {
  const brez = predPrvimZapisom(zdaj, prvi);
  return kartice(dogodki, zdaj, prej, brezVidea).map((k): KarticaPregleda => {
    let out: KarticaPregleda = {
      ...k,
      ime: imeKartice(k.kljuc),
      skupina: REZULTATI.includes(k.kljuc as Korak) ? "rezultat" : "aktivnost",
      sprememba: sprememba(0, null),
      trend: [],
    };
    if (k.kljuc === "prvi") {
      const podj = enaNaPodjetje(dogodki, "prvi", zdaj).size;
      const samoKlic = samoSKlicem(dogodki, zdaj);
      const nedost = nedostavljeni(dogodki, podjetja, zdaj);
      const deli = [
        k.stevilo !== podj ? mailovBesedilo(k.stevilo) : "",
        nedost ? nedostavljeniBesedilo(nedost) : "",
        samoKlic ? `+${samoKlic} samo s klicem` : "",
      ].filter(Boolean);
      out = {
        ...out,
        stevilo: podj,
        prej: prej !== null ? enaNaPodjetje(dogodki, "prvi", prej).size : null,
        enota: "podjetij",
        dodatno: deli.length ? deli.join(" · ") : undefined,
      };
    }
    if (k.kljuc === "odgovor" && k.dodatno) {
      out.dodatnoNamig = "Stanje danes za podjetja, ki so se v obdobju prvič odzvala.";
    }
    if (brez) out = { ...out, na: NI_ZAPISOV, dodatno: undefined, dodatnoNamig: undefined, prej: null };
    out.sprememba = out.na ? sprememba(0, null) : sprememba(out.stevilo, out.prej);
    out.trend = out.na
      ? tedniPonNed(konec, n).map((v) => ({ ...v, stevilo: null }))
      : trendPoTednih(dogodki, k.kljuc, konec, prvi, n);
    return out;
  });
}

/**
 * Seznam za kartico, vedno toliko vrstic, kot kaže karticePregleda(): predstavitveni maili ena vrstica na podjetje
 * (najnovejši mail v obdobju), drugo kot seznamKartice().
 */
export function seznamKarticePregleda(dogodki: Dogodek[], kljuc: Kartica["kljuc"], r: Razpon): Dogodek[] {
  const vse = seznamKartice(dogodki, kljuc, r);
  if (kljuc !== "prvi") return vse;
  const videno = new Set<string>();
  return vse.filter((e) => (videno.has(e.domena) ? false : (videno.add(e.domena), true)));
}

// ——— tabela: stopnje od podjetij ———

export type VrsticaAktivnostiPodjetja = VrsticaListka & {
  /**
   * Različna podjetja, ki so to aktivnost v obdobju dobila pred prvim rezultatom (ali rezultata nimajo). Osnova za
   * response in conversion rate; števec (odziv, lead) šteje podjetja, zato mora biti tudi imenovalec v podjetjih.
   */
  podjetja: number;
  /** Odziv / podjetja (»100 %«; »–« brez imenovalca). */
  odzivOdstotek: string;
  /** Lead / podjetja. */
  leadOdstotek: string;
  /** N/A: aktivnost se ne beleži (video brez povezave) ali obdobje je pred prvim zapisom. */
  na?: string;
};

/**
 * tabelaAktivnosti() s pravim imenovalcem. Prej so bile v imenovalcu vse aktivnosti v obdobju (dogodki), v števcu pa
 * podjetja: klic po že danem odzivu (puntar-transport.si 4. 11.) ne more nikoli v števec, v imenovalcu pa je bil
 * (»7/8 = 88 %« namesto 7/7 = 100 %). Zdaj sta oba v podjetjih in z isto mejo kot poAktivnostih(): aktivnost šteje,
 * če je bila ob prvem rezultatu podjetja ali prej. Števci (stevilo, odziv, lead …) so isti kot v poAktivnostih().
 */
export function tabelaAktivnostiPodjetja(
  dogodki: Dogodek[],
  r: Razpon,
  brezVidea: boolean,
  brezZapisov = false,
): VrsticaAktivnostiPodjetja[] {
  const meja = new Map<string, string>();
  for (const e of dogodki) {
    if (!REZULTATI.includes(e.korak)) continue;
    const c = e.cas ?? "9999";
    const star = meja.get(e.domena);
    if (star === undefined || c < star) meja.set(e.domena, c);
  }
  const osnova = new Map<Korak, Set<string>>(AKTIVNOSTI.map((a) => [a, new Set<string>()]));
  for (const e of dogodki) {
    if (!AKTIVNOSTI.includes(e.korak) || !vRazponu(e.cas, r)) continue;
    const m = meja.get(e.domena);
    if (m !== undefined && (e.cas ?? "") > m) continue; // po prvem rezultatu: v števec ne more, v imenovalec ne sodi
    osnova.get(e.korak)!.add(e.domena);
  }
  return poAktivnostih(dogodki, r).map((v) => {
    const podj = osnova.get(v.aktivnost)!.size;
    const na = brezZapisov
      ? NI_ZAPISOV
      : v.aktivnost === "video" && brezVidea && v.stevilo === 0
        ? "povezave na video še ni"
        : undefined;
    return { ...v, podjetja: podj, odzivOdstotek: odstotek(v.odziv, podj), leadOdstotek: odstotek(v.lead, podj), na };
  });
}

// ——— lijak: gnezdena veriga ———

/** Množice verige (podjetja) po stopnji rezultata; vsaka je podmnožica prejšnje. */
export function verigaLijaka(dogodki: Dogodek[], r: Razpon): Map<Korak, Set<string>> {
  const kohorta = kontaktirana(dogodki, r);
  const out = new Map<Korak, Set<string>>();
  let prej = kohorta;
  for (const k of REZULTATI) {
    const tu = new Set(dogodki.filter((e) => e.korak === k && kohorta.has(e.domena)).map((e) => e.domena));
    const presek = new Set([...prej].filter((dom) => tu.has(dom)));
    out.set(k, presek);
    prej = presek;
  }
  return out;
}

/**
 * Harvey zapiše lead tudi za podjetje s stopnjo »sestanek« ali »posel« brez zabeleženega odziva in posel iz stanja
 * »kupil« brez sestanka, zato lead ni nujno med odzivi in posel ni nujno med sestanki. Veriga zato šteje presek:
 * odziv = kohorta z odzivom, lead = odzivi, ki so postali lead, sestanek = leadi s sestankom, posel = sestanki s
 * poslom. Pretvorba je tako vedno največ 100 %. Kdor je do stopnje prišel mimo verige, je v »zunajVerige« (na
 * karticah je). Aktivnosti so iste kot v stopnjeLijaka().
 */
export function stopnjeLijakaVeriga(
  dogodki: Dogodek[],
  r: Razpon,
  brezVidea: boolean,
): { stopnje: StopnjaLijaka[]; osnova: number; samoKlic: number; zunajVerige: { kljuc: Korak; ime: string; stevilo: number }[] } {
  const osnovno = stopnjeLijaka(dogodki, r, brezVidea);
  const veriga = verigaLijaka(dogodki, r);
  const n0 = osnovno.osnova;
  let prej = n0;
  const zunajVerige: { kljuc: Korak; ime: string; stevilo: number }[] = [];
  const stopnje = osnovno.stopnje.map((s): StopnjaLijaka => {
    if (s.skupina !== "rezultat") return s;
    const n = veriga.get(s.kljuc)!.size;
    if (s.stevilo > n) zunajVerige.push({ kljuc: s.kljuc, ime: s.ime, stevilo: s.stevilo - n });
    const out = { ...s, stevilo: n, odZacetka: odstotek(n, n0), pretvorba: odstotek(n, prej), delez: n0 ? (n / n0) * 100 : 0 };
    prej = n;
    return out;
  });
  return { stopnje, osnova: n0, samoKlic: osnovno.samoKlic, zunajVerige };
}

/** Seznam za stopnjo verige: toliko vrstic, kot kaže stopnjeLijakaVeriga(); aktivnosti kot seznamLijaka(). */
export function seznamLijakaVeriga(dogodki: Dogodek[], korak: Korak, r: Razpon): Dogodek[] {
  const vse = seznamLijaka(dogodki, korak, r);
  if (!REZULTATI.includes(korak)) return vse;
  const v = verigaLijaka(dogodki, r).get(korak)!;
  return vse.filter((e) => v.has(e.domena));
}

// ——— prihodki: posli namesto vrstic ———

export type PovzetekPrihodkovPosli = PovzetekPrihodkov & {
  /** Novi posli z znanim zneskom (posel = nova stranka + produkt); null, dokler prihodki niso povezani. */
  posliZZneskom: number | null;
  /** Novi posli brez znanega zneska. */
  posliBrezZneska: number;
};

/**
 * povzetekPrihodkov() s štetjem poslov: prej je bil posel vsaka vrstica z »nova« (dve vrstici iste stranke = dva
 * posla), povprečje pa deljeno z vrsticami. Zdaj je posel nova stranka + produkt; povprečje = novi prihodki / posli
 * z znanim zneskom. steviloPoslov = vsi novi posli (z zneskom ali brez).
 */
export function povzetekPrihodkovPosli(
  prihodki: Prihodek[] | null | undefined,
  produkt: Produkt,
  r: Razpon,
  konec: string,
  n = 6,
): PovzetekPrihodkovPosli {
  const osnova = povzetekPrihodkov(prihodki, produkt, r, konec, n);
  if (!prihodki) return { ...osnova, posliZZneskom: null, posliBrezZneska: 0 };
  const nove = prihodki.filter((p) => (produkt === "vsi" || p.produkt === produkt) && p.nova && vRazponu(p.datum, r));
  const kljuc = (p: Prihodek) => `${p.stranka}\u0000${p.produkt}`;
  const vsi = new Set(nove.map(kljuc));
  const zZneskom = new Set(nove.filter(znan).map(kljuc));
  return {
    ...osnova,
    steviloPoslov: vsi.size,
    posliZZneskom: zZneskom.size,
    posliBrezZneska: vsi.size - zZneskom.size,
    povprecje: zZneskom.size && osnova.novi !== null ? osnova.novi / zZneskom.size : null,
  };
}
