import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { createAvtonetClient } from "@/lib/avtonet/db";
import {
  MIN_VZOREC,
  eur,
  mejaObdobja,
  modelKljuc,
  obdobjeDni,
  podrobnostiModela,
  segmentiModela,
  type ZakljucenOglas,
} from "@/lib/avtonet/analiza";
import { GrafPorazdelitve, GrafTrenda } from "../Grafi";
import { KakoDeluje } from "../../KakoDeluje";

/**
 * One model's history on the board.
 *
 * The four headline numbers are the ones a person actually asks: how long does
 * this car sit, how often does it go fast, on how much evidence, and at what
 * asking price. The sample size is shown next to the numbers rather than in a
 * footnote, because a median over 21 adverts and one over 400 are different
 * claims and the reader deserves to know which they are looking at.
 */

export const revalidate = 300;

export default async function ModelPage({
  params,
  searchParams,
}: {
  params: Promise<{ model: string }>;
  searchParams: Promise<{ obdobje?: string }>;
}) {
  const { model } = await params;
  const { obdobje } = await searchParams;
  const kljuc = decodeURIComponent(model);
  const dni = obdobjeDni(obdobje);

  const db = createAvtonetClient();
  const od = mejaObdobja(dni);

  // The key is "znamka model" and the brand is the first word, so the query
  // filters on the brand and the exact key is matched in memory. Filtering on a
  // concatenation is not something the API can express.
  const znamka = kljuc.split(" ")[0];

  const { data } = await db
    .from("avtonet_oglasi")
    .select(
      "znamka, model, first_seen, status, status_spremenjen, cena_eur, cena_prvotna_eur, km, letnik, je_dealer, " +
      "vstop_znan, vstop_na_trg, " +
        "source_zadnja_sprememba, naslednji_oglas_id, vrnjen_krat"
    )
    .in("status", ["izginil", "prodano"])
    .not("status_spremenjen", "is", null)
    .gte("status_spremenjen", od)
    .ilike("znamka", znamka)
    .limit(5000);

  const vrstice = ((data ?? []) as unknown as ZakljucenOglas[]).filter((r) => modelKljuc(r) === kljuc);
  const s = podrobnostiModela(vrstice);
  const segmenti = segmentiModela(vrstice);

  return (
    <div>
      <Link
        href={`/avtonet/analiza?obdobje=${obdobje ?? "90"}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Analiza trga
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 sm:text-3xl">{kljuc}</h1>
      <p className="mt-1.5 text-sm text-zinc-500">
        Zadnjih {dni} dni · {vrstice.length} zaključenih oglasov
      </p>

      <KakoDeluje
        naslov="Kako brati te številke"
        uvod={
          <>
            Vse na tej strani je izračunano iz oglasov tega modela, ki so v izbranem obdobju
            <strong> zapustili oglasnik</strong>. Aktivni oglasi v izračun ne gredo — dokler je oglas
            zgoraj, ne vemo, koliko časa bo tam.
          </>
        }
        koraki={[
          {
            naslov: "Mediana časa na oglasu",
            besedilo: (
              <>
                Sredinska vrednost: polovica oglasov je izginila hitreje, polovica počasneje.
                Namenoma ne povprečje — en oglas, ki je stal pol leta, bi povprečje popačil.
              </>
            ),
          },
          {
            naslov: "Izginilo v ≤ 7 dneh",
            besedilo: (
              <>
                Delež oglasov tega modela, ki jih po sedmih dneh ni bilo več. Pove drugo stvar kot
                mediana: model ima lahko visoko mediano in vseeno velik delež hitrih.
              </>
            ),
          },
          {
            naslov: "Porazdelitev",
            besedilo: (
              <>
                Koliko oglasov je bilo v katerem časovnem razredu. Če je porazdelitev razpotegnjena,
                mediana sama ne pove dovolj — model se prodaja neenakomerno.
              </>
            ),
          },
          {
            naslov: "Trend",
            besedilo: (
              <>
                Mediana po mesecu, v katerem je oglas izginil. Za smiseln trend sta potrebna vsaj dva
                meseca podatkov; pri enem se graf ne izriše.
              </>
            ),
          },
          {
            naslov: "Cene",
            besedilo: (
              <>
                „Prva videna cena“ je cena ob prvem srečanju, „zadnja znana“ pa ob zadnjem pregledu
                pred izginotjem. Razlika pokaže, koliko se je pri tem modelu spuščalo.
              </>
            ),
          },
        ]}
        omejitve={[
          <>
            <strong>Zadnja znana cena ni prodajna cena.</strong> Za koliko je bil avto res prodan,
            vir ne objavi in tega ne vemo.
          </>,
          <>
            <strong>Skupina je samo znamka + model.</strong> Različni letniki, motorizacije in
            oprema so tu sešteti skupaj, zato je številka povprečje čez precej različne avte.
          </>,
          <>
            Če je vzorec majhen, je to izrecno napisano nad številkami. Pod {MIN_VZOREC} zaključenimi
            oglasi model tudi ne pride na glavno lestvico.
          </>,
        ]}
      />

      {s.vzorec === 0 ? (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-zinc-900">Za ta model še ni zaključenih oglasov</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-500">
            V izbranem obdobju noben oglas tega modela ni zapustil oglasnika, zato časa na oglasu ni
            mogoče izmeriti. Poskusite daljše obdobje.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi glavno={`${s.medianaDni}`} enota="dni" opis="Mediana časa na oglasu" poudari />
            <Kpi glavno={`${s.delez7} %`} opis="Izginilo v ≤ 7 dneh" />
            <Kpi glavno={`${s.vzorec}`} opis="Analiziranih oglasov" />
            <Kpi glavno={eur(s.povprecnaZacetnaCena)} opis="Povprečna začetna cena" />
          </div>

          {s.vzorec < MIN_VZOREC && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Vzorec je majhen ({s.vzorec} oglasov, priporočeno vsaj {MIN_VZOREC}). Številke berite kot
              namig, ne kot ugotovitev — zato ta model tudi ni na glavni lestvici.
            </p>
          )}

          <section className="mt-9">
            <h2 className="text-lg font-semibold text-zinc-900">Koliko časa so bili na oglasniku</h2>
            <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-5">
              <GrafPorazdelitve podatki={s.porazdelitev} />
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-900">Trend skozi čas</h2>
            <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-5">
              <GrafTrenda podatki={s.trend} />
            </div>
          </section>

          {segmenti.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-900">Po segmentih</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Isti model ni en trg: letniki in cenovni razredi se prodajajo različno hitro.
                Prikazani so samo segmenti z dovolj velikim vzorcem.
              </p>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Segment</th>
                      <th className="px-4 py-2.5 font-medium text-right">Mediana dni</th>
                      <th className="px-4 py-2.5 font-medium text-right">Prodanih ≤ 14 dni</th>
                      <th className="px-4 py-2.5 font-medium text-right">Mediana začetne cene</th>
                      <th className="px-4 py-2.5 font-medium text-right">Vzorec</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {segmenti.map((seg) => (
                      <tr key={seg.oznaka} className="hover:bg-zinc-50">
                        <td className="px-4 py-2.5 font-medium text-zinc-900">{seg.oznaka}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{seg.medianaDni}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{seg.delez14} %</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{eur(seg.medianaZacetneCene)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{seg.vzorec}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-900">Cene</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi glavno={eur(s.povprecnaZacetnaCena)} opis="Povprečna prva videna cena" />
              <Kpi glavno={eur(s.povprecnaKoncnaCena)} opis="Povprečna zadnja znana cena" />
              <Kpi glavno={`${s.znizanihCen}`} opis="Oglasov z znižano ceno" />
              <Kpi
                glavno={s.povprecnoZnizanje === null ? "—" : eur(s.povprecnoZnizanje)}
                opis="Povprečno znižanje"
              />
            </div>
            <p className="mt-3 text-xs text-zinc-400">
              „Zadnja znana cena&ldquo; je cena ob zadnjem obisku, preden je oglas izginil — ne prodajna
              cena. Te vir ne objavi.
            </p>
          </section>

          <p className="mt-9 flex items-start gap-2 border-t border-zinc-200 pt-5 text-xs text-zinc-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Merjeni podatek je čas na oglasniku in izginotje z njega. Oglas je lahko umaknjen brez
            prodaje, zato nikjer ne trdimo, da je bil prodan — kot prodano šteje samo tisto, kar vir
            izrecno označi.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({
  glavno,
  enota,
  opis,
  poudari = false,
}: {
  glavno: string;
  enota?: string;
  opis: string;
  poudari?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p
        className={`text-3xl font-semibold tabular-nums ${poudari ? "text-accent" : "text-zinc-900"}`}
      >
        {glavno}
        {enota && <span className="ml-1 text-base font-medium text-zinc-400">{enota}</span>}
      </p>
      <p className="mt-1 text-xs text-zinc-500">{opis}</p>
    </div>
  );
}
