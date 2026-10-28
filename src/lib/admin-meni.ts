import type { PermissionKey } from "@/lib/permissions/registry";

/**
 * Meni admina na enem mestu (Luka, 28. 10. 2026: »naredi zdj celo to kodo tim mal bolj simple pa razumljivo
 * kak pridet do česa pa da se ne ponavljajo neke stvari … pa da se kaj ne zgubi«). Vsak razdelek je ena točka
 * v stranskem meniju; njegove strani so zavihki na vrhu (Zavihki.tsx). Stranski meni in zavihki berejo samo
 * ta seznam, zato se ne moreta razhajati.
 *
 * `poti`: druge strani, ki spadajo v razdelek (podstrani, stari naslovi), da je v meniju označen pravi.
 */

export type Zavihek = { label: string; href: string; poti?: string[] };

export type Razdelek = {
  kljuc: string;
  label: string;
  href: string;
  permission: PermissionKey | null;
  skupina?: string;
  zavihki?: Zavihek[];
  poti?: string[];
};

export const RAZDELKI: Razdelek[] = [
  { kljuc: "danes", label: "Danes", href: "/admin", permission: "dashboard.view" },
  {
    kljuc: "maili",
    label: "Maili",
    href: "/admin/maili",
    permission: "promotion.view",
    poti: [
      "/admin/prodajna-ekipa/odobritev",
      "/admin/prodajna-ekipa/poslano-kodatim",
      "/admin/prodajna-ekipa/posiljatelj",
      "/admin/prodajna-ekipa/bralec_odgovorov",
      "/admin/e-posta",
    ],
    zavihki: [
      { label: "Za poslat", href: "/admin/maili", poti: ["/admin/prodajna-ekipa/odobritev", "/admin/prodajna-ekipa/poslano-kodatim"] },
      { label: "Poslano", href: "/admin/prodajna-ekipa/posiljatelj" },
      { label: "Odgovori", href: "/admin/prodajna-ekipa/bralec_odgovorov" },
    ],
  },
  {
    kljuc: "kompletko",
    label: "Kompletko – panik gumb",
    href: "/admin/prodajna-ekipa/kompletko",
    permission: "promotion.view",
    poti: ["/admin/prodajna-ekipa/poslano"],
  },
  {
    kljuc: "stranke",
    label: "Stranke",
    href: "/admin/lead-intelligence/leads",
    permission: "lead_intelligence.view",
    poti: ["/admin/lead-intelligence", "/admin/leads"],
    zavihki: [
      { label: "Vsi leadi", href: "/admin/lead-intelligence/leads" },
      { label: "Pregled baze", href: "/admin/lead-intelligence" },
      { label: "Iz klepeta", href: "/admin/leads" },
      { label: "Uvoz", href: "/admin/lead-intelligence/import", poti: ["/admin/lead-intelligence/discovery"] },
    ],
  },
  {
    kljuc: "iskanje",
    label: "Iskanje podjetij",
    href: "/admin/register-podjetij",
    permission: "crm.view",
    poti: [
      "/admin/lead-skrejp",
      "/admin/priloznosti",
      "/admin/prodajna-ekipa/problemi",
      "/admin/prodajna-ekipa/panoge",
      "/admin/prodajna-ekipa/drevo",
    ],
    zavihki: [
      { label: "Register podjetij", href: "/admin/register-podjetij" },
      { label: "Lead skrejp", href: "/admin/lead-skrejp" },
      { label: "Priložnosti", href: "/admin/priloznosti" },
      { label: "Problemi", href: "/admin/prodajna-ekipa/problemi" },
      { label: "Panoge", href: "/admin/prodajna-ekipa/panoge" },
      { label: "Drevo panog", href: "/admin/prodajna-ekipa/drevo" },
    ],
  },
  {
    kljuc: "prodaja",
    label: "Prodaja",
    href: "/admin/promocije",
    permission: "promotion.view",
    poti: ["/admin/prodajni-coach"],
    zavihki: [
      { label: "Promocije", href: "/admin/promocije" },
      { label: "Prodajni coach", href: "/admin/prodajni-coach" },
    ],
  },
  {
    kljuc: "harvey",
    label: "Harvey – ekipa",
    href: "/admin/prodajna-ekipa",
    permission: "promotion.view",
  },
  {
    kljuc: "izvedba",
    label: "Izvedba",
    href: "/admin/demo-strani",
    permission: "crm.view",
    poti: ["/admin/render"],
    zavihki: [
      { label: "Spletne strani in aplikacije", href: "/admin/demo-strani" },
      { label: "Render", href: "/admin/render" },
    ],
  },
  {
    kljuc: "partnerji",
    label: "Partnerji",
    href: "/admin/partnerji",
    permission: "partner.view",
    poti: ["/admin/provizije"],
    zavihki: [
      { label: "Partnerji", href: "/admin/partnerji" },
      { label: "Provizije", href: "/admin/provizije" },
    ],
  },
  { kljuc: "uporabniki", label: "Uporabniki", href: "/admin/uporabniki", permission: "users.manage", skupina: "Nastavitve" },
  { kljuc: "vloge", label: "Vloge", href: "/admin/vloge", permission: "roles.manage", skupina: "Nastavitve" },
  { kljuc: "nadzor", label: "Nadzor zbiralnikov", href: "/admin/nadzor", permission: "dashboard.view", skupina: "Nastavitve" },
  // Arhiv: Podjetja (Firecrawl v tabelo `companies`, ki je nihče drug ne bere) — ostane, a ni v ospredju.
  { kljuc: "arhiv", label: "Arhiv: podjetja", href: "/admin/podjetja", permission: "crm.view", skupina: "Nastavitve" },
];

function ujema(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Najdaljša ujemajoča se pot med danimi (najbolj točna), ali -1. */
export function dolzinaUjemanja(pathname: string, poti: string[]): number {
  return Math.max(-1, ...poti.filter((p) => ujema(pathname, p)).map((p) => p.length));
}

/** Razdelek, kateremu pripada stran, in njen zavihek (za zavihke na vrhu). */
export function razdelekZa(pathname: string): { razdelek: Razdelek; zavihek: Zavihek | null } | null {
  let najboljsi: { razdelek: Razdelek; zavihek: Zavihek | null; d: number } | null = null;
  for (const r of RAZDELKI) {
    const d = dolzinaUjemanja(pathname, [r.href, ...(r.poti ?? [])]);
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
