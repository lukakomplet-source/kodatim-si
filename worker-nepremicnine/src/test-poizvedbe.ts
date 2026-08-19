import "dotenv/config";
import { connect } from "./db.js";
import { bboxOkoli, kandidatiZaSredisce, razdaljaKm } from "../../src/lib/nepremicnine/kraji.js";

/**
 * Dimni test STREŽNIŠKIH poizvedb strani /nepremicnine proti živi bazi.
 *
 * Prijavljene strani prek brskalnika ne moremo preveriti, lahko pa preverimo
 * točno tiste nize filtrov, ki jih stran pošlje PostgREST-u — tam se je
 * skrivala napaka "primerjava dveh stolpcev" (HTTP 400 ob vsaki uporabi).
 */

let napak = 0;
const preveri = (ime: string, ok: boolean, opomba: string) => {
  if (!ok) napak += 1;
  console.log(`  ${ok ? "OK    " : "NAPAKA"} ${ime}: ${opomba}`);
};

async function main() {
  const db = connect();

  // 1) Padec cene — prej col-vs-col (HTTP 400), zdaj izračunani stolpec.
  {
    const { data, error, count } = await db
      .from("nep_oglasi")
      .select("id, cena_eur, cena_prvotna_eur, padec_pct", { count: "exact" })
      .eq("status", "aktiven")
      .not("padec_pct", "is", null)
      .order("padec_pct", { ascending: false, nullsFirst: false })
      .limit(5);
    preveri("padec cene brez napake", !error, error?.message ?? `zadetkov ${count}`);
    const vsi = (data ?? []).every((v) => Number(v.cena_eur) < Number(v.cena_prvotna_eur));
    preveri("vsi zadetki imajo res nižjo ceno", vsi, JSON.stringify((data ?? []).map((v) => v.padec_pct)));
  }

  // 2) Investicijski cilj — OR z zmožnostjo (m² ali enote).
  {
    const enote = 10;
    const { data, error, count } = await db
      .from("nep_oglasi")
      .select("id, povrsina_m2, st_enot, st_enot_ocena, vec_enot", { count: "exact" })
      .eq("status", "aktiven")
      .eq("posel", "prodaja")
      .in("tip", ["hisa", "poslovni_prostor"])
      .lte("cena_eur", 700_000)
      .or(`povrsina_m2.gte.${enote * 25},st_enot.gte.${enote},st_enot_ocena.gte.${enote},vec_enot.eq.true`)
      .limit(5);
    preveri("cilj (10 enot, 700k) brez napake", !error, error?.message ?? `kandidatov ${count}`);
    preveri("kandidatov je vsaj 100", (count ?? 0) >= 100, `${count}`);
    const veljavni = (data ?? []).every(
      (v) => Number(v.povrsina_m2 ?? 0) >= 250 || Number(v.st_enot ?? 0) >= 10 || Number(v.st_enot_ocena ?? 0) >= 10 || v.vec_enot
    );
    preveri("vsak kandidat izpolnjuje vsaj en pogoj", veljavni, "");
  }

  // 3) Radij — središče iz šifranta + bbox + haversine (kot na strani).
  {
    const { tocni } = kandidatiZaSredisce("maribora");
    let sredisce: { lat: number; lng: number } | null = null;
    for (const k of tocni) {
      const { data } = await db.from("nep_kraji").select("lat, lng").eq("ime_norm", k).order("prebivalcev", { ascending: false, nullsFirst: false }).limit(1);
      if (data && data.length > 0) { sredisce = { lat: Number(data[0].lat), lng: Number(data[0].lng) }; break; }
    }
    preveri("središče 'Maribora' najdeno", sredisce !== null, JSON.stringify(sredisce));
    if (sredisce) {
      const b = bboxOkoli(sredisce.lat, sredisce.lng, 15);
      const { data, error } = await db
        .from("nep_oglasi")
        .select("id, lat, lng")
        .eq("status", "aktiven")
        .gte("lat", b.latMin).lte("lat", b.latMax).gte("lng", b.lngMin).lte("lng", b.lngMax)
        .limit(300);
      preveri("radij poizvedba brez napake", !error, error?.message ?? `v pravokotniku ${(data ?? []).length}`);
      const vKrogu = (data ?? []).filter((v) => razdaljaKm(sredisce!.lat, sredisce!.lng, Number(v.lat), Number(v.lng)) <= 15);
      preveri("v krogu 15 km je kaj zadetkov", vKrogu.length > 0, `${vKrogu.length} od ${(data ?? []).length} v pravokotniku`);
    }
  }

  // 4) enotMin — OR čez potrjene in ocenjene enote.
  {
    const { error, count } = await db
      .from("nep_oglasi")
      .select("id", { count: "exact", head: true })
      .eq("status", "aktiven")
      .or("st_enot.gte.3,st_enot_ocena.gte.3");
    preveri("enotMin brez napake", !error, error?.message ?? `zadetkov ${count}`);
  }

  // 5) Deal feed in kanonične nepremičnine.
  {
    const { data } = await db.from("nep_statistika").select("podatki, izracunano").eq("kljuc", "posli").maybeSingle();
    const posli = (data?.podatki as { posli?: unknown[] } | null)?.posli ?? [];
    preveri("deal feed napolnjen", posli.length > 0, `${posli.length} poslov`);
    const { count: nepremicnin } = await db.from("nep_nepremicnine").select("id", { count: "exact", head: true });
    const { count: oglasov } = await db.from("nep_oglasi").select("id", { count: "exact", head: true }).not("nepremicnina_id", "is", null);
    preveri("vsak oglas ima kanonično nepremičnino", (oglasov ?? 0) > 7000, `${oglasov} povezanih, ${nepremicnin} nepremičnin`);
  }

  console.log(napak === 0 ? "\nVSE OK" : `\n${napak} NAPAK`);
  process.exitCode = napak === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
