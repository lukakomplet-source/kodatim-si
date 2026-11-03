import type { PermissionKey } from "@/lib/permissions/registry";
import type { EffectivePermissions } from "@/lib/permissions/types";

/**
 * Meni admina na enem mestu (Luka, 28. 10. 2026: »naredi zdj celo to kodo tim mal bolj simple pa razumljivo
 * kak pridet do česa pa da se ne ponavljajo neke stvari … pa da se kaj ne zgubi«). Vsak razdelek je ena točka
 * v stranskem meniju; njegove strani so zavihki na vrhu (Zavihki.tsx). Stranski meni, zavihki, naslov zavihka
 * v brskalniku in »Nadaljujte, kjer ste ostali« berejo samo ta seznam, zato se ne morejo razhajati.
 *
 * Faza 3 (3. 11. 2026): 6 razdelkov (Danes, Podjetja, Komunikacija, Iskanje, Številke, Nastavitve), ki zaenkrat
 * kažejo obstoječe strani. Stari meni s 13 točkami ostane kot STARI_MENI na strani »Stari admin«.
 *
 * `poti`: druge strani, ki spadajo v razdelek ali zavihek (podstrani, stari naslovi), da je označen pravi.
 * Pri ujemanju zmaga najdaljša pot (npr. /admin/promocije/tematska je Iskanje, ne Podjetja).
 *
 * Dovoljenje zavihka je ISTO kot zapora njegove strani (zahtevajStran / requirePagePermission v page.tsx):
 * viden zavihek = stran, ki se odpre. Ko se zapora strani spremeni, popravi tudi dovoljenje tu.
 */

/**
 * null = everyone in the admin; "admin" = admin level only (legacy admin / Super Admin, i.e. a page guarded by
 * zahtevajStran() without keys); a list = any one of them is enough.
 */
export type Dovoljenje = PermissionKey | PermissionKey[] | null | "admin";

/** Kaj uporabnik sme: admin (bypass) in posamezna dovoljenja. */
export type Pravice = { admin: boolean; ima: (k: PermissionKey) => boolean };

export function praviceIz(perms: EffectivePermissions | null): Pravice {
  const admin = !!perms && !perms.neaktiven && perms.bypassAll;
  return { admin, ima: (k) => admin || (!!perms && !perms.neaktiven && perms.granted.has(k)) };
}

export type Zavihek = {
  label: string;
  href: string;
  poti?: string[];
  /** Brez tega velja dovoljenje razdelka. */
  permission?: Dovoljenje;
  /**
   * Zavihek z več stranmi, ki imajo vsaka svojo zaporo (npr. Ljudje): vodi na prvo, ki jo uporabnik sme odpreti.
   * Zavihek je viden, če sme odpreti katerokoli; `permission` se tedaj ne uporablja.
   */
  vhodi?: { href: string; permission: Dovoljenje }[];
  /** Samo za en posel: ob stikalu na drugem poslu je skrit (Luka 3. 11.: »če kliknem Kompletko, samo Kompletko«). */
  posel?: PoselMenija;
};

export type PoselMenija = "kodatim" | "kompletko";

export type Razdelek = {
  kljuc: string;
  label: string;
  href: string;
  /** Razdelek brez zavihkov je viden s tem dovoljenjem; z zavihki je viden, če je viden vsaj en zavihek. */
  permission: Dovoljenje;
  skupina?: string;
  zavihki?: Zavihek[];
  poti?: string[];
  posel?: PoselMenija;
};

/** Zavihek, kot ga vidi en uporabnik: `vhod` je stran, na katero zanj vodi (pri `vhodi` ni nujno `href`). */
export type ZavihekZaUporabnika = Zavihek & { vhod: string };
export type RazdelekZaUporabnika = Omit<Razdelek, "zavihki"> & { zavihki?: ZavihekZaUporabnika[] };

