/**
 * Admin Studio role & permission model (Phase 2.3).
 *
 * Pure TypeScript — safe to import from BOTH client components (sidebar
 * gating, role badges) and server guards (admin-auth.ts). Never import
 * server-only modules here.
 *
 * Levels: none < read < edit. "edit" always implies "read".
 */

export const ADMIN_ROLES = [
  {
    value: "super_admin",
    label: "Super Admin",
    description: "Full unrestricted access to every module.",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Manages admin users, access requests and roles only.",
  },
  {
    value: "content_editor",
    label: "Content Editor",
    description: "Edits pages, news, events, staff, media and website content.",
  },
  {
    value: "news_editor",
    label: "News Editor",
    description: "Edits news, events and their categories.",
  },
  {
    value: "gallery_editor",
    label: "Gallery Editor",
    description: "Edits campus/unit galleries and the media library.",
  },
  {
    value: "staff_editor",
    label: "Staff Editor",
    description: "Edits the faculty & staff directory.",
  },
  {
    value: "admissions_officer",
    label: "Admissions Officer",
    description: "Manages applications, contact messages and appointments.",
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "Read-only visibility across the studio.",
  },
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number]["value"];
export type AccessLevel = "none" | "read" | "edit";

/* v2.9.12.3 — 1:1 WITH THE SIDEBAR (owner: "super admin eke section 34 kda
   kohedo thiyanawa… eth access denna thiyenne features 26kata witharada
   kohedo"). Every sidebar section is now its own grantable feature:
   · Notice Board      → notices      (was lumped into news)
   · Clubs & Societies → clubs        (was lumped into pages)
   · School Notifications → notifications (was lumped into portal)
   · Email Alerts      → email        (was lumped into settings)
   · the 6 Form Management sections → forms-grade6 / forms-alevel /
     forms-contacts / forms-appointments / forms-customize / forms-builder
     (was one coarse "forms").
   "theme" joins "profile" as DEFAULT access for every account — the owner:
   "theme ekatha hama profile ekakama default thiyanna" (it is each admin's
   own studio look since v2.9.10.0, so it can never be revoked either). */
export const ADMIN_MODULES = [
  "dashboard",
  "pages",
  "navigation",
  "news",
  "notices",
  "events",
  "staff",
  "clubs",
  "live",
  "filters",
  "forms-grade6",
  "forms-alevel",
  "forms-contacts",
  "forms-appointments",
  "forms-customize",
  "forms-builder",
  "media",
  "gallery",
  "unit-gallery",
  "resources",
  "logos",
  "footer",
  "preloaders",
  "popups",
  "settings",
  "email",
  "versions",
  "storage",
  "backup",
  "audit",
  "analytics",
  "roles",
  "portal",
  "notifications",
  "profile",
  "theme",
] as const;

/** The six modules that replaced the old coarse "forms" (legacy JSON files
    still carrying "forms" expand to exactly these, same level). */
export const FORMS_MODULES = [
  "forms-grade6",
  "forms-alevel",
  "forms-contacts",
  "forms-appointments",
  "forms-customize",
  "forms-builder",
] as const satisfies readonly AdminModule[];

export type AdminModule = (typeof ADMIN_MODULES)[number];

const LEVEL_ORDER: Record<AccessLevel, number> = { none: 0, read: 1, edit: 2 };

type Matrix = Record<AdminModule, AccessLevel>;

function buildMatrix(
  edits: readonly AdminModule[],
  reads: readonly AdminModule[] = [],
): Matrix {
  const out = {} as Matrix;
  for (const mod of ADMIN_MODULES) {
    out[mod] = edits.includes(mod) ? "edit" : reads.includes(mod) ? "read" : "none";
  }
  return out;
}

/** Content modules every non-admin role can at least view. v2.9.12.3 —
    notices / clubs / email follow their old parents (news · pages ·
    settings were all readable), and the six form sections stay readable
    like the old coarse "forms" was. */
