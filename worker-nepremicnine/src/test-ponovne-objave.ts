import { najdiPare } from "./ponovne-objave.js";

/**
 * Ujemanje ponovnih objav. Past je novogradnja: ista agencija, isti kraj, dve
 * enaki stanovanji po isti ceni — para tam NE sme biti, ker ne vemo, katero je
 * katero.
 */
const o = (id: string, cena: number, prvic: string, zadnjic: string, dodatno: Partial<Record<string, unknown>> = {}) => ({
  id,
  vir: "nepremicnine.net",
  url: `https://x/${id}`,
  agencija: "Agencija d.o.o.",
  tip: "stanovanje",
  posel: "prodaja",
  kraj: "Maribor",
  povrsina_m2: "62.4",
  cena_eur: String(cena),
  cena_prvotna_eur: null,
  first_seen: prvic,
  last_seen: zadnjic,
  ...dodatno,
});

let napak = 0;
const preveri = (ime: string, ok: boolean, info = "") => {
  if (!ok) napak += 1;
  console.log(`  ${ok ? "OK    " : "NAPAKA"} ${ime}${info ? ": " + info : ""}`);
};

// 1. Klasika: umaknjen 1. 9., znova objavljen 5. 9. za 7 % ceneje.
const p1 = najdiPare([o("a", 200000, "2026-06-01", "2026-09-01")], [o("b", 186000, "2026-09-05", "2026-09-28")]);
preveri("cenejša ponovna objava je par", p1.length === 1 && p1[0].nov.id === "b", JSON.stringify(p1.map((p) => p.nov.id)));

// 2. Novogradnja: dva nova enaka oglasa -> ni enoličen -> brez para.
const p2 = najdiPare(
  [o("a", 200000, "2026-06-01", "2026-09-01")],
  [o("b", 186000, "2026-09-05", "2026-09-28"), o("c", 186000, "2026-09-06", "2026-09-28")]
);
preveri("dva kandidata -> ni para", p2.length === 0, String(p2.length));

// 3. Prepozno (40 dni) -> ni para.
preveri("po 30 dneh ni ponovna objava", najdiPare([o("a", 200000, "2026-06-01", "2026-08-01")], [o("b", 186000, "2026-09-10", "2026-09-28")]).length === 0);

// 4. Preklop prodaja -> najem (600 €) je zunaj razmerja cen.
preveri("255.000 -> 600 ni par", najdiPare([o("a", 255000, "2026-06-01", "2026-09-01")], [o("b", 600, "2026-09-05", "2026-09-28")]).length === 0);

// 5. Druga agencija ali drug kraj -> ni par.
preveri("druga agencija ni par", najdiPare([o("a", 200000, "2026-06-01", "2026-09-01")], [o("b", 190000, "2026-09-05", "2026-09-28", { agencija: "Druga" })]).length === 0);
preveri("drug vir ni par", najdiPare([o("a", 200000, "2026-06-01", "2026-09-01")], [o("b", 190000, "2026-09-05", "2026-09-28", { vir: "bolha.com" })]).length === 0);

// 6. Oglas, ki je obstajal SOČASNO (prvič viden davno), ni ponovna objava.
preveri("sočasen oglas ni par", najdiPare([o("a", 200000, "2026-06-01", "2026-09-01")], [o("b", 190000, "2026-05-01", "2026-09-28")]).length === 0);

// 7. Brez površine ni ključa -> ni para (sicer bi se ujele vse garaže v kraju).
preveri("brez površine ni para", najdiPare([o("a", 20000, "2026-06-01", "2026-09-01", { povrsina_m2: null })], [o("b", 19000, "2026-09-05", "2026-09-28", { povrsina_m2: null })]).length === 0);

console.log(napak === 0 ? "\nVSE OK" : `\n${napak} NAPAK`);
process.exitCode = napak === 0 ? 0 : 1;
