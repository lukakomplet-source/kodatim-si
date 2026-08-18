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

/** Kaj je bilo razumljeno — da UI pove, kako je stavek prebral. */
export type Razklad = { filtri: NepFiltri; razumljeno: string[]; nerazumljeno: string | null };

const TIPI_VZORCI: [RegExp, string[]][] = [
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

export function razlozi(vprasanje: string): Razklad {
  const t = ` ${vprasanje.toLowerCase().trim()} `;
  const f: NepFiltri = {};
  const razumljeno: string[] = [];

  // posel
  if (/\bnajem|oddaj|za najeti|najeti\b/.test(t)) {
    f.posel = "oddaja";
    razumljeno.push("najem");
  } else {
    f.posel = "prodaja";
    if (/prodaj|kupi|nakup/.test(t)) razumljeno.push("prodaja");
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

  // cena: "do 300k", "od 100k do 300k", "med 200 in 300k", "pod 250.000"
  const do_ = t.match(/(?:do|pod|max\.?|največ)\s*([\d.,]+\s*[km]?)\s*€?/);
  const od = t.match(/(?:od|nad|min\.?|vsaj)\s*([\d.,]+\s*[km]?)\s*€(?!\/)/) ?? t.match(/od\s*([\d.,]+\s*[km]?)\s*do/);
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

  // površine
  const m2 = t.match(/(?:vsaj|nad|min\.?)\s*([\d.]+)\s*m2/);
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

  // lokacija: znan kraj -> regija + kraj (kraj kot substring, ker baza hrani naselje)
  for (const [kraj, regija] of Object.entries(REGIJE_KRAJI)) {
    if (t.includes(kraj)) {
      f.kraj = kraj;
      f.regija = regija;
      razumljeno.push(`lokacija: ${kraj} (${regija})`);
      // "okolica" / "okoli" / "blizu" -> cela regija, ne samo kraj
      if (new RegExp(`(?:okolic\\w+|okoli|blizu|km\\s+(?:od|okoli))\\s+.{0,12}${kraj}|${kraj}\\w*\\s+(?:z\\s+)?okolic`).test(t)) {
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
  if (/investicij|za oddajanje|donos|najemn/.test(t)) {
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

  // razvrščanje
  if (/najcenejš/.test(t)) f.razvrsti = "cena_nizja";
  else if (/največj\w+ padec|najbolj znižan/.test(t)) f.razvrsti = "padec";
  else if (/najnovejš/.test(t)) f.razvrsti = "novi";
  else if (/€\/?m2|na kvadrat/.test(t)) f.razvrsti = "m2_nizja";
  if (f.razvrsti) razumljeno.push(`razvrsti: ${f.razvrsti}`);

  return {
    filtri: f,
    razumljeno,
    nerazumljeno: razumljeno.length === 0 ? "Nisem prepoznal nobenega pogoja — poskusi npr. „hiša do 300k v Mariboru z okolico“." : null,
  };
}
