import "server-only";

/**
 * Lokalni model (Ollama) na grafični kartici tega računalnika.
 *
 * Zakaj ne v oblak: posnetek oglasa je slika, ki jo je treba prebrati — to je
 * delo, ki ga zna model tukaj, brez plačevanja po sliki in brez pošiljanja
 * vsebine ven. Kartica je itak že prižgana za vizualni pregled oglasov.
 *
 * Zavestna omejitev: lokalni model je manjši od oblačnega in pri gostih tabelah
 * kdaj spregleda kakšno številko. Zato ta modul NE skriva neuspeha — če ključnih
 * polj ne prebere, to pove naprej in klicatelj se lahko odloči za rezervo. Tiho
 * ugibanje bi bilo dražje od priznanja, da posnetka ni bilo mogoče prebrati.
 */

const OLLAMA = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const MODEL = process.env.AVTONET_VID_MODEL ?? "qwen2.5vl:7b";
/** Branje posnetka traja nekaj sekund; minuta je velikodušna zgornja meja. */
const TIMEOUT_MS = 60_000;

export type LokalniIzid<T> =
  | { ok: true; podatki: T; model: string; ms: number }
  | { ok: false; razlog: string; ms: number };

/** Ali lokalni model sploh teče — brez tega nima smisla čakati na timeout. */
export async function lokalniModelNaVoljo(): Promise<boolean> {
  try {
    const r = await fetch(`${OLLAMA}/api/version`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Vpraša lokalni model in odgovor prisili v podano shemo.
 *
 * Shema ni okras: brez nje model vsakih nekaj klicev odgovori s prozo okoli
 * JSON-a ali z napol zaprtim oklepajem in zapis propade — merjeno 3 od prvih 10
 * klicev pri vizualnem pregledu oglasov.
 */
export async function lokalniJson<T>(
  navodilo: string,
  shema: unknown,
  slikeBase64: string[] = []
): Promise<LokalniIzid<T>> {
  const zacetek = Date.now();
  try {
    const r = await fetch(`${OLLAMA}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        prompt: navodilo,
        ...(slikeBase64.length > 0 ? { images: slikeBase64 } : {}),
        stream: false,
        format: shema,
        options: { temperature: 0, num_ctx: 8192 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) {
      return { ok: false, razlog: `Ollama ${r.status}`, ms: Date.now() - zacetek };
    }
    const telo = (await r.json()) as { response?: string };
    const besedilo = (telo.response ?? "").trim();
    if (!besedilo) return { ok: false, razlog: "prazen odgovor", ms: Date.now() - zacetek };
    return {
      ok: true,
      podatki: JSON.parse(besedilo) as T,
      model: MODEL,
      ms: Date.now() - zacetek,
    };
  } catch (e) {
    const sporocilo = e instanceof Error ? e.message : String(e);
    return { ok: false, razlog: sporocilo.slice(0, 200), ms: Date.now() - zacetek };
  }
}

/** Slika iz brskalnika pride kot data URL; Ollama hoče samo base64 brez glave. */
export function brezGlave(dataUrl: string): string {
  const vejica = dataUrl.indexOf(",");
  return vejica >= 0 ? dataUrl.slice(vejica + 1) : dataUrl;
}

/**
 * Shema branja oglasa.
 *
 * Vsako polje sme biti null. To ni prijaznost do modela, ampak zahteva: polje,
 * ki ga na posnetku ni, mora ostati prazno, sicer ga model izmisli in cenilnik
 * primerja napačen avto.
 */
export const SHEMA_VOZILA = {
  type: "object",
  properties: {
    znamka: { type: ["string", "null"] },
    model: { type: ["string", "null"] },
    verzija: { type: ["string", "null"] },
    letnik: { type: ["integer", "null"] },
    km: { type: ["integer", "null"] },
    kw: { type: ["integer", "null"] },
    ccm: { type: ["integer", "null"] },
    gorivo: { type: ["string", "null"] },
    menjalnik: { type: ["string", "null"] },
    karoserija: { type: ["string", "null"] },
    barva: { type: ["string", "null"] },
    cena: { type: ["number", "null"] },
    znacilke: { type: "array", items: { type: "string" } },
  },
  required: ["znamka", "model", "letnik", "km", "kw", "gorivo", "menjalnik", "znacilke"],
} as const;
