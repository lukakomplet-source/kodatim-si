import Link from "next/link";
import { zahtevajStran } from "@/lib/require-admin";
import { preberiPosiljanja } from "@/lib/prodajna-ekipa";
import { preberiStevilkeKompletkoTeden } from "@/lib/stevilke";
import { PosiljanjaPregled } from "./PosiljanjaPregled";

/**
 * Kompletko: hladni maili prevoznikom (Luka, 26. 10. 2026: »komu sem že poslal, komu še nisem, komu bi
 * še lahko poslal, katere je treba follow-upati, katere so že zaključene«). Podatke vodi Harvey Kompletko
 * iz predala luka@kompletko.com (harvey/posiljanja.py).
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Kompletko: prevozniki" };

export default async function KompletkoPage() {
  await zahtevajStran("kompletko.view");
  const [podatki, st] = await Promise.all([preberiPosiljanja(), preberiStevilkeKompletkoTeden(90)]);
  // Kampanja na kratko (3. 11. 2026): maili od začetka (vse variante), klici iz dnevnika zadnjih 90 dni
  const maili = st
    ? Object.values(st.variante).reduce((a, v) => ({ poslano: a.poslano + v.poslano, odgovori: a.odgovori + v.odgovori }), {
        poslano: 0,
        odgovori: 0,
      })
    : null;
  const kratko = st && maili
    ? [
        { ime: "Poslani maili", n: maili.poslano },
        { ime: "Odgovori", n: maili.odgovori },
        { ime: "Klici", n: st.obdobje.skupaj.klici },
        { ime: "Dvignjeni", n: st.obdobje.skupaj.dvignjeni },
        { ime: "Sestanki", n: st.obdobje.skupaj.sestanki },
        { ime: "Posli", n: st.obdobje.skupaj.posli },
      ]
    : null;
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/prodajna-ekipa" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Prodajna ekipa
      </Link>
      <h1 className="mt-1 text-3xl font-semibold text-zinc-900">Kompletko: prevozniki</h1>
      <p className="mt-2 text-base text-zinc-600">
        Komu je šel mail za panik gumb, kdo je odgovoril in komu je danes treba pisati ali ga poklicati. Poslani
        maili in odgovori se vpišejo sami iz predala luka@kompletko.com.
      </p>
      {kratko ? (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {kratko.map((x) => (
            <div key={x.ime} className="rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200">
              <div className="text-xl font-semibold tabular-nums text-zinc-900">{x.n}</div>
              <div className="text-xs text-zinc-500">{x.ime}</div>
            </div>
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-sm text-zinc-500">
        Podrobno:{" "}
        <Link href="/admin/stevilke" className="underline hover:text-zinc-900">
          Številke
        </Link>{" "}
        ·{" "}
        <Link href="/admin/komunikacija?posel=kompletko" className="underline hover:text-zinc-900">
          Komunikacija
        </Link>{" "}
        ·{" "}
        <Link href="/admin/danes" className="underline hover:text-zinc-900">
          Danes
        </Link>
      </p>
      {podatki === null ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          Harvey Kompletko ne odgovarja na 127.0.0.1:5556.
        </p>
      ) : (
        <PosiljanjaPregled podatki={podatki} />
      )}
    </div>
  );
}
