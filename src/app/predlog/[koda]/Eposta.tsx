/**
 * E-poštni naslov kot besedilo, ki ga Cloudflare ne zamenja z »[email protected]«.
 *
 * Cloudflare (Email Address Obfuscation) na poti do obiskovalca prepiše vsak naslov
 * v HTML-ju; React v brskalniku nato izriše pravega in javi neujemanje (#418). Z
 * znakom @ v svojem elementu naslov ni več en kos besedila, ki bi ga Cloudflare
 * prepoznal, obiskovalec pa vidi isto kot prej.
 */
const NASLOV = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

/** Besedilo, v katerem so morebitni naslovi izrisani kot <Eposta> (npr. »pišete na info@…«). */
export function Tekst({ t }: { t: string }) {
  const deli = t.split(NASLOV);
  if (deli.length === 1) return <>{t}</>;
  return <>{deli.map((del, i) => (i % 2 === 1 ? <Eposta key={i} naslov={del} /> : del))}</>;
}

export function Eposta({ naslov }: { naslov: string }) {
  const [ime, domena] = naslov.split("@");
  if (!domena) return <>{naslov}</>;
  return (
    <>
      {ime}
      <span>@</span>
      {domena}
    </>
  );
}
