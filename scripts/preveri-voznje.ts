import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

/**
 * Preverjanje, ali so vse opravljene vožnje vpisane v evidenco ekip.
 *
 * Dva vira, ki morata povedati isto:
 *   1. "Tabela PT <mesec>.xlsx" — mesečna tabela, po kateri se obračuna
 *      ProtecTransu. To je resnica: kar je tu, je bilo odpeljano in zaračunano.
 *   2. "Seznami_ekip_2026.xlsx" — interna evidenca po tednih (kdo, kdaj, s čim).
 *
 * Vez med njima je številka zahtevka iz portala (#707171). V tabeli PT je v
 * svojem stolpcu, v evidenci pa v vrstici "Escort:" znotraj tedenskega obrazca.
 *
 * Skripta ničesar ne popravlja — samo prebere oba vira in pove, kaj je kje
 * narobe. Evidenca ostane nedotaknjena; popravke vnese človek.
 */

/** Kje je evidenca ekip. Privzeto sinhronizirani OneDrive na tem računalniku. */
const EVIDENCA =
  process.env.VOZNJE_EVIDENCA ?? "C:\\Users\\lukak\\OneDrive\\Firma\\Seznami_ekip_2026.xlsx";
/** Mapa z mesečnimi tabelami "Tabela PT <mesec>.xlsx". */
const RACUNI =
  process.env.VOZNJE_RACUNI ?? "C:\\Users\\lukak\\OneDrive\\Firma\\Računi\\2026";
/** Kam se zapiše poročilo. */
const IZHOD = process.env.VOZNJE_IZHOD ?? "C:\\Users\\lukak\\OneDrive\\Firma";

const MESECI = [
  "januar", "februar", "marec", "april", "maj", "junij",
  "julij", "avgust", "september", "oktober", "november", "december",
];

type Voznja = {
  st: string;
  datum: string;
  opis: string;
  vir: string;
};

function log(sporocilo: string): void {
  console.log(`${new Date().toISOString()} ${sporocilo}`);
}

/** Leto, ki ga preverjamo — iz imena evidence, sicer tekoče. */
function leto(): number {
  const m = /(20\d{2})/.exec(EVIDENCA);
  return m ? Number(m[1]) : new Date().getFullYear();
}

/**
 * Celica je lahko besedilo ("17.8.2026") ali pravi datum — odvisno od tega,
 * kdo je vrstico vnesel. Oboje mora pristati v isti obliki, sicer se ista
 * vožnja iz dveh virov ne prepozna.
 */
function vDatum(v: unknown): string | null {
  if (v instanceof Date) {
    return `${v.getDate()}.${v.getMonth() + 1}.${v.getFullYear()}`;
  }
  const s = String(v ?? "").trim();
  return /^\d{1,2}\.\d{1,2}\.20\d{2}$/.test(s) ? s : null;
}

function mesecIz(datum: string): number | null {
  const d = /^\d{1,2}\.(\d{1,2})\./.exec(datum);
  return d ? Number(d[1]) : null;
}

/**
 * Namenoma prek readFileSync in ne XLSX.readFile: v ESM gradnji SheetJS-a
 * readFile ne obstaja, dokler se mu ročno ne poveže `fs`. Branje v medpomnilnik
 * deluje enako v obeh načinih in nas reši te pasti.
 */
function beri(pot: string): XLSX.WorkBook {
  return XLSX.read(readFileSync(pot), { type: "buffer", cellDates: true });
}

function mreza(ws: XLSX.WorkSheet): unknown[][] {
  // blankrows ostane privzeto vklopljen: prazne vrstice so v obrazcih del
  // postavitve in brez njih se vrstice zamaknejo.
  return XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
}

/** Vrstice, v katerih se pojavi dana oznaka (npr. "Escort:"). */
function vrsticeZOznako(g: unknown[][], oznaka: string): number[] {
  const iskano = oznaka.toLowerCase();
  const najdene: number[] = [];
  for (let i = 0; i < g.length; i++) {
    const ima = (g[i] ?? []).some(
      (c) => String(c ?? "").trim().toLowerCase().replace(/:$/, "") === iskano
    );
    if (ima) najdene.push(i);
  }
  return najdene;
}

