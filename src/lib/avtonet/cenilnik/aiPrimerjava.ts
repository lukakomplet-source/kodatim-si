import "server-only";
import { chatJSON } from "@/lib/openai";
import { oznakaZnacilke, opisVozila, type Vozilo } from "./vozilo";
import { skupnaPodobnost, type Cenitev, type Primerljiv } from "./cenitev";

/**
 * Where AI is allowed to touch the valuation — and where it is not.
 *
 * It may do two things: judge whether two cars are genuinely the same product
 * (a job that needs language understanding, because "320d xDrive M Sport" and
 * "320d 4x4 M-paket" are the same car written twice), and put the finished
 * result into a sentence a dealer can read.
 *
 * It may NOT produce a price. Every figure in the valuation comes from the
 * statistics over real Slovenian adverts, and the explanation is generated
 * AFTER those numbers are fixed, from the numbers themselves. This ordering is
 * the whole safeguard: a model that is only ever shown the answer cannot
 * invent one.
 *
 * Both steps are optional. If the API key is missing or the call fails, the
 * valuation stands as computed — the feature degrades to "no AI commentary",
 * never to "no answer".
 */

/** Sent to the model per candidate. Small on purpose: this is the cost driver. */
type AiKandidat = {
  i: number;
  naziv: string;
  letnik: number | null;
  km: number | null;
  kw: number | null;
  oprema: string;
};

const SISTEM_UJEMANJE = `Presojaš, ali sta dve rabljeni vozili res primerljivi za oceno cene.
Vrni SAMO JSON: {"ocene":[{"i":number,"podobnost":number,"razlog":string}]}

PRAVILA:
1. "podobnost" je 0–100: ali gre za isti model, generacijo, motor in raven opreme.
2. Sodi SAMO po navedenih podatkih. Če podatka ni, ga ne domnevaj in ne kaznuj.
3. "razlog" je ena kratka slovenska poved o glavni razliki ali ujemanju.
4. Ne omenjaj cen in jih ne ocenjuj — cena ni tvoja naloga.
5. Za vsak vnos iz seznama vrni natanko eno oceno z istim "i".`;

/**
 * Re-ranks the shortlist. The algorithm already did the heavy filtering; this
 * only corrects the cases where wording hides a real match (or a real
 * difference) that string comparison cannot see.
 *
 * The default covers the WHOLE shortlist (which cenitev caps at 40), and that
 * is not generosity — it is consistency. The first live run judged only the
 * top 20, and the un-judged bottom half stayed in the statistics with their
 * algorithmic scores: an RS5 and an A7 that the AI would have thrown out kept
 * feeding the quartiles. Everything that counts toward the numbers gets
 * judged, or the judging is theatre.
 */
export async function aiPreveriUjemanje(
  cilj: Vozilo,
  primerljivi: Primerljiv[],
  najvec = 40
): Promise<Primerljiv[]> {
  const podmnozica = primerljivi.slice(0, najvec);
  if (podmnozica.length === 0) return primerljivi;

  // Judged in chunks of 10, in parallel — not one call with 40. Observed live:
  // given all 40 at once, the model started sliding ("Oba sta Audi A1 30 TFSI"
  // for an A1 candidate against an A3 target — it forgot the target mid-list)
  // and dropped true matches it had accepted in a smaller batch. Small chunks
  // keep the target in focus, and a failed chunk costs its ten candidates their
  // commentary, not the whole pass.
  const VELIKOST = 10;
  const kosi: { odmik: number; kandidati: AiKandidat[] }[] = [];
  for (let od = 0; od < podmnozica.length; od += VELIKOST) {
    kosi.push({
      odmik: od,
      kandidati: podmnozica.slice(od, od + VELIKOST).map((p, i) => ({
        i: od + i,
        naziv: [p.znamka, p.model, p.verzija].filter(Boolean).join(" ").slice(0, 90),
        letnik: p.letnik,
        km: p.km,
        kw: p.kw,
        oprema: p.znacilke.slice(0, 14).map(oznakaZnacilke).join(", "),
      })),
    });
  }

  const glavaCilja = [
    `CILJNO VOZILO: ${opisVozila(cilj)}`,
    `Oprema cilja: ${cilj.znacilke.map(oznakaZnacilke).join(", ") || "ni podatka"}`,
  ].join("\n");

  const poIndeksu = new Map<number, { podobnost: number; razlog: string }>();
  await Promise.all(
    kosi.map(async (kos) => {
      try {
        const odgovor = await chatJSON<{ ocene?: { i: number; podobnost: number; razlog: string }[] }>(
          SISTEM_UJEMANJE,
          `${glavaCilja}\n\nKANDIDATI:\n${JSON.stringify(kos.kandidati)}`,
          { temperature: 0 }
        );
        for (const o of odgovor.ocene ?? []) {
          if (typeof o?.i === "number" && Number.isFinite(o.podobnost)) {
            poIndeksu.set(o.i, {
              podobnost: Math.max(0, Math.min(100, Math.round(o.podobnost))),
              razlog: typeof o.razlog === "string" ? o.razlog.slice(0, 200) : "",
            });
          }
        }
      } catch {
        // This chunk keeps its algorithmic scores; the others still count.
      }
    })
  );

  const posodobljeni = primerljivi.map((p, i) => {
    const ai = poIndeksu.get(i);
    if (!ai) return p;
    return { ...p, aiPodobnost: ai.podobnost, aiRazlog: ai.razlog || null };
  });

  // The two opinions are averaged rather than the AI's replacing ours: the
  // algorithmic score is grounded in measured fields, the AI's in wording.
  // Letting either one alone decide throws away what the other knows.
  return [...posodobljeni].sort((a, b) => skupnaPodobnost(b) - skupnaPodobnost(a));
}

