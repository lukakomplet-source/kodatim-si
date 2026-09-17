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
  /** Zgornja meja povrsine: „do 1000 m²“ ni cena. */
  povrsinaMax?: number;
  zemljisceMin?: number;
  letoMin?: number;
  vecEnot?: boolean;
  enotMin?: number;
  zaObnovo?: boolean;
  zaInvesticijo?: boolean;
  noviDni?: number;
  padecCene?: boolean;
  /**
   * Turistični način: "booking", "apartmaji", "blizu atrakcije", "veliko
   * turizma". Ni navaden filter — vklopi izračun turističnega potenciala
   * (bližina atrakcije + prenočitve v občini + zmožnost enot) in razvrstitev
   * po njem.
   */
  turizem?: boolean;
  /**
   * Podvrsta iz oglasa (`nep_oglasi.podtip`). Pri zemljiščih je to edina
   * razlika, ki šteje: 8.846 oglasov je "zazidljiva", 2.716 "kmetijsko
   * zemljišče" — cena na m² se med njima razlikuje za velikostni red, zato
   * bi ju bilo napak meriti skupaj.
   */
  podtip?: string;
  /**
   * Samo mestno jedro. Kraj v bazi je prosto besedilo naselja, zato se
   * "Ljubljana center", "Ljubljana Center, Center" in "Ljubljana mesto"
   * pojavljajo drug ob drugem; ta zastavica jih zajame vse, brez njih pa
   * ostane "Ljubljana okolica" zunaj.
   */
  center?: boolean;
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
  // Vila, dvojček, vrstna hiša, bungalov: v bazi so vsi vpisani kot "hisa",
  // uporabnik pa besede "hiša" pri njih pogosto sploh ne napiše.
  [/\bvil[aeiou]\b|\bvil\b|dvojč\w+|vrstn\w+\s+hiš|bungalov|montažn\w+\s+hiš/i, ["hisa"]],
  [/\bhiš\w+|\bhis\w+/i, ["hisa"]],
  // \w* in ne \w+: rodilnik množine je gol „stanovanj“ („nova gradnja stanovanj“).
  // Vrstni red ščiti: „večstanovanjska“ in „stanovanjska hiša“ ujameta vzorca nad tem.
  [/stanovanj\w*|garsonjer\w+|sobno/i, ["stanovanje"]],
  // "zemlje", "zemljo", "zemljica" — uporabnik redko napiše "zemljišče".
  // Vzorec stoji ZA hišo in stanovanjem, zato "hiša z veliko zemljo" ostane hiša.
  [/zemljišč\w+|zemlj\w+|parcel\w+|posest|gradbišč\w+/i, ["posest"]],
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

/**
 * POKRAJINE PO IMENU. Ljudje pišejo „na obali“, „v Prekmurju“, „Zasavje“ —
 * imena, ki jih šifrant krajev ne pozna, ker niso naselja. Preslikava je
 * namenoma groba in mestoma sporna: Bela krajina gre pod dolenjsko, Primorska
 * pod obalno-kraško (čeprav je Severna Primorska goriška) — tako so razvrščeni
 * oglasi v bazi. Vrstni red šteje, prvo ujemanje obvelja.
 */
