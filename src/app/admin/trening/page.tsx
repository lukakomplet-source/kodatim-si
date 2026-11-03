import Link from "next/link";
import { zahtevajStran } from "@/lib/require-admin";
import { getCurrentUserPermissions } from "@/lib/permissions/require-permission";
import { preberiTecaj, vBloke, type Blok } from "@/lib/tecaj";
import { preberiPersone, preberiVaje } from "@/lib/trening";
import { VajaKlica } from "./VajaKlica";

/**
 * Trening (3. 11. 2026). Luka: »izobraževanje do prodaje, do tistega, ko parkiram naročnino v žep«.
 * Tečaj: lekcije iz Documents\VIDEO-UCENJE\TECAJ-PANIK (vsaka z virom). Vaja klica: Harvey Kompletko igra izmišljenega
 * prevoznika. Moje vaje: ocene; administrator vidi vse. Zapora kompletko.view (kot zavihek v admin-meni.ts).
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Trening klica" };

const DELI = [
  { kljuc: "tecaj", ime: "Tečaj" },
  { kljuc: "vaja", ime: "Vaja klica" },
  { kljuc: "vaje", ime: "Moje vaje" },
] as const;

function Vrstica({ besedilo }: { besedilo: string }) {
  const deli = besedilo.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {deli.map((d, i) =>
        d.startsWith("**") ? (
          <strong key={i} className="font-semibold text-zinc-900">
            {d.slice(2, -2)}
          </strong>
        ) : d.startsWith("`") ? (
          <span key={i} className="rounded bg-zinc-100 px-1 text-[0.95em]">
            {d.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{d}</span>
        ),
      )}
    </>
  );
}

function Bloki({ bloki }: { bloki: Blok[] }) {
  return (
    <div className="space-y-3 text-[15px] leading-7 text-zinc-700">
      {bloki.map((b, i) => {
        if (b.vrsta === "naslov") {
          return b.raven === 1 ? (
            <h2 key={i} className="text-2xl font-semibold text-zinc-900">
              <Vrstica besedilo={b.besedilo} />
            </h2>
          ) : (
            <h3 key={i} className="pt-2 text-base font-semibold text-zinc-900">
              <Vrstica besedilo={b.besedilo} />
            </h3>
          );
        }
        if (b.vrsta === "seznam") {
          const Oznaka = b.urejen ? "ol" : "ul";
          return (
            <Oznaka key={i} className={`space-y-1.5 pl-5 ${b.urejen ? "list-decimal" : "list-disc"}`}>
              {b.tocke.map((t, j) => (
                <li key={j}>
                  <Vrstica besedilo={t} />
                </li>
              ))}
            </Oznaka>
          );
        }
        if (b.vrsta === "tabela") {
          const [glava, ...telo] = b.vrstice;
          return (
            <div key={i} className="overflow-x-auto rounded-xl ring-1 ring-zinc-200">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-zinc-500">
                  <tr>
                    {glava.map((c, j) => (
                      <th key={j} className="px-3 py-2 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {telo.map((v, j) => (
                    <tr key={j} className="border-t border-zinc-100">
                      {v.map((c, k) => (
                        <td key={k} className="px-3 py-2">
                          <Vrstica besedilo={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={i}>
            <Vrstica besedilo={b.besedilo} />
          </p>
        );
      })}
    </div>
  );
}

export default async function TreningPage({
  searchParams,
}: {
  searchParams: Promise<{ del?: string; lekcija?: string }>;
}) {
  const user = await zahtevajStran("kompletko.view");
  const { del: izbranDel, lekcija } = await searchParams;
  const del = DELI.some((d) => d.kljuc === izbranDel) ? izbranDel : "tecaj";
  const perms = await getCurrentUserPermissions();
  const jeAdmin = !!perms && !perms.neaktiven && perms.bypassAll;

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-semibold text-zinc-900">Trening klica</h1>
      <p className="mt-2 text-base text-zinc-500">
        Od prvega klica do podpisane naročnine za panik gumb. Prevozniki v vaji so izmišljeni; shrani se samo besedilo
        ocenjene vaje, nikoli zvok.
      </p>
      <nav className="mt-6 flex gap-1 border-b border-zinc-200">
        {DELI.map((d) => (
          <Link
            key={d.kljuc}
            href={`/admin/trening?del=${d.kljuc}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              del === d.kljuc ? "border-zinc-900 font-medium text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {d.ime}
          </Link>
        ))}
      </nav>
      <div className="mt-6">
        {del === "tecaj" ? <Tecaj lekcija={lekcija} /> : null}
        {del === "vaja" ? <Vaja /> : null}
        {del === "vaje" ? <MojeVaje kdo={jeAdmin ? "" : (user.email ?? "")} jeAdmin={jeAdmin} /> : null}
      </div>
    </div>
  );
}

async function Tecaj({ lekcija }: { lekcija?: string }) {
  const lekcije = await preberiTecaj();
  if (!lekcije?.length) {
    return <p className="text-sm text-zinc-500">Lekcij še ni (mapa Documents\VIDEO-UCENJE\TECAJ-PANIK).</p>;
  }
  const izbrana = lekcije.find((l) => l.kljuc === lekcija) ?? lekcije[0];
  const i = lekcije.indexOf(izbrana);
  return (
    <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
      <ol className="space-y-0.5 text-sm">
        {lekcije.map((l) => (
          <li key={l.kljuc}>
            <Link
              href={`/admin/trening?del=tecaj&lekcija=${l.kljuc}`}
              className={`block rounded-lg px-2 py-1.5 ${
                l === izbrana ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {l.naslov.replace(/^\d\d\s+/, "")}
            </Link>
          </li>
        ))}
      </ol>
      <article>
        <Bloki bloki={vBloke(izbrana.besedilo)} />
        <div className="mt-8 flex justify-between text-sm">
          {i > 0 ? (
            <Link href={`/admin/trening?del=tecaj&lekcija=${lekcije[i - 1].kljuc}`} className="text-zinc-500 hover:text-zinc-900">
              Prejšnja lekcija
            </Link>
          ) : (
            <span />
          )}
          {i < lekcije.length - 1 ? (
            <Link href={`/admin/trening?del=tecaj&lekcija=${lekcije[i + 1].kljuc}`} className="text-zinc-900 underline">
              Naslednja lekcija
            </Link>
          ) : (
            <Link href="/admin/trening?del=vaja" className="text-zinc-900 underline">
              Na vajo klica
            </Link>
          )}
        </div>
      </article>
    </div>
  );
}

async function Vaja() {
  const persone = await preberiPersone();
  if (!persone) {
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
        Harvey Kompletko ne odgovarja na 127.0.0.1:5556.
      </p>
    );
  }
  return (
    <>
      <p className="mb-4 text-sm text-zinc-500">
        Izberi prevoznika. Govori v mikrofon (Chrome) ali tipkaj. Odgovor pride v okoli 10 sekundah. Ko končaš, klikni
        »Končaj in oceni«.
      </p>
      <VajaKlica persone={persone} />
    </>
  );
}

async function MojeVaje({ kdo, jeAdmin }: { kdo: string; jeAdmin: boolean }) {
  const p = await preberiVaje(kdo);
  if (!p) {
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
        Harvey Kompletko ne odgovarja na 127.0.0.1:5556.
      </p>
    );
  }
  if (!p.vaje.length) return <p className="text-sm text-zinc-500">Še nobene ocenjene vaje v zadnjih 30 dneh.</p>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {Object.entries(p.po_osebi).map(([oseba, s]) => (
          <div key={oseba} className="rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200">
            <div className="text-sm text-zinc-500">{jeAdmin ? oseba : "Ta teden"}</div>
            <div className="text-lg font-semibold text-zinc-900">
              {s.vaj} vaj, povprečje {s.povprecje ?? "–"}
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-zinc-200">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr className="border-b border-zinc-200">
              <th className="px-3 py-2 font-medium">Kdaj</th>
              {jeAdmin ? <th className="px-3 py-2 font-medium">Kdo</th> : null}
              <th className="px-3 py-2 font-medium">Vloga</th>
              <th className="px-3 py-2 font-medium">Ocena</th>
              <th className="px-3 py-2 font-medium">Naslednjič</th>
            </tr>
          </thead>
          <tbody>
            {p.vaje.map((v) => (
              <tr key={v.id} className="border-b border-zinc-100 last:border-0 align-top">
                <td className="px-3 py-2 whitespace-nowrap text-zinc-500">
                  {new Date(v.cas.replace(" ", "T") + "Z").toLocaleString("sl-SI", { dateStyle: "short", timeStyle: "short" })}
                </td>
                {jeAdmin ? <td className="px-3 py-2 text-zinc-600">{v.kdo || "–"}</td> : null}
                <td className="px-3 py-2 text-zinc-800">{v.ime}</td>
                <td className="px-3 py-2 tabular-nums">{v.ocena}</td>
                <td className="px-3 py-2 text-zinc-600">{v.popravek}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
