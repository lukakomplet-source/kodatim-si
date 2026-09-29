/**
 * D96/TM (EPSG:3794) → geografske koordinate (ETRS89 ≈ WGS84 na < 1 m).
 *
 * Slovenski državni koordinatni sistem je prečna Mercatorjeva projekcija na
 * elipsoidu GRS80: srednji meridian 15° V, merilo 0,9999, premik
 * E +500.000 m in N −5.000.000 m. GURS podaja centroide parcel v njem, naša
 * baza in zemljevid pa računata v stopinjah — brez pretvorbe bi bila razdalja
 * med oglasom in poslom nesmisel.
 *
 * Obratna formula po Snyderju (Map Projections — A Working Manual, 1987,
 * str. 63–64); na območju Slovenije je napaka pod centimetrom, kar je daleč
 * pod natančnostjo centroida parcele.
 */
const A = 6378137;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9999;
const LON0 = (15 * Math.PI) / 180;
const FE = 500_000;
const FN = -5_000_000;

export function d96vWgs(e: number, n: number): { lat: number; lng: number } {
  const m = (n - FN) / K0;
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const fi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const sin1 = Math.sin(fi1);
  const cos1 = Math.cos(fi1);
  const tan1 = Math.tan(fi1);
  const c1 = EP2 * cos1 ** 2;
  const t1 = tan1 ** 2;
  const n1 = A / Math.sqrt(1 - E2 * sin1 ** 2);
  const r1 = (A * (1 - E2)) / (1 - E2 * sin1 ** 2) ** 1.5;
  const d = (e - FE) / (n1 * K0);

  const lat =
    fi1 -
    ((n1 * tan1) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * EP2 - 3 * c1 ** 2) * d ** 6) / 720);
  const lng =
    LON0 +
    (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * EP2 + 24 * t1 ** 2) * d ** 5) / 120) /
      cos1;
  return { lat: (lat * 180) / Math.PI, lng: (lng * 180) / Math.PI };
}
