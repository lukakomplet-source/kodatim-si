/**
 * PODATKI IZ NEXT.JS (RSC) STRANI.
 *
 * Strani na Next.js App Routerju podatkov ne vgradijo kot navaden JSON, ampak
 * kot tok `self.__next_f.push([1,"…"])`, kjer je vsak kos JavaScript niz z
 * ubežnimi znaki. Ko nize razpakiramo in zlepimo, dobimo besedilo, v katerem
 * so objekti ("property":{…}) navaden JSON — le da niso ločeni, zato jih je
 * treba izrezati po oklepajih.
 *
 * To je ista vsebina, ki jo strežnik pošlje vsakemu obiskovalcu v HTML-ju; ne
 * kličemo nobene notranje poti.
 */
export function rscBesedilo(html: string): string {
  const kosi: string[] = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  for (const m of html.matchAll(re)) {
    try {
      kosi.push(JSON.parse(`"${m[1]}"`) as string);
    } catch {
      // Pokvarjen kos preskočimo — raje manj podatkov kot napačni.
    }
  }
  return kosi.join("");
}

/** Izreže uravnotežen objekt JSON, ki se začne na indeksu `od` (na '{'). */
export function izreziObjekt(s: string, od: number): string | null {
  let globina = 0;
  let vNizu = false;
  let ubezno = false;
  for (let i = od; i < s.length; i++) {
    const z = s[i];
    if (vNizu) {
      if (ubezno) ubezno = false;
      else if (z === "\\") ubezno = true;
      else if (z === '"') vNizu = false;
      continue;
    }
    if (z === '"') vNizu = true;
    else if (z === "{") globina++;
    else if (z === "}") {
      globina--;
      if (globina === 0) return s.slice(od, i + 1);
    }
  }
  return null;
}

/** Vsi objekti za ključem `"<kljuc>":{`, razčlenjeni. */
export function objektiPoKljucu<T = Record<string, unknown>>(besedilo: string, kljuc: string): T[] {
  const izid: T[] = [];
  const iskano = `"${kljuc}":{`;
  let i = besedilo.indexOf(iskano);
  while (i >= 0) {
    const kos = izreziObjekt(besedilo, i + iskano.length - 1);
    if (kos) {
      try {
        izid.push(JSON.parse(kos) as T);
      } catch {
        /* ni veljaven JSON — preskočimo */
      }
    }
    i = besedilo.indexOf(iskano, i + iskano.length);
  }
  return izid;
}
