import { parseRowText } from "./parse.js";

/**
 * Cena z DDV proti neto ceni — z resničnimi vrsticami iz vira.
 *
 *   npm run test:ddv
 */
const primeri: { besedilo: string; pricakovano: number; neto: number | null }[] = [
  {
    besedilo:
      "Volvo V60 B4D Momentum Pro Avt. NOVO NOVO 1.registracija 2022 Prevoženih 140000 km Gorivo diesel motor Menjalnik avtomatski menjalnik Motor 1969 ccm, 145 kW / 197 KM 17.980 € oz. 14.740 € + DDV(*) 17.980 € oz. 14.740 € + DDV(*)",
    pricakovano: 17980,
    neto: 14740,
  },
  {
    besedilo:
      "Mazda CX-30 e-Skyactiv G140 NOVO 1.registracija 2025 Prevoženih 2700 km Gorivo bencinski motor Menjalnik ročni menjalnik Motor 2488 ccm, 105 kW / 143 KM 23.999 € oz. 19.670 € + DDV(*) 23.999 € oz. 19.670 € + DDV(*)",
    pricakovano: 23999,
    neto: 19670,
  },
  {
    // Brez DDV zapisa: navadna akcijska cena, kjer velja zadnja.
    besedilo:
      "Volkswagen Golf 1.6 TDI 1.registracija 2016 Prevoženih 190000 km Gorivo diesel motor Menjalnik ročni menjalnik Motor 1598 ccm, 81 kW / 110 KM 9.900 € 8.900 €",
    pricakovano: 8900,
    neto: null,
  },
];

let napak = 0;
for (const p of primeri) {
  const r = parseRowText(p.besedilo, "details.asp?id=123");
  const ok = r?.cenaEur === p.pricakovano && (r?.cenaBrezDdvEur ?? null) === p.neto;
  if (!ok) napak += 1;
  console.log(
    `  ${ok ? "OK  " : "NAPAKA"}  cena=${r?.cenaEur} (pričakovano ${p.pricakovano}) · brezDDV=${r?.cenaBrezDdvEur ?? "—"} (pričakovano ${p.neto ?? "—"})`
  );
}

console.log(napak === 0 ? "\nVSE OK" : `\n${napak} NAPAK`);
process.exitCode = napak === 0 ? 0 : 1;
