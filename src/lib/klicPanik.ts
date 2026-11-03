// Brez strežniških uvozov in brez "use client": besedila klica berejo strežniške strani (Danes) in komponente v
// brskalniku (KlicIzid, ScenarijKlica). Prej so bila v PanikKoraki.tsx (faza 4, 3. 11. 2026).

/** Izid klica, kot ga sprejme Harvey Kompletko (harvey/posiljanja.py KLIC_IZIDI) in Danes › Klici za KodaTim. */
export type IzidKlica = "sestanek" | "poslji_mail" | "ni_dvignil" | "ne_zanima" | "poklici_kasneje";

export const VSI_IZIDI: IzidKlica[] = ["sestanek", "poslji_mail", "ni_dvignil", "ne_zanima", "poklici_kasneje"];

export function jeIzid(v: unknown): v is IzidKlica {
  return typeof v === "string" && (VSI_IZIDI as string[]).includes(v);
}

export const IZIDI: { izid: IzidKlica; besedilo: string; razlaga: string }[] = [
  { izid: "sestanek", besedilo: "Sestanek", razlaga: "dogovorjen termin: datum, ura in kraj" },
  { izid: "poslji_mail", besedilo: "Pošljite na mail", razlaga: "pripravim mail z dvema terminoma" },
  { izid: "ni_dvignil", besedilo: "Ni dvignil", razlaga: "pokličeš znova naslednji delavnik" },
  { izid: "ne_zanima", besedilo: "Ne zanima", razlaga: "izpade iz zaporedja" },
  { izid: "poklici_kasneje", besedilo: "Pokliči kasneje", razlaga: "rekli so, kdaj naj pokličeš; do takrat jim ne gre noben mail" },
];

export const IZID_BESEDILO: Record<IzidKlica, string> = {
  sestanek: "sestanek",
  poslji_mail: "želijo mail",
  ni_dvignil: "ni dvignil",
  ne_zanima: "ne zanima",
  poklici_kasneje: "pokliči kasneje",
};

/**
 * Odgovori na zavrnitve po 3A: potrdi, poveži, vprašaj (Documents\HARVEY\pravila-pogovora.md, 28. 10. 2026).
 * »zakaj« (1. 11. 2026, po paketu Closer): da klicatelj ve, kaj odgovor naredi, in ga ne bere na pamet.
 * Besedilo »rece« Harvey uporablja za zadnji poskus (harvey/stevilke.py NE_ZDAJ): ne spreminjaj ga brez tam.
 */
export const ZAVRNITVE: { rece: string; odgovor: string; zakaj: string; izid?: string }[] = [
  {
    rece: "Imamo GPS.",
    odgovor:
      "Odlično, to pomeni, da varnost voznikov že jemljete resno. GPS pove, kje je vozilo. Kdo pa danes ukrepa, če voznik ponoči na parkirišču potrebuje pomoč?",
    zakaj: "Potrdiš, kar že imajo, in pokažeš vrzel: GPS vidi, ne ukrepa.",
  },
  {
    rece: "Tega nam po zakonu ni treba.",
    odgovor:
      "Imate prav, gumba zakon ne predpisuje. Predpisuje pa, da imate pisno oceno tveganja in ukrepe tudi za voznika na poti. Kako imate to danes napisano?",
    zakaj: "Daš jim prav, brez pretiravanja, in jim daš nasvet, ki jim koristi tudi brez nakupa.",
  },
  {
    rece: "Imamo zavarovanje.",
    odgovor:
      "Odlično, to je pametno. Zavarovanje plača škodo za nazaj. Kdo pa vozniku pomaga v tistih petih minutah, ko se dogaja?",
    zakaj: "Zavarovanje je za potem, gumb je za trenutek, ko se dogaja. Ne tekmuješ z njim.",
  },
  {
    rece: "Že imamo varnostno službo.",
    odgovor: "Odlično, potem že veste, da je to pomembno. Kaj bi si želeli, da pri vozniku na poti dela bolje?",
    zakaj: "Drugega ne kritiziraš. Poiščeš vrzel, ki jo že sami čutijo.",
  },
  {
    rece: "Nimamo časa.",
    odgovor: "Razumem, v prevozu je vedno veliko dela. Ravno zato traja samo 15 minut. Je lažje naslednji teden na Teams?",
    zakaj: "Zmanjšaš korak na 15 minut in ponudiš izbiro, ne pritiska.",
  },
  {
    rece: "Ni pravi čas, pokličite kasneje.",
    odgovor: "Seveda. Kdaj naj vas pokličem, da si zapišem? In kaj se mora zgoditi, da bo takrat pravi trenutek?",
    zakaj: "Preveriš, ali je čas res razlog, in dobiš datum. Harvey čez 60 dni sam predlaga zadnji klic.",
    izid: "Pokliči kasneje, vpiši datum",
  },
  {
    rece: "Pošljite na mail.",
    odgovor: "Seveda, z veseljem. Komu naj pošljem, da ne pristane med ostalimi?",
    zakaj: "Pogosto je to vljuden konec. Z imenom dobiš pravega človeka in mail ne obleži.",
    izid: "Pošljite na mail, vpiši ime in mail",
  },
  {
    rece: "Moram vprašati šefa.",
    odgovor: "Seveda, smiselno. Kaj mislite, kaj ga bo najprej zanimalo? Da mu pripravim točno to.",
    zakaj: "Pomagaš mu prodati naprej: pripraviš točno tisto, kar bo šef vprašal.",
  },
  {
    rece: "Koliko stane?",
    odgovor:
      "Odvisno od števila vozil, zato vam na pamet ne bi rekel napačne številke. Koliko vozil imate na poti? Na sestanku vam pokažem točno za vaš vozni park.",
    zakaj: "Brez številke na pamet. Vprašanje o vozilih te pelje do sestanka.",
  },
  {
    rece: "Ali to res deluje?",
    odgovor:
      "Dobro vprašanje. Zato predlagam, da začnete z dvema ali tremi vozili za en mesec, pa sami vidite, kako deluje pri vas.",
    zakaj: "Ne izmišljuješ rezultatov drugih. Ponudiš majhen prvi korak, ki ga lahko preverijo sami.",
  },
  {
    rece: "Bom premislil.",
    odgovor:
      "Seveda. Kaj je glavna stvar, o kateri razmišljate? … Hvala, to mi pomaga. Kaj bi moralo biti vključeno, da bi rekli da?",
    zakaj: "»Bom premislil« skriva eno pravo vprašanje. Boomerang: on pove, kaj manjka. Vprašaš enkrat, prijazno.",
  },
  {
    rece: "Ne rabimo.",
    odgovor:
      "V redu, hvala za iskren odgovor. Bi mi povedali, zakaj ne? … To mi zelo pomaga. Še eno vprašanje, če dovolite: kaj bi moralo biti, da bi si vzeli 15 minut?",
    zakaj:
      "Boomerang: »ne« je informacija, ne konec. Ne braniš se, on pove razlog in kaj manjka. Enkrat; če ponovi ne, je konec in ga ne kličemo več.",
    izid: "Ne zanima",
  },
  {
    rece: "Predrago.",
    odgovor:
      "Razumem. Kaj bi moralo biti vključeno, da bi se vam ta cena splačala? (Po telefonu cene ne poveš: »Odvisno od flote, zato je 15 minut v živo.«)",
    zakaj:
      "Ceno ne braniš, on pove, kaj manjka. Če reče »nič«, je to pravi cenovni ugovor: spoštuj ga in ponudi pilot na 2 do 3 vozilih.",
  },
];

