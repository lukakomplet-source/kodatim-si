export type BlogSection = {
  heading: string;
  paragraphs: string[];
  list?: string[];
};

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: string;
  publishedAt: string;
  readTime: string;
  keywords: string[];
  intro: string;
  sections: BlogSection[];
  conclusion: string;
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "cena-izdelave-spletne-strani",
    title: "Cena izdelave spletne strani v Sloveniji: koliko stane spletna stran leta 2026",
    description:
      "Koliko stane izdelava spletne strani v Sloveniji? Pregled cen za predstavitveno spletno stran, spletno trgovino in spletno aplikacijo, ter kaj vpliva na ceno.",
    category: "Spletne strani",
    publishedAt: "2026-01-12",
    readTime: "6 min branja",
    keywords: [
      "cena izdelave spletne strani",
      "koliko stane spletna stran",
      "izdelava spletnih strani cena",
      "spletna stran za podjetje cena",
      "cenik spletnih strani",
    ],
    intro:
      "Eno najpogostejših vprašanj, ki jih dobimo od podjetij in samostojnih podjetnikov, je preprosto: koliko stane izdelava spletne strani? Odgovor je odvisen od vrste strani, funkcionalnosti in obsega vsebine, a v tem članku razčlenimo dejanske cene izdelave spletnih strani v Sloveniji za leto 2026, da boste lažje načrtovali proračun.",
    sections: [
      {
        heading: "Cena predstavitvene spletne strani",
        paragraphs: [
          "Predstavitvena spletna stran (t.i. vizitka ali one-pager) je najcenejša oblika spletne prisotnosti. Vključuje osnovne podstrani, kot so domov, o nas, storitve in kontakt.",
          "Cena izdelave enostavne spletne strani se v Sloveniji giblje med 800 in 2.500 EUR, odvisno od oblikovanja, SEO optimizacije in tega, ali stran vključuje kontaktni obrazec, blog ali večjezičnost.",
        ],
      },
      {
        heading: "Cena spletne trgovine (e-trgovine)",
        paragraphs: [
          "Izdelava spletne trgovine je zahtevnejši projekt, saj vključuje katalog izdelkov, košarico, plačilne sisteme (Stripe, PayPal, UPN), dostavo in upravljanje zalog.",
          "Cena spletne trgovine se običajno giblje med 2.500 in 8.000 EUR za manjše trgovine, medtem ko kompleksnejše e-trgovine s prilagojenimi funkcionalnostmi presežejo tudi 10.000 EUR.",
        ],
      },
      {
        heading: "Cena spletne aplikacije in poslovnega orodja",
        paragraphs: [
          "Če potrebujete spletno aplikacijo po meri — nadzorno ploščo, sistem za rezervacije, interno orodje za ekipo ali AI asistenta — cena je odvisna predvsem od kompleksnosti funkcionalnosti in integracij.",
          "Tovrstni projekti se pri KodaTim.si običajno gibljejo med 3.000 in 15.000+ EUR, odvisno od obsega. Ker delamo po modelu 'plačate šele, ko rešitev deluje', tveganje za naročnika bistveno zmanjšamo.",
        ],
      },
      {
        heading: "Kaj vpliva na ceno spletne strani",
        paragraphs: [
          "Na končno ceno izdelave spletne strani vpliva več dejavnikov:",
        ],
        list: [
          "Število podstrani in obseg vsebine",
          "Individualno oblikovanje (design) v primerjavi z vnaprej pripravljeno predlogo",
          "SEO optimizacija ključnih besed in tehnična optimizacija hitrosti",
          "Integracije (CRM, plačilni sistemi, rezervacijski sistemi, AI chatbot)",
          "Večjezičnost in prevodi vsebin",
          "Vzdrževanje, gostovanje in redne posodobitve po zagonu",
        ],
      },
      {
        heading: "Ali poceni spletna stran res poceni izpade?",
        paragraphs: [
          "Poceni spletna stran, izdelana s hitrimi predlogami brez SEO optimizacije, pogosto ne prinaša novih strank in dolgoročno stane več, ker jo je treba prej prenoviti.",
          "Priporočamo, da cena izdelave spletne strani vključuje tudi osnovno SEO optimizacijo ključnih besed, saj je to edini način, da vas nova stranka sploh najde na Googlu.",
        ],
      },
    ],
    conclusion:
      "Cena izdelave spletne strani je naložba, ki se povrne, če je stran optimizirana za iskalnike in usmerjena k pretvorbi obiskovalcev v stranke. Opišite nam svoj projekt in v 24 urah dobite konkretno ponudbo, prilagojeno vašemu proračunu.",
  },
  {
    slug: "seo-optimizacija-vodnik-za-podjetja",
    title: "SEO optimizacija za mala in srednja podjetja: popoln vodnik",
    description:
      "Kaj je SEO optimizacija in zakaj jo vaše podjetje potrebuje? Praktičen vodnik po optimizaciji ključnih besed, tehničnem SEO in gradnji organskega obiska na Googlu.",
    category: "SEO",
    publishedAt: "2026-02-03",
    readTime: "8 min branja",
    keywords: [
      "SEO optimizacija",
      "optimizacija za iskalnike",
      "ključne besede SEO",
      "SEO za podjetja",
      "organski obisk Google",
    ],
    intro:
      "SEO optimizacija (optimizacija za iskalnike) je proces, s katerim spletna stran postane bolje vidna v rezultatih iskanja na Googlu. Za mala in srednja podjetja je to pogosto najbolj stroškovno učinkovit način pridobivanja novih strank — brez plačevanja za vsak klik.",
    sections: [
      {
        heading: "Zakaj je SEO optimizacija pomembna za vaše podjetje",
        paragraphs: [
          "Večina uporabnikov klikne le na enega izmed prvih rezultatov iskanja. Če vaše podjetje ni na prvi strani Googla za relevantne ključne besede, izgubljate potencialne stranke v korist konkurence.",
          "Dobra SEO optimizacija pripelje obiskovalce, ki že aktivno iščejo vašo storitev ali izdelek — kar pomeni višjo verjetnost, da postanejo dejanske stranke.",
        ],
      },
      {
        heading: "Raziskava ključnih besed",
        paragraphs: [
          "Prvi korak SEO optimizacije je raziskava ključnih besed — ugotoviti, kaj vaše stranke dejansko vpisujejo v Google. Namesto splošnih izrazov ciljamo na kombinacijo glavnih in dolgorepih ključnih besed (long-tail keywords), ki imajo manj konkurence.",
          "Primer: namesto splošne besede 'spletna stran' je bolje ciljati tudi na 'izdelava spletne strani za mala podjetja' ali 'cena spletne strani Ljubljana'.",
        ],
      },
      {
        heading: "Tehnična SEO optimizacija",
        paragraphs: [
          "Tehnični SEO vključuje hitrost nalaganja strani, prilagojenost mobilnim napravam, pravilno strukturo naslovov (H1, H2, H3), meta opise, alt besedila slik in varno HTTPS povezavo.",
          "Google nagrajuje hitre in tehnično urejene spletne strani z boljšo uvrstitvijo, zato je tehnična optimizacija enako pomembna kot vsebina.",
        ],
      },
      {
        heading: "Vsebinski SEO in blog",
        paragraphs: [
          "Redno objavljanje blog vsebin, ki odgovarjajo na vprašanja vaših strank, je eden najučinkovitejših načinov za dolgoročno gradnjo organskega obiska.",
          "Vsak blog članek je priložnost, da se uvrstite za novo ključno besedo in pripeljete nov, ciljan promet na spletno stran.",
        ],
      },
      {
        heading: "Lokalna SEO optimizacija",
        paragraphs: [
          "Za podjetja, ki delujejo lokalno (npr. Ljubljana, Celje, Maribor, Savinjska regija), je ključnega pomena tudi Google Business profil in lokalne ključne besede — na primer 'spletna stran Celje' ali 'digitalna agencija Slovenija'.",
        ],
      },
    ],
    conclusion:
      "SEO optimizacija ni enkraten projekt, temveč dolgoročna strategija. Pri KodaTim.si vsako spletno stran gradimo z vgrajeno SEO optimizacijo ključnih besed in po potrebi dodamo tudi redne blog vsebine in Google oglaševanje za hitrejše rezultate.",
  },
  {
    slug: "ai-chatbot-za-podjetje",
    title: "AI chatbot za podjetje: zakaj ga potrebujete leta 2026",
    description:
      "AI chatbot avtomatizira odgovore na pogosta vprašanja strank 24/7. Odkrijte, kako umetna inteligenca pomaga podjetjem pridobivati več povpraševanj z manj truda.",
    category: "AI in avtomatizacija",
    publishedAt: "2026-02-20",
    readTime: "5 min branja",
    keywords: [
      "AI chatbot za podjetje",
      "umetna inteligenca za podjetja",
      "virtualni asistent",
      "avtomatizacija strank",
      "AI asistent spletna stran",
    ],
    intro:
      "AI chatbot je postal standardno orodje sodobnih spletnih strani. Namesto da obiskovalec čaka na email odgovor, mu AI asistent takoj pomaga — 24 ur na dan, vse dni v tednu.",
    sections: [
      {
        heading: "Kaj je AI chatbot in kako deluje",
        paragraphs: [
          "AI chatbot je virtualni asistent, ki s pomočjo umetne inteligence razume vprašanja obiskovalcev in nanje odgovarja v naravnem jeziku, na podlagi baze znanja vašega podjetja.",
          "Za razliko od starih chatbotov z vnaprej določenimi gumbi, sodoben AI chatbot razume prosto besedilo in zna svetovati podobno kot izkušen prodajni sodelavec.",
        ],
      },
      {
        heading: "Prednosti AI chatbota za podjetje",
        paragraphs: ["AI chatbot na spletni strani prinaša podjetju konkretne koristi:"],
        list: [
          "Takojšen odgovor obiskovalcem, brez čakanja na email ali telefon",
          "Zbiranje povpraševanj (leadov) tudi izven delovnega časa",
          "Manj ponavljajočih se vprašanj za zaposlene",
          "Boljša izkušnja uporabnika in višja stopnja pretvorbe (konverzije)",
          "Baza znanja, ki jo je mogoče sproti dopolnjevati brez poseganja v kodo",
        ],
      },
      {
        heading: "Primeri uporabe AI asistenta",
        paragraphs: [
          "AI asistenta lahko uporabite za svetovanje o storitvah, pomoč pri izbiri paketa, odgovarjanje na pogosta vprašanja ali usmerjanje uporabnika do kontaktnega obrazca.",
          "Pri projektu EscortOps smo razvili AI asistenta z bazo znanja, ki agentom na terenu v realnem času razlaga postopke — kar je zmanjšalo potrebo po dodatnem usposabljanju novih zaposlenih.",
        ],
      },
      {
        heading: "Kako vgraditi AI chatbot na svojo spletno stran",
        paragraphs: [
          "Vgradnja AI chatbota zahteva povezavo z jezikovnim modelom, oblikovano bazo znanja o vašem podjetju in skrbno nastavljen ton komunikacije, da odgovori zvenijo naravno in verodostojno.",
        ],
      },
    ],
    conclusion:
      "Če razmišljate o uvedbi AI chatbota za svoje podjetje, opišite nam svojo idejo prek našega AI asistenta na domači strani — v nekaj minutah boste dobili konkretne smernice, kako lahko avtomatizacija strank deluje za vas.",
  },
  {
    slug: "spletna-trgovina-kako-izbrati-resitev",
    title: "Spletna trgovina: kako izbrati pravo rešitev za e-poslovanje",
    description:
      "Načrtujete spletno trgovino? Preverite, kaj je pomembno pri izbiri platforme za e-trgovino, plačilnih sistemov in dostave, da bo vaše e-poslovanje uspešno.",
    category: "E-trgovina",
    publishedAt: "2026-03-05",
    readTime: "7 min branja",
    keywords: [
      "spletna trgovina",
      "izdelava spletne trgovine",
      "e-trgovina Slovenija",
      "online prodaja",
      "plačilni sistemi spletna trgovina",
    ],
    intro:
      "Odpiranje spletne trgovine je za mnoga podjetja naravni naslednji korak po fizični prodaji. A uspešna spletna trgovina je veliko več kot le katalog izdelkov — gre za celoten sistem od iskanja do plačila in dostave.",
    sections: [
      {
        heading: "Izbira platforme za spletno trgovino",
        paragraphs: [
          "Prva odločitev pri izdelavi spletne trgovine je izbira tehnologije: vnaprej pripravljena platforma (npr. Shopify, WooCommerce) ali spletna trgovina po meri, prilagojena specifičnim potrebam podjetja.",
          "Vnaprej pripravljene platforme so hitrejše za zagon, medtem ko rešitev po meri omogoča popolno prilagoditev poslovnim procesom, integracijam in dolgoročno nižje stroške pri rasti.",
        ],
      },
      {
        heading: "Plačilni sistemi in varnost",
        paragraphs: [
          "Spletna trgovina mora podpirati zanesljive plačilne sisteme — kartično plačilo, PayPal, Stripe in v Sloveniji tudi UPN nakazilo ali plačilo po povzetju.",
          "Varnost podatkov strank (SSL certifikat, skladnost z GDPR) je nujna tako za zaupanje kupcev kot za pravno skladnost.",
        ],
      },
      {
        heading: "Upravljanje zalog in dostave",
        paragraphs: [
          "Dobra spletna trgovina samodejno posodablja zaloge, obvešča o statusu naročila in se poveže z dostavnimi službami, da kupec ves čas ve, kje je njegovo naročilo.",
        ],
      },
      {
        heading: "SEO optimizacija spletne trgovine",
        paragraphs: [
          "Vsaka stran izdelka je priložnost za SEO optimizacijo — z opisi, ki vsebujejo relevantne ključne besede, uporabniki lažje najdejo vaše izdelke prek Google iskanja, namesto da zanašate izključno na plačano oglaševanje.",
        ],
      },
    ],
    conclusion:
      "Ne glede na to, ali gradite manjšo spletno trgovino ali kompleksno e-poslovanje s tisoči izdelkov, je ključno, da rešitev raste skupaj z vašim podjetjem. Opišite nam svoj projekt in predlagali vam bomo najprimernejšo rešitev za vašo spletno trgovino.",
  },
  {
    slug: "zakaj-podjetje-potrebuje-sodobno-spletno-stran",
    title: "Zakaj vaše podjetje potrebuje sodobno spletno stran",
    description:
      "Stara ali zastarela spletna stran vas stane strank. Odkrijte, zakaj je prenova spletne strani ena najboljših naložb za rast vašega podjetja.",
    category: "Spletne strani",
    publishedAt: "2026-03-18",
    readTime: "5 min branja",
    keywords: [
      "spletna stran za podjetje",
      "prenova spletne strani",
      "digitalna prisotnost",
      "sodobna spletna stran",
      "izdelava spletnih strani za podjetja",
    ],
    intro:
      "Spletna stran je pogosto prvi stik potencialne stranke z vašim podjetjem. Zastarela, počasna ali neresponzivna spletna stran že v nekaj sekundah odžene obiskovalca h konkurenci.",
    sections: [
      {
        heading: "Prvi vtis odloča v nekaj sekundah",
        paragraphs: [
          "Raziskave kažejo, da si obiskovalec mnenje o podjetju ustvari v manj kot 3 sekundah po prihodu na spletno stran. Sodobna, hitro nalagajoča spletna stran gradi zaupanje že ob prvem obisku.",
        ],
      },
      {
        heading: "Prilagojenost mobilnim napravam",
        paragraphs: [
          "Več kot polovica obiska spletnih strani prihaja z mobilnih naprav. Če vaša spletna stran ni prilagojena mobilnim telefonom, izgubljate velik del potencialnih strank in ste slabše uvrščeni na Googlu.",
        ],
      },
      {
        heading: "Jasen klic k akciji",
        paragraphs: [
          "Sodobna spletna stran za podjetje mora obiskovalcu takoj pokazati, kaj ponujate in kako vas kontaktirati — z jasnim klicem k akciji, kot je povpraševanje, klic ali klepet z AI asistentom.",
        ],
      },
      {
        heading: "Ločena ponudba za različne segmente strank",
        paragraphs: [
          "Podjetja, ki ponujajo storitve tako fizičnim osebam kot drugim podjetjem, dosežejo boljše rezultate, če stran vsakemu segmentu takoj pokaže zanj relevantno rešitev.",
        ],
      },
    ],
    conclusion:
      "Prenova spletne strani je ena izmed naložb z najhitrejšim povračilom — boljša uvrstitev na Googlu, več povpraševanj in boljši vtis pri strankah. Pri KodaTim.si vsak projekt začnemo z analizo vaše trenutne digitalne prisotnosti.",
  },
  {
    slug: "partnerski-program-kodatim",
    title: "Partnerski program KodaTim.si: zaslužite s priporočili",
    description:
      "Poznate podjetje, ki potrebuje spletno stran ali aplikacijo? S partnerskim programom KodaTim.si zaslužite dolgoročno provizijo za vsako priporočeno stranko.",
    category: "Partnerstvo",
    publishedAt: "2026-04-02",
    readTime: "4 min branja",
    keywords: [
      "partnerski program",
      "affiliate program Slovenija",
      "provizija za priporočila",
      "zaslužek s priporočili",
      "partner program razvojna agencija",
    ],
    intro:
      "Partnerski program KodaTim.si je namenjen vsem, ki poznajo podjetja z idejo za spletno stran, spletno trgovino ali poslovno aplikacijo, a se sami ne ukvarjajo z razvojem.",
    sections: [
      {
        heading: "Kako deluje partnerski program",
        paragraphs: [
          "Prijavite se v partnerski program, prejmete svojo unikatno partnersko povezavo in jo delite s podjetji, ki bi lahko potrebovala digitalno rešitev.",
          "Ko priporočena stranka postane plačljiva, kot partner prejmete 20 % od njene prve fakture — brez omejitev, koliko strank priporočite.",
        ],
      },
      {
        heading: "Stalna mesečna provizija",
        paragraphs: [
          "Poleg enkratne provizije partnerji prejemajo tudi delež od mesečnih plačil, dokler priporočena stranka pri nas ostaja aktivna — kar pomeni dolgoročen, pasiven zaslužek.",
        ],
      },
      {
        heading: "Kdo se lahko pridruži partnerskemu programu",
        paragraphs: [
          "Partnerski program je odprt za svetovalce, samostojne podjetnike, marketinške agencije in vsakogar s poslovno mrežo, ki pozna podjetja, željna prenove ali izdelave spletne strani.",
        ],
      },
    ],
    conclusion:
      "Postanite partner KodaTim.si in začnite graditi dolgoročen pasiven prihodek s priporočili. Prijavite se prek strani za partnerje in prejmite svojo partnersko povezavo še danes.",
  },
];

export function getPostBySlug(slug: string) {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function getAllPostSlugs() {
  return BLOG_POSTS.map((post) => post.slug);
}
