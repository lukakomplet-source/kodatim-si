import { LandingPageLayout, LandingData } from "@urvis/components/LandingPageLayout";
const heroImg = "/urvis-assets/1_(1)_1785240910679.jpg";

const data: LandingData = {
  metaTitle: "Razlakiranje obešal | URVIS — čiščenje lakirnih obešal in košar",
  metaDesc: "Profesionalno razlakiranje obešal in košar za lakirnice. Pirolizni postopek brez poškodb, hitri roki, ekonomično vzdrževanje lakirnih linij. Povpraševanje brezplačno.",
  canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/razlakiranje-obesal`,
  keyword: "razlakiranje obešal",
  schema: {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Razlakiranje obešal in košar",
    description: "Profesionalno termično razlakiranje lakirnih obešal, košar in transportne opreme lakirnic. Pirolizni postopek brez kemikalij.",
    provider: {
      "@type": "LocalBusiness",
      name: "URVIS Razlakiranje Kovin D.O.O.",
      telephone: "+38670638194",
      email: "ekopec@urvis.si",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Laze pri Dramljah 14 A",
        addressLocality: "Dramlje",
        postalCode: "3222",
        addressCountry: "SI",
      },
    },
    areaServed: "Slovenija",
    serviceType: "Razlakiranje lakirnih obešal",
  },

  heroImage: heroImg,
  badge: "Specialist za lakirnice · 30+ let",
  h1: "RAZLAKIRANJE",
  h1accent: "OBEŠAL",
  sub: "Specializirani postopek razlakiranja lakirnih obešal, košar in transportne opreme. Ohranite dimenzijsko natančnost, električni kontakt in kakovost lakiranja.",

  stats: [
    { value: "3×", label: "Procesne linije" },
    { value: "30+", label: "Let izkušenj" },
    { value: "420°C", label: "Temperatura procesa" },
  ],

  benefitsTitle: "Zakaj redno razlakiranje obešal ohranja kakovost lakiranja",
  benefits: [
    { icon: "zap", title: "Popoln električni kontakt", desc: "Čista obešala zagotavljajo optimalen prenos elektrostatičnega naboja, ki je ključen za enakomerno prašno barvanje brez lisa in vrzeli." },
    { icon: "settings", title: "Dimenzijska natančnost", desc: "Nabiranje barve na obešalih postopno povečuje dejanske dimenzije, kar vodi do napak pri pozicioniranju. Redno razlakiranje ohrani izvirne dimenzije." },
    { icon: "clock", title: "Podaljšana življenjska doba", desc: "Redno vzdrževana obešala zdržijo 10–15 let ali več. Brez vzdrževanja se obešala poškodujejo že po 2–3 letih intenzivne rabe." },
    { icon: "factory", title: "Manj odpadnih delov", desc: "Čista obešala zmanjšajo število odpadkov (zavrnitev), saj zagotavljajo enakomerno lakirano površino brez artefaktov z obešal." },
  ],

  processTitle: "Postopek razlakiranja obešal v URVIS",
  processIntro: "Naš specializiran postopek razlakiranja obešal je razvit za potrebe aktivnih lakirnic z visokointenzivno produkcijo.",
  steps: [
    { title: "Dostava obešal", desc: "Obešala dostavite v naš obrat v Šentjurju ali Dramljah. Za redne stranke organiziramo periodičen prevzem in dostavo." },
    { title: "Pregled in sortiranje", desc: "Preverimo material (jeklo/aluminij), debelino nabranega premaza in morebitne mehanske poškodbe. Obešala razvrstimo po vrsti." },
    { title: "Termično razlakiranje", desc: "Jeklena obešala v napravi Dinamec pri 420°C, aluminijasta v napravi TD pri 270–450°C. Premazi v celoti razpadejo v 20–60 min." },
    { title: "Mehansko čiščenje", desc: "Po razlakiranju se obešala mehansko očistijo — ostranijo se ostanki mivke, pritrditvene točke se prečistijo." },
    { title: "Kontrola in povratek", desc: "Vizualna kontrola vsake serije. Obešala so čista, pripravljena za takojšnjo vrnitev v lakirni cikel." },
  ],

  contentTitle: "Razlakiranje obešal: investicija v kakovost lakiranja",
  contentHTML: `
<p>Lakirna obešala so hrbtenica vsakega sistema prašnega barvanja. Med vsakim lakirnim ciklom se na obešalih odloži tanka plast barve, ki se v sušilni peči polimerizira in utrdi. Sčasoma se te plasti kopičijo in povzročajo resne motnje v lakirnem procesu. Razlakiranje obešal je zato ne zgolj vzdrževanje, temveč ključna operacija za ohranjanje kakovosti vaše lakirne linije.</p>

<h2>Kdaj je čas za razlakiranje obešal?</h2>
<p>Izkušeni vodje lakirnic prepoznajo znake, da je razlakiranje obešal nujno:</p>
<ul>
<li><strong>Neenakomeren premaz</strong> — lise, vrzeli in neenakomerna debelina premaza na lakiranih kosih</li>
<li><strong>Vidna debelina premaza na obešalih</strong> — ko naslaga preseže 1–2 mm na pritrditvenih točkah</li>
<li><strong>Povečana masa obešal</strong> — transportni sistemi so preobremenjeni, poraba energije se povečuje</li>
<li><strong>Odpadanje barve</strong> — stari premazi se odlušče med lakiranjem in kontaminirajo sveže lakirane kose</li>
</ul>
<p>Strokovnjaki priporočajo razlakiranje obešal vsakih 3–6 mesecev pri intenzivni produkciji, enkrat letno pri manjši obremenitvi.</p>

<h2>Ekonomska analiza razlakiranja obešal</h2>
<p>Pogosta dilema: kupiti nova obešala ali razlakiriti obstoječa? Analiza stroškov jasno kaže v prid razlakiranja:</p>
<ul>
<li>Strošek razlakiranja serije obešal je praviloma 15–30% cene novih obešal</li>
<li>Razlakirano obešalo ohrani enako funkcionalnost kot novo</li>
<li>Zmanjša se stopnja zavrnitev lakiranih kosov — neposredni prihranek v produkciji</li>
<li>Manjša masa obešal po razlakiranju pomeni nižjo porabo energije na konvejerju</li>
</ul>

<h2>Razlakiranje aluminijastih obešal brez deformacij</h2>
<p>Aluminijasta obešala so posebno izziv pri razlakiranju, saj se aluminij pri visokih temperaturah hitro deformira. URVIS Razlakiranje Kovin D.O.O. za aluminijasta obešala in košare uporablja napravo TD, ki z nadzorovano nizkotermično karbonizacijo pri 270–450°C zagotavlja temeljito razlakiranje brez kakršnih koli deformacij ali sprememb dimenzij.</p>

<h2>Razlakiranje košar in transportne opreme</h2>
<p>Poleg obešal razlakiramo vse vrste transportne opreme lakirnih linij: košare, voziči, klešče, nosilci in pritrditvene naprave. Naša visoka kapaciteta in fleksibilni roki zagotavljajo, da vaša lakirna linija ne trpi zastojev zaradi vzdrževanja opreme.</p>

<h2>Kakovostni standardi in sledljivost</h2>
<p>Za stranke z zahtevami ISO 9001 ali IATF 16949 vodimo evidenco o vsaki izvedeni operaciji razlakiranja. Dokumentirani zapisi o temperaturi, času obdelave in vizualni kontroli zagotavljajo sledljivost, ki je ključna za ohranjanje certifikacij kakovosti.</p>
  `,

  useCasesTitle: "Kdo potrebuje razlakiranje obešal?",
  useCases: [
    { title: "Lakirnice prašnega barvanja", desc: "Podjetja z linijami prašnega barvanja morajo redno razlakiriti obešala za ohranjanje kakovosti premaza in zmanjšanje zavrnitev." },
    { title: "Avtomobilski dobavitelji", desc: "Lakirnice v avtomobilski dobavni verigi z visokimi zahtevami po kakovosti in sledljivosti procesa." },
    { title: "Pohištvena industrija", desc: "Lakirnice pohištvene industrije z intenzivno produkcijo, kjer se obešala menjajo večkrat dnevno." },
    { title: "Kmetijska mehanizacija", desc: "Lakirnice za kmetijsko mehanizacijo, kjer se lakirajo veliki, težki deli in so obešala izpostavljena visokim obremenitvam." },
    { title: "Splošna industrija", desc: "Vsako podjetje z lastno lakirnico ali kooperacijskim dostopom do lakirnice, ki želi podaljšati življenjsko dobo obešal." },
    { title: "Servisni ponudniki", desc: "Kooperativne lakirnice, ki ponujajo storitve lakiranja in potrebujejo zanesljivega partnerja za vzdrževanje obešal." },
  ],

  faq: [
    { q: "Kako pogosto je treba razlakiriti obešala v lakirnici?", a: "Pri intenzivni produkciji (3+ lakirnih ciklov dnevno) priporočamo razlakiranje vsakih 2–3 mesece. Pri manjši obremenitvi je dovolj enkrat do dvakrat letno." },
    { q: "Ali se razlakiranje izvede brez poškodbe kljuk in pritrditvenih elementov?", a: "Da. Termično razlakiranje razgradi le organske premaze, ne pa kovinskih elementov. Kljuke, vijaki in drugi kovinski deli obešal ostanejo nepoškodovani." },
    { q: "Kako velik je minimalni nalog za razlakiranje obešal?", a: "Razlakiramo serije vseh velikosti, od posameznih obešal do celotnih paletnih tovorov. Kontaktirajte nas za cenitev." },
    { q: "Koliko časa traja razlakiranje serije obešal?", a: "Standardna serija je razlakirana v 1–2 delovnih dnevih od prevzema. Za prednostno obdelavo se dogovorimo individualno." },
    { q: "Ali URVIS razlakiruje tako jeklena kot aluminijasta obešala?", a: "Da. Jeklena obešala obdelujemo v napravi Dinamec (420°C), aluminijasta in mešana v napravi TD (270–450°C). Vsaka vrsta materiala dobi optimalen postopek." },
    { q: "Ali je mogoče organizirati redno periodično razlakiranje?", a: "Da, z večino naših strank imamo dogovorjene redne termine prevzema in dostave, prilagojene produkcijskemu ciklu lakirnice." },
  ],

  ctaTitle: "Dogovorite se za razlakiranje obešal",
  ctaDesc: "Pokličite ali pišite — skupaj bomo določili optimalni urnik vzdrževanja obešal za vašo lakirnico in zagotovili nemoteno produkcijo.",
};

export default function LandingRazlakiranjeObesal() {
  return <LandingPageLayout data={data} />;
}
