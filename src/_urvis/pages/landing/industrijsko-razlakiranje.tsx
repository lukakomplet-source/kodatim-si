import { LandingPageLayout, LandingData } from "@urvis/components/LandingPageLayout";
const heroImg = "/urvis-assets/10_1785240767158.jpg";

const data: LandingData = {
  metaTitle: "Industrijsko razlakiranje | URVIS — serijska obdelava kovin",
  metaDesc: "Specializirano industrijsko razlakiranje kovin za lakirnice, avtomobilsko industrijo, strojegradnjo in kmetijsko mehanizacijo. 3 procesne linije, visoka kapaciteta. Slovenija.",
  canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/industrijsko-razlakiranje`,
  keyword: "industrijsko razlakiranje",
  schema: {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Industrijsko razlakiranje",
    description: "Industrijsko razlakiranje kovinskih delov za lakirnice, avtomobilsko industrijo, strojegradnjo in kmetijsko mehanizacijo. Visoka kapaciteta, sledljivost, kakovost.",
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
    serviceType: "Industrijsko razlakiranje kovin",
  },

  heroImage: heroImg,
  badge: "17 industrijskih partnerjev · 30+ let",
  h1: "INDUSTRIJSKO",
  h1accent: "RAZLAKIRANJE",
  sub: "Visoko zmogljivo industrijsko razlakiranje kovin za zahtevno industrijo. Tri procesne linije, sledljivost, prilagodljivost za vsak obseg produkcije.",

  stats: [
    { value: "3×", label: "Procesne linije" },
    { value: "17+", label: "Industrijskih partnerjev" },
    { value: "30+", label: "Let izkušenj" },
  ],

  benefitsTitle: "Zakaj industrija zaupa URVIS za industrijsko razlakiranje",
  benefits: [
    { icon: "factory", title: "Visoka kapaciteta", desc: "Tri procesne linije zagotavljajo visoko zmogljivost za serije vseh velikosti — od testnih nalogov do rednih industrijskih serij." },
    { icon: "settings", title: "Sledljivost procesa", desc: "Vsaka serija je dokumentirana: temperatura, čas obdelave, vizualni pregled. Izpolnjevanje zahtev ISO 9001 in IATF 16949." },
    { icon: "zap", title: "Prilagodljivi roki", desc: "Roki obdelave se prilagodijo vašemu produkcijskemu urniku. Prednostna obdelava za nujne primere po dogovoru." },
    { icon: "shield", title: "30+ let zanesljivosti", desc: "Dolgoletno partnerstvo z vodilnimi industrijskimi podjetji v Slovenji in regiji je temelj naše zanesljivosti." },
  ],

  processTitle: "Industrijsko razlakiranje: operativni model",
  processIntro: "Organiziran in predvidljiv operativni model za industrijsko razlakiranje, prilagojen potrebam serijskih nalogov.",
  steps: [
    { title: "Nalog in planiranje", desc: "Prejeto povpraševanje, ocena obsega, dogovor o roku in logistiki prevzema/dostave. Potrditev naloga z rokom." },
    { title: "Prevzem in inventura", desc: "Dokumentirani prevzem serije s popisom kosov, dimenzij in vrste materialov. Identifikacija morebitnih posebnosti." },
    { title: "Serijsko razlakiranje", desc: "Jekleni deli v Dinamec (420°C), aluminijasti in cinkovi v TD (270–450°C). Paralelne serije za visoko zmogljivost." },
    { title: "Kontrola kakovosti", desc: "Vizualni pregled vsake serije. Za stranke z ISO zahtevami: temperaturni zapisi in poročilo o kontroli." },
    { title: "Pakiranje in dostava", desc: "Razlakirani deli se pakirajo na način prevzema in vrnejo ali dostavijo stranki z dobavnico." },
  ],

  contentTitle: "Industrijsko razlakiranje: od malih serij do velikih nalogov",
  contentHTML: `
<p>Industrijsko razlakiranje kovin je storitev, ki v različnih oblikah podpira večino panog kovinskopredelovalne industrije. URVIS Razlakiranje Kovin D.O.O. je z 30+ leti izkušenj in 17+ aktivnimi industrijskimi partnerji eden najpomembnejših specializiranih ponudnikov industrijskih razlakiralnih storitev v Slovenji.</p>

<h2>Industrijska partnerstva: zakaj podjetja izbirajo URVIS</h2>
<p>Med našimi industrijskimi partnerji so podjetja iz avtomobilskega sektorja, kmetijske mehanizacije, pohištvene industrije in splošne strojegradnje. Razlogi, ki jih navajajo za dolgoletno partnerstvo:</p>
<ul>
<li><strong>Zanesljivi roki</strong> — industrijsko razlakiranje mora biti usklajeno s produkcijskim ciklom stranke; zamude niso sprejemljive</li>
<li><strong>Konstantna kakovost</strong> — vsaka serija mora biti razlakirana na enako visoko raven; nihanja niso dopustna</li>
<li><strong>Sledljivost</strong> — za podjetja z ISO certifikati je dokumentiran postopek pogoj</li>
<li><strong>Prilagodljivost</strong> — obvladujemo tako male redne naloge kot izjemno velike enkratne serije</li>
</ul>

<h2>Industrijsko razlakiranje za avtomobilski sektor</h2>
<p>Avtomobilska industrija je med zahtevnejšimi sektorji za industrijsko razlakiranje. Zahteve so specifične: natančno kontrolirane temperature, dokumentirani procesi, sledljivost po seriji in visoka kakovost čiščenja površin. URVIS Razlakiranje Kovin D.O.O. ima izkušnje z razlakiranjem za dobavitelje v avtomobilski verigi in izpolnjuje zahteve po sledljivosti in kakovosti, ki jih ta sektor zahteva.</p>

<h2>Industrijsko razlakiranje za lakirnice</h2>
<p>Lakirnice so naši najpogostejši nalogodajalci. Potreba po industrijskem razlakiranju obešal in košar je v lakirnicah redna in predvidljiva. Skupaj s stranko določimo optimalni vzdrževalni cikel — bodisi mesečni, trimesečni ali polletni — ki zagotavlja, da lakirna linija nikoli ni obremenjena z zastarelimi obešali.</p>

<h2>Industrijsko razlakiranje in ekologija</h2>
<p>Industrijsko razlakiranje pri URVIS Razlakiranje Kovin D.O.O. je zasnovano z mislijo na okolje:
<ul>
<li>Sekundarni zgorevalni kanal pri 850–900°C zagotavlja čiste emisije</li>
<li>Brez kemičnih tekočih odpadkov</li>
<li>Reciklabilnost medija (kremenčeva mivka)</li>
<li>Skladnost z Direktivo EU o industrijskih emisijah</li>
</ul>
</p>
<p>Ker je industrijsko razlakiranje del krožnega gospodarskega cikla (obnova materialov), naša dejavnost neposredno prispeva k ciljem trajnostnega razvoja EU in zmanjšanju kovinskih odpadkov.</p>

<h2>Pokritost območja: industrijsko razlakiranje po celotni Slovenji</h2>
<p>URVIS Razlakiranje Kovin D.O.O. ima dve lokaciji: sedež na Laze pri Dramljah 14 A, 3222 Dramlje, in poslovno enoto P.E. Eko Peč v Šentjurju. Z obema lokacijama pokrivamo celotno Slovenijo. Za večje industrijske stranke organiziramo prevzem in dostavo materiala neposredno na lokacijo stranke.</p>
  `,

  useCasesTitle: "Industrijska področja, ki jih pokrivamo",
  useCases: [
    { title: "Lakirnice in prašno barvanje", desc: "Redno industrijsko razlakiranje obešal, košar in transportne opreme lakirnih linij za ohranjanje kakovosti lakiranja." },
    { title: "Avtomobilska industrija", desc: "Razlakiranje kovinskih komponent in re-work napačno lakiranih delov z dokumentiranim postopkom za zahteve ISO/IATF." },
    { title: "Kmetijska mehanizacija", desc: "Industrijsko razlakiranje jeklenih in aluminijastih komponent kmetijskih strojev za obnovo med sezonami vzdrževanja." },
    { title: "Strojegradnja", desc: "Čiščenje strojnih delov, ohišij in kovinskih sklopov pred nanosom novih zaščitnih premazov ali galvanizacijo." },
    { title: "Pohištvena industrija", desc: "Industrijsko razlakiranje kovinskih komponent pohištva pri spremembi barve, sezone ali serije." },
    { title: "Gradbena industrija", desc: "Razlakiranje kovinskih gradbenih elementov, profilov in pritrdilnih sistemov pri obnovi ali recikliranju materialov." },
  ],

  faq: [
    { q: "Kakšna je maksimalna kapaciteta industrijskega razlakiranja pri URVIS?", a: "Z dvema napravama (Dinamec in TD) in tremi procesnimi linijami pokrivamo tako redne dnevne naloge kot izjemno velike enkratne serije. Za oceno kapacitete za vaš specifičen nalog kontaktirajte nas." },
    { q: "Ali URVIS zagotavlja sledljivost za ISO 9001 in IATF 16949?", a: "Da. Za stranke z zahtevami kakovostnih standardov vodimo evidenco o vsakem nalogu: temperatura, čas obdelave, vizualni pregled in dobavnica." },
    { q: "Ali je mogoče organizirati redno industrijsko razlakiranje po pogodbi?", a: "Da. Z večino industrijskih partnerjev imamo dolgoročne pogodbe z določenimi roki, kapaciteto in cenami. Kontaktirajte nas za pogovor." },
    { q: "Ali URVIS organizira prevzem pri industrijskem partnerju?", a: "Za večje stranke organiziramo prevzem materiala neposredno pri stranki in dostavo po razlakiranju. Kontaktirajte nas za dogovor o logistiki." },
    { q: "Kako URVIS zagotavlja konstantno kakovost industrijskega razlakiranja?", a: "Z nadzorovano temperaturo fluidizirane mivke, sekundarnim zgorevanjem pri 850–900°C in standardiziranim vizualnim pregledom vsake serije zagotavljamo konstantno kakovost." },
    { q: "Ali je industrijsko razlakiranje pri URVIS v skladu z okoljsko zakonodajo?", a: "Da. URVIS Razlakiranje Kovin D.O.O. deluje v skladu z vsemi zahtevami okoljske zakonodaje RS in Direktive EU o industrijskih emisijah (IED)." },
  ],

  ctaTitle: "Postanite naš industrijski partner",
  ctaDesc: "Pridružite se 17+ industrijskim partnerjem, ki zaupajo URVIS Razlakiranje Kovin D.O.O. za zanesljivo, hitro in kakovostno industrijsko razlakiranje v Slovenji.",
};

export default function LandingIndustrijskoRazlakiranje() {
  return <LandingPageLayout data={data} />;
}
