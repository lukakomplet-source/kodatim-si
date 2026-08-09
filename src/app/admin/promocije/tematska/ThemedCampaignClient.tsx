"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Users, Mail, Rocket, Loader2, Copy, Check, MessageSquare, Flame, Trash2 } from "lucide-react";
import { createThemedCampaign } from "./actions";
import { useRestoreOnce, useAutoSave, clearSavedState } from "@/lib/useSavedState";
import { invalidSkdCodes } from "@/lib/skd";
// Type-only: erased at compile time, so the server-only module never reaches
// the client bundle.
import type { ChannelStrategy } from "@/lib/promocije/channelStrategy";

/** Mirrors the server's CampaignKind — a campaign sells, hires or partners. */
type CampaignKind = "prodaja" | "podizvajalci" | "partnerji";

const KIND_LABELS: Record<CampaignKind, string> = {
  prodaja: "Prodaja",
  podizvajalci: "Iskanje podizvajalcev",
  partnerji: "Iskanje partnerjev",
};

const KIND_HINTS: Record<CampaignKind, string> = {
  prodaja: "podjetja so potencialne stranke",
  podizvajalci: "podjetja so izvajalci, ki jih najamete",
  partnerji: "podjetja so možni dolgoročni partnerji",
};

/**
 * Themed campaign wizard: a goal in plain Slovenian becomes a search profile,
 * a shortlist of companies, and a draft email per company.
 *
 * Each step is a separate request whose result is shown before the next one
 * runs — the profile especially, because a wrong SKD code there would quietly
 * select the wrong industry for everything downstream.
 */

type Profile = {
  skdCodes: string[];
  keywords: string[];
  regions: string[];
  sizes: string[];
  summary: string;
  /** From the natural-language parser; all optional and all validated upstream. */
  municipalities?: string[];
  revenueMinEur?: number | null;
  revenueMaxEur?: number | null;
  legalForm?: "sp" | "doo" | null;
};

type Candidate = {
  id: string;
  company_name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  contact_person: string | null;
  address_city: string | null;
  industry: string | null;
  revenue_amount: string | null;
  revenue_year: string | null;
  employees_count: string | null;
  score: number;
  reason: string;
};

type Email = { leadId: string; subject: string; body: string; angle: string };

/** Everything worth surviving a closed tab. */
type WizardSession = {
  theme: string;
  senderContext: string;
  profile: Profile | null;
  candidates: Candidate[] | null;
  candidateNote: string | null;
  selected: string[];
  template: { subject: string; body: string } | null;
  emails: Email[];
  campaignName: string;
  chat: { role: "user" | "assistant"; text: string; used?: string[] }[];
  /** "Grant Cardone način" — mindset for the brainstorm AND the written mails. */
  cardone?: boolean;
  kind?: CampaignKind;
  nlQuery?: string;
  strategy?: ChannelStrategy | null;
};

const CARD = "rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm";
const INPUT =
  "mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none";