const REGIJE_IMENA: [RegExp, string][] = [
  [/\bna\s+obali\b|\bobala\b|\bobali\b|primorsk|\bkras\b|krašk\w+/i, "obalno-kraska"],
  [/prekmurj|pomurj/i, "pomurska"],
  [/zasavj|zasavsk/i, "zasavska"],
  [/gorenjsk/i, "gorenjska"],
  [/dolenjsk|bel[aei]\s+krajin/i, "dolenjska"],
  [/notranjsk/i, "notranjska"],
  [/korošk/i, "koroska"],
  [/posavj|posavsk/i, "posavska"],
  [/gorišk|vipavsk|\bbrdih\b/i, "goriska"],
  [/podravsk|haloz|slovensk\w*\s+goric|pohorj/i, "podravska"],
  [/savinjsk|kozjansk/i, "savinjska"],
  [/ljubljan\w*\s+okolic|okolic\w*\s+ljubljane/i, "ljubljana-okolica"],
];

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
 * Ali je ta številka pravzaprav MERA in ne znesek?
 *
 * Povod je resnična, tiha napaka: „zazidljiva parcela do 1000 m2“ je dala
 * filter „do 1.000.000.000 €“. Vzorec za ceno je iz „1000 m2“ pobral „1000 m“,
 * „m“ pa pri znesku pomeni milijon. Nobene napake, nobenega opozorila — samo
 * seznam, ki ni bil omejen na nič.
 *
 * Zato se ne popravlja vzorec (vsaka omejitev v njem se ob vračanju nazaj
 * razsuje v „do 100 €“), ampak se pogleda, kaj v besedilu SLEDI ujemanju: če
 * se tam nadaljuje „2“, „m2“, „km“ ali „ha“, številka ni bila cena.
 */
function jeMera(besedilo: string, m: RegExpMatchArray | null): boolean {
  if (!m || m.index === undefined) return false;
  const za = besedilo.slice(m.index + m[0].length);
  return /^\s*(?:2|²|m2|m²|km\b|m\b|kvadrat|ar\b|arov|hektar|ha\b|sob|enot|let\b|leti|oseb)/.test(za);
}

/**
 * Krajšave, kot jih ljudje tipkajo: „stanovanje v lj“, „hiša mb okolica“.
 * Razširijo se pred vsem ostalim, da jih ujamejo isti vzorci kot polna imena.
 * Meje besed so obvezne — brez njih bi „lj“ pobral tudi začetek „ljubljana“.
 */
