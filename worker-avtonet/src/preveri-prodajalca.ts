import { oceniDealerja } from "./detail.js";

/**
 * Odlocitvena tabela za "trgovec ali fizicna oseba" — za rocno preverjanje.
 *
 * 23. 9. 2026 je uporabnik opazil, da so v porocilu "Top posli danes" oglasi
 * trgovcev. Vzrok je bil, da razclenjevalnik davcno stevilko narocnika ZAVRZE,
 * zato trgovec brez pravne oblike v imenu ostane neoznacen. Ta skript pokaze,
 * kaj funkcija vrne v vsakem od mejnih primerov.
 *
 *   npx tsx src/preveri-prodajalca.ts
 */
const primeri: { opis: string; naziv: string | null; registriran: boolean; trgovec: boolean; davcna: boolean }[] = [
  { opis: "oglas pravi: registriran kot trgovec", naziv: null, registriran: false, trgovec: true, davcna: false },
  { opis: "NOVO: narocnik ima davcno stevilko", naziv: "AVTOHISA KRANJ", registriran: false, trgovec: false, davcna: true },
  { opis: "pravna oblika v nazivu", naziv: "AVTO VIDMAR d.o.o.", registriran: false, trgovec: false, davcna: false },
  { opis: "registrirani uporabnik = fizicna oseba", naziv: "Marko", registriran: true, trgovec: false, davcna: false },
  { opis: "brez vsakega dokaza = ne vemo", naziv: "Marko", registriran: false, trgovec: false, davcna: false },
  { opis: "registriran uporabnik, a ima davcno", naziv: "Janez", registriran: true, trgovec: false, davcna: true },
];

for (const p of primeri) {
  const r = oceniDealerja(p.naziv, p.registriran, p.trgovec, p.davcna);
  const oznaka = r.jeDealer === true ? "TRGOVEC" : r.jeDealer === false ? "fizicna oseba" : "NE VEMO";
  console.log(`${p.opis.padEnd(40)} -> ${oznaka.padEnd(14)} ${r.dokaz ?? "—"}`);
}