export const RAZDELKI: Razdelek[] = [
  {
    // Faza 4: vse tri strani so zaprte z zahtevajStran("dashboard.view") (src/app/admin/danes/kontekst.ts).
    kljuc: "danes",
    label: "Danes",
    href: "/admin",
    poti: ["/admin/danes"],
    permission: "dashboard.view",
    zavihki: [
      { label: "Za danes", href: "/admin", permission: "dashboard.view" },
      { label: "Klici", href: "/admin/danes/klici", permission: "dashboard.view" },
      { label: "Naslednji dnevi", href: "/admin/danes/naslednji", permission: "dashboard.view" },
    ],
  },
  {
    // Faza 6 (3. 11. 2026): /admin/podjetja/* so zaprte z zahtevajStran("lead_intelligence.view", "kompletko.view")
    // (podjetja/kontekst.ts); Prodaja Kompletko vidi samo Kompletko. Stare strani ostanejo kot svoji zavihki.
    kljuc: "podjetja",
    label: "Podjetja",
    href: "/admin/podjetja",
    permission: ["lead_intelligence.view", "promotion.view", "kompletko.view"],
    zavihki: [
      { label: "Vsa podjetja", href: "/admin/podjetja", permission: ["lead_intelligence.view", "kompletko.view"] },
      {
        label: "Priložnosti",
        href: "/admin/podjetja/priloznosti",
        permission: ["lead_intelligence.view", "kompletko.view"],
      },
      { label: "Kampanje", href: "/admin/promocije", permission: "promotion.view", posel: "kodatim" },
      { label: "Panik gumb", href: "/admin/prodajna-ekipa/kompletko", permission: "kompletko.view", posel: "kompletko" },
      // Kompletko kampanje v pripravi (3. 11. 2026, src/lib/kompletko-kampanje.ts): brez seznamov in mailov
      {
        label: "Spremstvo tovora",
        href: "/admin/kompletko-kampanje/spremstvo",
        permission: "kompletko.view",
        posel: "kompletko",
      },
      { label: "Monitoring", href: "/admin/kompletko-kampanje/monitoring", permission: "kompletko.view", posel: "kompletko" },
      {
        label: "Stranke (KodaTim)",
        href: "/admin/lead-intelligence/leads",
        permission: "lead_intelligence.view",
        posel: "kodatim",
      },
      {
        label: "Dodaj in uvozi",
        href: "/admin/podjetja/dodaj",
        poti: ["/admin/lead-intelligence/import"],
        permission: ["lead_intelligence.view", "kompletko.view"],
      },
    ],
  },
  {
    // Faza 5 (3. 11. 2026): vse tri strani so /admin/komunikacija/* z zaporo kompletko.view (kontekst.ts); KodaTim
    // del vidi samo administrator. Stari naslovi (maili, e-posta, odobritev, posiljatelj, bralec_odgovorov)
    // preusmerijo sem, zato so med `poti` zavihka, ki ga nadomesti.
    kljuc: "komunikacija",
    label: "Komunikacija",
    href: "/admin/komunikacija",
    permission: "kompletko.view",
    zavihki: [
      {
        label: "Pregled",
        href: "/admin/komunikacija",
        poti: ["/admin/maili", "/admin/e-posta", "/admin/prodajna-ekipa/odobritev", "/admin/komunikacija/osnutek"],
        permission: "kompletko.view",
      },
      {
        label: "Poslano",
        href: "/admin/komunikacija/poslano",
        poti: [
          "/admin/komunikacija/mail",
          "/admin/prodajna-ekipa/posiljatelj",
          "/admin/prodajna-ekipa/poslano",
          "/admin/prodajna-ekipa/poslano-kodatim",
        ],
        permission: "kompletko.view",
      },
      {
        label: "Odgovori",
        href: "/admin/komunikacija/odgovori",
        poti: ["/admin/komunikacija/pogovor", "/admin/komunikacija/odgovor", "/admin/prodajna-ekipa/bralec_odgovorov"],
        permission: "kompletko.view",
      },
      { label: "Iz klepeta", href: "/admin/leads", permission: "lead.view", posel: "kodatim" },
    ],
  },
  {
    kljuc: "iskanje",
    label: "Iskanje",
    href: "/admin/register-podjetij",
    poti: ["/admin/iskanje"],
    // Vse tri strani so samo za administratorje (zahtevajStran() brez ključev).
    permission: "admin",
    zavihki: [
      { label: "Register", href: "/admin/register-podjetij", poti: ["/admin/promocije/tematska"] },
      { label: "Kandidati", href: "/admin/prodajna-ekipa/problemi", posel: "kodatim" },
      { label: "Raziskave", href: "/admin/priloznosti", posel: "kodatim" },
      // Luka 3. 11.: strani, ki so bile samo »poti«, ni našel — vsaka ima zdaj svoj zavihek.
      { label: "Lead skrejp", href: "/admin/lead-skrejp", posel: "kodatim" },
      { label: "Panoge", href: "/admin/prodajna-ekipa/panoge", posel: "kodatim" },
      { label: "Drevo panog", href: "/admin/prodajna-ekipa/drevo", posel: "kodatim" },
    ],
  },
  {
    // Faza 7: /admin/stevilke (Dan in teden) je zaprta z zahtevajStran("promotion.view", "lead_intelligence.view").
    kljuc: "stevilke",
    label: "Številke",
    href: "/admin/stevilke",
    permission: ["promotion.view", "lead_intelligence.view"],
    zavihki: [
      { label: "Dan in teden", href: "/admin/stevilke", permission: ["promotion.view", "lead_intelligence.view"] },
      { label: "Lijak", href: "/admin/promocije/reports", permission: "promotion.view", posel: "kodatim" },
      // Samo /admin/lead-intelligence sam: /leads in /import sta Podjetja, /discovery Nastavitve (daljše poti zmagajo).
      { label: "Baza", href: "/admin/lead-intelligence", permission: "lead_intelligence.view", posel: "kodatim" },
    ],
  },
  {
    // Luka 3. 11. 2026: »ne najdem niti več tistih aplikacij« — skrite pod Nastavitve › Sistem jih ni videl.
    kljuc: "aplikacije",
    label: "Aplikacije",
    posel: "kodatim",
    href: "/admin/demo-strani",
    // Obe strani sta samo za administratorje (zahtevajStran() brez ključev).
    permission: "admin",
    zavihki: [
      { label: "Spletne strani in aplikacije", href: "/admin/demo-strani" },
      { label: "Render", href: "/admin/render" },
    ],
  },
  {
    kljuc: "nastavitve",
    label: "Nastavitve",
    href: "/admin/prodajna-ekipa",
    poti: ["/admin/nastavitve"],
    permission: ["users.manage", "roles.manage", "partner.view", "commission.view"],
    zavihki: [
      // Tudi dinamične /admin/prodajna-ekipa/[vloga], razen tistih, ki so naštete drugje (odobritev, posiljatelj …).
      { label: "Harvey", href: "/admin/prodajna-ekipa", permission: "admin", posel: "kodatim" },
      {
        label: "Sistem",
        href: "/admin/nadzor",
        poti: ["/admin/lead-intelligence/discovery"],
        permission: "admin",
      },
      { label: "Uporabniki", href: "/admin/uporabniki", permission: "users.manage" },
      { label: "Vloge", href: "/admin/vloge", permission: "roles.manage" },
      { label: "Partnerji", href: "/admin/partnerji", permission: "partner.view", posel: "kodatim" },
      { label: "Provizije", href: "/admin/provizije", permission: "commission.view", posel: "kodatim" },
    ],
  },
];

