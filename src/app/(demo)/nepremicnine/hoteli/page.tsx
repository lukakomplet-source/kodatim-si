import { redirect } from "next/navigation";
import { Hotel } from "lucide-react";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { odstraniDvojnike } from "@/lib/nepremicnine/dvojniki";
import { oceniTurizem, type Atrakcija, type TurizemObcina } from "@/lib/nepremicnine/turizem";
import { NepNav } from "../NepNav";
import { HoteliClient, type HotelKartica } from "./HoteliClient";

/**
 * Hoteli naprodaj — nastanitveni objekti (hotel, penzion, hostel, gostišče,
 * apartmajska hiša), kakor jih zbiralnik zazna iz besedila oglasa (stolpec
 * `nastanitev`, parse.ts). Brez predizračuna: objektov je okoli dvesto in
 * stran jih prebere sproti, zato so cene in fotografije vedno sveže.
 *
 * Donosa NAMENOMA ne računamo. Za hotel bi ga dala cena sobe × zasedenost,
 * cen sob pa nimamo v nobenem viru — številka bi bila izmišljena. Prikažemo
 * to, kar vemo: ceno na enoto (običajna primerjava hotelov), prenočitve v
 * občini (SURS) in za Hrvaško ponudbo v kraju (register ministrstva).
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoteli — SBN Nepremičnine" };

type Vrstica = {
  id: string;
  vir: string;
  url: string;
  naslov: string | null;
  kraj: string | null;
  drzava: string | null;
  tip: string | null;
  nastanitev: string | null;
  cena_eur: number | null;
  cena_prvotna_eur: number | null;
  povrsina_m2: number | null;
  zemljisce_m2: number | null;
  st_enot: number | null;
  st_enot_ocena: number | null;
  st_lezisc: number | null;
  lat: number | null;
  lng: number | null;
  nepremicnina_id: string | null;
  first_seen: string;
  last_seen: string;
  slika_url: string | null;
};

const POLJA =
  "id, vir, url, naslov, kraj, drzava, tip, nastanitev, cena_eur, cena_prvotna_eur, povrsina_m2, zemljisce_m2, st_enot, st_enot_ocena, st_lezisc, lat, lng, nepremicnina_id, first_seen, last_seen, slika_url";

/**
 * Kar detektor zazna kot hotel, a ni objekt za nakup: parcela "za hotel",
 * projekt brez stavbe, posamezen apartma v aparthotelu (pod 150 m²), hotel na
 * Zanzibarju. Pregledano ročno 5. 10. 2026 na vseh 197 zadetkih.
 */
const NI_OBJEKT = /zazidljiv|parcela|^posest,|projek|project|t1 zone|sports and recreation|zanzibar|afrika/i;

const brezSumnikov = (x: string) =>
  x.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();

function drzavaOglasa(v: Vrstica): "SI" | "HR" | null {
  // Agencije pišejo Istro v naslov, kraj pa po svoje ("Istrska, Buje" je dobil SI).
  if (/hrva[šs]k|istr|croatia/i.test(`${v.naslov ?? ""} ${v.kraj ?? ""}`)) return "HR";
  if (v.drzava === "SI" || v.drzava === "HR") return v.drzava;
  return /gorenjska|savinjska|podravska|koroška|osrednjeslovenska|posavsk|primorska|pomurska|notranjska|dolenjska/i.test(v.kraj ?? "")
    ? "SI"
    : null;
}

/** Zunaj komponente, ker je render čist; strežniška funkcija sme brati uro. */
function odcitekUre(): number {
  return Date.now();
}

