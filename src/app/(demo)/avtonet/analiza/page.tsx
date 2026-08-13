import Link from "next/link";
import { ChevronRight, Database, Flame, Info } from "lucide-react";
import { createAvtonetClient } from "@/lib/avtonet/db";
import {
  MIN_VZOREC,
  OBDOBJA,
  eur,
  mejaObdobja,
  obdobjeDni,
  statistikaPoModelih,
  type ZakljucenOglas,
} from "@/lib/avtonet/analiza";
import { KakoDeluje } from "../KakoDeluje";

/**
 * Analiza trga — how quickly cars leave the Slovenian advertising board.
 *
 * The wording is load-bearing. We measure "time on the board" and "left the
 * board", never "sold": the source marks only some adverts as sold, and a
 * withdrawn advert is indistinguishable from a sale. Calling a disappearance a
 * sale would be the single easiest way to make this page confidently wrong in
 * front of a client.
 */

export const revalidate = 300;

export default async function AnalizaPage({
  searchParams,
}: {
  searchParams: Promise<{ obdobje?: string; znamka?: string }>;
}) {
  const { obdobje, znamka } = await searchParams;
  const dni = obdobjeDni(obdobje);
  const db = createAvtonetClient();

  const od = mejaObdobja(dni);

  let q = db
    .from("avtonet_oglasi")
    .select("znamka, model, first_seen, status, status_spremenjen, cena_eur, cena_prvotna_eur, km, letnik, je_dealer")
    .in("status", ["izginil", "prodano"])
    .not("status_spremenjen", "is", null)
    .gte("status_spremenjen", od)
    .limit(20_000);
  if (znamka) q = q.ilike("znamka", znamka);

  const { data, error } = await q;

  if (error?.code === "PGRST205") {
    return (
      <Ovoj>
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Baza še ni pripravljena — poženite <code>supabase/migration_avtonet.sql</code>.
        </p>
      </Ovoj>
    );
  }

  const vrstice = (data ?? []) as unknown as ZakljucenOglas[];
  const lestvica = statistikaPoModelih(vrstice);

  const { data: znamkeRaw } = await db
    .from("avtonet_oglasi")
    .select("znamka")
    .not("znamka", "is", null)
    .limit(5000);
  const znamke = [
    ...new Set(((znamkeRaw ?? []) as { znamka: string }[]).map((z) => z.znamka)),
  ].sort((a, b) => a.localeCompare(b, "sl"));

  return (
    <Ovoj>
      <form className="mt-6 flex flex-wrap items-center gap-2">
        {OBDOBJA.map((o) => {
          const aktiven = (obdobje ?? "90") === o.kljuc;
          return (
            <Link
              key={o.kljuc}
              href={{ pathname: "/avtonet/analiza", query: { obdobje: o.kljuc, ...(znamka ? { znamka } : {}) } }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                aktiven
                  ? "bg-accent text-white"
                  : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {o.oznaka}
            </Link>
          );
        })}

        <span className="mx-1 h-5 w-px bg-zinc-200" />

        <select
          name="znamka"
          defaultValue={znamka ?? ""}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700"
        >
          <option value="">Vse znamke</option>
          {znamke.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <input type="hidden" name="obdobje" value={obdobje ?? "90"} />
        <button
          type="submit"
          className="rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
        >
          Uporabi
        </button>
      </form>

      {lestvica.length === 0 ? (
        <Prazno vzorcev={vrstice.length} />
      ) : (
        <>
          <h2 className="mt-8 flex items-center gap-2 text-lg font-semibold text-zinc-900">
            <Flame className="h-5 w-5 text-accent" />
            Najhitreje prodani modeli
          </h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Model</th>
                  <th className="px-4 py-3 text-right font-semibold">Mediana dni</th>
                  <th className="px-4 py-3 text-right font-semibold">≤ 7 dni</th>
                  <th className="px-4 py-3 text-right font-semibold">≤ 14 dni</th>
                  <th className="px-4 py-3 text-right font-semibold">Prodanih</th>
                  <th className="px-4 py-3 text-right font-semibold">Povp. začetna cena</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {lestvica.map((m, i) => (
                  <tr key={m.kljuc} className="group transition hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-400 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/avtonet/analiza/${encodeURIComponent(m.kljuc)}?obdobje=${obdobje ?? "90"}`}
                        className="font-medium text-zinc-900 group-hover:text-accent"
                      >
                        {m.kljuc}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-zinc-900">
                      {m.medianaDni}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-600">{m.delez7} %</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-600">{m.delez14} %</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-500">
                      {m.vzorec}
                      <span className="ml-1 text-[11px] text-zinc-400">
                        ({m.potrjenih} potrj. + {m.verjetnih} verj.)
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                      {eur(m.povprecnaZacetnaCena)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/avtonet/analiza/${encodeURIComponent(m.kljuc)}?obdobje=${obdobje ?? "90"}`}
                        className="inline-flex text-zinc-300 transition group-hover:text-accent"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 flex items-start gap-2 text-xs text-zinc-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Prikazani so samo modeli z vsaj {MIN_VZOREC} zaključenimi oglasi v izbranem obdobju. Pod tem
            pragom je mediana šum, ki izgleda kot vpogled.
          </p>
        </>
      )}
    </Ovoj>
  );
}

function Ovoj({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
        Kateri avtomobili se najbolje prodajajo?
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] text-zinc-500">
        Analiza zgodovine oglasov na slovenskem trgu. Merimo, koliko dni je oglas na oglasniku in kdaj
        z njega izgine. Vir sam ne pove, ali je bil avto prodan ali le umaknjen — zato prodajo ocenimo
        iz cene in hitrosti izginotja.
      </p>

      <KakoDeluje
        odprto
        naslov="Kako nastane ta lestvica"
        uvod={
          <>
            Vsak pregled trga zapiše, kateri oglasi so trenutno na Avto.netu. Ko oglas ob naslednjem
            popolnem pregledu izgine, izračunamo, koliko dni je bil zgoraj. Lestvica je mediana teh
            dni po modelih.
          </>
        }
        koraki={[
          {
            naslov: "Kaj se zabeleži ob prvem srečanju",
            besedilo: (
              <>
                Ko oglas prvič vidimo, shranimo <code>first_seen</code> (datum in ura) ter takratno
                ceno kot <em>prvo videno ceno</em>. Ta dva podatka se pozneje nikoli ne prepišeta —
                zato je iz njiju mogoče računati.
              </>
            ),
          },
          {
            naslov: "Kaj se posodablja ob vsakem naslednjem pregledu",
            besedilo: (
              <>
                Osveži se <code>last_seen</code>, trenutna cena in kilometri. Vsak pregled zapiše tudi
                svoj posnetek oglasa, tako da je zgodovina cene shranjena in ne le zadnje stanje.
              </>
            ),
          },
          {
            naslov: "Kdaj oglas velja za izginulega",
            besedilo: (
              <>
                Samo takrat, ko je bil pregled <strong>popoln čez vse rezine trga</strong>. Takrat
                oglasom, ki jih ni bilo več, zapišemo status <code>izginil</code> in čas te ugotovitve.
                Če je bil pregled kjerkoli nepopoln, se ne označi nič.
              </>
            ),
          },
          {
            naslov: "Kako se izračuna število dni",
            besedilo: (
              <>
                Dnevi na oglasniku = čas izginotja − <code>first_seen</code>. V lestvico gredo samo
                oglasi, ki so oglasnik že zapustili; aktivni oglasi na mediano ne vplivajo.
              </>
            ),
          },
          {
            naslov: "Kaj vidiš v tabeli",
            besedilo: (
              <>
                <strong>Mediana dni</strong> je sredinska vrednost (polovica oglasov je šla hitreje,
                polovica počasneje) — ne povprečje, ker enega samega dolgega oglasa ne sme potegniti
                navzgor. <strong>≤ 7 in ≤ 14 dni</strong> sta deleža oglasov, ki so izginili v tem
                času. <strong>Prodanih</strong> je število zaključenih oglasov (v oklepaju: koliko jih
                je vir izrecno označil za prodane in koliko jih je po ceni in hitrosti izginotja
                <em>verjetno</em> prodanih).
              </>
            ),
          },
          {
            naslov: "Kam gre naprej",
            besedilo: (
              <>
                Klik na vrstico odpre model s porazdelitvijo, trendom po mesecih in cenami. Iz Baze
                oglasov lahko vsak posamezen oglas odpreš pri viru in številko preveriš.
              </>
            ),
          },
        ]}
        omejitve={[
          <>
            <strong>„Verjetno prodan&ldquo; je ocena, ne dejstvo.</strong> Vir izrecno potrdi le del
            prodaj; za ostale sklepamo iz cene in hitrosti izginotja. Poceni avto, ki hitro izgine, je
            skoraj zagotovo prodan; dolgo objavljen ali predrag oglas je bolj verjetno umaknjen ali
            potekel. Zanesljivo prodane in ocenjene ločimo v oklepaju stolpca <em>Prodanih</em>.
          </>,
          <>
            <strong>Modeli se združujejo samo po znamki in modelu.</strong> BMW X5 za 20.000 € in za
            70.000 € sta trenutno v istem povprečju — letnik, kilometri, cena in oprema pri
            razvrščanju v skupine še niso upoštevani.
          </>,
          <>
            <strong>Natančnost je odvisna od pogostosti pregledov.</strong> Zabeleži se čas, ko smo
            izginotje <em>opazili</em>, ne čas, ko se je zgodilo. Ob treh pregledih dnevno je
            ločljivost nekaj ur; če zbiralnik dva dni ne teče, bo oglas videti za toliko daljši.
          </>,
          <>
            Prikazani so samo modeli z vsaj {MIN_VZOREC} zaključenimi oglasi. Pod tem pragom je
            mediana šum, ki izgleda kot vpogled.
          </>,
        ]}
      />

      {children}
    </div>
  );
}

/**
 * The honest empty state, and it will be what shows for weeks.
 *
 * The statistic needs adverts that have LEFT the board, and a listing only
 * leaves once a completed sweep confirms it is gone. So the page cannot have
 * numbers before the collector has run full sweeps for a while — and saying that
 * plainly is better than an empty table that reads like a bug.
 */
function Prazno({ vzorcev }: { vzorcev: number }) {
  return (
    <div className="mt-8 rounded-2xl border border-zinc-200 bg-white px-6 py-14 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <Database className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-zinc-900">Zbiramo podatke o slovenskem trgu</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-500">
        Ko bo zbranih dovolj zgodovinskih podatkov, bo analiza na voljo. Mediano dni na oglasu je mogoče
        izračunati šele iz oglasov, ki so oglasnik zapustili, in za zanesljivost potrebujemo vsaj{" "}
        {MIN_VZOREC} takih na model.
      </p>
      <p className="mx-auto mt-3 max-w-lg text-xs text-zinc-400">
        {vzorcev === 0
          ? "Trenutno noben oglas še ni zapustil oglasnika — vsi zbrani so še aktivni."
          : `Zaključenih oglasov v izbranem obdobju: ${vzorcev}. Nobenega modela še ni nad pragom.`}
      </p>
    </div>
  );
}
