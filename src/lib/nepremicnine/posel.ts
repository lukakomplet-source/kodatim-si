/**
 * IZRAČUN INVESTICIJSKEGA POSLA — prevzeto iz Kompletka (real-estate-math.ts),
 * ne napisano na novo. Iste formule, ista imena količin (v slovenščini), isti
 * vrstni red zaokroževanja, da se številki na obeh straneh ujemata na cent.
 *
 * Kaj kalkulator odgovori investitorju, v vrstnem redu, kot razmišlja on:
 *
 *   1. KOLIKO ME STANE  — kupnina + stroški nakupa + prenova (z rezervo) +
 *                          drugi začetni stroški = all-in strošek; banka da
 *                          kredit, ostalo je moj denar.
 *   2. KOLIKO NESE      — najemnina minus praznine = efektivni prihodek;
 *                          minus obratovalni stroški = NOI (kar hiša zasluži
 *                          PRED kreditom in davkom).
 *   3. KOLIKO OSTANE    — NOI minus obroki = denarni tok; minus davek =
 *                          kar dejansko ostane na računu.
 *   4. KOLIKO JE MOJEGA — vrednost minus dolg = equity; raste z odplačano
 *                          glavnico in rastjo vrednosti.
 *   5. ALI JE TO DOBRO  — ocena 0–100 iz sedmih preverb in razsodba.
 *
 * Vse vhodne PREDPOSTAVKE (davčne stopnje, amortizacijske stopnje, cilji) so
 * zbrane na vrhu v enem objektu s podatkom, kdaj in kje so bile preverjene —
 * da je ob spremembi zakona ena sama vrstica za popraviti in da uporabnik v
 * vmesniku vidi, na kaj se številka opira.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct2 = (n: number) => Math.round(n * 100) / 100;

// ————————————————————————————————————————————————————————————————
// PREDPOSTAVKE — vse na enem mestu
// ————————————————————————————————————————————————————————————————

/**
 * Davčne stopnje. Vrednosti so tiste, ki so bile potrjene ob prenosu iz
 * Kompletka (preverjeno 31. 8. 2026) in ponovno preverjene proti virom ob
 * gradnji te strani (glej `preverjeno` pri vsaki). Če se zakon spremeni, se
 * popravi tu — nikjer drugje v kodi ni gole številke.
 */
export const DAVEK = {
  /** ZDoh-2: cedularni davek od dohodka iz oddajanja premoženja v najem. */
  fizicnaStopnjaPct: 25,
  /** ZDoh-2: normirani stroški — odbijejo se od najemnine, preden se obdavči. */
  fizicnaNormiraniStroskiPct: 10,
  /** ZDDPO-2 + ZORZFS: stopnja za davčna leta 2024–2028; po tem 19 %. */
  dooStopnjaPct: 22,
  dooStopnjaPoLetu2028Pct: 19,
  preverjeno: "31. 8. 2026 (Kompletko), ponovno 3. 9. 2026",
} as const;

/**
 * Najvišje davčno priznane letne amortizacijske stopnje po ZDDPO-2, 33. člen.
 * Zakaj je prenova razčlenjena po postavkah: fasada se odpisuje 17 let,
 * pohištvo 5 let — ena sama povprečna stopnja bi bila narobe v obe smeri.
 */
export const VRSTE_AMORTIZACIJE: { stopnjaPct: number; naziv: string; primeri: string }[] = [
  { stopnjaPct: 3, naziv: "Celoten objekt", primeri: "gradbeni objekt kot celota" },
  { stopnjaPct: 6, naziv: "Del objekta", primeri: "fasada, streha, okna, inštalacije" },
  { stopnjaPct: 10, naziv: "Drugo vlaganje", primeri: "druga vlaganja" },
  { stopnjaPct: 20, naziv: "Oprema", primeri: "pohištvo, bela tehnika, vozila" },
  { stopnjaPct: 50, naziv: "Računalniška oprema", primeri: "računalniška, strojna in programska oprema" },
];

export function nazivAmortizacije(stopnjaPct: number): string {
  return VRSTE_AMORTIZACIJE.find((v) => v.stopnjaPct === stopnjaPct)?.naziv ?? "Postavka";
}

