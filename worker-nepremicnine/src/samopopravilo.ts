import type { Db } from "./db.js";

/**
 * Samopopravilo — da pregled nikoli ne obstane in nikoli ne laže.
 *
 * Povod: 20. 8. 2026 je pregled nepremicnine.net prebral 290 strani in pobral
 * 4.548 oglasov, nato je vir vrnil prazno stran. Cel pregled je bil zabeležen
 * kot "napaka". V konzoli je bila rdeča vrstica, čeprav je zbiralnik delal
 * natanko to, kar mora: vljudno se je ustavil. Rdeča barva na uspešnem delu je
 * hujša od nobene barve — človek jo neha gledati.
 *
 * Zato tu ločimo tri stvari, ki so bile prej ena sama:
 *
 *  1. USPEH        — pregled je videl cel katalog vira.
 *  2. DELNI USPEH  — pregled je nekaj pobral in se ustavil (kvota, rotacija
 *                    rezin, blokada, prekinitev). Podatki so dobri, katalog ni
 *                    cel; izginotij se po takem pregledu NE sme sklepati.
 *  3. NAPAKA       — ni bilo zbrano nič. Šele to je napaka.
 *
 * Vse, kar ta datoteka počne, je zapisano v `nep_statistika` pod ključem
 * `samopopravila`, ker popravilo, ki ga nihče ne vidi, se ne loči od okvare.
 *
 * Nobeno od teh popravil ne obide blokade in nobeno ne pospeši branja. Edini
 * dovoljeni odgovor na "vir nas ustavlja" je počakati dlje.
 */

export type Ukrep =
  | "zakljuci_delno"
  | "ponovni_poskus"
  | "pocakaj_ure"
  | "sprosti_vrsto"
  | "zapri_osirotelega"
  | "ponovni_zagon"
  | "nic";

export type Zapis = {
  ob: string;
  sprozil: string;
  vir: string | null;
  vzrok: string;
  ukrep: Ukrep;
  izvedeno: string;
};

export const UKREP_OPIS: Record<Ukrep, string> = {
  zakljuci_delno: "zaključeno kot delni pregled",
  ponovni_poskus: "ponovni poskus",
  pocakaj_ure: "premor zaradi blokade",
  sprosti_vrsto: "sproščena vrsta",
  zapri_osirotelega: "zaprt osiroteli pregled",
  ponovni_zagon: "ponovni zagon zbiralnika",
  nic: "brez posega",
};

/** Zgodovina popravil, najnovejše prvo, omejena na 30 zapisov. */
export async function zabelezi(db: Db, z: Omit<Zapis, "ob">): Promise<Zapis> {
  const zapis: Zapis = { ob: new Date().toISOString(), ...z };
  try {
    const { data } = await db
      .from("nep_statistika")
      .select("podatki")
      .eq("kljuc", "samopopravila")
      .maybeSingle();
    const prej = ((data as { podatki: { zapisi?: Zapis[] } } | null)?.podatki?.zapisi ?? []).slice(0, 29);
    await db.from("nep_statistika").upsert({
      kljuc: "samopopravila",
      podatki: { zapisi: [zapis, ...prej] },
      izracunano: zapis.ob,
    });
  } catch {
    // Zapisovanje incidenta ne sme biti razlog za nov incident.
  }
  return zapis;
}

export type IzidPregleda = {
  strani: number;
  najdenih: number;
  napak: number;
  /** Ali je pregled videl cel katalog vira. */
  popoln: boolean;
  /** Sporočilo blokade, če je vir zavrnil. */
  blokada: string | null;
  /** Nezaželen konec, ki pa ni blokada (npr. časovna omejitev klica). */
  napaka: string | null;
  /** Prekinitev na zahtevo (SIGINT) — človekova odločitev, ne okvara. */
  prekinjeno: boolean;
};

export type Zakljucek = {
  status: "koncano" | "koncano_delno" | "napaka";
  opozorilo: string | null;
  pregledPopoln: boolean;
};

