import type { IntelLead } from "@/lib/lead-intelligence/types";
import { fetchAjpesAuthed, withAjpesLock } from "../ajpesSession";
import { stripHtmlToText, firstNonEmptyLineAfter } from "../htmlText";
import { verifyNumericFields } from "../verifyNumericFields";
import { PEOPLE_SEPARATOR } from "./companywall";
import { CONFIDENCE, type FieldCandidate, type ParserCheck, type ProviderRequestLog, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

const BASE = "https://www.ajpes.si/prs";
const TABLE_ID_LABEL = 'id="tableRezultati"';

export const AJPES_POSSIBLE_FIELDS = [
  "official_long_name", "official_name", "address_street", "address_city", "postal_code",
  "address_region", "address_country", "email", "phone", "website",
  "registration_number", "vat_id", "bank_account", "founded_date", "legal_form", "company_size",
  "skd_code", "skd_name", "skis_code", "skis_name", "other_activities",
  "owners", "director", "authorized_representatives", "company_status",
];

function toFields(parsed: Record<string, string | null>, sourceUrl: string): Record<string, FieldCandidate> {
  const fields: Record<string, FieldCandidate> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || !value.trim()) continue;
    // The activities list is prose meant for Opombe, not a short column value.
    const limit = key === "other_activities" ? 1200 : 300;
    fields[key] = { value: value.trim().slice(0, limit), confidence: CONFIDENCE.AJPES_SCRAPE, source_url: sourceUrl };
  }
  return fields;
}

/**
 * The results page also contains an unrelated "recently viewed / featured
 * companies" widget earlier in the HTML, with the SAME podjetje.asp links
 * regardless of the search query — grabbing the first such link on the whole
 * page (as this used to do) silently returns the wrong company every time.
 * The real results live inside <table id="tableRezultati">. AJPES only
 * returns the first page (10 rows, unranked) for a substring query like "ARS"
 * — the intended company can be past page 1. Rather than guess and attach a
 * confident-looking but wrong company's registry data, only auto-resolve when
 * a row's name exactly matches (or it's the only candidate); otherwise treat
 * it as genuinely not found so a wrong match is never silently merged.
 */
type DetailLinkResult =
  | { status: "found"; url: string }
  | { status: "not_found" }
  | { status: "ambiguous"; candidateCount: number };

/** Fields the free PRS record simply never carries — reported as such rather than as "missing data". */
const AJPES_NOT_PUBLISHED = new Set([
  "revenue_amount", "revenue_year", "profit", "ebit", "ebitda", "credit_rating",
]);

/**
 * The PRS view of a company page ("VPOGLED V PRS", i.e. `&p=1`) is one
 * consistent "label:" / value layout for every legal form, and it carries far
 * more than the court-register view the search links to: region, municipality,
 * the main SKD activity AND every secondary activity, size class, bank account,
 * contact details and the website.
 *
 * Confirmed live on both a d.o.o. and an s.p. Two things this replaces: an LLM
 * extraction call that cost ~10-14 s of the ~16 s this provider spent per
 * company, and the court-register layout, whose labels differ so completely
 * ("Matična številka" vs "matična številka:") that parsing it would have
 * silently returned nothing for every sole trader.
 */
const PRS_VIEW_SUFFIX = "&p=1";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Values that follow a "label:" line, up to the next label or section heading. */
function prsField(text: string, label: string): string[] {
  const re = new RegExp(`^[ \\t]*${escapeRegex(label)}\\*{0,2}:[ \\t]*$`, "m");
  const match = re.exec(text);
  if (!match) return [];

  const lines: string[] = [];
  for (const raw of text.slice(match.index + match[0].length).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // Next "label:" line, or one of the section headings between blocks.
    if (/^[^:]{2,60}:$/.test(line)) break;
    if (/^(Drugi podatki|Podatki o ustanovitvi|Identifikacijski podatki|Kontaktni podatki)$/i.test(line)) break;
    lines.push(line);
    if (lines.length >= 60) break;
  }
  return lines;
}

function prsValue(text: string, label: string): string | null {
  return prsField(text, label)[0] ?? null;
}

