/** Shown while an admin page loads (Harvey and the database can take a few seconds). */
export default function AdminLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-700" />
      <p className="mt-4 text-sm text-zinc-500">Nalagam stran …</p>
    </div>
  );
}