/** Pragovi, s katerimi banke in izkušeni investitorji merijo posel. */
export const PRAGOVI = {
  /** Banke hočejo, da najemnina pokrije obrok z rezervo — vsaj 1,25×. */
  dscrBanka: 1.25,
  /** Nad tem je obrok res udobno pokrit. */
  dscrVaren: 1.5,
  /**
   * DSTI — najvišji delež mesečnega dohodka, ki sme iti za VSE obroke skupaj.
   *
   * To je edina od bančnih omejitev, ki je ZAVEZUJOČA (Sklep Banke Slovenije,
   * enotnih 50 % od 1. 7. 2023, prej stopnjevano 50/67 %). LTV 80 %/70 % je
   * samo priporočilo, od katerega sme banka odstopiti z obrazložitvijo, in
   * ročnost stanovanjskega kredita Banka Slovenije sploh ne omejuje — 30 let
   * je bančna praksa, ne predpis. Kalkulator zato DSTI preverja, LTV pa samo
   * priporoča.
   */
  dstiPct: 50,
  /** Za koliko odstotnih točk naj stresni test dvigne obrestno mero. */
  stresObrestiTocke: 2,
} as const;

// ————————————————————————————————————————————————————————————————
// VHOD
// ————————————————————————————————————————————————————————————————

/** Ena postavka prenove — njena stopnja odloča, kako hitro se odpisuje. */
export type PostavkaPrenove = { naziv: string; znesek: number; stopnjaPct: number };

export type VnosPosla = {
  kupnina: number;
  /** ISO datum nakupa; null = posel še ni sklenjen (presoja). */
  datumNakupa: string | null;
  /** Tržna vrednost danes; prazno = kupnina. */
  vrednostDanes: number | null;
  pologPct: number;
  obrestnaMeraPct: number;
  dobaLet: number;
  stroskiNakupa: number;
  /** Prenova kot ena številka — velja, če ni postavk. */
  prenova: number;
  rezervaPrenovePct: number;
  drugiZacetniStroski: number;
  /** Vrednost po prenovi (ARV); prazno = vrednost danes. */
  vrednostPoPrenovi: number | null;
  /** Postavke prenove; če obstajajo, njihova vsota prevlada nad `prenova`. */
  postavkePrenove: PostavkaPrenove[];
  /** Banka financira tudi prenovo — njen kredit se pridruži glavnemu. */
  kreditZaPrenovo: boolean;
  pologZaPrenovoPct: number;

  stEnot: number;
  najemninaNaEnoto: number;
  prazninePct: number;

  /** Stroški kot % efektivne najemnine — rastejo in padajo z zasedenostjo. */
  upravljanjePct: number;
  vzdrzevanjePct: number;
  rezervaCapexPct: number;
  /** Stroški v evrih na leto — ne glede na zasedenost. */
  zavarovanjeLeto: number;
  komunalaLeto: number;
  /** Davki na nepremičnino, NUSZ ipd. — letno. */
  davkiLeto: number;
  drugiStroskiLeto: number;

  rastVrednostiPct: number;
  ciljRoiPct: number;
  ciljCocPct: number;
  ciljLtvPct: number;
  /** Amortizacija zgradbe (brez zemljišča), % na leto. */
  amortizacijaZgradbePct: number;
  /** Delež kupnine, ki je zemljišče — se nikoli ne amortizira. */
  delezZemljiscaPct: number;

  davcniRezim: "fizicna" | "doo";

  stroskiRefinanciranja: number;
  obrestiRefinanciranjaPct: number | null;
  dobaRefinanciranjaLet: number | null;
};

// ————————————————————————————————————————————————————————————————
// KREDIT
// ————————————————————————————————————————————————————————————————

export type LetoNacrta = { leto: number; obresti: number; glavnica: number; saldo: number };

/** Anuiteta: isti obrok celo dobo, del obresti in del glavnice. */
export function mesecniObrok(kredit: number, letnaObrestPct: number, dobaLet: number): number {
  const n = Math.round(dobaLet * 12);
  if (kredit <= 0 || n <= 0) return 0;
  const r = letnaObrestPct / 100 / 12;
  if (r <= 0) return r2(kredit / n);
  return r2((kredit * r) / (1 - Math.pow(1 + r, -n)));
}

/**
 * Amortizacijski načrt po letih, računan po MESECIH. Prva leta so skoraj same
 * obresti; deljenje kredita z dobo bi equity močno precenilo.
 */
