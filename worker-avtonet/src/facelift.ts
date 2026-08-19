/**
 * Facelift (lifting) — ločnica, ki je kohorti manjkala.
 *
 * Dva avta istega modela in ISTEGA LETNIKA sta lahko cenovno dva različna
 * avta, ker je eden pred faceliftom in drugi po njem. Sistem je zato do zdaj
 * kot "pod tržno ceno" pogosto pokazal samo starejšo izvedbo istega letnika.
 *
 * Meje se NE ugibajo in ne prihajajo iz modela: IZMERIJO se iz naših oglasov.
 * Facelift v podatkih pusti sled, ki je ni mogoče zamešati s starostjo — čez
 * noč se spremeni RAZŠIRJENOST ključne opreme. Pri VW Golfu je delež adaptivnega
 * tempomata med letnikoma 2016 in 2017 skočil z 51 % na 78 %, kar je natanko
 * meja Golfa 7.5 (11/2016). Starost takega skoka ne naredi — cena raste zvezno,
 * oprema pa stopničasto.
 *
 * Vsaka meja nosi dokaze (katera oprema je skočila, za koliko, na kakšnem
 * vzorcu), zato jo je mogoče zagovarjati ali zavrniti. Kjer skoka ni, meje ni
 * in facelift ostane neznan — kar je pošteno stanje, ne napaka.
 */

/** Mesec kot ena številka, da je primerjava trivialna: 2017/3 -> 24207. */
export function mesecIndeks(letnik: number, mesec: number | null): number {
  return letnik * 12 + (mesec !== null && mesec >= 1 && mesec <= 12 ? mesec - 1 : 5);
}

export type OglasZaFacelift = {
  id: string;
  druzinaModela: string | null;
  generacija: string | null;
  letnik: number | null;
  registracijaMesec: number | null;
  cena: number | null;
  naziv: string | null;
  opis: string | null;
  verzija: string | null;
  opremaKljucna: Record<string, boolean> | null;
};

// ------------------------------------------------------ izrecna omemba v oglasu

/**
 * Kaj o faceliftu pove sam oglas.
 *
 * "FL" je dvoumen (pri Hyundaiju pomeni facelift, drugod je lahko oznaka
 * opreme), zato ga upoštevamo le kot samostojno besedo ob številki motorja.
 * "pred faceliftom" je izrecna zanikanost in mora premagati golo omembo besede.
 */
export function izBesedila(o: { naziv: string | null; verzija: string | null; opis: string | null }): boolean | null {
  const t = `${o.naziv ?? ""} ${o.verzija ?? ""} ${(o.opis ?? "").slice(0, 1500)}`.toLowerCase();
  if (!t.trim()) return null;
  if (/\b(pred|before)[\s-]*facelift|pre[\s-]*facelift|predfacelift/.test(t)) return false;
  if (/facelift|face\s*lift|restyl|\bmopf\b/.test(t)) return true;
  if (/(?:^|[\s.,\-/])fl(?:[\s.,\-/]|$)/.test(t) && /\d[\s.,]?\d?\s*(?:tdi|tsi|tgdi|dci|cdti|hdi|crdi|d\b|i\b)/.test(t)) return true;
  return null;
}

// ------------------------------------------------------------- merjenje meje

export type Dokaz = { oprema: string; predPct: number; poPct: number; skok: number };

export type Meja = {
  druzinaModela: string;
  generacija: string | null;
  mejaLeto: number;
  mejaMesec: number;
  zaupanje: number;
  dokazi: { oprema: Dokaz[]; cenaSkokPct: number | null; izrecnihPo: number; izrecnihPred: number };
  vzorecPred: number;
  vzorecPo: number;
};

const NAJMANJ_NA_STRAN = 25;
const NAJMANJ_SKOK = 22; // odstotnih točk
const NAJMANJ_DOKAZOV = 2;
/**
 * Primerjamo LOKALNO okno pred in po meji (3 leta na stran), ne cele
 * zgodovine modela. Brez tega meritev vedno pokaže najstarejši del ponudbe:
 * Golf iz 1987 nima adaptivnega tempomata in Golf iz 2020 ga ima, kar je
 * tehnološki drift čez desetletja, ne facelift. Facelift je STOPNICA v ozkem
 * oknu, drift pa klanec.
 */