function razsiriKrajsave(x: string): string {
  const kr: Record<string, string> = {
    lj: "ljubljana",
    mb: "maribor",
    kp: "koper",
    ng: "nova gorica",
    nm: "novo mesto",
  };
  return x.replace(/\b(lj|mb|kp|ng|nm)\b\.?/g, (celota, k: string) => kr[k] ?? celota);
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

/**
 * Odstrani strešice: "najcenejše" -> "najcenejse", "zazidljivo" ostane isto.
 *
 * Povod je dobesedni stavek uporabnika: "najdi mi stanovanje v centru mesta
 * ljubljane pa daj mi prvo najcenejse". Vzorci so bili pisani s šumniki
 * ("najcenejš"), ljudje pa v iskalnik tipkajo brez njih — in takrat ni ujel
 * NOBEN. To ni bila napaka enega pravila, ampak vseh enainštiridesetih.
 *
 * Zato se odstranijo na OBEH straneh: iz besedila in iz vzorca. Tako ostane
 * vzorec v kodi berljiv ("zemljišč\w+"), ujame pa tudi "zemljisc".
 */
function brezSumnikov(x: string): string {
  return x
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/**
 * Kraj v sklonu: „v Kopru“, „iz Novega mesta“, „pri Murski Soboti“.
 *
 * Slovenščina sklanja oba dela imena, pri nekaterih pa izpade še samoglasnik
 * („Koper“ — „Kopru“), zato golo krajšanje za eno črko ne zadošča: „kope“ ne
 * najde „kopru“ in „novo mest“ ne najde „novem mestu“. Vzorec zato krni vsako
 * besedo posebej in jih spet zloži.
 */
function vzorecKraja(kraj: string): string {
  const besede = brezSumnikov(kraj).split(/\s+/);
  if (besede.length > 1) {
    return besede.map((b) => b.slice(0, Math.max(3, b.length - 2)) + "\\w*").join("\\s+");
  }
  const b = besede[0];
  const krni = new Set<string>([b.length > 4 ? b.slice(0, -1) : b]);
  // Izpadni samoglasnik: „Koper“ ima v sklonih krn „kopr“, ne „kope“.
  if (/er$/.test(b)) krni.add(b.slice(0, -2) + "r");
  return krni.size > 1 ? `(?:${[...krni].join("|")})` : [...krni][0];
}

export function razlozi(vprasanje: string, osnova?: Razklad | null): Razklad {
  const t = ` ${razsiriKrajsave(brezSumnikov(vprasanje.toLowerCase().trim()))} `;
  /** Preveri vzorec na besedilu brez šumnikov (vzorec se zloži enako). */
  const uj = (re: RegExp): boolean => new RegExp(brezSumnikov(re.source), re.flags).test(t);
  /** Poišče ujemanje z vzorcem brez šumnikov. */
  const naj = (re: RegExp): RegExpMatchArray | null => t.match(new RegExp(brezSumnikov(re.source), re.flags));
  const f: NepFiltri = {};
  let razumljeno: string[] = [];

  // posel (privzeta prodaja samo pri svežem iskanju — ukaz je ne prepiše)
  /**
   * „ZA ODDAJANJE“ NI ODDAJA. „hiša na obali za oddajanje turistom“ je nakup
   * z namenom oddajanja — kdor to napiše, noče seznama stanovanj v najem.
   * Beseda „oddaj“ je doslej oboje zvalila v isti koš, tako da je iskalec
   * naložbe dobil oglase za najem in nobene hiše za kupiti.
   */
  const namenOddajanja = uj(/za\s+oddaj\w*|oddajanj\w*|za\s+turist|za\s+najemnik|bi\s+\w{0,3}\s*oddaj/);

  if (!namenOddajanja && uj(/\bnajem|oddaj|za najeti|najeti\b/)) {
    f.posel = "oddaja";
    razumljeno.push("najem");
  } else if (uj(/prodaj|kupi|nakup/)) {
    f.posel = "prodaja";
    razumljeno.push("prodaja");
  } else if (!osnova) {
    f.posel = "prodaja";
  }

  /**
   * NAMEN NI VRSTA. „zemljišče za gradnjo hiše“ je zemljišče — beseda „hiše“
   * v njem pove, kaj bo na parceli stalo, ne kaj iščemo. Ker vzorec za hišo
   * nujno stoji PRED vzorcem za zemljišče (sicer bi „hiša z veliko zemljo“
   * postala parcela), je tak stavek doslej vedno vrnil hiše.
   */
  const tTipi = t.replace(/\bza\s+(?:iz)?gradnjo\s+\w+/g, " ").replace(/primern\w*\s+za\s+\w+/g, " ");

  // tipi
  for (const [vzorec, tipi] of TIPI_VZORCI) {
    // Vzorec se zlozi enako kot besedilo, sicer "his\w+" po odstranitvi
    // sumnikov iz vprasanja ne ujame nicesar.
    if (new RegExp(brezSumnikov(vzorec.source), vzorec.flags).test(tTipi)) {
      f.tipi = tipi;
      razumljeno.push(`tip: ${tipi.join(", ")}`);
      break;
    }
  }

  // večenotnost
  if (uj(/večstanovanjsk|vec[\s-]*stanovanjsk|več\s+enot|multi[\s-]*unit|več\s+stanovanj|ločen\w+\s+stanovanj/i)) {
    f.vecEnot = true;
    razumljeno.push("več enot");
  }
  /**
   * TURISTIČNI NAČIN.
   *
   * Uporabnikov stavek: "hiše, ko lahko iz nje naredim booking, več enot blizu
   * neke atraktivnosti ali pa ko je statistično velik volumen turizma".
   * Prepoznati je treba oboje — bližino znamenitosti IN obisk — ker je vsak
   * zase polovica odgovora.
   *
   * Turistični namen skoraj vedno pomeni tudi več enot; če uporabnik enot ni
   * omenil, jih ne vsiljujemo kot filter (sicer bi izpadle hiše, ki jih je
   * mogoče razdeliti, a oglas tega ne pove), ampak jih upoštevamo v oceni.
   */
  if (
    /booking|airbnb|apartmaj|turist|turiz|nočitv|nocitv|oddajanje na noč|kratkorочn|kratkoroč|počitnišk\w*\s+oddaj|atrakc|atraktivn|znamenitost|blizu\s+(?:jezera|morja|smučišč|term)/i.test(
      t
    )
  ) {
    f.turizem = true;
    razumljeno.push("turistični potencial (bližina atrakcije + prenočitve v občini)");
  }

  const enot = naj(/(?:vsaj|min\.?|najmanj)\s*(\d+)\s*(?:enot|stanovanj|apartma)/);
  if (enot) {
    f.enotMin = Number(enot[1]);
    f.vecEnot = true;
    razumljeno.push(`vsaj ${enot[1]} enot`);
  }

  // Ukaza "odstrani vse nad/pod X" imata obrnjen pomen glede na "do/pod X",
  // zato se razčlenita PRED navadnima vzorcema in ju izključita.
  const odstraniNad = naj(/odstrani\s+(?:vse\s+)?nad\s*([\d.,]+\s*[km]?)/);
  const odstraniPod = naj(/odstrani\s+(?:vse\s+)?pod\s*([\d.,]+\s*[km]?)/);
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
  const do_ = odstraniPod || odstraniNad ? null : naj(/(?:do|pod|max\.?|največ)\s*([\d.,]+\s*[km]?)\s*€?/);
  /**
   * Spodnja meja tudi brez znaka €. Doslej je bil obvezen, ker „nad 3 sobe“ ni
   * cena — a „nad 500k“ je, in evra tam nihče ne tipka. Brez njega gre skozi
   * le številka s pripono k/m ali z vsaj štirimi mesti; ostalo ustavi jeMera().
   */
  const od =
    odstraniPod || odstraniNad
      ? null
      : (naj(/(?:od|nad|min\.?|vsaj|več\s+od)\s*([\d.,]+\s*[km]?)\s*€(?!\/)/) ??
        naj(/od\s*([\d.,]+\s*[km]?)\s*do/) ??
        naj(/(?:od|nad|vsaj|več\s+od)\s*([\d.,]+\s*[km])\b/) ??
        naj(/(?:od|nad|vsaj|več\s+od)\s*(\d{1,3}(?:\.\d{3})+|\d{4,})\s*€?/));
  if (do_ && !jeMera(t, do_)) {
    const n = znesek(do_[1]);
    // Majhne številke za "do" so lahko sobe/enote — cena je šele nad 1000.
    if (n && n >= 1000) {
      f.cenaMax = n;
      razumljeno.push(`do ${n.toLocaleString("sl-SI")} €`);
    }
  }
  if (od && !jeMera(t, od)) {
    const n = znesek(od[1]);
    if (n && n >= 1000) {
      f.cenaMin = n;
      razumljeno.push(`od ${n.toLocaleString("sl-SI")} €`);
    }
  }

  /**
   * ZGORNJA MEJA POVRŠINE. „do 1000 m²“ je bila prej cena, in to milijardna
   * (glej jeMera); zdaj je tisto, kar v resnici je. Pri parcelah gre v isti
   * stolpec kot bivalna površina: v bazi ima 13.817 od 13.995 zemljišč
   * velikost vpisano v `povrsina_m2` in le 94 v `zemljisce_m2`.
   */
  const povrsinaDo = naj(/(?:do|pod|max\.?|največ)\s*([\d.]+)\s*(?:m2|m²|kvadrat\w*)/);
  if (povrsinaDo) {
    const n = Number(povrsinaDo[1].replace(/\./g, ""));
    if (Number.isFinite(n) && n > 0) {
      f.povrsinaMax = n;
      razumljeno.push(`do ${n.toLocaleString("sl-SI")} m²`);
    }
  }

  // površine — "vsaj 800 m2 zemljišča" je zemljišče, ne bivalna površina
  const m2 = naj(/(?:vsaj|nad|min\.?)\s*([\d.]+)\s*m2(?!\s*(?:zemljišč|zemlje|parcel))/);
  if (m2) {
    f.povrsinaMin = Number(m2[1].replace(/\./g, ""));
    razumljeno.push(`vsaj ${m2[1]} m²`);
  }
  const zemlja = naj(/(?:vsaj|nad)?\s*([\d.]+)\s*m2\s*zemljišč|velik\w*\s+zemljišč|velik\w*\s+zemlj\w+/);
  if (zemlja) {
    const n = zemlja[1] ? Number(zemlja[1].replace(/\./g, "")) : 800;
    f.zemljisceMin = n;
    razumljeno.push(`zemljišče vsaj ${n} m²`);
  }

  // radij: "15 km okoli Maribora", "razširi radij na 25 km", "blizu Kopra".
  // Središče se v koordinate prevede šele na strežniku (šifrant nep_kraji).
  const MEJA = String.raw`(?=\s*(?:$|[,.;!?]|\bin\b|\bali\b|\bdo\b|\bza\b|\bki\b|\bpod\b|\bnad\b))`;
  /**
   * Ime kraja je ena ali dve besedi („Ptuj“, „Novo mesto“), ne preostanek stavka.
   * Prej je bila meja 30 znakov in „blizu smučišča da bi delal apartmaje“ je dalo
   * središče z imenom „smucisca da bi“ — šifrant ga seveda ni našel.
   */
  const IME = String.raw`([a-z][a-z-]{2,20}(?:\s+[a-z][a-z-]{2,20})?)`;
  /**
   * Kar zveni kot kraj, a ni. „blizu morja“, „blizu smučišča“, „blizu centra“
   * so vrste bližine, ne imena naselij. Turistični način jih že prepozna zgoraj;
   * tu jih je treba samo zadržati, da ne postanejo središče radija.
   */
  const NI_KRAJ = /^(?:morj|jezer|smuc|term|obal|centr|mest|sol|vrtc|trgovin|avtocest|gozd|rek[aeu]|atrakc|vod[aei]|plaz|narav|slovenij)/;
  const radijZKraj =
    t.match(new RegExp(String.raw`(\d{1,3})\s*km\s+(?:od|okoli|okrog|okolice)\s+` + IME + MEJA)) ??
    /**
     * Obrnjeni vrstni red: „okoli Maribora 20 km“. Enako pogost kot prvi,
     * doslej pa ni dal radija sploh. Skupini se zamenjata, da ju bere isti
     * odsek spodaj.
     */
    (() => {
      const m = t.match(new RegExp(String.raw`(?:okoli|okrog|v okolici|blizu)\s+` + IME + String.raw`\s+(\d{1,3})\s*km`));
      return m ? ([m[0], m[2], m[1]] as unknown as RegExpMatchArray) : null;
    })();
  const radijSamoKm = naj(/(?:radij\w*|radius\w*)\s+(?:na\s+)?(\d{1,3})\s*km/) ?? naj(/(\d{1,3})\s*km\s+(?:radij|radius)/);
  const blizu = radijZKraj
    ? null
    : t.match(new RegExp(String.raw`\b(?:blizu|v blizini|v okolici|okoli|okrog)\s+` + IME + MEJA));
  if (radijZKraj && !NI_KRAJ.test(radijZKraj[2].trim())) {
    f.radijKm = Math.min(100, Math.max(1, Number(radijZKraj[1])));
    f.radijKraj = radijZKraj[2].trim();
    razumljeno.push(`radij ${f.radijKm} km okoli ${f.radijKraj}`);
  } else if (blizu && !NI_KRAJ.test(blizu[1].trim())) {
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
    // Besedilo je brez sumnikov, zato mora biti tudi ime kraja: sicer
    // "skofja loka" ne ujame sifrantnega "Skofja Loka".
    const krnB = vzorecKraja(kraj);
    if (new RegExp(`\\b${krnB}`).test(t)) {
      f.kraj = kraj;
      f.regija = regija;
      razumljeno.push(`lokacija: ${kraj} (${regija})`);
      // "okolica" / "okoli" / "blizu" -> cela regija, ne samo kraj
      if (new RegExp(`(?:okolic\\w+|okoli|blizu|km\\s+(?:od|okoli))\\s+.{0,12}${krnB}|${krnB}\\w*\\s+(?:z\\s+)?okolic`).test(t)) {
        delete f.kraj;
        razumljeno.push("z okolico (cela regija)");
      }
      break;
    }
  }

  /**
   * POKRAJINA, ČE KRAJA NI. „hiša na obali“, „parcela v Prekmurju“ —
   * ime pokrajine ni naselje in ga zanka zgoraj ne more najti. Velja samo,
   * kadar kraj ni bil prepoznan: „Koper“ je natančnejši od „Primorske“.
   */
  if (f.regija === undefined && f.radijKraj === undefined) {
    for (const [vzorec, regija] of REGIJE_IMENA) {
      if (uj(vzorec)) {
        f.regija = regija;
        razumljeno.push(`pokrajina: ${regija}`);
        break;
      }
    }
  }

  /**
   * PODVRSTA ZEMLJIŠČA — pri parceli je to glavna stvar, ne postranska.
   *
   * V bazi je 8.846 oglasov s podvrsto "zazidljiva" in 2.716 "kmetijsko
   * zemljišče". Cena na m² se med njima razlikuje za velikostni red, zato
   * "najboljša cena zemlje na m²" brez te ločnice vrne njive in ne parcel —
   * odgovor, ki je videti pravilen in je popolnoma neuporaben.
   *
   * Podvrsta pomeni tip: kdor piše "zazidljivo", išče zemljišče, tudi če
   * besede "zemljišče" ni napisal.
   */
  if (uj(/zazidljiv|gradben\w*\s+parcel|za\s+gradnjo|komunaln\w*\s+(?:opreml|priključ)/)) {
    f.podtip = "zazidljiv";
    if (!f.tipi) f.tipi = ["posest"];
    razumljeno.push("zazidljivo");
  } else if (uj(/kmetijsk\w+|njiv\w+|travnik|gozdn\w+\s+zemljišč|sadovnjak|vinograd/)) {
    f.podtip = "kmetijsko";
    if (!f.tipi) f.tipi = ["posest"];
    razumljeno.push("kmetijsko zemljišče");
  }

  /**
   * MESTNO JEDRO.
   *
   * Kraj je v bazi prosto besedilo naselja, zato so "Ljubljana center",
   * "Ljubljana Center, Center" in "Ljubljana mesto" tri različne vrednosti —
   * in prav tako "Ljubljana okolica", ki je natanko tisto, česar iskalec
   * centra NOČE. Zastavica zajame prve tri in izloči zadnjo.
   *
   * "blizu centra" in "izven centra" sta izrecno nekaj drugega kot "v centru",
   * zato ju izvzamemo — sicer bi iskalec obrobja dobil ravno jedro.
   */
  if (
    uj(/(?:v\s+)?(?:strog\w+\s+|ožj\w+\s+|starem\s+)?(?:centr\w+|\bcenter\b|mestn\w+\s+jedr\w+|mestno\s+jedro)/) &&
    !uj(/(?:blizu|izven|zunaj|izven\s+strogega|na\s+obrobju|obrobj\w+|predmestj\w+)\s*\w*\s*centr/)
  ) {
    f.center = true;
    razumljeno.push("mestno jedro");
  }

  // stanje in namen
  if (uj(/za obnovo|za adaptacijo|potrebn\w+ obnove/)) {
    f.zaObnovo = true;
    razumljeno.push("za obnovo");
  }
  if (uj(/investicij|za oddajanje|donos|najemn|rent\w|cash\s*flow|yield/)) {
    f.zaInvesticijo = true;
    razumljeno.push("investicijsko");
  }

  // čas
  const dni = naj(/zadnjih\s*(\d+)\s*dn/);
  if (dni) {
    f.noviDni = Number(dni[1]);
    razumljeno.push(`novi v ${dni[1]} dneh`);
  } else if (uj(/\bnov\w+ oglas|danes|včeraj/)) {
    f.noviDni = 7;
    razumljeno.push("novi (7 dni)");
  }
  if (uj(/padec cen|padla|znižan|cena\s+se\s+je\s+znižala/)) {
    f.padecCene = true;
    razumljeno.push("znižana cena");
  }

  // razvrščanje (tudi ukaz "sortiraj po ...")
  const sortirajPo = naj(/(?:sortiraj|razvrsti)\s+po\s+([a-zčšžćđ ]{3,24})/);
  if (sortirajPo) {
    const kljuc = sortirajPo[1];
    if (/padc|padec|znižan/.test(kljuc)) f.razvrsti = "padec";
    else if (/cen/.test(kljuc)) f.razvrsti = "cena_nizja";
    else if (/kvadrat|m2/.test(kljuc)) f.razvrsti = "m2_nizja";
    else if (/enot/.test(kljuc)) f.razvrsti = "enote";
    else if (/nov|datum/.test(kljuc)) f.razvrsti = "novi";
    else if (/ustrezn|cilj/.test(kljuc)) f.razvrsti = "cilj";
  }
  /**
   * SUPERLATIVI — tako ljudje povedo, po čem naj se razvrsti.
   *
   * "najboljša cena" ni isto kot "najcenejše", dokler ne veš, česa: pri
   * zemljišču je merilo cena NA KVADRAT, pri stanovanju pa običajno cela cena.
   * Zato se najprej ugotovi, ali je stavek sploh o kvadratu, in šele nato,
   * kateri superlativ je uporabljen — sicer "najboljša cena zemlje na m²"
   * razvrsti po skupni ceni in na vrh postavi najmanjše parcele.
   *
   * "na m2" brez € doslej ni sprožil ničesar; prav tako ne "za kvadrat" in
   * "po kvadratu".
   */
  const naKvadrat = uj(
    /€\s*\/?\s*m2|\/m2|na\s*m2|na\s+kvadrat|po\s+kvadrat|za\s+kvadrat|cen\w*\s+(?:na\s+)?kvadrat|kvadratn\w*\s+metr|razmerj\w*\s+cen\w*\s*(?:in\s+)?(?:na\s+)?kvadrat/
  );
  // Prislovi so enakovredni pridevnikom: „najceneje“ ni „najcenejše“ in vzorec
  // s š-jem ga ni ujel; enako „čim ceneje“ in „kar se da ugodno“.
  const poceni = uj(
    /najcenej\w*|najugodnej\w*|najnižj\w*\s+cen|najboljš\w*\s+cen|dobr\w*\s+cen|ugodn\w*\s+cen|kje\s+je\s+najcen|najmanj\s+stane|poceni|čim\s+(?:cenej|ugodnej|nižj)|kar\s+se\s+da\s+(?:poceni|ugodn)|najbolj\s+ugodn/
  );
  const drago = uj(/najdražj\w*|najvišj\w*\s+cen|premium|luksuz|najbolj\s+drag/);
  if (!f.razvrsti) {
    if (naKvadrat && (poceni || uj(/najbolj\w*/))) f.razvrsti = "m2_nizja";
    else if (poceni) f.razvrsti = "cena_nizja";
    else if (drago) f.razvrsti = "cena_visja";
    else if (uj(/največj\w+ padec|najbolj znižan/)) f.razvrsti = "padec";
    else if (uj(/najnovejš/)) f.razvrsti = "novi";
    else if (naKvadrat) f.razvrsti = "m2_nizja";
    else if (uj(/največj\w*\s+zemljišč|največ\s+zemlj/)) f.razvrsti = "zemljisce";
  }
  if (f.razvrsti) razumljeno.push(`razvrsti: ${f.razvrsti}`);

  // Investicijski cilj: "10 enot po 650e", "po prenovi ... 700k".
  // Sprejme tudi zlepljeno "10enot" in "650e" — tako ljudje res tipkajo.
  const enoteM = naj(/\b(\d{1,3})\s*enot/);
  const najemM =
    naj(/\bpo\s*(\d{2,4})\s*(?:€|eur\b|e\b)/) ?? naj(/enot\w*\s+po\s+(\d{2,4})\b/);
  const proracunM =
    naj(/prenov\w*\D{0,24}?([\d.,]+\s*[km])\b/) ??
    naj(/(?:vse\s+skupaj|skupaj|cel\w*\s+investicij\w*)\D{0,16}?([\d.,]+\s*[km])\b/) ??
    naj(/prenov\w*\D{0,24}?([\d.,]+)\s*€/);

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