/** »tor 4. 11.« iz »2026-11-04« (ali ISO časa); prazno, če datuma ni. */
export function datum(iso: string | null | undefined): string {
  const [l, m, d] = (iso ?? "").slice(0, 10).split("-");
  if (!d) return "";
  const dan = new Date(Number(l), Number(m) - 1, Number(d)).toLocaleDateString("sl-SI", { weekday: "short" });
  return `${dan} ${Number(d)}. ${Number(m)}.`;
}

/** Današnji datum v Ljubljani, »YYYY-MM-DD« (Harvey primerja dogovorjeni datum z lokalnim dnem). */
export function danesLj(zdaj = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Ljubljana" }).format(zdaj);
}

/** Datum v Ljubljani čez `dni` dni od danes, »YYYY-MM-DD«. */
function cezDni(dni: number, zdaj = new Date()): string {
  const [l, m, d] = danesLj(zdaj).split("-").map(Number);
  return new Date(Date.UTC(l, m - 1, d + dni)).toISOString().slice(0, 10);
}

/** Jutrišnji datum v Ljubljani: najzgodnejši dan za »Pokliči kasneje« (Harvey danes zavrne). */
export function jutriLj(zdaj = new Date()): string {
  return cezDni(1, zdaj);
}

/** Naslednji delavnik (pon–pet) v Ljubljani. */
export function naslednjiDelavnikLj(zdaj = new Date()): string {
  for (let i = 1; i < 8; i++) {
    const d = cezDni(i, zdaj);
    const dan = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dan !== 0 && dan !== 6) return d;
  }
  return cezDni(1, zdaj);
}

/** Dogovorjen sestanek (faza 4): »YYYY-MM-DD« ali »YYYY-MM-DD HH:MM« in kraj (naslov ali Teams). */
export type SestanekKlica = { sestanek_kdaj?: string; sestanek_kraj?: string };

/**
 * Datum »Pokliči kasneje« in podatki sestanka (faza 4). Harvey sprejme dogovor samo za dan po danes (lokalno), zato
 * ga zavrnemo že prej z jasnim sporočilom. Vrne napako ali očiščene vrednosti. Isto preverja obrazec in strežnik.
 */
export function preveriDogovorInSestanek(
  izid: IzidKlica,
  dogovor: string,
  sestanek: SestanekKlica,
): { napaka: string } | { dogovor: string; sestanek: SestanekKlica } {
  const d = dogovor.trim();
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { napaka: "Datum ni pravilen." };
  if (d && d <= danesLj()) return { napaka: "Datum klica mora biti jutri ali kasneje." };
  if (izid === "poklici_kasneje" && !d) return { napaka: "Vpiši, kdaj naj pokličeš." };

  const kdaj = (sestanek.sestanek_kdaj ?? "").trim();
  const kraj = (sestanek.sestanek_kraj ?? "").trim().slice(0, 200);
  if (izid === "sestanek") {
    if (!kdaj) return { napaka: "Vpiši datum sestanka." };
    if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(kdaj)) return { napaka: "Datum ali ura sestanka ni pravilna." };
    if (kdaj.slice(0, 10) < danesLj()) return { napaka: "Sestanek ne more biti v preteklosti." };
    return { dogovor: d, sestanek: { sestanek_kdaj: kdaj, sestanek_kraj: kraj } };
  }
  return { dogovor: d, sestanek: {} };
}
