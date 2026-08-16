import { ustvariZascito } from "./zascita.js";

/** TEMP — dokaz, da se zascita odzove hitro in stopnjevano. Izbrisi po uporabi. */
const tih = () => {};
let ok = true;
const preveri = (p: boolean, opis: string, dodatek = "") => {
  console.log(`  ${p ? "OK  " : "FAIL"}  ${opis}${dodatek ? " — " + dodatek : ""}`);
  if (!p) ok = false;
};

// 1) Zdrav tek: 100 uspehov -> brez hlajenja, razmik ostane osnovni
{
  const z = ustvariZascito(2500, tih);
  for (let i = 0; i < 100; i++) z.zabelezi("uspeh");
  const s = z.stanje();
  preveri(s.hlajenj === 0 && !s.ustavi, "100 uspehov: brez hlajenja");
  preveri(s.delayMs === 2500, "razmik ostane osnovni", `${s.delayMs} ms`);
}

// 2) Mehka blokada: same prazne strani -> hlajenje po ~20 poskusih (ne po 746!)
{
  const z = ustvariZascito(2500, tih);
  let poskusov = 0;
  while (z.stanje().hlajenj === 0 && poskusov < 100) {
    z.zabelezi("prazna");
    poskusov++;
  }
  const s = z.stanje();
  preveri(s.hlajenj === 1, "prazne strani sprozijo hlajenje");
  preveri(poskusov <= 25, "zazna v <= 25 poskusih", `${poskusov} poskusov`);
  preveri(s.pavzaDo > Date.now() + 10 * 60_000, "pavza je vsaj 10 min");
  preveri(z.cakanje() > 10 * 60_000, "cakanje odraza pavzo");
}

// 3) Vir se ne opomore -> stopnjevanje in nazadnje odneha za ta krog
{
  const z = ustvariZascito(2500, tih);
  let ustavil = false;
  for (let i = 0; i < 400 && !ustavil; i++) {
    if (z.zabelezi("prazna") === "ustavi") ustavil = true;
  }
  preveri(ustavil, "po vec hlajenjih odneha za ta krog");
  preveri(z.ustaviSe(), "ustaviSe() javi ustavitev");
  preveri((z.razlogUstavitve() ?? "").includes("ostanejo v vrsti"), "razlog pove, da oglasi ostanejo v vrsti");
}

// 4) Okrevanje: po hlajenju sonda uspe -> nadaljuje, brez novega hlajenja
{
  const z = ustvariZascito(2500, tih);
  while (z.stanje().hlajenj === 0) z.zabelezi("prazna");
  for (let i = 0; i < 5; i++) z.zabelezi("uspeh"); // sonda
  for (let i = 0; i < 30; i++) z.zabelezi("uspeh");
  const s = z.stanje();
  preveri(s.hlajenj === 1 && !s.ustavi, "po okrevanju ne stopnjuje naprej");
}

// 5) Blokada 403 -> takojsnje hlajenje, brez cakanja na okno
{
  const z = ustvariZascito(2500, tih);
  z.zabelezi("blokada");
  preveri(z.stanje().hlajenj === 1, "403 sprozi hlajenje takoj");
}

// 6) Razmik se sam vraca navzdol po dolgem uspesnem nizu
{
  const z = ustvariZascito(2000, tih);
  z.zabelezi("prazna"); // razmik gor
  const poNapaki = z.stanje().delayMs;
  for (let i = 0; i < 60; i++) z.zabelezi("uspeh");
  const poUspehih = z.stanje().delayMs;
  preveri(poNapaki > 2000, "napaka poveca razmik", `${poNapaki} ms`);
  preveri(poUspehih < poNapaki, "uspehi ga vrnejo navzdol", `${poUspehih} ms`);
}

console.log(ok ? "\nVSE OK" : "\nNEKAJ NE DELUJE");
process.exitCode = ok ? 0 : 1;