const READABLE_CONTENT: readonly AdminModule[] = [
  "dashboard",
  "pages",
  "navigation",
  "news",
  "notices",
  "events",
  "staff",
  "clubs",
  "live",
  "filters",
  ...FORMS_MODULES,
  "media",
  "gallery",
  "unit-gallery",
  "resources",
  "logos",
  "footer",
  "preloaders",
  "popups",
  "settings",
  "email",
  "versions",
  "storage",
  "audit",
];

const CONTENT_EDITS: readonly AdminModule[] = [
  "pages",
  "navigation",
  "news",
  "notices",
  "events",
  "staff",
  "clubs",
  "live",
  "filters",
  "media",
  "gallery",
  "unit-gallery",
  "resources",
  "logos",
  "footer",
  "preloaders",
  "popups",
];

export const ROLE_PERMISSIONS: Record<AdminRole, Matrix> = {
  super_admin: buildMatrix(ADMIN_MODULES),
  /* v2.8.79.0 — analytics is audience data: super_admin (above) + admin
     only. It is deliberately NOT in READABLE_CONTENT so content roles,
     admissions officers and viewers never see visitor numbers. */
  admin: buildMatrix(["roles", "portal", "notifications"], ["dashboard", "audit", "analytics"]),
  content_editor: buildMatrix(CONTENT_EDITS, READABLE_CONTENT),
  news_editor: buildMatrix(["news", "notices", "events", "filters", "media"], READABLE_CONTENT),
  gallery_editor: buildMatrix(["gallery", "unit-gallery", "media", "filters"], READABLE_CONTENT),
  staff_editor: buildMatrix(["staff", "media", "filters"], READABLE_CONTENT),
  admissions_officer: buildMatrix(FORMS_MODULES, READABLE_CONTENT),
  viewer: buildMatrix([], READABLE_CONTENT),
};

/* ── v2.9.12.0 — PER-ACCOUNT CUSTOM ACCESS ──────────────────────────────
   The owner: preset roles are too rigid — he wants to hand each admin a
   personal feature list. An account with role "custom" carries a JSON
   column (admin_users.permissions) of { module: "read" | "edit" }; every
   guard resolves access through effectiveCan() below. Preset roles keep
   working unchanged, and super_admin remains untouchable. */

export const CUSTOM_ROLE = "custom";

export type CustomPermissions = Partial<Record<AdminModule, AccessLevel>>;

/** Human-readable names for every module (feature picker, badges, intro). */
export const MODULE_LABELS: Record<AdminModule, string> = {
  dashboard: "Dashboard",
  pages: "Pages & Visual Editor",
  navigation: "Navigation Menu",
  news: "News & Stories",
  notices: "Notice Board",
  events: "Events & Schedule",
  staff: "Faculty & Staff",
  clubs: "Clubs & Societies",
  live: "Live Streams",
  filters: "Filters & Categories",
  "forms-grade6": "Grade 6 Applications",
  "forms-alevel": "A/L Applications",
  "forms-contacts": "Contact Messages",
  "forms-appointments": "Appointments",
  "forms-customize": "Customize Forms",
  "forms-builder": "Form Builder",
  media: "Media Library",
  gallery: "Campus Gallery",
  "unit-gallery": "Unit Galleries",
  resources: "Online Resources",
  logos: "Logos & Crests",
  footer: "Footer",
  preloaders: "Preloaders",
  popups: "Popups",
  settings: "Settings",
  email: "Email Alerts",
  versions: "Version History",
  storage: "Storage & Quotas",
  backup: "Backup",
  audit: "Audit Log",
  analytics: "Analytics",
  roles: "Role Management",
  portal: "Portal & LMS Admin",
  notifications: "School Notifications",
  profile: "Profile",
  theme: "Theme",
};

/** The feature picker groups — mirrors the sidebar story 1:1 (v2.9.12.3),
   skipping the two DEFAULT modules every account always holds: "profile"
   (own name/photo/password) and "theme" (own studio look — the owner:
   "theme ekatha hama profile ekakama default thiyanna"). */
