import { jeIzziv } from "./izziv.js";

/**
 * Preverba prepoznave zaslonov "dokaži, da nisi robot".
 *
 * Dva enako pomembna dela: da PRAVI zaslon prepozna (sicer vztrajamo skozi
 * blokado in jo poglabljamo) in da NAVADNEGA oglasa ne razglasi za blokado
 * (sicer bi ena omemba besede "captcha" v opisu ustavila cel vir za ure).
 *
 *   npx tsx src/test-izziv.ts
 */

const PRIMERI: { ime: string; naslov: string; besedilo: string; izziv: boolean }[] = [
  {
    // Dobesedno besedilo, ki ga je bolha.com vrnila 20. 8. 2026 s statusom 200.
    ime: "bolha Radware CAPTCHA",
    naslov: "Radware Bot Manager Captcha",
    besedilo:
      "Ups! Nekaj je šlo narobe Opravičujemo se vam za nevšečnost, vendar je računalnik prepoznal vašo dejavnost in obnašanje na tem spletnem mestu kot sumljivo. Pokažite nam, da niste robot, tako da izvedete spodnje preverjanje CAPTCHA.",
    izziv: true,
  },
  {
    ime: "Cloudflare izziv",
    naslov: "Just a moment...",
    besedilo: "Checking your browser before accessing the site. Enable JavaScript and cookies to continue",
    izziv: true,
  },
  {
    ime: "Cloudflare 1020",
    naslov: "Attention Required! | Cloudflare",
    besedilo: "Sorry, you have been blocked",
    izziv: true,
  },
  {
    ime: "navaden oglas za hišo",
    naslov: "Hiša, samostojna, Maribor - bolha.com",
    besedilo: "Prodam samostojno hišo v Mariboru, 180 m2, zgrajena 1998, velik vrt, garaža za dva avtomobila.",
    izziv: false,
  },
  {
    // Ozkost vzorcev je bistvena: oglas sme besedo omeniti, ne da bi ustavil vir.
    ime: "oglas, ki omenja captcho",
    naslov: "Varnostna kamera z zaznavanjem gibanja",
    besedilo: "Sistem podpira captcha zaščito pri prijavi v spletni vmesnik. Prodam rabljeno, kot novo.",
    izziv: false,
  },
  {
    ime: "prazna stran",
    naslov: "",
    besedilo: "",
    izziv: false,
  },
];

let padlo = 0;
for (const p of PRIMERI) {
  const dobljeno = jeIzziv(p.naslov, p.besedilo);
  const ok = dobljeno === p.izziv;
  if (!ok) padlo += 1;
  console.log(`${ok ? "OK  " : "PADLO"} ${p.ime}: pričakovano ${p.izziv}, dobljeno ${dobljeno}`);
}
console.log(padlo === 0 ? `\nVseh ${PRIMERI.length} primerov je v redu.` : `\n${padlo} primerov je padlo.`);
process.exit(padlo === 0 ? 0 : 1);
