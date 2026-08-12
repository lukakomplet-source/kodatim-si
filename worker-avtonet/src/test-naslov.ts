import { parseDetail, type DetailRaw } from "./detail.js";

/**
 * The title-cleaning guards, against the exact page shapes that put junk into
 * the database — offline, so it runs without touching the source (or its
 * Cloudflare) at all.
 *
 * Fixture 1 reproduces the new-vehicle showroom page: no h1, so the harvest
 * fell back to document.title with its decorations, and 710 adverts ended up
 * with avto.net's phone number as their trim level.
 *
 *   npm run test:naslov
 */

const napake: string[] = [];
function preveri(pogoj: boolean, opis: string, dodatek = ""): void {
  console.log(`  ${pogoj ? "OK    " : "NAPAKA"} ${opis}${dodatek ? ` — ${dodatek}` : ""}`);
  if (!pogoj) napake.push(opis);
}

// --- 1. New-vehicle page: document.title with decorations --------------------
const novoVozilo: DetailRaw = {
  naslov: "MG ZS 1.5L Comfort HD, letnik:2026,0 EUR - prodam :: Avtonet :: www.Avto.net",
  pairs: { Starost: "NOVO VOZILO", Gorivo: "bencinski motor", Menjalnik: "ročni menjalnik" },
  text: [
    "Objavi oglas", "Parkirano", "moj.avto.net",
    "MG ZS 1.5L Comfort HD",
    "Osnovni podatki",
    "Starost:\tNOVO VOZILO",
    "080 / 28 77",
    "Oprema in ostali podatki o ponudbi",
    "klimatska naprava",
    "Prodajalec",
    "AVTO TRGOVINA d.o.o.",
  ].join("\n"),
};

console.log("Novo vozilo (document.title z okraski):");
const d1 = parseDetail(novoVozilo);
preveri(d1.naslov === "MG ZS 1.5L Comfort HD", "okraski iz naslova odstranjeni", String(d1.naslov));
preveri(d1.znamka === "MG", "znamka prepoznana", String(d1.znamka));
preveri(d1.model === "ZS", "model kratek", String(d1.model));
preveri(d1.verzija !== "080 / 28 77", "telefon ni verzija", String(d1.verzija));
preveri(!/(letnik|prodam|Avtonet)/i.test(d1.naslov ?? ""), "brez 'letnik:'/'prodam'/'Avtonet' v naslovu");

// --- 2. Verzija, ki je samo številke, pade ----------------------------------
const stevilskaVerzija: DetailRaw = {
  naslov: "Audi A4: 2 0",
  pairs: { Oblika: "limuzina" },
  text: "Audi A4\nOsnovni podatki",
};
console.log("\nŠtevilska 'verzija':");
const d2 = parseDetail(stevilskaVerzija);
preveri(d2.verzija === null, "verzija brez črk postane null", String(d2.verzija));
preveri(d2.znamka === "Audi" && d2.model === "A4", "znamka/model ostaneta", `${d2.znamka}/${d2.model}`);

// --- 3. Normalna stran ostane nedotaknjena ----------------------------------
const normalen: DetailRaw = {
  naslov: "Audi A6 50 TDI quattro.MATRIX.VIRTUAL",
  pairs: { Oblika: "limuzina", Barva: "črna metalik" },
  text: "Audi A6 50 TDI quattro.MATRIX.VIRTUAL\nOsnovni podatki",
};
console.log("\nNormalen naslov:");
const d3 = parseDetail(normalen);
preveri(d3.naslov === "Audi A6 50 TDI quattro.MATRIX.VIRTUAL", "naslov nespremenjen", String(d3.naslov));
preveri(d3.verzija === "50 TDI quattro.MATRIX.VIRTUAL", "verzija ohranjena", String(d3.verzija));

console.log("\n" + "-".repeat(56));
console.log(napake.length === 0 ? "TEST USPESEN." : `TEST NI USPEL — ${napake.length} napak.`);
if (napake.length > 0) process.exitCode = 1;
