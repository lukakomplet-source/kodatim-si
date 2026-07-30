"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeUrl, searchWeb, extractCompanyInfo } from "@/lib/firecrawl";
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

export type CompanyPreview = {
  name: string;
  industry: string;
  description: string;
  url: string;
};

export type AiFindCompanyState = {
  error?: string;
  result?: CompanyPreview;
};

export async function aiFindCompany(
  _prevState: AiFindCompanyState,
  formData: FormData
): Promise<AiFindCompanyState> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const query = String(formData.get("query") ?? "").trim();
  if (!query) {
    return { error: "Vnesite opis podjetja, ki ga iščete." };
  }

  try {
    const results = await searchWeb(query, {
      limit: 3,
      country: "SI",
      scrapeMarkdown: true,
    });
    const match = results.find((r) => r.markdown && r.markdown.trim());
    if (!match || !match.markdown) {
      return { error: "Nisem našel nobenega ustreznega podjetja." };
    }

    const extracted = await extractCompanyInfo(match.markdown, match.title);

    return {
      result: {
        name: extracted.name,
        industry: extracted.industry,
        description: extracted.description,
        url: match.url,
      },
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Prišlo je do napake pri iskanju.",
    };
  }
}

export type SaveCompanyState = { error?: string; success?: boolean };

export async function saveCompany(
  data: CompanyPreview
): Promise<SaveCompanyState> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("companies").insert({
    name: data.name,
    url: data.url,
    industry: data.industry,
    description: data.description,
  });

  if (error) {
    return { error: "Podjetja ni bilo mogoče shraniti v bazo." };
  }

  revalidatePath("/admin/podjetja");
  return { success: true };
}
