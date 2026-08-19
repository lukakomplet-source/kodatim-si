import "dotenv/config";
import { connect } from "./db.js";

/**
 * Koliko prostora bi vzele slike — izračun iz IZMERJENIH velikosti in
 * resničnega števila oglasov, ne iz občutka.
 *
 * Velikosti so izmerjene z src/meritev-slik.ts na 29 resničnih slikah obeh
 * virov (nepremicnine.net 1280 px, avto.net 800 px).
 *
 *   npx tsx src/izracun-prostora.ts
 */

/** kB na sliko, izmerjeno. */
const VELIKOST = {
  slicica: 19.5, // 400 px WebP q75
  srednjaAvif: 49.8, // 1000 px AVIF q50
  srednjaWebp: 98.5, // 1000 px WebP q80
  izvirnik: 146.2,
};

/** Koliko slik ima povprečen oglas (izmerjeno na vzorcu detajlne strani). */
const SLIK_NA_OGLAS = { avti: 9, nepremicnine: 15 };

const gb = (kb: number) => Math.round((kb / 1024 / 1024) * 10) / 10;

async function main() {
  const db = connect();
  const [{ count: avtiAktivni }, { count: nepAktivni }] = await Promise.all([
    db.from("avtonet_oglasi").select("id", { count: "exact", head: true }).eq("status", "aktiven"),
    db.from("nep_oglasi").select("id", { count: "exact", head: true }).eq("status", "aktiven"),
  ]);
  const avti = avtiAktivni ?? 0;
  const nep = nepAktivni ?? 0;

  /**
   * MEDIANA dnevnih prirastkov, ne povprečje: v okno pade tudi dan, ko smo vir
   * prvič pobrali in je "novih" nekaj deset tisoč. Povprečje bi zato napihnilo
   * rast za velikostni red (izmerjeno: 8.660/dan proti resničnim ~1.400).
   */
  const naDan = async (tabela: string): Promise<number> => {
    const dnevi: number[] = [];
    for (let d = 1; d <= 7; d++) {
      const od = new Date(Date.now() - d * 86_400_000).toISOString();
      const doo = new Date(Date.now() - (d - 1) * 86_400_000).toISOString();
      const { count } = await db
        .from(tabela)
        .select("id", { count: "exact", head: true })
        .gte("first_seen", od)
        .lt("first_seen", doo);
      dnevi.push(count ?? 0);
    }
    const s = dnevi.sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const naDanAvti = await naDan("avtonet_oglasi");
  const naDanNep = await naDan("nep_oglasi");

  const slikAvti = avti * SLIK_NA_OGLAS.avti;
  const slikNep = nep * SLIK_NA_OGLAS.nepremicnine;
  const slikSkupaj = slikAvti + slikNep;

  console.log(`Aktivnih oglasov: avti ${avti.toLocaleString("sl-SI")}, nepremičnine ${nep.toLocaleString("sl-SI")}`);
  console.log(`Slik ob polni galeriji: ${slikSkupaj.toLocaleString("sl-SI")} (avti ${slikAvti.toLocaleString("sl-SI")}, nepremičnine ${slikNep.toLocaleString("sl-SI")})`);
  console.log(`Novih oglasov na dan: avti ${naDanAvti}, nepremičnine ${naDanNep}\n`);

  const scenariji: [string, number, number][] = [
    ["A) samo naslovna slika, sličica", avti + nep, VELIKOST.slicica],
    ["B) samo naslovna slika, sličica + srednja (AVIF)", avti + nep, VELIKOST.slicica + VELIKOST.srednjaAvif],
    ["C) VSE slike, samo sličice", slikSkupaj, VELIKOST.slicica],
    ["D) VSE slike, sličica + srednja (AVIF)", slikSkupaj, VELIKOST.slicica + VELIKOST.srednjaAvif],
    ["E) VSE slike, sličica + srednja (WebP)", slikSkupaj, VELIKOST.slicica + VELIKOST.srednjaWebp],
    ["F) VSE slike, izvirniki brez stiskanja", slikSkupaj, VELIKOST.izvirnik],
  ];
  console.log("SKUPNA ZASEDENOST (enkraten zajem obstoječega stanja):");
  for (const [ime, kosov, kbNaKos] of scenariji) {
    console.log(`  ${ime.padEnd(48)} ${String(gb(kosov * kbNaKos)).padStart(6)} GB`);
  }

  const dnevnoSlik = naDanAvti * SLIK_NA_OGLAS.avti + naDanNep * SLIK_NA_OGLAS.nepremicnine;
  console.log("\nRAST (nove slike vsak dan):");
  for (const [ime, kb] of [
    ["sličica + srednja (AVIF)", VELIKOST.slicica + VELIKOST.srednjaAvif],
    ["sličica + srednja (WebP)", VELIKOST.slicica + VELIKOST.srednjaWebp],
    ["samo sličice", VELIKOST.slicica],
  ] as [string, number][]) {
    const naDan = dnevnoSlik * kb;
    console.log(`  ${ime.padEnd(28)} ${gb(naDan)} GB/dan  ${gb(naDan * 30)} GB/mesec  ${gb(naDan * 365)} GB/leto`);
  }

  /**
   * Ključno: brez brisanja raste v nedogled, z brisanjem ob izginotju oglasa
   * pa se ustali. Ustaljeno stanje = aktivni oglasi + kar je izginilo v
   * zadnjih N dneh (dokler slike še hranimo).
   */
  console.log("\nUSTALJENO STANJE (slike izginulih oglasov se brišejo po N dneh, sličica+AVIF):");
  for (const dni of [0, 30, 90, 180]) {
    const skupaj = (slikSkupaj + dnevnoSlik * dni) * (VELIKOST.slicica + VELIKOST.srednjaAvif);
    console.log(`  brisanje po ${String(dni).padStart(3)} dneh: ${gb(skupaj)} GB`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
