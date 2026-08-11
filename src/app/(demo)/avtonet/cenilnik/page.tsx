import { redirect } from "next/navigation";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { KakoDeluje } from "../KakoDeluje";
import { CenilnikClient } from "./CenilnikClient";

/**
 * "Oceni vozilo" — what a specific car is worth on the Slovenian market.
 *
 * The flagship screen: paste a mobile.de or avto.net advert (or a screenshot),
 * and the answer comes from our own history of Slovenian adverts rather than
 * from a model's opinion. The pipeline is deliberately in that order — database,
 * algorithm, statistics, and only then AI — and the panel below says so, because
 * a valuation nobody can interrogate is a valuation nobody should act on.
 */

export const metadata = { title: "Oceni vozilo — SBN Auto" };

export default async function CenilnikPage() {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/avtonet/cenilnik"));

  return (
    <div>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Oceni vozilo</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Prilepite povezavo do oglasa (Mobile.de ali Avto.net) ali naložite posnetek zaslona. Sistem
          poišče primerljiva slovenska vozila v naši bazi in iz njihovih dejanskih cen oceni, koliko je
          ta avto vreden v Sloveniji.
        </p>
      </header>

      <CenilnikClient />

      <KakoDeluje
        naslov="Kako nastane ta ocena"
        uvod={
          <>
            Ocena <strong>ni mnenje umetne inteligence</strong>. Vsaka številka je izračunana iz cen
            resničnih slovenskih oglasov, ki smo jih sami zbrali z Avto.neta. AI se uporabi šele na
            koncu — da preveri, ali so izbrana vozila res primerljiva, in da rezultat ubesedi.
          </>
        }
        koraki={[
          {
            naslov: "1. Preberemo vozilo",
            besedilo: (
              <>
                Če je povezava z Avto.neta in oglas že imamo v bazi, uporabimo <em>svoje</em> podatke —
                brez ugibanja. Sicer stran preberemo in iz nje izluščimo znamko, model, letnik,
                kilometre, motor, menjalnik, pogon in opremo. Česar v oglasu ni, ostane prazno; ničesar
                ne domnevamo.
              </>
            ),
          },
          {
            naslov: "2. Baza poišče kandidate",
            besedilo: (
              <>
                Iz baze vzamemo vozila iste znamke, modela in goriva, najprej v oknu ±2 leti. Če jih je
                premalo, okno postopoma razširimo na ±3, ±4 in ±6 let — in na strani piše, katero okno
                je bilo dejansko uporabljeno. <strong>Cena ni filter</strong>: iščemo, koliko je avto
                vreden, ne avtov s podobno ceno.
              </>
            ),
          },
          {
            naslov: "3. Algoritem oceni podobnost",
            besedilo: (
              <>
                Vsako vozilo dobi oceno podobnosti iz šestih delov: konfiguracija (30 %), motor (20 %),
                letnik (15 %), kilometri (15 %), oprema (15 %) in karoserija (5 %). Oprema se primerja
                po strukturiranih značkah, pri čemer dražje (panorama, HUD, 360° kamera, zračno
                vzmetenje) štejejo trikrat več. Kar vir ni objavil, se šteje kot nevtralno — ne kot
                neujemanje.
              </>
            ),
          },
          {
            naslov: "4. Robustna statistika",
            besedilo: (
              <>
                Iz cen primerljivih vozil izračunamo mediano, uteženo s podobnostjo. Očitne izstopajoče
                cene izločimo po pravilu 1,5 × IQR (tipkarska napaka pri ceni tako ne premakne ocene).
                Če se kilometrina vozila močno razlikuje od mediane primerljivih, oceno popravimo z
                naklonom, izračunanim iz teh istih oglasov — popravek je omejen na ±25 %.
              </>
            ),
          },
          {
            naslov: "5. AI preveri in razloži",
            besedilo: (
              <>
                Šele zdaj AI pogleda največ 20 najboljših kandidatov in presodi, ali gre res za isto
                generacijo, motor in raven opreme. Njegova ocena se <em>povpreči</em> z algoritemsko, ne
                zamenja je. Nato iz že izračunanih številk napiše razlago. AI cene ne izračuna in je ne
                sme spremeniti.
              </>
            ),
          },
        ]}
        omejitve={[
          <>
            <strong>Oglas, ki je izginil, ni dokaz o prodaji.</strong> Avto je lahko bil umaknjen,
            prodan drugje ali preprosto potekel. Zato nikjer ne pišemo &bdquo;prodajna cena&ldquo;, ampak
            &bdquo;zadnja cena pred izginotjem&ldquo; in &bdquo;čas na oglasniku&ldquo;.
          </>,
          <>
            Cene v oglasih so <strong>zahtevane cene, ne iztržene</strong>. Dejanska prodajna cena je
            praviloma nižja, koliko pa iz javnih podatkov ni razvidno.
          </>,
          <>
            Zanesljivost pod 60 % pomeni, da je primerljivih vozil malo ali da so si cene zelo
            razpršene. Takrat berite razpon, ne ene številke.
          </>,
          <>
            Uvozni stroški (DMV, prevoz, registracija) <strong>niso izračunani samodejno</strong> —
            vnesete jih sami. Ne želimo ugibati davčnih zneskov.
          </>,
        ]}
      />
    </div>
  );
}
