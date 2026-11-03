"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { imeStrani } from "@/lib/admin-meni";

/**
 * Naslov zavihka v brskalniku za vsako stran admina: »Zavihek · Razdelek · KodaTim« (iz src/lib/admin-meni.ts).
 * Nekatere strani imajo svoj metadata.title, ki ga Next nastavi po navigaciji; opazovalec naslova ga zato
 * vsakič znova postavi na naše ime.
 */
export function NaslovStrani() {
  const pathname = usePathname();

  useEffect(() => {
    const ime = imeStrani(pathname);
    if (!ime) return;
    const naslov = `${ime} · KodaTim`;
    const postavi = () => {
      if (document.title !== naslov) document.title = naslov;
    };
    postavi();
    const opazovalec = new MutationObserver(postavi);
    opazovalec.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => opazovalec.disconnect();
  }, [pathname]);

  return null;
}
