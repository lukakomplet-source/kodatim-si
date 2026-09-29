import { inflateRawSync } from "node:zlib";

/**
 * Najmanjši bralnik ZIP — samo toliko, kolikor ga rabijo uradni izvozi
 * (GURS ETN: en ZIP na leto, nekaj CSV datotek, nekaj MB).
 *
 * Zakaj ne knjižnica ali `tar`: zbiralnik doslej ni imel nobene odvisnosti
 * za arhive, `tar.exe` pa je pot, ki je na drugem stroju ni. Format je
 * preprost: na koncu datoteke je kazalo (End of Central Directory), ki pove,
 * kje so vnosi; vsak vnos je shranjen (0) ali stisnjen z deflate (8).
 * ZIP64 in šifriranje namenoma NISTA podprta — če pride tak arhiv, je to
 * sprememba pri viru in hočemo jasno napako, ne tiho napačnih podatkov.
 */
export type ZipVnos = { ime: string; podatki: Buffer };

export function preberiZip(zip: Buffer): ZipVnos[] {
  // EOCD je v zadnjih 22 + do 65535 bajtih (komentar arhiva).
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP: ni kazala (EOCD) — datoteka ni ZIP ali je okrnjena");

  const vnosov = zip.readUInt16LE(eocd + 10);
  let kazalec = zip.readUInt32LE(eocd + 16);
  if (vnosov === 0xffff || kazalec === 0xffffffff) throw new Error("ZIP64 ni podprt");

  const izid: ZipVnos[] = [];
  for (let n = 0; n < vnosov; n++) {
    if (zip.readUInt32LE(kazalec) !== 0x02014b50) throw new Error(`ZIP: pokvarjen centralni vnos #${n}`);
    const zastavice = zip.readUInt16LE(kazalec + 8);
    const metoda = zip.readUInt16LE(kazalec + 10);
    const stisnjeno = zip.readUInt32LE(kazalec + 20);
    const dolzinaImena = zip.readUInt16LE(kazalec + 28);
    const dolzinaDodatka = zip.readUInt16LE(kazalec + 30);
    const dolzinaKomentarja = zip.readUInt16LE(kazalec + 32);
    const lokalno = zip.readUInt32LE(kazalec + 42);
    // Bit 11 = ime v UTF-8; sicer CP437, ki je za ASCII imena enak.
    const ime = zip.subarray(kazalec + 46, kazalec + 46 + dolzinaImena).toString(zastavice & 0x800 ? "utf8" : "latin1");
    kazalec += 46 + dolzinaImena + dolzinaDodatka + dolzinaKomentarja;

    if (zastavice & 0x1) throw new Error(`ZIP: vnos ${ime} je šifriran`);
    if (ime.endsWith("/")) continue; // mapa

    if (zip.readUInt32LE(lokalno) !== 0x04034b50) throw new Error(`ZIP: pokvarjena lokalna glava za ${ime}`);
    const zacetek = lokalno + 30 + zip.readUInt16LE(lokalno + 26) + zip.readUInt16LE(lokalno + 28);
    const surovo = zip.subarray(zacetek, zacetek + stisnjeno);
    let podatki: Buffer;
    if (metoda === 0) podatki = Buffer.from(surovo);
    else if (metoda === 8) podatki = inflateRawSync(surovo);
    else throw new Error(`ZIP: metoda ${metoda} za ${ime} ni podprta`);
    izid.push({ ime, podatki });
  }
  return izid;
}

/**
 * CSV z glavo, kakor ga pišejo uradni izvozi: ločilo vejica ali podpičje
 * (zazna se iz glave), narekovaji po RFC 4180 ("" znotraj polja = en ").
 * Vrne vrstice kot objekte po imenih stolpcev.
 */
export function preberiCsv(besedilo: string): Record<string, string>[] {
  const t = besedilo.charCodeAt(0) === 0xfeff ? besedilo.slice(1) : besedilo;
  const prvaVrstica = t.slice(0, t.indexOf("\n") >>> 0);
  const locilo = (prvaVrstica.match(/;/g)?.length ?? 0) > (prvaVrstica.match(/,/g)?.length ?? 0) ? ";" : ",";

  const vrstice: string[][] = [];
  let polje = "";
  let vrstica: string[] = [];
  let vNarekovaju = false;
  for (let i = 0; i < t.length; i++) {
    const z = t[i];
    if (vNarekovaju) {
      if (z === '"') {
        if (t[i + 1] === '"') {
          polje += '"';
          i++;
        } else vNarekovaju = false;
      } else polje += z;
      continue;
    }
    if (z === '"') vNarekovaju = true;
    else if (z === locilo) {
      vrstica.push(polje);
      polje = "";
    } else if (z === "\n") {
      vrstica.push(polje.replace(/\r$/, ""));
      vrstice.push(vrstica);
      vrstica = [];
      polje = "";
    } else polje += z;
  }
  if (polje !== "" || vrstica.length > 0) {
    vrstica.push(polje.replace(/\r$/, ""));
    vrstice.push(vrstica);
  }

  const [glava, ...podatki] = vrstice;
  if (!glava) return [];
  const imena = glava.map((g) => g.trim());
  return podatki
    .filter((v) => v.length > 1 || (v[0] ?? "").trim() !== "")
    .map((v) => Object.fromEntries(imena.map((ime, i) => [ime, (v[i] ?? "").trim()])));
}
