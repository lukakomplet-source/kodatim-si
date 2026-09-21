/**
 * Vozni park Vojnik (Janoš) — program za vodenje voznega parka.
 *
 * Aplikacija je ena samostojna HTML datoteka (`public/vozni-park/app.html`) s
 * svojim Tailwindom in svojim stanjem v localStorage. Namenoma je NE prepisujem
 * v React: tu je zato, da je dosegljiva na kodatim.si/vozni-park in da jo lahko
 * skupaj urejava naprej. Iframe je tisto, kar jo pusti delovati nespremenjeno —
 * njeni CDN-ji, njen `window.onload` in njen localStorage ostanejo njeni.
 *
 * Ker gre za ločen dokument, je njegovo stanje vezano na izvor (kodatim.si),
 * ne na pot — kar je za enouporabniški program v redu, ob selitvi na pravo
 * bazo pa bo tako ali tako odpadlo.
 *
 * NOINDEX podeduje od (demo) layouta.
 */
export const metadata = { title: "Vozni park Vojnik — Janoš" };

export default function VozniParkPage() {
  return (
    <iframe
      src="/vozni-park/app.html"
      title="Upravljanje voznega parka — Vojnik"
      className="h-[100dvh] w-full border-0"
    />
  );
}
