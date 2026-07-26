"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeUrl, extractCompanyInfo } from "@/lib/firecrawl";
import { requireAdmin } from "@/lib/require-admin";

export type ScrapeCompanyState = { error?: string; success?: boolean };

export async function scrapeCompany(
  _prevState: ScrapeCompanyState,
  formData: FormData
): Promise<ScrapeCompanyState> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const rawUrl = String(formData.get("url") ?? "").trim();
  if (!rawUrl) {
    return { error: "Vnesite URL podjetja." };
  }

  let url: string;
  try {
    url = new URL(
      rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`
    ).toString();
  } catch {
    return { error: "URL ni veljaven." };
  }

  try {
    const scraped = await scrapeUrl(url);
    const extracted = await extractCompanyInfo(scraped.markdown, scraped.title);

    const admin = createAdminClient();
    const { error } = await admin.from("companies").insert({
      name: extracted.name,
      url: scraped.sourceUrl,
      industry: extracted.industry,
      description: extracted.description,
    });

    if (error) {
      return { error: "Podjetja ni bilo mogoče shraniti v bazo." };
    }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Prišlo je do napake pri obdelavi.",
    };
  }

  revalidatePath("/admin/podjetja");
  return { success: true };
}
