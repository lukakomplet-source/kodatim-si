/**
 * Presečni datum tržnega merjenja — en sam kraj, kjer ta datum živi.
 *
 * Zakaj obstaja: `first_seen` pove samo, kdaj smo oglas videli MI. Ob prižigu
 * zbiralnika smo naenkrat "zagledali" 53.650 oglasov, ki so bili na trgu že
 * mesece ali leta. Če takemu oglasu čez teden dni izmerimo "9 dni na trgu", to
 * ni meritev, ampak izmišljotina — 83 % vseh dosedanjih izginotij je bilo prav
 * takih.
 *
 * Presek je 15. 08. 2026, ker se je prvi POPOLN pregled trga končal 14. 08.
 * dopoldne (53.650 oglasov). Vsak oglas, ki se je prvič pojavil po tem, je
 * resnično nov: njegov vstop na trg poznamo na pol dneva natančno.
 *
 * Datum je namenoma nastavljiv prek okolja, a ga ne spreminjaj brez razloga —
 * premik nazaj bi v čisto statistiko spustil oglase z neznanim vstopom.
 */
export const TRG_PRESEK = new Date(
  process.env.AVTONET_TRG_PRESEK ?? "2026-08-15T00:00:00+02:00"
);

/**
 * Ali za oglas, ki smo ga prvič videli ob tem času, zanesljivo vemo, kdaj je
 * prišel na trg.
 */
export function vstopZnan(prvicVideno: Date | string): boolean {
  const t = typeof prvicVideno === "string" ? new Date(prvicVideno) : prvicVideno;
  return t.getTime() >= TRG_PRESEK.getTime();
}
