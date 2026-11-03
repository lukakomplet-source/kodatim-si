import "server-only";
import { createLeadClient } from "@/lib/leadDb";
import { hrefPodjetja, jeBrezplacna } from "@/lib/podjetja/kljuc";
import { preberiPodjetja, zaPosel } from "@/lib/podjetja/podatki";

export { jeBrezplacna };

/**
 * Povezava na podjetje v Komunikaciji: od faze 6 kartica podjetja (/admin/podjetja/<davčna>), če ga povezani
 * seznam pozna; sicer kartica leada (najprej po e-naslovu, nato po domeni v spletni strani), sicer njihova stran
 * (domena). Brez pravice za leade namesto kartice leada domena.
 *
 * Brezplačni ponudniki pošte (gmail.com, siol.net …) niso domena podjetja: taka vrstica ima ključ po celem
 * e-naslovu, išče se samo po e-naslovu in nikoli ne vodi na https://gmail.com ali na lead s to »spletno stranjo«.
 */

export type Povezava = { href: string; zunanja: boolean };
type Vrstica = { email?: string | null; domena?: string | null };

const DOMENA = /^[a-z0-9][a-z0-9.-]{0,80}\.[a-z]{2,}$/;

/** Domena podjetja iz e-naslova; "" za neveljavno ali brezplačno (gmail.com, siol.net …). */
export function domenaIz(email: string): string {
  const d = (email ?? "").split("@")[1]?.trim().toLowerCase() ?? "";
  return DOMENA.test(d) && !jeBrezplacna(d) ? d : "";
}

function domenaVrstice(v: Vrstica): string {
  const d = (v.domena ?? "").trim().toLowerCase();
  if (d && DOMENA.test(d) && !jeBrezplacna(d)) return d;
  return domenaIz(v.email ?? "");
}

function hostIz(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Ključ vrstice v slovarju povezav: domena podjetja, pri brezplačni pošti cel e-naslov. */
export function kljucPodjetja(v: Vrstica): string {
  return domenaVrstice(v) || (v.email ?? "").trim().toLowerCase();
}

/** Povezava za vrstico: najprej po e-naslovu, nato po domeni. */
export function povezavaZa(povezave: Map<string, Povezava>, v: Vrstica): Povezava | undefined {
  const e = (v.email ?? "").trim().toLowerCase();
  return (e ? povezave.get(e) : undefined) ?? povezave.get(kljucPodjetja(v));
}

/** Ključi so domene podjetij in e-naslovi (kartica leada po e-naslovu ima prednost). */
export async function povezavePodjetij(vrstice: Vrstica[], smeLeade: boolean): Promise<Map<string, Povezava>> {
  const izid = new Map<string, Povezava>();
  const domene = [...new Set(vrstice.map(domenaVrstice).filter(Boolean))];
  for (const d of domene) izid.set(d, { href: `https://${d}`, zunanja: true });
  if (!vrstice.length) return izid;

  // Phase 6: the company card (/admin/podjetja/<davčna>) when the company is in the joined index; whoever reads
  // Komunikacija may open Podjetja (both are guarded by kompletko.view). The lead card and the domain stay as
  // the fallback for a row the index does not know.
  const indeks = await preberiPodjetja().catch(() => null);
  if (indeks) {
    for (const v of vrstice) {
      const e = (v.email ?? "").trim().toLowerCase();
      const kljuc = kljucPodjetja(v);
      const najdeno = (e ? indeks.poKljucu.get(e) : undefined) ?? (kljuc ? indeks.poKljucu.get(kljuc) : undefined);
      // Everyone in Komunikacija sees Kompletko; KodaTim only with the lead permission (same as the card).
      const p = najdeno ? zaPosel(najdeno, smeLeade, true) : null;
      if (!p) continue;
      const povezava = { href: hrefPodjetja(p.kljuc), zunanja: false };
      if (e) izid.set(e, povezava);
      if (kljuc) izid.set(kljuc, povezava);
    }
  }
  if (!smeLeade) return izid;

  const emaili = [...new Set(vrstice.map((v) => (v.email ?? "").trim().toLowerCase()).filter((e) => e.includes("@")))];
  try {
    const db = createLeadClient();
    const poEmailu: { id: string; email: string | null }[] = [];
    for (let i = 0; i < emaili.length; i += 100) {
      const { data } = await db.from("intel_leads").select("id, email").in("email", emaili.slice(i, i + 100));
      poEmailu.push(...((data ?? []) as typeof poEmailu));
    }
    const poStrani: { id: string; website: string | null }[] = [];
    for (let i = 0; i < domene.length; i += 60) {
      const kos = domene.slice(i, i + 60);
      const { data } = await db
        .from("intel_leads")
        .select("id, website")
        .or(kos.map((d) => `website.ilike.*${d}*`).join(","))
        .limit(500);
      poStrani.push(...((data ?? []) as typeof poStrani));
    }
    for (const z of poEmailu) {
      const e = (z.email ?? "").toLowerCase();
      if (e && (!izid.has(e) || izid.get(e)!.zunanja)) {
        izid.set(e, { href: `/admin/lead-intelligence/leads/${z.id}`, zunanja: false });
      }
    }
    // By website only with an exact host match (»trans.si« never takes the lead of »bitrans.si«).
    const iskane = new Set(domene);
    const zeLead = new Set<string>();
    for (const z of poStrani) {
      const h = hostIz(z.website);
      if (h && iskane.has(h) && !zeLead.has(h) && izid.get(h)?.zunanja !== false) {
        izid.set(h, { href: `/admin/lead-intelligence/leads/${z.id}`, zunanja: false });
        zeLead.add(h);
      }
    }
  } catch {
    // Lead database down: the domain links stay.
  }
  return izid;
}
