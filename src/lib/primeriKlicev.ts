/**
 * Primeri klicev za poslušanje (Luka 4. 11. 2026: »primeri, da lahko slišiš voice … opcije, kak se menit, pa kaj
 * če vpraša … pravi sales training kot od Grant Cardona«). Vzorčni klici po Lukovem sistemu (lekcija 13 v
 * Documents\VIDEO-UCENJE\TECAJ-PANIK): prodajalec govori z glasom Luka, prevoznik z glasom Rok (Harvey Kompletko
 * /api/trening/glas, personi »prodajalec« in »prevoznik«). Na ključnih mestih so možnosti: če reče X, rečeš A ali B.
 *
 * Pravila kot povsod: brez cene po telefonu, brez glob, nikoli »zakon zahteva« ali »rešeni pred zakonom«, nič
 * izmišljenih strank ali odzivnih časov; številke z besedo, da jih glas prebere prav.
 */

export type Govori = "prodajalec" | "prevoznik";

export type Replika = {
  kdo: Govori;
  besedilo: string;
  /** Kratka opomba trenerja pod repliko (ni v zvoku). */
  opomba?: string;
  /** Možnosti na tem mestu: kaj vse lahko reče prevoznik in kako odgovoriš. */
  moznosti?: { ce: string; odgovor: string; zakaj: string }[];
};

export type PrimerKlica = {
  kljuc: string;
  naslov: string;
  kaj: string;
  koraki: string;
  replike: Replika[];
  nauk: string[];
};