export const FEATURE_GROUPS: Array<{
  label: string;
  items: Array<{ module: AdminModule; note?: string }>;
}> = [
  {
    label: "Overview",
    items: [
      { module: "dashboard" },
      { module: "analytics", note: "Visitor numbers — private audience data" },
    ],
  },
  {
    label: "Website content",
    items: [
      { module: "pages" },
      { module: "news" },
      { module: "notices" },
      { module: "events" },
      { module: "staff" },
      { module: "clubs" },
      { module: "live" },
      { module: "filters" },
    ],
  },
  {
    label: "Applications & messages",
    items: [
      { module: "forms-grade6", note: "Grade 6 intake applications" },
      { module: "forms-alevel", note: "Advanced Level admission applications" },
      { module: "forms-contacts", note: "Contact form inquiries" },
      { module: "forms-appointments", note: "Department visit bookings" },
      { module: "forms-customize", note: "Extra fields for the contact + application forms" },
      { module: "forms-builder", note: "Special forms + Excel import/export" },
    ],
  },
  {
    label: "Media & photos",
    items: [
      { module: "media" },
      { module: "gallery" },
      { module: "unit-gallery" },
      { module: "resources" },
      { module: "logos" },
    ],
  },
  {
    label: "Site look & structure",
    items: [
      { module: "navigation" },
      { module: "footer" },
      { module: "preloaders" },
      { module: "popups" },
    ],
  },
  {
    label: "People & access",
    items: [
      { module: "roles", note: "Create staff accounts, set what each person can do" },
      { module: "portal", note: "Makes this person an LMS Admin — timetables, subjects, assignments, registrations" },
      { module: "notifications", note: "School-wide messages to portal users + form activity" },
    ],
  },
  {
    label: "System",
    items: [
      { module: "settings" },
      { module: "versions" },
      { module: "storage" },
      { module: "backup" },
      { module: "audit", note: "Audit log tab inside Version History" },
      { module: "email", note: "On/off switches for every non-security email" },
    ],
  },
];

/** Parse a stored permissions JSON → sanitised map (unknown junk dropped).
 *  v2.9.12.3 — LEGACY MIGRATION: rows saved before the 1:1 split carry the
 *  old coarse modules ("forms" etc.) and no version marker. Those expand
 *  losslessly (forms → the six form sections, news → + notices, pages →
 *  + clubs, portal → + notifications, settings → + email) so nobody loses
 *  a section they already managed. Rows saved from the new picker carry
 *  v:2 and are honoured EXACTLY as ticked. */
export function parseCustomPermissions(json: string | null | undefined): CustomPermissions | null {
  if (!json) return null;
  try {
    const raw: unknown = JSON.parse(json);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const entries = raw as Record<string, unknown>;
    const out: CustomPermissions = {};
    for (const mod of ADMIN_MODULES) {
      const lvl = entries[mod];
      if (lvl === "read" || lvl === "edit") out[mod] = lvl;
    }
    if (entries.v === 2) return out;

    /* Legacy payload — expand the old coarse modules. */
    const expand = (from: string, targets: readonly AdminModule[]) => {
      const lvl = entries[from];
      if (lvl !== "read" && lvl !== "edit") return;
      for (const target of targets) {
        if (!out[target]) out[target] = lvl;
      }
    };
    expand("forms", FORMS_MODULES);
    expand("news", ["notices"]);
    expand("pages", ["clubs"]);
    expand("portal", ["notifications"]);
    expand("settings", ["email"]);
    return out;
  } catch {
    return null;
  }
}

/** Serialise a sanitised map for storage (stable key order, v2 marker —
    see parseCustomPermissions for the legacy-expansion contract). */
export function stringifyCustomPermissions(perms: CustomPermissions): string {
  const out: Record<string, string | number> = { v: 2 };
  for (const mod of ADMIN_MODULES) {
    const lvl = perms[mod];
    if (lvl === "read" || lvl === "edit") out[mod] = lvl;
  }
  return JSON.stringify(out);
}

