"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

/**
 * Zemljevid zadetkov (Leaflet + OpenStreetMap). Leaflet se uvozi šele v
 * useEffect, ker ob uvozu prime window — SSR bi padel. Koordinate so centroid
 * kraja ("približno"), zato se markerji istega kraja razmaknejo v majhen
 * krog, da niso naloženi eden na drugem.
 */

export type ZemljevidTocka = {
  id: string;
  lat: number;
  lng: number;
  cena: number | null;
  naslov: string | null;
};

const pobegli = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

export function Zemljevid({
  tocke,
  sredisce,
}: {
  tocke: ZemljevidTocka[];
  sredisce?: { lat: number; lng: number; km: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let koncano = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (koncano || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      const skupina = L.featureGroup();
      const poKljucu = new Map<string, number>();
      for (const t of tocke) {
        const kljuc = `${t.lat.toFixed(4)}|${t.lng.toFixed(4)}`;
        const i = poKljucu.get(kljuc) ?? 0;
        poKljucu.set(kljuc, i + 1);
        // Razmik istoležnih markerjev v spiralo (~200 m na korak).
        const kot = i * 2.4;
        const r = i === 0 ? 0 : 0.0018 * Math.sqrt(i);
        const lat = t.lat + r * Math.cos(kot);
        const lng = t.lng + r * Math.sin(kot) * 1.4;

        const ikona = L.divIcon({
          className: "",
          html: `<div style="background:#6d5df6;color:#fff;font:700 11px system-ui;padding:2px 7px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35)">${
            t.cena !== null ? `${Math.round(t.cena / 1000)}k` : "?"
          }</div>`,
          iconSize: undefined,
        });
        L.marker([lat, lng], { icon: ikona })
          .bindPopup(
            `<a href="/nepremicnine/oglas/${t.id}" style="font-weight:600">${pobegli(t.naslov ?? "Oglas")}</a><br>${
              t.cena !== null ? `${Math.round(t.cena).toLocaleString("sl-SI")} €` : ""
            }`
          )
          .addTo(skupina);
      }
      skupina.addTo(map);

      if (sredisce) {
        L.circle([sredisce.lat, sredisce.lng], {
          radius: sredisce.km * 1000,
          color: "#6d5df6",
          weight: 1.5,
          fillOpacity: 0.05,
        }).addTo(map);
      }

      const meje = skupina.getBounds();
      if (sredisce) map.setView([sredisce.lat, sredisce.lng], sredisce.km <= 10 ? 11 : sredisce.km <= 25 ? 10 : 9);
      else if (meje.isValid()) map.fitBounds(meje.pad(0.1));
      else map.setView([46.05, 14.5], 8);
    })();
    return () => {
      koncano = true;
      map?.remove();
    };
  }, [tocke, sredisce]);

  return <div ref={ref} className="relative z-0 h-[560px] w-full rounded-2xl border border-zinc-200 bg-zinc-50" />;
}
