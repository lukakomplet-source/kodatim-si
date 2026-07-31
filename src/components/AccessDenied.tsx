import Link from "next/link";
import { Lock } from "lucide-react";

export default function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-20 text-center shadow-sm">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
        <Lock className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-zinc-900">
        Nimate dovoljenja za ogled te strani.
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Če menite, da je to napaka, se obrnite na skrbnika sistema.
      </p>
      <Link
        href="/admin"
        className="mt-6 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
      >
        Nazaj na pregled
      </Link>
    </div>
  );
}
