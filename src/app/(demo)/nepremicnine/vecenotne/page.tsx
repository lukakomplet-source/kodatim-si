import { redirect } from "next/navigation";
import { Building } from "lucide-react";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { NepNav } from "../NepNav";
import { VecenotneClient, type Vecenotna } from "./VecenotneClient";

/**
 * Večenotne blizu mesta — hiše, ki se dajo razdeliti v stanovanja za oddajo.
 * Seznam PREDIZRAČUNA worker (vecenotne.ts, nep_statistika kljuc='vecenotne')
 * enkrat na krog; NOI po isti formuli kot kalkulator.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Večenotne — SBN Nepremičnine" };

export default async function NepVecenotnePage() {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/nepremicnine/vecenotne"));

  const db = createAvtonetClient();
  const { data } = await db
    .from("nep_statistika")
    .select("podatki, izracunano")
    .eq("kljuc", "vecenotne")
    .maybeSingle();
  const podatki = (data?.podatki ?? null) as { izidi?: Vecenotna[]; pregledanih?: number } | null;
  // Na stran gre samo, kar se splača pogledati: cap na ceno vsaj 8 % ali vsaj
  // 6 % donosa s predelavo. Cel izračun (~800 hiš) ostane v bazi za filtre.
  const izidi = (podatki?.izidi ?? []).filter((r) => r.capCena >= 8 || r.donosVse >= 6);

  // Fotografija po referenci in sproti, kot pri poslih: v predizračunu bi se postarala.
  // Lokacija za zemljevid pri virih, ki fotografij ne dovolijo (c21, KW …).
  const slike = new Map<string, { slika: string | null; lat: number | null; lng: number | null }>();
  if (izidi.length > 0) {
    const { data: vrstice } = await db.from("nep_oglasi").select("id, slika_url, lat, lng").in("id", izidi.map((r) => r.id));
    for (const v of (vrstice ?? []) as { id: string; slika_url: string | null; lat: number | null; lng: number | null }[])
      slike.set(v.id, { slika: v.slika_url, lat: v.lat, lng: v.lng });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
        <Building className="h-7 w-7 text-accent" />
        Večenotne blizu mesta
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm text-zinc-500">
        Hiše do 10 km od mesta, ki se dajo razdeliti v vsaj 3 stanovanja za oddajo. Najemnina je
        mediana NAŠIH najemnih oglasov podobne velikosti v 3–6 km, NOI je izračunan kot v
        kalkulatorju. Cap na ceno je NOI ÷ cena; s predelavo je NOI ÷ (cena + 3 % + predelava v
        enote).{" "}
        {data?.izracunano && (
          <span className="text-zinc-400">
            Izračunano {new Date(data.izracunano as string).toLocaleString("sl-SI")}
            {podatki?.pregledanih ? ` iz ${podatki.pregledanih.toLocaleString("sl-SI")} aktivnih prodajnih oglasov v Sloveniji.` : "."}
          </span>
        )}
      </p>

      <NepNav aktiven="/nepremicnine/vecenotne" jeAdmin={dostop.jeAdmin} />

      {izidi.length === 0 ? (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Seznam še ni izračunan — nastane ob naslednjem krogu zbiranja.
        </p>
      ) : (
        <VecenotneClient izidi={izidi} slike={Object.fromEntries(slike)} />
      )}
    </div>
  );
}
