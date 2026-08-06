"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, MessageSquare, BookOpen, Save } from "lucide-react";
import { saveKnowledge, deleteKnowledge, saveCoachStyle, type KnowledgeResult } from "./actions";
import { KNOWLEDGE_KIND_LABELS, KNOWLEDGE_KINDS, type KnowledgeEntry } from "@/lib/salesCoachTypes";
import { useRestoreOnce, useAutoSave } from "@/lib/useSavedState";

/**
 * Two halves of the same idea: on the left the material you decide is true
 * about selling your thing, on the right a coach that answers only from it.
 * When the base does not cover a question the answer says so — generic sales
 * advice is available everywhere and is not what this is for.
 */

const CARD = "rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm";
const INPUT =
  "mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none";

export default function SalesCoachClient({
  entries,
  style,
}: {
  entries: KnowledgeEntry[];
  style: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [state, formAction, pending] = useActionState<KnowledgeResult, FormData>(saveKnowledge, {});

  const [styleDraft, setStyleDraft] = useState(style);
  const [styleSaved, setStyleSaved] = useState(false);

  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<
    { role: "user" | "assistant"; text: string; used?: string[]; outOfScope?: boolean }[]
  >([]);
  const [chatBusy, setChatBusy] = useState(false);

  // The conversation is the work here — it should still be there tomorrow.
  const { loaded: chatLoaded } = useRestoreOnce<typeof chat>("prodajni-coach", (saved) => setChat(saved));
  useAutoSave("prodajni-coach", chat, chatLoaded);

  if (state.success && showForm) {
    // The action revalidated the page; close the form and pick up fresh data.
    setShowForm(false);
    setEditing(null);
    router.refresh();
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
        body: JSON.stringify({ question: text }),
      });
      const json = await res.json();
      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          text: json?.answer ?? json?.error ?? "Odgovora ni bilo mogoče pridobiti.",
          used: (json?.used ?? []).map((u: { title: string }) => u.title),
          outOfScope: Boolean(json?.outOfScope),
        },
      ]);
    } catch {
      setChat((prev) => [...prev, { role: "assistant", text: "Prišlo je do napake." }]);
    } finally {
      setChatBusy(false);
    }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Izbrisati zapis "${title}"?`)) return;
    await deleteKnowledge(id);
    router.refresh();
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="space-y-5">
        <div className={CARD}>
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <BookOpen className="h-4 w-4 text-accent" />
              Baza znanja ({entries.length})
            </p>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setShowForm((v) => !v);
              }}
              className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Nov zapis
            </button>
          </div>

          {(showForm || editing) && (
            <form action={formAction} className="mt-4 space-y-3 rounded-xl bg-zinc-50 p-4">
              <input type="hidden" name="id" value={editing?.id ?? ""} />
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Naslov
                <input
                  name="title"
                  defaultValue={editing?.title ?? ""}
                  required
                  placeholder="npr. Odgovor na „nimamo časa“"
                  className={`${INPUT} font-normal normal-case tracking-normal`}
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Vrsta
                <select
                  name="kind"
                  defaultValue={editing?.kind ?? "note"}
                  className={`${INPUT} font-normal normal-case tracking-normal`}
                >
                  {KNOWLEDGE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KNOWLEDGE_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Vsebina
                <textarea
                  name="content"
                  defaultValue={editing?.content ?? ""}
                  required
                  rows={8}
                  placeholder="Skripta, ugovor z odgovorom, primer iz prakse …"
                  className={`${INPUT} font-normal normal-case tracking-normal`}
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Oznake (ločene z vejico)
                <input
                  name="tags"
                  defaultValue={editing?.tags.join(", ") ?? ""}
                  placeholder="gradbeništvo, hladni klic"
                  className={`${INPUT} font-normal normal-case tracking-normal`}
                />
              </label>
              {state.error && <p className="text-xs text-red-500">{state.error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Shrani
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Prekliči
                </button>
              </div>
            </form>
          )}

          <div className="mt-4 space-y-2">
            {entries.length === 0 && !showForm && (
              <p className="text-xs text-zinc-400">
                Baza je prazna. Dodajte skripto, ugovor z odgovorom ali primer iz prakse — coach odgovarja
                izključno iz tega.
              </p>
            )}
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{entry.title}</p>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-400">
                      {KNOWLEDGE_KIND_LABELS[entry.kind] ?? entry.kind}
                      {entry.tags.length > 0 && ` · ${entry.tags.join(", ")}`}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(entry);
                        setShowForm(true);
                      }}
                      className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent/5"
                    >
                      Uredi
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(entry.id, entry.title)}
                      className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-2 line-clamp-3 text-xs text-zinc-600">{entry.content}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={CARD}>
          <p className="text-sm font-semibold text-zinc-900">Slog prodaje</p>
          <p className="mt-1 text-xs text-zinc-500">
            Kako naj coach govori. To je nastavitev tona — odgovori še vedno prihajajo iz vaše baze znanja.
          </p>
          <textarea
            value={styleDraft}
            onChange={(e) => {
              setStyleDraft(e.target.value);
              setStyleSaved(false);
            }}
            rows={3}
            placeholder="npr. direktno in odločno, brez olepševanja, vedno predlagaj naslednji korak"
            className={INPUT}
          />
          <button
            type="button"
            onClick={async () => {
              await saveCoachStyle(styleDraft);
              setStyleSaved(true);
            }}
            className="mt-3 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Shrani slog
          </button>
          {styleSaved && <span className="ml-3 text-xs text-emerald-600">Shranjeno.</span>}
        </div>
      </div>

      <div className={`${CARD} xl:sticky xl:top-4 xl:self-start`}>
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <MessageSquare className="h-4 w-4 text-accent" />
          Coach
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Vsak odgovor pove, na katere vaše zapise se opira. Če jih ni, to pove — in ne izmisli nasveta.
        </p>

        <div className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto">
          {chat.length === 0 && (
            <p className="text-xs text-zinc-400">
              npr. „Kako začnem klic pri gradbincu?&ldquo; ali „Kaj odgovorim na &sbquo;pošljite mail&lsquo;?&ldquo;
            </p>
          )}
          {chat.map((m, i) => (
            <div
              key={i}
              className={`rounded-xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-accent/10 text-zinc-900"
                  : m.outOfScope
                    ? "bg-amber-50 text-amber-800"
                    : "bg-zinc-50 text-zinc-700"
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
