import "server-only";
import { chatJSON } from "@/lib/openai";
import { opombeVNavodilo, opombeZa } from "./opombe";
import { OZNAKE_KAROSERIJE, oznakaZnacilke, opisVozila, razvrstiPoVrednosti, type Vozilo } from "./vozilo";
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

/**
 * Sent to the model per candidate. Small, but not starved: the first version
 * sent a 90-character rebuilt name, no body style and 14 alphabetical
 * equipment slugs — so "Limuzina" versus "Sportback" was invisible and
 * "matrix_led" fell off the end while "abs" made the cut. Now the advert's own
 * title goes in whole (that is where avto.net sellers write S line, MATRIX,
 * Limuzina), the body style is an explicit field, and equipment is listed
 * expensive-first.
 */
type AiKandidat = {
  i: number;
  naziv: string;
  karoserija: string | null;
  letnik: number | null;
  km: number | null;
  kw: number | null;
  oprema: string;
};

const SISTEM_UJEMANJE = `Presojaš, ali sta dve rabljeni vozili res primerljivi za oceno cene. Natančen si kot sodni cenilec: razlika med limuzino in karavanom, med S line in osnovno opremo, med Matrix in navadnimi LED žarometi je razlika v ceni.
Vrni SAMO JSON: {"ocene":[{"i":number,"podobnost":number,"razlog":string}]}

KAJ PRIMERJAŠ, PO VRSTNEM REDU POMEMBNOSTI:
1. MODEL IN GENERACIJA — A3 ni A4, Formentor ni Ateca. Drug model → podobnost 0–10.
2. MOTOR IN MOČ — ista motorna izvedenka (30 TFSI ni 35 TFSI, 320d ni 330d).
   Razlika v moči nad 20 % → največ 30.
3. KAROSERIJA — limuzina, karavan, sportback/hatchback, kupe in SUV so RAZLIČNE
   karoserije z različnimi cenami. Isti model v drugi karoseriji (Limuzina proti
   Sportback) → največ 75 in razliko OBVEZNO omeni v razlogu.
   POZOR: različno poimenovanje ISTE oblike ni druga karoserija (SUV kupé proti
   SUV pri istem modelu, sportback proti hatchback, limuzina proti sedan) —
   viri isto vozilo kategorizirajo različno.
4. PAKET OPREME — S line / M Sport / AMG Line / VZ / GT Line je bistven del
   vrednosti. Cilj ga ima, kandidat ne (ali obratno) → odbij 10–20 točk in povej.
   Paket je pogosto zapisan v NAZIVU oglasa, ne v seznamu opreme — beri oboje.
5. DRAGA OPREMA — Matrix LED ni navadni LED. Panorama, HUD, zračno vzmetenje,
   Brembo zavore, DCC podvozje, 360° kamera: preveri v nazivu IN v opremi.

TRDA PRAVILA:
- Nad 85 sme le vozilo, ki se ujema v modelu, generaciji, motorju/moči,
  karoseriji IN ravni opreme.
- Sodi SAMO po navedenih podatkih. Manjkajoč podatek ni dokaz odsotnosti —
  ne kaznuj ga in si ga ne izmišljaj.
- "razlog" je ena kratka slovenska poved: kaj se ujema in katera je glavna razlika.
- Ne omenjaj cen in jih ne ocenjuj — cena ni tvoja naloga.
- Za vsak vnos iz seznama vrni natanko eno oceno z istim "i".`;

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
        // The advert's own title, whole — sellers write the facts that decide
        // comparability ("Limuzina", "S line", "MATRIX") exactly there.
        naziv: (p.naziv ?? [p.znamka, p.model, p.verzija].filter(Boolean).join(" ")).slice(0, 130),
        karoserija: p.karoserija ? (OZNAKE_KAROSERIJE[p.karoserija] ?? p.karoserija) : null,
        letnik: p.letnik,
        km: p.km,
        kw: p.kw,
        oprema: razvrstiPoVrednosti(p.znacilke).slice(0, 20).map(oznakaZnacilke).join(", "),
      })),
    });
  }

  const glavaCilja = [
    `CILJNO VOZILO: ${opisVozila(cilj)}`,
    `Karoserija cilja: ${cilj.karoserija ? OZNAKE_KAROSERIJE[cilj.karoserija] ?? cilj.karoserija : "ni podatka"}`,
    `Paket / verzija cilja: ${cilj.verzija ?? "ni podatka"}`,
    `Oprema cilja (dražja najprej): ${
      razvrstiPoVrednosti(cilj.znacilke).slice(0, 25).map(oznakaZnacilke).join(", ") || "ni podatka"
    }`,
  ].join("\n");

  const poIndeksu = new Map<number, { podobnost: number; razlog: string }>();

  // Uporabnikovi popravki iz prejsnjih ocen gredo v navodilo presojevalcu.
  // Prav tu se je pokazala potreba: pri VW Arteonu je primerjava predfacelift in
  // facelift imela za isti avto, ceprav sta to razlicna avta z razlicno ceno.
  const opombe = await opombeZa("primerjava", { znamka: cilj.znamka, model: cilj.model });
  const sistem = SISTEM_UJEMANJE + opombeVNavodilo(opombe);

  await Promise.all(
    kosi.map(async (kos) => {
      try {
        const odgovor = await chatJSON<{ ocene?: { i: number; podobnost: number; razlog: string }[] }>(
          sistem,
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
