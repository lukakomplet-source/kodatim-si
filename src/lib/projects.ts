export type ProjectFeature = {
  title: string;
  description: string;
  visual: "dashboard" | "route-calculator" | "chatbot" | "phone" | "invoices";
  screenshot?: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
};

export type ProjectScreenshot = {
  src: string;
  alt: string;
  caption: string;
};

export type Project = {
  slug: string;
  tag: string;
  title: string;
  summary: string;
  gradient: string;
  status: "live" | "in-progress";
  cover?: string;
  client?: string;
  challenge?: string;
  features?: ProjectFeature[];
  results?: string[];
  screenshots?: ProjectScreenshot[];
};

export const PROJECTS: Project[] = [
  {
    slug: "escortops",
    tag: "Web aplikacija",
    title: "EscortOps — operativna platforma",
    summary:
      "Nadzorna plošča, obračuni in AI asistent za podjetje z varnostnim spremstvom po Evropi.",
    gradient: "from-accent-2/25 via-accent/15 to-transparent",
    status: "live",
    cover: "/reference/escortops/dashboard.png",
    client:
      "Mednarodno podjetje, ki zagotavlja varnostno spremstvo tovornega prometa po Evropi.",
    challenge:
      "Ekipa je usklajevala naloge, vozila, voznike in obračune ročno — prek e-pošte, klicev in preglednic, raztreseno po več državah. Vsak nov agent se je postopkov učil od začetka, informacije pa so bile razpršene.",
    features: [
      {
        title: "Nadzorna plošča v realnem času",
        description:
          "En pogled na vse naloge — koliko jih je v teku, koliko čaka in koliko je zaključenih — skupaj s stanjem računov agentov in zadnjimi aktivnostmi.",
        visual: "dashboard",
        screenshot: {
          src: "/reference/escortops/dashboard.png",
          alt: "Nadzorna plošča EscortOps",
          width: 2000,
          height: 999,
        },
      },
      {
        title: "Pregledni obračuni agentov",
        description:
          "Vsak račun ima svoj status, rok in zgodovino. Lestvica top agentov in mesečni zaslužek se posodabljata samodejno.",
        visual: "invoices",
        screenshot: {
          src: "/reference/escortops/racuni.png",
          alt: "Računi agentov EscortOps",
          width: 2000,
          height: 999,
        },
      },
      {
        title: "AI izračun cene poti",
        description:
          "Vpišete le začetno in končno točko. Sistem izračuna razdaljo in čas po odsekih, upošteva plačljive predore ter predlaga ceno na podlagi dejanskih podatkov z zemljevida.",
        visual: "route-calculator",
        screenshot: {
          src: "/reference/escortops/ai-izracun.png",
          alt: "AI izračun cene poti EscortOps",
          width: 2000,
          height: 999,
        },
      },
      {
        title: "AI asistent z bazo znanja",
        description:
          "Agenti v klepetu vprašajo za postopek in dobijo natančna navodila iz baze znanja podjetja, ki se sproti dopolnjuje. Po potrebi se v pogovor vključi tudi človek.",
        visual: "chatbot",
        screenshot: {
          src: "/reference/escortops/klepet.png",
          alt: "AI klepet EscortOps",
          width: 2000,
          height: 999,
        },
      },
      {
        title: "Mobilna aplikacija za teren",
        description:
          "Vozniki in spremljevalci na terenu beležijo prihode, postanke in stroške ter neposredno iz aplikacije nalagajo fotografije dokumentov.",
        visual: "phone",
      },
    ],
    results: [
      "En sistem namesto razpršenih preglednic in e-pošte.",
      "Obračuni agentov so pregledni in sledljivi od oddaje do izplačila.",
      "Novi agenti se postopka naučijo prek AI asistenta, brez dodatnega usposabljanja.",
      "Baza znanja raste z vsakim novim primerom, brez poseganja v kodo.",
    ],
  },
  {
    slug: "realtyradar",
    tag: "Web & mobilna aplikacija",
    title: "RealtyRadar — platforma za nepremičnine",
    summary:
      "Iskanje, virtualni ogled in rezervacija nepremičnin — na spletu in v mobilni aplikaciji.",
    gradient: "from-accent/25 via-accent-2/15 to-transparent",
    status: "live",
    cover: "/reference/realtyradar/cover.png",
    client:
      "Koncept platforme za najem in nakup nepremičnin, zgrajen kot prikaz zmožnosti za stranke iz nepremičninske panoge.",
    challenge:
      "Iskalci nepremičnin težko ocenijo prostor brez fizičnega ogleda, rezervacija pa je pogosto ločena od plačila in komunikacije z agentom — kar podaljša celoten proces.",
    features: [
      {
        title: "Iskanje po zemljevidu in filtrih",
        description:
          "Uporabnik išče po lokaciji, ceni in tipu nepremičnine neposredno na interaktivnem zemljevidu, rezultati pa se posodabljajo sproti.",
        visual: "dashboard",
        screenshot: {
          src: "/reference/realtyradar/iskanje.png",
          alt: "Iskanje nepremičnin po zemljevidu",
          width: 1271,
          height: 857,
        },
      },
      {
        title: "Podrobnosti nepremičnine in ocene",
        description:
          "Slike, opis, lokacija na mini zemljevidu, kontakt agenta in ocene preteklih strank — vse na eni strani.",
        visual: "invoices",
        screenshot: {
          src: "/reference/realtyradar/podrobnosti.png",
          alt: "Podrobnosti nepremičnine",
          width: 1266,
          height: 1130,
        },
      },
      {
        title: "Virtualni 3D ogled prostorov",
        description:
          "Interaktiven 3D ogled z vročimi točkami po sobah — stranka si ogleda prostor, še preden se dogovori za fizičen obisk.",
        visual: "chatbot",
        screenshot: {
          src: "/reference/realtyradar/virtualni-ogled.png",
          alt: "Virtualni 3D ogled nepremičnine",
          width: 1291,
          height: 865,
        },
      },
      {
        title: "Rezervacija v nekaj korakih",
        description:
          "Izbira datuma, vnos podatkov in plačilo so združeni v en jasen tok — od povpraševanja do potrjene rezervacije.",
        visual: "route-calculator",
        screenshot: {
          src: "/reference/realtyradar/rezervacija.png",
          alt: "Rezervacija nepremičnine po korakih",
          width: 1272,
          height: 856,
        },
      },
      {
        title: "Sledenje naročilom in obvestila",
        description:
          "Pregled aktivnih in preteklih rezervacij ter sprotna obvestila o plačilih, potrditvah in odpovedih.",
        visual: "invoices",
        screenshot: {
          src: "/reference/realtyradar/narocila.png",
          alt: "Naročila in obvestila v RealtyRadar",
          width: 1271,
          height: 857,
        },
      },
      {
        title: "Mobilna aplikacija",
        description:
          "Enaka izkušnja iskanja, rezervacije in plačila tudi na telefonu — s podporo za digitalne vstopnice/potrdila.",
        visual: "phone",
        screenshot: {
          src: "/reference/realtyradar/mobilna.jpg",
          alt: "Mobilna aplikacija RealtyRadar",
          width: 1254,
          height: 951,
        },
      },
    ],
    results: [
      "En sam tok od iskanja do plačane rezervacije, brez preklapljanja med orodji.",
      "Virtualni ogled zmanjša število nepotrebnih fizičnih obiskov.",
      "Stranka in agent komunicirata znotraj iste aplikacije.",
      "Enaka izkušnja na spletu in v mobilni aplikaciji.",
    ],
  },
  {
    slug: "kontex",
    tag: "Spletna stran, SEO & oglaševanje",
    title: "KONTEX d.o.o. — spletna stran, SEO in oglaševanje",
    summary:
      "Spletna stran, SEO optimizacija ključnih besed in Google oglaševanje za podjetje za odvoz odpadkov.",
    gradient: "from-accent-2/20 via-accent/10 to-transparent",
    status: "live",
    cover: "/reference/kontex/cover.png",
    client:
      "KONTEX d.o.o. — podjetje za odvoz odpadkov in najem kontejnerjev v Celju in Savinjski regiji, z več kot 30-letno tradicijo.",
    challenge:
      "Podjetje je imelo osnovno spletno prisotnost, a stran ni bila optimizirana za iskalnike niti ni jasno usmerjala obiskovalcev — tako fizičnih oseb kot podjetij — k oddaji povpraševanja.",
    features: [
      {
        title: "Jasen klic k akciji na prvi pogled",
        description:
          "Obiskovalec takoj vidi, kaj podjetje ponuja, in ima na voljo dva jasna koraka — brezplačno povpraševanje ali neposreden klic.",
        visual: "dashboard",
        screenshot: {
          src: "/reference/kontex/hero.png",
          alt: "Naslovna stran KONTEX d.o.o.",
          width: 3840,
          height: 1919,
        },
      },
      {
        title: "Ločena ponudba za fizične osebe in podjetja",
        description:
          "Gospodinjstva in podjetja imajo različne potrebe, zato stran vsakemu takoj pokaže rešitev, prilagojeno njim.",
        visual: "invoices",
        screenshot: {
          src: "/reference/kontex/segmentacija.png",
          alt: "Ponudba za fizične osebe in podjetja",
          width: 768,
          height: 1911,
        },
      },
      {
        title: "Pregledna predstavitev storitev",
        description:
          "Vsaka storitev (gradbeni šut, kosovni odpadki, zeleni odrez …) ima svojo kartico z jasnim opisom in povezavo za več informacij.",
        visual: "route-calculator",
        screenshot: {
          src: "/reference/kontex/storitve.png",
          alt: "Pregled storitev KONTEX d.o.o.",
          width: 3840,
          height: 1919,
        },
      },
      {
        title: "SEO vsebine, ki pripeljejo nova iskanja",
        description:
          "Redni blog članki, ciljani na vprašanja, ki jih stranke dejansko iščejo na Googlu, gradijo organski obisk skozi čas.",
        visual: "chatbot",
        screenshot: {
          src: "/reference/kontex/blog.png",
          alt: "Blog in SEO vsebine KONTEX d.o.o.",
          width: 769,
          height: 1896,
        },
      },
      {
        title: "Kontakt in povpraševanje na enem mestu",
        description:
          "Kontaktni podatki, obrazec za povpraševanje in zemljevid lokacije so združeni na eni strani — brez iskanja po meniju.",
        visual: "phone",
        screenshot: {
          src: "/reference/kontex/kontakt.png",
          alt: "Kontaktna stran KONTEX d.o.o.",
          width: 1167,
          height: 1900,
        },
      },
    ],
    results: [
      "Jasen klic k akciji na vrhu strani — klic ali povpraševanje v enem koraku.",
      "Ločena ponudba za fizične osebe in podjetja poveča relevantnost za oba tipa strank.",
      "SEO optimizacija ključnih besed in redne blog vsebine pripeljejo nova iskanja na Googlu.",
      "Google oglaševanje dodatno pospeši prihod novih povpraševanj.",
    ],
  },
  {
    slug: "spletna-trgovina",
    tag: "E-trgovina",
    title: "Spletna trgovina",
    summary:
      "Rešitev za prodajo izdelkov s celotnim naročniškim tokom in plačili.",
    gradient: "from-accent/25 via-accent-2/15 to-transparent",
    status: "in-progress",
  },
];

export function getProjectBySlug(slug: string) {
  return PROJECTS.find((project) => project.slug === slug);
}
