import { parseRowText, splitZnamkaModel } from "./parse.js";

/**
 * The parser against text captured from the live avto.net results page during
 * the feasibility test. No network, no browser — this proves the reading
 * logic, which is the part most likely to be quietly wrong.
 */

const SAMPLES: { text: string; href: string; expect: Record<string, unknown> }[] = [
  {
    text:
      "BMW serija X5: 3.0 Avt. INDIVIDUAL-LUFT-PANO-LED-HK-H 23.500 € NOVO NOVO 1.registracija 2016 " +
      "Prevoženih 238000 km Gorivo diesel motor Menjalnik avtomatski menjalnik Motor 2993 ccm, 280 kW / 381 KM 22.900 € 22.900 €",
    href: "../Ads/details.asp?id=22730783&display=BMW%20serija%20X5:",
    expect: { avtonetId: "22730783", letnik: 2016, km: 238000, kw: 280, kmMoci: 381, cenaEur: 22900, znamka: "BMW" },
  },
  {
    text:
      "BMW serija X5: 3.0 d 1.registracija 2005 Prevoženih 199000 km Gorivo diesel motor " +
      "Menjalnik ročni menjalnik Motor 2993 ccm, 160 kW / 218 KM 5.350 €",
    href: "../Ads/details.asp?id=22729361",
    expect: { avtonetId: "22729361", letnik: 2005, km: 199000, kw: 160, kmMoci: 218, cenaEur: 5350 },
  },
  {
    text:
      "BMW serija X2: 2.0.-SPORT-PANORAMA-FULL LED-AUT. 1.registracija 2021 Prevoženih 156000 km " +
      "Gorivo diesel motor Menjalnik avtomatski menjalnik Motor 1995 ccm, 110 kW / 150 KM 23.990 €",
    href: "../Ads/details.asp?id=22725597",
    expect: { avtonetId: "22725597", letnik: 2021, km: 156000, cenaEur: 23990 },
  },
];

let failures = 0;

for (const sample of SAMPLES) {
  const row = parseRowText(sample.text, sample.href);
  if (!row) {
    console.log(`NAPAKA: vrstica ni bila razčlenjena — ${sample.href}`);
    failures += 1;
    continue;
  }
  const { znamka, model } = splitZnamkaModel(row.naziv);
  const actual: Record<string, unknown> = { ...row, znamka, model };

  const wrong = Object.entries(sample.expect).filter(([k, v]) => actual[k] !== v);
  if (wrong.length === 0) {
    console.log(`OK  ${row.avtonetId}  ${znamka} ${model ?? ""} | ${row.letnik} | ${row.km} km | ${row.cenaEur} €`);
  } else {
    failures += 1;
    console.log(`NAPAKA  ${row.avtonetId}`);
    for (const [k, v] of wrong) console.log(`   ${k}: pričakovano ${String(v)}, dobljeno ${String(actual[k])}`);
  }
}

// A discounted advert shows the old price first and the action price last;
// recording the first would promise the client a discount nobody is offering.
const akcija = parseRowText(
  "BMW serija 3: 320d 1.registracija 2019 Prevoženih 120000 km Motor 1995 ccm, 140 kW / 190 KM 25.900 € 23.900 €",
  "../Ads/details.asp?id=1"
);
if (akcija?.cenaEur !== 23900) {
  failures += 1;
  console.log(`NAPAKA: akcijska cena — pričakovano 23900, dobljeno ${akcija?.cenaEur}`);
} else {
  console.log("OK  akcijska cena: vzeta zadnja (23.900 €), ne prvotna");
}

console.log(failures === 0 ? "\nVSE OK." : `\n${failures} napak.`);
process.exit(failures === 0 ? 0 : 1);
