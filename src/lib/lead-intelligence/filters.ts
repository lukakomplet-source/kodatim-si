import {
  LEAD_STATUSES,
  LEAD_PRIORITIES,
  type LeadFilters,
  type LeadStatus,
  type LeadPriority,
} from "./types";

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed ? trimmed.slice(0, 200) : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

/**
 * Whitelists an arbitrary object (URL searchParams or AI JSON output) down
 * to the LeadFilters shape. Nothing outside these exact fields/enums ever
 * reaches the database query — this is what makes the AI-search route safe
 * (the model can only ever select these, never write raw SQL).
 */
export function sanitizeFilters(raw: Record<string, unknown>): LeadFilters {
  const filters: LeadFilters = {};

  const q = str(raw.q);
  if (q) filters.q = q;

  const industry = str(raw.industry);
  if (industry) filters.industry = industry;

  const city = str(raw.city);
  if (city) filters.city = city;

  const region = str(raw.region);
  if (region) filters.region = region;

  const country = str(raw.country);
  if (country) filters.country = country;

  const tag = str(raw.tag);
  if (tag) filters.tag = tag;

  const status = str(raw.status);
  if (status && (LEAD_STATUSES as readonly string[]).includes(status)) {
    filters.status = status as LeadStatus;
  }

  const priority = str(raw.priority);
  if (priority && (LEAD_PRIORITIES as readonly string[]).includes(priority)) {
    filters.priority = priority as LeadPriority;
  }

  const hasWebsite = bool(raw.hasWebsite);
  if (hasWebsite !== undefined) filters.hasWebsite = hasWebsite;

  const hasEmail = bool(raw.hasEmail);
  if (hasEmail !== undefined) filters.hasEmail = hasEmail;

  const hasPhone = bool(raw.hasPhone);
  if (hasPhone !== undefined) filters.hasPhone = hasPhone;

  const reminderBefore = str(raw.reminderBefore);
  if (reminderBefore && /^\d{4}-\d{2}-\d{2}$/.test(reminderBefore)) {
    filters.reminderBefore = reminderBefore;
  }

  const createdFrom = str(raw.createdFrom);
  if (createdFrom && /^\d{4}-\d{2}-\d{2}$/.test(createdFrom)) {
    filters.createdFrom = createdFrom;
  }

  const createdTo = str(raw.createdTo);
  if (createdTo && /^\d{4}-\d{2}-\d{2}$/.test(createdTo)) {
    filters.createdTo = createdTo;
  }

  const page = Number(raw.page);
  if (Number.isFinite(page) && page > 0) filters.page = Math.floor(page);

  return filters;
}

const BOOL_PARAMS = ["hasWebsite", "hasEmail", "hasPhone"] as const;

export function filtersFromSearchParams(
  params: Record<string, string | string[] | undefined>
): LeadFilters {
  const raw: Record<string, unknown> = { ...params };
  for (const key of BOOL_PARAMS) {
    const v = params[key];
    if (v === "true") raw[key] = true;
    else if (v === "false") raw[key] = false;
  }
  return sanitizeFilters(raw);
}

export function filtersToSearchParams(filters: LeadFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  return params;
}
