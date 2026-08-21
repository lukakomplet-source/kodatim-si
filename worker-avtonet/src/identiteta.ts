/**
 * Identiteta vozila: iz oglasa naredi normaliziran opis TEGA avta.
 *
 * Zakaj sploh obstaja: kohorta poslov je bila prej "model + oznaka motorja iz
 * naziva". Vir za vse Tesle vpiše model dobesedno "Model" in pusti kW prazen,
 * zato so Model 3, S, X in Y padli v eno skupino s cenami 15.490–75.000 € —
 * mediana take skupine ni cena nobenega resničnega avta. Enako pri Porscheju,
 * kjer je model za Carrero, 4S in GTS enotno "911".
 *
 * Vse tukaj bere IZKLJUČNO podatke, ki jih že imamo (naziv, oprema, opis,
 * dodatni podatki). Nič se ne dodaja z ugibanjem: kjer se izvedenke ne da
 * prebrati, se to pove z nizkim zaupanjem, ne z izmišljeno vrednostjo.
 *
 * Mera zaupanja je pomembnejša od same vrednosti — posel, ki stoji na ugibanju,
 * ni posel.
 */

export type VirIzvedenke = "vin" | "naziv-znamka" | "naziv-motor" | "moc" | "ni";

export type Identiteta = {
  druzinaModela: string;
  generacija: string | null;
  izvedenka: string | null;
  izvedenkaVir: VirIzvedenke;
  /** 0–100. Pod 50 avto ne more biti kandidat za posel. */
  zaupanje: number;
  pogon: "awd" | "rwd" | "fwd" | "?";
  menjalnikDruzina: string;
  karoserija: string;
  gorivo: string;
  vin: string | null;
  /** Ključna oprema z utežmi — glej OPREMA_SLOVAR. */
  oprema: Record<string, boolean>;
  /** Seštevek uteži najdene ključne opreme; za primerjavo opremljenosti. */
  opremaTeza: number;
};

export type OglasZaIdentiteto = {
  naziv: string | null;
  znamka: string | null;
  model: string | null;
  letnik: number | null;
  kw: number | null;
  gorivo: string | null;
  menjalnik: string | null;
  karoserija: string | null;
  pogon: string | null;
  oprema: string | null;
  opis: string | null;
  oprema_znacilke: string[] | null;
  dodatni_podatki: Record<string, unknown> | null;
};

// ---------------------------------------------------------------- oprema

/**
 * Ključna oprema, ki premakne ceno, z utežjo pomembnosti.
 *
 * Merjeno na 55.003 aktivnih oglasih: besedilo omenja panoramo 6.514-krat,
 * obstoječe oznake pa jo imajo 234-krat; Matrix 1.594 proti 74; premium avdio
 * 3.662 proti nič. Podatek je torej ves čas bil tu, samo prebran ni bil — zato
 * je ta slovar najcenejša izboljšava v celem sistemu.
 *
 * Utež: 3 = spremeni razred avta (zračno vzmetenje, keramika, Chrono),
 *       2 = jasno vidna v ceni (Matrix, panorama, HUD, premium avdio),
 *       1 = prijetna, a ne odloča (vlečna, memory, gretje).
 */
