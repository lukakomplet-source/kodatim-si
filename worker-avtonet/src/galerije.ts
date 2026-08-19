import "dotenv/config";
import { connect, type Db } from "./db.js";
import { fetchDetailPage, openBrowser } from "./collector.js";

/**
 * Dopolni galerije za oglase, ki jih že imamo.
 *
 * Zakaj obstaja: detajlno stran vsakega oglasa odpremo samo ENKRAT, zajem
 * celotne galerije pa je nov. Zato ima galerijo le peščica oglasov, čeprav je
 * detajl zajet pri 53.784 od 53.790. Namesto da bi vse odprli znova (pri
 * spoštljivih 10 s bi bilo to 150 ur), gremo po vrsti, ki šteje:
 *
 *   1. oglasi iz feeda poslov (tam uporabnik dejansko gleda),
 *   2. oglasi iz shranjenih iskanj,
 *   3. ostali, od najnovejših.
 *
 * Hitrost je nastavljiva in privzeto spoštljiva; prekinitev ni problem, ker se
 * ob naslednjem zagonu nadaljuje pri prvem oglasu brez galerije.
 *
 *   npx tsx src/galerije.ts [koliko] [zamikMs]
 */

const KOLIKO = Number(process.argv[2] ?? 200);
const ZAMIK_MS = Number(process.argv[3] ?? process.env.AVTONET_DELAY_DETAIL_MS ?? 10_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function prednostniIdji(db: Db): Promise<string[]> {
  const out: string[] = [];
  const { data } = await db.from("avtonet_statistika").select("podatki").eq("kljuc", "deal_feed").maybeSingle();
  const posli = ((data?.podatki as { deals?: { avtonetId?: string }[] } | null)?.deals ?? [])
    .map((d) => d.avtonetId)
    .filter((x): x is string => Boolean(x));
  out.push(...posli);
  return [...new Set(out)];
}

async function main() {
  const db = connect();
  const prednostni = await prednostniIdji(db);

  // Brez galerije: najprej prednostni, nato najnovejši.
  const { data: brezGalerije } = await db
    .from("avtonet_oglasi")
    .select("avtonet_id, url, slike_urls")
    .eq("status", "aktiven")
    .not("detajl_zajet", "is", null)
    .order("first_seen", { ascending: false })
    .limit(4000);
  const vrstice = ((brezGalerije ?? []) as { avtonet_id: string; url: string; slike_urls: string[] | null }[])
    .filter((r) => !r.slike_urls || r.slike_urls.length <= 3);

  const prednost = new Set(prednostni);
  vrstice.sort((a, b) => Number(prednost.has(b.avtonet_id)) - Number(prednost.has(a.avtonet_id)));
  const zaObdelavo = vrstice.slice(0, KOLIKO);
  console.log(
    `[galerije] za obdelavo ${zaObdelavo.length} oglasov (od tega ${zaObdelavo.filter((r) => prednost.has(r.avtonet_id)).length} iz poslov), zamik ${ZAMIK_MS} ms`
  );
  if (zaObdelavo.length === 0) return;

  const browser = await openBrowser();
  let uspesnih = 0;
  let slikSkupaj = 0;
  try {
    for (const [i, r] of zaObdelavo.entries()) {
      try {
        const detajl = await fetchDetailPage(browser, r.url);
        const slike = detajl.slike ?? [];
        if (slike.length > (r.slike_urls?.length ?? 0)) {
          const { error } = await db.from("avtonet_oglasi").update({ slike_urls: slike }).eq("avtonet_id", r.avtonet_id);
          if (!error) {
            uspesnih += 1;
            slikSkupaj += slike.length;
          }
        }
      } catch (e) {
        console.warn(`  ${r.avtonet_id}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${zaObdelavo.length} (galerij ${uspesnih}, slik ${slikSkupaj})`);
      await sleep(ZAMIK_MS);
    }
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(`[galerije] KONČANO: ${uspesnih} galerij, ${slikSkupaj} slik (povprečno ${uspesnih ? Math.round(slikSkupaj / uspesnih) : 0} na oglas)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