const MAILI: PermissionKey[] = ["promotion.view", "kompletko.view"];

/** Stari meni (do faze 3) s 13 točkami; prikazan samo na strani »Stari admin«, vse poti delajo kot prej. */
export type StaraTocka = {
  label: string;
  href: string;
  permission: Dovoljenje;
  podstrani?: { label: string; href: string }[];
};

export const STARI_MENI: StaraTocka[] = [
  { label: "Danes", href: "/admin", permission: "dashboard.view" },
  {
    label: "Maili",
    href: "/admin/komunikacija",
    permission: MAILI,
    podstrani: [
      { label: "Za poslat", href: "/admin/komunikacija" },
      { label: "Poslano", href: "/admin/komunikacija/poslano" },
      { label: "Odgovori", href: "/admin/komunikacija/odgovori" },
    ],
  },
  { label: "Kompletko – panik gumb", href: "/admin/prodajna-ekipa/kompletko", permission: MAILI },
  {
    label: "Stranke",
    href: "/admin/lead-intelligence/leads",
    permission: "lead_intelligence.view",
    podstrani: [
      { label: "Vsi leadi", href: "/admin/lead-intelligence/leads" },
      { label: "Pregled baze", href: "/admin/lead-intelligence" },
      { label: "Iz klepeta", href: "/admin/leads" },
      { label: "Uvoz", href: "/admin/lead-intelligence/import" },
    ],
  },
  {
    label: "Iskanje podjetij",
    href: "/admin/register-podjetij",
    permission: "crm.view",
    podstrani: [
      { label: "Register podjetij", href: "/admin/register-podjetij" },
      { label: "Lead skrejp", href: "/admin/lead-skrejp" },
      { label: "Priložnosti", href: "/admin/priloznosti" },
      { label: "Problemi", href: "/admin/prodajna-ekipa/problemi" },
      { label: "Panoge", href: "/admin/prodajna-ekipa/panoge" },
      { label: "Drevo panog", href: "/admin/prodajna-ekipa/drevo" },
    ],
  },
  {
    label: "Prodaja",
    href: "/admin/promocije",
    permission: "promotion.view",
    podstrani: [
      { label: "Promocije", href: "/admin/promocije" },
      { label: "Prodajni coach", href: "/admin/prodajni-coach" },
    ],
  },
  { label: "Harvey – ekipa", href: "/admin/prodajna-ekipa", permission: "promotion.view" },
  {
    label: "Izvedba",
    href: "/admin/demo-strani",
    permission: "crm.view",
    podstrani: [
      { label: "Spletne strani in aplikacije", href: "/admin/demo-strani" },
      { label: "Render", href: "/admin/render" },
    ],
  },
  {
    label: "Partnerji",
    href: "/admin/partnerji",
    permission: "partner.view",
    podstrani: [
      { label: "Partnerji", href: "/admin/partnerji" },
      { label: "Provizije", href: "/admin/provizije" },
    ],
  },
  { label: "Uporabniki", href: "/admin/uporabniki", permission: "users.manage" },
  { label: "Vloge", href: "/admin/vloge", permission: "roles.manage" },
  { label: "Nadzor zbiralnikov", href: "/admin/nadzor", permission: "crm.view" },
  // Arhiv: Podjetja (Firecrawl v tabelo `companies`, ki je nihče drug ne bere) — samo še v starem adminu.
  { label: "Arhiv: podjetja", href: "/admin/stari-admin/arhiv-podjetij", permission: "admin" },
];