/**
 * "91.120 (Dej.arhivov)" and "S.11002 (Nacionalne …)" share this shape. The
 * inner text can itself contain brackets — "01.110 (Prid.žit(razen riža),
 * stročnic in oljnic)" is real — so the closing bracket is matched greedily at
 * the end rather than as "the first ) you see".
 */
function splitCodeAndName(value: string | null): { code: string | null; name: string | null } {
  if (!value) return { code: null, name: null };
  const m = value.match(/^\s*([A-Za-z0-9.]+)\s*\((.*)\)\s*$/);
  if (!m) return { code: value.trim() || null, name: null };
  return { code: m[1], name: m[2].trim() || null };
}

/**
 * Activity lines look like "46.180 Posr.db.dr.spec.izd." — anything else is the
 * page furniture that follows the list (source notes, cookie banner, AJPES's
 * own contact details), which a plain "read until the next label" rule happily
 * swallowed into the company description.
 */
function activityLinesOnly(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (!/^\d{2}\.\d{3}\s+\S/.test(line)) break;
    out.push(line);
  }
  return out;
}

/** AJPES prints this placeholder where no founder is recorded. */
function isPlaceholderPerson(name: string): boolean {
  return /ni vpisan|ni podatka|^-+$/i.test(name.trim());
}

/** AJPES shouts region names ("PODRAVSKA"); the CRM shows them as words. */
function toTitleCaseWord(value: string | null): string | null {
  if (!value) return null;
  return value.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Diacritic- and whitespace-insensitive haystack.
 *
 * A literal `/matična številka/i` test failed on pages that plainly contained
 * the label — the same character can arrive precomposed (U+010D) or as "c" plus
 * a combining caron, and the separator can be a non-breaking space. Flattening
 * both away is cheaper than guessing which variant a given page used.
 */
function flatten(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Is this a company page at all?
 *
 * Checking for the words "matična številka" anywhere is not enough: the page
 * footer carries a legend explaining them, so the shell page AJPES returns for
 * some subjects passes that test while containing no company data whatsoever.
 * The test is therefore whether a real labelled FIELD exists.
 */
function looksLikeCompanyCard(text: string): boolean {
  return (
    labelValue(text, "Matična številka") !== null ||
    labelValue(text, "matična številka") !== null ||
    labelValue(text, "Skrajšana firma") !== null ||
    labelValue(text, "popolno ime") !== null
  );
}

/**
 * The court-register view, which the search links to directly. It carries less
 * than the PRS view — no region, no activity codes — but it is served reliably,
 * so it is what AJPES falls back to rather than contributing nothing.
 */
/**
 * Finds a label however its accents happen to be encoded, and returns the next
 * non-empty line.
 *
 * A literal `indexOf("Matična številka")` failed on pages that contain exactly
 * that label — the č can be precomposed or a "c" plus a combining caron, and
 * the separator can be a non-breaking space. Comparing flattened forms while
 * returning the ORIGINAL line keeps the value intact.
 */
function labelValue(text: string, label: string): string | null {
  const lines = text.split("\n");
  const target = flatten(label).replace(/[:*]+$/, "").trim();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    const flat = flatten(raw).replace(/[:*]+$/, "").trim();

    // "Matična številka: 5526095000" — value on the same line.
    if (flat.startsWith(target) && raw.includes(":")) {
      const after = raw.slice(raw.indexOf(":") + 1).trim();
      if (after) return after;
    }

    // The label must BE the line, not merely appear in it: the page footer
    // carries a legend ("* Matična številka — podatki vpisani v Poslovni
    // register …") that a substring match happily mistook for the field.
    if (flat !== target) continue;

    for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
      const candidate = lines[j].trim();
      if (candidate) return candidate;
    }
  }
  return null;
}