const OKNO_MESECEV = 36;
/** Dve meji bliže kot to sta ista stopnica, videna dvakrat. */
const NAJMANJ_RAZMIKA = 30;

function delez(oglasi: OglasZaFacelift[], kljuc: string): number {
  if (oglasi.length === 0) return 0;
  return (100 * oglasi.filter((o) => o.opremaKljucna?.[kljuc]).length) / oglasi.length;
}

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Poišče mesec, ob katerem se skupina najbolj razdvoji po opremi.
 *
 * Zahteve, da meja sploh nastane: dovolj vzorca na obeh straneh, vsaj dve
 * lastnosti s skokom čez prag in soglasje z oglasi, ki facelift omenjajo sami.
 * Ena sama lastnost ne zadošča — posamezna oprema lahko pride v ponudbo tudi
 * brez faceliftа.
 */
export function izmeriMeje(
  skupina: OglasZaFacelift[],
  oznakaSkupine: { druzina: string; generacija: string | null }
): Meja[] {
  const uporabni = skupina.filter((o) => o.letnik !== null && o.opremaKljucna !== null);
  if (uporabni.length < NAJMANJ_NA_STRAN * 2) return [];

  const zIndeksom = uporabni.map((o) => ({ o, i: mesecIndeks(o.letnik as number, o.registracijaMesec) }));
  const kljuci = [...new Set(uporabni.flatMap((o) => Object.keys(o.opremaKljucna ?? {})))];
  if (kljuci.length === 0) return [];

  const kandidati = [...new Set(zIndeksom.map((x) => x.i))].sort((a, b) => a - b);
  const najdene: Meja[] = [];

  for (const meja of kandidati) {
    // Lokalno okno na vsako stran — stopnica, ne klanec.
    const pred = zIndeksom.filter((x) => x.i < meja && x.i >= meja - OKNO_MESECEV).map((x) => x.o);
    const po = zIndeksom.filter((x) => x.i >= meja && x.i < meja + OKNO_MESECEV).map((x) => x.o);
    if (pred.length < NAJMANJ_NA_STRAN || po.length < NAJMANJ_NA_STRAN) continue;

    const dokazi: Dokaz[] = [];
    for (const k of kljuci) {
      const predPct = delez(pred, k);
      const poPct = delez(po, k);
      const skok = poPct - predPct;
      // Facelift opremo DODA; izginotje opreme je znak česa drugega.
      if (skok >= NAJMANJ_SKOK) dokazi.push({ oprema: k, predPct: Math.round(predPct), poPct: Math.round(poPct), skok: Math.round(skok) });
    }
    if (dokazi.length < NAJMANJ_DOKAZOV) continue;

    const cenePred = pred.map((o) => o.cena).filter((c): c is number => c !== null && c > 0);
    const cenePo = po.map((o) => o.cena).filter((c): c is number => c !== null && c > 0);
    const mPred = mediana(cenePred);
    const mPo = mediana(cenePo);
    const cenaSkokPct = mPred && mPo ? Math.round(((mPo - mPred) / mPred) * 100) : null;

    const izrecnihPo = po.filter((o) => izBesedila(o) === true).length;
    const izrecnihPred = pred.filter((o) => izBesedila(o) === true).length;

    // Ocena: moč skokov + soglasje oglasov, ki facelift omenjajo sami.
    const mocSkokov = dokazi.reduce((s, d) => s + d.skok, 0) / dokazi.length;
    let zaupanje = Math.min(70, Math.round(mocSkokov * 1.4) + dokazi.length * 4);
    if (izrecnihPo + izrecnihPred >= 3) {
      const delezPravilnih = izrecnihPo / (izrecnihPo + izrecnihPred);
      // Oglasi, ki pišejo "facelift", morajo pretežno pasti NA pravo stran.
      if (delezPravilnih < 0.6) continue;
      zaupanje = Math.min(95, zaupanje + Math.round(delezPravilnih * 25));
    }
    najdene.push({
      druzinaModela: oznakaSkupine.druzina,
      generacija: oznakaSkupine.generacija,
      mejaLeto: Math.floor(meja / 12),
      mejaMesec: (meja % 12) + 1,
      zaupanje,
      dokazi: { oprema: dokazi.sort((a, b) => b.skok - a.skok).slice(0, 6), cenaSkokPct, izrecnihPo, izrecnihPred },
      vzorecPred: pred.length,
      vzorecPo: po.length,
    });
  }

  // Sosednji meseci opisujejo ISTO stopnico; obdržimo najmočnejšo in
  // zavržemo vse, ki so ji preblizu.
  const izbrane: Meja[] = [];
  for (const m of [...najdene].sort((a, b) => b.zaupanje - a.zaupanje)) {
    if (m.zaupanje < 45) continue;
    const i = m.mejaLeto * 12 + m.mejaMesec;
    if (izbrane.some((z) => Math.abs(z.mejaLeto * 12 + z.mejaMesec - i) < NAJMANJ_RAZMIKA)) continue;
    izbrane.push(m);
  }
  return izbrane.sort((a, b) => a.mejaLeto * 12 + a.mejaMesec - (b.mejaLeto * 12 + b.mejaMesec));
}

