"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Globe, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import {
  DEMO_STATUSI,
  DEMO_STATUS_LABELS,
  DEMO_STATUS_STYLES,
  DEMO_VRSTE,
  DEMO_VRSTA_LABELS,
  toSlug,
  type DemoStatus,
  type DemoStran,
} from "@/lib/demoStrani";
import { deleteDemoStran, saveDemoStran, updateDemoStatus, type DemoResult } from "./actions";

/**
 * The catalogue of client demos parked on our own domain.
 *
 * Filtering is client-side: the whole list arrives as a prop with no
 * pagination, so a status tab is a `useMemo`, not a URL round-trip — the same
 * choice the tasks screen makes for the same reason.
 */

const CARD = "rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm";
const INPUT =
  "mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-normal normal-case tracking-normal focus:border-accent/50 focus:outline-none";
const LABEL = "block text-xs font-medium uppercase tracking-wide text-zinc-500";

export default function DemoStraniClient({ items }: { items: DemoStran[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<DemoStatus | "vse">("vse");
  const [editing, setEditing] = useState<DemoStran | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [slugDraft, setSlugDraft] = useState("");
  const [state, formAction, saving] = useActionState<DemoResult, FormData>(saveDemoStran, {});

  if (state.success && (showForm || editing)) {
    // The action revalidated the page; close the form and pick up fresh rows.
    setShowForm(false);
    setEditing(null);
    setSlugDraft("");
    router.refresh();
  }

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.status, (map.get(item.status) ?? 0) + 1);
    return map;
  }, [items]);

  const visible = useMemo(
    () => (tab === "vse" ? items : items.filter((i) => i.status === tab)),
    [items, tab]
  );

  /**
   * The link the client gets. Built from the live origin rather than a
   * hardcoded domain, so a link copied while testing on localhost points at
   * localhost and a link copied on kodatim.si points at kodatim.si.
   */
  function publicUrl(slug: string): string {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}/${slug}`;
  }

  function copyLink(item: DemoStran) {
    void navigator.clipboard?.writeText(publicUrl(item.slug));
    setCopied(item.id);
    setTimeout(() => setCopied((c) => (c === item.id ? null : c)), 2000);
  }

  function openEditor(item: DemoStran | null) {
    setEditing(item);
    setSlugDraft(item?.slug ?? "");
    setShowForm(true);
  }

  async function remove(item: DemoStran) {
    if (!confirm(`Izbrisati zapis „${item.naziv}“? Stran sama s tem ne bo izbrisana.`)) return;
    startTransition(async () => {
      await deleteDemoStran(item.id);
      router.refresh();
    });
  }

  function changeStatus(item: DemoStran, status: string) {
    startTransition(async () => {
      await updateDemoStatus(item.id, status);
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "vse"} onClick={() => setTab("vse")} label="Vse" count={items.length} />
          {DEMO_STATUSI.map((s) => (
            <TabButton
              key={s}
              active={tab === s}
              onClick={() => setTab(s)}
              label={DEMO_STATUS_LABELS[s]}
              count={counts.get(s) ?? 0}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => openEditor(null)}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Nova stran
        </button>
      </div>

      {showForm && (
        <div className={CARD}>
          <p className="text-sm font-semibold text-zinc-900">
            {editing ? `Uredi „${editing.naziv}“` : "Nova stran"}
          </p>
          <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={editing?.id ?? ""} />

            <label className={LABEL}>
              Naziv
              <input
                name="naziv"
                defaultValue={editing?.naziv ?? ""}
                required
                placeholder="npr. Keramika Novak — demo"
                onChange={(e) => {
                  // Only auto-fill the slug while creating and while the user
                  // has not typed one; never rewrite an existing page's URL
                  // from under it.
                  if (!editing && !slugDraft) setSlugDraft(toSlug(e.target.value));
                }}
                className={INPUT}
              />
            </label>

            <label className={LABEL}>
              Naslov strani (slug)
              <span className="mt-1 flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2">
                <span className="shrink-0 text-sm text-zinc-400">kodatim.si/</span>
                <input
                  name="slug"
                  value={slugDraft}
                  onChange={(e) => setSlugDraft(toSlug(e.target.value))}
                  placeholder="keramika"
                  className="w-full text-sm font-normal normal-case tracking-normal focus:outline-none"
                />
              </span>
            </label>

            <label className={LABEL}>
              Stranka
              <input
                name="stranka"
                defaultValue={editing?.stranka ?? ""}
                placeholder="npr. Keramika Novak d.o.o."
                className={INPUT}
              />
            </label>

            <label className={LABEL}>
              Vrsta
              <select name="vrsta" defaultValue={editing?.vrsta ?? "spletna_stran"} className={INPUT}>
                {DEMO_VRSTE.map((v) => (
                  <option key={v} value={v}>
                    {DEMO_VRSTA_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>

            <label className={LABEL}>
              Status
              <select name="status" defaultValue={editing?.status ?? "v_izdelavi"} className={INPUT}>
                {DEMO_STATUSI.map((s) => (
                  <option key={s} value={s}>
                    {DEMO_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>

            <label className={LABEL}>
              Končna domena (ko se preseli)
              <input
                name="koncna_domena"
                defaultValue={editing?.koncna_domena ?? ""}
                placeholder="npr. keramika-novak.si"
                className={INPUT}
              />
            </label>

            <label className={`${LABEL} sm:col-span-2`}>
              Opombe
              <textarea
                name="opombe"
                defaultValue={editing?.opombe ?? ""}
                rows={3}
                placeholder="Kaj je dogovorjeno, kaj še manjka, kdaj gre na domeno …"
                className={INPUT}
              />
            </label>

            {state.error && <p className="text-xs text-red-500 sm:col-span-2">{state.error}</p>}

            <div className="flex gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Shrani
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                  setSlugDraft("");
                }}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Prekliči
              </button>
            </div>
          </form>
        </div>
      )}

      {visible.length === 0 ? (
        <div className={CARD}>
          <p className="text-sm text-zinc-500">
            {items.length === 0
              ? "Poleg vgrajenih ni dodane še nobene strani. Dodajte prvo z gumbom „Nova stran“ — potem mi v klepetu recite, za koga naj zgradim demo."
              : "V tem statusu ni nobene strani."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((item) => (
            <div key={item.id} className={`${CARD} py-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                    <Globe className="h-4 w-4 shrink-0 text-accent" />
                    {item.naziv}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${DEMO_STATUS_STYLES[item.status]}`}>
                      {DEMO_STATUS_LABELS[item.status]}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                      {DEMO_VRSTA_LABELS[item.vrsta]}
                    </span>
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    <span className="font-mono text-zinc-700">/{item.slug}</span>
                    {item.stranka && ` · ${item.stranka}`}
                    {item.koncna_domena && ` · preseljeno na ${item.koncna_domena}`}
                  </p>
                  {item.opombe && <p className="mt-1.5 text-xs text-zinc-600">{item.opombe}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={item.status}
                    disabled={isPending}
                    onChange={(e) => changeStatus(item, e.target.value)}
                    className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs"
                  >
                    {DEMO_STATUSI.map((s) => (
                      <option key={s} value={s}>
                        {DEMO_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <a
                    href={`/${item.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Odpri
                  </a>
                  <button
                    type="button"
                    onClick={() => copyLink(item)}
                    className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                  >
                    {copied === item.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === item.id ? "Kopirano" : "Kopiraj povezavo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditor(item)}
                    title="Uredi"
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    title="Izbriši zapis"
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
        active ? "bg-accent text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-white/20" : "bg-zinc-100 text-zinc-500"}`}>
        {count}
      </span>
    </button>
  );
}
