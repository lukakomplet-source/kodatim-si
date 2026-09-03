import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Calculator } from "lucide-react";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { oceniNajemnino } from "@/lib/nepremicnine/najemnina";
import { KalkulatorClient } from "./KalkulatorClient";
import { NepNav } from "../NepNav";

/**
 * Investicijski kalkulator, po želji predizpolnjen iz oglasa (?oglas=id).
 *
 * Predizpolnijo se samo DEJSTVA iz oglasa (cena, enote, naziv) in ocena
 * najemnine iz naših najemnih oglasov — z virom in oznako, da je ocena. Vse
 * ostalo so uporabnikove predpostavke, ker to tudi so.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Investicijski kalkulator — SBN Nepremičnine" };

export default async function KalkulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ oglas?: string; enot?: string; najemnina?: string; prenova?: string }>;
}) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/nepremicnine/kalkulator"));
  const jeAdmin = dostop.jeAdmin;

  const sp = await searchParams;
  const oglas = sp.oglas;
  const cel = (v: string | undefined) => {
    const n = Number(v);
    return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };
  // Cilj iz iskanja ("10 enot po 650 €, prenova do proračuna") pride kot
  // parametri. To so uporabnikove PREDPOSTAVKE — prepišejo podatke oglasa,
  // a ohranijo tržno oceno vidno, da je primerjava vedno pri roki.
  const ciljEnot = cel(sp.enot);
  const ciljNajemnina = cel(sp.najemnina);
  const ciljPrenova = cel(sp.prenova);

  let zacetek: {
    cena: number | null;
    enot: number | null;
    naziv: string | null;
    najemnina: number | null;
    najemninaVir: string | null;
    prenova: number | null;
  } = { cena: null, enot: null, naziv: null, najemnina: null, najemninaVir: null, prenova: null };

  if (oglas) {
    const db = createAvtonetClient();
    const { data } = await db
      .from("nep_oglasi")
      .select("naslov, kraj, regija, tip, cena_eur, povrsina_m2, st_enot, st_enot_ocena")
      .eq("id", oglas)
      .maybeSingle();
    if (data) {
      const v = data as {
        naslov: string | null;
        kraj: string | null;
        regija: string | null;
        tip: string | null;
        cena_eur: number | null;
        povrsina_m2: number | null;
        st_enot: number | null;
        st_enot_ocena: number | null;
      };
      const enot = ciljEnot ?? v.st_enot ?? v.st_enot_ocena ?? 1;
      const najemnina = await oceniNajemnino(db, {
        tip: v.tip,
        regija: v.regija,
        kraj: v.kraj,
        povrsinaM2: v.povrsina_m2 !== null && enot > 0 ? v.povrsina_m2 / enot : null,
      });
      zacetek = {
        cena: v.cena_eur,
        enot,
        naziv: [v.naslov, v.kraj].filter(Boolean).join(" · ") || null,
        najemnina: ciljNajemnina ?? najemnina?.mesecna ?? null,
        najemninaVir:
          ciljNajemnina !== null
            ? najemnina
              ? `Najemnina ${ciljNajemnina} €/mes je TVOJ cilj (predpostavka). Ocena iz ${najemnina.vzorec} najemnih oglasov: ${najemnina.mesecna} €/mes (${najemnina.opis}).`
              : `Najemnina ${ciljNajemnina} €/mes je TVOJ cilj (predpostavka) — tržne ocene ni (premalo najemnih oglasov).`
            : najemnina
              ? `Najemnina ${najemnina.mesecna} €/mes je OCENA iz ${najemnina.vzorec} najemnih oglasov (${najemnina.opis}) — preveri in popravi.`
              : "Ocene najemnine ni (premalo najemnih oglasov) — vpiši svojo.",
        prenova: ciljPrenova,
      };
    }
  }
  // Cilj deluje tudi brez (najdenega) oglasa.
  if (zacetek.enot === null && ciljEnot !== null) zacetek.enot = ciljEnot;
  if (zacetek.najemnina === null && ciljNajemnina !== null) zacetek.najemnina = ciljNajemnina;
  if (zacetek.prenova === null && ciljPrenova !== null) zacetek.prenova = ciljPrenova;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Link
        href="/nepremicnine"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Nazaj na iskanje
      </Link>
      <h1 className="mt-3 flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
        <Calculator className="h-7 w-7 text-accent" />
        Investicijski kalkulator
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm text-zinc-500">
        Tri vprašanja: koliko vložiš, koliko ti vsak mesec ostane in ali je to dober posel. Zgoraj
        odgovor v treh številkah, spodaj vsa globina — kredit po pravilih Banke Slovenije, prenova
        po postavkah, davek za fizično osebo ali d.o.o., ocena 0–100 in slika čez deset let. Vsako
        polje takoj preračuna vse.
      </p>
      <NepNav aktiven="/nepremicnine/kalkulator" jeAdmin={jeAdmin} />
      <KalkulatorClient zacetek={zacetek} />
    </div>
  );
}
