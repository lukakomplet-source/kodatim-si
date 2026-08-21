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
  {
    // Izvozna cena: vir jo pise kot "Export(*)", ne kot "+ DDV". Prva razlicica
    // pravila je te ni poznala in je shranila 17.909 namesto 21.850 €.
    besedilo:
      "BMW serija 3: LIMUZ-20d-AUT-SPORT 1.registracija 2021 Prevozenih 67151 km Gorivo diesel motor Menjalnik avtomatski menjalnik Motor 1995 ccm, 110 kW / 150 KM 21.850 € oz. 17.909 € Export(*) 21.850 € oz. 17.909 € Export(*)",
    pricakovano: 21850,
    neto: 17909,
  },
  {
    besedilo:
      "Peugeot 208 1.registracija 2021 Prevozenih 45000 km Gorivo bencinski motor Menjalnik rocni menjalnik Motor 1199 ccm, 74 kW / 100 KM 10.480 € oz. 8.590 € Export(*) 10.480 € oz. 8.590 € Export(*)",
    pricakovano: 10480,
    neto: 8590,
  },
  {
    // Mesecni obrok za ceno ne sme steti; cena vozila je 4.950 €.
    besedilo:
      "Renault Clio 1.registracija 2015 Prevozenih 120000 km Gorivo bencinski motor Menjalnik rocni menjalnik Motor 898 ccm, 66 kW / 90 KM 4.950 € oz. 80,00 EUR / mesec (*)",
    pricakovano: 4950,
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