/**
 * Kako se pregled konča. Ena sama funkcija, da se pravilo ne razleze po kodi
 * in da je "kdaj je to napaka" na enem mestu, kjer se ga da prebrati.
 */
export function oceniZakljucek(i: IzidPregleda): Zakljucek {
  const nekajJeNaredil = i.strani > 0 || i.najdenih > 0;

  if (!nekajJeNaredil) {
    // Nič pobranega. Šele to je napaka — in tudi tu povemo, katera.
    return {
      status: "napaka",
      opozorilo: i.blokada ?? i.napaka ?? "Pregled ni pobral nobene strani.",
      pregledPopoln: false,
    };
  }

  if (i.blokada) {
    return {
      status: "koncano_delno",
      opozorilo: `Vir nas je ustavil po ${i.strani} straneh (${i.najdenih} oglasov je shranjenih). Nadaljujemo po hlajenju.`,
      pregledPopoln: false,
    };
  }
  if (i.prekinjeno) {
    return {
      status: "koncano_delno",
      opozorilo: `Pregled je bil prekinjen na zahtevo po ${i.strani} straneh. Zbrano ostane, nadaljuje se pri isti rezini.`,
      pregledPopoln: false,
    };
  }
  if (i.napaka) {
    return {
      status: "koncano_delno",
      opozorilo: `Pregled se je ustavil predčasno (${i.napaka}), a je ${i.najdenih} oglasov shranjenih.`,
      pregledPopoln: false,
    };
  }
  if (!i.popoln) {
    return {
      status: "koncano_delno",
      opozorilo:
        i.napak > 0
          ? `Delni pregled (kvota ali rotacija rezin), ob tem ${i.napak} napak na posameznih straneh.`
          : "Delni pregled — kvota strani ali rotacija rezin. Ostalo pride na vrsto naslednjič.",
      pregledPopoln: false,
    };
  }
  return { status: "koncano", opozorilo: null, pregledPopoln: true };
}

/**
 * Pregledi, ki jih nihče ne bo končal.
 *
 * Vrstica v stanju "tece" pomeni "en zbiralnik prav zdaj dela na tem" in
 * unikatni indeks zaradi nje zavrne vsako novo zahtevo. Če je proces umrl
 * (izpad elektrike, sesutje), taka vrstica za vedno zaklene vse nadaljnje
 * preglede. Zato: kar se ni premaknilo dlje kot `minut`, je truplo.
 *
 * Zaključi se kot delni pregled, ne kot napaka — delo, ki ga je opravil,
 * je v bazi in je resnično.
 */
export async function zapriOsirotele(db: Db, minut = 45): Promise<number> {
  const meja = new Date(Date.now() - minut * 60_000).toISOString();
  const { data } = await db
    .from("nep_pregledi")
    .select("id, vir, strani, najdenih, updated_at")
    .eq("status", "tece")
    .lt("updated_at", meja);
  const osiroteli = (data ?? []) as { id: string; vir: string | null; strani: number; najdenih: number }[];

  for (const p of osiroteli) {
    const z = oceniZakljucek({
      strani: p.strani ?? 0,
      najdenih: p.najdenih ?? 0,
      napak: 0,
      popoln: false,
      blokada: null,
      napaka: `zbiralnik se ni oglasil ${minut} minut`,
      prekinjeno: false,
    });
    await db
      .from("nep_pregledi")
      .update({
        status: z.status,
        konec: new Date().toISOString(),
        pregled_popoln: false,
        opozorilo: z.opozorilo,
        zadnja_napaka: "prekinjen — zbiralnik se ni oglasil",
      })
      .eq("id", p.id)
      .eq("status", "tece");
    await zabelezi(db, {
      sprozil: "nadzor osirotelih pregledov",
      vir: p.vir,
      vzrok: `Pregled je bil ${minut} minut brez premika, proces ga očitno ne obdeluje več.`,
      ukrep: "zapri_osirotelega",
      izvedeno: `Pregled zaključen kot "${z.status}" (${p.strani ?? 0} strani, ${p.najdenih ?? 0} oglasov je v bazi).`,
    });
  }
  return osiroteli.length;
}

