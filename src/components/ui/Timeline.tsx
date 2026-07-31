import { ACTIVITY_TYPE_LABELS, type ActivityWithAuthor } from "@/lib/activity/types";

export default function Timeline({
  activity,
  emptyMessage = "Ni še aktivnosti.",
}: {
  activity: ActivityWithAuthor[];
  emptyMessage?: string;
}) {
  if (activity.length === 0) {
    return <p className="text-sm text-zinc-400">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-4">
      {activity.map((entry) => (
        <div key={entry.id} className="border-l-2 border-zinc-200 pl-3 text-sm">
          <p className="font-medium text-zinc-800">
            {ACTIVITY_TYPE_LABELS[entry.type]}
          </p>
          {entry.content && (
            <p className="mt-0.5 text-zinc-600">{entry.content}</p>
          )}
          <p className="mt-0.5 text-xs text-zinc-400">
            {new Date(entry.created_at).toLocaleString("sl-SI")}
            {entry.author && (
              <> · {entry.author.full_name || entry.author.email}</>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