function parseCourtRegisterPage(text: string, companyName: string): Record<string, string | null> {
  const value = (label: string) => labelValue(text, label) ?? firstNonEmptyLineAfter(text, label);

  // "Trg Leona Štuklja 5, 2000 Maribor"
  const address = value("Poslovni naslov");
  const addressMatch = address?.match(/^(.*?),\s*(\d{4})\s+(.+)$/);

  const statusFromName = companyName.match(/-\s*(v\s+(?:stečaju|likvidaciji|prisilni poravnavi))/i)?.[1];

  // A matična is ten digits and a davčna eight; anything else came from the
  // wrong line and is better dropped than propagated as identity.
  const digitsOnly = (v: string | null, length: number) =>
    v && v.replace(/\D/g, "").length === length ? v.trim() : null;

  return {
    official_long_name: value("Firma"),
    official_name: value("Skrajšana firma"),
    registration_number: digitsOnly(value("Matična številka"), 10),
    vat_id: digitsOnly(value("Ident. št. za DDV in davčna številka"), 8),
    founded_date: value("Datum vpisa subjekta v sodni register"),
    legal_form: value("Pravnoorganizacijska oblika"),
    company_status: statusFromName ?? value("Status subjekta"),
    address_street: addressMatch?.[1]?.trim() ?? address,
    postal_code: addressMatch?.[2] ?? null,
    address_city: addressMatch?.[3]?.trim() ?? value("Sedež"),
    address_country: "Slovenija",
    owners: peopleInSection(text, "DRUŽBENIKI", "POSLOVNI DELEŽI"),
    director: peopleInSection(text, "Osebe, pooblaščene za zastopanje", "Člani organa nadzora"),
  };
}