export const OPREMA_SLOVAR: [string, RegExp, number][] = [
  ["zracno_vzmetenje", /zra[cč]n\w*\s*vzmet|air\s*susp|luftfeder|\bzra[cč]no\b/i, 3],
  ["adaptivno_vzmetenje", /adaptiv\w*\s*(vzmet|blazilnik)|\bpasm\b|\bdcc\b|magnetic\s*ride|adaptive\s*(damp|susp)|\bedc\b/i, 3],
  ["keramicne_zavore", /kerami[cč]n\w*\s*zavor|ceramic\s*brake|\bpccb\b|\bpcbb\b|carbon\s*ceramic/i, 3],
  ["sport_chrono", /sport\s*chrono|chrono\s*paket/i, 3],
  ["zadnje_krmiljenje", /zadnj\w*\s*(os\w*\s*)?krmilj|four\s*wheel\s*steer|4\s*wheel\s*steer|hinterachslenk|rear\s*axle\s*steer/i, 3],
  ["sport_diferencial", /sport\s*diferencial|limited\s*slip|\blsd\b|torsen|e[\s-]*diff|zaporo?\s*diferencial/i, 3],
  ["matrix_led", /matrix[\s-]*(led|[zž]aromet|lu[cč]|svet|light)?|\bmatrix\b/i, 2],
  ["laser_luci", /laser[\s-]*(lu[cč]|light|[zž]aromet)|\blaserlight\b/i, 2],
  ["panorama", /panoram\w*/i, 2],
  ["hud", /\bhud\b|head[\s-]*up/i, 2],
  ["kamera_360", /360\s*(kamer|kam\b|view|stopinj)|kamera\s*360|\bk360\b|surround\s*view/i, 2],
  ["premium_audio", /burmester|bang\s*&?\s*olufsen|harman[\s\/&-]*kardon|\bbose\b|meridian|\bb&o\b|\bnaim\b|dynaudio|bowers/i, 2],
  ["sedezi_hlajenje", /hlaj\w*\s*sede|ventilir\w*\s*sede|ventilated\s*seat|klimatizir\w*\s*sede/i, 2],
  ["sedezi_masaza", /masa[zž]\w*\s*sede|massage\s*seat/i, 2],
  ["sportni_izpuh", /[sš]portni\s*izpuh|sport\s*(exhaust|auspuff)|akrapovi[cč]|valvetronic\s*izpuh/i, 2],
  ["nocni_vid", /no[cč]ni\s*vid|night\s*vision|nachtsicht/i, 2],
  ["skoljkasti_sedezi", /[sš]koljk\w*\s*sede|bucket\s*seat|schalensitz|sportsitz|carbon\s*seat/i, 2],
  ["karbon_paket", /karbon\w*\s*(paket|streh|deta)|carbon\s*(paket|package|pack|fibre|fiber)/i, 2],
  ["paket_m_sport", /\bm[\s-]*(sport|paket|package)\b|\bmsport\b|m[\s-]*sportpaket/i, 2],
  ["paket_amg", /amg[\s-]*(line|paket|package|sport|styling)/i, 2],
  ["paket_sline", /\bs[\s-]*line\b|\bsline\b/i, 2],
  // Virtualni kokpit je pri 15.473 aktivnih oglasih omenjen v besedilu in ga
  // vir sam nikoli ne označi — prav zato ga je vredno brati tu.
  ["virtualni_kokpit", /virtual\s*cockpit|virtualni\s*kokpit|digitaln\w*\s*(merilnik|armatur|kokpit|instrument)|digital\s*cockpit|\bvirtual\b/i, 2],
  ["velika_platisca", /\b(1[89]|2[0-3])\s*(?:col|"|cole|palc)|alu\s*(1[89]|2[0-3])\b|\br(1[89]|2[0-3])\b/i, 1],
  ["acc", /\bacc\b|adaptiv\w*\s*tempomat|adaptive\s*cruise|distronic|radar\s*tempomat/i, 1],
  ["lane_assist", /lane\s*assist|asistenc\w*\s*za\s*vozni\s*pas|opozorilo\s*na\s*vozni\s*pas|ohranjanj\w*\s*pasu/i, 1],
  ["blind_spot", /blind\s*spot|mrtvi\s*kot|mrtvem\s*kotu/i, 1],
  ["ambientna", /ambientn\w*\s*(osvetlit|luč|luc)|ambient\s*light/i, 1],
  ["adaptive_light", /adaptivn\w*\s*(luč|luc|žaromet|zaromet|osvetlit)|adaptive\s*(light|headl)/i, 1],
  ["streha_odpiranje", /(son[cč]n\w*|pomi[cč]n\w*|odpira\w*|steklen\w*)\s*streh|sunroof|schiebedach/i, 1],
  ["memory_sedezi", /memory\s*(sede|seat|paket|funkcij)|spomin\w*\s*sede/i, 1],
  ["vlecna", /vle[cč]n\w*\s*(kljuk|napra)|\bkljuka\b|anh[aä]nger|towbar/i, 1],
  ["keyless", /keyless|brezkl[ju][cč]|comfort\s*access|smart\s*(entry|key)/i, 1],
  ["sedezi_gretje", /gret\w*\s*sede|ogrevan\w*\s*sede|heated\s*seat/i, 1],
  ["navigacija", /navigacij|\bnavi\b|\bnav\b/i, 1],
  ["carplay", /apple\s*carplay|android\s*auto|\bcarplay\b/i, 1],
  ["el_prtljaznik", /el(?:\.|ektri[cč]n\w*)?\s*prtlja[zž]nik|power\s*tailgate|hands?\s*free\s*prtlja/i, 1],
  ["alu_platisca", /alu\s*plati|platišč|platisc|alloy/i, 1],
];

/** Oznake, ki jih vir sam že normalizira — jemljemo jih kot dejstvo. */
const ZNACILKE_PRESLIKAVA: Record<string, string> = {
  hud: "hud",
  kamera_360: "kamera_360",
  acc: "acc",
  panorama: "panorama",
  zracno_vzmetenje: "zracno_vzmetenje",
  matrix_led: "matrix_led",
  laser_luci: "laser_luci",
  memory: "memory_sedezi",
  keyless: "keyless",
  sedezi_gretje: "sedezi_gretje",
  sedezi_masaza: "sedezi_masaza",
  sedezi_hlajenje: "sedezi_hlajenje",
  vlecna: "vlecna",
  streha: "streha_odpiranje",
  sportni_sedezi: "skoljkasti_sedezi",
  lane_assist: "lane_assist",
  blind_spot: "blind_spot",
  ambientna: "ambientna",
  adaptive_light: "adaptive_light",
  alu_platisca: "alu_platisca",
  navigacija: "navigacija",
  el_prtljaznik: "el_prtljaznik",
  apple_carplay: "carplay",
  android_auto: "carplay",
};

export function preberiOpremo(o: OglasZaIdentiteto): { oprema: Record<string, boolean>; teza: number } {
  // Opis je omejen: pri dolgih oglasih je konec pogosto pravna navlaka in
  // seznam drugih vozil v salonu, kar bi lastnosti pripisalo napačnemu avtu.
  const besedilo = `${o.naziv ?? ""} ${o.oprema ?? ""} ${(o.opis ?? "").slice(0, 2000)}`;
  const najdeno: Record<string, boolean> = {};
  let teza = 0;

  for (const [ime, vzorec, t] of OPREMA_SLOVAR) {
    if (vzorec.test(besedilo)) {
      najdeno[ime] = true;
      teza += t;
    }
  }
  for (const z of o.oprema_znacilke ?? []) {
    const ime = ZNACILKE_PRESLIKAVA[z];
    if (ime && !najdeno[ime]) {
      najdeno[ime] = true;
      teza += OPREMA_SLOVAR.find(([i]) => i === ime)?.[2] ?? 1;
    }
  }
  return { oprema: najdeno, teza };
}

// ------------------------------------------------------------- normalizacija

/**
 * Naziv brez marketinškega smetja.
 *
 * Prva različica tega parserja je iz "KAMERA 360" potegnila BMW izvedenko "360",
 * iz "150.000 km" pa "150". Zato se najprej pobrišejo številke, ki pripadajo
 * opremi, kilometrom in cenam, šele nato se iščejo oznake.
 */
export function cistNaziv(naziv: string | null): string {
  return (naziv ?? "")
    .toLowerCase()
    .replace(/kamera\s*360|360\s*kam\w*|\bk360\b|\b360\b/g, " ")
    .replace(/\b\d{1,3}[.,]\d{3}\s*(km|€|eur)/g, " ")
    .replace(/\b\d{4,}\s*(km|€|eur)/g, " ")
    .replace(/\bddv\b|\bakcija\b|\bugodno\b|\bnovo\b|\btop\b|\bgarancija\b/g, " ")
    .replace(/[|•·—_,;!?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Serija (BMW) ali razred (Mercedes) iz polja model — za preverjanje izvedenke. */
function serijaBmw(model: string | null): string | null {
  return (model ?? "").toLowerCase().match(/serija\s*([1-8]|x[1-7]|z\d|i\d)/)?.[1] ?? null;
}
function razredMb(model: string | null): string | null {
  return (model ?? "").toLowerCase().match(/^([a-z]{1,3})[\s-]*razred/)?.[1] ?? null;
}

/**
 * Družina modela — kaj avto sploh je.
 *
 * Za večino znamk je "znamka model" dovolj. Popravljata se dva primera, kjer
 * vir zapiše premalo: Tesla (model = "Model" za vse) in Porsche 911 (ena
 * oznaka za pol stoletja avtomobilov).
 */
export function druzinaModela(o: OglasZaIdentiteto): { druzina: string; generacija: string | null } {
  const n = cistNaziv(o.naziv);
  const z = (o.znamka ?? "").toLowerCase().trim();
  const model = (o.model ?? "").toLowerCase().trim();

  if (z === "tesla") {
    const m = n.match(/model\s*([3sxy])\b/);
    return { druzina: m ? `tesla model ${m[1]}` : "tesla model ?", generacija: null };
  }

  if (z === "porsche" && model === "911") {
    const gen = n.match(/\b(99[1236]|997|930|964|993)\b/)?.[1] ?? null;
    if (gen) return { druzina: "porsche 911", generacija: gen };
    const l = o.letnik ?? 0;
    const doba =
      l >= 2024 ? "992.2" : l >= 2019 ? "992" : l >= 2016 ? "991.2" : l >= 2012 ? "991" :
      l >= 2009 ? "997.2" : l >= 2005 ? "997" : l >= 1998 ? "996" : l >= 1994 ? "993" : "klasik";
    return { druzina: "porsche 911", generacija: `${doba}~` };
  }

  // Generacijske oznake, ki jih prodajalci sami pišejo (BMW F30, VW Golf 7 …).
  const gen =
    n.match(/\b([fge]\d{2})\b/)?.[1] ??
    n.match(/\bgolf\s*(\d)\b/)?.[1] ??
    n.match(/\bmk\s?(\d)\b/)?.[1] ??
    null;

  return { druzina: `${z} ${model}`.trim(), generacija: gen };
}

/**
 * Izvedenka — Carrera 4S, M340i, C43 AMG, 40 TDI, Long Range.
 *
 * Vsaka znamka svojo oznako piše drugače, zato ni enega pravila za vse. Kjer
 * ima znamka številčno oznako (BMW, Mercedes), se ta preveri proti seriji oz.
 * razredu iz baze: "320d" sme biti izvedenka samo pri seriji 3.
 */
export function izvedenka(o: OglasZaIdentiteto): { v: string | null; vir: VirIzvedenke } {
  const n = cistNaziv(o.naziv);
  const z = (o.znamka ?? "").toLowerCase().trim();

  if (z === "porsche") {
    for (const [re, v] of [
      [/\bgt3\s*rs\b/, "gt3rs"], [/\bgt3\b/, "gt3"], [/\bgt2\s*rs\b/, "gt2rs"], [/\bgt2\b/, "gt2"],
      [/turbo\s*s\b/, "turbo-s"], [/\bturbo\b/, "turbo"], [/\bgts\b/, "gts"],
      [/carrera\s*4\s*s\b|\bc4s\b|\b4s\b/, "carrera-4s"], [/carrera\s*4\b/, "carrera-4"],
      [/carrera\s*s\b/, "carrera-s"], [/\bcarrera\b/, "carrera"],
      [/\bgt4\s*rs\b/, "gt4rs"], [/\bgt4\b/, "gt4"], [/\bspyder\b/, "spyder"],
    ] as [RegExp, string][]) {
      if (re.test(n)) return { v, vir: "naziv-znamka" };
    }
  }

  if (z === "tesla") {
    if (/\bplaid\b/.test(n)) return { v: "plaid", vir: "naziv-znamka" };
    if (/performance/.test(n)) return { v: "performance", vir: "naziv-znamka" };
    if (/long\s*range|\blr\b/.test(n)) return { v: "long-range", vir: "naziv-znamka" };
    if (/standard\s*range|\bsr\+?\b/.test(n)) return { v: "standard-range", vir: "naziv-znamka" };
    const p = n.match(/\bp?\d{2,3}d\b/)?.[0];
    if (p) return { v: p, vir: "naziv-znamka" };
    if (/\brwd\b|\bbase\b/.test(n)) return { v: "base-rwd", vir: "naziv-znamka" };
  }

  if (z === "bmw") {
    const s = serijaBmw(o.model);
    // "M sport" je paket opreme, ne model M3 — brez te izjeme bi vsak 320d
    // z M paketom postal M3.
    if (/\bm[2-8]\b/.test(n) && !/\bm[\s-]*(sport|paket|package)\b/.test(n)) {
      return { v: n.match(/\bm[2-8]\b/)![0], vir: "naziv-znamka" };
    }
    const mPerf = n.match(/\bm(\d)(\d{2})\s?([di])?\b/);
    if (mPerf && (s === null || mPerf[1] === s)) {
      return { v: `m${mPerf[1]}${mPerf[2]}${mPerf[3] ?? ""}`, vir: "naziv-znamka" };
    }
    if (s !== null && /^x/.test(s)) {
      const x = n.match(/xdrive\s*(\d{2})\s?([di])?/) ?? n.match(/\bs?drive\s*(\d{2})\s?([di])?/);
      if (x) return { v: `${s}-${x[1]}${x[2] ?? ""}`, vir: "naziv-znamka" };
    } else if (s !== null) {
      for (const kos of n.match(/\b[1-8]\d{2}\s?(d|i|e|xd)?\b/g) ?? []) {
        const m = kos.trim().match(/^([1-8])(\d{2})\s?(d|i|e|xd)?$/);
        if (m && m[1] === s) return { v: `${m[1]}${m[2]}${m[3] ?? ""}`, vir: "naziv-znamka" };
      }
    }
  }

  if (z.startsWith("mercedes")) {
    const r = razredMb(o.model);
    const amg = n.match(/\b(\d{2})\s*amg\b|\bamg\s*(\d{2})\b/);
    if (amg) return { v: `amg${amg[1] ?? amg[2]}`, vir: "naziv-znamka" };
    const m = n.match(/\b([a-z]{1,3})\s?(\d{3})\s?(d|cdi|bluetec)?\b/);
    if (m && r !== null && m[1] === r) {
      return { v: `${m[1]}${m[2]}${m[3] ? "d" : ""}`, vir: "naziv-znamka" };
    }
    if (r !== null) {
      const st = n.match(/\b(\d{3})\s?(d|cdi)?\b/);
      if (st) return { v: `${r}${st[1]}${st[2] ? "d" : ""}`, vir: "naziv-znamka" };
    }
  }

  if (z === "audi") {
    const rs = n.match(/\brs\s?(\d)\b/);
    if (rs) return { v: `rs${rs[1]}`, vir: "naziv-znamka" };
    // "S line" je paket, "S4" je model — ista črka, drug pomen.
    if (/\bs\s?[1-8]\b/.test(n) && !/\bs[\s-]*line\b/.test(n)) {
      return { v: n.match(/\bs\s?[1-8]\b/)![0].replace(/\s/g, ""), vir: "naziv-znamka" };
    }
    const m = n.match(/\b(\d{2})\s?(tdi|tfsi|tsi|e-tron)\b/);
    if (m) return { v: `${m[1]}${m[2]}`, vir: "naziv-znamka" };
  }

  if (z === "volkswagen") {
    if (/\bgti\b/.test(n)) return { v: "gti", vir: "naziv-znamka" };
    if (/\bgtd\b/.test(n)) return { v: "gtd", vir: "naziv-znamka" };
    if (/\bgte\b/.test(n)) return { v: "gte", vir: "naziv-znamka" };
    if (/\bgolf\s*r\b|\br\s*line\b/.test(n) === false && /\br\b\s*4motion/.test(n)) {
      return { v: "r", vir: "naziv-znamka" };
    }
  }

  if (z === "skoda" || z === "škoda") {
    if (/\brs\b/.test(n)) return { v: "rs", vir: "naziv-znamka" };
  }

  // Splošno: oznaka motorja, kot jo piše trg (2.0 TDI, 1.5 dCi).
  const g = n.match(/\b(\d[.,]\d)\s?(tdi|tsi|tfsi|dci|crdi|hdi|jtd|cdti|mjet|thp|bluehdi|d|i|t)\b/);
  if (g) return { v: `${g[1].replace(",", ".")}${g[2]}`, vir: "naziv-motor" };

  // Zadnja možnost: moč. Loči šibke od močnih, ne pa izvedenk med sabo.
  if (o.kw) return { v: `kw${Math.round(o.kw / 10)}`, vir: "moc" };
  return { v: null, vir: "ni" };
}

/** Pogon: vir ga skoraj ne zapiše (30 % polnost, praktično le 4×4). */
export function pogonNorm(o: OglasZaIdentiteto): "awd" | "rwd" | "fwd" | "?" {
  const n = cistNaziv(o.naziv);
  if (/xdrive|quattro|4matic|4motion|\bawd\b|allrad|dual\s*motor|\b4x4\b|carrera\s*4|\b4s\b|\b4wd\b|sh-awd|\bsync4\b|\bcrosswheel\b/.test(n)) {
    return "awd";
  }
  if (/\brwd\b|zadnji\s*pogon|pogon\s*zadaj/.test(n)) return "rwd";
  if (/\bfwd\b|sprednji\s*pogon|pogon\s*spredaj/.test(n)) return "fwd";
  const p = (o.pogon ?? "").toLowerCase();
  if (p.includes("4x4") || p.includes("4wd")) return "awd";
  if (p.includes("zadnja") || p.includes("zadnje")) return "rwd";
  if (p.includes("prednja") || p.includes("sprednj")) return "fwd";
  return "?";
}

/**
 * Družina menjalnika. Vir pozna samo ročni/avtomatski, trg pa loči PDK od
 * torzijskega avtomata — 911 GTS PDK in GTS z ročnim nista ista avta.
 */
export function menjalnikDruzina(o: OglasZaIdentiteto): string {
  const n = cistNaziv(o.naziv);
  for (const [re, v] of [
    [/\bpdk\b/, "pdk"], [/\bdsg\b/, "dsg"], [/s[\s-]?tronic/, "s-tronic"],
    [/tiptronic/, "tiptronic"], [/\bdct\b|\bdkg\b/, "dct"], [/multitronic|\bcvt\b|e-cvt/, "cvt"],
    [/\bpowershift\b|\bedc\b/, "dct"], [/steptronic|\bzf\b/, "avtomat"],
  ] as [RegExp, string][]) {
    if (re.test(n)) return v;
  }
  const m = (o.menjalnik ?? "").toLowerCase();
  if (m.includes("ročni") || m.includes("rocni")) return "rocni";
  if (m.includes("avtomat")) return "avtomat";
  // Električni avtomobili imajo praktično vsi enostopenjski reduktor; vir jih
  // včasih vpiše kot "ročni", kar bi jih po nepotrebnem razdelilo.
  if ((o.gorivo ?? "").toLowerCase().includes("elektr")) return "reduktor";
  return "?";
}

/** VIN iz podrobnosti oglasa, samo če je res 17 veljavnih znakov. */
export function vinIz(o: OglasZaIdentiteto): string | null {
  const surov = o.dodatni_podatki?.["VIN / številka šasije"];
  if (typeof surov !== "string") return null;
  const v = surov.trim().toUpperCase().replace(/\s/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? v : null;
}

/**
 * Koliko lahko tej identiteti zaupamo.
 *
 * VIN je dokaz. Izvedenka, prebrana iz naziva ob ujemanju s serijo iz baze, je
 * skoraj dokaz. Sama moč v kW je približek in nikoli ne sme nositi posla.
 */
export function zaupanjeIdentitete(i: Omit<Identiteta, "zaupanje">): number {
  let t = 0;
  if (i.vin) t += 30;
  switch (i.izvedenkaVir) {
    case "vin":
    case "naziv-znamka": t += 45; break;
    case "naziv-motor": t += 30; break;
    case "moc": t += 12; break;
    default: t += 0;
  }
  if (i.generacija) t += 8;
  if (i.pogon !== "?") t += 12;
  if (i.menjalnikDruzina !== "?") t += 8;
  if (!i.druzinaModela.endsWith(" ?") && i.druzinaModela.length > 3) t += 10;
  if (i.gorivo !== "?") t += 5;
  return Math.min(100, t);
}

export function identiteta(o: OglasZaIdentiteto): Identiteta {
  const { druzina, generacija } = druzinaModela(o);
  const izv = izvedenka(o);
  const { oprema, teza } = preberiOpremo(o);
  const brezZaupanja: Omit<Identiteta, "zaupanje"> = {
    druzinaModela: druzina,
    generacija,
    izvedenka: izv.v,
    izvedenkaVir: izv.vir,
    pogon: pogonNorm(o),
    menjalnikDruzina: menjalnikDruzina(o),
    karoserija: (o.karoserija ?? "?").toLowerCase().split("/")[0].trim(),
    gorivo: (o.gorivo ?? "?").split(" ")[0].toLowerCase(),
    vin: vinIz(o),
    oprema,
    opremaTeza: teza,
  };
  return { ...brezZaupanja, zaupanje: zaupanjeIdentitete(brezZaupanja) };
}

/** Prstni odtis SPECIFIKACIJE — kateri avto je to, ne kateri oglas. */
export function prstniOdtis(i: Identiteta): string {
  return [
    i.druzinaModela,
    i.generacija ?? "-",
    i.izvedenka ?? "-",
    i.gorivo,
    i.menjalnikDruzina,
    i.pogon,
    i.karoserija,
  ].join("|");
}

// ------------------------------------------------------- primerljivost cene

export type Neprimerljiva = {
  primerljiva: false;
  razlog: string;
};
export type Primerljiva = { primerljiva: true; razlog: null };

/**
 * Ali sme ta cena v mediano.
 *
 * Merjeno: 476 aktivnih oglasov je pod 45 % mediane svojega modela in letnika —
 * med njimi VW Tiguan 2025 za 3.000 €, kar je polog za leasing, ne cena avta.
 * Taki oglasi danes sicer ne postanejo posel, mediano pa vlečejo navzdol vsem
 * ostalim in s tem posle podcenijo.
 */
/**
 * Ali besedilo pove, da je avto poškodovan.
 *
 * Beseda sama ne pove ničesar — "nekaramboliran" in "nikoli poškodovan" sta v
 * teh oglasih pogostejša od poškodbe. Prva različica je zato izločila same
 * zdrave avte. Zato se besedilo razbije na stavke in poškodba šteje samo, če
 * je v ISTEM stavku ni nihče zanikal.
 */
export function jePoskodovan(besedilo: string): boolean {
  const POSKODBA = /karambolir|po[sš]kodovan|udarjen\w*\s|\bhavarij|razbit|potolč|zvit\w*\s*(sasij|šasij)/;
  const ZANIKANJE = /\bne\w*|\bni\b|\bnikoli\b|\bnikdar\b|\bbrez\b/;
  // Nedvoumne fraze, ki jih zanikanje ne more obrniti (samo besedo "ni"
  // vsebujejo, ker je del izjave o okvari).
  if (/\bni\s*(v\s*)?vozn(o|em)\b|\bne\s*vozi\b|brez\s*motorja|motor\s*v\s*okvar|ne\s*[sš]tarta/.test(besedilo)) {
    return true;
  }
  for (const stavek of besedilo.split(/[.!?;\n]+/)) {
    if (!POSKODBA.test(stavek)) continue;
    // "nekaramboliran" je ena beseda — zanikanje je zlepljeno z njo.
    const brezZlepljenih = stavek.replace(/\bne[a-zšč]*(karambolir|po[sš]kodovan)\w*/g, " ");
    if (!POSKODBA.test(brezZlepljenih)) continue;
    if (ZANIKANJE.test(stavek)) continue;
    return true;
  }
  return false;
}

export function primerljivostCene(o: {
  naziv: string | null;
  opis: string | null;
  cena_eur: number | string | null;
  cena_na_poziv?: boolean | null;
  ddv_odbitek?: boolean | null;
  status?: string;
}): Neprimerljiva | Primerljiva {
  const cena = o.cena_eur === null ? null : Number(o.cena_eur);
  if (cena === null || !Number.isFinite(cena) || cena < 300) {
    return { primerljiva: false, razlog: "ni cene" };
  }
  if (o.cena_na_poziv) return { primerljiva: false, razlog: "cena na poziv" };

  const naslov = (o.naziv ?? "").toLowerCase();
  const opis = (o.opis ?? "").slice(0, 1500).toLowerCase();

  // Poškodba in prodaja po delih se oglašujeta odkrito, zato ju je varno
  // loviti tudi v opisu.
  if (/\bza\s*dele\b|\bdeli\b\s*(vozila|avta)|razstavlj\w*\s*(vozil|avt)|\bza\s*razstav/.test(`${naslov} ${opis}`)) {
    return { primerljiva: false, razlog: "prodaja za dele" };
  }
  if (jePoskodovan(`${naslov} . ${opis}`)) {
    return { primerljiva: false, razlog: "poškodovano / nevozno" };
  }

  // Ara, polog in obrok so drugačna zgodba: trgovci v opisu redno OGLAŠUJEJO
  // financiranje ("minimalni polog od 10 %", "brez pologa") pri povsem
  // normalni ceni vozila. Prva različica tega pravila je zato izločila 20 %
  // oglasov — same zdrave cene. Zato štejeta samo dva jasna primera: oznaka
  // stoji v NASLOVU (kjer je cena), ali pa opis izrecno pove, da je znesek
  // ara oziroma mesečni obrok.
  if (/\bara\b|\bpolog\b|akontacij|prevzem\s*(leasinga|lizinga|najema)|\/\s*mes\b|mese[cč]no\b/.test(naslov)) {
    return { primerljiva: false, razlog: "ara ali obrok v naslovu" };
  }
  if (/cena\s*(je|velja|pomeni)?\s*(le\s*)?(za\s*)?(ara|aro|polog|akontacij)|znesek\s*je\s*(ara|polog)|(ara|polog)\s*(zna[sš]a|je)\s*\d/.test(opis)) {
    return { primerljiva: false, razlog: "cena je ara, ne cena vozila" };
  }
  if (/mese[cč]n\w*\s*(obrok|najemnina|znesek)\s*\d|obrok\s*(zna[sš]a|je)\s*\d|cena\s*\d+\s*€?\s*\/\s*mes/.test(opis)) {
    return { primerljiva: false, razlog: "mesečni obrok, ne cena vozila" };
  }
  return { primerljiva: true, razlog: null };
}
