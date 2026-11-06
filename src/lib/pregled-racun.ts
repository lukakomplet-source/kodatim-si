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
};

export const PRODUKTI = [
  { kljuc: "vsi", ime: "Vsi produkti" },
  { kljuc: "panik", ime: "Panic button" },
  { kljuc: "monitoring", ime: "Monitoring" },
  { kljuc: "spremstvo", ime: "Spremstvo" },
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

function enaNaPodjetje(dogodki: Dogodek[], korak: Korak, r: Razpon): Set<string> {
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
