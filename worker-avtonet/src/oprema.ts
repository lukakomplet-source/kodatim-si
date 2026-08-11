/**
 * Equipment: the axis the whole "which configuration sells fastest" question
 * turns on.
 *
 * Two representations are stored, on purpose:
 *
 *   kategorije   the source's own grouping, verbatim ("Varnost" -> ["LED
 *                žarometi", "sistem za ohranjanje voznega pasu", …]). Lossless.
 *                avto.net already groups equipment under headings, so this is
 *                read off the page rather than invented — and anything the site
 *                adds next month arrives on its own, with no code change.
 *
 *   znacilke     canonical slugs ("led", "lane_assist", "keyless") for the
 *                things worth filtering and comparing on.
 *
 * Keeping the verbatim form is what makes the catalogue below safe to improve:
 * a better pattern re-derives slugs for every advert already collected, with no
 * re-scrape. Storing only slugs would have thrown that away.
 *
 * A slug is asserted only when the source SAYS it. Nothing is inferred from a
 * model name or a trim level — "M Sport" does not imply adaptive cruise.
 */

export type Kategorija =
  | "podvozje"
  | "varnost"
  | "notranjost"
  | "udobje"
  | "multimedia"
  | "uporabnost"
  | "stanje"
  | "ostalo";

export type Znacilka = {
  slug: string;
  /** Slovenian label for the UI. */
  oznaka: string;
  kategorija: Kategorija;
  /** Matched against one equipment line, case-insensitively. */
  vzorec: RegExp;
};

/**
 * The catalogue.
 *
 * Every pattern here was written against equipment lines harvested from real
 * adverts (see `npm run dump:detail`), not from memory of what avto.net might
 * call things — the site writes "pomoč pri parkiranju: parkirna kamera", not
 * "camera", and a pattern guessed in English would match nothing at all.
 */