export function amortizacijskiNacrt(kredit: number, letnaObrestPct: number, dobaLet: number): LetoNacrta[] {
  const n = Math.round(dobaLet * 12);
  if (kredit <= 0 || n <= 0) return [];
  const r = letnaObrestPct / 100 / 12;
  const obrok = mesecniObrok(kredit, letnaObrestPct, dobaLet);
  const leta: LetoNacrta[] = [];
  let saldo = kredit;
  for (let leto = 1; leto <= Math.ceil(n / 12); leto++) {
    let obrestiLeto = 0;
    let glavnicaLeto = 0;
    for (let m = 0; m < 12 && (leto - 1) * 12 + m < n; m++) {
      const obresti = saldo * r;
      let glavnica = obrok - obresti;
      if (glavnica > saldo) glavnica = saldo;
      obrestiLeto += obresti;
      glavnicaLeto += glavnica;
      saldo -= glavnica;
    }
    leta.push({ leto, obresti: r2(obrestiLeto), glavnica: r2(glavnicaLeto), saldo: r2(Math.max(saldo, 0)) });
    if (saldo <= 0) break;
  }
  return leta;
}

/** Cela leta od nakupa do danes; 0 za posel v presoji. */
export function letOd(datumNakupa: string | null, danes: string): number {
  if (!datumNakupa) return 0;
  const od = new Date(datumNakupa + "T00:00:00Z").getTime();
  const doo = new Date(danes + "T00:00:00Z").getTime();
  if (Number.isNaN(od) || Number.isNaN(doo) || doo <= od) return 0;
  return Math.floor((doo - od) / (365.25 * 24 * 3600 * 1000));
}

// ————————————————————————————————————————————————————————————————
// IZRAČUN
// ————————————————————————————————————————————————————————————————

export type IzracunPosla = ReturnType<typeof izracunajPosel>;

