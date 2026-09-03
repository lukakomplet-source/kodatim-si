import { mesecniObrok, PRAGOVI } from "./posel";

/**
 * PREDLAGAJ POLOG IN DOBO — namesto da uporabnik tipka številke, dokler
 * povzetek ne izgleda prav. Prevzeto iz Kompletka (deal-optimizer.ts).
 *
 * Ko je financiranje na vrsti, je vse drugo že določeno: cena, prenova,
 * najemnina, obresti — torej NOI. Ostaneta dva vzvoda, ki vlečeta vsak v
 * svojo smer: manjši polog dvigne cash-on-cash in obrok, daljša doba zniža
 * obrok in podaljša dolg. Zato preprosto preizkusimo vsako razumno
 * kombinacijo in pokažemo najboljše tri.
 */

export type VhodPredloga = {
  /** Kupnina — kredit je delež te, ne all-in stroška. */
  kupnina: number;
  allIn: number;
  /** Kar banka ceni: ARV pri prenovi, sicer današnja vrednost. */
  vrednost: number;
  noi: number;
  obrestnaMeraPct: number;
  ciljCocPct: number;
  ciljLtvPct: number;
  /** Najmanjši polog, ki ga pravila (Banka Slovenije / praksa) sploh dopuščajo. */
  najmanjsiPologPct?: number;
};

export type Predlog = {
  kljuc: "donos" | "uravnotezeno" | "hitro";
  naziv: string;
  zakaj: string;
  pologPct: number;
  dobaLet: number;
  coc: number;
  dscr: number;
  ltv: number;
  tokMesec: number;
  vlozeno: number;
  obrok: number;
  dosezeCilj: boolean;
};

export type IzidPredloga = {
  predlogi: Predlog[];
  /** Nič ne deluje — pove, kaj bi se moralo spremeniti. */
  tezava: string | null;
  /** Posel gre skozi, a noben predlog ne doseže cilja — povedati na glas. */
  ciljZgresen: string | null;
};

type Kandidat = Omit<Predlog, "kljuc" | "naziv" | "zakaj">;

const DOBE = [10, 15, 20, 25, 30];
/**
 * Koraki po 5 %: polog se dogovarja v okroglih številkah. Konča se pri 90 —
 * nakup brez kredita je odločitev, ali si sploh izposoditi, ne možnost
 * financiranja, in bi sicer po DSCR zmagal v vsaki primerjavi.
 */
const POLOGI = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90];

function oceni(d: VhodPredloga, pologPct: number, dobaLet: number): Kandidat {
  const kredit = d.kupnina * (1 - pologPct / 100);
  const vlozeno = d.allIn - kredit;
  const obrok = mesecniObrok(kredit, d.obrestnaMeraPct, dobaLet);
  const obrokiLeto = obrok * 12;
  const tok = d.noi - obrokiLeto;
  return {
    pologPct,
    dobaLet,
    coc: vlozeno > 0 ? (tok / vlozeno) * 100 : 0,
    dscr: obrokiLeto > 0 ? d.noi / obrokiLeto : Infinity,
    ltv: d.vrednost > 0 ? (kredit / d.vrednost) * 100 : 0,
    tokMesec: tok / 12,
    vlozeno,
    obrok,
    dosezeCilj: false,
  };
}