/** The actor's own level on a module — super_admin is always full.
 *  v2.9.12.1 — "profile" is every account's own corner (name, photo,
 *  password) — DEFAULT access for everyone, never revocable (the owner:
 *  "profile kiyana eke aya access denna deyak na").
 *  v2.9.12.3 — "theme" joins it: every profile carries the studio theme by
 *  default (the owner: "theme ekatha hama profile ekakama default
 *  thiyanna") — it has been a PER-ADMIN choice since v2.9.10.0. */
export function actorLevelOf(
  actor: { role: string | null | undefined; permissions?: CustomPermissions | null },
  module: AdminModule,
): AccessLevel {
  if (module === "profile" || module === "theme") return "edit";
  if (actor.role === "super_admin") return "edit";
  if (actor.role === CUSTOM_ROLE) return actor.permissions?.[module] ?? "none";
  return ROLE_PERMISSIONS[actor.role as AdminRole]?.[module] ?? "none";
}

/**
 * Validate a feature-grant payload from the UI. Enforces two rules the
 * owner asked for: at least one feature ticked, and no admin can grant a
 * level they do not hold themselves (the main Super Admin is unrestricted).
 */
export function validateFeatureGrant(
  features: unknown,
  actor: { role: string | null | undefined; permissions?: CustomPermissions | null },
): { ok: true; perms: CustomPermissions } | { ok: false; error: string } {
  if (!features || typeof features !== "object" || Array.isArray(features)) {
    return { ok: false, error: "Tick at least one feature for this account." };
  }
  const raw = features as Record<string, unknown>;
  const perms: CustomPermissions = {};
  let count = 0;
  for (const mod of ADMIN_MODULES) {
    const lvl = raw[mod];
    if (lvl !== "read" && lvl !== "edit") continue;
    const actorLevel = actorLevelOf(actor, mod);
    if (LEVEL_ORDER[actorLevel] < LEVEL_ORDER[lvl]) {
      return {
        ok: false,
        error: `You cannot grant access to ${MODULE_LABELS[mod]} beyond your own.`,
      };
    }
    perms[mod] = lvl;
    count += 1;
  }
  if (count === 0) {
    return { ok: false, error: "Tick at least one feature for this account." };
  }
  return { ok: true, perms };
}

/**
 * Effective access check — custom accounts resolve against their own JSON
 * map, preset roles against the matrix, super_admin bypasses everything.
 * v2.9.12.1 — "profile" is DEFAULT access for every signed-in admin: the
 * owner never wants a login that cannot change its own name/password.
 * v2.9.12.3 — "theme" is default too (own studio look per account).
 */
export function effectiveCan(
  role: string | null | undefined,
  permissions: CustomPermissions | null | undefined,
  module: AdminModule,
  need: "read" | "edit",
): boolean {
  if (module === "profile" || module === "theme") return true;
  if (role === CUSTOM_ROLE) {
    if (!permissions) return false;
    return LEVEL_ORDER[permissions[module] ?? "none"] >= LEVEL_ORDER[need];
  }
  return can(role, module, need);
}

/** Does `role` have at least `need` on `module`? Unknown roles → nothing. */
export function can(
  role: string | null | undefined,
  module: AdminModule,
  need: "read" | "edit",
): boolean {
  if (!role) return false;
  const matrix = ROLE_PERMISSIONS[role as AdminRole];
  if (!matrix) return false;
  const have = matrix[module] ?? "none";
  return LEVEL_ORDER[have] >= LEVEL_ORDER[need];
}

export function roleLabel(role: string | null | undefined): string {
  if (role === CUSTOM_ROLE) return "Custom";
  return ADMIN_ROLES.find((r) => r.value === role)?.label ?? "Unknown";
}

/* ── v2.9.12.1 — NEW-ACCESS TOUR ─────────────────────────────────────────
   When an admin's access is updated with features they did not hold before,
   the diff is stored on the account (admin_users.pending_tour) and plays
   as a spotlight tour on their next visit: "the admin gave you X — here's
   where it lives" (the owner: "e aluthin add karapu feature eka locate
   wela tour eke yanawa"). */