/**
 * Vrsta 2. faze, ki je prazna samo zato, ker je vse parkirano.
 *
 * Parkirnina po neuspehu je prava rešitev za en pokvarjen oglas in napačna,
 * kadar je bil vzrok začasen (izpad omrežja, ponovni zagon baze) in je
 * parkiral vse naenkrat. Takrat vrsta izgleda prazna, čeprav čaka na tisoče
 * oglasov. To razliko zna povedati samo primerjava obeh števil.
 */
export async function sprostiZataknjenoVrsto(db: Db, vir: string): Promise<number> {
  const zdaj = new Date().toISOString();
  const { count: cakajocih } = await db
    .from("nep_oglasi")
    .select("id", { count: "exact", head: true })
    .eq("vir", vir)
    .eq("status", "aktiven")
    .is("detajl_zajet", null);
  if (!cakajocih) return 0;

  const { count: parkiranih } = await db
    .from("nep_oglasi")
    .select("id", { count: "exact", head: true })
    .eq("vir", vir)
    .eq("status", "aktiven")
    .is("detajl_zajet", null)
    .gt("detajl_naslednji_poskus", zdaj);

  // Sprostimo šele, ko je parkirana skoraj cela vrsta — sicer bi z vsakim
  // krogom sproščali tiste, ki so parkirani upravičeno.
  if (!parkiranih || parkiranih < cakajocih * 0.9) return 0;

  await db
    .from("nep_oglasi")
    .update({ detajl_naslednji_poskus: null, detajl_poskusov: 0 })
    .eq("vir", vir)
    .eq("status", "aktiven")
    .is("detajl_zajet", null)
    .gt("detajl_naslednji_poskus", zdaj);

  await zabelezi(db, {
    sprozil: "priprava 2. faze",
    vir,
    vzrok: `Parkiranih je bilo ${parkiranih} od ${cakajocih} oglasov v vrsti — to ni okvara posameznih oglasov, ampak skupna motnja.`,
    ukrep: "sprosti_vrsto",
    izvedeno: `Sproščenih ${parkiranih} oglasov; poskusi postavljeni na nič.`,
  });
  return parkiranih;
}

/** Ali vir še počiva po blokadi (in do kdaj). */
export async function hlajenjeDo(db: Db, vir: string): Promise<string | null> {
  const { data } = await db
    .from("nep_statistika")
    .select("podatki")
    .eq("kljuc", `blokada:${vir}`)
    .maybeSingle();
  const doKdaj = (data?.podatki as { do?: string } | null)?.do ?? null;
  return doKdaj && new Date(doKdaj).getTime() > Date.now() ? doKdaj : null;
}

/** Zabeleži blokado in vira do izteka ne obiskujemo — nikoli je ne obidemo. */
export async function zabelezBlokado(db: Db, vir: string, ur: number, razlog: string): Promise<string> {
  const doKdaj = new Date(Date.now() + ur * 3_600_000).toISOString();
  await db.from("nep_statistika").upsert({
    kljuc: `blokada:${vir}`,
    podatki: { do: doKdaj, razlog },
    izracunano: new Date().toISOString(),
  });
  await db
    .from("nep_viri")
    .update({ zdravje: "degraded", opomba: `Vir zavrača; počakamo do ${new Date(doKdaj).toLocaleString("sl-SI")}` })
    .eq("vir", vir);
  await zabelezi(db, {
    sprozil: "zaznana blokada vira",
    vir,
    vzrok: razlog,
    ukrep: "pocakaj_ure",
    izvedeno: `Vir počiva ${ur} h (do ${new Date(doKdaj).toLocaleString("sl-SI")}). Vsak poskus vmes bi blokado podaljšal.`,
  });
  return doKdaj;
}
