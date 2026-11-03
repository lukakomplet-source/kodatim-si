"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { razdelekZa } from "@/lib/admin-meni";

/**
 * Zavihki razdelka na vrhu vsake strani (iz src/lib/admin-meni.ts), npr. Komunikacija: Pregled · Poslano · Odgovori.
 * Strani razdelka so tako vedno ena poleg druge; razdelek z eno samo stranjo zavihkov nima.
 * `dovoljeni`: zavihki, ki jih uporabnik sme videti (layout jih izračuna iz meniZa), kot href zavihka → stran,
 * na katero zanj vodi (npr. Ljudje → /admin/vloge); brez tega vsi.
 */
export function Zavihki({ dovoljeni }: { dovoljeni?: Record<string, string> }) {
  const pathname = usePathname();
  const najdeno = razdelekZa(pathname);
  const zavihki = (najdeno?.razdelek.zavihki ?? []).filter((z) => !dovoljeni || z.href in dovoljeni);
  if (zavihki.length < 2) return null;
  return (
    <nav aria-label={najdeno?.razdelek.label} className="-mx-1 mb-6 overflow-x-auto pb-1">
      <ul className="flex min-w-max gap-1.5 px-1">
        {zavihki.map((z) => {
          const aktiven = najdeno?.zavihek?.href === z.href;
          return (
            <li key={z.href}>
              <Link
                href={dovoljeni?.[z.href] ?? z.href}
                aria-current={aktiven ? "page" : undefined}
                className={`block rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition ${
                  aktiven
                    ? "bg-zinc-900 text-white ring-zinc-900"
                    : "bg-white text-zinc-600 ring-zinc-200 hover:text-zinc-900 hover:ring-zinc-400"
                }`}
              >
                {z.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
