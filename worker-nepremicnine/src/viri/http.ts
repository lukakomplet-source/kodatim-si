import { jeIzziv } from "../izziv.js";

/**
 * SKUPNI HTTP ZA VIRE BREZ BRSKALNIKA.
 *
 * Vsak adapter, ki bere API, RSS ali strežniško izrisan HTML, gre skozi to
 * funkcijo — zato se pravila vljudnosti ne morejo razlikovati od vira do vira:
 *
 *   - iskrena identiteta (ua pride iz identiteta.ts prek glavne zanke);
 *   - 403 in 429 sta BLOKADA — sporočilo vsebuje "vir blokira", zato jo
 *     glavna zanka razvrsti kot blokado in vir ohladi, namesto da bi
 *     poskušala znova;
 *   - zaslon preverjanja ("Just a moment", CAPTCHA), ki pride s statusom 200,
 *     je prav tako blokada. Ne rešujemo ga in ga ne obidemo;
 *   - časovna omejitev, da en obvisel zahtevek ne ustavi kroga.
 *
 * Ritma (razmika med zahtevki) tu NI: zanj skrbi glavna zanka s skupnim
 * ritmom vseh naših procesov (pocakajNaVrsto), pred vsakim klicem adapterja.
 */
export async function prenesi(
  url: string,
  ua: string,
  moznosti: { metoda?: "GET" | "POST"; telo?: string; vrsta?: string; jezik?: string } = {}
): Promise<string> {
  const odziv = await fetch(url, {
    method: moznosti.metoda ?? "GET",
    body: moznosti.telo,
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
    headers: {
      "user-agent": ua,
      "accept-language": moznosti.jezik ?? "sl-SI,sl;q=0.9,en;q=0.6",
      ...(moznosti.vrsta ? { "content-type": moznosti.vrsta } : {}),
    },
  });
  if (odziv.status === 403 || odziv.status === 429) {
    throw new Error(`HTTP ${odziv.status} - vir blokira`);
  }
  if (!odziv.ok) throw new Error(`HTTP ${odziv.status} za ${url}`);
  const besedilo = await odziv.text();
  const naslov = besedilo.match(/<title[^>]*>([^<]{0,200})<\/title>/i)?.[1] ?? "";
  if (jeIzziv(naslov, besedilo.slice(0, 4000).replace(/<[^>]+>/g, " "))) {
    throw new Error("vir blokira (preverjanje CAPTCHA) — ne obhajamo ga, počakamo");
  }
  return besedilo;
}

/**
 * Imenovane entitete, ki jih pišejo urejevalniki opisov (CKEditor pri
 * agencijah na platformi 100m2 zapiše "Piran &scaron;" namesto "š").
 */
const IMENOVANE: Record<string, string> = {
  scaron: "š", Scaron: "Š", ccaron: "č", Ccaron: "Č", zcaron: "ž", Zcaron: "Ž", cacute: "ć", Cacute: "Ć",
  dstrok: "đ", Dstrok: "Đ", eacute: "é", egrave: "è", agrave: "à", aacute: "á", iacute: "í", oacute: "ó",
  uacute: "ú", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
  euro: "€", ndash: "–", mdash: "—", hellip: "…", bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘",
  rsquo: "’", laquo: "«", raquo: "»", deg: "°", sup2: "²", sup3: "³", times: "×", middot: "·",
};

/** HTML entitete, ki jih srečamo v naslovih in opisih oglasov. */
export function brezEntitet(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,7});/g, (cela, ime: string) => IMENOVANE[ime] ?? cela)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Besedilo brez oznak HTML, s strnjenimi presledki. */
export function goloBesedilo(html: string): string {
  return brezEntitet(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
