import { LandingPageLayout, LandingData } from "@urvis/components/LandingPageLayout";
const heroImg = "/urvis-assets/7_1785240910679.jpg";

const data: LandingData = {
  metaTitle: "Odstranjevanje praškaste barve | URVIS — termično in popolno",
  metaDesc: "Profesionalno odstranjevanje praškaste barve s kovinskih površin. Pirolizni postopek pri 420°C odstrani vse plasti, vključno z najtrdnejšimi poliesterskimi premazi. Brezplačna ponudba.",
  canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/odstranjevanje-praskaste-barve`,
  keyword: "odstranjevanje praškaste barve",
  schema: {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Odstranjevanje praškaste barve",
    description: "Termično odstranjevanje praškaste barve s kovinskih površin v fluidizirani kremenčevi mivki pri 420°C. Popolno čiščenje brez kemikalij.",
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
    serviceType: "Odstranjevanje praškaste barve",
  },

  heroImage: heroImg,
  badge: "Re-work specialist · Slovenija",
  h1: "ODSTRANJEVANJE",
  h1accent: "PRAŠKASTE BARVE",
  sub: "Popolno termično odstranjevanje polimerizirane praške barve vseh vrst — epoksi, poliester, poliuretan. Brez kemikalij, brez ostankov, brez poškodb kovine.",

  stats: [
    { value: "100%", label: "Vse plasti barve" },
    { value: "420°C", label: "Temperatura mivke" },
    { value: "1–2", label: "Delovna dneva" },
  ],

  benefitsTitle: "Prednosti termičnega odstranjevanja praškaste barve",
  benefits: [
    { icon: "check", title: "Vse vrste premazov", desc: "Naprava Dinamec odstrani vse organske premaze — epoksi, poliester, poliuretan, akril, večslojne sisteme — brez izjeme." },
    { icon: "shield", title: "Brez kemičnih odpadkov", desc: "Termični postopek ne ustvarja nevarnih tekočih odpadkov. Idealno za podjetja, ki iščejo okolju odgovorno rešitev za re-work." },
    { icon: "zap", title: "Hitro in zanesljivo", desc: "Od prevzema do oddaje v 1–2 delovnih dnevih. Naša kapaciteta omogoča hitro obdelavo serij vseh velikosti." },
    { icon: "settings", title: "Dimenzijska natančnost", desc: "Po odstranjevanju praškaste barve ostanejo kovinski deli dimenzijsko nespremenjeni — pripravljeni za ponovni nanos premaza." },
  ],

  processTitle: "Odstranjevanje praškaste barve: korak za korakom",
  processIntro: "Naš preizkušen postopek zagotavlja popolno čiščenje premazov pri vseh vrstah praških barv in debelinah nanosov.",
  steps: [
    { title: "Prejem in klasifikacija", desc: "Preverimo vrsto praške barve, debelino nanosov in vrsto kovinskega substrata. Izberemo ustrezno napravo in parametre." },
    { title: "Termično razlakiranje", desc: "Deli se potopijo v fluidizirani sloj kremenčeve mivke pri 420°C (jeklo) ali 270–450°C (aluminij). Praška barva razpade v hlapno fazo." },
    { title: "Sežig hlapov", desc: "Hlapni produkti razpada praške barve se sežgejo v sekundarnem kanalu pri 850–900°C. Emisije so minimalne in ustrezajo EU standardom." },
    { title: "Mehansko čiščenje", desc: "Ostanki mivke se odstranijo z vseh površin, vključno z notranjimi. Deli so čisti do kovine." },
    { title: "Izpustnica in oddaja", desc: "Kontrola površin in oddaja z dokumentacijo. Deli so pripravljeni za peskanje in ponovni nanos praške barve." },
  ],

  contentTitle: "Praška barva in re-work: kako zmanjšate stroške zavrnitev",
  contentHTML: `
<p>Praško barvanje je danes prevladujoča metoda zaščite kovinskih površin. Daje trpežen premaz in je ekološko sprejemljivejše od tekočih lakov. A vsaka lakirnica se srečuje z neizbežnim pojavom: zavrnjenimi kosi — deli z napačno barvo, napačno debelino premaza, estetskimi napakami ali napačno nanesenimi premazi. Ustrezno odstranjevanje praškaste barve in re-work sta ključna za zmanjšanje stroškov in odpadkov.</p>

<h2>Zakaj je polimerizirana praška barva tako zahtevna za odstranjevanje?</h2>
<p>Praška barva po polimerizaciji (v peči pri 160–200°C) tvori izjemno trden, kemično odporen polimerni film. Standardna kemična topila ne delujejo. Mehansko čiščenje (brušenje) je počasno, ne doseže notranjih površin in ne zagotavlja enakomerne čistosti. Edina metoda, ki zanesljivo in popolno odstrani polimerizirano praško barvo, je <strong>termično razlakiranje v fluidizirani kremenčevi mivki</strong>.</p>

<h2>Katere vrste praških barv se odstranijo s piroliznim postopkom?</h2>
<ul>
<li><strong>Epoksi praške barve</strong> — odlična korozijska zaščita, pogosto v baznih premazih; termično razlakiranje jih popolnoma razgradi</li>
<li><strong>Poliesterske praške barve (GFL)</strong> — najpogostejše v industriji; pri 420°C se popolnoma razgradijo</li>
<li><strong>Poliuretan praške barve</strong> — visok sijaj, trdnost; popolno razlakiranje v fluidizirani mivki</li>
<li><strong>Epoksi-poliesterski hibridni sistemi</strong> — kombinacije; en prehod skozi napravo Dinamec zadostuje za popolno čiščenje</li>
<li><strong>Večslojni sistemi</strong> — podlaga + dekorativni premaz; brez omejitev glede debeline ali števila plasti</li>
</ul>

<h2>Re-work razlakiranje: prihranite dragocene kovinske dele</h2>
<p>Vsak zavrnjen del, ki bi ga sicer zavrgli, ima tržno vrednost. V avtomobilski in strojni industriji so kovinski deli pogosto dragi. Z re-work razlakiranjem pri URVIS Razlakiranje Kovin D.O.O. pokrijete celoten spekter napak:</p>
<ul>
<li>Napačna RAL barva ali odtenek</li>
<li>Premaz prenesen ali preveč debel</li>
<li>Estetske napake (kraterji, kapljice, vključki)</li>
<li>Mehanske poškodbe premaza med transportom ali montažo</li>
<li>Zastarela formulacija premaza, ki zahteva posodobitev</li>
</ul>
<p>Po re-work razlakiranju so deli čisti do kovine in pripravljeni za peskanje ter ponovni nanos praške barve. Vrednost kovinskega dela je ohranjena.</p>

<h2>Praška barva v odpadkih: stabilizacija odpadne praškaste barve</h2>
<p>Poleg re-work razlakiranja je ključen vidik upravljanja s praško barvo ravnanje z odpadno praško barvo iz filtrov in ciklonov lakirnic. URVIS nudi <a href="/stabilizacija">termično stabilizacijo odpadne praškaste barve</a> — nevarna odpravna barva se pretvori v nenevaren industrijski odpadek.</p>
  `,

  useCasesTitle: "Kdaj potrebujete odstranjevanje praškaste barve?",
  useCases: [
    { title: "Napačna barva ali RAL odtenek", desc: "Del je lakirano v napačni barvi. Po termičnem razlakiranju se naneste pravilna barva — brez izgube kovinskega dela." },
    { title: "Poškodbe premaza med transportom", desc: "Kovinski deli so bili poškodovani med transportom ali montažo. Razlakiranje in ponovni nanos premaza je hitrejši od naročila novega dela." },
    { title: "Prevelika debelina premaza", desc: "Deli z predebelim premazom ne ustrezajo tolerancam. Razlakiranje in nov nanos pravilne debeline reši problem." },
    { title: "Sprememba specifikacij", desc: "Kupec je spremenil zahteve po barvi ali tipu premaza. Stari premaz se odstrani, nanese se nov skladen s specifikacijo." },
    { title: "Estetske napake premaza", desc: "Kraterji, ribe oči, vključki prahu — estetske napake, ki zahtevajo odstranitev celotnega premaza in ponovni nanos." },
    { title: "Vzdrževanje lakirnih obešal", desc: "Redno odstranjevanje nabranega premaza z obešal za ohranjanje kakovosti lakiranja in podaljšanje življenjske dobe obešal." },
  ],

  faq: [
    { q: "Ali je mogoče odstraniti praško barvo samo z dela površine?", a: "Termično razlakiranje se izvede na celotnem delu, ne le na delu površine. Za lokalno odstranjevanje obstajajo kemične ali mehanske alternative, ki pa so manj popolne." },
    { q: "Koliko plasti praške barve je mogoče odstraniti v enem postopku?", a: "Brez omejitev. V enem postopku se popolnoma odstranijo vse plasti premazov, ne glede na debelino ali število nanosov." },
    { q: "Ali je termično odstranjevanje praškaste barve primerno za aluminijaste dele?", a: "Da. Za aluminijaste dele se uporablja naprava TD s temperaturo 270–450°C, ki preprečuje deformacije aluminija." },
    { q: "Kako se razlikuje termično odstranjevanje od kemičnega?", a: "Termično je popolnejše (doseže notranje površine), ekološko (ni kemičnih odpadkov), hitrejše in varnejše za delavce. Kemično je primerno le za posamezne kose ali temperaturno občutljive materiale." },
    { q: "Ali po razlakiranju kovinska površina zahteva peskanje?", a: "Peskanje po razlakiranju je priporočljivo za optimalno adhezijo novega premaza. Razlakiranje odstrani organske premaze, peskanje pa ustvari ustrezno mikrohrapavost za nov premaz." },
    { q: "Kakšna je minimalna serija za re-work razlakiranje?", a: "Razlakiramo serije vseh velikosti, vključno s posameznimi kosi. Kontaktirajte nas za cenitev." },
  ],

  ctaTitle: "Oddajte napačno lakirane dele v re-work razlakiranje",
  ctaDesc: "Prihranite vrednost kovinskih delov z re-work razlakiranjem. Hitro, zanesljivo, brez kemikalij. Pokličite ali pišite za ponudbo.",
};

export default function LandingOdstranjevanjePraskastiBarve() {
  return <LandingPageLayout data={data} />;
}