export type AccessTourItem = { module: AdminModule; level: "read" | "edit" };

/**
 * The account's FULL effective access as a plain map — custom accounts from
 * their JSON, preset roles from their matrix, super_admin everything. Used
 * to diff "what they had" vs "what they now hold" when access changes.
 */
export function accessMapFor(
  role: string | null | undefined,
  permissionsJson: string | null | undefined,
): CustomPermissions {
  if (role === "super_admin") {
    const all: CustomPermissions = {};
    for (const mod of ADMIN_MODULES) {
      /* profile + theme are default access, not grantable entries. */
      if (mod !== "profile" && mod !== "theme") all[mod] = "edit";
    }
    return all;
  }
  if (role === CUSTOM_ROLE) return parseCustomPermissions(permissionsJson) ?? {};
  return presetAccessMap(role);
}

/** A preset role's matrix as a plain read/edit map (unknown roles → {}). */
export function presetAccessMap(role: string | null | undefined): CustomPermissions {
  const out: CustomPermissions = {};
  const matrix = ROLE_PERMISSIONS[role as AdminRole];
  if (!matrix) return out;
  for (const mod of ADMIN_MODULES) {
    const lvl = matrix[mod];
    if (lvl === "read" || lvl === "edit") out[mod] = lvl;
  }
  return out;
}

/**
 * Which modules in `next` are NEW (or upgraded) compared with `prev` —
 * none→read, none→edit and read→edit all count as fresh access worth a
 * tour stop. "profile" and "theme" never appear (default access, not
 * grantable).
 */
export function newlyGrantedModules(
  prev: CustomPermissions,
  next: CustomPermissions,
): AccessTourItem[] {
  const out: AccessTourItem[] = [];
  for (const mod of ADMIN_MODULES) {
    if (mod === "profile" || mod === "theme") continue;
    const before = LEVEL_ORDER[prev[mod] ?? "none"];
    const after = next[mod];
    if (after === "read" || after === "edit") {
      if (LEVEL_ORDER[after] > before) out.push({ module: mod, level: after });
    }
  }
  return out;
}

/** Parse the stored pending_tour JSON → sanitised steps (unknown dropped). */
export function parsePendingTour(json: string | null | undefined): AccessTourItem[] {
  if (!json) return [];
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    const out: AccessTourItem[] = [];
    for (const item of raw) {
      const rec = item as Record<string, unknown>;
      const mod = rec.m ?? rec.module;
      const lvl = rec.l ?? rec.level;
      if (
        typeof mod === "string" &&
        (ADMIN_MODULES as readonly string[]).includes(mod) &&
        (lvl === "read" || lvl === "edit")
      ) {
        out.push({ module: mod as AdminModule, level: lvl });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** v2.9.12.0 — short summary for a custom account: "Custom · 6 features". */
export function customAccessSummary(perms: CustomPermissions | null): string {
  if (!perms) return "Custom";
  const n = Object.keys(perms).length;
  return `Custom · ${n} feature${n === 1 ? "" : "s"}`;
}

export function roleDescription(role: string | null | undefined): string {
  return ADMIN_ROLES.find((r) => r.value === role)?.description ?? "";
}

export function isAdminRole(value: string | null | undefined): value is AdminRole {
  return !!value && ADMIN_ROLES.some((r) => r.value === value);
}

/** Gold-tinted badge classes per role (admin studio glass palette). */
export const ROLE_BADGE_CLASS: Record<AdminRole | "custom", string> = {
  super_admin: "border-[#ffd444]/40 bg-[#ffd444]/10 text-[#ffd444]",
  admin: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  content_editor: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  news_editor: "border-orange-400/40 bg-orange-400/10 text-orange-300",
  gallery_editor: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-300",
  staff_editor: "border-teal-400/40 bg-teal-400/10 text-teal-300",
  admissions_officer: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  viewer: "border-white/25 bg-white/10 text-white/70",
  custom: "border-violet-400/40 bg-violet-400/10 text-violet-300",
};
