import { izOpisa, cenaIz } from "./parse.js";

const primeri = [
  { opis: "208,4 m2, samostojna, zgrajena l. 2004, adaptirana l. 2014, 406 m2 zemljišča, K+P+1, Družinska hiša", pricakovano: { povrsinaM2: 208.4, zemljisceM2: 406, letoIzgradnje: 2004, letoAdaptacije: 2014 } },
  { opis: "Hiša ima 3 ločena stanovanja, vsaka enota ima svojo kuhinjo in svoj vhod. Primerna za investicijo.", pricakovano: { stEnot: 3, vecEnot: true } },
  { opis: "Možnost ureditve treh stanovanj. Potrebna obnove.", pricakovano: { stEnotOcena: 3, vecEnot: true, zaObnovo: true } },
  { opis: "Dvostanovanjska hiša, 240 m2, zgrajena l. 1985, 800 m2 zemljišča, primerna za oddajanje.", pricakovano: { stEnot: 2, vecEnot: true, zaInvesticijo: true } },
];

let napak = 0;
for (const p of primeri) {
  const r = izOpisa(p.opis);
  for (const [k, v] of Object.entries(p.pricakovano)) {
    const dobil = (r as Record<string, unknown>)[k];
    const ok = dobil === v;
    if (!ok) napak += 1;
    console.log(`  ${ok ? "OK  " : "NAPAKA"} ${k}=${String(dobil)} (pričakovano ${String(v)})`);
  }
}
console.log("cena:", cenaIz("250.000,00 €"), "(pričakovano 250000)");
if (cenaIz("250.000,00 €") !== 250000) napak += 1;
console.log(napak === 0 ? "VSE OK" : `${napak} NAPAK`);
process.exitCode = napak === 0 ? 0 : 1;
