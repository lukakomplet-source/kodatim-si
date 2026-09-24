import "server-only";
import { join, resolve, sep } from "node:path";
import { createAvtonetClient } from "@/lib/avtonet/db";
import type { RenderNaloga, RenderRezultat, RenderVhod, RenderVrsta } from "@/lib/renderOznake";

/**
 * Render (kodatim.si/render) — branje in pisanje vrste nalog ter varne poti do
 * datotek na D:.
 *
 * Stran NIKOLI ne računa: naloge samo vpiše v `render_naloge` (lokalna baza),
 * delo opravi worker-render na grafični tega računalnika. Datoteke živijo na
 * D:\kodatim-render (C: ima premalo prostora), stran pa jih streže, ker teče
 * na istem računalniku.
 */

export const RENDER_MAPA = process.env.RENDER_MAPA ?? "D:\\kodatim-render";

export const STOLPCI =
  "id, vrsta, status, naziv, vhod, parametri, napredek, faza, rezultat, napaka, vir, vir_url, ustanova, licenca, objavljeno, ustvarjeno, zacetek, konec";

/** Dovoljene končnice: slike in videi s telefona/fotoaparata. */
export const KONCNICE_SLIK = ["jpg", "jpeg", "png", "tif", "tiff", "webp", "bmp"];
export const KONCNICE_VIDEA = ["mp4", "mov", "m4v", "avi", "mkv", "webm", "3gp"];

export function koncnica(ime: string): string {
  return (ime.split(".").pop() ?? "").toLowerCase();
}

/** Ime datoteke brez poti in nevarnih znakov; končnica ostane. */
export function cistoIme(ime: string): string | null {
  const osnova = ime.split(/[\\/]/).pop() ?? "";
  const ciste = osnova
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-100);
  const k = koncnica(ciste);
  if (!ciste || ![...KONCNICE_SLIK, ...KONCNICE_VIDEA].includes(k)) return null;
  return ciste;
}

/**
 * Relativna pot (npr. "izhod/12/drsnik.jpg") -> absolutna pot na D:, ali null.
 *
 * Pot pride iz URL-ja, zato je sumljiva: dovolimo samo mapi vhod/ in izhod/ in
 * po razrešitvi preverimo, da smo še vedno znotraj njiju — "../" bi sicer
 * odprl karkoli na disku.
 */
export function varnaPot(rel: string): string | null {
  if (!/^(vhod|izhod)\/[A-Za-z0-9._\-/]+$/.test(rel) || rel.includes("..")) return null;
  const koren = resolve(/* turbopackIgnore: true */ RENDER_MAPA);
  const pot = resolve(/* turbopackIgnore: true */ join(koren, ...rel.split("/")));
  const dovoljeno = [join(koren, "vhod") + sep, join(koren, "izhod") + sep];
  return dovoljeno.some((d) => pot.startsWith(d)) ? pot : null;
}

const UTRIP = process.env.RENDER_UTRIP ?? "C:\\Users\\lukak\\avtonet-db\\render.utrip";

export type StanjeDelavca = { besedilo: string; starostS: number } | null;

/**
 * Kaj delavec ta hip počne, iz njegovega utripa.
 *
 * Brez tega je naloga „V vrsti“ lahko pomenila dvoje — da delavec dela
 * prejšnjo, ali da sploh ne teče — in iz strani se ne bi dalo ločiti.
 */
export async function stanjeDelavca(): Promise<StanjeDelavca> {
  try {
    const { readFile } = await import("node:fs/promises");
    const vsebina = (await readFile(/* turbopackIgnore: true */ UTRIP, "utf8")).trim();
    const presledek = vsebina.indexOf(" ");
    const cas = Date.parse(vsebina.slice(0, presledek));
    if (!Number.isFinite(cas)) return null;
    return { besedilo: vsebina.slice(presledek + 1), starostS: Math.round((Date.now() - cas) / 1000) };
  } catch {
    return null;
  }
}

export async function seznamNalog(koliko = 100): Promise<RenderNaloga[]> {
  const { data, error } = await createAvtonetClient()
    .from("render_naloge")
    .select(STOLPCI)
    .order("id", { ascending: false })
    .limit(koliko);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RenderNaloga[];
}

export async function preberiNalogo(id: number): Promise<RenderNaloga | null> {
  const { data, error } = await createAvtonetClient().from("render_naloge").select(STOLPCI).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as RenderNaloga) ?? null;
}

export async function objavljeneNaloge(): Promise<RenderNaloga[]> {
  const { data, error } = await createAvtonetClient()
    .from("render_naloge")
    .select(STOLPCI)
    .eq("objavljeno", true)
    .eq("status", "koncano")
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RenderNaloga[];
}

/** Vse poti, ki jih izdelek pokaže navzven (datoteke in par za drsnik). */
export function potiIzdelka(r: RenderRezultat | null): string[] {
  if (!r) return [];
  return [...(r.datoteke ?? []).map((d) => d.pot), ...(r.primerjava ? [r.primerjava.levo, r.primerjava.desno] : [])];
}

/**
 * Ali sme datoteko videti obiskovalec brez prijave.
 *
 * Samo izdelki objavljenih nalog — izvirnikov (vhod/) javno ne strežemo
 * nikoli: to so fotografije ustanov, objava izdelka z navedbo vira pa ni isto
 * kot razdeljevanje izvirnika.
 */
export async function datotekaJavna(rel: string): Promise<boolean> {
  if (!rel.startsWith("izhod/")) return false;
  const objavljene = await objavljeneNaloge();
  return objavljene.some((n) => potiIzdelka(n.rezultat).includes(rel));
}

export type NovaNaloga = {
  vrsta: RenderVrsta;
  naziv: string | null;
  vhod: RenderVhod[];
  parametri: Record<string, unknown>;
  vir: string | null;
  vir_url: string | null;
  ustanova: string | null;
  licenca: string | null;
};

export async function ustvariNalogo(n: NovaNaloga): Promise<number> {
  const { data, error } = await createAvtonetClient()
    .from("render_naloge")
    .insert({ ...n, status: "caka" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: number }).id;
}

export async function posodobiNalogo(id: number, polja: Record<string, unknown>): Promise<void> {
  const { error } = await createAvtonetClient()
    .from("render_naloge")
    .update({ ...polja, posodobljeno: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    // Pravilo objave je v bazi (check constraint) — prevedemo ga v človeški jezik.
    if (error.message.includes("render_objava_zahteva_vir")) {
      throw new Error("Za objavo morajo biti izpolnjeni vir, ustanova in licenca.");
    }
    throw new Error(error.message);
  }
}