/** Najbližja vrstica z dano oznako nad vrstico `pod`. */
function oznakaNad(kandidati: number[], pod: number): number | null {
  let najden: number | null = null;
  for (const i of kandidati) if (i < pod && (najden === null || i > najden)) najden = i;
  return najden;
}

/**
 * Tedenski list je obrazec, ne tabela: bloki polj se ponavljajo po stolpcih
 * (oznaka v svojem stolpcu, vrednost dva desno). Vrstice se zato iščejo po
 * oznakah ("Escort:", "Ekipa:", "Destinacija:") in ne po fiksnih številkah —
 * te se zamaknejo, brž ko kdo doda ali odstrani vrstico.
 */
function izEvidence(pot: string): { voznje: Voznja[]; listi: string[] } {
  const zvezek = beri(pot);
  const voznje: Voznja[] = [];
  const listi: string[] = [];

  for (const ime of zvezek.SheetNames) {
    // Tedenski listi se imenujejo po datumskem razponu ("17.-23.8."); zbirni
    // listi (Promet, Trase, Obveznosti ...) se začnejo s črko in jih preskočimo.
    if (!/^\d/.test(ime.trim())) continue;
    listi.push(ime);

    const g = mreza(zvezek.Sheets[ime]);
    const vrEkipa = vrsticeZOznako(g, "ekipa");
    const vrDest = vrsticeZOznako(g, "destinacija");

    // En list ima lahko več pasov obrazcev pod sabo (teden z več kot osmimi
    // vožnjami), zato se obdela vsaka vrstica "Escort:", ne le prva.
    for (const vr of vrsticeZOznako(g, "escort")) {
      const escort = g[vr] ?? [];
      const datumi = g[oznakaNad(vrEkipa, vr) ?? -1] ?? [];
      const dest = g[oznakaNad(vrDest, vr) ?? -1] ?? [];

      for (let c = 0; c < escort.length; c++) {
        const st = String(escort[c] ?? "").trim();
        if (!/^#\d+$/.test(st)) continue;
        voznje.push({
          st,
          datum: vDatum(datumi[c]) ?? "",
          opis: String(dest[c] ?? "").trim(),
          vir: ime,
        });
      }
    }
  }
  return { voznje, listi };
}

/**
 * Stolpci v mesečnih tabelah niso vedno na istem mestu (februar jih ima od C
 * naprej, april od B), zato se ne bere po položaju ampak po vsebini: v vrstici
 * se poišče celica s številko zahtevka in celica z datumom.
 */
function izTabelePT(pot: string, vir: string): Voznja[] {
  const zvezek = beri(pot);
  const voznje: Voznja[] = [];

  for (const ime of zvezek.SheetNames) {
    for (const vr of mreza(zvezek.Sheets[ime])) {
      const iSt = vr.findIndex((v) => /^#\d+$/.test(String(v ?? "").trim()));
      if (iSt < 0) continue;

      const datum = vr.map(vDatum).find((d) => d !== null) ?? "";
      // Relacija stoji desno od številke; prva celica, ki ni znesek.
      const opis = vr
        .slice(iSt + 1)
        .map((v) => String(v ?? "").trim())
        .find((s) => s !== "" && !/^[\d.,]+$/.test(s));

      voznje.push({ st: String(vr[iSt]).trim(), datum, opis: opis ?? "", vir });
    }
  }
  return voznje;
}

/** Vse "Tabela PT <mesec>.xlsx" iz mape z računi, urejene po mesecu. */
function najdiTabele(mapa: string): { mesec: number; pot: string; ime: string }[] {
  if (!existsSync(mapa)) {
    log(`OPOZORILO: mape z računi ni: ${mapa}`);
    return [];
  }
  const najdene: { mesec: number; pot: string; ime: string }[] = [];
  for (const ime of readdirSync(mapa)) {
    const m = /^Tabela PT (.+)\.xlsx$/i.exec(ime);
    if (!m) continue;
    const mesec = MESECI.indexOf(m[1].trim().toLowerCase()) + 1;
    if (mesec > 0) najdene.push({ mesec, pot: join(mapa, ime), ime });
  }
  return najdene.sort((a, b) => a.mesec - b.mesec);
}

/**
 * Datumski razpon, ki ga pokriva tedenski list, iz njegovega imena.
 * Dve obliki v uporabi: "5.-11.1." (isti mesec) in "30.3.-5.4." (čez mesec).
 */
function razponLista(ime: string, l: number): [Date, Date] | null {
  const t = ime.trim();
  const isti = /^(\d{1,2})\.-(\d{1,2})\.(\d{1,2})\.$/.exec(t);
  if (isti) {
    const m = Number(isti[3]);
    return [new Date(l, m - 1, Number(isti[1])), new Date(l, m - 1, Number(isti[2]))];
  }
  const cez = /^(\d{1,2})\.(\d{1,2})\.-(\d{1,2})\.(\d{1,2})\.$/.exec(t);
  if (cez) {
    return [
      new Date(l, Number(cez[2]) - 1, Number(cez[1])),
      new Date(l, Number(cez[4]) - 1, Number(cez[3])),
    ];
  }
  return null;
}

/**
 * Delovni dnevi, ki jih ne pokriva noben tedenski list. Manjkajoč list še ni
 * dokaz manjkajoče vožnje (lahko takrat ni bilo dela), je pa edino mesto, kjer
 * se cel teden lahko izgubi, ne da bi kdo opazil. Šteje se pokritost LISTOV,
 * ne posameznih vožnj — dan brez vožnje je običajen, teden brez lista ni.
 */
function nepokritiDnevi(imenaListov: string[], doDatuma: Date): string[] {
  const l = leto();
  const pokrito = new Set<number>();
  for (const ime of imenaListov) {
    const razpon = razponLista(ime, l);
    if (!razpon) continue;
    for (const d = new Date(razpon[0]); d <= razpon[1]; d.setDate(d.getDate() + 1)) {
      pokrito.add(d.getTime());
    }
  }

  const manjka: string[] = [];
  for (const d = new Date(l, 0, 1); d <= doDatuma; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    if (!pokrito.has(d.getTime())) {
      manjka.push(`${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`);
    }
  }
  return manjka;
}

function main(): void {
  if (!existsSync(EVIDENCA)) {
    log(`NAPAKA: evidence ni na ${EVIDENCA} — nastavi VOZNJE_EVIDENCA.`);
    process.exit(1);
  }

  const { voznje: evidenca, listi } = izEvidence(EVIDENCA);
  log(
    `evidenca: ${listi.length} tedenskih listov, ${evidenca.length} zapisov vožnj ` +
      `(${new Set(evidenca.map((v) => v.st)).size} enoličnih številk)`
  );

  const tabele = najdiTabele(RACUNI);
  log(`tabele PT: ${tabele.length} (${tabele.map((t) => MESECI[t.mesec - 1]).join(", ") || "brez"})`);

  const izpis: (string | number)[][] = [
    ["Mesec", "Na računu", "V evidenci", "Manjka v evidenci", "Ni na računu"],
  ];
  const manjkajoce: Voznja[] = [];
  const neobracunane: Voznja[] = [];

  for (const t of tabele) {
    const pt = izTabelePT(t.pot, t.ime);
    const stPT = new Set(pt.map((v) => v.st));
    const stEv = new Set(
      evidenca.filter((v) => mesecIz(v.datum) === t.mesec).map((v) => v.st)
    );

    const manjka = [...stPT].filter((s) => !stEv.has(s));
    const odvec = [...stEv].filter((s) => !stPT.has(s));

    for (const s of manjka) manjkajoce.push(pt.find((v) => v.st === s)!);
    for (const s of odvec) {
      neobracunane.push(evidenca.find((v) => v.st === s && mesecIz(v.datum) === t.mesec)!);
    }

    izpis.push([
      MESECI[t.mesec - 1],
      stPT.size,
      stEv.size,
      manjka.join(", ") || "—",
      odvec.join(", ") || "—",
    ]);
    log(
      `${MESECI[t.mesec - 1]}: račun ${stPT.size} / evidenca ${stEv.size}` +
        (manjka.length ? `  MANJKA: ${manjka.join(", ")}` : "  ujemanje")
    );
  }

  // Meseci, ki imajo vpise v evidenci, tabele PT pa zanje ni — teh ni s čim
  // preveriti in je pošteno povedati, da so ostali nepreverjeni.
  const zTabelo = new Set(tabele.map((t) => t.mesec));
  const brezTabele = [...new Set(evidenca.map((v) => mesecIz(v.datum)))]
    .filter((m): m is number => m !== null && !zTabelo.has(m))
    .sort((a, b) => a - b);

  const nepokrito = nepokritiDnevi(listi, new Date());

  const zvezek = XLSX.utils.book_new();

  const listPregled = XLSX.utils.aoa_to_sheet(izpis);
  listPregled["!cols"] = [{ wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 40 }, { wch: 40 }];
  listPregled["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(zvezek, listPregled, "Pregled");

  const listManjka: (string | number)[][] = [["Datum", "Številka", "Relacija", "Vir"]];
  for (const v of manjkajoce) listManjka.push([v.datum, v.st, v.opis, v.vir]);
  const wsManjka = XLSX.utils.aoa_to_sheet(listManjka);
  wsManjka["!cols"] = [{ wch: 12 }, { wch: 11 }, { wch: 44 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(zvezek, wsManjka, "Manjka v evidenci");

  const listOdvec: (string | number)[][] = [["Datum", "Številka", "Relacija", "Teden"]];
  for (const v of neobracunane) listOdvec.push([v.datum, v.st, v.opis, v.vir]);
  const wsOdvec = XLSX.utils.aoa_to_sheet(listOdvec);
  wsOdvec["!cols"] = [{ wch: 12 }, { wch: 11 }, { wch: 44 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(zvezek, wsOdvec, "Ni na računu");

  const listDnevi: (string | number)[][] = [["Delovni dan brez tedenskega lista"]];
  for (const d of nepokrito) listDnevi.push([d]);
  const wsDnevi = XLSX.utils.aoa_to_sheet(listDnevi);
  wsDnevi["!cols"] = [{ wch: 24 }];
  XLSX.utils.book_append_sheet(zvezek, wsDnevi, "Nepokriti dnevi");

  const vsebina = XLSX.write(zvezek, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const ime = `Preverjanje_voznje_${new Date().toISOString().slice(0, 10)}.xlsx`;
  try {
    if (!existsSync(IZHOD)) mkdirSync(IZHOD, { recursive: true });
    writeFileSync(join(IZHOD, ime), vsebina);
    log(`poročilo: ${join(IZHOD, ime)}`);
  } catch (e) {
    log(`NAPAKA pri pisanju poročila: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  log(
    `povzetek: manjka v evidenci ${manjkajoce.length}, ni na računu ${neobracunane.length}, ` +
      `delovnih dni brez tedenskega lista ${nepokrito.length}` +
      (brezTabele.length
        ? `, NEPREVERJENI meseci (ni tabele PT): ${brezTabele.map((m) => MESECI[m - 1]).join(", ")}`
        : "")
  );

  // Manjkajoča vožnja pomeni nezaračunano delo — to mora pasti v oči tudi,
  // kadar skripto poganja opravilo in nihče ne bere izpisa.
  if (manjkajoce.length > 0) process.exit(2);
}

try {
  main();
} catch (e) {
  log(`PADEC: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
}
