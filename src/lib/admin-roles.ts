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

export const ADMIN_MODULES = [
  "dashboard",
  "pages",
  "news",
  "events",
  "staff",
  "live",
  "filters",
  "forms",
  "media",
  "gallery",
  "unit-gallery",
  "resources",
  "logos",
  "footer",
  "preloaders",
  "popups",
  "settings",
  "theme",
  "versions",
  "audit",
  "roles",
  "portal",
  "profile",
] as const;

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

/** Content modules every non-admin role can at least view. */
const READABLE_CONTENT: readonly AdminModule[] = [
  "dashboard",
  "pages",
  "news",
  "events",
  "staff",
  "live",
  "filters",
  "forms",
  "media",
  "gallery",
  "unit-gallery",
  "resources",
  "logos",
  "footer",
  "preloaders",
  "popups",
  "settings",
  "versions",
  "audit",
];

const CONTENT_EDITS: readonly AdminModule[] = [
  "pages",
  "news",
  "events",
  "staff",
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
  admin: buildMatrix(["roles", "portal", "profile"], ["dashboard", "audit"]),
  content_editor: buildMatrix(CONTENT_EDITS, READABLE_CONTENT),
  news_editor: buildMatrix(["news", "events", "filters", "media"], READABLE_CONTENT),
  gallery_editor: buildMatrix(["gallery", "unit-gallery", "media", "filters"], READABLE_CONTENT),
  staff_editor: buildMatrix(["staff", "media", "filters"], READABLE_CONTENT),
  admissions_officer: buildMatrix(["forms"], READABLE_CONTENT),
  viewer: buildMatrix([], READABLE_CONTENT),
};

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
  return ADMIN_ROLES.find((r) => r.value === role)?.label ?? "Unknown";
}

export function roleDescription(role: string | null | undefined): string {
  return ADMIN_ROLES.find((r) => r.value === role)?.description ?? "";
}

export function isAdminRole(value: string | null | undefined): value is AdminRole {
  return !!value && ADMIN_ROLES.some((r) => r.value === value);
}

/** Gold-tinted badge classes per role (admin studio glass palette). */
export const ROLE_BADGE_CLASS: Record<AdminRole, string> = {
  super_admin: "border-[#ffd444]/40 bg-[#ffd444]/10 text-[#ffd444]",
  admin: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  content_editor: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  news_editor: "border-orange-400/40 bg-orange-400/10 text-orange-300",
  gallery_editor: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-300",
  staff_editor: "border-teal-400/40 bg-teal-400/10 text-teal-300",
  admissions_officer: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  viewer: "border-white/25 bg-white/10 text-white/70",
};