export function izracunajPosel(v: VnosPosla, danes: string) {
  const kupnina = v.kupnina ?? 0;
  const kreditNakupa = r2(kupnina * (1 - (v.pologPct ?? 0) / 100));

  // Prenova: po postavkah, če so; sicer ena številka. Gradbena dela vedno
  // najdejo še kaj, zato v obeh primerih nosi rezervo.
  const postavke = (v.postavkePrenove ?? []).filter((p) => (p?.znesek ?? 0) > 0);
  const prenovaOsnova = postavke.length > 0 ? r2(postavke.reduce((s, p) => s + p.znesek, 0)) : (v.prenova ?? 0);
  const prenovaSkupaj = r2(prenovaOsnova * (1 + (v.rezervaPrenovePct ?? 0) / 100));

  const kreditPrenove = v.kreditZaPrenovo ? r2(prenovaSkupaj * (1 - (v.pologZaPrenovoPct ?? 30) / 100)) : 0;
  const kredit = r2(kreditNakupa + kreditPrenove);
  const polog = r2(kupnina - kreditNakupa + (v.kreditZaPrenovo ? prenovaSkupaj - kreditPrenove : 0));
  /** Vse, kar nepremičnina stane, preden zasluži cent. */
  const allIn = r2(kupnina + (v.stroskiNakupa ?? 0) + prenovaSkupaj + (v.drugiZacetniStroski ?? 0));
  /** Kar dejansko odide z mojega računa: all-in minus kredit. */
  const vlozeno = r2(allIn - kredit);
  const gotovinaZaStroske = r2(vlozeno - polog);

  // ── Prihodki ──
  const stEnot = Math.max(0, Math.round(v.stEnot ?? 0));
  const najemninaMesec = r2(stEnot * (v.najemninaNaEnoto ?? 0));
  const brutoNajemnina = r2(najemninaMesec * 12);
  const izgubaPraznin = r2(brutoNajemnina * ((v.prazninePct ?? 0) / 100));
  const efektivniPrihodek = r2(brutoNajemnina - izgubaPraznin);

  // ── Obratovalni stroški ──
  const stroskiPctSkupaj = (v.upravljanjePct ?? 0) + (v.vzdrzevanjePct ?? 0) + (v.rezervaCapexPct ?? 0);
  const stroskiOdstotni = r2(efektivniPrihodek * (stroskiPctSkupaj / 100));
  const stroskiFiksni = r2(
    (v.zavarovanjeLeto ?? 0) + (v.komunalaLeto ?? 0) + (v.davkiLeto ?? 0) + (v.drugiStroskiLeto ?? 0)
  );
  const stroski = r2(stroskiOdstotni + stroskiFiksni);
  const noi = r2(efektivniPrihodek - stroski);
  /** Denar, res odložen za prihodnja popravila. */
  const rezervaCapex = r2(efektivniPrihodek * ((v.rezervaCapexPct ?? 0) / 100));

  // ── Kredit ──
  const obrok = mesecniObrok(kredit, v.obrestnaMeraPct ?? 0, v.dobaLet ?? 0);
  const obrokiLeto = r2(obrok * 12);
  const nacrt = amortizacijskiNacrt(kredit, v.obrestnaMeraPct ?? 0, v.dobaLet ?? 0);
  const letLastnistva = letOd(v.datumNakupa, danes);
  const vrsticaLetos = nacrt[Math.min(letLastnistva, Math.max(nacrt.length - 1, 0))] ?? null;
  const vrsticaSalda = letLastnistva > 0 ? nacrt[Math.min(letLastnistva, nacrt.length) - 1] : null;
  const saldoKredita = vrsticaSalda ? vrsticaSalda.saldo : kredit;
  const odplacanoDoslej = r2(kredit - saldoKredita);
  const obrestiLetos = vrsticaLetos?.obresti ?? 0;
  const glavnicaLetos = vrsticaLetos?.glavnica ?? 0;
  const obrestiSkupaj = r2(nacrt.reduce((s, l) => s + l.obresti, 0));

  // ── Denarni tok ──
  const denarniTok = r2(noi - obrokiLeto);
  const denarniTokMesec = r2(denarniTok / 12);

  // ── Vrednost in equity ──
  const arv = v.vrednostPoPrenovi != null && v.vrednostPoPrenovi > 0 ? v.vrednostPoPrenovi : null;
  const vrednostDanes = v.vrednostDanes != null && v.vrednostDanes > 0 ? v.vrednostDanes : kupnina;
  const vrednost = arv ?? vrednostDanes;
  const equityIzPrenove = arv != null ? r2(arv - allIn) : null;
  const equity = r2(vrednost - saldoKredita);
  const ltv = vrednost > 0 ? pct2((saldoKredita / vrednost) * 100) : null;
  const rastLeto = r2(vrednost * ((v.rastVrednostiPct ?? 0) / 100));

  // ── Donosi ──
  const cashOnCash = vlozeno > 0 ? pct2((denarniTok / vlozeno) * 100) : null;
  const celotniDonosLeto = r2(denarniTok + glavnicaLetos + rastLeto);
  const roi = vlozeno > 0 ? pct2((celotniDonosLeto / vlozeno) * 100) : null;
  const capRate = kupnina > 0 ? pct2((noi / kupnina) * 100) : null;
  const dscr = obrokiLeto > 0 ? Math.round((noi / obrokiLeto) * 100) / 100 : null;
  /**
   * Prag zasedenosti: pri kateri zasedenosti denarni tok pade na nič.
   * Odstotni stroški padejo skupaj s prihodkom, fiksni in obroki ne — zato
   * se delita samo slednja z (1 − odstotek), kar da pravilen prag. Različica,
   * ki deli vse stroške z bruto najemnino, prag preceni.
   */
  const pragZasedenosti =
    brutoNajemnina > 0 && stroskiPctSkupaj < 100
      ? pct2(Math.min(100, Math.max(0, ((stroskiFiksni + obrokiLeto) / (1 - stroskiPctSkupaj / 100) / brutoNajemnina) * 100)))
      : null;
  const donosNaStrosek = allIn > 0 ? pct2((noi / allIn) * 100) : null;
  const razlikaDoObresti = donosNaStrosek != null ? pct2(donosNaStrosek - (v.obrestnaMeraPct ?? 0)) : null;
  const letDoKonca = Math.max((v.dobaLet ?? 0) - letLastnistva, 0);

  // ── Amortizacija (računovodska, ne denar) ──
  const delezZemljisca = v.delezZemljiscaPct ?? 0;
  const amortizacijaZgradbe = r2(kupnina * (1 - delezZemljisca / 100) * ((v.amortizacijaZgradbePct ?? 0) / 100));
  const amortizacijaPostavk = postavke.map((p) => ({
    naziv: p.naziv?.trim() || nazivAmortizacije(p.stopnjaPct),
    znesek: r2(p.znesek),
    stopnjaPct: p.stopnjaPct,
    letno: r2(p.znesek * ((p.stopnjaPct ?? 0) / 100)),
    let: p.stopnjaPct > 0 ? Math.ceil(100 / p.stopnjaPct) : 0,
  }));
  const amortizacijaPrenove = r2(amortizacijaPostavk.reduce((s, p) => s + p.letno, 0));
  const amortizacija = r2(amortizacijaZgradbe + amortizacijaPrenove);

  // ── Davek ──
  // Fizična oseba: 25 % od 90 % najemnine, nič se ne odbije. D.o.o.: 22 % od
  // dobička, kjer se odbijejo stroški, obresti in amortizacija — rezim, v
  // katerem prenova zasluži dvakrat.
  const rezim = v.davcniRezim === "doo" ? "doo" : "fizicna";
  const obrestiPrvoLeto = nacrt[0]?.obresti ?? 0;
  const obrestiZaDavek = letLastnistva > 0 ? obrestiLetos : obrestiPrvoLeto;
  let davcnaOsnova: number;
  let davekLeto: number;
  let prihranekAmortizacije: number;
  if (rezim === "doo") {
    davcnaOsnova = r2(efektivniPrihodek - stroski - obrestiZaDavek - amortizacija);
    davekLeto = r2(Math.max(0, davcnaOsnova) * (DAVEK.dooStopnjaPct / 100));
    const brezAmortizacije = r2(Math.max(0, davcnaOsnova + amortizacija) * (DAVEK.dooStopnjaPct / 100));
    prihranekAmortizacije = r2(brezAmortizacije - davekLeto);
  } else {
    davcnaOsnova = r2(Math.max(0, efektivniPrihodek) * (1 - DAVEK.fizicnaNormiraniStroskiPct / 100));
    davekLeto = r2(davcnaOsnova * (DAVEK.fizicnaStopnjaPct / 100));
    prihranekAmortizacije = 0;
  }
  const denarniTokPoDavku = r2(denarniTok - davekLeto);
  const denarniTokPoDavkuMesec = r2(denarniTokPoDavku / 12);
  const cashOnCashPoDavku = vlozeno > 0 ? pct2((denarniTokPoDavku / vlozeno) * 100) : null;

  const denarniTokDoslej = r2(denarniTok * letLastnistva);

  return {
    kupnina, kredit, kreditNakupa, kreditPrenove, polog, vlozeno, gotovinaZaStroske,
    prenovaSkupaj, allIn,
    stEnot, najemninaMesec, brutoNajemnina, izgubaPraznin, efektivniPrihodek,
    stroski, stroskiOdstotni, stroskiFiksni, rezervaCapex, noi,
    obrok, obrokiLeto, obrestiLetos, glavnicaLetos, obrestiSkupaj,
    nacrt, letLastnistva, saldoKredita, odplacanoDoslej, letDoKonca,
    denarniTok, denarniTokMesec,
    vrednost, vrednostDanes, arv, equityIzPrenove, rastLeto, equity, ltv,
    cenaNaEnoto: stEnot > 0 ? r2(kupnina / stEnot) : null,
    vrednostNaEnoto: stEnot > 0 ? r2(vrednost / stEnot) : null,
    cashOnCash, roi, celotniDonosLeto, capRate, dscr, pragZasedenosti,
    donosNaStrosek, razlikaDoObresti,
    amortizacija, amortizacijaZgradbe, amortizacijaPrenove, amortizacijaPostavk,
    rezim, davcnaOsnova, davekLeto, prihranekAmortizacije,
    denarniTokPoDavku, denarniTokPoDavkuMesec, cashOnCashPoDavku,
    denarniTokDoslej,
  };
}