/** Every "Osebno ime" between two section headings, deduplicated. */
function peopleInSection(text: string, from: string, to: string): string | null {
  const start = text.indexOf(from);
  if (start === -1) return null;
  const end = text.indexOf(to, start);
  const section = end === -1 ? text.slice(start) : text.slice(start, end);

  const names = [...section.matchAll(/Osebno ime\s+([^\n]+)/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter((n) => n.length > 2 && !isPlaceholderPerson(n));
  if (names.length === 0) return null;
  return [...new Set(names)].join(PEOPLE_SEPARATOR).slice(0, 300);
}

function parseAjpesDetail(text: string, companyName: string): Record<string, string | null> {
  // "arhiv.pnm@triera.net (Elektronska pošta)" / "www.arhivpnm.si (Spletni naslov)" / "02 1234567 (Telefon)"
  const contact = prsField(text, "telefon/telefaks/e-pošta");
  const pick = (kind: RegExp) => contact.find((l) => kind.test(l))?.replace(/\s*\([^)]*\)\s*$/, "").trim() ?? null;

  const posta = prsValue(text, "pošta"); // "2000 Maribor"
  const postaMatch = posta?.match(/^(\d{4})\s+(.+)$/);

  const skd = splitCodeAndName(prsValue(text, "glavna dejavnost"));
  const skis = splitCodeAndName(prsValue(text, "sektorska pripadnost (SKIS)"));

  const otherActivities = activityLinesOnly(prsField(text, "druge dejavnosti"));

  // "Richter Martin, direktor" — role is the last comma-part.
  const representatives = prsField(text, "zastopniki").map((line) => {
    const idx = line.lastIndexOf(",");
    return idx === -1
      ? { name: line.trim(), role: "" }
      : { name: line.slice(0, idx).trim(), role: line.slice(idx + 1).trim().toLowerCase() };
  });
  const byRole = (kind: string) => {
    const names = representatives.filter((r) => r.role.includes(kind)).map((r) => r.name);
    return names.length > 0 ? [...new Set(names)].join(PEOPLE_SEPARATOR).slice(0, 300) : null;
  };

  const founders = prsField(text, "ustanovitelji").filter((n) => !isPlaceholderPerson(n));
  const website = pick(/Spletni naslov/i);

  // The PRS view carries no status field, but a company in receivership says so
  // in its own registered name ("E-ARHIV d.o.o. - v stečaju").
  const statusFromName = companyName.match(/-\s*(v\s+(?:stečaju|likvidaciji|prisilni poravnavi))/i)?.[1];

  return {
    official_long_name: prsValue(text, "popolno ime"),
    official_name: prsValue(text, "kratko ime"),
    address_street: prsValue(text, "ulica"),
    // The postal town, not "naselje": for Gornji Lenart 28A the settlement is
    // Gornji Lenart but the address is "8250 Brežice", and a city that doesn't
    // match its own postal code reads as wrong data.
    address_city: postaMatch?.[2]?.trim() ?? prsValue(text, "naselje"),
    postal_code: postaMatch?.[1] ?? null,
    address_region: toTitleCaseWord(prsValue(text, "regija")),
    address_country: "Slovenija",
    email: pick(/Elektronska pošta/i),
    phone: pick(/Telefon/i),
    website: website ? (website.startsWith("http") ? website : `https://${website}`) : null,
    registration_number: prsValue(text, "matična številka"),
    vat_id: prsValue(text, "ident. št. za DDV in davčna številka"),
    bank_account: prsValue(text, "transakcijski računi")?.match(/IBAN\s+([A-Z]{2}\d{2}[\d\s]+)/)?.[1]?.trim() ?? null,
    founded_date: prsValue(text, "datum vpisa pri registrskem organu"),
    legal_form: prsValue(text, "pravnoorganizacijska oblika"),
    company_size: prsValue(text, "velikost RS"),
    skd_code: skd.code,
    skd_name: skd.name,
    skis_code: skis.code,
    skis_name: skis.name,
    // Everything else the company is registered for — the fullest answer to
    // "what does this company actually do".
    other_activities: otherActivities.length > 0 ? otherActivities.join("; ").slice(0, 1200) : null,
    owners: founders.length > 0 ? founders.join(PEOPLE_SEPARATOR).slice(0, 300) : null,
    director: byRole("direktor") ?? byRole("nosilec dejavnosti"),
    authorized_representatives: byRole("prokurist"),
    company_status: statusFromName ?? null,
  };
}

function findDetailLink(html: string, companyName: string): DetailLinkResult & { rowCount: number; tableFound: boolean } {
  const tableStart = html.indexOf('id="tableRezultati"');
  if (tableStart === -1) return { status: "not_found", rowCount: 0, tableFound: false };
  const tableEnd = html.indexOf("</table>", tableStart);
  const tableHtml = tableEnd === -1 ? html.slice(tableStart) : html.slice(tableStart, tableEnd);

  const rowPattern = /<a href="(podjetje\.asp\?[^"]+)">([^<]*)<\/a><\/td>\s*<td>([^<]*)<\/td>/gi;
  const rows: { href: string; firma: string; skrajsana: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(tableHtml)) !== null) {
    rows.push({ href: match[1], firma: match[2].trim(), skrajsana: match[3].trim() });
  }
  if (rows.length === 0) return { status: "not_found", rowCount: 0, tableFound: true };

  const normalized = companyName.trim().toLowerCase();
  const exact = rows.find(
    (r) => r.skrajsana.toLowerCase() === normalized || r.firma.toLowerCase() === normalized
  );
  if (exact) return { status: "found", url: `${BASE}/${exact.href.replace(/&amp;/g, "&")}`, rowCount: rows.length, tableFound: true };
  if (rows.length === 1) return { status: "found", url: `${BASE}/${rows[0].href.replace(/&amp;/g, "&")}`, rowCount: 1, tableFound: true };
  return { status: "ambiguous", candidateCount: rows.length, rowCount: rows.length, tableFound: true };
}

