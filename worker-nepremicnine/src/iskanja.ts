import type { Db } from "./db.js";
import type { Graditelj } from "./nepremicnine.js";
import { bboxOkoli, kandidatiZaSredisce, razdaljaKm } from "../../src/lib/nepremicnine/kraji.js";

/** Središče radija iz šifranta — ista pravila kot v UI (skloni, predpona). */
async function sredisceRadija(
  db: Db,
  ime: string,
  km: number
): Promise<{ lat: number; lng: number; km: number } | null> {
  const { tocni, predpona } = kandidatiZaSredisce(ime);
  for (const kandidat of tocni) {
    const { data } = await db
      .from("nep_kraji")
      .select("lat, lng")
      .eq("ime_norm", kandidat)
      .order("prebivalcev", { ascending: false, nullsFirst: false })
      .limit(1);
    if (data && data.length > 0) return { lat: Number(data[0].lat), lng: Number(data[0].lng), km };
  }
  if (predpona) {
    const { data } = await db
      .from("nep_kraji")
      .select("lat, lng")
      .like("ime_norm", `${predpona}%`)
      .order("prebivalcev", { ascending: false, nullsFirst: false })
      .limit(1);
    if (data && data.length > 0) return { lat: Number(data[0].lat), lng: Number(data[0].lng), km };
  }
  return null;
}

/**
 * Shranjena iskanja: worker po vsakem pregledu prešteje, koliko NOVIH oglasov
 * (first_seen po zadnjem ogledu) ustreza filtrom vsakega aktivnega iskanja,
 * in številko zapiše za značko "N novih" v UI.
 *
 * E-pošta: pošlje se samo, če je nastavljen RESEND_API_KEY in ima iskanje
 * vpisan e-naslov — največ enkrat dnevno na iskanje (stanje v nep_statistika,
 * isti vzorec kot avtonet 'posta': kvota živi v bazi, ne v procesu).
 */

type Iskanje = {
  id: string;
  ime: string;
  filtri: Record<string, unknown>;
  email_obvestila: string | null;
  zadnji_ogled: string | null;
  created_at: string;
};

function uporabiFiltre(q: Graditelj, f: Record<string, unknown>): Graditelj {
  if (typeof f.posel === "string") q = q.eq("posel", f.posel);
  if (Array.isArray(f.tipi) && f.tipi.length === 1) q = q.eq("tip", f.tipi[0]);
  else if (Array.isArray(f.tipi) && f.tipi.length > 1) q = q.in("tip", f.tipi);
  if (typeof f.regija === "string" && f.regija) q = q.eq("regija", f.regija);
  if (typeof f.kraj === "string" && f.kraj) q = q.ilike("kraj", `%${f.kraj}%`);
  if (typeof f.cenaMin === "number") q = q.gte("cena_eur", f.cenaMin);
  if (typeof f.cenaMax === "number") q = q.lte("cena_eur", f.cenaMax);
  if (typeof f.povrsinaMin === "number") q = q.gte("povrsina_m2", f.povrsinaMin);
  if (typeof f.povrsinaMax === "number") q = q.lte("povrsina_m2", f.povrsinaMax);
  if (typeof f.zemljisceMin === "number") q = q.gte("zemljisce_m2", f.zemljisceMin);
  if (typeof f.letoMin === "number") q = q.gte("leto_izgradnje", f.letoMin);
  if (f.vecEnot === true) q = q.eq("vec_enot", true);
  if (f.zaObnovo === true) q = q.eq("za_obnovo", true);
  if (f.zaInvesticijo === true) q = q.eq("za_investicijo", true);
  if (f.padecCene === true) q = q.not("padec_pct", "is", null);
  return q;
}