// ————————————————————————————————————————————————————————————————
// REFINANCIRANJE
// ————————————————————————————————————————————————————————————————

/**
 * Kaj bi banka lahko refinancirala. Samo največji možni znesek: banka določi
 * LTV, naroči svojo cenitev in preveri posojilojemalca — to je aritmetika, ne
 * odobritev.
 */
export function refinanciranje(v: VnosPosla, f: IzracunPosla) {
  const ciljLtv = v.ciljLtvPct ?? 0;
  const novKredit = r2(f.vrednost * (ciljLtv / 100));
  const stroski = v.stroskiRefinanciranja ?? 0;
  const izplacilo = r2(novKredit - f.saldoKredita - stroski);
  const novaObrest = v.obrestiRefinanciranjaPct ?? v.obrestnaMeraPct ?? 0;
  const novaDoba = v.dobaRefinanciranjaLet ?? v.dobaLet ?? 0;
  const novObrok = mesecniObrok(novKredit, novaObrest, novaDoba);
  const noviObrokiLeto = r2(novObrok * 12);
  return {
    ciljLtv,
    novKredit,
    stroski,
    izplacilo,
    novaObrest,
    novaDoba,
    novObrok,
    noviObrokiLeto,
    novDenarniTok: r2(f.noi - noviObrokiLeto),
    equityPrej: f.equity,
    equityPotem: r2(f.vrednost - novKredit),
    /** Koliko prvotno vloženega denarja bi bilo spet v rokah. */
    povrnjeno: r2(f.denarniTokDoslej + Math.max(izplacilo, 0)),
    seVezano: r2(f.vlozeno - f.denarniTokDoslej - Math.max(izplacilo, 0)),
  };
}

