import { LandingPageLayout, LandingData } from "@urvis/components/LandingPageLayout";
const heroImg = "/urvis-assets/hero_fire.jpg";

const data: LandingData = {
  metaTitle: "Razlakiranje kovin | URVIS — pirolizno razlakiranje v fluidizirani mivki",
  metaDesc: "Profesionalno razlakiranje kovin s piroliznim postopkom pri 420°C. Jeklo, aluminij, cink. Hitro, brez kemikalij, z 30+ leti izkušenj. Povpraševanje brezplačno.",
  canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/razlakiranje-kovin`,
  keyword: "razlakiranje kovin",
  schema: {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Razlakiranje kovin",
    description: "Industrijsko pirolizno razlakiranje kovinskih delov v fluidizirani kremenčevi mivki pri 420°C. Primerno za jeklo, aluminij in cink.",
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
    serviceType: "Pirolizno razlakiranje kovin",
  },

  heroImage: heroImg,
  badge: "30+ let izkušenj · Slovenija",
  h1: "RAZLAKIRANJE",
  h1accent: "KOVIN",
  sub: "Industrijsko pirolizno razlakiranje v fluidizirani kremenčevi mivki pri 420°C. Popolno odstranjevanje vseh organskih premazov brez kemikalij, brez poškodb kovine.",

  stats: [
    { value: "420°C", label: "Temperatura mivke" },
    { value: "30+", label: "Let tradicije" },
    { value: "100%", label: "Organski premazi" },
  ],

  benefitsTitle: "Zakaj je pirolizno razlakiranje kovin najboljša izbira",
  benefits: [
    { icon: "check", title: "Popolno razlakiranje", desc: "Fluidizirani sloj kremenčeve mivke prodre v vse pore, navoje in notranje površine. Rezultat je površina brez organskih ostankov." },
    { icon: "leaf", title: "Brez kemikalij", desc: "Celoten postopek poteka brez kemičnih raztopin. Ni nevarnih kemičnih odpadkov, ki bi zahtevali posebno ravnanje." },
    { icon: "shield", title: "Brez poškodb", desc: "Kovinski material ohrani prvotne dimenzije in mehanske lastnosti. Jeklo, aluminij in cink se ne deformirajo pri pravilno nastavljenih temperaturah." },
    { icon: "zap", title: "Visoka zmogljivost", desc: "Tri procesne linije zagotavljajo hitro obdelavo serij vseh velikosti — od posameznih kosov do velikih industrijskih serij." },
  ],

  processTitle: "Kako poteka razlakiranje kovin pri URVIS",
  processIntro: "Od prevzema do oddaje — pregleden, hiter in kakovosten postopek razlakiranja za vsako vrsto kovinskega materiala.",
  steps: [
    { title: "Prevzem in pregled", desc: "Ob prevzemu pregledamo material, ocenimo vrsto premazov in dimenzije delov. Vsak prevzem je dokumentiran." },
    { title: "Klasifikacija materiala", desc: "Jekleni deli gredo v napravo Dinamec (420°C), aluminijasti in cinkovi pa v napravo TD (270–450°C)." },
    { title: "Pirolizno razlakiranje", desc: "Deli se potopijo v fluidizirano kremenčevo mivko. Organski premazi termično razpadejo v 20–60 minutah." },
    { title: "Sekundarno zgorevanje", desc: "Sproščeni hlapni organski spojini se sežgejo pri 850–900°C za čiste emisije brez dioxinov in furanov." },
    { title: "Kontrola in oddaja", desc: "Vizualni pregled, mehanski postopek čiščenja in dokumentacija. Razlakirani deli so pripravljeni za nadaljnjo obdelavo." },
  ],

  contentTitle: "Razlakiranje kovin: celostna industrijska rešitev",
  contentHTML: `
<p>Razlakiranje kovin je industrijski postopek odstranjevanja barv, lakov, premazov in organskih snovi s kovinskih površin. V sodobni kovinskopredelovalni industriji je razlakiranje temeljni korak pri vzdrževanju opreme, recikliranju komponent in pripravi površin za nove zaščitne premaze.</p>

<h2>Pirolizno razlakiranje: zakaj je zlati standard</h2>
<p>Med vsemi metodami razlakiranja kovin (termično, kemično, mehansko) je pirolizno razlakiranje v fluidizirani kremenčevi mivki prepoznano kot najučinkovitejše za industrijsko rabo. Naprava Dinamec pri URVIS Razlakiranje Kovin D.O.O. deluje na principu fluidizirane kremenčeve mivke pri natančno nadzorovani temperaturi 420°C.</p>
<p>Fluidizirani sloj — mivka, ki se obnaša kot tekočina — zagotavlja enakomerno porazdelitev toplote na celotni površini obdelovanca. To pomeni popolno razlakiranje tudi na notranjih površinah, v navojih, zarezah in zaprtih profilih, kjer nobena druga metoda ne doseže primerljivih rezultatov.</p>

<h2>Razlakiranje kovin v praksi: kdo potrebuje to storitev?</h2>
<p>Razlakiranje kovin je ključna storitev za podjetja v naslednjih panogah:</p>
<ul>
<li><strong>Lakirnice in podjetja s prašnim barvanjem</strong> — redno razlakiranje obešal in košar za ohranjanje kakovosti lakiranja</li>
<li><strong>Avtomobilska industrija in dobavitelji</strong> — re-work napačno lakiranih kovinskih komponent</li>
<li><strong>Kmetijska mehanizacija</strong> — obnova in recikliranje kovinskih delov strojev</li>
<li><strong>Pohištvena in gradbena industrija</strong> — razlakiranje kovinskih okvirjev, profilov in konstrukcijskih elementov</li>
<li><strong>Splošna strojegradnja</strong> — čiščenje orodij, kalupov in pritrdilnih naprav</li>
</ul>

<h2>Razlakiranje jekla, aluminija in cinka</h2>
<p>URVIS Razlakiranje Kovin D.O.O. razlakiruje vse vrste industrijskih kovin:</p>
<ul>
<li><strong>Jeklo in jekleni deli</strong> — obešala, košare, kovani in varjeni deli; obdelava v napravi Dinamec pri 420°C</li>
<li><strong>Aluminij in aluminijeve zlitine</strong> — profili, odlitki, natisnjeni deli; obdelava v napravi TD pri nižjih temperaturah</li>
<li><strong>Cink in cinkove zlitine</strong> — tlačni odlitki, nosilci, pritrdilni elementi; specializirana nizkotermična obdelava</li>
</ul>
<p>Ключno načelo: vsaka vrsta kovine zahteva specifično temperaturo in postopek razlakiranja. Naša ekipa bo za vaše dele izbrala optimalne parametre obdelave.</p>

<h2>Ekološki vidik razlakiranja kovin</h2>
<p>Sekundarni zgorevalni kanal pri 850–900°C zagotavlja, da iz naprave Dinamec ne uhajajo škodljivi hlapni organski spojini. Postopek ne ustvarja tekočih kemičnih odpadkov. Emisije ustrezajo zahtevam Direktive EU o industrijskih emisijah (IED). Razlakiranje kovin pri URVIS je okolju prijazna alternativa kemičnemu razlakiranju.</p>
  `,

  useCasesTitle: "Primeri razlakiranja kovin iz prakse",
  useCases: [
    { title: "Razlakiranje lakirnih obešal", desc: "Redno razlakiranje obešal za ohranjanje dobrega električnega kontakta, dimenzijske natančnosti in kakovosti lakiranja." },
    { title: "Re-work napačno lakiranih delov", desc: "Kovinski deli z napačno barvo, debelino premaza ali estetskimi napakami se razlakirajo in ponovno lakirajo — brez zavrnitve." },
    { title: "Obnova kovinskih komponent", desc: "Deli z dotrajano površinsko obdelavo se razlakirajo, pripravijo za peskanje in opremijo z novim zaščitnim premazom." },
    { title: "Razlakiranje kalupov in orodij", desc: "Kovinska orodja in kalupi, ki so se premazali z barvo med procesom, se razlakirajo za natančno delovanje." },
    { title: "Aluminijaste košare in profili", desc: "Aluminijasti transportni elementi in profili se razlakirajo v napravi TD brez tveganja deformacij." },
    { title: "Kmetijska in industrijska oprema", desc: "Kovinski deli strojev za kmetijstvo in splošno industrijo se razlakirajo za obnovo in podaljšanje življenjske dobe." },
  ],

  faq: [
    { q: "Kateri materiali so primerni za razlakiranje kovin?", a: "Razlakiramo jeklo, železo, aluminij, cink in njihove zlitine. Za vsak material izberemo ustrezno napravo in temperaturo: Dinamec (420°C) za jeklo, TD (270–450°C) za aluminij in cink." },
    { q: "Kako hitro je izvedeno razlakiranje kovin?", a: "Standardne serije so razlakirane v 1–3 delovnih dnevih od prevzema. Za manjše količine je pogosto mogoče zagotoviti razlakiranje isti dan." },
    { q: "Ali razlakiranje poškoduje kovino?", a: "Ne. Pravilno izvedeno pirolizno razlakiranje ne poškoduje kovinske strukture. Deli ohranijo prvotne dimenzije in mehanske lastnosti." },
    { q: "Kakšne so cene razlakiranja kovin?", a: "Cena je odvisna od vrste materiala, obsega in vrste premazov. Kontaktirajte nas za brezplačno ponudbo za vašo specifično potrebo." },
    { q: "Ali URVIS razlakiruje za podjetja iz celotne Slovenija?", a: "Da. Pokrivamo celotno območje Slovenija in del regije. Za večje stranke organiziramo prevzem in dostavo materiala." },
    { q: "Ali je pirolizno razlakiranje okolju prijazno?", a: "Da. Sekundarni zgorevalni kanal pri 850–900°C zagotavlja čiste emisije. Ni kemičnih odpadkov. Postopek ustreza zahtevam Direktive EU o industrijskih emisijah." },
  ],

  ctaTitle: "Zahtevajte ponudbo za razlakiranje kovin",
  ctaDesc: "URVIS Razlakiranje Kovin D.O.O. — vaš zanesljiv partner za industrijsko razlakiranje v Slovenji. Pišite ali pokličite za hitro ponudbo.",
};

export default function LandingRazlakiranjeKovin() {
  return <LandingPageLayout data={data} />;
}
