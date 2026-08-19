import { izBesedila, izmeriMeje, mesecIndeks, uvrsti, type OglasZaFacelift } from "./facelift.js";

/**
 * Testi za facelift/serijo. Vsak preverja pravilo, ki je nastalo iz resničnega
 * primera na naših podatkih — zato so pričakovane vrednosti tu, ne v glavi.
 */

let napak = 0;
const preveri = (ime: string, ok: boolean, opomba: string) => {
  if (!ok) napak += 1;
  console.log(`  ${ok ? "OK    " : "NAPAKA"} ${ime}: ${opomba}`);
};

// ------------------------------------------------------------ izrecna omemba
const besedila: [string, boolean | null][] = [
  ["Opel Corsa 1.3 CDTI-SL0-FACELIFT-1.LASTNIK", true],
  ["Volvo XC60 B5P AWD Avt. Facelift", true],
  ["Hyundai i20 1.0 TGDi FL 90 COMFORT Alu-16", true],
  ["VW Golf 2.0 TDI, pred faceliftom, lepo ohranjen", false],
  ["Audi A4 2.0 TDI S-line, servisna knjiga", null],
  ["Mercedes B 180 CDI AMG LINE-NAVI-TEMP.-ALU", null],
];
console.log("izrecna omemba v oglasu");
for (const [naziv, pricakovano] of besedila) {
  const dobil = izBesedila({ naziv, verzija: null, opis: null });
  preveri(`„${naziv.slice(0, 42)}"`, dobil === pricakovano, `${dobil} (pričakovano ${pricakovano})`);
}

// --------------------------------------------------------------- merjenje meje
/** Zgradi skupino: pred mejo brez opreme, po njej z opremo — stopnica. */
function skupina(mejaLeto: number, naStran: number, sum = 0): OglasZaFacelift[] {
  const out: OglasZaFacelift[] = [];
  for (let i = 0; i < naStran; i++) {
    const staro = i < sum; // nekaj šuma: "napačna" oprema na napačni strani
    out.push({
      id: `pred-${i}`, druzinaModela: "test model", generacija: null,
      letnik: mejaLeto - 1 - (i % 2), registracijaMesec: 3, cena: 10000, naziv: null, opis: null, verzija: null,
      opremaKljucna: { acc: staro, keyless: staro, sedezi_gretje: false },
    });
    out.push({
      id: `po-${i}`, druzinaModela: "test model", generacija: null,
      letnik: mejaLeto + (i % 2), registracijaMesec: 9, cena: 14000, naziv: null, opis: null, verzija: null,
      opremaKljucna: { acc: !staro, keyless: !staro, sedezi_gretje: !staro },
    });
  }
  return out;
}

console.log("\nmerjenje meje iz podatkov");
const meje = izmeriMeje(skupina(2017, 30, 3), { druzina: "test model", generacija: null });
preveri("meja najdena", meje.length === 1, `${meje.length} mej`);
if (meje[0]) {
  preveri("meja pade v pravo leto", meje[0].mejaLeto === 2017, `${meje[0].mejaMesec}/${meje[0].mejaLeto}`);
  preveri("dokazi navedeni", meje[0].dokazi.oprema.length >= 2, meje[0].dokazi.oprema.map((d) => d.oprema).join(", "));
}

// Gladko naraščanje (tehnološki drift) NI facelift.
const drift: OglasZaFacelift[] = [];
for (let leto = 2008; leto <= 2022; leto++) {
  const delez = (leto - 2008) / 14; // enakomerno raste
  for (let i = 0; i < 12; i++) {
    drift.push({
      id: `d-${leto}-${i}`, druzinaModela: "drift", generacija: null, letnik: leto, registracijaMesec: (i % 12) + 1,
      cena: 5000 + (leto - 2008) * 1200, naziv: null, opis: null, verzija: null,
      opremaKljucna: { acc: i / 12 < delez, keyless: i / 12 < delez },
    });
  }
}
const mejeDrift = izmeriMeje(drift, { druzina: "drift", generacija: null });
preveri("gladek drift ne ustvari meje", mejeDrift.length === 0, `${mejeDrift.length} mej`);

// ------------------------------------------------------------------ uvrstitev
console.log("\nuvrstitev v serijo");
const mejeZaUporabo = new Map([["vw golf|", [{ mejaLeto: 2016, mejaMesec: 11, zaupanje: 80 }]]]);
const golf = (letnik: number, mesec: number | null): OglasZaFacelift => ({
  id: "x", druzinaModela: "vw golf", generacija: null, letnik, registracijaMesec: mesec,
  cena: 12000, naziv: "VW Golf 1.6 TDI", opis: null, verzija: null, opremaKljucna: {},
});
preveri("3/2016 je serija 0", uvrsti(golf(2016, 3), mejeZaUporabo).serija === 0, "pred novembrom 2016");
preveri("12/2016 je serija 1", uvrsti(golf(2016, 12), mejeZaUporabo).serija === 1, "po novembru 2016");
preveri("5/2018 je serija 1", uvrsti(golf(2018, 5), mejeZaUporabo).serija === 1, "");
preveri(
  "letnik 2016 brez meseca ostane neznan",
  uvrsti(golf(2016, null), mejeZaUporabo).serija === null,
  "dvoumno: meja je sredi leta"
);
preveri("letnik 2019 brez meseca je vseeno znan", uvrsti(golf(2019, null), mejeZaUporabo).serija === 1, "");
preveri(
  "trditev oglasa se prenese ločeno",
  uvrsti({ ...golf(2015, 4), naziv: "VW Golf facelift" }, mejeZaUporabo).faceliftTrditev === true,
  "meritev in trditev sta ločeni"
);

preveri("mesecIndeks brez meseca je sredina leta", mesecIndeks(2020, null) === 2020 * 12 + 5, "");

console.log(napak === 0 ? "\nVSE OK" : `\n${napak} NAPAK`);
process.exitCode = napak === 0 ? 0 : 1;