export type Refinanciranje = ReturnType<typeof refinanciranje>;

// ————————————————————————————————————————————————————————————————
// OCENA POSLA
// ————————————————————————————————————————————————————————————————

export type Preverba = {
  kljuc: string;
  naziv: string;
  podrobnost: string;
  /** Ena poved za laika: kaj ta preverba pomeni. */
  razlaga: string;
  stanje: "ok" | "opozorilo" | "slabo";
  tocke: number;
  najvecTock: number;
};

export type OcenaPosla = { tocke: number; razsodba: "invest" | "watch" | "reject"; preverbe: Preverba[] };

/**
 * Ocena 0–100. Namenoma ne "največji ROI zmaga": posel, ki se ne preživlja
 * iz meseca v mesec, ni za kupiti ne glede na najvišjo številko na strani —
 * zato negativen denarni tok stane največ točk in razsodbo omeji navzdol.
 */
export function ocenaPosla(v: VnosPosla, f: IzracunPosla, refi: Refinanciranje): OcenaPosla {
  const p: Preverba[] = [];
  const dodaj = (x: Preverba) => p.push(x);

  const eur0 = (n: number) => `${Math.round(n).toLocaleString("sl-SI")} €`;

  // Denarni tok — 30
  const razlagaTok = "Ali po plačilu obroka vsak mesec kaj ostane. Če ne, posel vsak mesec jé tvoj denar.";
  if (f.denarniTok > 0) {
    dodaj({ kljuc: "tok", naziv: "Denarni tok", podrobnost: `${eur0(f.denarniTokMesec)} na mesec ostane`, razlaga: razlagaTok, stanje: "ok", tocke: 30, najvecTock: 30 });
  } else if (f.denarniTok === 0) {
    dodaj({ kljuc: "tok", naziv: "Denarni tok", podrobnost: "na ničli — nič ne ostane", razlaga: razlagaTok, stanje: "opozorilo", tocke: 12, najvecTock: 30 });
  } else {
    dodaj({ kljuc: "tok", naziv: "Denarni tok", podrobnost: `${eur0(f.denarniTokMesec)} na mesec — vsak mesec doplačuješ`, razlaga: razlagaTok, stanje: "slabo", tocke: 0, najvecTock: 30 });
  }

  // Cash-on-cash — 20
  const razlagaCoc = "Koliko odstotkov tvojega vloženega denarja se ti vrne vsako leto samo iz najemnine.";
  const coc = f.cashOnCash;
  if (coc == null) {
    dodaj({ kljuc: "coc", naziv: "Cash-on-cash", podrobnost: "ni lastnega vložka za izračun", razlaga: razlagaCoc, stanje: "opozorilo", tocke: 8, najvecTock: 20 });
  } else if (coc >= v.ciljCocPct) {
    dodaj({ kljuc: "coc", naziv: "Cash-on-cash", podrobnost: `${coc.toFixed(1)} % ≥ cilj ${v.ciljCocPct} %`, razlaga: razlagaCoc, stanje: "ok", tocke: 20, najvecTock: 20 });
  } else if (coc >= v.ciljCocPct * 0.7) {
    dodaj({ kljuc: "coc", naziv: "Cash-on-cash", podrobnost: `${coc.toFixed(1)} % — blizu cilja ${v.ciljCocPct} %`, razlaga: razlagaCoc, stanje: "opozorilo", tocke: 10, najvecTock: 20 });
  } else {
    dodaj({ kljuc: "coc", naziv: "Cash-on-cash", podrobnost: `${coc.toFixed(1)} % < cilj ${v.ciljCocPct} %`, razlaga: razlagaCoc, stanje: "slabo", tocke: 0, najvecTock: 20 });
  }

  // ROI — 15
  const razlagaRoi = "Celotni letni donos: najemnina + odplačana glavnica + rast vrednosti, na vloženi denar.";
  const roi = f.roi;
  if (roi == null) {
    dodaj({ kljuc: "roi", naziv: "ROI", podrobnost: "ni lastnega vložka za izračun", razlaga: razlagaRoi, stanje: "opozorilo", tocke: 6, najvecTock: 15 });
  } else if (roi >= v.ciljRoiPct) {
    dodaj({ kljuc: "roi", naziv: "ROI", podrobnost: `${roi.toFixed(1)} % ≥ cilj ${v.ciljRoiPct} %`, razlaga: razlagaRoi, stanje: "ok", tocke: 15, najvecTock: 15 });
  } else if (roi >= v.ciljRoiPct * 0.7) {
    dodaj({ kljuc: "roi", naziv: "ROI", podrobnost: `${roi.toFixed(1)} % — blizu cilja ${v.ciljRoiPct} %`, razlaga: razlagaRoi, stanje: "opozorilo", tocke: 7, najvecTock: 15 });
  } else {
    dodaj({ kljuc: "roi", naziv: "ROI", podrobnost: `${roi.toFixed(1)} % < cilj ${v.ciljRoiPct} %`, razlaga: razlagaRoi, stanje: "slabo", tocke: 0, najvecTock: 15 });
  }

  // DSCR — 15
  const razlagaDscr = "Kolikokrat najemnina (po stroških) pokrije obrok. Banke hočejo vsaj 1,25×.";
  const dscr = f.dscr;
  if (dscr == null) {
    dodaj({ kljuc: "dscr", naziv: "DSCR", podrobnost: "brez kredita", razlaga: razlagaDscr, stanje: "ok", tocke: 15, najvecTock: 15 });
  } else if (dscr >= PRAGOVI.dscrBanka) {
    dodaj({ kljuc: "dscr", naziv: "DSCR", podrobnost: `${dscr.toFixed(2)}× — najemnina lepo pokrije obrok`, razlaga: razlagaDscr, stanje: "ok", tocke: 15, najvecTock: 15 });
  } else if (dscr >= 1) {
    dodaj({ kljuc: "dscr", naziv: "DSCR", podrobnost: `${dscr.toFixed(2)}× — pokrije, a brez rezerve (banke želijo ${PRAGOVI.dscrBanka})`, razlaga: razlagaDscr, stanje: "opozorilo", tocke: 7, najvecTock: 15 });
  } else {
    dodaj({ kljuc: "dscr", naziv: "DSCR", podrobnost: `${dscr.toFixed(2)}× — najemnina ne pokrije obroka`, razlaga: razlagaDscr, stanje: "slabo", tocke: 0, najvecTock: 15 });
  }

  // LTV — 10
  const razlagaLtv = "Kolikšen del vrednosti je dolg. Manj dolga = več tvojega in več varnosti, če cene padejo.";
  const ltv = f.ltv;
  if (ltv == null || ltv <= v.ciljLtvPct) {
    dodaj({ kljuc: "ltv", naziv: "LTV", podrobnost: ltv == null ? "brez dolga" : `${ltv.toFixed(1)} % ≤ ${v.ciljLtvPct} %`, razlaga: razlagaLtv, stanje: "ok", tocke: 10, najvecTock: 10 });
  } else if (ltv <= v.ciljLtvPct + 10) {
    dodaj({ kljuc: "ltv", naziv: "LTV", podrobnost: `${ltv.toFixed(1)} % — malo nad ciljem ${v.ciljLtvPct} %`, razlaga: razlagaLtv, stanje: "opozorilo", tocke: 5, najvecTock: 10 });
  } else {
    dodaj({ kljuc: "ltv", naziv: "LTV", podrobnost: `${ltv.toFixed(1)} % — preveč dolga na vrednost`, razlaga: razlagaLtv, stanje: "slabo", tocke: 0, najvecTock: 10 });
  }

  // CAPEX rezerva — 5
  const razlagaCapex = "Ali vsak mesec kaj odlagaš za streho, kotel, okna. Sicer prva večja okvara pride iz žepa.";
  if (f.rezervaCapex > 0) {
    dodaj({ kljuc: "capex", naziv: "Rezerva za obnove", podrobnost: `${eur0(f.rezervaCapex)} na leto odloženo`, razlaga: razlagaCapex, stanje: "ok", tocke: 5, najvecTock: 5 });
  } else {
    dodaj({ kljuc: "capex", naziv: "Rezerva za obnove", podrobnost: "ni rezerve — prva večja okvara gre iz žepa", razlaga: razlagaCapex, stanje: "opozorilo", tocke: 0, najvecTock: 5 });
  }

  // Refinanciranje — 5
  const razlagaRefi = "Ali bi ti banka pri ciljnem LTV lahko vrnila del vloženega denarja (za naslednji posel).";
  if (refi.izplacilo > 0) {
    dodaj({ kljuc: "refi", naziv: "Refinanciranje", podrobnost: `potencialno ${eur0(refi.izplacilo)} nazaj`, razlaga: razlagaRefi, stanje: "ok", tocke: 5, najvecTock: 5 });
  } else {
    dodaj({ kljuc: "refi", naziv: "Refinanciranje", podrobnost: "pri ciljnem LTV zdaj ni kaj potegniti ven", razlaga: razlagaRefi, stanje: "opozorilo", tocke: 2, najvecTock: 5 });
  }

  const tocke = p.reduce((s, x) => s + x.tocke, 0);
  const razsodba: OcenaPosla["razsodba"] =
    f.denarniTok < 0 ? (tocke >= 55 ? "watch" : "reject") : tocke >= 75 ? "invest" : tocke >= 55 ? "watch" : "reject";
  return { tocke, razsodba, preverbe: p };
}

