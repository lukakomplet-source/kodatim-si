import "dotenv/config";
import { chromium } from "playwright";
import { uporabniskiAgent } from "./identiteta.js";
import { connect } from "./db.js";
import { najdiVir } from "./viri/index.js";
import { preveriIzziv, razbremeniKontekst } from "./izziv.js";
import { hlajenjeDo } from "./samopopravilo.js";

/**
 * Ali je seznam vira razvrščen OD NAJNOVEJŠEGA?
 *
 * Od tega odgovora je odvisna zastavica `razvrsceniPoNovosti`, ta pa dovoli
 * inkrementalno branje — ustavitev, ko dve strani zapored ne prineseta nič
 * novega. Če razvrstitev ni po novosti, so novi in stari oglasi pomešani in
 * zgodnja ustavitev tiho izpusti del trga. Prav ta razred napake (tiha izguba,
 * ki je v dnevniku ni videti) nas je pri števcu strani stal dve tretjini
 * kataloga, zato se zastavica NE vklopi na občutek.
 *
 * MERILO. Prva različica tega testa je primerjala povprečni `first_seen` po
 * straneh — in bila krožna: `first_seen` pove, kdaj je oglas videl NAŠ pregled,
 * ta pa strani bere po vrsti, zato številka narašča s stranjo ne glede na to,
 * kako vir razvršča. Test je zato razvrstitev po novosti "ovrgel" pri viru, pri
 * katerem so bili v istem izpisu dokazi za nasprotno.
 *
 * Pravo merilo je NEPOZNANOST: če vir razvršča od najnovejšega, se oglasi, ki
 * jih naša baza še ne pozna, gnetejo na prvih straneh in jih globlje ni. To
 * hkrati meri natanko lastnost, na kateri sloni inkrementalna ustavitev — ne
 * podobne, ampak isto.
 *
 * Poraba: 3 zahtevki. Vir v hlajenju se ne dotakne.
 *
 *   npx tsx src/test-razvrstitev.ts bolha.com
 */

const virIme = process.argv[2] ?? "bolha.com";
const vir = najdiVir(virIme);
if (!vir) {
  console.error(`Vira "${virIme}" ni v registru.`);
  process.exit(2);
}

const db = connect();
const hlajenje = await hlajenjeDo(db, vir.vir);
if (hlajenje) {
  console.error(
    `Vir ${vir.vir} počiva po blokadi do ${new Date(hlajenje).toLocaleString("sl-SI")}. ` +
      `Meritve ne delamo med hlajenjem — to bi bilo natanko tisto, čemur se izogibamo.`
  );
  process.exit(4);
}

const rezina = vir.rezine()[0];
const browser = await chromium.launch({ args: ["--no-sandbox"] });

/** Koliko oglasov s te strani naša baza ŽE pozna. */
async function znanih(virIdji: string[]): Promise<number> {
  if (virIdji.length === 0) return 0;
  const { count } = await db
    .from("nep_oglasi")
    .select("id", { count: "exact", head: true })
    .eq("vir", vir!.vir)
    .in("vir_id", virIdji);
  return count ?? 0;
}

const meritve: { stran: number; kartic: number; neznanih: number }[] = [];
for (const stran of [1, 2, 3]) {
  const ctx = await browser.newContext({
    locale: "sl-SI",
    userAgent: uporabniskiAgent(),
  });
  await razbremeniKontekst(ctx).catch(() => {});
  const page = await ctx.newPage();
  try {
    const r = await page.goto(vir.seznamUrl(rezina, stran), { waitUntil: "domcontentloaded", timeout: 45_000 });
    const status = r?.status() ?? 0;
    if (status === 403 || status === 429) {
      console.error(`\nVir je vrnil HTTP ${status} — meritev prekinjena, brez ponovnega poskusa.`);
      break;
    }
    await page.waitForTimeout(1500);
    await preveriIzziv(page);
    const { kartice } = await vir.preberiSeznam(page);
    const jihPoznamo = await znanih(kartice.map((k) => k.virId));
    const neznanih = kartice.length - jihPoznamo;
    meritve.push({ stran, kartic: kartice.length, neznanih });
    console.log(`stran ${stran}: kartic ${kartice.length}, baza jih pozna ${jihPoznamo}, NEZNANIH ${neznanih}`);
  } catch (e) {
    console.error(`stran ${stran}: ${e instanceof Error ? e.message : String(e)}`);
    break;
  } finally {
    await page.close();
    await ctx.close();
  }
  if (stran < 3) await new Promise((r) => setTimeout(r, vir.omejitve.zamikMs));
}
await browser.close();

if (meritve.length < 3) {
  console.log(`\nIZID: premalo prebranih strani. Zastavice razvrsceniPoNovosti NE vklapljaj.`);
  process.exitCode = 1;
} else {
  const naPrvi = meritve[0].neznanih;
  const globlje = meritve.slice(1).reduce((v, m) => v + m.neznanih, 0);
  /**
   * Test je smiseln le, kadar sploh obstaja kaj neznanega. Če je baza povsem
   * dohitena, je povsod nič in iz tega ne sledi nič — takrat ni odgovora, ne
   * pritrdilnega ne odklonilnega.
   */
  if (naPrvi + globlje === 0) {
    console.log(
      `\nIZID: na nobeni strani ni oglasa, ki ga baza ne bi poznala — meritev nima česa razločiti. ` +
        `Ponovi jo takrat, ko je od zadnjega pregleda minilo nekaj dni.`
    );
    process.exitCode = 2;
  } else {
    // Novi oglasi morajo biti izrazito spredaj: vsaj štirikrat več na prvi
    // strani kot na vseh globljih skupaj.
    const razvrsceno = naPrvi >= 3 && naPrvi >= globlje * 4;
    console.log(
      `\nNeznanih oglasov: ${naPrvi} na prvi strani, ${globlje} na vseh globljih skupaj.\n` +
        (razvrsceno
          ? `IZID: novi oglasi se gnetejo na prvi strani — seznam JE razvrščen od najnovejšega in ` +
            `razvrsceniPoNovosti: true je upravičena.`
          : `IZID: novi oglasi niso zbrani spredaj. Zastavice ne vklapljaj: inkrementalno branje bi ` +
            `tiho izpustilo del trga.`)
    );
    process.exitCode = razvrsceno ? 0 : 1;
  }
}

await new Promise((r) => setTimeout(r, 300));
