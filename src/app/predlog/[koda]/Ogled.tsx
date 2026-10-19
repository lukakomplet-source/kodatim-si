"use client";

import { useEffect } from "react";

/**
 * Šteje ogled predloga, ko je stran vsaj 4 sekunde vidna — enkrat na zavihek.
 * Pregledovalniki povezav v e-pošti strani ne gledajo tako dolgo, zato jih
 * ne štejemo kot človeka, ki je predlog odprl.
 */
export function Ogled({ koda }: { koda: string }) {
  useEffect(() => {
    const kljuc = `predlog-ogled:${koda}`;
    try {
      if (sessionStorage.getItem(kljuc) === "1") return;
    } catch {
      // zasebno okno brez shrambe: štejemo vseeno
    }
    let casovnik: number | undefined;
    const zazeni = () => {
      window.clearTimeout(casovnik);
      if (document.visibilityState !== "visible") return;
      casovnik = window.setTimeout(() => {
        document.removeEventListener("visibilitychange", zazeni);
        try {
          sessionStorage.setItem(kljuc, "1");
        } catch {
          // brez shrambe se ogled lahko šteje znova ob osvežitvi
        }
        void fetch(`/predlog/${koda}/ogled`, { method: "POST", keepalive: true }).catch(() => null);
      }, 4000);
    };
    zazeni();
    document.addEventListener("visibilitychange", zazeni);
    return () => {
      window.clearTimeout(casovnik);
      document.removeEventListener("visibilitychange", zazeni);
    };
  }, [koda]);
  return null;
}