const SISTEM_RAZLAGA = `Si slovenski avtomobilski analitik. Razložiš že izračunano oceno vrednosti.
Vrni SAMO JSON: {"povzetek":string,"dejavniki":string[],"opozorilo":string|null}

PRAVILA — ta so absolutna:
1. NE izračunavaj in NE spreminjaj nobene cene. Vse številke so ti dane; uporabi jih točno take.
2. Ne trdi, da je bilo vozilo prodano. Oglas, ki je izginil, ni dokaz o prodaji.
   Govori o "času na oglasniku" in "zadnji ceni pred izginotjem".
3. CILJNO vozilo NI oglas iz naše baze in NIMA statusa — ne pripoveduj, ali je
   aktivno ali izginilo. Statusi obstajajo samo za primerjave.
4. Ne opisuj ničesar, česar ni v danih podatkih. Prazno polje pomeni "ni podatka".
5. "povzetek" naj bo 2–3 povedi, v slovenščini, za trgovca z avtomobili.
6. "dejavniki" so 3–5 kratkih alinej, ki povedo, KAJ je vplivalo na oceno.
7. "opozorilo" izpolni samo, če je vzorec majhen ali podatki šibki; sicer null.`;

export type AiRazlaga = {
  povzetek: string;
  dejavniki: string[];
  opozorilo: string | null;
};

/**
 * The written explanation. Given only the finished numbers, so it can describe
 * them but cannot produce new ones.
 */
export async function aiRazlozi(cenitev: Cenitev): Promise<AiRazlaga | null> {
  const najboljsi = cenitev.primerljivi.slice(0, 8).map((p) => ({
    naziv: [p.znamka, p.model, p.verzija].filter(Boolean).join(" ").slice(0, 70),
    letnik: p.letnik,
    km: p.km,
    cena: p.cena,
    status: p.status,
    dniNaTrgu: p.dniNaTrgu === null ? null : Math.round(p.dniNaTrgu),
    podobnost: p.podobnost,
  }));

  const podatki = {
    vozilo: cenitev.opisCilja,
    oprema: cenitev.cilj.znacilke.map(oznakaZnacilke),
    ocenjenaVrednost: cenitev.ocenjenaVrednost,
    razpon: [cenitev.razponSpodaj, cenitev.razponZgoraj],
    priporocenaCena: cenitev.priporocenaCena,
    hitraProdaja: cenitev.hitraProdaja,
    zanesljivost: cenitev.zanesljivost,
    steviloPrimerljivih: cenitev.primerljivi.length,
    aktivnihZCeno: cenitev.aktivni.vzorec,
    zakljucenih: cenitev.zakljuceni.vzorec,
    medianaDniNaOglasniku: cenitev.cas.medianaDni === null ? null : Math.round(cenitev.cas.medianaDni),
    delezDo14Dni: cenitev.cas.delez14,
    // The market's own verdict: last prices of comparables that vanished fast.
    hitroIzginulih: cenitev.hitroIzginuli.vzorec,
    hitroIzginuliMedianaZadnjeCene: cenitev.hitroIzginuli.medianaZadnjeCene,
    hitroIzginuliPragDni: cenitev.hitroIzginuli.pragDni,
    popravekZaradiKilometrov: cenitev.popravekKm?.eur ?? null,
    oknoLetnika: cenitev.oknoLetnika,
    opozorila: cenitev.opozorila,
    najboljsePrimerjave: najboljsi,
  };

  try {
    return await chatJSON<AiRazlaga>(SISTEM_RAZLAGA, JSON.stringify(podatki), { temperature: 0.2 });
  } catch {
    return null;
  }
}
