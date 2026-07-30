export const CAMPAIGN_STATUSES = ["draft", "active", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Osnutek",
  active: "Aktivna",
  archived: "Arhivirana",
};

export const PIPELINE_STAGES = [
  "new",
  "qualified",
  "contacted",
  "meeting",
  "offer",
  "negotiation",
  "won",
  "lost",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  new: "Nov lead",
  qualified: "Kvalificiran",
  contacted: "Kontaktiran",
  meeting: "Sestanek",
  offer: "Ponudba",
  negotiation: "Pogajanja",
  won: "Pridobljen",
  lost: "Izgubljen",
};

export const CALL_STATUSES = [
  "not_called",
  "called",
  "no_answer",
  "interested",
  "meeting_scheduled",
  "offer_sent",
  "won",
  "lost",
] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const CALL_STATUS_LABELS: Record<CallStatus, string> = {
  not_called: "Ni klicano",
  called: "Klicano",
  no_answer: "Se ni oglasil",
  interested: "Zainteresiran",
  meeting_scheduled: "Sestanek dogovorjen",
  offer_sent: "Ponudba poslana",
  won: "Pridobljen",
  lost: "Izgubljen",
};

export const TASK_TYPES = [
  "call",
  "send_offer",
  "follow_up",
  "visit",
  "create_proposal",
  "other",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  call: "Pokliči podjetje",
  send_offer: "Pošlji ponudbo",
  follow_up: "Follow-up",
  visit: "Obisk",
  create_proposal: "Pripravi predlog",
  other: "Drugo",
};

export const TASK_STATUSES = ["todo", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Nizka",
  medium: "Srednja",
  high: "Visoka",
};

export const EMAIL_STEP_STATUSES = ["draft", "scheduled", "sent"] as const;
export type EmailStepStatus = (typeof EMAIL_STEP_STATUSES)[number];

export const SOCIAL_PLATFORMS = ["facebook", "instagram", "linkedin", "tiktok", "youtube"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export const SOCIAL_ACTIONS = ["visited", "followed", "messaged", "commented", "connected"] as const;
export type SocialAction = (typeof SOCIAL_ACTIONS)[number];

export const SOCIAL_ACTION_LABELS: Record<SocialAction, string> = {
  visited: "Obiskan",
  followed: "Sledi",
  messaged: "Sporočilo poslano",
  commented: "Komentiral",
  connected: "Povezan",
};

export type SocialOutreach = Partial<
  Record<SocialPlatform, Partial<Record<SocialAction, boolean>>>
>;

export type IndustrySolution = {
  name: string;
  stars: number;
  description: string;
  value_min: number;
  value_max: number;
};

export type IndustryAnalysis = {
  industry: string;
  common_problems: string[];
  solutions: IndustrySolution[];
  revenue_potential: {
    average_project: number;
    potential_customers: number;
    potential_revenue: number;
    estimated_closing_rate: number;
    estimated_revenue: number;
  };
  generated_at: string;
};

export type CompanyAnalysis = {
  website_summary: string;
  weaknesses: string[];
  sales_opportunities: string[];
  recommended_solutions: string[];
  estimated_budget: string;
  estimated_closing_probability: string;
  recommended_sales_pitch: string;
  generated_at: string;
};

export type Proposal = {
  detected_problems: string[];
  recommended_solution: string;
  project_scope: string[];
  estimated_timeline: string;
  estimated_price: string;
  expected_roi: string;
  sales_pitch: string;
  call_to_action: string;
  generated_at: string;
};

export type PromoCampaign = {
  id: string;
  name: string;
  description: string | null;
  target_industry: string | null;
  target_country: string | null;
  target_city: string | null;
  company_size: string | null;
  employee_count: string | null;
  revenue_range: string | null;
  company_status: string | null;
  lead_source: string | null;
  tags: string[];
  priority: Priority;
  status: CampaignStatus;
  ai_industry_analysis: IndustryAnalysis | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PromoCampaignSummary = {
  campaign_id: string;
  target_count: number;
  won_count: number;
  revenue: number;
  emails_sent: number;
  replies: number;
  meetings: number;
};

export type PromoCampaignTarget = {
  id: string;
  campaign_id: string;
  lead_id: string;
  pipeline_stage: PipelineStage;
  call_status: CallStatus;
  call_notes: string | null;
  call_duration_seconds: number | null;
  next_call_date: string | null;
  field_visit_brochure: boolean;
  field_visit_card: boolean;
  field_visit_office: boolean;
  field_visit_presentation: boolean;
  field_visit_meeting: boolean;
  field_visit_notes: string | null;
  social_outreach: SocialOutreach;
  ai_company_report: CompanyAnalysis | null;
  ai_proposal: Proposal | null;
  deal_value: number | null;
  added_at: string;
  updated_at: string;
};

export type PromoTask = {
  id: string;
  campaign_id: string;
  target_id: string | null;
  title: string;
  type: TaskType;
  due_date: string | null;
  priority: Priority;
  assigned_to: string | null;
  status: TaskStatus;
  created_at: string;
};

export type PromoEmailStep = {
  id: string;
  campaign_id: string;
  step_order: number;
  day_offset: number;
  name: string;
  subject: string;
  preview_text: string | null;
  body_html: string;
  status: EmailStepStatus;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PromoEmailSendStatus = "queued" | "sent" | "failed" | "opened" | "replied";

export type PromoEmailSend = {
  id: string;
  step_id: string;
  target_id: string;
  status: PromoEmailSendStatus;
  provider_message_id: string | null;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  error: string | null;
  created_at: string;
};

export type PromoDashboardStats = {
  total_campaigns: number;
  active_campaigns: number;
  emails_sent: number;
  open_rate: number;
  reply_rate: number;
  meetings: number;
  calls_made: number;
  sales: number;
  revenue_generated: number;
  total_targets: number;
  avg_conversion_rate: number;
};