export const ZNACILKE: Znacilka[] = [
  // --- Podvozje / pogon -----------------------------------------------------
  { slug: "alu_platisca", oznaka: "ALU platišča", kategorija: "podvozje", vzorec: /ALU platiš|lahka - ALU/i },
  { slug: "stiri_kolesni_pogon", oznaka: "Štirikolesni pogon 4x4", kategorija: "podvozje", vzorec: /štirikolesni pogon|4x4|4WD|quattro|xDrive|4MOTION/i },
  { slug: "zracno_vzmetenje", oznaka: "Zračno vzmetenje", kategorija: "podvozje", vzorec: /zračno vzmetenje|pnevmatsko vzmetenje/i },
  { slug: "aktivno_vzmetenje", oznaka: "Aktivno vzmetenje", kategorija: "podvozje", vzorec: /aktivno vzmetenje|adaptivno vzmetenje/i },
  { slug: "esp", oznaka: "ESP", kategorija: "podvozje", vzorec: /\bESP\b/i },
  { slug: "abs", oznaka: "ABS", kategorija: "podvozje", vzorec: /\bABS\b/i },

  // --- Luči -----------------------------------------------------------------
  { slug: "led", oznaka: "LED žarometi", kategorija: "varnost", vzorec: /LED žarometi|LED luči|prednje \(dnevne\) LED/i },
  { slug: "matrix_led", oznaka: "Matrix LED", kategorija: "varnost", vzorec: /matrix/i },
  { slug: "laser_luci", oznaka: "Laserske luči", kategorija: "varnost", vzorec: /laser/i },
  { slug: "xenon", oznaka: "Xenon", kategorija: "varnost", vzorec: /xenon|bi-?xenon/i },
  { slug: "adaptive_light", oznaka: "Adaptivni žarometi", kategorija: "varnost", vzorec: /adaptive light|prilagodljivi žarometi|zavijalne luči/i },
  { slug: "samodejne_dolge_luci", oznaka: "Samodejne dolge luči", kategorija: "varnost", vzorec: /samodejno upravljanje dolgih luči/i },

  // --- Asistenca / varnost --------------------------------------------------
  { slug: "lane_assist", oznaka: "Ohranjanje voznega pasu", kategorija: "varnost", vzorec: /ohranjanje voznega pasu|opozorilnik spremembe voznega pasu|lane assist/i },
  { slug: "emergency_braking", oznaka: "Samodejno zaviranje v sili", kategorija: "varnost", vzorec: /samodejno zaviranje v sili/i },
  { slug: "blind_spot", oznaka: "Opozorilnik mrtvega kota", kategorija: "varnost", vzorec: /mrtvi kot|mrtvem kotu/i },
  { slug: "traffic_sign", oznaka: "Prepoznava prometnih znakov", kategorija: "varnost", vzorec: /prepoznav\w* prometnih znakov/i },
  { slug: "tlak_pnevmatik", oznaka: "Nadzor tlaka v pnevmatikah", kategorija: "varnost", vzorec: /zračnega tlaka v pnevmatikah/i },
  { slug: "senzor_dez", oznaka: "Senzor za dež", kategorija: "varnost", vzorec: /senzor za dež/i },
  { slug: "alarm", oznaka: "Alarmna naprava", kategorija: "varnost", vzorec: /alarmna naprava/i },
  { slug: "utrujenost", oznaka: "Zaznava utrujenosti", kategorija: "varnost", vzorec: /utrujenost/i },
  { slug: "nocni_vid", oznaka: "Nočni vid", kategorija: "varnost", vzorec: /nočni vid|night vision/i },

  // --- Tempomat -------------------------------------------------------------
  { slug: "acc", oznaka: "Aktivni tempomat (ACC)", kategorija: "udobje", vzorec: /aktivni tempomat|adaptivni tempomat|\bACC\b/i },
  { slug: "tempomat", oznaka: "Tempomat", kategorija: "udobje", vzorec: /tempomat/i },

  // --- Parkiranje -----------------------------------------------------------
  { slug: "kamera_360", oznaka: "360° kamera", kategorija: "uporabnost", vzorec: /360|kamere za vsestranski|vsestranski pogled/i },
  { slug: "kamera", oznaka: "Parkirna kamera", kategorija: "uporabnost", vzorec: /parkirna kamera|vzvratna kamera/i },
  { slug: "pdc_spredaj", oznaka: "Senzorji spredaj", kategorija: "uporabnost", vzorec: /parkiranju: prednji senzorji|prednji parkirni senzorji/i },
  { slug: "pdc_zadaj", oznaka: "Senzorji zadaj", kategorija: "uporabnost", vzorec: /parkiranju: zadnji senzorji|zadnji parkirni senzorji/i },
  { slug: "pdc", oznaka: "Parkirni senzorji (PDC)", kategorija: "uporabnost", vzorec: /PDC|Parktronic|pripomoček za parkiranje/i },
  { slug: "samodejno_parkiranje", oznaka: "Samodejno parkiranje", kategorija: "uporabnost", vzorec: /samodejno parkiranje|park assist|parkirni asistent/i },

  // --- Multimedia -----------------------------------------------------------
  { slug: "navigacija", oznaka: "Navigacija", kategorija: "multimedia", vzorec: /navigacijski sistem|navigacija/i },
  { slug: "apple_carplay", oznaka: "Apple CarPlay", kategorija: "multimedia", vzorec: /apple carplay/i },
  { slug: "android_auto", oznaka: "Android Auto", kategorija: "multimedia", vzorec: /android auto/i },
  { slug: "dab", oznaka: "DAB radio", kategorija: "multimedia", vzorec: /\bDAB\b|digitalni radio/i },
  { slug: "bluetooth", oznaka: "Bluetooth", kategorija: "multimedia", vzorec: /bluetooth/i },
  { slug: "touch_screen", oznaka: "Zaslon na dotik", kategorija: "multimedia", vzorec: /touch screen|zaslon na dotik/i },
  { slug: "hi_fi", oznaka: "Hi-Fi ozvočenje", kategorija: "multimedia", vzorec: /hi-?fi ozvočenje|harman|bose|bang & olufsen|burmester/i },
  { slug: "virtual_cockpit", oznaka: "Digitalni merilniki", kategorija: "multimedia", vzorec: /virtual cockpit|digitalni merilniki|digitalna instrumentna/i },
  { slug: "hud", oznaka: "Head-up zaslon", kategorija: "multimedia", vzorec: /head-?up|\bHUD\b/i },
  { slug: "brezzicno_polnjenje", oznaka: "Brezžično polnjenje", kategorija: "multimedia", vzorec: /brezžično polnjenje/i },

  // --- Notranjost -----------------------------------------------------------
  { slug: "usnje", oznaka: "Usnjena notranjost", kategorija: "notranjost", vzorec: /^usnje$|usnjena notranjost|usnjeni sedeži/i },
  { slug: "delno_usnje", oznaka: "Delno usnje", kategorija: "notranjost", vzorec: /delno usnje|usnje\/blago|alcantara/i },
  { slug: "sedezi_gretje", oznaka: "Gretje sedežev spredaj", kategorija: "notranjost", vzorec: /sedeži: gretje spredaj|gretje sedežev/i },
  { slug: "sedezi_gretje_zadaj", oznaka: "Gretje sedežev zadaj", kategorija: "notranjost", vzorec: /sedeži: gretje zadaj/i },
  { slug: "sedezi_hlajenje", oznaka: "Hlajenje sedežev", kategorija: "notranjost", vzorec: /hlajenje sedežev|prezračevani sedeži/i },
  { slug: "sedezi_el", oznaka: "Električni sedeži", kategorija: "notranjost", vzorec: /sedeži: el\.|električno nastavljivi sedeži/i },
  { slug: "sedezi_masaza", oznaka: "Masažni sedeži", kategorija: "notranjost", vzorec: /masaž/i },
  { slug: "memory", oznaka: "Memory funkcija", kategorija: "notranjost", vzorec: /memory|spomin nastavitev/i },
  { slug: "sportni_sedezi", oznaka: "Športni sedeži", kategorija: "notranjost", vzorec: /športni sedeži/i },
  { slug: "ambientna", oznaka: "Ambientna osvetlitev", kategorija: "notranjost", vzorec: /ambientna osvetlitev/i },

  // --- Udobje ---------------------------------------------------------------
  { slug: "klima_avtomatska", oznaka: "Avtomatska klima", kategorija: "udobje", vzorec: /klimatska naprava: avtomatska/i },
  { slug: "klima_veczonska", oznaka: "Večconska klima", kategorija: "udobje", vzorec: /klimatska naprava: \d ?consk/i },
  { slug: "klima", oznaka: "Klimatska naprava", kategorija: "udobje", vzorec: /klimatska naprava/i },
  { slug: "keyless", oznaka: "Keyless Go", kategorija: "udobje", vzorec: /keyless/i },
  { slug: "start_stop", oznaka: "Start-Stop", kategorija: "udobje", vzorec: /start-?stop/i },
  { slug: "el_prtljaznik", oznaka: "Električni prtljažnik", kategorija: "udobje", vzorec: /el\. zapiranje prtljažnika|električni prtljažnik/i },
  { slug: "el_parkirna_zavora", oznaka: "Električna parkirna zavora", kategorija: "udobje", vzorec: /el\. parkirna zavora/i },
  { slug: "ogrevano_vetrobransko", oznaka: "Ogrevano vetrobransko steklo", kategorija: "udobje", vzorec: /ogrevano vetrobransko/i },
  { slug: "tonirana_stekla", oznaka: "Tonirana stekla", kategorija: "udobje", vzorec: /zatemnjena \/ tonirana stekla|tonirana stekla/i },
  { slug: "obvolanske_rocice", oznaka: "Obvolanske ročice", kategorija: "udobje", vzorec: /obvolanski prestavni|F1 prestave/i },
  { slug: "usnjen_volan", oznaka: "Usnjen volan", kategorija: "udobje", vzorec: /volanski obroč oblečen v usnje/i },

  // --- Uporabnost / karoserija ---------------------------------------------
  { slug: "panorama", oznaka: "Panoramska streha", kategorija: "uporabnost", vzorec: /panoramsk/i },
  { slug: "streha", oznaka: "Pomično streho", kategorija: "uporabnost", vzorec: /pomična streha|sun ?roof|odpiranje strehe/i },
  { slug: "vlecna", oznaka: "Vlečna kljuka", kategorija: "uporabnost", vzorec: /vlečna kljuka|vlečno kljuko/i },
  { slug: "isofix", oznaka: "Isofix", kategorija: "uporabnost", vzorec: /isofix/i },
  { slug: "streha_nosilci", oznaka: "Strešni nosilci", kategorija: "uporabnost", vzorec: /strešni nosilci|strešna preč/i },

  // --- Stanje / zgodovina ---------------------------------------------------
  { slug: "servisna_knjiga", oznaka: "Servisna knjiga", kategorija: "stanje", vzorec: /servisna knjiga/i },
  { slug: "nekarambolirano", oznaka: "Nekarambolirano", kategorija: "stanje", vzorec: /ni bilo karamboliran/i },
  { slug: "garaziran", oznaka: "Garažiran", kategorija: "stanje", vzorec: /bilo garažiran/i },
  { slug: "prvi_lastnik", oznaka: "Prvi lastnik", kategorija: "stanje", vzorec: /^1\. lastnik|prvi lastnik/i },
  { slug: "garancija", oznaka: "Garancija", kategorija: "stanje", vzorec: /garancija/i },
  { slug: "slovensko_poreklo", oznaka: "Slovensko poreklo", kategorija: "stanje", vzorec: /slovensk\w* poreklo|slovensko vozilo/i },
];

