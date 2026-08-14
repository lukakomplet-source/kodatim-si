import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

// `server-only` exists to break a client build; under plain Node it is just an
// import that would throw. Same shim the other verify scripts use.
type ModuleLoadFn = (request: string, ...rest: unknown[]) => unknown;
const M = Module as unknown as { _load: ModuleLoadFn };
const origLoad = M._load;
M._load = function (this: unknown, req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};

function loadEnvLocal(): void {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

import type { Vozilo } from "@/lib/avtonet/cenilnik/vozilo";

/**
 * The valuation pipeline, end to end, against the real database.
 *
 * Exercises the exact code path the API route uses, minus the AI steps — those
 * are optional by design and must not be what makes a valuation possible. If
 * this passes with no OpenAI key present, the "AI API failure" case is covered
 * by construction rather than by hope.
 *
 *   npm run verify:cenilnik
 */

let napak = 0;
function preveri(pogoj: boolean, opis: string, dodatek = ""): void {
  console.log(`  ${pogoj ? "OK    " : "NAPAKA"} ${opis}${dodatek ? ` — ${dodatek}` : ""}`);
  if (!pogoj) napak++;
}

/**
 * App modules are imported dynamically, after the `server-only` shim above has
 * been installed — a static import is hoisted and would run first, which is
 * exactly the failure this avoids.
 */
async function moduli() {
  const [statistika, podobnost, vozilo, cenitev, admin] = await Promise.all([
    import("@/lib/avtonet/cenilnik/statistika"),
    import("@/lib/avtonet/cenilnik/podobnost"),
    import("@/lib/avtonet/cenilnik/vozilo"),
    import("@/lib/avtonet/cenilnik/cenitev"),
    // The AVTONET client, not the main-Supabase admin: the target must come
    // from the same database the valuation searches, or the test picks a car
    // (cloud) the candidate query (local) has never heard of.
    import("@/lib/avtonet/db"),
  ]);
  const { createAvtonetClient } = admin as unknown as {
    createAvtonetClient: () => ReturnType<(typeof import("@/lib/supabase/admin"))["createAdminClient"]>;
  };
  return { ...statistika, ...podobnost, ...vozilo, ...cenitev, createAdminClient: createAvtonetClient };
}

/** Pure statistics first: these must hold regardless of what is in the database. */
async function testStatistike(): Promise<void> {
  console.log("\n--- Statistika (enote) ---");
  const { median, kvantil, izlociOutlierje, cenovnaStatistika, casNaTrgu, zanesljivost } =
    await moduli();

  preveri(median([1, 2, 3]) === 2, "mediana lihega niza");
  preveri(median([1, 2, 3, 4]) === 2.5, "mediana sodega niza");
  preveri(median([]) === null, "prazen niz vrne null, ne 0");

  const q = kvantil([10, 20, 30, 40, 50], 0.25);
  preveri(q === 20, "kvartil", String(q));

  // The case this exists for: one absurd price must not move the answer.
  const cene = [27000, 28000, 28500, 28900, 29200, 29500, 30000, 31000, 120000];
  const izl = izlociOutlierje(cene);
  preveri(izl.izloceni.includes(120000), "izloci absurdno ceno", `izlocenih: ${izl.izloceni.join(", ")}`);
  preveri(izl.obdrzani.length === cene.length - 1, "ostale obdrzi");

  const brezFiltra = median(cene) ?? 0;
  const zFiltrom = median(izl.obdrzani) ?? 0;
  preveri(Math.abs(zFiltrom - 29200) < 1500, "mediana ostane realna", `${zFiltrom} (surova ${brezFiltra})`);

  // Under eight values the quartiles are noise, so nothing may be dropped.
  const majhen = izlociOutlierje([10, 20, 30, 400]);
  preveri(majhen.izloceni.length === 0, "pri majhnem vzorcu ne izloca nicesar");

  const s = cenovnaStatistika(cene);
  preveri(s.vzorec === 8 && s.izlocenih === 1, "cenovnaStatistika poroca izlocene", `${s.vzorec}/${s.izlocenih}`);

  const c = casNaTrgu([3, 5, 8, 30, 60]);
  preveri(c.medianaDni === 8, "mediana dni", String(c.medianaDni));
  preveri(Math.abs((c.delez14 ?? 0) - 0.6) < 0.001, "delez do 14 dni", String(c.delez14));

  // Confidence must never claim certainty, and must collapse on a thin sample.
  const visoka = zanesljivost({ vzorec: 30, povprecnaPodobnost: 92, mediana: 28000, q1: 27500, q3: 28500 });
  const nizka = zanesljivost({ vzorec: 2, povprecnaPodobnost: 55, mediana: 28000, q1: 20000, q3: 40000 });
  preveri(visoka > nizka, "zanesljivost pade pri slabsem vzorcu", `${visoka} % vs ${nizka} %`);
  preveri(visoka <= 95, "nikoli ne trdi 100 %", `${visoka} %`);
  preveri(zanesljivost({ vzorec: 0, povprecnaPodobnost: 0, mediana: null, q1: null, q3: null }) === 0, "brez vzorca je 0");
}

async function testZgodovine(): Promise<void> {
  console.log("\n--- Utez zgodovine (enote) ---");
  const { utezKoncanega, HITRO_DNI } = await moduli();

  // The ordering is the contract: the market accepting a price beats an owner
  // asking one, recent beats stale, and a slow sale is weak evidence.
  const hiter = utezKoncanega(10, 0);
  const pocasen = utezKoncanega(90, 0);
  const vmesni = utezKoncanega(40, 0);
  preveri(hiter === 1.5, "hitro izginuli steje 1.5x", String(hiter));
  preveri(pocasen === 0.5, "pocasi izginuli steje 0.5x", String(pocasen));
  preveri(vmesni > 0.5 && vmesni < 1.5, "vmes je vmes", String(vmesni));

  const svez = utezKoncanega(10, 0);
  const starPolLeta = utezKoncanega(10, 180);
  const starLeto = utezKoncanega(10, 365);
  preveri(Math.abs(starPolLeta - svez / 2) < 0.01, "pol leta star steje pol", String(starPolLeta));
  preveri(starLeto < starPolLeta, "starejsi steje se manj", String(starLeto));
  preveri(utezKoncanega(HITRO_DNI, 0) === 1.5, "prag je vkljucen v 'hitro'");
}

async function testPodobnosti(): Promise<void> {
  console.log("\n--- Podobnost (enote) ---");
  const { oceniPodobnost, PRAZNO_VOZILO } = await moduli();

  const cilj: Vozilo = {
    ...PRAZNO_VOZILO,
    znamka: "BMW", model: "serija 3", verzija: "320d xDrive M Sport", letnik: 2021,
    km: 118_000, ccm: 1995, kw: 140, gorivo: "diesel", menjalnik: "avtomatski", pogon: "4x4",
    karoserija: "limuzina", znacilke: ["led", "acc", "usnje", "navigacija", "kamera"],
  };

  const enak = oceniPodobnost(cilj, cilj);
  preveri(enak.skupno >= 95, "isto vozilo je skoraj 100 %", `${enak.skupno} %`);

  const drugacen: Vozilo = {
    ...cilj, model: "X5", verzija: "40d", letnik: 2014, km: 260_000, kw: 230,
    menjalnik: "rocni", karoserija: "suv", znacilke: [],
  };
  const o = oceniPodobnost(cilj, drugacen);
  preveri(o.skupno < 55, "zelo drugacno vozilo pade nizko", `${o.skupno} %`);

  // Unknown must be neutral, not a penalty — older adverts publish less.
  const neznan: Vozilo = { ...PRAZNO_VOZILO, znamka: "BMW", model: "serija 3", letnik: 2021 };
  const on = oceniPodobnost(cilj, neznan);
  preveri(on.skupno > 55, "neznana polja niso kaznovana", `${on.skupno} %`);

  preveri(o.razlaga.length > 0 && !/undefined|NaN/.test(o.razlaga), "razlaga je berljiva", o.razlaga);
}

async function testCenitve(): Promise<void> {
  console.log("\n--- Cenitev (proti bazi) ---");
  const {
    createAdminClient, oceniVozilo, PRAZNO_VOZILO,
    normalizirajGorivo, normalizirajKaroserijo, normalizirajMenjalnik, normalizirajPogon,
  } = await moduli();

  const db = createAdminClient();

  // Take a real, well-populated advert as the target so the test reflects what
  // a user actually pastes in.
  // Deliberately without oprema_znacilke: this must pass BEFORE the v2
  // migration too, because that is the state the code has to survive.
  const { data, error } = await db
    .from("avtonet_oglasi")
    .select("avtonet_id, znamka, model, verzija, letnik, km, ccm, kw, gorivo, menjalnik, pogon, karoserija, cena_eur")
    .eq("status", "aktiven")
    .not("znamka", "is", null)
    .not("letnik", "is", null)
    .not("cena_eur", "is", null)
    .gte("letnik", 2015)
    .limit(50);

  if (error) {
    if (error.code === "42703") {
      console.log("  PRESKOCENO — migracija migration_avtonet_detajl_v2.sql se ni pognana.");
      return;
    }
    throw new Error(error.message);
  }

  const vrstice = (data ?? []) as unknown as Record<string, unknown>[];
  if (vrstice.length === 0) {
    console.log("  PRESKOCENO — v bazi ni ustreznih oglasov.");
    return;
  }

  // Prefer one whose model actually looks like a model, so the test measures
  // the pipeline rather than the old bad data.
  const izbran = vrstice.find((r) => String(r.model ?? "").length <= 20) ?? vrstice[0];

  const cilj: Vozilo = {
    ...PRAZNO_VOZILO,
    znamka: (izbran.znamka as string) ?? null,
    model: (izbran.model as string) ?? null,
    verzija: (izbran.verzija as string) ?? null,
    letnik: (izbran.letnik as number) ?? null,
    km: (izbran.km as number) ?? null,
    ccm: (izbran.ccm as number) ?? null,
    kw: (izbran.kw as number) ?? null,
    gorivo: normalizirajGorivo(izbran.gorivo as string),
    menjalnik: normalizirajMenjalnik(izbran.menjalnik as string),
    pogon: normalizirajPogon(izbran.pogon as string),
    karoserija: normalizirajKaroserijo(izbran.karoserija as string),
    znacilke: (izbran.oprema_znacilke as string[]) ?? [],
    cena: izbran.cena_eur === null ? null : Number(izbran.cena_eur),
    valuta: "EUR",
  };

  console.log(`  Ciljno vozilo: ${cilj.znamka} ${cilj.model} ${cilj.letnik} — v oglasu ${cilj.cena} €`);

  const zacetek = Date.now();
  const c = await oceniVozilo(cilj);
  const trajanje = Date.now() - zacetek;

  console.log(`  Pregledanih v bazi: ${c.pregledanih}, primerljivih: ${c.primerljivi.length}, ${trajanje} ms`);
  console.log(`  Ocena: ${c.ocenjenaVrednost} € | razpon ${c.razponSpodaj}–${c.razponZgoraj} € | zanesljivost ${c.zanesljivost} %`);
  if (c.popravekKm) console.log(`  Popravek km: ${c.popravekKm.eur} €`);
  if (c.opozorila.length > 0) console.log(`  Opozorila: ${c.opozorila.join(" | ")}`);

  preveri(trajanje < 15_000, "cenitev se konca v razumnem casu", `${trajanje} ms`);
  preveri(c.primerljivi.length > 0, "najde vsaj eno primerljivo vozilo");

  if (c.primerljivi.length > 0) {
    const urejeno = c.primerljivi.every((p, i, a) => i === 0 || a[i - 1].podobnost >= p.podobnost);
    preveri(urejeno, "primerljiva vozila so urejena po podobnosti");
    preveri(
      c.primerljivi.every((p) => p.podobnost >= 45),
      "nobeno vozilo pod pragom podobnosti ni vkljuceno"
    );
    preveri(
      c.primerljivi.every((p) => typeof p.url === "string" && p.url.includes("avto.net")),
      "vsako primerljivo vozilo ima povezavo na oglas"
    );
  }

  if (c.ocenjenaVrednost !== null) {
    preveri(c.ocenjenaVrednost > 0, "ocena je pozitivna");
    preveri(
      c.razponSpodaj === null || c.ocenjenaVrednost >= c.razponSpodaj * 0.7,
      "ocena ni absurdno pod razponom",
      `${c.ocenjenaVrednost} vs ${c.razponSpodaj}`
    );
    // The estimate must resemble the market it was computed from.
    const m = c.aktivni.mediana;
    preveri(
      m === null || Math.abs(c.ocenjenaVrednost - m) <= m * 0.45,
      "ocena je blizu mediane primerljivih",
      `ocena ${c.ocenjenaVrednost}, mediana ${m}`
    );
  } else {
    preveri(c.opozorila.length > 0, "ce ocene ni, je razlog povedan");
  }

  preveri(c.zanesljivost >= 0 && c.zanesljivost <= 95, "zanesljivost je v mejah", `${c.zanesljivost} %`);

  // Nothing anywhere may claim a sale from a disappearance.
  const besedilo = JSON.stringify(c).toLowerCase();
  preveri(
    !/"prodajna cena"|prodan za|prodano za/.test(besedilo),
    "nikjer ne trdi prodajne cene iz izginotja"
  );

  // A vehicle nothing can match must fail honestly rather than invent a price.
  console.log("\n  Primer brez podatkov:");
  const izmisljen: Vozilo = { ...PRAZNO_VOZILO, znamka: "Zhidou", model: "XYZ999", letnik: 2024 };
  const prazna = await oceniVozilo(izmisljen);
  console.log(`    primerljivih: ${prazna.primerljivi.length}, ocena: ${prazna.ocenjenaVrednost}`);
  preveri(
    prazna.ocenjenaVrednost === null || prazna.primerljivi.length > 0,
    "brez primerjav ne izmisli cene"
  );
  preveri(prazna.opozorila.length > 0, "brez primerjav pove, zakaj");
}

async function main(): Promise<void> {
  console.log("=".repeat(64));
  console.log("PREVERJANJE CENILNIKA");
  console.log("=".repeat(64));

  await testStatistike();
  await testZgodovine();
  await testPodobnosti();
  await testCenitve();

  console.log("\n" + "-".repeat(64));
  console.log(napak === 0 ? "VSE USPESNO." : `NEUSPESNO — ${napak} napak.`);
  // exitCode rather than exit(): a hard exit while the Supabase client still
  // holds an open handle trips a libuv assertion on Windows, which looks like a
  // crash in a test run that actually passed.
  process.exitCode = napak === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("NAPAKA:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