export const ajpesProvider: PublicEnrichmentProvider = {
  id: "ajpes",
  label: "AJPES",
  priority: 5,
  possibleFields: AJPES_POSSIBLE_FIELDS,

  shouldRun() {
    return true;
  },

  async run(lead: IntelLead): Promise<PublicProviderResult> {
    const requests: ProviderRequestLog[] = [];
    const parserChecks: ParserCheck[] = [];
    const everyFieldBecause = (reason: string): Record<string, string> =>
      Object.fromEntries(AJPES_POSSIBLE_FIELDS.map((f) => [f, reason]));

    if (!process.env.AJPES_USERNAME || !process.env.AJPES_PASSWORD) {
      const reason = "AJPES_USERNAME/AJPES_PASSWORD nista nastavljena — prijava ni mogoča";
      return {
        note: "AJPES: poverilnice niso nastavljene (AJPES_USERNAME/AJPES_PASSWORD), preskočeno.",
        skippedReason: reason,
        diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause(reason) },
      };
    }

    // Lead skrejp already resolved this company in the AJPES results list, so
    // it hands over the page address directly: one request instead of two, no
    // rate-limit wait between them, and no chance of the name search failing to
    // find the very company AJPES just listed (searching by the full registered
    // name genuinely does return nothing for some companies).
    const knownDetailUrl = (lead.custom_fields as Record<string, string> | null)?.ajpes_detail_url;
    if (knownDetailUrl) {
      return readDetailPage(knownDetailUrl, lead.company_name, null, requests, parserChecks, everyFieldBecause);
    }

    const searchUrl = `${BASE}/rezultati.asp?naziv=${encodeURIComponent(lead.company_name)}&status=1`;
    let searchResult: Awaited<ReturnType<typeof fetchAjpesAuthed>>;
    try {
      searchResult = await fetchAjpesAuthed(searchUrl, null);
      requests.push({ url: searchUrl, status: searchResult.status, ok: searchResult.status < 400 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      // Distinct from "not found" — the search itself never ran because
      // authentication failed, so nothing downstream can be trusted.
      const note = `AJPES: PRIJAVA NI USPELA — ${message}`;
      requests.push({ url: searchUrl, status: null, ok: false, note: `prijava/zahtevek ni uspel: ${message}` });
      // A rejected login / unreachable AJPES is a genuine malfunction (nothing
      // can ever come through until it's fixed) — unlike "company not in the
      // register", which is a legitimate empty result.
      return {
        note,
        skippedReason: note,
        failed: true,
        diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause(`prijava v AJPES ni uspela: ${message}`) },
      };
    }

    const detail = findDetailLink(searchResult.html, lead.company_name);
    parserChecks.push({
      element: "tabela zadetkov (" + TABLE_ID_LABEL + ")",
      found: detail.tableFound,
      detail: detail.tableFound ? `${detail.rowCount} vrstic` : "selector ni najden na strani",
    });
    parserChecks.push({
      element: "natančno ujemanje imena",
      found: detail.status === "found",
      detail:
        detail.status === "found"
          ? "izbrana ena vrstica"
          : detail.status === "ambiguous"
            ? `${detail.candidateCount} kandidatov, nobeden se ne ujema natančno`
            : "ni kandidatov",
    });

    if (detail.status === "not_found") {
      const note = "AJPES: ni bilo mogoče najti podjetja v registru.";
      const reason = detail.tableFound
        ? "podjetja ni v poslovnem registru AJPES (0 zadetkov)"
        : "tabela zadetkov ni bila najdena na strani AJPES (spremenjen HTML?)";
      return { note, skippedReason: note, diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause(reason) } };
    }
    if (detail.status === "ambiguous") {
      const note = `AJPES: AMBIGUOUS MATCH — ${detail.candidateCount} zadetkov za "${lead.company_name}", brez natančnega ujemanja imena; podatkov ni bilo mogoče zanesljivo pripisati.`;
      const reason = `AMBIGUOUS MATCH — ${detail.candidateCount} zadetkov brez natančnega ujemanja; vrednost namerno ni pripisana`;
      return { note, skippedReason: note, diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause(reason) } };
    }
    return readDetailPage(
      detail.url,
      lead.company_name,
      searchResult.session,
      requests,
      parserChecks,
      everyFieldBecause
    );
  },
};