export function predlagajFinanciranje(d: VhodPredloga): IzidPredloga {
  if (d.kupnina <= 0) return { predlogi: [], tezava: "Vpiši kupnino.", ciljZgresen: null };
  if (d.noi <= 0) {
    return {
      predlogi: [],
      tezava: "Pri tej najemnini in stroških nepremičnina ne zasluži nič (NOI je 0 ali negativen) — noben polog tega ne popravi.",
      ciljZgresen: null,
    };
  }

  const ciljLtv = d.ciljLtvPct > 0 ? d.ciljLtvPct : 100;
  const najmanjsiPolog = d.najmanjsiPologPct ?? 0;
  const vsi: Kandidat[] = [];
  for (const polog of POLOGI) {
    if (polog < najmanjsiPolog) continue;
    for (const doba of DOBE) {
      const k = oceni(d, polog, doba);
      // Pol točke tolerance: 70,02 % LTV ni drug posel kot 70 %.
      if (k.ltv > ciljLtv + 0.5) continue;
      vsi.push({ ...k, dosezeCilj: k.coc >= d.ciljCocPct });
    }
  }

  if (vsi.length === 0) {
    const min = Math.max(najmanjsiPolog, 100 - ciljLtv);
    return {
      predlogi: [],
      tezava: `Pri ciljnem LTV ${ciljLtv} % in pravilih pologa je potrebnih vsaj ${Math.round(min)} % lastnih sredstev — s temi številkami ni izvedljive kombinacije.`,
      ciljZgresen: null,
    };
  }

  // Kar bi banka res podpisala: obrok pokrit z rezervo in tok, ki ni negativen.
  const izvedljivi = vsi.filter((k) => k.dscr >= PRAGOVI.dscrBanka && k.tokMesec >= 0);

  if (izvedljivi.length === 0) {
    const najblizje = [...vsi].sort((a, b) => b.tokMesec - a.tokMesec)[0]!;
    const manjka = Math.abs(Math.round(najblizje.tokMesec));
    return {
      predlogi: [],
      ciljZgresen: null,
      tezava:
        najblizje.tokMesec < 0
          ? `Noben polog in nobena doba ne dasta pozitivnega denarnega toka — najbližje je ${najblizje.pologPct} % pologa na ${najblizje.dobaLet} let, pa še tam manjka ${manjka} € na mesec. Nižja cena ali višja najemnina.`
          : `Denarni tok je pozitiven, a obrok je pretesen glede na najemnino (DSCR pod ${PRAGOVI.dscrBanka}). Banka takega kredita najbrž ne odobri.`,
    };
  }

  const predlogi: Predlog[] = [];

  // 1. Največ donosa na vsak vloženi evro.
  const najvecDonosa = [...izvedljivi].sort((a, b) => b.coc - a.coc || a.vlozeno - b.vlozeno)[0]!;
  predlogi.push({
    ...najvecDonosa,
    kljuc: "donos",
    naziv: "Največji donos",
    zakaj: `Najvišji cash-on-cash (${najvecDonosa.coc.toFixed(1)} %) — najmanj lastnega denarja, ki še vzdrži pri banki.`,
  });

  // 2. Isti posel z zrakom: največ varnosti med tistimi, ki še dosežejo cilj.
  const dosezejo = izvedljivi.filter((k) => k.coc >= d.ciljCocPct);
  const bazen = dosezejo.length > 0 ? dosezejo : izvedljivi;
  const uravnotezen = [...bazen].sort((a, b) => b.dscr - a.dscr || b.coc - a.coc)[0]!;
  if (uravnotezen.pologPct !== najvecDonosa.pologPct || uravnotezen.dobaLet !== najvecDonosa.dobaLet) {
    predlogi.push({
      ...uravnotezen,
      kljuc: "uravnotezeno",
      naziv: uravnotezen.dscr >= PRAGOVI.dscrVaren ? "Varna varianta" : "Uravnoteženo",
      zakaj:
        dosezejo.length > 0
          ? `Doseže tvoj cilj ${d.ciljCocPct} % in pusti največ zraka (DSCR ${uravnotezen.dscr.toFixed(2)}).`
          : `Tvojega cilja ${d.ciljCocPct} % ne doseže nobena kombinacija; ta ima največ varnostne rezerve.`,
    });
  }

  // 3. Najprej brez dolga — za tistega, ki tako bolje spi.
  const hitro = [...izvedljivi].sort((a, b) => a.dobaLet - b.dobaLet || b.coc - a.coc)[0]!;
  if (!predlogi.some((s) => s.pologPct === hitro.pologPct && s.dobaLet === hitro.dobaLet)) {
    predlogi.push({
      ...hitro,
      kljuc: "hitro",
      naziv: "Najhitrejše odplačilo",
      zakaj: `Kredit odplačan v ${hitro.dobaLet} letih in tok je še vedno pozitiven (${Math.round(hitro.tokMesec)} €/mes).`,
    });
  }

  const najboljsiCoc = Math.max(...izvedljivi.map((k) => k.coc));
  return {
    predlogi,
    tezava: null,
    ciljZgresen:
      najboljsiCoc < d.ciljCocPct
        ? `Tvojega cilja ${d.ciljCocPct} % cash-on-cash ne doseže nobena kombinacija — največ, kar se da iztisniti, je ${najboljsiCoc.toFixed(1)} %.`
        : null,
  };
}
