/**
 * Naravni jezik → filtri, lokalno in deterministično.
 *
 * "večstanovanjska hiša do 300k v Mariboru" mora postati strukturiran filter
 * brez klica modela: vzorci so končni ("do 300k", "vsaj 3 enote", "za obnovo"),
 * odgovor mora biti v milisekundah, in napačen razklad se mora dati razložiti —
 * kar pri LLM ne gre. Model pride v poštev šele za stavke, ki jih ti vzorci ne
 * pokrijejo, in to izključno nad uporabnikovim besedilom, nikoli nad oglasi.
 */

export type NepFiltri = {
  posel?: "prodaja" | "oddaja";
  tipi?: string[];
  regija?: string;
  kraj?: string;
  /** "15 km okoli Maribora" — središče se razreši v šifrantu nep_kraji. */
  radijKm?: number;
  radijKraj?: string;
  cenaMin?: number;
  cenaMax?: number;
  povrsinaMin?: number;
  povrsinaMax?: number;
  zemljisceMin?: number;
  letoMin?: number;
  vecEnot?: boolean;
  enotMin?: number;
  zaObnovo?: boolean;
  zaInvesticijo?: boolean;
  noviDni?: number;
  padecCene?: boolean;
  razvrsti?: string;
};

/**
 * Investicijski cilj: "10 enot po 650 €, po prenovi vse skupaj 700k". To niso
 * filtri, ampak številke posla — strežnik z njimi oceni in razvrsti kandidate.
 * Cilj nastane šele, ko je ob številu enot še najemnina ali proračun; golo
 * "vsaj 3 enote" ostane navaden filter.
 */
export type InvesticijskiCilj = {
  enote: number;
  najemninaNaEnoto: number | null;
  proracun: number | null; // vse skupaj, S prenovo
};

/** Kaj je bilo razumljeno — da UI pove, kako je stavek prebral. */
export type Razklad = {
  filtri: NepFiltri;
  cilj: InvesticijskiCilj | null;
  razumljeno: string[];
  nerazumljeno: string | null;
};

const TIPI_VZORCI: [RegExp, string[]][] = [
  [/hiš\w*\s+ali\s+objekt\w*|objekt\w*\s+ali\s+hiš\w*/i, ["hisa", "poslovni_prostor"]],
  [/večstanovanjsk|vec[\s-]*stanovanjsk|multi[\s-]*unit|z?\s*več\s+enotami/i, ["hisa"]],
  [/\bhiš\w+|\bhis\w+/i, ["hisa"]],
  [/stanovanj\w+|garsonjer\w+|sobno/i, ["stanovanje"]],
  [/zemljišč\w+|parcel\w+|posest/i, ["posest"]],
  [/poslovn\w+|lokal\w*|pisarn\w+/i, ["poslovni_prostor"]],
  [/vikend/i, ["vikend"]],
  [/garaž\w+|parkirn\w+/i, ["garaza"]],
  [/počitnišk\w+|apartma\w+ na morju/i, ["pocitniski_objekt"]],
];

const REGIJE_KRAJI: Record<string, string> = {
  maribor: "podravska",
  ptuj: "podravska",
  celje: "savinjska",
  velenje: "savinjska",
  ljubljana: "ljubljana-mesto",
  kranj: "gorenjska",
  koper: "obalno-kraska",
  "novo mesto": "dolenjska",
  "murska sobota": "pomurska",
  "nova gorica": "goriska",
  "slovenj gradec": "koroska",
  krško: "posavska",
  trbovlje: "zasavska",
  postojna: "notranjska",
};

/** "300k" -> 300000, "1,2m"/"1.2m" -> 1200000, "250.000" -> 250000. */
function znesek(v: string): number | null {
  const s = v.toLowerCase().replace(/\s/g, "");
  const m = s.match(/^([\d.,]+)(k|m)?€?$/);
  if (!m) return null;
  let n = Number(m[1].replace(/\./g, "").replace(",", "."));
  // "1.2m": pika je tu decimalka, ne tisočica — prepoznamo po eni sami piki
  // in kratki mantisi.
  if (m[2] && /^\d+[.,]\d{1,2}$/.test(m[1])) n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (m[2] === "k") n *= 1_000;
  if (m[2] === "m") n *= 1_000_000;
  return Math.round(n);
}

/**
 * Zaporedje sporočil iste seje ("hiše v Mariboru do 400k" → "samo
 * večstanovanjske") — vsako naslednje dopolnjuje prejšnje stanje.
 */
export function razlozVec(segmenti: string[]): Razklad {
  let acc: Razklad | null = null;
  for (const s of segmenti) {
    const cist = s.trim();
    if (!cist) continue;
    acc = razlozi(cist, acc);
  }
  return acc ?? razlozi("");
}