// ----------------------------------------------------------------- uporaba

export type MejaZaUporabo = { mejaLeto: number; mejaMesec: number; zaupanje: number };

export type Uvrstitev = {
  /**
   * Serija = kateri odsek proizvodnje je to. 0 je prva, 1 tista za prvo
   * izmerjeno mejo in tako naprej. Za kohorto šteje ENAKOST serije: naj gre
   * za facelift ali za novo generacijo, cenovno sta to dva različna avta.
   */
  serija: number | null;
  serijaVir: "meja" | null;
  /** Kaj o faceliftu trdi sam oglas (ločeno od meritve). */
  faceliftTrditev: boolean | null;
  /** Meja tik pred tem avtom — za razlago v UI ("po faceliftu 11/2016"). */
  mejaOpis: string | null;
};

/** V katero serijo pade ta oglas. */
export function uvrsti(o: OglasZaFacelift, meje: Map<string, MejaZaUporabo[]>): Uvrstitev {
  const faceliftTrditev = izBesedila(o);
  const prazna: Uvrstitev = { serija: null, serijaVir: null, faceliftTrditev, mejaOpis: null };
  if (!o.druzinaModela || o.letnik === null) return prazna;

  const zaModel =
    meje.get(kljucSkupine(o.druzinaModela, o.generacija)) ?? meje.get(kljucSkupine(o.druzinaModela, null));
  if (!zaModel || zaModel.length === 0) return prazna;

  const indeks = mesecIndeks(o.letnik, o.registracijaMesec);
  // Brez meseca registracije je letnik NA meji dvoumen: letnik 2016 je lahko
  // pred ali po novembrskem faceliftu. Takrat raje ne trdimo ničesar.
  if (o.registracijaMesec === null && zaModel.some((m) => m.mejaLeto === o.letnik)) return prazna;

  const urejene = [...zaModel].sort((a, b) => a.mejaLeto * 12 + a.mejaMesec - (b.mejaLeto * 12 + b.mejaMesec));
  let serija = 0;
  let zadnja: MejaZaUporabo | null = null;
  for (const m of urejene) {
    if (indeks >= m.mejaLeto * 12 + (m.mejaMesec - 1)) {
      serija += 1;
      zadnja = m;
    }
  }
  return {
    serija,
    serijaVir: "meja",
    faceliftTrditev,
    mejaOpis: zadnja ? `po prelomu ${zadnja.mejaMesec}/${zadnja.mejaLeto}` : "pred prvim izmerjenim prelomom",
  };
}

export const kljucSkupine = (druzina: string, generacija: string | null) => `${druzina}|${generacija ?? ""}`;
