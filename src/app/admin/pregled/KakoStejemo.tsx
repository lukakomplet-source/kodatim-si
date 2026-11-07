/**
 * Kako štejemo: definicije vseh mer na enem mestu (audit 6. 11.: razlikuj aktivnosti, podjetja, kontakte,
 * uspešne stike, odzive, leade, sestanke in posle; nič dvakrat). Zaprto, da ne moti; odpre se s klikom.
 */
const DEFINICIJE: [string, string][] = [
  ["Aktivnost", "vsak poslan mail in vsak klic. Isto podjetje ima lahko več aktivnosti."],
  ["Podjetje", "različna podjetja; vsako šteje enkrat, ne glede na število aktivnosti."],
  ["Kontaktirana podjetja", "podjetja, ki so prvi mail ali prvi klic dobila v izbranem obdobju."],
  ["Kontakt", "splošni naslov podjetja (kamor pišemo) in imenovana oseba s klica; splošni naslov ni oseba."],
  ["Uspešen stik", "pogovor na klicu ali pisni odgovor. Vrnjen mail in klic, ki ga nihče ne dvigne, nista stik."],
  ["Odziv", "podjetje z vsaj enim uspešnim stikom, šteto enkrat (prvi odziv). Da, ne in ne zdaj so stanje danes."],
  [
    "Kvalificiran lead",
    "podjetje, ki je reklo da sestanku, ponudbi ali testu. »Pokličite kasneje«, »pošljite na mail« in »nimamo potrebe« so samo odziv.",
  ],
  ["Sestanek", "podjetje z dogovorjenim sestankom."],
  ["Zaključen posel", "podjetje s stanjem »kupil«."],
  ["Stopnja odziva", "odzivi v obdobju, deljeni s kontaktiranimi podjetji v obdobju."],
  ["Pripisan odziv", "odziv šteje pri zadnji aktivnosti pred prvim odzivom podjetja, zato ga vsota po aktivnostih ne šteje dvakrat."],
  [
    "Od kontakta do denarja",
    "podjetja, prvič kontaktirana v obdobju, in kako daleč so prišla do danes. Podjetje šteje do najdlje dosežene faze: posel šteje tudi kot ponudba in sestanek, lead tudi kot pozitiven odziv.",
  ],
  ["Pozitiven odziv", "tvoja razvrstitev odziva (stran samo predlaga iz izida klica). Pozitiven odpre prodajno priložnost; še ni lead."],
  ["Priložnost", "en možen posel s podjetjem: faza, produkt, vrednost, naslednji korak. Vsaka sprememba faze se zapiše s časom."],
  ["Faze prodaje", "pozitiven odziv, kvalificiran lead, sestanek, ponudba poslana, pogajanja, dobljeno ali izgubljeno. Dobljeno vedno z vrednostjo posla."],
  ["Pripis kampanji", "vsako podjetje, priložnost in posel pripada različici prvega maila (prvi stik), zato je en posel samo v eni kampanji."],
  ["Vrednost priložnosti", "v prvem letu: enkratno = znesek, mesečno × 12, letno = znesek."],
  ["Napoved", "ocena iz odprtih priložnosti: potencial = vsota vrednosti, ponderirano = vrednost × verjetnost (samo z vpisano verjetnostjo)."],
  ["Prihodki po mesecih", "realizirano: opravljeni nalogi v aplikaciji (obstoječe stranke) in posli iz lijaka (enkratni v mesecu sklenitve, ponavljajoči vsak mesec)."],
  ["Cena na lead", "vpisani stroški kampanj v obdobju, deljeni z leadi. Brez vpisanih stroškov N/A."],
  ["Odprtja mailov", "ne merimo: sledilni piksel slabša dostavljivost, Applovi telefoni pa odprtja napihnejo."],
  ["Zastala priložnost", "odprta priložnost brez aktivnosti 7 dni ali več."],
];

export function KakoStejemo() {
  return (
    <details className="group rounded-xl bg-white ring-1 ring-zinc-200">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3 text-[15px] font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:px-5 [&::-webkit-details-marker]:hidden">
        Kako štejemo
        <span className="text-sm font-normal text-zinc-500 group-open:hidden">Pokaži opredelitve</span>
        <span className="hidden text-sm font-normal text-zinc-500 group-open:inline">Skrij</span>
      </summary>
      <dl className="grid gap-x-8 gap-y-2 px-4 pb-4 text-sm sm:px-5 @container lg:grid-cols-2">
        {DEFINICIJE.map(([izraz, opis]) => (
          <div key={izraz}>
            <dt className="inline font-medium text-zinc-800">{izraz}:</dt> <dd className="inline text-zinc-600">{opis}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
