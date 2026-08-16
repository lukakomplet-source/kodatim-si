import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { ArrowLeft, ExternalLink, HelpCircle, TrendingDown } from "lucide-react";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { naslovVozila, povzetekFiltra, type Spremljanje } from "@/lib/avtonet/spremljanja";
import { jeNov, najdiUjemanja, prodajalecNeznan } from "@/lib/avtonet/ujemanje";
import { eur } from "@/lib/avtonet/analiza";
import { primerjaj, razvrstitevIzParam } from "@/lib/avtonet/razvrscanje";
import { OznaciVideno } from "./OznaciVideno";
import { RazvrstiIzbira } from "../../RazvrstiIzbira";
import { KakoDeluje } from "../../KakoDeluje";

/**
 * The listings behind one spremljanje.
 *
 * "New" is measured against when the user last opened this page, not against
 * whether an email went out — the two are different facts, and the badge is
 * about what the person has seen.
 */

export const dynamic = "force-dynamic";

export default async function SpremljanjePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const razvrstitev = razvrstitevIzParam((await searchParams).razvrsti);
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa(`/avtonet/spremljanje/${id}`));

  const db = createAvtonetClient();

  const { data, error } = await db.from("avtonet_iskanja").select("*").eq("id", id).maybeSingle();
  if (error?.code === "PGRST205" || !data) notFound();

  const s = data as unknown as Spremljanje;

  // Someone else's watch is not merely hidden from the list — it is not
  // readable by id either. `notFound` rather than a refusal, so the page does
  // not confirm that the id exists.
  const lastnik = (data as unknown as { created_by: string | null }).created_by;
  if (!dostop.jeAdmin && lastnik !== dostop.userId) notFound();

  const najdeni = await najdiUjemanja(db, s, 200);
  // Sorted here rather than in the query: the matcher already returns the whole
  // (capped) set, so re-ordering it costs nothing and keeps the cap meaning
  // "the 200 newest matches" regardless of how they are then displayed.
  const oglasi = [...najdeni].sort(primerjaj(razvrstitev));
  const novih = oglasi.filter((o) => jeNov(o, s.zadnji_ogled)).length;
  const neznanih = oglasi.filter(prodajalecNeznan).length;

  return (
    <div>
      <Link
        href="/avtonet"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Moja spremljanja
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">{naslovVozila(s)}</h1>
          <p className="mt-1.5 text-sm text-zinc-600">{povzetekFiltra(s)}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {oglasi.length} ustreznih oglasov
            {novih > 0 && <span className="text-accent"> · {novih} novih od zadnjega ogleda</span>}
          </p>
        </div>
        {novih > 0 && <OznaciVideno id={s.id} />}
      </header>

      <KakoDeluje
        naslov="Kaj je na tem seznamu"
        uvod={
          <>
            Vsi <strong>trenutno aktivni</strong> oglasi, ki ustrezajo pogojem tega spremljanja.
            Oglasi, ki so oglasnik že zapustili, se tu ne prikazujejo — ta seznam odgovarja na
            vprašanje „kaj lahko zdaj kupim“.
          </>
        }
        koraki={[
          {
            naslov: "Oznaka NOVO",
            besedilo: (
              <>
                Oglas smo prvič videli po tem, ko si to spremljanje nazadnje odprl. Ni nujno, da je
                bil oglas objavljen ravno takrat — je pa nov <em>za nas in zate</em>.
              </>
            ),
          },
          {
            naslov: "Prečrtana cena",
            besedilo: <>Trenutna cena je nižja od tiste, ki smo jo pri tem oglasu videli prvič.</>,
          },
          {
            naslov: "Vrstica o prodajalcu",
            besedilo: (
              <>
                „avtohiša“ ali „fizična oseba“ zapišemo le, če je bilo to razvidno s strani oglasa.
                Sicer piše „prodajalec ni znan“ — kar pomeni, da še nismo odprli strani ali da podatka
                ni bilo.
              </>
            ),
          },
          {
            naslov: "Kam gre naprej",
            besedilo: (
              <>
                Klik na oglas odpre izvirni oglas na Avto.netu. „Označi kot pregledano“ počisti značko
                novih na prejšnji strani.
              </>
            ),
          },
        ]}
        omejitve={[
          <>
            Seznam je posnetek zadnjega pregleda. Oglas je lahko medtem izginil, kot je lahko nov
            oglas že objavljen, mi pa ga bomo videli šele ob naslednjem pregledu.
          </>,
          <>Prikazanih je največ 200 najnovejših zadetkov.</>,
        ]}
      />

      {s.prodajalec_filter !== "vsi" && neznanih > 0 && (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Pri {neznanih} oglasih vrsta prodajalca še ni znana — na seznamu oglasov ni objavljena.
          Nismo jih izpustili, ampak so označeni; preverite v oglasu.
        </p>
      )}

      {oglasi.length > 1 && (
        <div className="mt-5 flex justify-end">
          <RazvrstiIzbira />
        </div>
      )}

      {oglasi.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-zinc-900">Trenutno ni nobenega ustreznega oglasa</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-500">
            Spremljanje ostaja aktivno. Ko se pojavi oglas, ki ustreza pogojem, se bo pojavil tukaj —
            in poslali vam bomo obvestilo, če ste vpisali e-naslov.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          {oglasi.map((o) => {
            const nov = jeNov(o, s.zadnji_ogled);
            const znizano =
              o.cena_prvotna_eur !== null && o.cena_eur !== null && o.cena_eur < o.cena_prvotna_eur;
            return (
              <a
                key={o.id}
                href={o.url}
                target="_blank"
                rel="noreferrer"
                className={`block rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
                  nov ? "border-accent/40 ring-1 ring-accent/20" : "border-zinc-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      {nov && (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Novo
                        </span>
                      )}
                      <span className="truncate text-[15px] font-semibold text-zinc-900">
                        {o.naziv ?? o.avtonet_id}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span>{o.letnik ?? "letnik ?"}</span>
                      <span>{o.km === null ? "km ?" : `${o.km.toLocaleString("sl-SI")} km`}</span>
                      <span>{o.km_moci === null ? "moč ?" : `${o.km_moci} KM`}</span>
                      {o.gorivo && <span>{o.gorivo}</span>}
                      {o.menjalnik && <span>{o.menjalnik}</span>}
                      {o.lokacija && <span>{o.lokacija}</span>}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {o.je_dealer === true
                        ? (o.prodajalec_naziv ?? "avtohiša")
                        : o.je_dealer === false
                          ? (o.prodajalec_naziv ?? "fizična oseba")
                          : "prodajalec ni znan"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-semibold text-zinc-900">{eur(o.cena_eur)}</p>
                    {znizano && (
                      <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-amber-600">
                        <TrendingDown className="h-3.5 w-3.5" />
                        <span className="line-through">{eur(o.cena_prvotna_eur)}</span>
                      </p>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