export async function preveriIskanja(db: Db, log: (msg: string) => void): Promise<void> {
  const { data, error } = await db
    .from("nep_iskanja")
    .select("id, ime, filtri, email_obvestila, zadnji_ogled, created_at")
    .eq("aktivno", true);
  if (error) {
    log(`iskanja branje: ${error.message}`);
    return;
  }
  const iskanja = (data ?? []) as Iskanje[];
  if (iskanja.length === 0) return;

  const now = new Date().toISOString();
  for (const i of iskanja) {
    const od = i.zadnji_ogled ?? i.created_at;
    const f = (i.filtri ?? {}) as Record<string, unknown>;

    // Enote in radij zahtevajo isto obravnavo kot v UI, sicer bi značka
    // "N novih" štela vso Slovenijo namesto kroga okoli kraja.
    const enotMin = typeof f.enotMin === "number" ? f.enotMin : null;
    const radij =
      typeof f.radijKm === "number" && typeof f.radijKraj === "string"
        ? await sredisceRadija(db, f.radijKraj, f.radijKm)
        : null;
    if (typeof f.radijKm === "number" && typeof f.radijKraj === "string" && !radij) {
      log(`iskanje "${i.ime}": središča „${f.radijKraj}“ ni v šifrantu — štetje preskočeno`);
      continue;
    }

    let count: number | null = null;
    if (radij) {
      // Krog: bbox v bazi, natančna razdalja v kodi (kot na strani).
      const b = bboxOkoli(radij.lat, radij.lng, radij.km);
      let q = db
        .from("nep_oglasi")
        .select("id, lat, lng")
        .eq("status", "aktiven")
        .gt("first_seen", od)
        .gte("lat", b.latMin)
        .lte("lat", b.latMax)
        .gte("lng", b.lngMin)
        .lte("lng", b.lngMax)
        .limit(2000);
      q = uporabiFiltre(q as unknown as Graditelj, f) as unknown as typeof q;
      if (enotMin !== null) q = q.or(`st_enot.gte.${enotMin},st_enot_ocena.gte.${enotMin}`);
      const { data: vrstice, error: e } = await q;
      if (e) {
        log(`iskanje "${i.ime}": ${e.message}`);
        continue;
      }
      count = (vrstice ?? []).filter(
        (v) => v.lat !== null && v.lng !== null && razdaljaKm(radij.lat, radij.lng, Number(v.lat), Number(v.lng)) <= radij.km
      ).length;
    } else {
      let q = db.from("nep_oglasi").select("id", { count: "exact", head: true }).eq("status", "aktiven").gt("first_seen", od);
      q = uporabiFiltre(q as unknown as Graditelj, f) as unknown as typeof q;
      if (enotMin !== null) q = q.or(`st_enot.gte.${enotMin},st_enot_ocena.gte.${enotMin}`);
      const { count: c, error: e } = await q;
      if (e) {
        log(`iskanje "${i.ime}": ${e.message}`);
        continue;
      }
      count = c ?? 0;
    }
    await db.from("nep_iskanja").update({ zadnjih_novih: count ?? 0, zadnji_pregled: now }).eq("id", i.id);

    if ((count ?? 0) > 0 && i.email_obvestila && process.env.RESEND_API_KEY) {
      await posljiObvestilo(db, i, count ?? 0, log);
    }
  }
  log(`iskanja: preverjenih ${iskanja.length}`);
}

/** Največ eno obvestilo na iskanje na dan; kvota trajno v nep_statistika. */
async function posljiObvestilo(db: Db, i: Iskanje, novih: number, log: (msg: string) => void): Promise<void> {
  const dan = new Date().toISOString().slice(0, 10);
  const { data } = await db.from("nep_statistika").select("podatki").eq("kljuc", "posta").maybeSingle();
  const stanje = (data?.podatki as { dan?: string; poslana?: string[] } | null) ?? {};
  const poslana = stanje.dan === dan ? (stanje.poslana ?? []) : [];
  if (poslana.includes(i.id)) return;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.REPORT_EMAIL_FROM ?? "SBN Nepremičnine <onboarding@resend.dev>",
      to: [i.email_obvestila],
      subject: `${novih} novih nepremičnin za iskanje »${i.ime}«`,
      html: `<p>Za shranjeno iskanje <strong>${i.ime}</strong> je ${novih} novih oglasov.</p><p><a href="https://kodatim.si/nepremicnine">Odpri iskalnik</a></p>`,
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch((e) => ({ ok: false, statusText: String(e) }) as Response);

  if (r.ok) {
    await db.from("nep_statistika").upsert({
      kljuc: "posta",
      podatki: { dan, poslana: [...poslana, i.id] },
      izracunano: new Date().toISOString(),
    });
    log(`obvestilo poslano za "${i.ime}"`);
  } else {
    log(`obvestilo za "${i.ime}" ni šlo: ${r.statusText}`);
  }
}