/** Display labels, for the UI and for anything explaining a match. */
export const OZNAKE_ZNACILK: Record<string, string> = Object.fromEntries(
  ZNACILKE.map((z) => [z.slug, z.oznaka])
);

export const KATEGORIJE_ZNACILK: Record<string, Kategorija> = Object.fromEntries(
  ZNACILKE.map((z) => [z.slug, z.kategorija])
);

/** Slovenian names for the source's own headings, normalised to our category keys. */
const KATEGORIJA_IZ_NASLOVA: { vzorec: RegExp; kategorija: Kategorija }[] = [
  { vzorec: /^podvozje/i, kategorija: "podvozje" },
  { vzorec: /^varnost/i, kategorija: "varnost" },
  { vzorec: /^notranjost/i, kategorija: "notranjost" },
  { vzorec: /^udobje/i, kategorija: "udobje" },
  { vzorec: /^multimedia|^multimedija/i, kategorija: "multimedia" },
  { vzorec: /^uporabnost/i, kategorija: "uporabnost" },
  { vzorec: /^stanje/i, kategorija: "stanje" },
];

export function kategorijaIzNaslova(naslov: string): Kategorija {
  for (const k of KATEGORIJA_IZ_NASLOVA) if (k.vzorec.test(naslov)) return k.kategorija;
  return "ostalo";
}

/**
 * Canonical slugs for a set of equipment lines.
 *
 * Order matters for the few pairs where one pattern is a superset of another
 * ("klimatska naprava: avtomatska" also matches plain "klimatska naprava"), and
 * that is intentional: both slugs are asserted, because the plain one is still
 * true. Only the caller's display layer decides which to show.
 */
export function znacilkeIzVrstic(vrstice: string[]): string[] {
  const najdene = new Set<string>();
  for (const vrstica of vrstice) {
    for (const z of ZNACILKE) {
      if (z.vzorec.test(vrstica)) najdene.add(z.slug);
    }
  }
  return [...najdene].sort();
}
