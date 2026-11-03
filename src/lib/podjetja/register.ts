import "server-only";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { davcnaIz } from "./kljuc";

/** Register podjetij (AJPES, podjetja_register) za kartico in za »Dodaj podjetje« (faza 6). Samo branje. */

export type IzRegistra = {
  maticna: string | null;
  davcna: string | null;
  naziv: string | null;
  naslov: string | null;
  posta: string | null;
  kraj: string | null;
  skd: string | null;
  skd_naziv: string | null;
  pravna_oblika: string | null;
  velikost: string | null;
  spletna_stran: string | null;
  eposta: string | null;
  telefon: string | null;
  ni_vec_od: string | null;
};

const STOLPCI =
  "maticna, davcna, naziv, naslov, posta, kraj, skd, skd_naziv, pravna_oblika, velikost, spletna_stran, eposta, " +
  "telefon, ni_vec_od";

/** Register zapisuje davčno kot »SI 12345678«. */
function zapisDavcne(d: string): string[] {
  return [`SI ${d}`, d, `SI${d}`];
}

export async function izRegistraPoDavcni(davcna: string): Promise<IzRegistra | null> {
  const d = davcnaIz(davcna);
  if (!d) return null;
  try {
    const { data } = await createAvtonetClient()
      .from("podjetja_register")
      .select(STOLPCI)
      .in("davcna", zapisDavcne(d))
      .limit(1);
    return ((data ?? [])[0] as unknown as IzRegistra | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Do 10 zadetkov po davčni, matični ali imenu. Napaka baze = null (»ni podatka«). */
export async function isciVRegistru(q: string): Promise<IzRegistra[] | null> {
  const iskano = q.trim().slice(0, 80);
  if (iskano.length < 3) return [];
  const stevke = iskano.replace(/\D/g, "");
  try {
    const db = createAvtonetClient().from("podjetja_register").select(STOLPCI);
    let poizvedba;
    if (stevke.length >= 8 && stevke.length === iskano.replace(/[\sA-Za-z]/g, "").length) {
      const d = stevke.slice(-8);
      poizvedba = db.or(`davcna.in.("SI ${d}",${d}),maticna.like.${stevke.slice(0, 7)}*`);
    } else {
      const vzorec = iskano.replace(/[%*,()"]/g, " ").trim();
      poizvedba = db.ilike("naziv", `%${vzorec}%`).is("ni_vec_od", null);
    }
    const { data, error } = await poizvedba.limit(10);
    if (error) return null;
    return (data ?? []) as unknown as IzRegistra[];
  } catch {
    return null;
  }
}
