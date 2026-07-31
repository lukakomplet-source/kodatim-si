"use client";

import { useRouter } from "next/navigation";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_ACTIONS,
  SOCIAL_ACTION_LABELS,
  type SocialOutreach,
} from "@/lib/promocije/types";
import { toggleSocialOutreach } from "../../../actions";

export default function SocialOutreachCard({
  campaignId,
  targetId,
  socialOutreach,
}: {
  campaignId: string;
  targetId: string;
  socialOutreach: SocialOutreach | null;
}) {
  const router = useRouter();

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">Družbena omrežja</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-zinc-400">
              <th className="py-1 pr-3 font-medium">Platforma</th>
              {SOCIAL_ACTIONS.map((a) => (
                <th key={a} className="px-2 py-1 text-center font-medium">
                  {SOCIAL_ACTION_LABELS[a]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SOCIAL_PLATFORMS.map((platform) => (
              <tr key={platform} className="border-t border-zinc-100">
                <td className="py-2 pr-3 font-medium text-zinc-700">
                  {SOCIAL_PLATFORM_LABELS[platform]}
                </td>
                {SOCIAL_ACTIONS.map((action) => {
                  const checked = Boolean(socialOutreach?.[platform]?.[action]);
                  return (
                    <td key={action} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        defaultChecked={checked}
                        onChange={(e) =>
                          toggleSocialOutreach(
                            campaignId,
                            targetId,
                            platform,
                            action,
                            e.target.checked
                          ).then(() => router.refresh())
                        }
                        className="h-4 w-4 rounded border-zinc-300 accent-accent"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
