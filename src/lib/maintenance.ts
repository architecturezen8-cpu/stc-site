import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings, adminAuditLogs, adminSessions, adminUsers } from "@/db/schema";
import { lmsPortalSessions, lmsPortalAccounts } from "@/db/schema-lms";

/**
 * MAINTENANCE MODE (v2.8.38.0; ownership moved to the MAIN Admin Studio in
 * v2.8.39.0 at the owner's direction) — a site-wide curtain. When ON, every
 * visitor gets the /maintenance screen (or a 503 for APIs) EXCEPT signed-in
 * admins of either studio, whose session cookie lets them preview the real
 * site while they work — "admin eken edit karana kenata preview ekak
 * balaganna puluwan".
 *
 * Storage: the existing site_settings KV table under its own key (NOT the
 * whitelisted site_identity row — updateSiteSettings() blanks unknown keys).
 * A tiny in-process cache keeps the middleware's per-request read cheap.
 */

export const MAINTENANCE_SETTINGS_KEY = "maintenance_mode";

/** The middleware imports ONLY this file — never lms-admin-auth (which pulls
 * next/headers). The cookie name is duplicated deliberately and guarded by a
 * test-style grep comment. stc_lmsadmin_session */
export const LMS_ADMIN_SESSION_COOKIE_NAME = "stc_lmsadmin_session";

export type MaintenanceState = {
  enabled: boolean;
  message: string;
  updatedAt: string | null;
};

const MAINTENANCE_DEFAULTS: MaintenanceState = {
  enabled: false,
  message:
    "We're performing scheduled maintenance. The site will be back shortly — thank you for your patience.",
  updatedAt: null,
};

type CacheEntry = { state: MaintenanceState; at: number };

const globalForMaintenance = globalThis as typeof globalThis & {
  __stcMaintenanceCache?: CacheEntry;
};

const CACHE_MS = 3_000;

export function invalidateMaintenanceCache() {
  globalForMaintenance.__stcMaintenanceCache = undefined;
}

export async function getMaintenanceState(): Promise<MaintenanceState> {
  const cached = globalForMaintenance.__stcMaintenanceCache;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.state;

  let state: MaintenanceState = { ...MAINTENANCE_DEFAULTS };
  try {
    const [row] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, MAINTENANCE_SETTINGS_KEY))
      .limit(1);
    if (row) {
      const value = (row.publishedValue ?? {}) as Record<string, unknown>;
      state = {
        enabled: value.enabled === true || value.enabled === "on",
        message:
          typeof value.message === "string" && value.message.trim().length > 0
            ? (value.message as string).slice(0, 400)
            : MAINTENANCE_DEFAULTS.message,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      };
    }
  } catch {
    /* DB trouble must NEVER lock the site out — fail open. */
    state = { ...MAINTENANCE_DEFAULTS, enabled: false };
  }

  globalForMaintenance.__stcMaintenanceCache = { state, at: Date.now() };
  return state;
}

export async function setMaintenanceState(
  input: { enabled: boolean; message?: string },
  userId: number,
): Promise<MaintenanceState> {
  const next: MaintenanceState = {
    enabled: input.enabled,
    message:
      typeof input.message === "string" && input.message.trim().length > 0
        ? input.message.trim().slice(0, 400)
        : MAINTENANCE_DEFAULTS.message,
    updatedAt: new Date().toISOString(),
  };
  const json = {
    enabled: next.enabled,
    message: next.message,
  } as unknown;

  await db
    .insert(siteSettings)
    .values({
      key: MAINTENANCE_SETTINGS_KEY,
      draftValue: json,
      publishedValue: json,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: {
        draftValue: json,
        publishedValue: json,
        updatedBy: userId,
        updatedAt: new Date(),
      },
    });

  await db.insert(adminAuditLogs).values({
    userId,
    action: next.enabled ? "maintenance_on" : "maintenance_off",
    entity: "site_settings",
    entityId: MAINTENANCE_SETTINGS_KEY,
    details: { message: next.message } as unknown,
  });

  invalidateMaintenanceCache();
  return next;
}

/**
 * True when the cookie token belongs to a LIVE lms_admin session. Used by
 * the middleware for the admin preview bypass (hash + DB check — a forged
 * cookie value does nothing).
 */
export async function hasLiveLmsAdminSession(rawToken: string | undefined): Promise<boolean> {
  if (!rawToken || rawToken.length < 16) return false;
  try {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const [row] = await db
      .select({ id: lmsPortalSessions.id })
      .from(lmsPortalSessions)
      .innerJoin(lmsPortalAccounts, eq(lmsPortalAccounts.id, lmsPortalSessions.accountId))
      .where(
        and(
          eq(lmsPortalSessions.tokenHash, tokenHash),
          eq(lmsPortalAccounts.role, "lms_admin"),
          eq(lmsPortalAccounts.status, "active"),
          gt(lmsPortalSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return Boolean(row);
  } catch {
    return false;
  }
}

/**
 * True when the cookie token belongs to a LIVE website-Admin-Studio session
 * (admin_sessions + active admin_users row). v2.8.39.0 — maintenance mode is
 * OWNED by the main Admin Studio, so its editors must keep their live preview
 * too. Same shape as hasLiveLmsAdminSession: hash + DB check, forged cookies
 * do nothing.
 */
export async function hasLiveMainAdminSession(rawToken: string | undefined): Promise<boolean> {
  if (!rawToken || rawToken.length < 16) return false;
  try {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const [row] = await db
      .select({ id: adminSessions.id })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
      .where(
        and(
          eq(adminSessions.tokenHash, tokenHash),
          eq(adminUsers.active, true),
          gt(adminSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return Boolean(row);
  } catch {
    return false;
  }
}

/** Main Admin Studio session cookie (mirrors admin-auth's ADMIN_COOKIE —
 * middleware imports only this file, never admin-auth which pulls
 * next/headers). stc_admin_session */
export const MAIN_ADMIN_SESSION_COOKIE_NAME = "stc_admin_session";