// ————————————————————————————————————————————————————————————————
// PROJEKCIJE
// ————————————————————————————————————————————————————————————————

/** Vrednost, dolg in equity v prihodnjih letih — slika premoženja, ki nastaja. */
export function projekcijaEquityja(f: IzracunPosla, rastPct: number, let_ = 10) {
  const vrstice = [];
  for (let leto = 1; leto <= let_; leto++) {
    const i = f.letLastnistva + leto - 1;
    const izvenNacrta = i >= f.nacrt.length;
    const saldo = izvenNacrta ? 0 : (f.nacrt[i]?.saldo ?? 0);
    const vrednost = r2(f.vrednost * Math.pow(1 + rastPct / 100, leto));
    vrstice.push({ leto, vrednost, saldo, equity: r2(vrednost - saldo), denarniTok: f.denarniTok });
  }
  return vrstice;
}

// ————————————————————————————————————————————————————————————————
// STRESNI TEST IN DSTI
// ————————————————————————————————————————————————————————————————

/**
 * Kaj se zgodi, če obresti zrastejo.
 *
 * Pri variabilni obrestni meri je to edino vprašanje, ki šteje: ne "koliko
 * nesem danes", ampak "ali preživim, če se obrok podraži". Dve odstotni točki
 * nista črnogled scenarij — evrske obrestne mere so se v letih 2022–2023
 * premaknile za več kot to, in sicer v enem letu.
 */