export function razlozi(vprasanje: string, osnova?: Razklad | null): Razklad {
  const t = ` ${vprasanje.toLowerCase().trim()} `;
  const f: NepFiltri = {};
  let razumljeno: string[] = [];

  // posel (privzeta prodaja samo pri svežem iskanju — ukaz je ne prepiše)
  if (/\bnajem|oddaj|za najeti|najeti\b/.test(t)) {
    f.posel = "oddaja";
    razumljeno.push("najem");
  } else if (/prodaj|kupi|nakup/.test(t)) {
    f.posel = "prodaja";
    razumljeno.push("prodaja");
  } else if (!osnova) {
    f.posel = "prodaja";
  }

  // tipi
  for (const [vzorec, tipi] of TIPI_VZORCI) {
    if (vzorec.test(t)) {
      f.tipi = tipi;
      razumljeno.push(`tip: ${tipi.join(", ")}`);
      break;
    }
  }

  // večenotnost
  if (/večstanovanjsk|vec[\s-]*stanovanjsk|več\s+enot|multi[\s-]*unit|več\s+stanovanj|ločen\w+\s+stanovanj/i.test(t)) {
    f.vecEnot = true;
    razumljeno.push("več enot");
  }
  const enot = t.match(/(?:vsaj|min\.?|najmanj)\s*(\d+)\s*(?:enot|stanovanj|apartma)/);
  if (enot) {
    f.enotMin = Number(enot[1]);
    f.vecEnot = true;
    razumljeno.push(`vsaj ${enot[1]} enot`);
  }

  // Ukaza "odstrani vse nad/pod X" imata obrnjen pomen glede na "do/pod X",
  // zato se razčlenita PRED navadnima vzorcema in ju izključita.
  const odstraniNad = t.match(/odstrani\s+(?:vse\s+)?nad\s*([\d.,]+\s*[km]?)/);
  const odstraniPod = t.match(/odstrani\s+(?:vse\s+)?pod\s*([\d.,]+\s*[km]?)/);
  if (odstraniNad) {
    const n = znesek(odstraniNad[1]);
    if (n && n >= 1000) {
      f.cenaMax = n;
      razumljeno.push(`odstrani nad ${n.toLocaleString("sl-SI")} €`);
    }
  }
  if (odstraniPod) {
    const n = znesek(odstraniPod[1]);
    if (n && n >= 1000) {
      f.cenaMin = n;
      razumljeno.push(`odstrani pod ${n.toLocaleString("sl-SI")} €`);
    }
  }

  // cena: "do 300k", "od 100k do 300k", "med 200 in 300k", "pod 250.000"
  const do_ = odstraniPod || odstraniNad ? null : t.match(/(?:do|pod|max\.?|največ)\s*([\d.,]+\s*[km]?)\s*€?/);
  const od =
    odstraniPod || odstraniNad
      ? null
      : (t.match(/(?:od|nad|min\.?|vsaj)\s*([\d.,]+\s*[km]?)\s*€(?!\/)/) ?? t.match(/od\s*([\d.,]+\s*[km]?)\s*do/));
  if (do_) {
    const n = znesek(do_[1]);
    // Majhne številke za "do" so lahko sobe/enote — cena je šele nad 1000.
    if (n && n >= 1000) {
      f.cenaMax = n;
      razumljeno.push(`do ${n.toLocaleString("sl-SI")} €`);
    }
  }
  if (od) {
    const n = znesek(od[1]);
    if (n && n >= 1000) {
      f.cenaMin = n;
      razumljeno.push(`od ${n.toLocaleString("sl-SI")} €`);
    }
  }

  // površine — "vsaj 800 m2 zemljišča" je zemljišče, ne bivalna površina
  const m2 = t.match(/(?:vsaj|nad|min\.?)\s*([\d.]+)\s*m2(?!\s*(?:zemljišč|zemlje|parcel))/);
  if (m2) {
    f.povrsinaMin = Number(m2[1].replace(/\./g, ""));
    razumljeno.push(`vsaj ${m2[1]} m²`);
  }
  const zemlja = t.match(/(?:vsaj|nad)?\s*([\d.]+)\s*m2\s*zemljišč|velik\w*\s+zemljišč|veliko\s+zemlje/);
  if (zemlja) {
    const n = zemlja[1] ? Number(zemlja[1].replace(/\./g, "")) : 800;
    f.zemljisceMin = n;
    razumljeno.push(`zemljišče vsaj ${n} m²`);
  }

  // radij: "15 km okoli Maribora", "razširi radij na 25 km", "blizu Kopra".
  // Središče se v koordinate prevede šele na strežniku (šifrant nep_kraji).
  const MEJA = String.raw`(?=\s*(?:$|[,.;!?]|\bin\b|\bali\b|\bdo\b|\bza\b|\bki\b|\bpod\b|\bnad\b))`;
  const radijZKraj = t.match(
    new RegExp(String.raw`(\d{1,3})\s*km\s+(?:od|okoli|okrog|okolice)\s+([a-zčšžćđ][a-zčšžćđ .-]{1,30}?)${MEJA}`)
  );
  const radijSamoKm = t.match(/(?:radij\w*|radius\w*)\s+(?:na\s+)?(\d{1,3})\s*km/) ?? t.match(/(\d{1,3})\s*km\s+(?:radij|radius)/);
  const blizu = radijZKraj ? null : t.match(new RegExp(String.raw`\b(?:blizu|v okolici)\s+([a-zčšžćđ][a-zčšžćđ .-]{2,30}?)${MEJA}`));
  if (radijZKraj) {
    f.radijKm = Math.min(100, Math.max(1, Number(radijZKraj[1])));
    f.radijKraj = radijZKraj[2].trim();
    razumljeno.push(`radij ${f.radijKm} km okoli ${f.radijKraj}`);
  } else if (blizu) {
    f.radijKm = 15;
    f.radijKraj = blizu[1].trim();
    razumljeno.push(`blizu ${f.radijKraj} (radij 15 km)`);
  } else if (radijSamoKm) {
    f.radijKm = Math.min(100, Math.max(1, Number(radijSamoKm[1])));
    razumljeno.push(`radij ${f.radijKm} km`);
  }

  // lokacija: znan kraj -> regija + kraj (kraj kot substring, ker baza hrani
  // naselje). Radij pokrije lokacijo sam — takrat se kraj/regija ne nastavita.
  for (const [kraj, regija] of Object.entries(f.radijKraj !== undefined ? {} : REGIJE_KRAJI)) {
    // Skloni: "v Ljubljani" mora najti "ljubljana" — ujemamo krn brez zadnje
    // črke, a le na začetku besede, da "ekran" ne postane Kranj.
    const krn = kraj.length > 4 ? kraj.slice(0, -1) : kraj;
    if (new RegExp(`\\b${krn}`).test(t)) {
      f.kraj = kraj;
      f.regija = regija;
      razumljeno.push(`lokacija: ${kraj} (${regija})`);
      // "okolica" / "okoli" / "blizu" -> cela regija, ne samo kraj
      if (new RegExp(`(?:okolic\\w+|okoli|blizu|km\\s+(?:od|okoli))\\s+.{0,12}${krn}|${krn}\\w*\\s+(?:z\\s+)?okolic`).test(t)) {
        delete f.kraj;
        razumljeno.push("z okolico (cela regija)");
      }
      break;
    }
  }

  // stanje in namen
  if (/za obnovo|za adaptacijo|potrebn\w+ obnove/.test(t)) {
    f.zaObnovo = true;
    razumljeno.push("za obnovo");
  }
  if (/investicij|za oddajanje|donos|najemn|rent\w|cash\s*flow|yield/.test(t)) {
    f.zaInvesticijo = true;
    razumljeno.push("investicijsko");
  }

  // čas
  const dni = t.match(/zadnjih\s*(\d+)\s*dn/);
  if (dni) {
    f.noviDni = Number(dni[1]);
    razumljeno.push(`novi v ${dni[1]} dneh`);
  } else if (/\bnov\w+ oglas|danes|včeraj/.test(t)) {
    f.noviDni = 7;
    razumljeno.push("novi (7 dni)");
  }
  if (/padec cen|padla|znižan|cena\s+se\s+je\s+znižala/.test(t)) {
    f.padecCene = true;
    razumljeno.push("znižana cena");
  }

  // razvrščanje (tudi ukaz "sortiraj po ...")
  const sortirajPo = t.match(/(?:sortiraj|razvrsti)\s+po\s+([a-zčšžćđ ]{3,24})/);
  if (sortirajPo) {
    const kljuc = sortirajPo[1];
    if (/padc|padec|znižan/.test(kljuc)) f.razvrsti = "padec";
    else if (/cen/.test(kljuc)) f.razvrsti = "cena_nizja";
    else if (/kvadrat|m2/.test(kljuc)) f.razvrsti = "m2_nizja";
    else if (/enot/.test(kljuc)) f.razvrsti = "enote";
    else if (/nov|datum/.test(kljuc)) f.razvrsti = "novi";
    else if (/ustrezn|cilj/.test(kljuc)) f.razvrsti = "cilj";
  }
  if (!f.razvrsti) {
    if (/najcenejš/.test(t)) f.razvrsti = "cena_nizja";
    else if (/največj\w+ padec|najbolj znižan/.test(t)) f.razvrsti = "padec";
    else if (/najnovejš/.test(t)) f.razvrsti = "novi";
    else if (/€\/?m2|na kvadrat/.test(t)) f.razvrsti = "m2_nizja";
  }
  if (f.razvrsti) razumljeno.push(`razvrsti: ${f.razvrsti}`);

  // Investicijski cilj: "10 enot po 650e", "po prenovi ... 700k".
  // Sprejme tudi zlepljeno "10enot" in "650e" — tako ljudje res tipkajo.
  const enoteM = t.match(/\b(\d{1,3})\s*enot/);
  const najemM =
    t.match(/\bpo\s*(\d{2,4})\s*(?:€|eur\b|e\b)/) ?? t.match(/enot\w*\s+po\s+(\d{2,4})\b/);
  const proracunM =
    t.match(/prenov\w*\D{0,24}?([\d.,]+\s*[km])\b/) ??
    t.match(/(?:vse\s+skupaj|skupaj|cel\w*\s+investicij\w*)\D{0,16}?([\d.,]+\s*[km])\b/) ??
    t.match(/prenov\w*\D{0,24}?([\d.,]+)\s*€/);

  let cilj: InvesticijskiCilj | null = null;
  if (enoteM) {
    const enote = Number(enoteM[1]);
    const najem = najemM ? Number(najemM[1]) : null;
    const proracun = proracunM ? znesek(proracunM[1]) : null;
    if (enote >= 2 && enote <= 100 && (najem !== null || proracun !== null)) {
      cilj = {
        enote,
        najemninaNaEnoto: najem !== null && najem >= 100 && najem <= 3000 ? najem : null,
        proracun: proracun !== null && proracun >= 50_000 ? proracun : null,
      };

      // Značke iz opisa ("več enot", "za obnovo", "investicijsko") ob cilju ne
      // režejo trdo — nosi jih le 126 od ~7400 oglasov, kandidate pa določa
      // ZMOŽNOST (m² ali zaznane enote), značke štejejo v oceno.
      delete f.vecEnot;
      delete f.zaObnovo;
      delete f.zaInvesticijo;
      const mehke = ["več enot", "za obnovo", "investicijsko"];
      razumljeno = razumljeno.filter((r) => !mehke.includes(r));

      if (!f.tipi) f.tipi = ["hisa", "poslovni_prostor"];
      if (cilj.proracun !== null && f.cenaMax === undefined) f.cenaMax = cilj.proracun;
      if (f.razvrsti === undefined) f.razvrsti = "cilj";

      razumljeno.push(
        `cilj: ${cilj.enote} enot` +
          (cilj.najemninaNaEnoto !== null ? ` po ${cilj.najemninaNaEnoto} €/mes` : "")
      );
      if (cilj.proracun !== null) {
        razumljeno.push(`proračun s prenovo: ${cilj.proracun.toLocaleString("sl-SI")} € (kupnina največ toliko)`);
      }
      razumljeno.push(
        `kandidati: ${f.tipi.map((x) => (x === "hisa" ? "hiša" : "poslovni prostor")).join("/")} z ≥ ${cilj.enote * 25} m² ali zaznanimi enotami`
      );
      razumljeno.push("razvrsti: ustreznost cilju");
    }
  }

  // Dopolnjevanje: novo sporočilo prepiše samo tisto, kar izrecno omenja,
  // vse ostalo podeduje od prejšnjega stanja seje.
  let filtri = f;
  let koncniCilj = cilj;
  if (osnova) {
    filtri = { ...osnova.filtri, ...f };
    koncniCilj = cilj ?? osnova.cilj;
    // Lokacija in radij sta ISTA skupina: novo sporočilo eno ali drugo
    // zamenja, nikoli ne sešteje (sicer bi "15 km okoli Kopra" po prejšnjem
    // "v Mariboru" iskalo Maribor znotraj kroga okoli Kopra = nič zadetkov).
    if (f.radijKraj !== undefined) {
      delete filtri.kraj;
      delete filtri.regija;
    } else if (f.regija !== undefined) {
      delete filtri.radijKm;
      delete filtri.radijKraj;
      if (f.kraj === undefined) delete filtri.kraj; // "z okolico" širi na regijo
    } else if (f.radijKm !== undefined && osnova.filtri.radijKraj) {
      // "razširi radij na 25 km" brez kraja obdrži prejšnje središče.
      filtri.radijKraj = osnova.filtri.radijKraj;
    }
    if (razumljeno.length > 0) razumljeno = [...razumljeno, "(dopolnjeno prejšnje iskanje)"];
  }

  return {
    filtri,
    cilj: koncniCilj,
    razumljeno,
    nerazumljeno: razumljeno.length === 0 ? "Nisem prepoznal nobenega pogoja — poskusi npr. „hiša do 300k v Mariboru z okolico“." : null,
  };
}