export const PRIMERI_KLICEV: PrimerKlica[] = [
  {
    kljuc: "dober-klic",
    naslov: "Dober klic do termina",
    kaj: "Lastnik manjšega prevoznika, ima nekaj minut. Klic po vseh devetih korakih, brez cene, konča se z dvema terminoma.",
    koraki: "1 klic · 2 kako imate zdaj · 3 scenarij · 4 cena problema · 5 kdaj · 6 kaj dobi · 9 sestanek",
    replike: [
      { kdo: "prevoznik", besedilo: "Prosim?" },
      {
        kdo: "prodajalec",
        besedilo:
          "Dober dan, Luka iz Kompletka. Kličem zaradi varnosti vaših voznikov na poti. Imate dve minuti?",
        opomba: "Korak 1: kdo si, zakaj kličeš, prošnja za čas. Kratko, brez predstavitve podjetja.",
      },
      { kdo: "prevoznik", besedilo: "Dve minuti ja, potem moram iti." },
      {
        kdo: "prodajalec",
        besedilo:
          "Hvala. Kako imate zdaj urejeno, če gre vozniku na poti kaj narobe in sam ne more poklicati pomoči?",
        opomba: "Korak 2: vprašanje, ne trditev. Potem molčiš.",
      },
      { kdo: "prevoznik", besedilo: "Ma, vozniki imajo telefon. Če kaj rabijo, me pokličejo." },
      {
        kdo: "prodajalec",
        besedilo:
          "Razumem. Kaj pa, če ponoči na parkirišču kdo reže ceradu, ali gre vozniku na okno in mu grozi? Koga pokliče takrat?",
        opomba: "Korak 3: scenarij. Naj si sam predstavlja trenutek, ko telefon ne pomaga.",
        moznosti: [
          {
            ce: "»To se nam še ni zgodilo.«",
            odgovor: "»Super, da se ni. Kaj pa kolegom, ki jih poznate?«",
            zakaj: "Ne prepričuješ, samo razširiš na znance. Skoraj vsak pozna koga, ki se mu je.",
          },
          {
            ce: "»Pokliče policijo.«",
            odgovor: "»In koliko časa mine, da pride, če je v tujini, ponoči, na avtocesti?«",
            zakaj: "Ne rečeš, da je narobe. Vprašaš, in sam ugotovi, da je pomoč daleč.",
          },
        ],
      },
      {
        kdo: "prevoznik",
        besedilo: "Lani so nam v Italiji ponoči ukradli gorivo. Voznik je spal, zjutraj je bil rezervoar prazen.",
      },
      {
        kdo: "prodajalec",
        besedilo: "Oh, to je neprijetno. Koliko vas je to stalo, skupaj z dnevom, ko je tovornjak stal?",
        opomba: "Korak 4: ceno problema pove on. Ti ne ugibaš in ne strašiš.",
      },
      { kdo: "prevoznik", besedilo: "Med gorivom in zamudo kakšnih tisoč petsto evrov. Pa stranka je bila jezna." },
      {
        kdo: "prodajalec",
        besedilo: "Razumem. Ste razmišljali, kako bi to uredili, da se ne ponovi? Vam lahko pri tem pomagamo mi?",
        opomba: "Korak 5: kdaj in ali lahko pomagamo. On izbere, da hoče rešitev.",
      },
      { kdo: "prevoznik", besedilo: "Ja, kaj pa sploh imate?" },
      {
        kdo: "prodajalec",
        besedilo:
          "Na kratko: v kabini je gumb. Voznik ga pritisne, mi takoj vidimo, kje je, in ukrepamo po dogovorjenem postopku, ob kraji tudi s partnerji na terenu. Po dogodku vam pripravimo še dokumentacijo za zavarovalnico.",
        opomba: "Korak 6: šele zdaj razlaga, v treh stavkih. Brez cene, brez obljube, v koliko minutah pride pomoč.",
      },
      { kdo: "prevoznik", besedilo: "Koliko pa to stane?" },
      {
        kdo: "prodajalec",
        besedilo:
          "Odvisno od števila vozil, zato vam raje pokažem na kratkem sestanku, z vzorcem gumba v roki. Petnajst minut, pri vas ali na Teams. Vam bolj ustreza torek ob desetih ali četrtek ob dveh?",
        opomba: "Korak 9: cena gre na sestanek. Dve konkretni možnosti, ne »kdaj imate čas?«.",
        moznosti: [
          {
            ce: "»Povejte mi vsaj približno.«",
            odgovor:
              "»Razumem, da bi radi vedeli. Je odvisno od flote in od tega, kaj vključimo, zato vam na sestanku pokažem točno. Torek ali četrtek?«",
            zakaj: "Potrdiš, da je vprašanje razumno, in se vrneš na termin. Številka po telefonu ubije sestanek.",
          },
        ],
      },
      { kdo: "prevoznik", besedilo: "Četrtek ob dveh, pri nas." },
      {
        kdo: "prodajalec",
        besedilo: "Odlično, četrtek ob štirinajstih pri vas. Prinesem vzorec. Hvala in lep dan.",
        opomba: "Ponoviš termin in nehaš prodajati. Takoj vpišeš izid »Sestanek« z datumom in uro.",
      },
    ],
    nauk: [
      "Prodajalec je govoril manj kot prevoznik.",
      "Problem in njegovo ceno (tisoč petsto evrov in jezna stranka) je povedal prevoznik sam.",
      "Cena ni bila izrečena, termin pa je dogovorjen.",
    ],
  },
  {
    kljuc: "poslji-mail",
    naslov: "»Pošljite na mail«",
    kaj: "Direktorica nima volje za pogovor in hoče, da pošlješ na mail. Cilj: mail pošlješ, pogovor pa vseeno pripelješ do enega vprašanja.",
    koraki: "1 klic · ugovor »mail« · 2 kako imate zdaj · 9 sestanek ali dogovor za ponovni klic",
    replike: [
      { kdo: "prevoznik", besedilo: "Ja, izvolite." },
      {
        kdo: "prodajalec",
        besedilo: "Dober dan, Luka iz Kompletka. Kličem zaradi varnosti voznikov na poti. Imate dve minuti?",
      },
      { kdo: "prevoznik", besedilo: "Ne vem, kaj prodajate, ampak pošljite na mail, bom pogledala." },
      {
        kdo: "prodajalec",
        besedilo:
          "Seveda, pošljem. Da ne bo samo še en mail med stotimi: kaj vas pri voznikih na poti najbolj skrbi, da vam pošljem točno to?",
        opomba: "Potrdi, poveži, vprašaj. Rečeš da, potem eno vprašanje, ki mail naredi oseben.",
        moznosti: [
          {
            ce: "»Nič me ne skrbi, pošljite.«",
            odgovor: "»Prav, pošljem kratko predstavitev. Vas lahko pokličem v petek, da vidim, ali je kaj za vas?«",
            zakaj: "Ne siliš. Dogovoriš se za naslednji korak z datumom, sicer mail pozabi.",
          },
          {
            ce: "»Kraje.«",
            odgovor: "»Razumem. Se vam je že kaj zgodilo?«",
            zakaj: "Ena skrb, pri njej ostaneš. Pogovor je odprt, mail počaka.",
          },
        ],
      },
      { kdo: "prevoznik", besedilo: "Ma, vozniki včasih spijo na parkiriščih, to me malo skrbi." },
      {
        kdo: "prodajalec",
        besedilo:
          "To razumem. Pošljem vam, kako to rešujemo, z eno kratko animacijo. In če vam ustreza, pridem za petnajst minut pokazat vzorec. Bi bil boljši ponedeljek ali sreda?",
      },
      { kdo: "prevoznik", besedilo: "Najprej pošljite, potem se slišimo." },
      {
        kdo: "prodajalec",
        besedilo: "Prav. Pošljem še danes, v petek vas pokličem. Hvala in lep dan.",
        opomba: "Drugi »ne« spoštuješ. Vpišeš »Pošlji mail« in ponovni klic v petek.",
      },
    ],
    nauk: [
      "Mail ni konec. Je razlog za eno vprašanje in za ponovni klic.",
      "Ko sogovornik ni prijazen, ostaneš miren in kratek.",
    ],
  },
  {
    kljuc: "gps",
    naslov: "»Imamo že GPS«",
    kaj: "Prevoznik misli, da ima že vse. Cilj: brez prepira pokazati razliko med tem, kje je tovornjak, in tem, da voznik rabi pomoč.",
    koraki: "ugovor GPS · 3 scenarij · 4 cena problema · 9 sestanek",
    replike: [
      { kdo: "prevoznik", besedilo: "Mi imamo GPS na vseh tovornjakih, to nam ne rabi." },
      {
        kdo: "prodajalec",
        besedilo:
          "Super, to je dobra osnova. Mi zanima: ko GPS ponoči pokaže, da tovornjak stoji, kdo pri vas takrat ve, ali je voznik v redu?",
        opomba: "Potrdiš, kar ima, nato vprašanje, ki pokaže vrzel. Ne rečeš, da je GPS slab.",
        moznosti: [
          {
            ce: "»Dispečer gleda.«",
            odgovor: "»Tudi ob treh zjutraj? In če vidi, da stoji, kako ve, ali voznik spi ali ga kdo ogroža?«",
            zakaj: "Dispečer ni ponoči. Vprašanje to pokaže brez obtoževanja.",
          },
        ],
      },
      { kdo: "prevoznik", besedilo: "Ponoči nihče. Zjutraj pogledamo." },
      {
        kdo: "prodajalec",
        besedilo:
          "Razumem. GPS pove, kje je tovornjak. Gumb pove, da voznik rabi pomoč, in takrat nekdo takoj ukrepa. Kaj bi vas stalo, če bi se voznik ponoči poškodoval in bi to izvedeli šele zjutraj?",
      },
      { kdo: "prevoznik", besedilo: "Hm, to bi bilo slabo. Tudi za voznika." },
      {
        kdo: "prodajalec",
        besedilo:
          "Točno. Gumb se doda k temu, kar imate, nič ne menjate. Pokažem vam na petnajst minut z vzorcem, torek dopoldne ali sreda popoldne?",
      },
    ],
    nauk: [
      "Nikoli ne napadeš tega, kar že ima. Dodaš, ne zamenjaš.",
      "Razlika v enem stavku: GPS pove, kje je tovornjak, gumb, da voznik rabi pomoč.",
    ],
  },
  {
    kljuc: "nimam-casa",
    naslov: "»Nimam časa«",
    kaj: "Lastnik vozi ali je sredi dela. Cilj: ne izsiljevati pogovora, dobiti točen čas za ponovni klic.",
    koraki: "1 klic · dogovor za ponovni klic",
    replike: [
      { kdo: "prevoznik", besedilo: "Ne morem zdaj, vozim." },
      {
        kdo: "prodajalec",
        besedilo: "Razumem, ne motim. Kdaj vas lahko pokličem nazaj, danes po petih ali jutri dopoldne?",
        opomba: "Dve možnosti, ne »kdaj vam ustreza«. Tako dobiš uro.",
      },
      { kdo: "prevoznik", besedilo: "Jutri ob devetih." },
      {
        kdo: "prodajalec",
        besedilo: "Odlično, jutri ob devetih. Gre za varnost voznikov na poti, dve minuti. Varno vožnjo.",
        opomba: "Takoj vpišeš »Pokliči kasneje« z jutrišnjim datumom. Ob devetih res pokličeš.",
      },
    ],
    nauk: [
      "Kratek klic, ki konča z uro, je zmaga.",
      "Ko pokličeš točno ob dogovorjeni uri, si že pokazal, da se nanj lahko zanese.",
    ],
  },
  {
    kljuc: "bom-premislil",
    naslov: "»Bom premislil« in boomerang",
    kaj: "Pogovor je bil dober, ob terminu pa reče, da bo premislil. Cilj: enkrat boomerang, da izveš, kaj manjka.",
    koraki: "9 sestanek · ugovor · boomerang",
    replike: [
      {
        kdo: "prodajalec",
        besedilo: "Predlagam petnajst minut z vzorcem gumba. Vam bolj ustreza torek ali četrtek?",
      },
      { kdo: "prevoznik", besedilo: "Bom premislil, pa vam javim." },
      {
        kdo: "prodajalec",
        besedilo:
          "Seveda, to je razumno. Da vem, kaj vam pošljem: kaj bi moralo biti vključeno, da bi rekli da?",
        opomba: "Boomerang (Angela Soko): ne prepričuješ, vprašaš. Odgovor je zlato, vpišeš ga v »Kaj bi moralo biti vključeno«.",
        moznosti: [
          {
            ce: "»Ne vem, moram vprašati partnerja.«",
            odgovor: "»Seveda. Bi bilo lažje, če bi bil na sestanku tudi on? Petnajst minut za oba.«",
            zakaj: "Odločevalca povabiš zraven, namesto da čakaš na odgovor iz druge roke.",
          },
          {
            ce: "»Da vidim, koliko to stane.«",
            odgovor: "»Razumem. Prav zato je sestanek, tam vidite točno za vašo floto, brez obveze. Torek ali četrtek?«",
            zakaj: "Cena je pravi razlog za sestanek, ne razlog za mail.",
          },
        ],
      },
      { kdo: "prevoznik", besedilo: "Da vidim, ali bi vozniki to sploh uporabljali." },
      {
        kdo: "prodajalec",
        besedilo:
          "To je dobro vprašanje. Zato najprej brezplačno preizkusite na dveh ali treh vozilih, pa vprašate voznike sami. Pokažem vam na sestanku, torek ali četrtek?",
        opomba: "Njegov pomislek postane razlog za brezplačni preizkus. Če reče drugič ne, spoštuješ in vpišeš.",
      },
      { kdo: "prevoznik", besedilo: "Prav, četrtek." },
    ],
    nauk: [
      "»Bom premislil« pomeni, da nekaj manjka. Vprašaš enkrat, kaj.",
      "Brezplačni preizkus na dveh ali treh vozilih odgovori na skoraj vsak »ne vem«.",
    ],
  },
  {
    kljuc: "zakon",
    naslov: "»Tega nam po zakonu ni treba«",
    kaj: "Prevoznik je že slišal za zakon in je nejevoljen. Cilj: dati mu prav, zakon samo kot nasvet, nato nazaj na njegovo skrb.",
    koraki: "7 zakon kot nasvet · 2 kako imate zdaj · 9 sestanek",
    replike: [
      { kdo: "prevoznik", besedilo: "Gumba nam po zakonu ni treba imeti, to vem." },
      {
        kdo: "prodajalec",
        besedilo:
          "Imate prav, gumba zakon ne predpisuje. Predpisuje pa oceno tveganja tudi za voznika na poti in ukrepe zanjo. Kako imate to danes napisano?",
        opomba: "Daš mu prav. Nikoli »zakon zahteva gumb« in nikoli globe po telefonu.",
      },
      { kdo: "prevoznik", besedilo: "Imamo oceno tveganja, je naredil naš varnostni inženir." },
      {
        kdo: "prodajalec",
        besedilo:
          "Super. Je v njej zapisano, kako voznik pokliče pomoč, če ponoči sam ne more do telefona?",
      },
      { kdo: "prevoznik", besedilo: "Tega pa ne vem, moram pogledati." },
      {
        kdo: "prodajalec",
        besedilo:
          "Predlagam, da pogledava skupaj, petnajst minut, pa vam pokažem, kako to rešuje gumb. Vam ustreza ponedeljek ali sreda?",
      },
    ],
    nauk: [
      "Ko ima prav, mu daš prav. Pogovor teče naprej, ker se nisi prepiral.",
      "Zakon je nasvet, ki mu koristi tudi brez nakupa, ne grožnja.",
    ],
  },
];
