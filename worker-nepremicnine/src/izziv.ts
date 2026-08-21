import type { BrowserContext, Page } from "playwright";

/**
 * Prepoznava preverjanj "ali si robot".
 *
 * Povod: 20. 8. 2026 je bolha.com začela na detajlnih straneh vračati stran
 * Radware Bot Managerja s CAPTCHA — s statusom **HTTP 200** in 20 kB velikim
 * odgovorom. Za zbiralnik je to izgledalo kot "stran brez podatkov": vsak
 * oglas je štel kot svoja napaka, obdelava pa je vztrajala skozi celo kvoto in
 * s tem blokado samo poglabljala.
 *
 * CAPTCHE NE REŠUJEMO IN NE OBHAJAMO. Ta datoteka obstaja izključno zato, da
 * jo zbiralnik ZAZNA in se umakne — sporočilo vsebuje "vir blokira", kar
 * sproži hlajenje in vljuden odhod, natanko kot HTTP 403.
 *
 * Vzorci so namenoma ozki: iščemo znane zaslone preverjanja, ne katerekoli
 * omembe besede "captcha" v oglasu (oglas za varnostno kamero jo lahko
 * vsebuje). Zato se preverja naslov strani in samo prvih nekaj sto znakov
 * besedila, kjer je zaslon preverjanja vedno.
 */

const VZORCI = [
  /radware bot manager/i,
  /bot manager captcha/i,
  /just a moment/i,
  /checking your browser/i,
  /attention required/i,
  /enable javascript and cookies to continue/i,
  /prepoznal vašo dejavnost .{0,40}sumljivo/i,
  /pokažite nam, da niste robot/i,
  /please solve this captcha/i,
  /verifying you are human/i,
];

/**
 * Vrste virov, ki jih za branje oglasov NE potrebujemo.
 *
 * "6 sekund med zahtevki" je veljalo samo za navigacije. Vsaka stran je s
 * seboj potegnila še nekaj deset slik, pisav in skript — torej je vir v tistih
 * šestih sekundah dobil trideset zahtevkov namesto enega. Podatke beremo iz
 * HTML-ja (naslovi slik so v atributih), zato je nalaganje slik čista
 * obremenitev vira brez koristi za nas.
 */
const NEPOTREBNI: string[] = ["image", "media", "font", "stylesheet"];

/**
 * Naloži kontekstu pravilo, da nepotrebnih virov sploh ne zahteva.
 * Nikoli ne blokira dokumentov, skript ali XHR — stran se mora obnašati
 * normalno, sicer bi to bilo prilagajanje viru, ne razbremenitev.
 */
export async function razbremeniKontekst(ctx: BrowserContext): Promise<void> {
  await ctx.route("**/*", (r) => {
    if (NEPOTREBNI.includes(r.request().resourceType())) void r.abort();
    else void r.continue();
  });
}

export function jeIzziv(naslov: string, besedilo: string): boolean {
  const vzorec = `${naslov}\n${besedilo}`;
  return VZORCI.some((v) => v.test(vzorec));
}

/**
 * Vrže napako z "vir blokira", če je odprta stran zaslon preverjanja.
 * Kliče se takoj po nalaganju, pred vsakim branjem podatkov.
 */
export async function preveriIzziv(page: Page): Promise<void> {
  const naslov = await page.title().catch(() => "");
  const besedilo = (await page
    .evaluate(() => (document.body ? document.body.innerText.slice(0, 500) : ""))
    .catch(() => "")) as string;
  if (jeIzziv(naslov, besedilo)) {
    throw new Error("vir blokira (preverjanje CAPTCHA) — ne obhajamo ga, počakamo");
  }
}
