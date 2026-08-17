"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronRight, Loader2, Mail, Phone, Trash2 } from "lucide-react";
import type { TargetWithLead } from "@/lib/promocije/queries";
import type { PromoCampaign } from "@/lib/promocije/types";
import {
  CALL_STATUS_LABELS,
  PIPELINE_STAGE_LABELS,
  type CallStatus,
  type PipelineStage,
  type SocialOutreach,
} from "@/lib/promocije/types";
import { removeTarget, toggleSocialOutreach, updateCallInfo, updatePipelineStage } from "../actions";

/**
 * The working surface for a campaign: every company on one screen, with the
 * phone number, the person, and a place to mark what has already been done.
 *
 * The list this replaces showed a name and a stage badge, which meant the actual
 * work — call this number, write to that person, tick it off — happened in a
 * detail page one company at a time. With eight hundred companies that is not a
 * workflow, and the numbers ("how far am I?") were invisible.
 *
 * Every control saves immediately through the actions that already existed, and
 * every change is also written to the lead's activity log by those actions, so
 * "what did I do last week" has an answer that is not this component's memory.
 */

type Kanal = "instagram" | "facebook" | "linkedin";

const KANALI: { kljuc: Kanal; kratko: string; naslov: string }[] = [
  { kljuc: "instagram", kratko: "IG", naslov: "Instagram" },
  { kljuc: "facebook", kratko: "FB", naslov: "Facebook" },
  { kljuc: "linkedin", kratko: "LI", naslov: "LinkedIn" },
];

/** Phone as the source wrote it, minus what a dialler chokes on. */
function telUrl(tel: string): string {
  return `tel:${tel.replace(/[^\d+]/g, "")}`;
}

