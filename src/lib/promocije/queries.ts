import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { IntelLead, LeadFilters } from "@/lib/lead-intelligence/types";
import { queryLeads } from "@/lib/lead-intelligence/query";
import type {
  PromoCampaign,
  PromoCampaignSummary,
  PromoCampaignTarget,
  PromoTask,
  PromoEmailStep,
  PromoDashboardStats,
} from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function getDashboardStats(admin: AdminClient): Promise<PromoDashboardStats> {
  const { data, error } = await admin.rpc("promo_campaigns_dashboard_stats");
  if (error || !data) {
    throw new Error(
      `Statistike ni bilo mogoče naložiti (${error?.message ?? "ni podatkov"}). Ali ste zagnali supabase/migration_promocije.sql v Supabase SQL Editorju?`
    );
  }
  return data as PromoDashboardStats;
}

export async function getCampaigns(admin: AdminClient) {
  const { data: campaigns, error } = await admin
    .from("promo_campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Kampanj ni bilo mogoče naložiti: ${error.message}`);

  const { data: summaries } = await admin.from("promo_campaign_summary").select("*");
  const summaryById = new Map(
    ((summaries ?? []) as PromoCampaignSummary[]).map((s) => [s.campaign_id, s])
  );

  return ((campaigns ?? []) as PromoCampaign[]).map((c) => ({
    campaign: c,
    summary:
      summaryById.get(c.id) ??
      ({
        campaign_id: c.id,
        target_count: 0,
        won_count: 0,
        revenue: 0,
        emails_sent: 0,
        replies: 0,
        meetings: 0,
      } satisfies PromoCampaignSummary),
  }));
}

export async function getCampaign(admin: AdminClient, id: string) {
  const { data, error } = await admin
    .from("promo_campaigns")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as PromoCampaign;
}

export type TargetWithLead = PromoCampaignTarget & { lead: IntelLead };

export async function getCampaignTargets(
  admin: AdminClient,
  campaignId: string
): Promise<TargetWithLead[]> {
  const { data, error } = await admin
    .from("promo_campaign_targets")
    .select("*, lead:intel_leads(*)")
    .eq("campaign_id", campaignId)
    .order("added_at", { ascending: false });

  if (error) throw new Error(`Ciljev kampanje ni bilo mogoče naložiti: ${error.message}`);
  return (data ?? []) as unknown as TargetWithLead[];
}

export async function getTarget(admin: AdminClient, targetId: string) {
  const { data, error } = await admin
    .from("promo_campaign_targets")
    .select("*, lead:intel_leads(*)")
    .eq("id", targetId)
    .single();
  if (error || !data) return null;
  return data as unknown as TargetWithLead;
}

/**
 * Leads available to add to a campaign: reuses the same queryLeads() the
 * Lead Intelligence table uses, then excludes leads already in this
 * campaign. "No prior contact" maps to intel_leads.last_contact_at is null,
 * which is a real existing field — not a new invented one.
 */
export async function queryAvailableLeads(
  admin: AdminClient,
  campaignId: string,
  filters: LeadFilters & { noPriorContact?: boolean }
) {
  const alreadyTargeted = await admin
    .from("promo_campaign_targets")
    .select("lead_id")
    .eq("campaign_id", campaignId);

  const excludeIds = new Set((alreadyTargeted.data ?? []).map((r) => r.lead_id as string));

  const result = await queryLeads(admin, filters);
  let leads = result.leads.filter((l) => !excludeIds.has(l.id));
  if (filters.noPriorContact) {
    leads = leads.filter((l) => !l.last_contact_at);
  }

  return { ...result, leads };
}

export async function getCampaignTasks(admin: AdminClient, campaignId: string) {
  const { data, error } = await admin
    .from("promo_tasks")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Nalog ni bilo mogoče naložiti: ${error.message}`);
  return (data ?? []) as PromoTask[];
}

export async function getCampaignEmailSteps(admin: AdminClient, campaignId: string) {
  const { data, error } = await admin
    .from("promo_email_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_order", { ascending: true });
  if (error) throw new Error(`Korakov e-pošte ni bilo mogoče naložiti: ${error.message}`);
  return (data ?? []) as PromoEmailStep[];
}
