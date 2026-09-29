import "dotenv/config";
import { readFileSync } from "node:fs";
import { connect } from "./db.js";
import { uporabniskiAgent } from "./identiteta.js";
import { preberiXlsx } from "./xlsx.js";

/**
 * UVOZ HRVAŠKEGA REGISTRA KATEGORIZIRANIH NASTANITVENIH OBJEKTOV (mint.gov.hr).
 *
 * Dva zahtevka na zagon: stran s povezavo (ime datoteke nosi datum stanja in se
 * ob vsaki objavi spremeni) in sama datoteka. Mesečno zadošča — ministrstvo
 * objavi nov popis približno enkrat na mesec.
 *
 *   npm run uvoz:hr-nastanitve
 *   npm run uvoz:hr-nastanitve -- --datoteka=C:\pot\popis.xlsx   # iz shranjene datoteke
 *
 * List POPIS: vrstica županije, vrstica vrste ("Hotel", "Aparthotel" …) z
 * županijo v 6. stolpcu, glava, nato skupine po kategorijah (vrstica "N | 3* |
 * vsote") in objekti (vrstica "1 | naziv | naslov\r\npošta kraj | | upravljavec |
 * sobe | … | skupaj | ležišča"). Kampov in marin ne uvozimo — njihove
 * "enote" so parcele in privezi, ne sobe.
 */

const STRAN = "https://mint.gov.hr/kategorizacija-11512/11512";
const VRSTE = /^(hotel|aparthotel|turističko naselje|turistički apartmani|hostel|heritage|difuzni|integralni|lječilišni)/i;
const IZPUSTI = /kamp|marin|glamping|kampiral/i;

export function kljucKraja(kraj: string): string {
  return kraj
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type Objekt = { naziv: string; vrsta: string; kategorija: string | null; zupanija: string | null; posta: string | null; kraj: string | null; enot: number | null; lezisc: number | null };

export function objektiIzPopisa(vrstice: string[][]): Objekt[] {
  const izid: Objekt[] = [];
  let zupanija: string | null = null;
  let vrsta: string | null = null;
  let kategorija: string | null = null;
  const st = (x: string | undefined) => {
    const n = Number((x ?? "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && (x ?? "").trim() !== "" ? n : null;
  };
  for (const v of vrstice) {
    const [a = "", b = "", c = ""] = v;
    const ostalo = v.slice(1).filter((x) => x && x.trim() !== "");
    if (a && ostalo.length === 0 && !/^\d+$/.test(a) && !VRSTE.test(a)) {
      zupanija = a.trim(); // vrstica županije
      continue;
    }
    if (VRSTE.test(a) || IZPUSTI.test(a)) {
      vrsta = a.trim();
      if (v[5]) zupanija = v[5].trim();
      kategorija = null;
      continue;
    }
    if (/^\d+$/.test(a) && /^\d\*/.test(b)) {
      kategorija = b.trim(); // vrstica s kategorijo in vsotami
      continue;
    }
    if (a === "1" && b && c && vrsta && !IZPUSTI.test(vrsta)) {
      const vrsticeNaslova = c.split(/\r?\n/).map((x) => x.replace(/,\s*$/, "").trim()).filter(Boolean);
      const zadnja = vrsticeNaslova[vrsticeNaslova.length - 1] ?? "";
      const sPosto = zadnja.match(/^(\d{5})\s+(.+)$/);
      /**
       * Trije zapisi naslova v popisu: "ulica\r\n52440 Poreč" (s pošto),
       * "ulica,\r\nPula" (kraj brez pošte) in "Lanterna 14, Tar" (vse v eni
       * vrstici). Dvojezična imena ("Novigrad - Cittanova") skrajšamo na prvo.
       */
      const brezPoste = sPosto
        ? null
        : vrsticeNaslova.length > 1
          ? zadnja
          : zadnja.includes(",")
            ? (zadnja.split(",").pop() ?? "").trim()
            : null;
      const krajSurov = sPosto?.[2] ?? brezPoste;
      const postaKraj = { posta: sPosto?.[1] ?? null, kraj: krajSurov ? krajSurov.split(/\s+-\s+/)[0].trim() || null : null };
      izid.push({
        naziv: b.replace(/\s+/g, " ").trim(),
        vrsta,
        kategorija,
        zupanija,
        posta: postaKraj.posta,
        kraj: postaKraj.kraj,
        enot: st(v[10]),
        lezisc: st(v[11]),
      });
    }
  }
  return izid;
}

async function main(): Promise<void> {
  const db = connect();
  const ua = uporabniskiAgent();
  const izDatoteke = process.argv.find((x) => x.startsWith("--datoteka="))?.split("=").slice(1).join("=");
  let xlsx: Buffer;
  let stanje = "";
  if (izDatoteke) {
    xlsx = readFileSync(izDatoteke);
    stanje = izDatoteke.match(/\((\d{2}\.\d{2}\.\d{4})\.?\)/)?.[1] ?? "";
  } else {
    const html = await (await fetch(STRAN, { headers: { "user-agent": ua } })).text();
    const pot = html.match(/UserDocsImages\/1A_UPISNICI\/POPIS[^"]*?\.xlsx[^"]*/)?.[0];
    if (!pot) throw new Error("Na strani ministrstva ni povezave na popis — spremenjena stran?");
    stanje = decodeURIComponent(pot).match(/\((\d{2}\.\d{2}\.\d{4})\.?\)/)?.[1] ?? "";
    await new Promise((r) => setTimeout(r, 8_000)); // vljudni razmik med zahtevkoma
    const odziv = await fetch(`https://mint.gov.hr/${encodeURI(pot).replace(/%25/g, "%")}`, { headers: { "user-agent": ua } });
    if (!odziv.ok) throw new Error(`Popis: HTTP ${odziv.status}`);
    xlsx = Buffer.from(await odziv.arrayBuffer());
  }

  const listi = preberiXlsx(xlsx);
  const popis = listi.get("POPIS");
  if (!popis) throw new Error("V datoteki ni lista POPIS — spremenjena struktura?");
  const objekti = objektiIzPopisa(popis);
  if (objekti.length < 200) throw new Error(`Prebranih samo ${objekti.length} objektov — verjetno spremenjena struktura; baze ne spreminjam.`);

  // Celoten popis se zamenja: objekt, ki izgubi kategorijo, mora izginiti.
  await db.from("nep_hr_nastanitve").delete().gte("id", 0);
  const vrstice = objekti.map((o) => ({ ...o, kraj_kljuc: o.kraj ? kljucKraja(o.kraj) : null, stanje }));
  for (let i = 0; i < vrstice.length; i += 500) {
    const { error } = await db.from("nep_hr_nastanitve").insert(vrstice.slice(i, i + 500));
    if (error) throw new Error(`Zapis: ${error.message}`);
  }
  const poVrsti = new Map<string, number>();
  for (const o of objekti) poVrsti.set(o.vrsta, (poVrsti.get(o.vrsta) ?? 0) + 1);
  console.log(`Uvoženih ${objekti.length} objektov (stanje ${stanje}); ${[...poVrsti].map(([k, n]) => `${k}: ${n}`).join(", ")}`);
  await new Promise((r) => setTimeout(r, 300));
}

// Zagon samo kot skripta (test uvozi objektiIzPopisa brez omrežja).
if (process.argv[1] && /uvoz-hr-nastanitve/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  });
}