export default function DelovnaTabela({
  campaign,
  targets,
}: {
  campaign: PromoCampaign;
  targets: TargetWithLead[];
}) {
  const router = useRouter();
  const [tece, start] = useTransition();
  const [shranjujem, setShranjujem] = useState<string | null>(null);

  const [fRegija, setFRegija] = useState("");
  const [fKraj, setFKraj] = useState("");
  const [fKlic, setFKlic] = useState("");
  const [fTelefon, setFTelefon] = useState(false);
  const [fEmail, setFEmail] = useState(false);
  const [fOseba, setFOseba] = useState(false);
  const [fNeobdelani, setFNeobdelani] = useState(false);
  const [razvrsti, setRazvrsti] = useState<"ime" | "kraj" | "klic" | "faza">("ime");

  /**
   * Local overlay of what has just been changed.
   *
   * The server action revalidates and the row will arrive correct on the next
   * render, but a select that snaps back for a moment reads as "it did not save".
   */
  const [lokalno, setLokalno] = useState<
    Record<string, { call_status?: CallStatus; pipeline_stage?: PipelineStage; social?: SocialOutreach; call_notes?: string; next_call_date?: string | null }>
  >({});

  const vrednost = (t: TargetWithLead) => ({
    call_status: lokalno[t.id]?.call_status ?? t.call_status,
    pipeline_stage: lokalno[t.id]?.pipeline_stage ?? t.pipeline_stage,
    social: lokalno[t.id]?.social ?? ((t.social_outreach ?? {}) as SocialOutreach),
    call_notes: lokalno[t.id]?.call_notes ?? t.call_notes ?? "",
    next_call_date: lokalno[t.id]?.next_call_date ?? t.next_call_date ?? "",
  });

  const regije = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of targets) {
      const r = (t.lead.address_region ?? "").trim();
      if (r) m.set(r, (m.get(r) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "sl"));
  }, [targets]);

  const prikazani = useMemo(() => {
    const izbrani = targets.filter((t) => {
      const v = vrednost(t);
      if (fRegija && (t.lead.address_region ?? "") !== fRegija) return false;
      if (fKraj && !(t.lead.address_city ?? "").toLowerCase().includes(fKraj.toLowerCase())) return false;
      if (fKlic && v.call_status !== fKlic) return false;
      if (fTelefon && !t.lead.phone) return false;
      if (fEmail && !t.lead.email) return false;
      if (fOseba && !t.lead.contact_person) return false;
      if (fNeobdelani) {
        const kaj = Object.values(v.social).some((p) => Object.values(p ?? {}).some(Boolean));
        if (v.call_status !== "not_called" || kaj) return false;
      }
      return true;
    });

    return [...izbrani].sort((a, b) => {
      switch (razvrsti) {
        case "kraj":
          return (a.lead.address_city ?? "").localeCompare(b.lead.address_city ?? "", "sl");
        case "klic":
          return vrednost(a).call_status.localeCompare(vrednost(b).call_status);
        case "faza":
          return vrednost(a).pipeline_stage.localeCompare(vrednost(b).pipeline_stage);
        case "ime":
        default:
          return a.lead.company_name.localeCompare(b.lead.company_name, "sl");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `vrednost` bere `lokalno`, ki je v odvisnostih
  }, [targets, fRegija, fKraj, fKlic, fTelefon, fEmail, fOseba, fNeobdelani, razvrsti, lokalno]);

  /** How far the work has got, over the whole campaign rather than the filter. */
  const stevci = useMemo(() => {
    let klicanih = 0;
    let zanimanje = 0;
    let ig = 0;
    let odgovorov = 0;
    for (const t of targets) {
      const v = vrednost(t);
      if (v.call_status !== "not_called") klicanih += 1;
      if (["interested", "meeting_scheduled", "offer_sent", "won"].includes(v.call_status)) zanimanje += 1;
      for (const k of KANALI) {
        if (v.social[k.kljuc]?.followed) ig += 1;
        if (v.social[k.kljuc]?.connected) odgovorov += 1;
      }
    }
    return { klicanih, zanimanje, ig, odgovorov };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, lokalno]);

  const shrani = (id: string, delo: () => Promise<{ error?: string }>) => {
    setShranjujem(id);
    start(async () => {
      const out = await delo();
      setShranjujem(null);
      if (out?.error) alert(out.error);
      else router.refresh();
    });
  };

  const nastaviKlic = (t: TargetWithLead, status: CallStatus) => {
    const v = vrednost(t);
    setLokalno((p) => ({ ...p, [t.id]: { ...p[t.id], call_status: status } }));
    shrani(t.id, () =>
      updateCallInfo(campaign.id, t.id, {
        call_status: status,
        call_notes: v.call_notes,
        call_duration_seconds: t.call_duration_seconds ?? null,
        next_call_date: v.next_call_date || null,
      })
    );
  };

  const shraniZapiske = (t: TargetWithLead, zapiski: string, datum: string) => {
    const v = vrednost(t);
    if (zapiski === (t.call_notes ?? "") && datum === (t.next_call_date ?? "")) return;
    shrani(t.id, () =>
      updateCallInfo(campaign.id, t.id, {
        call_status: v.call_status,
        call_notes: zapiski,
        call_duration_seconds: t.call_duration_seconds ?? null,
        next_call_date: datum || null,
      })
    );
  };

  const preklopiKanal = (t: TargetWithLead, kanal: Kanal, dejanje: "followed" | "connected") => {
    const v = vrednost(t);
    const trenutno = Boolean(v.social[kanal]?.[dejanje]);
    setLokalno((p) => ({
      ...p,
      [t.id]: {
        ...p[t.id],
        social: { ...v.social, [kanal]: { ...(v.social[kanal] ?? {}), [dejanje]: !trenutno } },
      },
    }));
    shrani(t.id, () => toggleSocialOutreach(campaign.id, t.id, kanal, dejanje, !trenutno));
  };

  if (targets.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl bg-zinc-50 px-4 py-3 text-xs text-zinc-600 ring-1 ring-zinc-200">
        <span>
          Podjetij: <strong className="text-zinc-900">{targets.length}</strong>
        </span>
        <span>
          Klicanih: <strong className="text-zinc-900">{stevci.klicanih}</strong> (
          {Math.round((stevci.klicanih / targets.length) * 100)} %)
        </span>
        <span>
          Zainteresiranih ali več: <strong className="text-emerald-700">{stevci.zanimanje}</strong>
        </span>
        <span>
          Dodanih na omrežjih: <strong className="text-zinc-900">{stevci.ig}</strong>
        </span>
        <span>
          Odgovorov z omrežij: <strong className="text-emerald-700">{stevci.odgovorov}</strong>
        </span>
        {tece && (
          <span className="flex items-center gap-1 text-zinc-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            shranjujem
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-zinc-500">Regija</span>
          <select
            value={fRegija}
            onChange={(e) => setFRegija(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
          >
            <option value="">Vse ({targets.length})</option>
            {regije.map(([r, n]) => (
              <option key={r} value={r}>
                {r} ({n})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-zinc-500">Kraj</span>
          <input
            value={fKraj}
            onChange={(e) => setFKraj(e.target.value)}
            placeholder="npr. Celje"
            className="w-28 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-zinc-500">Stanje klica</span>
          <select
            value={fKlic}
            onChange={(e) => setFKlic(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
          >
            <option value="">Vsa</option>
            {Object.entries(CALL_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-zinc-500">Razvrsti</span>
          <select
            value={razvrsti}
            onChange={(e) => setRazvrsti(e.target.value as typeof razvrsti)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
          >
            <option value="ime">po imenu</option>
            <option value="kraj">po kraju</option>
            <option value="klic">po stanju klica</option>
            <option value="faza">po fazi</option>
          </select>
        </label>

        {[
          { oznaka: "ima telefon", vrednost: fTelefon, nastavi: setFTelefon },
          { oznaka: "ima e-pošto", vrednost: fEmail, nastavi: setFEmail },
          { oznaka: "ima osebo", vrednost: fOseba, nastavi: setFOseba },
          { oznaka: "še neobdelani", vrednost: fNeobdelani, nastavi: setFNeobdelani },
        ].map((f) => (
          <label
            key={f.oznaka}
            className="flex items-center gap-1.5 self-end rounded-lg border border-zinc-200 px-2.5 py-2 text-xs"
          >
            <input
              type="checkbox"
              checked={f.vrednost}
              onChange={(e) => f.nastavi(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            {f.oznaka}
          </label>
        ))}

        <p className="ml-auto self-end text-xs text-zinc-500">
          Prikazanih {prikazani.length} od {targets.length}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Podjetje</th>
              <th className="px-3 py-2.5 font-semibold">Telefon</th>
              <th className="px-3 py-2.5 font-semibold">E-pošta</th>
              <th className="px-3 py-2.5 font-semibold">Oseba</th>
              <th className="px-3 py-2.5 font-semibold">Klic</th>
              <th className="px-3 py-2.5 text-center font-semibold" title="Dodan / odgovoril">
                IG · FB · LI
              </th>
              <th className="px-3 py-2.5 font-semibold">Zapiski</th>
              <th className="px-3 py-2.5 font-semibold">Naslednji klic</th>
              <th className="px-3 py-2.5 font-semibold">Faza</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {prikazani.map((t) => {
              const v = vrednost(t);
              return (
                <tr key={t.id} className={shranjujem === t.id ? "bg-amber-50/40" : "hover:bg-zinc-50"}>
                  <td className="max-w-[220px] px-3 py-2 align-top">
                    <Link
                      href={`/admin/promocije/${campaign.id}/targets/${t.id}`}
                      className="block truncate font-medium text-zinc-900 hover:text-accent"
                      title={t.lead.company_name}
                    >
                      {t.lead.company_name}
                    </Link>
                    <span className="block truncate text-[11px] text-zinc-400">
                      {[t.lead.industry, t.lead.address_city].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-3 py-2 align-top">
                    {t.lead.phone ? (
                      <a
                        href={telUrl(t.lead.phone)}
                        className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                        title="Pokliči"
                      >
                        <Phone className="h-3 w-3" />
                        {t.lead.phone}
                      </a>
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </td>

                  <td className="max-w-[180px] px-3 py-2 align-top">
                    {t.lead.email ? (
                      <a
                        href={`mailto:${t.lead.email}`}
                        className="inline-flex max-w-full items-center gap-1 truncate text-zinc-700 hover:text-accent"
                        title={t.lead.email}
                      >
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{t.lead.email}</span>
                      </a>
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </td>

                  <td className="max-w-[160px] px-3 py-2 align-top text-zinc-600">
                    <span className="block truncate" title={t.lead.contact_person ?? ""}>
                      {t.lead.contact_person || "—"}
                    </span>
                  </td>

                  <td className="px-3 py-2 align-top">
                    <select
                      value={v.call_status}
                      onChange={(e) => nastaviKlic(t, e.target.value as CallStatus)}
                      className={`rounded-lg border px-2 py-1 text-[11px] ${
                        v.call_status === "not_called"
                          ? "border-zinc-200 text-zinc-500"
                          : ["interested", "meeting_scheduled", "offer_sent", "won"].includes(v.call_status)
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-zinc-300 text-zinc-800"
                      }`}
                    >
                      {Object.entries(CALL_STATUS_LABELS).map(([k, oznaka]) => (
                        <option key={k} value={k}>
                          {oznaka}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Two ticks per network: added, and answered. That is the whole
                      question being asked of this column. */}
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center justify-center gap-2">
                      {KANALI.map((k) => {
                        const dodan = Boolean(v.social[k.kljuc]?.followed);
                        const odgovoril = Boolean(v.social[k.kljuc]?.connected);
                        return (
                          <span key={k.kljuc} className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] text-zinc-400">{k.kratko}</span>
                            <span className="flex gap-0.5">
                              <button
                                type="button"
                                title={`${k.naslov}: dodan`}
                                onClick={() => preklopiKanal(t, k.kljuc, "followed")}
                                className={`h-5 w-5 rounded border text-[10px] font-bold ${
                                  dodan
                                    ? "border-accent bg-accent text-white"
                                    : "border-zinc-200 text-zinc-400 hover:bg-zinc-100"
                                }`}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                title={`${k.naslov}: odgovoril`}
                                onClick={() => preklopiKanal(t, k.kljuc, "connected")}
                                className={`flex h-5 w-5 items-center justify-center rounded border ${
                                  odgovoril
                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                    : "border-zinc-200 text-zinc-300 hover:bg-zinc-100"
                                }`}
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </td>

                  <td className="px-3 py-2 align-top">
                    <input
                      defaultValue={v.call_notes}
                      onBlur={(e) => shraniZapiske(t, e.target.value, v.next_call_date)}
                      placeholder="kaj je rekel …"
                      className="w-40 rounded-lg border border-zinc-200 px-2 py-1 text-[11px]"
                    />
                  </td>

                  <td className="px-3 py-2 align-top">
                    <input
                      type="date"
                      defaultValue={v.next_call_date}
                      onChange={(e) => shraniZapiske(t, v.call_notes, e.target.value)}
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px]"
                    />
                  </td>

                  <td className="px-3 py-2 align-top">
                    <select
                      value={v.pipeline_stage}
                      onChange={(e) => {
                        const faza = e.target.value as PipelineStage;
                        setLokalno((p) => ({ ...p, [t.id]: { ...p[t.id], pipeline_stage: faza } }));
                        shrani(t.id, () => updatePipelineStage(campaign.id, t.id, faza));
                      }}
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700"
                    >
                      {Object.entries(PIPELINE_STAGE_LABELS).map(([k, oznaka]) => (
                        <option key={k} value={k}>
                          {oznaka}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="whitespace-nowrap px-3 py-2 align-top text-right">
                    <Link
                      href={`/admin/promocije/${campaign.id}/targets/${t.id}`}
                      title="Odpri podjetje"
                      className="inline-flex text-zinc-300 hover:text-accent"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      title="Odstrani iz kampanje"
                      onClick={() => {
                        if (!confirm(`Odstraniti "${t.lead.company_name}" iz kampanje?`)) return;
                        shrani(t.id, () => removeTarget(campaign.id, t.id));
                      }}
                      className="ml-1 rounded p-1 text-zinc-300 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-zinc-400">
        Vsaka sprememba se shrani takoj in se zapiše tudi v zgodovino podjetja v Lead Intelligence —
        „kaj sem naredil“ tako ne živi samo v tej tabeli. Klik na telefon odpre klic, klik na e-pošto
        odpre poštni program.
      </p>
    </div>
  );
}
