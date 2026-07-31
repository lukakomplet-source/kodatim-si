export const MODULES = [
  { key: "dashboard", label: "Nadzorna plošča" },
  { key: "lead", label: "Leadi" },
  { key: "lead_intelligence", label: "Lead Intelligence" },
  { key: "partner", label: "Partnerji" },
  { key: "referral", label: "Priporočila" },
  { key: "commission", label: "Provizije" },
  { key: "promotion", label: "Promocije" },
  { key: "finance", label: "Finance" },
  { key: "ai", label: "AI orodja" },
  { key: "crm", label: "CRM" },
  { key: "settings", label: "Nastavitve" },
  { key: "api", label: "API" },
  { key: "analytics", label: "Analitika" },
  { key: "documents", label: "Dokumenti" },
  { key: "tasks", label: "Naloge" },
  { key: "users", label: "Uporabniki" },
  { key: "roles", label: "Vloge" },
  { key: "permissions", label: "Dovoljenja" },
  { key: "chat", label: "Klepet" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

const ACTION_LABELS: Record<string, string> = {
  view: "Ogled",
  create: "Ustvarjanje",
  edit: "Urejanje",
  delete: "Brisanje",
  export: "Izvoz",
  invite: "Povabila",
  approve: "Odobritev",
  withdraw: "Dvig",
  send_emails: "Pošiljanje e-pošte",
  use: "Uporaba",
  upload: "Nalaganje",
  manage: "Upravljanje",
  access: "Dostop",
};

function perm(key: string, module: ModuleKey, action: string) {
  return { key, module, action, label: ACTION_LABELS[action] ?? action } as const;
}

// Mirrors supabase/migration_rbac.sql's permission seed exactly — 49 rows.
// Extending later = add one entry here + one insert row in a new migration.
export const PERMISSIONS = [
  perm("dashboard.view", "dashboard", "view"),
  perm("dashboard.edit", "dashboard", "edit"),
  perm("dashboard.delete", "dashboard", "delete"),

  perm("lead.view", "lead", "view"),
  perm("lead.create", "lead", "create"),
  perm("lead.edit", "lead", "edit"),
  perm("lead.delete", "lead", "delete"),

  perm("lead_intelligence.view", "lead_intelligence", "view"),
  perm("lead_intelligence.create", "lead_intelligence", "create"),
  perm("lead_intelligence.edit", "lead_intelligence", "edit"),
  perm("lead_intelligence.delete", "lead_intelligence", "delete"),
  perm("lead_intelligence.export", "lead_intelligence", "export"),

  perm("partner.view", "partner", "view"),
  perm("partner.create", "partner", "create"),
  perm("partner.edit", "partner", "edit"),
  perm("partner.delete", "partner", "delete"),

  perm("referral.view", "referral", "view"),
  perm("referral.invite", "referral", "invite"),
  perm("referral.approve", "referral", "approve"),
  perm("referral.withdraw", "referral", "withdraw"),

  perm("commission.view", "commission", "view"),
  perm("commission.edit", "commission", "edit"),

  perm("promotion.view", "promotion", "view"),
  perm("promotion.create", "promotion", "create"),
  perm("promotion.edit", "promotion", "edit"),
  perm("promotion.delete", "promotion", "delete"),
  perm("promotion.send_emails", "promotion", "send_emails"),

  perm("finance.view", "finance", "view"),
  perm("finance.edit", "finance", "edit"),

  perm("ai.view", "ai", "view"),
  perm("ai.use", "ai", "use"),

  perm("crm.view", "crm", "view"),
  perm("crm.edit", "crm", "edit"),
  perm("crm.delete", "crm", "delete"),

  perm("settings.view", "settings", "view"),
  perm("settings.edit", "settings", "edit"),

  perm("api.access", "api", "access"),

  perm("analytics.view", "analytics", "view"),

  perm("documents.view", "documents", "view"),
  perm("documents.upload", "documents", "upload"),
  perm("documents.delete", "documents", "delete"),

  perm("tasks.view", "tasks", "view"),
  perm("tasks.edit", "tasks", "edit"),
  perm("tasks.delete", "tasks", "delete"),

  perm("users.manage", "users", "manage"),
  perm("roles.manage", "roles", "manage"),
  perm("permissions.manage", "permissions", "manage"),

  perm("chat.view", "chat", "view"),
  perm("chat.use", "chat", "use"),
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSIONS_BY_MODULE: Record<ModuleKey, (typeof PERMISSIONS)[number][]> =
  MODULES.reduce(
    (acc, m) => {
      acc[m.key] = PERMISSIONS.filter((p) => p.module === m.key);
      return acc;
    },
    {} as Record<ModuleKey, (typeof PERMISSIONS)[number][]>
  );

export const ROLE_KEYS = [
  "super_admin",
  "admin",
  "manager",
  "sales",
  "partner",
  "referral",
  "user",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  sales: "Sales",
  partner: "Partner",
  referral: "Referral",
  user: "User",
};
