import { ZAVRNITVE } from "@/lib/klicPanik";

/**
 * Scenarij klica za panik gumb (prej v PanikKoraki.tsx). Faza 4: ime klicatelja je ime prijavljenega uporabnika
 * (profiles.full_name), ne vedno »Luka Komplet«. Brez imena v profilu reče samo »kličem iz Kompletka« (nikoli
 * e-naslova). Maile pošilja Luka, zato »Po mailu« reče »smo vam pisali«, kar drži za vsakega klicatelja.
 * Brez stanja, zato ga lahko izriše strežnik ali brskalnik.
 */
export function ScenarijKlica({ ime }: { ime: string }) {
  const pozdrav = ime.trim() ? `Dober dan, ${ime.trim()} iz Kompletka.` : "Dober dan, kličem iz Kompletka.";
  return (
    <div className="space-y-3 text-sm leading-6 text-zinc-700">
      <div>
        <p className="font-semibold text-zinc-900">Uvod</p>
        <p>
          Brez maila prej: »{pozdrav} Kličem prevoznike glede varnosti voznikov na poti. Kdo pri vas skrbi za to?«
        </p>
        <p>
          Po mailu: »{pozdrav} Pred par dnevi smo vam pisali o voznikih ponoči na parkiriščih. Vas kličem v slabem
          trenutku?« (Skoraj vsak reče »ne, povejte«. S tem ti je sam dal dovoljenje.)
        </p>
        <p>
          Ponovni klic: »{pozdrav} Prejšnji teden sva govorila o voznikih ponoči. Ste imeli čas pogledati?«
        </p>
        <p className="mt-1 text-zinc-500">
          Klic naj traja do 5 minut. Cilj je samo termin za 15 minut, ne predstavitev po telefonu.
        </p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">1. Problem: vprašaj in molči, naj pove sam</p>
        <p>
          »Kaj vas pri voznikih na poti najbolj skrbi?« Odgovor zapiši z njegovimi besedami v polje »Kaj jih skrbi«.
        </p>
        <p>
          Če ne ve, kaj bi rekel, mu daj izbiro: »Je to bolj kraja tovora, voznik sam ponoči na parkirišču ali to, da ob
          težavi nihče ne ve, kje je?«
        </p>
        <p className="mt-1 text-zinc-500">
          Ko izbere, ostani samo pri tej eni skrbi. Ostalo omeni le, če vpraša sam.
        </p>
        <p>»Se je pri vas ali pri kolegih že kaj zgodilo? Kraja goriva, prerezana cerada, napad na voznika?«</p>
        <p>»Če se to zgodi ponoči, kdo pri vas izve prvi? In v koliko časa?«</p>
        <p>
          Lukovo vprašanje: »Kaj naredite, če vam kdo ponoči krade s tovornjaka? Ali če gre vozniku na okno in mu
          grozi? Koga pokliče?« Potem tišina, naj pove sam.
        </p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">2. Cena: naj jo izračuna on</p>
        <p>
          »Kaj bi vas tak dogodek stal? Tovor, vozilo, ki stoji, voznik na bolniški, stranka, ki čaka.« Številke ne
          povej ti; ko jo izgovori sam, si jo zapomni.
        </p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">3. Zakon: kot nasvet, ne kot grožnja</p>
        <p>
          »Še nekaj, kar prevozniki pogosto spregledajo: po zakonu o varnosti in zdravju pri delu (ZVZD-1, 17. člen) mora
          imeti vsak delodajalec, ne glede na število zaposlenih, pisno oceno tveganja za delo svojih ljudi. Tudi za
          voznika, ki ponoči sam stoji na parkirišču. Ali imate tam napisano, kako voznik pokliče pomoč, če sam ne
          more?«
        </p>
        <p className="mt-1 text-zinc-500">
          Res je: zakon zahteva oceno tveganja in ukrepe, gumba ne predpisuje. Nikoli ne reci »zakon zahteva panik
          gumb« in ne omenjaj zneskov glob.
        </p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">4. Kdaj in kaj dobi (kratko)</p>
        <p>»Kdaj ste mislili to urediti? Vam lahko pri tem pomagamo mi?«</p>
        <p>
          Šele potem: »Voznik pritisne gumb, mi takoj vidimo, kje je, in ukrepamo po postopku, ob kraji tudi z našimi
          partnerji na terenu. Po dogodku vam pripravimo dokumentacijo za inšpekcijo in zavarovalnico. Pri varovanju
          tovora sodelujemo s ProtecTransom, med drugim za Milšped in Essers. Kratko predstavitev vam pošljem na mail.«
        </p>
        <p className="mt-1 text-zinc-500">
          Brez cene, brez obljube odzivnega časa, nikoli »rešeni pred zakonom«. Zavarovalnico samo kot vprašanje: »Kaj
          je rekla zavarovalnica pri zadnji škodi?«
        </p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">5. Predlog z dvema možnostma</p>
        <p>
          »Predlagam takole: 15 minut, pri vas ali na Teams. Pokažem vam, kako gumb deluje, in skupaj pogledava, ali
          imate voznike na poti v oceni tveganja pokrite. S sabo prinesem vzorec gumba. Vam bolj ustreza torek dopoldne ali
          četrtek popoldne?« Če je zainteresiran: »Najprej lahko brezplačno preizkusite na 2 do 3 vozilih.«
        </p>
        <p className="mt-1 text-zinc-500">
          Ko reče termin, ga ponovi in pri izidu »Sestanek« vpiši datum, uro in kraj. Potem nehaj prodajati.
        </p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">Ko reče »ne«: boomerang (enkrat)</p>
        <p>»Bi mi povedali, zakaj ne?« … »To mi zelo pomaga. Še eno vprašanje, če dovolite: kaj bi moralo biti, da bi rekli da?«</p>
        <p className="mt-1 text-zinc-500">
          »Ne« je informacija, ne konec. Ne braniš se in ne prepričuješ. Odgovor vpiši v »Kaj bi moralo biti vključeno«. Drugi
          »ne« spoštuj.
        </p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">Če rečejo … (potrdi, poveži, vprašaj)</p>
        <ul className="list-disc space-y-1.5 pl-5">
          {ZAVRNITVE.map((z) => (
            <li key={z.rece}>
              <span className="font-medium">»{z.rece}«</span> »{z.odgovor}«
              {z.izid ? <span className="text-zinc-500"> Izid: {z.izid}.</span> : null}
              <span className="block text-zinc-500">Zakaj deluje: {z.zakaj}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">Ko je pogovor dober</p>
        <p>
          »Česa se bojite, da bi se zgodilo?« Na jasno vprašanje (licenca, kdo pride) odgovori naravnost: intervencijo
          izvaja ProtecTrans z licenco.
        </p>
        <p className="mt-1 text-zinc-500">Nikoli: »Imate kakšno vprašanje?«, prepir, pritisk ali izmišljena zgodba o stranki.</p>
      </div>
      <div>
        <p className="font-semibold text-zinc-900">Na koncu sestanka: priporočilo</p>
        <p>
          »Poznate še kakšnega prevoznika, ki bi mu to koristilo? Lahko rečem, da prihajam od vas?« Ime in mail vpiši v
          opombo, pripravim mail z njegovim priporočilom.
        </p>
      </div>
    </div>
  );
}
