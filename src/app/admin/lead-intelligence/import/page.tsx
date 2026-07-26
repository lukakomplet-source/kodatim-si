"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import ImportWizard from "./ImportWizard";
import ManualEntryForm from "./ManualEntryForm";
import AiImageEntryForm from "./AiImageEntryForm";

export default function ImportPage() {
  const [mode, setMode] = useState<"file" | "manual" | "ai-image">("file");

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Uvoz leadov</h1>
      <p className="mt-2 text-base text-zinc-500">
        Uvozite CSV/Excel datoteko z mapiranjem stolpcev, dodajte lead ročno
        ali naložite sliko in pustite, da podatke prepozna AI.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
            mode === "file"
              ? "bg-zinc-900 text-white"
              : "border border-zinc-300 text-zinc-900 hover:bg-zinc-50"
          }`}
        >
          Uvoz datoteke
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
            mode === "manual"
              ? "bg-zinc-900 text-white"
              : "border border-zinc-300 text-zinc-900 hover:bg-zinc-50"
          }`}
        >
          Ročni vnos
        </button>
        <button
          type="button"
          onClick={() => setMode("ai-image")}
          className={`flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition ${
            mode === "ai-image"
              ? "bg-zinc-900 text-white"
              : "border border-zinc-300 text-zinc-900 hover:bg-zinc-50"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI iz slike
        </button>
      </div>

      <div className="mt-6">
        {mode === "file" && <ImportWizard />}
        {mode === "manual" && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
            <ManualEntryForm />
          </div>
        )}
        {mode === "ai-image" && <AiImageEntryForm />}
      </div>
    </div>
  );
}
