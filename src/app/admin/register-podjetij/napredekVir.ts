"use client";

import { useSyncExternalStore } from "react";
import type { Napredek } from "@/lib/registerPodjetij";

/**
 * En sam vir napredka za celo stran.
 *
 * Zakaj ne vsak svojega: ploščice na vrhu so se izrisale ob nalaganju strani
 * in ostale zamrznjene, spodnja vrstica pa se je osveževala vsako minuto — po
 * uri odprte strani je zgoraj pisalo 18.337 obdelanih, spodaj pa 35.241. Dve
 * različni številki za isto stvar sta slabši od ene starejše.
 *
 * Zakaj ne dve neodvisni komponenti s svojim poizvedovanjem: to bi bili dve
 * zahtevi na minuto za isti podatek in številki bi se še vedno lahko razšli za
 * en cikel. Tu je ena poizvedba, en podatek, oba prikaza.
 */

type Poslusalec = () => void;

let stanje: Napredek | null = null;
let zeZacelo = false;
const poslusalci = new Set<Poslusalec>();
let stoparica: ReturnType<typeof setInterval> | null = null;
let zadnjaOsvezitev = 0;

/** Kako pogosto osvežimo, kadar je zavihek viden. */
const RAZMIK_MS = 60_000;
/** Najmanjši razmik ob vrnitvi na zavihek — Alt+Tab ne sme sprožiti poplave. */
const NAJMANJ_MS = 10_000;

function objavi(): void {
  for (const p of poslusalci) p();
}

async function osvezi(najmanjsiRazmik: number): Promise<void> {
  const zdaj = Date.now();
  if (zdaj - zadnjaOsvezitev < najmanjsiRazmik) return;
  zadnjaOsvezitev = zdaj;
  try {
    const r = await fetch("/api/admin/register-podjetij?samoNapredek=1", { cache: "no-store" });
    if (!r.ok) return;
    const telo = (await r.json()) as { napredek: Napredek | null };
    if (telo.napredek) {
      stanje = telo.napredek;
      objavi();
    }
  } catch {
    // Tiho: napredek je postranski podatek, stran mora delati brez njega.
  }
}

function zazeni(): void {
  if (!stoparica) stoparica = setInterval(() => void osvezi(0), RAZMIK_MS);
}

function ustavi(): void {
  if (stoparica) clearInterval(stoparica);
  stoparica = null;
}

function obVidnosti(): void {
  if (document.visibilityState === "visible") {
    void osvezi(NAJMANJ_MS);
    zazeni();
  } else {
    ustavi();
  }
}

function naroci(poslusalec: Poslusalec): () => void {
  poslusalci.add(poslusalec);
  if (!zeZacelo) {
    zeZacelo = true;
    document.addEventListener("visibilitychange", obVidnosti);
    if (document.visibilityState === "visible") zazeni();
  }
  return () => {
    poslusalci.delete(poslusalec);
    if (poslusalci.size === 0) {
      ustavi();
      document.removeEventListener("visibilitychange", obVidnosti);
      zeZacelo = false;
    }
  };
}

/**
 * Napredek, kot ga vidita oba prikaza. Ime je angleško, ker React
 * kljuke prepozna po predponi `use`.
 * `zacetni` je tisto, kar je izrisal
 * strežnik; ko pride prva osvežitev, jo dobita oba hkrati.
 */
export function useNapredek(zacetni: Napredek | null): Napredek | null {
  return useSyncExternalStore(
    naroci,
    () => stanje ?? zacetni,
    () => zacetni
  );
}
