import { LandingPageLayout, LandingData } from "@urvis/components/LandingPageLayout";
const heroImg = "/urvis-assets/9_1785240767158.jpg";

const data: LandingData = {
  metaTitle: "Čiščenje kovinskih delov | URVIS — industrijsko čiščenje s pirolizo",
  metaDesc: "Industrijsko čiščenje kovinskih delov s piroliznim postopkom. Odstranjujemo barve, laki, organske usedline in premaze z jekla, aluminija in cinka. Slovenija.",
  canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/ciscenje-kovinskih-delov`,
  keyword: "čiščenje kovinskih delov",
  schema: {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Čiščenje kovinskih delov",
    description: "Industrijsko čiščenje kovinskih delov s piroliznim postopkom. Odstranjevanje barv, lakov, organskih premazov in usedlin z jekla, aluminija in cinka.",
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
    serviceType: "Industrijsko čiščenje kovinskih delov",
  },

  heroImage: heroImg,
  badge: "Industrijsko čiščenje · Slovenija",
  h1: "ČIŠČENJE",
  h1accent: "KOVINSKIH DELOV",
  sub: "Popolno industrijsko čiščenje kovinskih delov — odstranjevanje barv, lakov, organskih usedlin in premazov s piroliznim postopkom brez kemikalij.",

  stats: [
    { value: "100%", label: "Površinska čistost" },
    { value: "420°C", label: "Temperatura mivke" },
    { value: "30+", label: "Let izkušenj" },
  ],

  benefitsTitle: "Zakaj je pirolizno čiščenje kovinskih delov superiornejše",
  benefits: [
    { icon: "check", title: "Popolna čistost", desc: "Fluidizirani sloj prodre v vsako poro, zarezo in notranjo površino. Kovinski deli so po čiščenju popolnoma čisti do aktivne kovine." },
    { icon: "recycle", title: "Podaljšana življenjska doba", desc: "Pravilno očiščeni kovinski deli so pripravljeni za novi premaz in nadaljnjo življenjsko dobo. Recikliranje brez izgube kakovosti." },
    { icon: "leaf", title: "Ekološko odgovorno", desc: "Termični postopek brez kemičnih odpadkov. Sekundarno zgorevanje pri 850–900°C zagotavlja čiste emisije." },
    { icon: "truck", title: "Prilagodljivi roki", desc: "Zmogljive procesne linije zagotavljajo hitro obdelavo. Roki prilagodljivi vašim produkcijskim potrebam." },
  ],

  processTitle: "Čiščenje kovinskih delov: naš postopek",
  processIntro: "Sistematičen in preizkušen postopek industrijskega čiščenja kovinskih delov za vse vrste materialov in premazov.",
  steps: [
    { title: "Ocena materiala", desc: "Identificiramo vrsto kovine in premazov. Preverimo dimenzijsko stanje in morebitne posebnosti delov." },
    { title: "Izbira postopka", desc: "Glede na material izberemo napravo: Dinamec (420°C) za jeklo, TD (270–450°C) za aluminij in cink." },
    { title: "Pirolizno čiščenje", desc: "Deli gredo v fluidizirani sloj, kjer se organski premazi in usedline termično razgradijo. Čas obdelave 20–60 min." },
    { title: "Sežig in filtracija", desc: "Hlapni produkti se sežgejo pri 850–900°C. Keramični filtri zagotavljajo čist zrak." },
    { title: "Mehansko čiščenje in oddaja", desc: "Ostanki mivke se odstranijo. Vizualna kontrola čistosti. Dokumentirana oddaja." },
  ],

  contentTitle: "Industrijsko čiščenje kovinskih delov: poglobljeno",
  contentHTML: `
<p>Industrijsko čiščenje kovinskih delov je temeljna operacija v kovinskopredelovalni industriji. Ne glede na to, ali gre za pripravo površine pred nanosom zaščitnega premaza, vzdrževanje produkcijske opreme, ali recikliranje rabljenih kovinskih komponent — kakovost čiščenja neposredno vpliva na kakovost končnega produkta in dolgoročnost materiala.</p>

<h2>Kdaj je industrijsko čiščenje kovinskih delov nujno?</h2>
<p>Kovinski deli zahtevajo profesionalno industrijsko čiščenje v naslednjih situacijah:</p>
<ul>
<li><strong>Pred nanosom zaščitnih premazov</strong> — kovinska površina mora biti brezhibno čista za optimalno adhezijo barv, lakov in galvanskih nanosov</li>
<li><strong>Vzdrževanje produkcijske opreme</strong> — lakirna obešala, košare, orodja, kalupi in pritrjevalne naprave z nabranimi premazi</li>
<li><strong>Obnova in recikliranje</strong> — rabljeni kovinski deli, ki bodo po čiščenju dobili novo zaščitno površino</li>
<li><strong>Kakovostni nadzor</strong> — deli z neustreznimi premazi, ki zahtevajo popolno odstranitev za ponovni nanos</li>
<li><strong>Priprava za varjenje</strong> — kovine, ki jih je treba variti, morajo biti brez organskih premazov v področju vara</li>
</ul>

<h2>Čiščenje kovinskih delov in krožno gospodarstvo</h2>
<p>Evropska unija z Akcijskim načrtom za krožno gospodarstvo (2020) spodbuja podaljšanje življenjske dobe materialov. Industrijsko čiščenje kovinskih delov je ključen del tega cikla:</p>
<ul>
<li>Kovinski del z dotrajano ali napačno površinsko obdelavo ni odpadek — je surovina za obnovo</li>
<li>Po piroliznem čiščenju je kovinska osnova nedotaknjena in pripravljena za nov zaščitni premaz</li>
<li>Obnova kovinskih delov porabi bistveno manj energije kot proizvodnja novih</li>
<li>Zmanjšanje kovinskih odpadkov v industrijskih procesih</li>
</ul>

<h2>Čiščenje kovinskih delov za avtomobilsko industrijo</h2>
<p>Avtomobilska industrija in njeni dobavitelji imajo posebno zahtevne standarde za površinsko čistost kovinskih delov. URVIS Razlakiranje Kovin D.O.O. zagotavlja industrijsko čiščenje kovinskih delov v skladu z zahtevami dobaviteljev avtomobilske industrije, vključno z:</p>
<ul>
<li>Dokumentiranim postopkom z evidenco temperatur in časov obdelave</li>
<li>Sledljivostjo za vsako serijo</li>
<li>Standardiziranim vizualnim pregledom površin</li>
<li>Skladnostjo z zahtevami IATF 16949 in ISO 9001</li>
</ul>

<h2>Čiščenje kovinskih delov za kmetijsko mehanizacijo</h2>
<p>Proizvajalci kmetijske mehanizacije in strojev pogosto potrebujejo čiščenje kovinskih delov med sezonami ali pri obnovi servisnih delov. URVIS Razlakiranje Kovin D.O.O. s svojo lokacijo v Šentjurju in na Laze pri Dramljah pokriva kmetijsko intenzivno panonsko regijo in celotno Slovenijo.</p>

<h2>Kakovost površine po piroliznem čiščenju</h2>
<p>Po piroliznem čiščenju je kovinska površina:
<ul>
<li>Brez vseh organskih premazov in usedlin</li>
<li>Dimenzijsko nespremenjena</li>
<li>Pripravljena za peskanje, fosfatiranje ali neposredni nanos novih premazov</li>
<li>Brez kemičnih kontaminantov (ni ostankov topil ali kemikalij)</li>
</ul>
</p>
  `,

  useCasesTitle: "Industrijska področja čiščenja kovinskih delov",
  useCases: [
    { title: "Avtomobilska industrija", desc: "Čiščenje kovinskih komponent vozil in delov za dobavitelje — z dokumentiranim postopkom in sledljivostjo za ISO/IATF zahteve." },
    { title: "Strojegradnja", desc: "Čiščenje strojnih delov, ohišij, osi in kovinskih sklopov za obnovo ali zamenjavo zaščitnih premazov." },
    { title: "Kmetijska mehanizacija", desc: "Obnova kovinskih delov kmetijskih strojev — čiščenje in priprava za nov zaščitni premaz med sezonami vzdrževanja." },
    { title: "Kovinska industrija", desc: "Čiščenje transportnih in procesnih kovinskih elementov v kovinsko-predelovalnih podjetjih." },
    { title: "Gradbena industrija", desc: "Čiščenje kovinskih gradbenih elementov, pritrdilnih sistemov in arhitekturnih kovinskih delov za obnovo." },
    { title: "Pohištvena industrija", desc: "Čiščenje kovinskih okvirjev, nogic in komponent pohištva pri spremembi barve ali obnovi serije." },
  ],

  faq: [
    { q: "Kateri kovinski deli so primerni za industrijsko čiščenje s pirolizo?", a: "Jekleni, železni, aluminijasti in cinkovi deli ter zlitine. Izjeme so deli s plastičnimi, gumijastimi ali elektronskimi vstavki, ki se pred obdelavo odstranijo." },
    { q: "Koliko časa traja industrijsko čiščenje kovinskih delov?", a: "Standardne serije so pripravljene v 1–2 delovnih dnevih. Za manjše serije je pogosto mogoče zagotoviti oddajo isti dan." },
    { q: "Ali URVIS zagotavlja dokumentacijo o čiščenju za ISO certifikat?", a: "Da. Za stranke z zahtevami ISO 9001 ali IATF 16949 vodimo evidenco o temperaturi, času obdelave in vizualnem pregledu." },
    { q: "Ali je čiščenje primerno za drobne dele z zahtevno geometrijo?", a: "Da. Fluidizirani sloj prodre v vse odprtine, navoje in notranje kanale. Pirolizno čiščenje je posebej učinkovito prav za zapletene geometrije." },
    { q: "Kaj se zgodi z organskimi ostanki med čiščenjem?", a: "Organski premazi razpadejo v hlapno fazo pri 420°C in se sežgejo v sekundarnem kanalu pri 850–900°C. Nastajajo le minimalni anorganski pepelasti ostanki." },
    { q: "Ali je potrebno peskanje po piroliznem čiščenju?", a: "Peskanje po razlakiranju je priporočljivo, kadar bo del dobil nov zaščitni premaz. Peskanje ustvari mikrohrapavost za boljšo adhezijo premaza." },
  ],

  ctaTitle: "Zahtevajte ponudbo za čiščenje kovinskih delov",
  ctaDesc: "Pokličite ali pišite. Skupaj bomo poiskali optimalno rešitev za čiščenje vaših kovinskih delov — hitro, ekonomično in ekološko.",
};

export default function LandingCiscenieKovinskihDelov() {
  return <LandingPageLayout data={data} />;
}
