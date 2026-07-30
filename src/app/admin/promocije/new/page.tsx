import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import NewCampaignForm from "./NewCampaignForm";

export default function NewCampaignPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/promocije"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Nazaj na Promocije
      </Link>

      <h1 className="mt-4 text-3xl font-semibold text-zinc-900">Nova kampanja</h1>
      <p className="mt-2 text-base text-zinc-500">
        Opišite ciljni segment. Podjetja iz Lead Intelligence boste dodali na
        naslednjem koraku.
      </p>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <NewCampaignForm />
      </div>
    </div>
  );
}
