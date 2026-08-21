/**
 * KDO SMO, KO POTRKAMO.
 *
 * Doslej je bil User-Agent na treh mestih prepisan v
 * "Mozilla/5.0 … Chrome/124.0.0.0 Safari/537.36", medtem ko je proces v
 * resnici tekel headless. Playwright sam se predstavi kot "HeadlessChrome";
 * prepis je torej odstranil natanko tisto besedo, ki pove, da gre za
 * avtomatiziran obisk. To ni podrobnost o zmogljivosti — je prikrivanje
 * narave obiska.
 *
 * Radware, ki ščiti bolha.com, med svojimi signali navaja "HTTP Header
 * Integrity" in "Browser Integrity Check", torej iskanje neskladja med tem,
 * kar odjemalec o sebi trdi, in tem, kar dejansko je. Naš prepis je bil zato
 * hkrati naš največji sprožilec IN naša največja neresnica.
 *
 * PRIVZETO SE ZATO PREDSTAVIMO POŠTENO. Kaj to stane, je treba povedati brez
 * olepševanja: iskren zbiralnik ni samodejno dobrodošel zbiralnik. Izmerjeno
 * je, da Radware blokira tudi odjemalce z iskreno deklaracijo, dokler jih
 * lastnik strani ne uvrsti na dovoljeni seznam. Iskrenost torej ne odpre
 * vrat — odpre pa pogovor, ker je z njo mogoče prositi za dovoljenje, ne da
 * bi se pri tem lagalo.
 *
 * `NEP_UA` v okolju vrednost povozi. Kdor se odloči drugače, naj to stori
 * zavestno in na enem mestu, ne s tremi razpršenimi nizi v kodi.
 */

/** Iskrena identiteta: kdo smo, čigav je robot, kje o njem pisati. */
export const ISKREN_UA = "KodaTimBot/1.0 (+https://kodatim.si; zbiralnik nepremicninskih oglasov)";

/**
 * Prepis brskalnikove identitete, ki prikrije, da gre za robota. Ostaja v
 * kodi zato, ker je odločitev uporabnikova in mora biti vidna — ne zato, ker
 * bi bila priporočena.
 */
export const PRIKRIT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function uporabniskiAgent(): string {
  const izOkolja = process.env.NEP_UA?.trim();
  if (izOkolja) return izOkolja;
  return process.env.NEP_PRIKRIJ_ROBOTA === "1" ? PRIKRIT_UA : ISKREN_UA;
}

/** Ali se trenutno predstavljamo pošteno — za izpis v dnevniku in konzoli. */
export function seIskrenoPredstavljamo(): boolean {
  return uporabniskiAgent() === ISKREN_UA;
}