export default async function NepHoteliPage() {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/nepremicnine/hoteli"));

  const db = createAvtonetClient();
  const zdaj = odcitekUre();
  // 45 dni: hrvaške oglase nepremicnine.net od 29. 9. preverja le 2. faza
  // (seznami berejo samo Slovenijo), zato jih ne vidimo vsak dan. Kartica
  // pove, kdaj je bil oglas zadnjič viden.
  const od = new Date(zdaj - 45 * 86_400_000).toISOString();
  const { data } = await db
    .from("nep_oglasi")
    .select(POLJA)
    .eq("status", "aktiven")
    .eq("posel", "prodaja")
    .not("nastanitev", "is", null)
    .gte("last_seen", od)
    .limit(1000);
  const vse = ((data ?? []) as Vrstica[]).filter(
    (v) =>
      !NI_OBJEKT.test(v.naslov ?? "") &&
      !/izven eu|tujina/i.test(v.kraj ?? "") &&
      !(v.povrsina_m2 !== null && Number(v.povrsina_m2) < 150)
  );

  // Ista hiša na več portalih: najprej pravilo iskalnika, nato še ista cena in
  // površina (±5 m²) — siol ima za kraj samo regijo, zato ga pravilo iskalnika
  // ne poveže z istim hotelom na nepremicnine.net.
  const { vrstice: prve, tudiNa } = odstraniDvojnike(vse);
  const unikatne: Vrstica[] = [];
  const dodatno = new Map<string, string[]>();
  const poOsnovi = new Map<string, Vrstica>();
  const razpon = new Map<string, number>();
  // Med dvojniki ostane oglas s fotografijo, med temi oglas z nepremicnine.net.
  const nn = (v: Vrstica) => (v.vir === "nepremicnine.net" ? 0 : 1);
  for (const v of [...prve].sort((a, b) => Number(!a.slika_url) - Number(!b.slika_url) || nn(a) - nn(b))) {
    // sloveniaestates objavi isti objekt dvakrat z dvema cenama (končnica "-2").
    const osnova = `${v.vir}|${v.url.replace(/\/$/, "").replace(/-2$/, "")}`;
    const ista = poOsnovi.get(osnova);
    if (ista) {
      const a = Number(ista.cena_eur);
      const b = Number(v.cena_eur);
      if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
        razpon.set(ista.id, Math.min(a, b));
        ista.cena_eur = Math.max(a, b);
      }
      continue;
    }
    const cena = v.cena_eur === null ? null : Number(v.cena_eur);
    const m2 = v.povrsina_m2 === null ? null : Number(v.povrsina_m2);
    const dvojnik =
      cena === null
        ? undefined
        : unikatne.find(
            (u) =>
              u.cena_eur !== null &&
              Number(u.cena_eur) === cena &&
              (m2 === null || u.povrsina_m2 === null || Math.abs(Number(u.povrsina_m2) - m2) <= 5)
          );
    if (dvojnik) {
      dodatno.set(dvojnik.id, [...(dodatno.get(dvojnik.id) ?? []), v.vir]);
      continue;
    }
    poOsnovi.set(osnova, v);
    unikatne.push(v);
  }

  // Turizem: SURS prenočitve po občinah in atrakcije (Slovenija).
  const [aRes, oRes] = await Promise.all([
    db.from("nep_atrakcije").select("ime, tip, lat, lng, moc").eq("vkljuceno", true).limit(500),
    db.from("nep_turizem_obcine").select("obcina, prenocitve, lat, lng").not("lat", "is", null).limit(500),
  ]);
  const atrakcije = (aRes.data ?? []) as Atrakcija[];
  const obcine = (oRes.data ?? []) as TurizemObcina[];

  // Hrvaška: koliko kategoriziranih objektov in enot je v istem kraju (MINT).
  const kljuci = [
    ...new Set(unikatne.flatMap((v) => (v.kraj ?? "").split(",").map(brezSumnikov).filter((k) => k.length > 2))),
  ];
  const hrPonudba = new Map<string, { objektov: number; enot: number; hotelov: number }>();
  if (kljuci.length > 0) {
    const { data: hr } = await db
      .from("nep_hr_nastanitve")
      .select("kraj_kljuc, vrsta, enot")
      .in("kraj_kljuc", kljuci.slice(0, 300));
    for (const h of (hr ?? []) as { kraj_kljuc: string; vrsta: string; enot: number | null }[]) {
      const p = hrPonudba.get(h.kraj_kljuc) ?? { objektov: 0, enot: 0, hotelov: 0 };
      p.objektov += 1;
      p.enot += h.enot ?? 0;
      if (/^hotel/i.test(h.vrsta)) p.hotelov += 1;
      hrPonudba.set(h.kraj_kljuc, p);
    }
  }

  const hoteli: HotelKartica[] = unikatne.map((v) => {
    const drzava = drzavaOglasa(v);
    const cena = v.cena_eur === null ? null : Number(v.cena_eur);
    const enot = v.st_enot ?? v.st_enot_ocena ?? null;
    const tur = drzava === "SI" ? oceniTurizem(v, atrakcije, obcine) : null;
    let hr: HotelKartica["hrPonudba"] = null;
    if (drzava === "HR") {
      for (const del of (v.kraj ?? "").split(",").map(brezSumnikov)) {
        const p = hrPonudba.get(del);
        if (p) {
          hr = { kraj: del, ...p };
          break;
        }
      }
    }
    const prvotna = v.cena_prvotna_eur === null ? null : Number(v.cena_prvotna_eur);
    return {
      id: v.id,
      url: v.url,
      vir: v.vir,
      naslov: v.naslov,
      kraj: v.kraj,
      drzava,
      vrsta: v.nastanitev ?? "hotel",
      cena,
      cenaOd: razpon.get(v.id) ?? null,
      padecPct: cena !== null && prvotna !== null && prvotna > cena ? Math.round((1 - cena / prvotna) * 1000) / 10 : null,
      povrsina: v.povrsina_m2 === null ? null : Math.round(Number(v.povrsina_m2)),
      zemljisce: v.zemljisce_m2 === null ? null : Math.round(Number(v.zemljisce_m2)),
      enot,
      enotVir: v.st_enot !== null ? "potrjeno" : enot !== null ? (v.st_lezisc !== null ? "iz ležišč" : "ocena") : null,
      lezisc: v.st_lezisc,
      cenaNaEnoto: cena !== null && enot !== null && enot > 0 ? Math.round(cena / enot) : null,
      slika: v.slika_url,
      dniNaTrgu: Math.max(0, Math.floor((zdaj - new Date(v.first_seen).getTime()) / 86_400_000)),
      zadnjicVidenDni: Math.max(0, Math.floor((zdaj - new Date(v.last_seen).getTime()) / 86_400_000)),
      tudiNa: [...(tudiNa.get(v.id) ?? []).map((d) => d.vir), ...(dodatno.get(v.id) ?? [])],
      turizem: tur
        ? {
            tocke: tur.tocke,
            atrakcija: tur.atrakcija ? `${tur.atrakcija.ime} ${tur.atrakcija.km.toLocaleString("sl-SI")} km` : null,
            obcina: tur.obcina?.ime ?? null,
            prenocitve: tur.obcina?.prenocitve ?? null,
          }
        : null,
      hrPonudba: hr,
    };
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
        <Hotel className="h-7 w-7 text-accent" />
        Hoteli naprodaj
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm text-zinc-500">
        Hoteli, penzioni, hosteli, gostišča in apartmajske hiše iz vseh naših virov, brez dvojnikov.
        Vrsto prepozna zbiralnik iz besedila oglasa — preveri v oglasu. Donosa ne računamo, ker cen
        sob nimamo; za primerjavo je cena na enoto, za Slovenijo prenočitve v občini (SURS), za
        Hrvaško ponudba v kraju (register ministrstva za turizem).
      </p>

      <NepNav aktiven="/nepremicnine/hoteli" jeAdmin={dostop.jeAdmin} />

      {hoteli.length === 0 ? (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Trenutno ni nobenega nastanitvenega objekta naprodaj.
        </p>
      ) : (
        <HoteliClient hoteli={hoteli} />
      )}
    </div>
  );
}
