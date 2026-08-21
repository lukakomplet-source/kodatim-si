import "dotenv/config";
import { connect } from "./db.js";
import { oceniZakljucek, zapriOsirotele, type IzidPregleda } from "./samopopravilo.js";

/**
 * Preverba obljube: pregled se VEDNO konča z zaključnim statusom in ta status
 * je pošten.
 *
 * Dva dela:
 *  1. pravilo samo (oceniZakljucek) — brez baze, hitro, izčrpno;
 *  2. osiroteli pregled — v bazo se vstavi zataknjena vrstica in preveri, da
 *     jo nadzor zapre. To je edini del, ki ga enota ne more dokazati, ker gre
 *     za dogovor med procesom in bazo.
 *
 *   npx tsx src/test-zakljucek.ts
 */

const osnova: IzidPregleda = {
  strani: 0,
  najdenih: 0,
  napak: 0,
  izginulih: 0,
  popoln: false,
  blokada: null,
  napaka: null,
  prekinjeno: false,
};

const PRIMERI: { ime: string; izid: IzidPregleda; status: string; popoln: boolean }[] = [
  {
    ime: "popoln pregled",
    izid: { ...osnova, strani: 630, najdenih: 7340, popoln: true },
    status: "koncano",
    popoln: true,
  },
  {
    // Točno primer z dne 20. 8. 2026, ki je sprožil vse to: 290 strani in
    // 4.548 oglasov je bilo zabeleženih kot "napaka".
    ime: "blokada po 290 straneh",
    izid: { ...osnova, strani: 290, najdenih: 4548, napak: 1, blokada: "vir blokira (prazna prva stran)" },
    status: "koncano_delno",
    popoln: false,
  },
  {
    ime: "blokada takoj, brez ene strani",
    izid: { ...osnova, napak: 1, blokada: "HTTP 403 - vir blokira" },
    status: "napaka",
    popoln: false,
  },
  {
    ime: "delni pregled zaradi kvote strani",
    izid: { ...osnova, strani: 40, najdenih: 1500, popoln: false },
    status: "koncano_delno",
    popoln: false,
  },
  {
    ime: "prekinjeno na zahtevo",
    izid: { ...osnova, strani: 12, najdenih: 300, prekinjeno: true },
    status: "koncano_delno",
    popoln: false,
  },
  {
    ime: "padec sredi pregleda, a nekaj zbranega",
    izid: { ...osnova, strani: 55, najdenih: 800, napaka: 'Klic "goto" se ni odzval v 60 s' },
    status: "koncano_delno",
    popoln: false,
  },
  {
    ime: "brskalnik se sploh ni zagnal",
    izid: { ...osnova, napaka: "chromium.launch se ni odzval" },
    status: "napaka",
    popoln: false,
  },
];

let padlo = 0;
for (const p of PRIMERI) {
  const z = oceniZakljucek(p.izid);
  const ok = z.status === p.status && z.pregledPopoln === p.popoln;
  if (!ok) padlo += 1;
  console.log(`${ok ? "OK   " : "PADLO"} ${p.ime}: ${z.status}${z.opozorilo ? ` — ${z.opozorilo}` : ""}`);
}

// Nobena kombinacija ne sme pustiti pregleda brez zaključka.
const ZAKLJUCNI = new Set(["koncano", "koncano_delno", "napaka"]);
for (const strani of [0, 1, 300]) {
  for (const blokada of [null, "vir blokira"]) {
    for (const napaka of [null, "karkoli"]) {
      for (const prekinjeno of [false, true]) {
        const z = oceniZakljucek({ ...osnova, strani, najdenih: strani * 10, blokada, napaka, prekinjeno });
        if (!ZAKLJUCNI.has(z.status)) {
          console.log(`PADLO nezaključen status "${z.status}" pri strani=${strani}`);
          padlo += 1;
        }
      }
    }
  }
}
console.log(`Vseh 24 kombinacij je dobilo zaključni status.`);

// ── Osiroteli pregled ────────────────────────────────────────────────────────
const db = connect();
const { data: aktiven } = await db.from("nep_pregledi").select("id").in("status", ["zahtevano", "tece"]).limit(1);
if ((aktiven ?? []).length > 0) {
  console.log("\nPRESKOČENO: en pregled je aktiven, unikatni indeks ne dovoli testne vrstice.");
} else {
  const staro = new Date(Date.now() - 90 * 60_000).toISOString();
  const { data: vrstica, error } = await db
    .from("nep_pregledi")
    .insert({
      status: "tece",
      vir: "nepremicnine.net",
      zahteval: "test",
      zacetek: staro,
      updated_at: staro,
      strani: 17,
      najdenih: 210,
    })
    .select("id")
    .maybeSingle();

  if (error || !vrstica) {
    console.log(`\nPADLO: testne vrstice ni bilo mogoče vstaviti (${error?.message})`);
    padlo += 1;
  } else {
    const id = vrstica.id as string;
    // tiho: test ne sme pisati v dnevnik popravil administratorja.
    const zaprtih = await zapriOsirotele(db, 45, { tiho: true });
    const { data: po } = await db
      .from("nep_pregledi")
      .select("status, pregled_popoln, opozorilo")
      .eq("id", id)
      .maybeSingle();
    const ok = po?.status === "koncano_delno" && po?.pregled_popoln === false;
    if (!ok) padlo += 1;
    console.log(
      `\n${ok ? "OK   " : "PADLO"} osiroteli pregled: zaprtih ${zaprtih}, status "${po?.status}" — ${po?.opozorilo}`
    );
    await db.from("nep_pregledi").delete().eq("id", id);
    console.log("      (testna vrstica pobrisana)");
  }
}

console.log(padlo === 0 ? "\nVse je v redu." : `\n${padlo} preverb je padlo.`);
// exitCode namesto process.exit(), in kratek predah: odjemalec baze ima še
// odprte vtičnice in takojšen konec procesa na Windowsu sproži trditev v libuv
// (async.c:94) — po že izpisanem rezultatu, a z izhodno kodo 1.
await new Promise((r) => setTimeout(r, 300));
process.exitCode = padlo === 0 ? 0 : 1;