/** Strani, ki niso v nobenem razdelku, a imajo svoje ime (naslov zavihka, »Nadaljujte, kjer ste ostali«). */
const DRUGE_STRANI: { label: string; href: string }[] = [
  { label: "Stari admin", href: "/admin/stari-admin" },
  { label: "Nimate dovoljenja", href: "/admin/ni-dovoljenja" },
  { label: "Prodajni coach", href: "/admin/prodajni-coach" },
  ...STARI_MENI,
];

/** Koren /admin (Danes) velja samo zase, sicer bi bila Danes vsaka stran zunaj razdelkov (npr. Prodajni coach). */
function ujema(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Najdaljša ujemajoča se pot med danimi (najbolj točna), ali -1. */
export function dolzinaUjemanja(pathname: string, poti: string[]): number {
  return Math.max(-1, ...poti.filter((p) => ujema(pathname, p)).map((p) => p.length));
}

/** Vse poti razdelka: njegova, dodatne in poti vseh zavihkov. */
export function potiRazdelka(r: Razdelek): string[] {
  return [r.href, ...(r.poti ?? []), ...(r.zavihki ?? []).flatMap((z) => [z.href, ...(z.poti ?? [])])];
}

/** Razdelek, kateremu pripada stran, in njen zavihek (za zavihke na vrhu). */
export function razdelekZa(pathname: string): { razdelek: Razdelek; zavihek: Zavihek | null } | null {
  let najboljsi: { razdelek: Razdelek; zavihek: Zavihek | null; d: number } | null = null;
  for (const r of RAZDELKI) {
    const d = dolzinaUjemanja(pathname, potiRazdelka(r));
    if (d < 0 || (najboljsi && d <= najboljsi.d)) continue;
    let zavihek: Zavihek | null = null;
    let dz = -1;
    for (const z of r.zavihki ?? []) {
      const x = dolzinaUjemanja(pathname, [z.href, ...(z.poti ?? [])]);
      if (x > dz) {
        dz = x;
        zavihek = z;
      }
    }
    najboljsi = { razdelek: r, zavihek, d };
  }
  return najboljsi ? { razdelek: najboljsi.razdelek, zavihek: najboljsi.zavihek } : null;
}

/**
 * Ime strani za ljudi: »Zavihek · Razdelek« ali »Razdelek«; za strani zunaj razdelkov ime iz starega menija.
 * null, če strani ne poznamo.
 */
export function imeStrani(pathname: string): string | null {
  const najdeno = razdelekZa(pathname);
  if (najdeno) {
    const { razdelek, zavihek } = najdeno;
    return zavihek ? `${zavihek.label} · ${razdelek.label}` : razdelek.label;
  }
  let ime: string | null = null;
  let d = -1;
  for (const s of DRUGE_STRANI) {
    const x = dolzinaUjemanja(pathname, [s.href]);
    if (x > d) {
      d = x;
      ime = s.label;
    }
  }
  return ime;
}

/** Ali uporabnik s `pravice` prestane `p` (null = vsak v adminu, "admin" = samo administrator, seznam = katerokoli). */
export function ustreza(p: Dovoljenje, pravice: Pravice): boolean {
  if (p === null) return true;
  if (p === "admin") return pravice.admin;
  return Array.isArray(p) ? p.some(pravice.ima) : pravice.ima(p);
}

/**
 * Vsa dovoljenja, ki odprejo razdelek (za zahtevajStran na kratkih poteh). "admin" ne doda ničesar:
 * administrator prestane zahtevajStran vedno, prazen seznam pa pomeni samo administrator.
 */
export function dovoljenjaRazdelka(r: Razdelek): PermissionKey[] {
  const vsa: Dovoljenje[] = [
    r.permission,
    ...(r.zavihki ?? []).flatMap((z) => (z.vhodi ? z.vhodi.map((v) => v.permission) : [z.permission ?? r.permission])),
  ];
  const seznam = vsa.flatMap((p) => (p === null || p === "admin" ? [] : Array.isArray(p) ? p : [p]));
  return [...new Set(seznam)];
}

/** Stran, na katero zavihek vodi tega uporabnika, ali null, če zavihka ne sme videti. */
function vhodZavihka(z: Zavihek, r: Razdelek, pravice: Pravice): string | null {
  if (z.vhodi) return z.vhodi.find((v) => ustreza(v.permission, pravice))?.href ?? null;
  return ustreza(z.permission === undefined ? r.permission : z.permission, pravice) ? z.href : null;
}

/**
 * Meni za enega uporabnika: samo razdelki in zavihki, ki jih sme videti. Razdelek z zavihki je viden, če je
 * viden vsaj en zavihek; če njegova prva stran zanj ni dovoljena, vodi na prvi zavihek, ki ga sme videti.
 */
/**
 * Meni za uporabnika. `posel` je stikalo (Vse / KodaTim / Kompletko): ob enem poslu so razdelki in zavihki
 * drugega posla skriti; strani same ostanejo dosegljive (povezave, Stari admin).
 */
export function meniZa(pravice: Pravice, posel: "vse" | PoselMenija = "vse"): RazdelekZaUporabnika[] {
  const zaPosel = (p?: PoselMenija) => !p || posel === "vse" || p === posel;
  return RAZDELKI.flatMap((r): RazdelekZaUporabnika[] => {
    if (!zaPosel(r.posel)) return [];
    if (!r.zavihki?.length) return ustreza(r.permission, pravice) ? [{ ...r, zavihki: undefined }] : [];
    const zavihki = r.zavihki.filter((z) => zaPosel(z.posel)).flatMap((z) => {
      const vhod = vhodZavihka(z, r, pravice);
      return vhod ? [{ ...z, vhod }] : [];
    });
    if (!zavihki.length) return [];
    const href = zavihki.some((z) => z.vhod === r.href) ? r.href : zavihki[0].vhod;
    return [{ ...r, href, zavihki }];
  });
}