export function stresniTest(v: VnosPosla, f: IzracunPosla, dvigTock = PRAGOVI.stresObrestiTocke) {
  const novaObrest = (v.obrestnaMeraPct ?? 0) + dvigTock;
  const obrok = mesecniObrok(f.kredit, novaObrest, v.dobaLet ?? 0);
  const obrokiLeto = r2(obrok * 12);
  const tok = r2(f.noi - obrokiLeto);
  return {
    novaObrest,
    obrok,
    obrokiLeto,
    denarniTok: tok,
    denarniTokMesec: r2(tok / 12),
    dscr: obrokiLeto > 0 ? Math.round((f.noi / obrokiLeto) * 100) / 100 : null,
    /** Podraženje obroka v evrih na mesec. */
    razlikaObroka: r2(obrok - f.obrok),
    zdrzi: tok >= 0,
  };
}

/**
 * DSTI: ali obrok sploh gre skozi banko.
 *
 * Zavezujoča omejitev je 50 % neto dohodka za VSE obroke skupaj (novi in
 * obstoječi krediti ter lizingi, brez kreditnih kartic). Najemnina bodočega
 * najemnika se v dohodek praviloma ne šteje, dokler pogodbe ni — zato jo tu
 * upoštevamo samo, če jo uporabnik izrecno vpiše.
 *
 * Vrne `null`, kadar dohodek ni vpisan: kalkulator ne sme ugibati plače.
 */
export function preveriDsti(opis: {
  obrok: number;
  mesecniNetoDohodek: number;
  drugiMesecniObroki: number;
}): { dstiPct: number; najvecObrok: number; gre: boolean } | null {
  const dohodek = opis.mesecniNetoDohodek ?? 0;
  if (dohodek <= 0) return null;
  const skupajObroki = (opis.obrok ?? 0) + (opis.drugiMesecniObroki ?? 0);
  const najvecObroki = dohodek * (PRAGOVI.dstiPct / 100);
  return {
    dstiPct: pct2((skupajObroki / dohodek) * 100),
    /** Koliko sme znašati obrok TEGA kredita, da je DSTI še v mejah. */
    najvecObrok: r2(Math.max(0, najvecObroki - (opis.drugiMesecniObroki ?? 0))),
    gre: skupajObroki <= najvecObroki,
  };
}
