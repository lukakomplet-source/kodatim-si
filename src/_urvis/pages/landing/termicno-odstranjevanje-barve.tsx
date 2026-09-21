import { LandingPageLayout, LandingData } from "@urvis/components/LandingPageLayout";
const heroImg = "/urvis-assets/8_1785240767158.jpg";

const data: LandingData = {
  metaTitle: "Termično odstranjevanje barve | URVIS — piroliza pri 420°C",
  metaDesc: "Profesionalno termično odstranjevanje barve s kovinskih površin s piroliznim postopkom. Temperatura 420°C, sekundarno zgorevanje pri 900°C. Jeklo, aluminij, cink.",
  canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/termicno-odstranjevanje-barve`,
  keyword: "termično odstranjevanje barve",
  schema: {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Termično odstranjevanje barve",
    description: "Pirolizno termično odstranjevanje barve s kovinskih delov v fluidizirani kremenčevi mivki. Temperatura 420°C, sekundarno zgorevanje pri 850–900°C.",
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
    serviceType: "Termično odstranjevanje barve",
  },

  heroImage: heroImg,
  badge: "Pirolizna tehnologija · Dinamec & TD",
  h1: "TERMIČNO",
  h1accent: "ODSTRANJEVANJE BARVE",
  sub: "Najnaprednejša metoda termičnega odstranjevanja barve: fluidizirani sloj kremenčeve mivke pri 420°C za popolno in enakomerno čiščenje vseh vrst premazov.",

  stats: [
    { value: "420°C", label: "Temperatura Dinamec" },
    { value: "900°C", label: "Sek. zgorevanje" },
    { value: "2", label: "Naprave (Dinamec + TD)" },
  ],

  benefitsTitle: "Prednosti termičnega odstranjevanja barve s pirolizo",
  benefits: [
    { icon: "thermometer", title: "Natančen nadzor temperature", desc: "Temperatura fluidizirane mivke je natančno nadzorovana na ±5°C, kar zagotavlja optimalen razpad premazov brez pregrevanja kovine." },
    { icon: "check", title: "Enakomerna obdelava", desc: "Fluidizirani sloj zagotavlja enakomerno temperaturo na celotni površini — notranje površine, navoji in zarezani del so enako dobro obdelani kot zunanjost." },
    { icon: "leaf", title: "Čiste emisije", desc: "Sekundarni zgorevalni kanal pri 850–900°C zagotavlja popoln sežig organskih hlapov. Brez dioxinov, furanov in preostalih organskih spojin v emisijah." },
    { icon: "shield", title: "Brez strukturnih poškodb", desc: "Temperatura 420°C razgradi organske premaze, ne pa kovinske strukture. Jeklo ohrani mehanske lastnosti; aluminij se obdeluje v napravi TD pri nižjih temperaturah." },
  ],

  processTitle: "Termično odstranjevanje barve: tehnični pogled",
  processIntro: "Razumevanje postopka termičnega odstranjevanja barve vam pomaga pri odločitvi za pravo rešitev za vaše kovinske dele.",
  steps: [
    { title: "Predpriprava", desc: "Pregled delov, identifikacija materialov in premazov. Odstranitev nekovinskih elementov (guma, plastika) pred obdelavo." },
    { title: "Vstop v fluidizirani sloj", desc: "Deli se potopijo v kremenčevo mivko pri 420°C (Dinamec) ali 270–450°C (TD za aluminij). Toplota se enakomerno prenaša na celotno površino." },
    { title: "Pirolizna razgradnja", desc: "Organska barvila, veziva in dodatkovi se termično razgradijo v hlapno fazo. Čas razgradnje: 20–60 min, odvisno od debeline premaza." },
    { title: "Oksidacija v sekundarnem kanalu", desc: "Hlapni organski produkti se prenesejo v sekundarni zgorevalni kanal (850–900°C), kjer se popolnoma oksidirajo. Emisije so čiste." },
    { title: "Ohlajevanje in oddaja", desc: "Počasno ohlajanje prepreči termični šok. Mehanski postopek čiščenja in vizualni pregled pred oddajo." },
  ],

  contentTitle: "Termično odstranjevanje barve: razlika med metodami",
  contentHTML: `
<p>Termično odstranjevanje barve je eden od treh osnovnih pristopov k razlakiranju kovinskih delov (poleg kemičnega in mehanskega). Razumevanje prednosti in omejitev vsake metode je ključno za pravilno odločitev v specifičnih industrijskih situacijah.</p>

<h2>Naprava Dinamec: pirolizno termično odstranjevanje barve pri 420°C</h2>
<p>Naprava Dinamec deluje na principu fluidizirane kremenčeve mivke. Ko plini (zrak) pihamo skozi posteljo drobnih zrn mivke z zadostno hitrostjo, se mivka "fluidizira" — začne se obnašati kot tekočina. Ta tekočina z enotno temperaturo 420°C prodre v vsako odprtino obdelovanca.</p>
<p>Prednosti fluidizirane mivke za termično odstranjevanje barve:
<ul>
<li>Enakomerna temperatura na celotni površini (+/-5°C od nominalne vrednosti)</li>
<li>Visoka hitrost prenosa toplote — kratki časi obdelave</li>
<li>Dosegljivost notranjih površin, navojev in zaprtih profilov</li>
<li>Brez točkovnih pregrevanj ali hladnih točk</li>
<li>Visoka kapaciteta za serijsko obdelavo</li>
</ul>
</p>

<h2>Naprava TD: nizkotermično odstranjevanje barve za aluminij in cink</h2>
<p>Za temperaturno občutljivejše materiale (aluminij, cink, tenke pločevine) naprava TD zagotavlja termično odstranjevanje barve pri nižjih temperaturah (270–450°C). Vakuumsko oz. zaprto okolje naprave TD ščiti material pred oksidacijo med termično obdelavo.</p>
<p>Naprava TD je posebej primerna za:
<ul>
<li>Aluminijaste tlačne odlitke in profile</li>
<li>Cinkove zlitine in cinkano jeklo</li>
<li>Tanke pločevinaste elemente z zahtevnimi tolerancami</li>
<li>Materiale z nizkim tališčem, ki bi se pri 420°C deformirali</li>
</ul>
</p>

<h2>Termično vs. kemično odstranjevanje barve: primerjava</h2>
<p>Kemično odstranjevanje barve zahteva specialna kemijska sredstva (diklorometan, krezol, specialne striperice), ki razgradijo polimerno mrežo premaza. Primerjava z termičnim:</p>
<ul>
<li><strong>Popolnost čiščenja</strong>: termično boljše na notranjih površinah; kemično pogosto ne doseže globokih zarez</li>
<li><strong>Okoljski vpliv</strong>: termično brez kemičnih odpadkov; kemično zahteva ravnanje z nevarnimi tekočinami</li>
<li><strong>Varnost za delavce</strong>: termično je v zaprtem sistemu brez izpostavljenosti; kemično zahteva zaščitno opremo</li>
<li><strong>Hitrost</strong>: termično je hitrejše za serije; kemično zahteva daljšo impregnacijo</li>
<li><strong>Zakonska ureditev</strong>: nekatere kemikalije za kemično razlakiranje so v EU omejene ali prepovedane</li>
</ul>

<h2>Termično odstranjevanje barve in okoljska zakonodaja EU</h2>
<p>URVIS Razlakiranje Kovin D.O.O. deluje v skladu z vsemi zahtevami Direktive EU o industrijskih emisijah (IED). Naprava Dinamec ima sekundarni zgorevalni kanal, ki zagotavlja popoln sežig organskih hlapov pri 850–900°C. Redno merimo emisije in zagotavljamo, da vse vrednosti ostajajo v okviru zakonsko dopuščenih meja.</p>
  `,

  useCasesTitle: "Aplikacije termičnega odstranjevanja barve",
  useCases: [
    { title: "Jeklena lakirna obešala", desc: "Termično odstranjevanje nabranega premaza z jeklenih obešal za ohranjanje dimenzij in funkcionalnosti v lakirnicah." },
    { title: "Aluminijaste komponente", desc: "Nizkotermično odstranjevanje barve z aluminijastih delov brez deformacij v napravi TD." },
    { title: "Industrijska orodja in kalupi", desc: "Čiščenje kovinskih orodij in kalupov, ki so se med procesom premazali z barvo ali organskimi usedlinami." },
    { title: "Kovinski gradniki pohištva", desc: "Termično odstranjevanje premaza z okvirjev, nog in kovinskih komponent pohištva pri spremembi barve." },
    { title: "Recikliranje kovinskih delov", desc: "Čiščenje rabljenih kovinskih delov za obnovo in nanos novih zaščitnih premazov." },
    { title: "Kmetijska in gradbena oprema", desc: "Termično čiščenje kovinskih komponent strojev in gradbene opreme za vzdrževanje in obnovo." },
  ],

  faq: [
    { q: "Pri kateri temperaturi poteka termično odstranjevanje barve?", a: "Naprava Dinamec deluje pri 420°C (za jeklo). Naprava TD za aluminij in cink deluje pri 270–450°C, odvisno od vrste materiala in premazov." },
    { q: "Ali termično odstranjevanje barve pri 420°C ne poškoduje jekla?", a: "Ne. Jeklo je pri 420°C stabilno in ohrani prvotne mehanske lastnosti. Ta temperatura je optimalna za razpad organskih premazov brez sprememb mikrostrukture jekla." },
    { q: "Kako hitro je termično odstranjevanje barve?", a: "Ena procesna serija v napravi traja 20–60 minut. Od prevzema do oddaje je standardna serija pripravljena v 1–2 delovnih dnevih." },
    { q: "Ali je mogoče termično odstraniti barvo s cinkanih delov?", a: "Da. Za cinkane (vroče cinkan ali galvansko cinkane) jeklene dele se izvede termično čiščenje pri ustrezno prilagojeni temperaturi v napravi TD, da se ne poškoduje cinkove plasti." },
    { q: "Katere barve in premazi se odstranjujejo s termičnim postopkom?", a: "Vse organske barve: praška barva (epoksi, poliester, poliuretan), tekoča barva (alkidna, akrilna, poliuretanska), laki, plastični premazi in organske usedline." },
    { q: "Ali termično odstranjevanje barve povzroči oksidacijo kovine?", a: "Pri pravilno izvedeni obdelavi je oksidacija minimalna. Naprava TD za aluminij in cink deluje v zaprtem okolju, ki ščiti pred oksidacijo." },
  ],

  ctaTitle: "Povprašajte o termičnem odstranjevanju barve",
  ctaDesc: "URVIS Razlakiranje Kovin D.O.O. je specialist za termično odstranjevanje barve z napravo Dinamec in TD. Pišite ali pokličite za hitro ponudbo.",
};

export default function LandingTermicnoOdstranjevanjeBarve() {
  return <LandingPageLayout data={data} />;
}