async function readDetailPage(
  detailUrl: string,
  companyName: string,
  session: Awaited<ReturnType<typeof fetchAjpesAuthed>>["session"] | null,
  requests: ProviderRequestLog[],
  parserChecks: ParserCheck[],
  everyFieldBecause: (reason: string) => Record<string, string>
): Promise<PublicProviderResult> {
  // Always the PRS view: the court-register view the search links to has no
  // region, no activity codes and a different label layout entirely.
  const baseUrl = detailUrl.replace(/&p=1$/, "");
  const prsUrl = `${baseUrl}${PRS_VIEW_SUFFIX}`;
  try {
    // Select-then-read must be atomic: the PRS view is only served for the
    // company currently selected in the session, so another company selecting
    // itself in between returns a ~4.7 kB stub with none of the labels on it.
    const outcome = await withAjpesLock(async () => {
      const selectResult = await fetchAjpesAuthed(baseUrl, session);
      requests.push({ url: baseUrl, status: selectResult.status, ok: selectResult.status < 400, note: "izbira podjetja v seji" });

      // If the base page is not a company card at all, the PRS view cannot
      // help — stop rather than spending three more requests on it. Every
      // request runs inside the AJPES lock, so wasted ones serialise whole
      // batches behind a source that has nothing to give.
      const selectText = stripHtmlToText(selectResult.html);
      if (!looksLikeCompanyCard(selectText)) {
        return { stub: true as const, length: selectText.length };
      }

      const read = await fetchAjpesAuthed(prsUrl, selectResult.session);
      const pageText = stripHtmlToText(read.html);
      const prsParsed = parseAjpesDetail(pageText, companyName);

      // The PRS view is the richer one, but it is not always served. When it
      // comes back without even a matična, fall back to the court-register
      // page we already have in hand — fewer fields, but far better than
      // reporting a company AJPES plainly does know as unavailable.
      if (!prsParsed.registration_number) {
        return {
          stub: false as const,
          detailResult: selectResult,
          text: selectText,
          parsed: parseCourtRegisterPage(selectText, companyName),
        };
      }

      return {
        stub: false as const,
        detailResult: read,
        text: pageText,
        parsed: prsParsed,
      };
    });

    if (outcome.stub) {
      const reason = `AJPES je vrnil okrnjeno stran brez podatkov podjetja (${outcome.length} znakov, brez oznake "matična številka") — naslov strani iz seznama zadetkov za to podjetje ne odpre kartice`;
      return {
        note: `AJPES: strani podjetja ni bilo mogoče odpreti — ${reason}.`,
        skippedReason: reason,
        failed: true,
        diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause(reason) },
      };
    }
    const { detailResult, text, parsed } = outcome;

    requests.push({ url: prsUrl, status: detailResult.status, ok: detailResult.status < 400 });
    parserChecks.push({
      element: "besedilo strani podjetja",
      found: text.length > 200,
      detail: `${text.length} znakov po odstranitvi HTML`,
    });

    // A real company page is ~8 kB of text and always carries a matična
    // številka. Anything else is AJPES serving a stub, and reporting that as
    // "found 1 field" (the one hardcoded constant) hides a failure behind a
    // number. Say plainly that the page did not open.
    if (!parsed.registration_number) {
      const reason = `AJPES je vrnil okrnjeno stran brez podatkov podjetja (${text.length} znakov, brez oznake "matična številka") — naslov strani iz seznama zadetkov za to podjetje ne odpre kartice`;
      return {
        note: `AJPES: strani podjetja ni bilo mogoče odpreti — ${reason}.`,
        skippedReason: reason,
        failed: true,
        diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause(reason) },
      };
    }
    parserChecks.push({
      element: 'oznaka "matična številka:" (PRS pogled)',
      found: Boolean(parsed.registration_number),
      detail: parsed.registration_number ? "najdena" : "oznake ni na strani (spremenjen HTML?)",
    });
    const fields = verifyNumericFields(toFields(parsed, prsUrl), text);
    const count = Object.keys(fields).length;

    const fieldReasons: Record<string, string> = {};
    for (const f of AJPES_POSSIBLE_FIELDS) {
      if (fields[f]) continue;
      fieldReasons[f] = AJPES_NOT_PUBLISHED.has(f)
        ? "AJPES PRS tega podatka ne objavlja (finančni podatki niso v javnem registru)"
        : "podatka ni bilo na strani podjetja v AJPES";
    }

    return {
      fields,
      note:
        count > 0
          ? `AJPES: najdenih ${count} registrskih podatkov.`
          : `AJPES: podjetje najdeno, vsebine ni bilo mogoče izluščiti.`,
      diagnostics: { requests, parserChecks, fieldReasons },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "neznana napaka";
    requests.push({ url: prsUrl, status: null, ok: false, note: message });
    return {
      note: `AJPES: napaka — ${message}`,
      failed: true,
      diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause(`napaka pri branju strani: ${message}`) },
    };
  }
}
