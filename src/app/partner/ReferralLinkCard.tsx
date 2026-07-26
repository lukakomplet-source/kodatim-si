"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function ReferralLinkCard({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
      <p className="text-base font-medium text-zinc-700">
        Vaša unikatna povezava
      </p>
      <p className="mt-1.5 text-sm text-zinc-500">
        Delite jo — vsak, ki pride prek te povezave, se poveže z vašim
        računom.
      </p>
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4">
        <code className="flex-1 truncate text-[15px] text-zinc-900">
          {link}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? "Kopirano" : "Kopiraj"}
        </button>
      </div>
    </div>
  );
}
