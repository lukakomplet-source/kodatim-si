import { NextResponse } from "next/server";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop } from "@/lib/avtonet/dostop";

/**
 * Kar konzola bere, medtem ko pregled teče.
 *
 * Napredek je ena vrstica v bazi, ki jo zbiralnik sproti dopolnjuje — zato
 * "v živo" ne potrebuje ne vtičnice ne potiskanja: branje vrstice je branje
 * resnice. Če zbiralnik med potjo umre, se številke preprosto nehajo
 * premikati, kar je poštenejši signal od vrtiljaka, ki se vrti naprej.
 *
 * Obiskovalec dobi 200 z `jeAdmin: false` in ne 403: /nepremicnine je javna
 * predstavitvena stran in rdeč 403 v brskalnikovi konzoli bi pri stranki
 * izgledal kot okvara, čeprav se ni zgodilo nič.
 */

export const dynamic = "force-dynamic";

const POLJA =
  "id, status, faza, vir, zahtevano_ob, zacetek, konec, strani, najdenih, novih, posodobljenih, " +
  "sprememb_cen, izginulih, napak, zadnja_rezina, zadnja_napaka, opozorilo, pregled_popoln, " +
  "rezin_skupaj, rezin_koncanih, detajlov_obdelanih, detajlov_skupaj, zahteval, updated_at";

/**
 * Ali zbiralnik sploh teče. Vrstica v bazi, ki se ne premika, ima dva možna
 * vzroka — vir je počasen ali procesa ni — in samo eden od njiju je težava.
 * Zbiralnik odgovarja na 127.0.0.1:8081; če ne odgovori v sekundi in pol, ga
 * ni. Napaka se namenoma požre: konzola mora delati tudi brez zbiralnika.
 */