export default function ThemedCampaignClient() {
  const router = useRouter();

  const [theme, setTheme] = useState("");
  const [senderContext, setSenderContext] = useState("");
  const [busy, setBusy] = useState<null | "profile" | "targets" | "emails" | "save" | "strategy" | "parse">(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<CampaignKind>("prodaja");
  const [nlQuery, setNlQuery] = useState("");
  const [strategy, setStrategy] = useState<ChannelStrategy | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candidateNote, setCandidateNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState<{ subject: string; body: string } | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<{ role: "user" | "assistant"; text: string; used?: string[] }[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [cardone, setCardone] = useState(false);

  /**
   * The wizard can take several minutes and several AI steps; losing it to a
   * closed tab would mean paying for all of it again. Kept per user on the
   * server, so a phone and a desk share the same half-finished campaign.
   */
  const { loaded: sessionLoaded } = useRestoreOnce<WizardSession>("tematska-kampanja", (saved) => {
    setTheme(saved.theme ?? "");
    setSenderContext(saved.senderContext ?? "");
    setProfile(saved.profile ?? null);
    setCandidates(saved.candidates ?? null);
    setCandidateNote(saved.candidateNote ?? null);
    setSelected(new Set(saved.selected ?? []));
    setTemplate(saved.template ?? null);
    setEmails(saved.emails ?? []);
    setCampaignName(saved.campaignName ?? "");
    setChat(saved.chat ?? []);
    setCardone(Boolean(saved.cardone));
    if (saved.kind === "podizvajalci" || saved.kind === "partnerji") setKind(saved.kind);
    setNlQuery(saved.nlQuery ?? "");
    setStrategy(saved.strategy ?? null);
  });

  useAutoSave(
    "tematska-kampanja",
    {
      theme,
      senderContext,
      profile,
      candidates,
      candidateNote,
      selected: [...selected],
      template,
      emails,
      campaignName,
      chat,
      cardone,
      kind,
      nlQuery,
      strategy,
    } satisfies WizardSession,
    sessionLoaded
  );

  /**
   * Stale SKD codes in the editable profile. The generator is already gated on
   * the official register, but this field also holds RESTORED old profiles and
   * hand-typed codes — precisely the ones that predate the gate.
   */
  const badSkd = useMemo(() => (profile ? invalidSkdCodes(profile.skdCodes) : []), [profile]);

  function replaceSkdCode(oldCode: string, newCode: string) {
    if (!profile) return;
    setProfile({
      ...profile,
      skdCodes: profile.skdCodes.map((c) => (c === oldCode ? newCode : c)),
    });
  }

  /** Anything worth clearing — governs whether "Počisti vse" is shown at all. */
  const hasContent =
    Boolean(theme.trim() || senderContext.trim() || profile || candidates || campaignName.trim()) ||
    emails.length > 0 ||
    chat.length > 0;

  /**
   * Back to a blank campaign, on an explicit click only — the same contract as
   * Lead skrejp's "Počisti": nothing ever clears itself, and the server copy
   * goes too, or the old campaign would just walk back in on the next load.
   */
  function resetWizard() {
    if (!confirm("Izbrisati trenutno kampanjo (cilj, kandidate, maile, pogovor)? Tega ni mogoče razveljaviti.")) return;
    void clearSavedState("tematska-kampanja");
    setTheme("");
    setSenderContext("");
    setProfile(null);
    setCandidates(null);
    setCandidateNote(null);
    setSelected(new Set());
    setTemplate(null);
    setEmails([]);
    setCampaignName("");
    setChat([]);
    setQuestion("");
    setError(null);
    // The mindset toggle is a lasting preference, not campaign content — it
    // survives the wipe on purpose.
  }

  async function call(step: "profile" | "targets" | "emails" | "strategy", extra: Record<string, unknown> = {}) {
    setBusy(step);
    setError(null);
    try {
      const res = await fetch("/api/admin/promocije/tematska", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, theme, senderContext, cardone, kind, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Napaka pri obdelavi.");
        return null;
      }
      return json;
    } catch {
      setError("Prišlo je do napake. Poskusite znova.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function runProfile() {
    const json = await call("profile");
    if (json?.profile) {
      setProfile(json.profile as Profile);
      setCandidates(null);
      setEmails([]);
      setTemplate(null);
    }
  }

  /** "keramičarji, Celje okolica, s.p., pod 50k" → a validated, filled profile. */
  async function parseNl() {
    const query = nlQuery.trim();
    if (!query) return;
    setBusy("parse");
    setError(null);
    try {
      const res = await fetch("/api/admin/promocije/parse-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, kind }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Opisa ni bilo mogoče razčleniti.");
        return;
      }
      setProfile(json.profile as Profile);
      setCandidates(null);
      setEmails([]);
      setTemplate(null);
      // The sentence doubles as the campaign goal when none was typed — the
      // later steps (ranking, mails) need a theme to reason about.
      if (!theme.trim()) setTheme(query);
    } catch {
      setError("Prišlo je do napake. Poskusite znova.");
    } finally {
      setBusy(null);
    }
  }

  async function runStrategy() {
    const json = await call("strategy");
    if (json?.strategy) setStrategy(json.strategy as ChannelStrategy);
  }

  async function runTargets() {
    if (!profile) return;
    const json = await call("targets", { profile });
    if (!json) return;
    setCandidates(json.candidates ?? []);
    setCandidateNote(json.note ?? null);
    // Anything the model rated a clear match starts ticked; the rest is opt-in.
    setSelected(new Set((json.candidates ?? []).filter((c: Candidate) => c.score >= 60).map((c: Candidate) => c.id)));
  }

  async function runEmails() {
    const json = await call("emails", { leadIds: [...selected] });
    if (!json) return;
    setTemplate(json.template ?? null);
    setEmails(json.emails ?? []);
  }

  async function save() {
    if (!candidates) return;
    setBusy("save");
    setError(null);
    const byLead = new Map(emails.map((e) => [e.leadId, e]));
    const result = await createThemedCampaign({
      name: campaignName.trim() || theme.slice(0, 60),
      theme,
      // The jsonb column swallows the extras, so the kind and the channel
      // strategy ride along without a schema migration.
      profile: { ...(profile ?? {}), campaignKind: kind, channelStrategy: strategy },
      template,
      targets: candidates
        .filter((c) => selected.has(c.id))
        .map((c) => ({
          leadId: c.id,
          score: c.score,
          reason: c.reason,
          email: byLead.get(c.id) ?? null,
        })),
    });
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.campaignId) router.push(`/admin/promocije/${result.campaignId}`);
  }

  async function ask() {
    const text = question.trim();
    if (!text) return;
    setChat((prev) => [...prev, { role: "user", text }]);
    setQuestion("");
    setChatBusy(true);
    try {
      const res = await fetch("/api/admin/sales-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, context: theme, cardone }),
      });
      const json = await res.json();
      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          text: json?.answer ?? json?.error ?? "Odgovora ni bilo mogoče pridobiti.",
          used: (json?.used ?? []).map((u: { title: string }) => u.title),
        },
      ]);
    } catch {
      setChat((prev) => [...prev, { role: "assistant", text: "Prišlo je do napake." }]);
    } finally {
      setChatBusy(false);
    }
  }

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  const chosen = candidates?.filter((c) => selected.has(c.id)) ?? [];

  return (
    <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-5">
        <div className={CARD}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-zinc-900">1. Kaj prodajate in komu</p>
            {hasContent && (
              <button
                type="button"
                onClick={resetWizard}
                title="Izbriše cilj, profil, kandidate, maile in pogovor — začnete s prazno kampanjo"
                className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3.5 py-1.5 text-xs font-semibold text-zinc-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Počisti vse
              </button>
            )}
          </div>
          <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Cilj kampanje
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              rows={3}
              placeholder="npr. pomoč gradbenim firmam pri odvozu gradbenih odpadkov"
              className={`${INPUT} font-normal normal-case tracking-normal`}
            />
          </label>
          <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            O vas (neobvezno)
            <input
              value={senderContext}
              onChange={(e) => setSenderContext(e.target.value)}
              placeholder="npr. KodaTim.si — spletne rešitve in avtomatizacija"
              className={`${INPUT} font-normal normal-case tracking-normal`}
            />
          </label>
          {/* What the campaign IS decides how every later prompt speaks. */}
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">Namen kampanje</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(Object.keys(KIND_LABELS) as CampaignKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                title={KIND_HINTS[k]}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                  kind === k
                    ? "border-accent bg-accent text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-accent/40 hover:text-zinc-900"
                }`}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">{KIND_HINTS[kind]}</p>

          <button
            type="button"
            onClick={runProfile}
            disabled={busy !== null || !theme.trim()}
            className="mt-4 flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy === "profile" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Analiziraj cilj
          </button>

          {/*
            The other door in: one sentence with everything — trade, area,
            legal form, revenue cap — parsed into the same profile the button
            above builds. For "rabim keramičarje v okolici Celja pod 50k"
            there is nothing left to fill in by hand.
          */}
          <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/5 p-4">
            <p className="text-sm font-semibold text-zinc-900">Ali pa opišite z enim stavkom</p>
            <p className="mt-1 text-xs text-zinc-500">
              npr. „rabim podizvajalce za polaganje keramike, Celje z okolico, s.p., promet pod
              50.000 €&ldquo; — AI sestavi filtre (SKD, občine, promet, oblika) iz uradnih šifrantov.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void parseNl();
                  }
                }}
                placeholder="Opišite, koga iščete …"
                className="min-w-[16rem] flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={parseNl}
                disabled={busy !== null || !nlQuery.trim()}
                className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy === "parse" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Razčleni opis
              </button>
            </div>
          </div>

          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
        </div>

        {profile && (
          <div className={CARD}>
            <p className="text-sm font-semibold text-zinc-900">2. Koga bomo iskali</p>
            <p className="mt-1 text-xs text-zinc-500">
              Popravite, preden iščemo — napačna SKD koda tu izbere napačno panogo za vse naprej.
            </p>
            {profile.summary && <p className="mt-3 text-sm text-zinc-700">{profile.summary}</p>}

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ["skdCodes", "SKD kode"],
                  ["keywords", "Ključne besede"],
                  ["regions", "Regije (prazno = vse)"],
                  ["sizes", "Velikosti (prazno = vse)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {label}
                  <input
                    value={profile[key].join(", ")}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        [key]: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                      })
                    }
                    className={`${INPUT} font-normal normal-case tracking-normal ${
                      key === "skdCodes" && badSkd.length > 0 ? "border-red-300 focus:border-red-400" : ""
                    }`}
                  />
                  {key === "skdCodes" &&
                    badSkd.map(({ code, suggestions }) => (
                      <div key={code} className="mt-1.5 text-[11px] font-normal normal-case tracking-normal">
                        <span className="font-semibold text-red-600">
                          {code} ni v uradnem šifrantu (SKD 2025) — iskanje zanjo najde 0 podjetij.
                        </span>
                        {suggestions.length > 0 && (
                          <span className="ml-1 inline-flex flex-wrap items-center gap-1 text-zinc-600">
                            Ste mislili:
                            {suggestions.map((s) => (
                              <button
                                key={s.code}
                                type="button"
                                onClick={() => replaceSkdCode(code, s.code)}
                                title={s.label}
                                className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 hover:bg-emerald-100"
                              >
                                {s.code} {s.label.length > 30 ? `${s.label.slice(0, 30)}…` : s.label}
                              </button>
                            ))}
                          </span>
                        )}
                      </div>
                    ))}
                </label>
              ))}
            </div>

            {(Boolean(profile.municipalities?.length) ||
              profile.revenueMinEur != null ||
              profile.revenueMaxEur != null ||
              Boolean(profile.legalForm)) && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-zinc-700">Dodatni filtri:</span>
                {(profile.municipalities ?? []).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() =>
                      setProfile({
                        ...profile,
                        municipalities: (profile.municipalities ?? []).filter((x) => x !== m),
                      })
                    }
                    title="Odstrani občino"
                    className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent/20"
                  >
                    {m} ×
                  </button>
                ))}
                {profile.revenueMaxEur != null && (
                  <button
                    type="button"
                    onClick={() => setProfile({ ...profile, revenueMaxEur: null })}
                    title="Odstrani zgornjo mejo prometa"
                    className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-200"
                  >
                    promet ≤ {profile.revenueMaxEur.toLocaleString("sl-SI")} € ×
                  </button>
                )}
                {profile.revenueMinEur != null && (
                  <button
                    type="button"
                    onClick={() => setProfile({ ...profile, revenueMinEur: null })}
                    title="Odstrani spodnjo mejo prometa"
                    className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-200"
                  >
                    promet ≥ {profile.revenueMinEur.toLocaleString("sl-SI")} € ×
                  </button>
                )}
                {profile.legalForm && (
                  <button
                    type="button"
                    onClick={() => setProfile({ ...profile, legalForm: null })}
                    title="Odstrani filter pravne oblike"
                    className="rounded-full bg-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-300"
                  >
                    {profile.legalForm === "sp" ? "samo s.p." : "samo d.o.o."} ×
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runTargets}
                disabled={busy !== null}
                className="flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {busy === "targets" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                Poišči podjetja v bazi
              </button>
              {/*
                The base only holds what was already scraped. New companies for
                these codes and municipalities live one prefilled screen away.
              */}
              {profile.skdCodes.length > 0 && (
                <Link
                  href={`/admin/lead-skrejp?skd=${encodeURIComponent(profile.skdCodes.join(", "))}${
                    profile.municipalities?.length
                      ? `&obcine=${encodeURIComponent(profile.municipalities.join("|"))}`
                      : ""
                  }`}
                  target="_blank"
                  className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5 text-sm font-semibold text-accent hover:bg-accent/10"
                >
                  <Rocket className="h-4 w-4" />
                  Poišči NOVA podjetja (Lead skrejp)
                </Link>
              )}
            </div>
          </div>
        )}

        {/*
          The campaign beyond mails: what to do on socials, how to call, in
          what order. The app cannot open the accounts — it hands over
          everything an account needs on day one, as copy-paste blocks.
        */}
        <div className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900">Strategija kanalov</p>
              <p className="mt-1 text-xs text-zinc-500">
                IG / FB / LinkedIn profili za to temo, klicna skripta in vrstni red kanalov —
                prilagojeno namenu „{KIND_LABELS[kind]}&ldquo;.
              </p>
            </div>
            <button
              type="button"
              onClick={runStrategy}
              disabled={busy !== null || !theme.trim()}
              className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy === "strategy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {strategy ? "Pripravi znova" : "Pripravi strategijo"}
            </button>
          </div>

          {strategy && (
            <div className="mt-4 space-y-4 text-sm">
              {strategy.overview && <p className="text-zinc-700">{strategy.overview}</p>}

              {strategy.channelOrder.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Vrstni red kanalov</p>
                  <ol className="mt-1.5 space-y-1">
                    {strategy.channelOrder.map((c, i) => (
                      <li key={c.channel} className="text-xs text-zinc-700">
                        <span className="font-semibold text-zinc-900">{i + 1}. {c.channel}</span> — {c.why}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {strategy.socials.map((s) => (
                <div key={s.channel} className="rounded-xl border border-zinc-200 p-3.5">
                  <p className="text-sm font-semibold text-zinc-900">{s.channel}</p>
                  {s.handleIdeas.length > 0 && (
                    <p className="mt-1.5 text-xs text-zinc-700">
                      <span className="font-semibold">Imena profila:</span> {s.handleIdeas.join(" · ")}
                    </p>
                  )}
                  {s.bio && (
                    <div className="mt-1.5 flex items-start gap-2 text-xs text-zinc-700">
                      <span>
                        <span className="font-semibold">Bio:</span> {s.bio}
                      </span>
                      <button type="button" onClick={() => copy(`bio-${s.channel}`, s.bio)} className="shrink-0 text-zinc-400 hover:text-zinc-700">
                        {copied === `bio-${s.channel}` ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  )}
                  {s.firstPosts.length > 0 && (
                    <div className="mt-1.5 text-xs text-zinc-700">
                      <span className="font-semibold">Prve objave:</span>
                      <ul className="mt-0.5 list-disc pl-4">
                        {s.firstPosts.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {s.dmTemplate && (
                    <div className="mt-1.5 rounded-lg bg-zinc-50 p-2.5 text-xs text-zinc-700">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">DM predloga</span>
                        <button type="button" onClick={() => copy(`dm-${s.channel}`, s.dmTemplate)} className="text-zinc-400 hover:text-zinc-700">
                          {copied === `dm-${s.channel}` ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{s.dmTemplate}</p>
                    </div>
                  )}
                  {s.tip && <p className="mt-1.5 text-[11px] text-zinc-500">💡 {s.tip}</p>}
                </div>
              ))}

              <div className="rounded-xl border border-zinc-200 p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-900">📞 Klicna skripta</p>
                  <button
                    type="button"
                    onClick={() =>
                      copy(
                        "call-script",
                        [
                          `Uvod: ${strategy.calling.opening}`,
                          "",
                          "Kvalifikacijska vprašanja:",
                          ...strategy.calling.qualifyingQuestions.map((q) => `- ${q}`),
                          "",
                          "Ugovori:",
                          ...strategy.calling.objections.map((o) => `- "${o.objection}" -> ${o.answer}`),
                          "",
                          `Cilj klica: ${strategy.calling.goal}`,
                        ].join("\n")
                      )
                    }
                    className="text-zinc-400 hover:text-zinc-700"
                  >
                    {copied === "call-script" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {strategy.calling.opening && (
                  <p className="mt-1.5 text-xs text-zinc-700">
                    <span className="font-semibold">Uvod:</span> {strategy.calling.opening}
                  </p>
                )}
                {strategy.calling.qualifyingQuestions.length > 0 && (
                  <div className="mt-1.5 text-xs text-zinc-700">
                    <span className="font-semibold">Vprašanja:</span>
                    <ul className="mt-0.5 list-disc pl-4">
                      {strategy.calling.qualifyingQuestions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {strategy.calling.objections.length > 0 && (
                  <div className="mt-1.5 text-xs text-zinc-700">
                    <span className="font-semibold">Ugovori:</span>
                    <ul className="mt-0.5 list-disc pl-4">
                      {strategy.calling.objections.map((o) => (
                        <li key={o.objection}>
                          <span className="italic">„{o.objection}&ldquo;</span> → {o.answer}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {strategy.calling.goal && (
                  <p className="mt-1.5 text-xs font-semibold text-zinc-900">Cilj: {strategy.calling.goal}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-zinc-700">
                {strategy.emailPlan.approach && (
                  <p>
                    <span className="font-semibold">E-mail:</span> {strategy.emailPlan.approach}{" "}
                    <span className="text-zinc-500">
                      (follow-up po {strategy.emailPlan.followUpDays.join(", ")} dneh)
                    </span>
                  </p>
                )}
                {strategy.kpis.length > 0 && (
                  <p>
                    <span className="font-semibold">Merila uspeha:</span> {strategy.kpis.join(" · ")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {candidates && (
          <div className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900">3. Kandidati</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {candidateNote} Izbranih {selected.size}.
                </p>
              </div>
              <button
                type="button"
                onClick={runEmails}
                disabled={busy !== null || selected.size === 0}
                className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy === "emails" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Napiši maile
              </button>
            </div>

            {candidates.length === 0 ? (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-200">
                V bazi ni ustreznih podjetij.{" "}
                <Link href="/admin/lead-skrejp" className="font-semibold underline">
                  Odprite Lead skrejp
                </Link>{" "}
                in poiščite podjetja po SKD kodah: {profile?.skdCodes.join(", ") || "—"}.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-zinc-200 text-zinc-500">
                    <tr>
                      <th className="px-2 py-2"></th>
                      <th className="px-2 py-2 font-medium">Ocena</th>
                      <th className="px-2 py-2 font-medium">Podjetje</th>
                      <th className="px-2 py-2 font-medium">Zakaj se ujema</th>
                      <th className="px-2 py-2 font-medium">Promet</th>
                      <th className="px-2 py-2 font-medium">Zapos.</th>
                      <th className="px-2 py-2 font-medium">Email</th>
                      <th className="px-2 py-2 font-medium">Telefon</th>
                      <th className="px-2 py-2 font-medium">Oseba</th>
                      <th className="px-2 py-2 font-medium">Kraj</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {candidates.map((c) => (
                      <tr key={c.id}>
                        <td className="px-2 py-2 align-top">
                          <input
                            type="checkbox"
                            checked={selected.has(c.id)}
                            onChange={() =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(c.id)) next.delete(c.id);
                                else next.add(c.id);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <span
                            className={`rounded-full px-2 py-0.5 font-semibold ${
                              c.score >= 70
                                ? "bg-emerald-50 text-emerald-700"
                                : c.score >= 40
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-zinc-100 text-zinc-500"
                            }`}
                          >
                            {c.score}
                          </span>
                        </td>
                        <td className="max-w-[220px] truncate px-2 py-2 align-top font-medium text-zinc-900" title={c.company_name}>
                          {c.company_name}
                        </td>
                        <td className="max-w-[320px] px-2 py-2 align-top text-zinc-600">{c.reason}</td>
                        <td className="whitespace-nowrap px-2 py-2 align-top text-zinc-700">
                          {c.revenue_amount ? `${c.revenue_amount} €` : "—"}
                          {c.revenue_year && <span className="ml-1 text-zinc-400">({c.revenue_year})</span>}
                        </td>
                        <td className="px-2 py-2 align-top text-zinc-600">{c.employees_count ?? "—"}</td>
                        <td className="px-2 py-2 align-top text-zinc-600">{c.email ?? "—"}</td>
                        <td className="px-2 py-2 align-top text-zinc-600">{c.phone ?? "—"}</td>
                        <td className="max-w-[160px] truncate px-2 py-2 align-top text-zinc-600">{c.contact_person ?? "—"}</td>
                        <td className="px-2 py-2 align-top text-zinc-600">{c.address_city ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {template && (
          <div className={CARD}>
            <p className="text-sm font-semibold text-zinc-900">4. Maili</p>
            <p className="mt-1 text-xs text-zinc-500">
              Pošiljanje še ni vklopljeno (manjka RESEND_API_KEY) — maile kopirajte in pošljite iz svojega
              odjemalca. Ko dodate ključ, jih bo mogoče poslati od tod.
            </p>

            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Skupni predložek</p>
                <button
                  type="button"
                  onClick={() => copy("template", `${template.subject}\n\n${template.body}`)}
                  className="flex items-center gap-1 text-xs font-medium text-accent"
                >
                  {copied === "template" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Kopiraj
                </button>
              </div>
              <p className="mt-2 text-sm font-medium text-zinc-900">{template.subject}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{template.body}</p>
            </div>

            <div className="mt-4 space-y-3">
              {emails.map((mail) => {
                const candidate = candidates?.find((c) => c.id === mail.leadId);
                return (
                  <div key={mail.leadId} className="rounded-xl border border-zinc-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-900">
                        {candidate?.company_name ?? mail.leadId}
                        {candidate?.email && <span className="ml-2 text-xs font-normal text-zinc-500">{candidate.email}</span>}
                      </p>
                      <button
                        type="button"
                        onClick={() => copy(mail.leadId, `${mail.subject}\n\n${mail.body}`)}
                        className="flex items-center gap-1 text-xs font-medium text-accent"
                      >
                        {copied === mail.leadId ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        Kopiraj
                      </button>
                    </div>
                    {mail.angle && <p className="mt-1 text-[11px] text-zinc-400">{mail.angle}</p>}
                    <p className="mt-2 text-sm font-medium text-zinc-900">{mail.subject}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{mail.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {candidates && candidates.length > 0 && (
          <div className={CARD}>
            <p className="text-sm font-semibold text-zinc-900">5. Ustvari kampanjo</p>
            <p className="mt-1 text-xs text-zinc-500">
              {chosen.length} podjetij gre v pipeline, skupaj z oceno ujemanja in osnutkom maila.
            </p>
            <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Ime kampanje
              <input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder={theme.slice(0, 60)}
                className={`${INPUT} font-normal normal-case tracking-normal`}
              />
            </label>
            <button
              type="button"
              onClick={save}
              disabled={busy !== null || chosen.length === 0}
              className="mt-4 flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Ustvari kampanjo
            </button>
          </div>
        )}
      </div>

      <div className={`${CARD} xl:sticky xl:top-4 xl:self-start`}>
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <MessageSquare className="h-4 w-4 text-accent" />
          Brainstorm
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Kako to prodati tej panogi. Odgovarja iz vaše baze znanja — kar ni v njej, pove, da ni.
        </p>

        {/* One switch drives both the brainstorm and the written mails. */}
        <button
          type="button"
          onClick={() => setCardone((v) => !v)}
          className={`mt-3 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
            cardone
              ? "border-amber-400 bg-amber-50 text-amber-900"
              : "border-zinc-200 bg-white text-zinc-600 hover:border-amber-300 hover:bg-amber-50/50"
          }`}
          title="AI posnemanje javnih načel Granta Cardona — ni Grant Cardone osebno"
        >
          <Flame className={`h-4 w-4 shrink-0 ${cardone ? "text-amber-500" : "text-zinc-400"}`} />
          <span>
            <span className="font-semibold">Grant Cardone način {cardone ? "— VKLOPLJEN" : ""}</span>
            <span className="block text-[11px] opacity-80">
              Velja za brainstorm IN za napisane maile: 10X pristop, jasen razlog za zdaj, en
              odločen naslednji korak.
            </span>
          </span>
        </button>

        <div className="mt-4 max-h-[26rem] space-y-3 overflow-y-auto">
          {chat.length === 0 && (
            <p className="text-xs text-zinc-400">
              npr. „Kaj je najmočnejši prvi stavek za gradbince?&ldquo; ali „Kako odgovorim, da nimajo časa?&ldquo;
            </p>
          )}
          {chat.map((m, i) => (
            <div
              key={i}
              className={`rounded-xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-accent/10 text-zinc-900" : "bg-zinc-50 text-zinc-700"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.used && m.used.length > 0 && (
                <p className="mt-1 text-[11px] text-zinc-400">Iz baze: {m.used.join(", ")}</p>
              )}
            </div>
          ))}
          {chatBusy && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            placeholder="Vprašajte coacha …"
            className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={ask}
            disabled={chatBusy || !question.trim()}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Pošlji
          </button>
        </div>
      </div>
    </div>
  );
}
