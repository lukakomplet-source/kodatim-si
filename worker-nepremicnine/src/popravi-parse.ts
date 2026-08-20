import "dotenv/config";
import { connect } from "./db.js";
import { preberiVse } from "./nepremicnine.js";
import { najdiVir } from "./viri/index.js";
import type { SurovaKartica } from "./viri/vmesnik.js";

/**
 * Ponovno razčleni SHRANJENE surove kartice z današnjim razčlenjevalnikom.
 *
 * Prav zato hranimo `raw`: ko se parser popravi (bolha piše "173.72m2" z
 * angleško piko, kar je stara koda brala kot 17.372 m²), popravek velja tudi
 * za nazaj, brez ponovnega obiska vira. Piše samo polja, ki jih izračuna
 * parser, in samo kadar se vrednost res spremeni.
 *
 *   npx tsx src/popravi-parse.ts [vir]
 */

type Vrstica = {
  id: string;
  vir: string;
  posel: string;
  tip: string | null;
  povrsina_m2: number | null;
  zemljisce_m2: number | null;
  cena_eur: number | null;
  raw: SurovaKartica | null;
};

async function main() {
  const virIme = process.argv[2] ?? null;
  const db = connect();
  const vrstice = await preberiVse<Vrstica>(
    db,
    "nep_oglasi",
    "id, vir, posel, tip, povrsina_m2, zemljisce_m2, cena_eur, raw",
    (q) => (virIme ? q.eq("vir", virIme) : q)
  );
  console.log(`[parse] pregledujem ${vrstice.length} oglasov`);

  let spremenjenih = 0;
  let brezRaw = 0;
  for (let i = 0; i < vrstice.length; i += 100) {
    const paket = vrstice.slice(i, i + 100);
    await Promise.all(
      paket.map(async (o) => {
        if (!o.raw || !o.raw.virId) {
          brezRaw += 1;
          return;
        }
        const adapter = najdiVir(o.vir);
        // Oglas vira, ki ga v registru ni več, se pusti pri miru — ponovno
        // razčleniti ga z adapterjem drugega portala bi ga pokvarilo.
        if (!adapter) return;
        // Rezino potrebuje samo za posel/tip, ki ju že imamo v vrstici.
        const rezina = adapter.rezine().find((r) => r.oznaka === `${o.posel}/${o.tip}`) ?? adapter.rezine()[0];
        let nov;
        try {
          nov = adapter.normaliziraj(o.raw, rezina);
        } catch {
          return;
        }
        const posodobitev: Record<string, unknown> = {};
        const enako = (a: number | null, b: number | null) =>
          a === null && b === null ? true : a === null || b === null ? false : Math.abs(Number(a) - Number(b)) < 0.005;
        if (!enako(o.povrsina_m2, nov.povrsinaM2) && nov.povrsinaM2 !== null) {
          posodobitev.povrsina_m2 = nov.povrsinaM2;
          if (nov.cenaEur !== null) posodobitev.cena_m2_eur = Math.round((nov.cenaEur / nov.povrsinaM2) * 100) / 100;
        }
        if (!enako(o.zemljisce_m2, nov.zemljisceM2) && nov.zemljisceM2 !== null) {
          posodobitev.zemljisce_m2 = nov.zemljisceM2;
        }
        if (Object.keys(posodobitev).length === 0) return;
        const { error } = await db.from("nep_oglasi").update(posodobitev).eq("id", o.id);
        if (!error) spremenjenih += 1;
      })
    );
  }
  console.log(`[parse] popravljenih: ${spremenjenih}, brez surove kartice: ${brezRaw}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