async function zbiralnikZiv(): Promise<{ ziv: boolean; mirujeMs: number | null }> {
  try {
    const res = await fetch(`http://127.0.0.1:${process.env.NEP_WORKER_PORT ?? 8081}/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return { ziv: false, mirujeMs: null };
    const telo = (await res.json()) as { heartbeatAgeMs?: number };
    return { ziv: true, mirujeMs: Number(telo.heartbeatAgeMs ?? 0) };
  } catch {
    return { ziv: false, mirujeMs: null };
  }
}

export async function GET() {
  const dostop = await preberiDostop();
  if (!dostop.jeAdmin) {
    return NextResponse.json({ jeAdmin: false, aktivna: null, zgodovina: [] });
  }

  const db = createAvtonetClient();
  const vceraj = new Date(Date.now() - 86_400_000).toISOString();

  const [zbiralnik, aktivnaRes, zgodovinaRes, viriRes, urnikRes, napakeRes, statRes] = await Promise.all([
    zbiralnikZiv(),
    db
      .from("nep_pregledi")
      .select(POLJA)
      .in("status", ["zahtevano", "tece"])
      .order("zahtevano_ob", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("nep_pregledi")
      .select(POLJA)
      .in("status", ["koncano", "koncano_delno", "napaka", "preklicano"])
      .order("zahtevano_ob", { ascending: false })
      .limit(12),
    db.from("nep_viri").select("*").order("vir"),
    db.from("nep_urnik").select("omogocen, ure, detajlov_na_krog").eq("id", 1).maybeSingle(),
    db
      .from("nep_napake")
      .select("ob, vir, tip, sporocilo, url")
      .gte("ob", vceraj)
      .order("ob", { ascending: false })
      .limit(20),
    db.from("nep_statistika").select("kljuc, podatki, izracunano"),
  ]);

  // Manjkajoča tabela pomeni samo, da migracija še ni pognana — ne okvara.
  if (aktivnaRes.error?.code === "PGRST205" || urnikRes.error?.code === "PGRST205") {
    return NextResponse.json({
      jeAdmin: true,
      migracijaManjka: true,
      aktivna: null,
      zgodovina: [],
      viri: [],
    });
  }

  /**
   * Stanje baze po virih: koliko oglasov je, koliko jih že ima detajle in
   * koliko jih še čaka. To je edini pošten odgovor na "koliko je še dela" —
   * vrstica pregleda pove samo, kaj je naredil TA krog.
   */
  const viri = (viriRes.data ?? []) as { vir: string; detajlov_kvota: number | null; najvec_strani: number | null }[];
  const urnikVrstica = (urnikRes.data ?? null) as { ure?: string; detajlov_na_krog?: number } | null;
  const urnikUre = String(urnikVrstica?.ure ?? "4")
    .split(/[,\s]+/)
    .map((h) => Number(h))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  const stanjePoVirih = await Promise.all(
    viri.map(async (v) => {
      const [aktivnih, zDetajli, zaustavljeni] = await Promise.all([
        db.from("nep_oglasi").select("id", { count: "exact", head: true }).eq("vir", v.vir).eq("status", "aktiven"),
        db
          .from("nep_oglasi")
          .select("id", { count: "exact", head: true })
          .eq("vir", v.vir)
          .eq("status", "aktiven")
          .not("detajl_zajet", "is", null),
        db
          .from("nep_oglasi")
          .select("id", { count: "exact", head: true })
          .eq("vir", v.vir)
          .eq("status", "aktiven")
          .is("detajl_zajet", null)
          .gt("detajl_naslednji_poskus", new Date().toISOString()),
      ]);
      /**
       * Koliko dni do polnega zajema podrobnosti pri sedanjem proračunu.
       *
       * Vir, ki zavrne po ~50 zahtevkih v seji, ne dovoli hitrega polnjenja —
       * in ta številka je pogosto neprijetna. Prav zato mora biti izpisana:
       * skrita bi pomenila obljubo popolnosti, ki je ne moremo držati.
       * Merilo je namerno preprosto (preostanek / kvota / krogi na dan) in
       * ne upošteva blokad, zato je to najboljši možni scenarij, ne napoved.
       */
      const preostanek = Math.max(0, (aktivnih.count ?? 0) - (zDetajli.count ?? 0));
      /**
       * Merodajna je NAJMANJŠA od treh meja: globalna nastavitev urnika,
       * kvota tega adapterja in proračun zahtevkov, ki ga 1. faza pusti.
       * Z globalno številko (400) bi ocena za vir, ki prenese 30 zahtevkov na
       * krog, lagala za več kot desetkrat — in to v optimistično smer, kar je
       * najslabša možna smer za tako oceno.
       */
      const meje = [
        Number(urnikVrstica?.detajlov_na_krog ?? 400),
        v.detajlov_kvota ?? Number.POSITIVE_INFINITY,
        v.najvec_strani ?? Number.POSITIVE_INFINITY,
      ].filter((x) => Number.isFinite(x) && x > 0);
      const detajlovNaKrog = Math.max(1, Math.min(...meje));
      const krogovNaDan = Math.max(1, urnikUre.length);
      const dniDoPolnega =
        preostanek > 0 ? Math.ceil(preostanek / (detajlovNaKrog * krogovNaDan)) : 0;

      return {
        vir: v.vir,
        aktivnih: aktivnih.count ?? 0,
        zDetajli: zDetajli.count ?? 0,
        parkiranih: zaustavljeni.count ?? 0,
        dniDoPolnega,
        detajlovNaKrog,
        krogovNaDan,
      };
    })
  );

  const [{ count: vsehOglasov }, { count: izginulih }, { count: kandidatov }, prostorRes] = await Promise.all([
    db.from("nep_oglasi").select("id", { count: "exact", head: true }),
    db.from("nep_oglasi").select("id", { count: "exact", head: true }).eq("status", "izginil"),
    db.from("nep_zdruzitve").select("id", { count: "exact", head: true }).eq("nacin", "kandidat"),
    // Velikost baze pozna samo lokalna instanca; v oblaku pride nazaj napaka
    // in polje ostane prazno, kar je bolje od izmišljene številke.
    db.rpc("avtonet_db_size"),
  ]);

  const statistika = Object.fromEntries(
    ((statRes.data ?? []) as { kljuc: string; podatki: unknown }[]).map((s) => [s.kljuc, s.podatki])
  );
  /**
   * Hlajenja po blokadi so v ključih "blokada:<vir>". Konzola mora znati
   * povedati "vir nas ustavlja" in ne pokazati rdeče napake, ki izgleda kot
   * naša. Zapis ostane tudi po izteku premora, ker nosi `faktor` — koliko
   * počasneje beremo, dokler si hitrosti ne prislužimo nazaj. Prav ta podatek
   * pojasni, zakaj pregled traja dlje kot prejšnji teden.
   */
  const blokade = Object.entries(statistika)
    .filter(([k]) => k.startsWith("blokada:"))
    .map(([k, v]) => {
      const p = (v ?? {}) as { do?: string; razlog?: string; faktor?: number; stopnja?: number };
      return {
        vir: k.slice(8),
        do: p.do ?? null,
        razlog: p.razlog ?? null,
        faktor: Number(p.faktor ?? 1),
        stopnja: Number(p.stopnja ?? 0),
        pociva: Boolean(p.do && new Date(p.do).getTime() > Date.now()),
      };
    })
    .filter((b) => b.pociva || b.faktor > 1);

  return NextResponse.json({
    jeAdmin: true,
    zbiralnik,
    aktivna: aktivnaRes.data ?? null,
    zgodovina: zgodovinaRes.data ?? [],
    viri: viriRes.data ?? [],
    stanjePoVirih,
    urnik: urnikRes.data ?? { omogocen: true, ure: "4", detajlov_na_krog: 400 },
    skupno: {
      vsehOglasov: vsehOglasov ?? 0,
      izginulih: izginulih ?? 0,
      kandidatov: kandidatov ?? 0,
    },
    prostor: {
      uporabljeno: !prostorRes.error && prostorRes.data != null ? Number(prostorRes.data) : null,
      limit: Number(process.env.AVTONET_MAX_BYTES ?? 50 * 1024 * 1024 * 1024),
    },
    blokade,
    rezine: Object.entries(statistika)
      .filter(([k]) => k.startsWith("rezine:"))
      .map(([k, v]) => ({ vir: k.slice(7), ...(v as { naslednja?: number; stran?: number }) })),
    samopopravila: (statistika["samopopravila"] as { zapisi?: unknown[] } | undefined)?.zapisi ?? [],
    napake: napakeRes.data ?? [],
  });
}
