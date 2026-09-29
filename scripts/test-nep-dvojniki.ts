import { odstraniDvojnike, type ZaDvojnike } from "../src/lib/nepremicnine/dvojniki";

/**
 * Dvojniki na RESNIČNIH vrsticah iz baze (28. 9. 2026): trinajst hotelov z ≥10
 * enotami, ki so bili v resnici sedem objektov. Past je Kamnik proti Pagu —
 * ista cena, isto število enot, 190 km narazen.
 */
const v = (id: string, vir: string, cena: number, m2: number, enot: number, kraj: string, lat: number, lng: number): ZaDvojnike => ({
  id,
  vir,
  url: `https://${vir}/${id}`,
  cena_eur: String(cena), // PostgREST vrača nize
  povrsina_m2: m2,
  kraj,
  lat,
  lng,
  nepremicnina_id: `kanon-${id}`,
  nastanitev: "apartmajska_hisa",
  st_enot: enot,
  st_enot_ocena: null,
});

const vrstice = [
  v("sez-bolha-1", "bolha.com", 675000, 1200, 13, "Sežana, Sežana", 45.70924, 13.87333),
  v("sez-bolha-2", "bolha.com", 675000, 1200, 13, "Sežana, Sežana", 45.70924, 13.87333),
  v("sez-nepnet", "nepremicnine.net", 675000, 863, 13, "Sežana", 45.70924, 13.87333),
  v("boh-nepnet-1", "nepremicnine.net", 1350000, 804.5, 15, "Srednja Vas v Bohinju", 46.295, 13.92389),
  v("boh-nepnet-2", "nepremicnine.net", 1350000, 804.5, 15, "Srednja Vas v Bohinju", 46.295, 13.92389),
  v("boh-siol-1", "nepremicnine.siol.net", 1350000, 757, 15, "Gorenjska", 46.29389, 13.8975),
  v("boh-siol-2", "nepremicnine.siol.net", 1350000, 757, 15, "Gorenjska", 46.295, 13.92389),
  v("kam-1", "nepremicnine.net", 1450000, 903.4, 11, "Kamnik, Center", 46.22587, 14.61207),
  v("kam-2", "nepremicnine.net", 1450000, 903.4, 11, "Kamnik, Center", 46.22587, 14.61207),
  v("pag", "nepremicnine.net", 1450000, 400, 11, "Kustići, Otok Pag", 44.53056, 14.96667),
  v("seca", "nepremicnine.net", 1750000, 400.5, 13, "Seča, Portorož", 45.5, 13.6),
  v("zadar", "bolha.com", 2500000, 658, 10, "Zadarska, Zadar", 44.12, 15.23),
  v("peroj", "nepremicnine.net", 15600000, 3750, 54, "Peroj", 44.93, 13.79),
];

const { vrstice: ostali, tudiNa } = odstraniDvojnike(vrstice);
const ids = ostali.map((x) => x.id);

let napak = 0;
const preveri = (ime: string, ok: boolean, info: string) => {
  if (!ok) napak += 1;
  console.log(`  ${ok ? "OK    " : "NAPAKA"} ${ime}: ${info}`);
};

preveri("13 vrstic -> 7 objektov", ostali.length === 7, ids.join(", "));
preveri("Sežana je en objekt", ids.filter((i) => i.startsWith("sez")).length === 1, JSON.stringify(tudiNa.get("sez-bolha-1")));
preveri("Bohinj je en objekt", ids.filter((i) => i.startsWith("boh")).length === 1, JSON.stringify(tudiNa.get("boh-nepnet-1")));
preveri("Kamnik in Pag OSTANETA ločena", ids.includes("kam-1") && ids.includes("pag"), ids.join(", "));
preveri("Bohinj: siol je naveden kot drugi vir", (tudiNa.get("boh-nepnet-1") ?? []).some((d) => d.vir === "nepremicnine.siol.net"), "");

// Brez cene ni združevanja: "po dogovoru" si deli tisoč oglasov.
const brezCene = odstraniDvojnike([
  { ...vrstice[0], id: "a", url: "u1", cena_eur: null },
  { ...vrstice[1], id: "b", url: "u2", cena_eur: null },
]);
preveri("brez cene ni dvojnikov", brezCene.vrstice.length === 2, String(brezCene.vrstice.length));

// Nenastanitveni oglasi z isto ceno na različnih virih se NE združijo.
const stanovanji = odstraniDvojnike([
  { ...vrstice[3], id: "s1", url: "x1", nastanitev: null, st_enot: null },
  { ...vrstice[5], id: "s2", url: "x2", nastanitev: null, st_enot: null },
]);
preveri("brez nastanitve: samo isti vir + ista površina + isti kraj", stanovanji.vrstice.length === 2, String(stanovanji.vrstice.length));

console.log(napak === 0 ? "\nVSE OK" : `\n${napak} NAPAK`);
process.exitCode = napak === 0 ? 0 : 1;
