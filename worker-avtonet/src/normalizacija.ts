import type { Db } from "./db.js";
import { identiteta, prstniOdtis, primerljivostCene, type OglasZaIdentiteto } from "./identiteta.js";

/**
 * Polnjenje normalizirane identitete — kot funkcija, da jo lahko požene tako
 * ročna skripta kot dnevni cikel po vsakem pregledu trga.
 *
 * Bere samo podatke, ki jih že imamo. Ne kliče avto.neta, torej ne more
 * povzročiti blokade in ne moti zbiralnika.
 */

const POLJA =
  "id, avtonet_id, url, naziv, znamka, model, letnik, kw, gorivo, menjalnik, karoserija, pogon, " +
  "oprema, opis, oprema_znacilke, dodatni_podatki, cena_eur, cena_na_poziv, ddv_odbitek, status";

type Vrstica = OglasZaIdentiteto & {
  id: string;
  avtonet_id: string;
  url: string;
  cena_eur: number | string | null;
  cena_na_poziv: boolean | null;
  ddv_odbitek: boolean | null;
  status: string;
};

export type Izid = {
  obdelanih: number;
  zVin: number;
  izvVisoka: number;
  izvMotor: number;
  izvMoc: number;
  izvNi: number;
  povprecnoZaupanje: number;
  neprimerljivih: number;
  razlogi: Record<string, number>;
};

export async function normalizirajIdentitete(
  db: Db,
  moznosti: { vse?: boolean; najvec?: number; napredek?: (n: number) => void } = {}
): Promise<Izid> {
  const { vse = false, najvec = Infinity, napredek } = moznosti;
  const izid: Izid = {
    obdelanih: 0, zVin: 0, izvVisoka: 0, izvMotor: 0, izvMoc: 0, izvNi: 0,
    povprecnoZaupanje: 0, neprimerljivih: 0, razlogi: {},
  };
  let zaupanjeVsota = 0;
  let od = 0;

  for (;;) {
    let q = db.from("avtonet_oglasi").select(POLJA).order("id").range(vse ? od : 0, (vse ? od : 0) + 499);
    if (!vse) q = q.is("identiteta_izracunana", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const paket = (data ?? []) as unknown as Vrstica[];
    if (paket.length === 0) break;

    const posodobitve = paket.map((v) => {
      const i = identiteta(v);
      const c = primerljivostCene(v);
      zaupanjeVsota += i.zaupanje;
      if (i.vin) izid.zVin++;
      if (i.izvedenkaVir === "naziv-znamka") izid.izvVisoka++;
      else if (i.izvedenkaVir === "naziv-motor") izid.izvMotor++;
      else if (i.izvedenkaVir === "moc") izid.izvMoc++;
      else izid.izvNi++;
      if (!c.primerljiva) {
        izid.neprimerljivih++;
        izid.razlogi[c.razlog] = (izid.razlogi[c.razlog] ?? 0) + 1;
      }
      return {
        id: v.id,
        avtonet_id: v.avtonet_id,
        // url je NOT NULL; upsert ga potrebuje, zato ga prenesemo nespremenjenega.
        url: v.url,
        druzina_modela: i.druzinaModela,
        generacija: i.generacija,
        izvedenka: i.izvedenka,
        izvedenka_vir: i.izvedenkaVir,
        identiteta_zaupanje: i.zaupanje,
        pogon_norm: i.pogon,
        menjalnik_druzina: i.menjalnikDruzina,
        vin: i.vin,
        oprema_kljucna: i.oprema,
        oprema_teza: i.opremaTeza,
        prstni_odtis: prstniOdtis(i),
        cena_primerljiva: c.primerljiva,
        razlog_izkljucitve: c.razlog,
        identiteta_izracunana: new Date().toISOString(),
      };
    });

    const { error: napakaPisanja } = await db.from("avtonet_oglasi").upsert(posodobitve, { onConflict: "id" });
    if (napakaPisanja) throw new Error(napakaPisanja.message);

    izid.obdelanih += paket.length;
    od += paket.length;
    napredek?.(izid.obdelanih);
    if (izid.obdelanih >= najvec || paket.length < 500) break;
  }

  izid.povprecnoZaupanje = Math.round(zaupanjeVsota / Math.max(1, izid.obdelanih));
  return izid;
}
