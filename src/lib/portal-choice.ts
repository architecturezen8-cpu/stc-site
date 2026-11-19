import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { lmsOauthChoices } from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/**
 * One-time tokens for the multi-role chooser step after Google sign-in.
 *
 * Flow: Google callback finds several active (email, role) rows → issues a
 * token bound to the identity + its roles → /login/choose renders the
 * buttons → /api/portal/auth/choose burns the token and opens the session.
 *
 * BACKED BY POSTGRES (lms_oauth_choices), not memory: a dev-server reload
 * or sandbox restart between the callback and the click used to wipe the
 * in-process Map, the chooser POST then returned 401 "expired" and the
 * user was bounced back to /login after a successful Google sign-in.
 * Storing only the SHA-256 hash keeps the browser token meaningless even
 * if the table leaks. peek = render-only (refresh still renders), take =
 * burn (atomic DELETE … RETURNING). Tokens live 10 minutes; expired rows
 * are swept on each issue.
 */

export type PortalChoice = {
  email: string;
  roles: ("student" | "teacher" | "parent" | "principal")[];
};

const TTL_MS = 10 * 60 * 1000;

const PORTAL_ROLE_VALUES = ["student", "teacher", "parent", "principal"] as const;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseRoles(raw: string): PortalChoice["roles"] {
  return raw
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is (typeof PORTAL_ROLE_VALUES)[number] =>
      (PORTAL_ROLE_VALUES as readonly string[]).includes(role),
    );
}

export async function issuePortalChoiceToken(
  choice: PortalChoice,
): Promise<string> {
  await ensureSchemaExtras();
  const token = randomBytes(32).toString("hex");

  await db
    .delete(lmsOauthChoices)
    .where(lt(lmsOauthChoices.expiresAt, new Date()));
  await db.insert(lmsOauthChoices).values({
    tokenHash: hashToken(token),
    email: choice.email.trim().toLowerCase(),
    roles: choice.roles.join(","),
    expiresAt: new Date(Date.now() + TTL_MS),
  });

  return token;
}

export async function peekPortalChoiceToken(
  token: string,
): Promise<PortalChoice | null> {
  if (!token) return null;
  await ensureSchemaExtras();
  const [row] = await db
    .select()
    .from(lmsOauthChoices)
    .where(
      and(
        eq(lmsOauthChoices.tokenHash, hashToken(token)),
        gt(lmsOauthChoices.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;
  const roles = parseRoles(row.roles);
  return roles.length ? { email: row.email, roles } : null;
}

export async function takePortalChoiceToken(
  token: string,
): Promise<PortalChoice | null> {
  if (!token) return null;
  await ensureSchemaExtras();
  const [row] = await db
    .delete(lmsOauthChoices)
    .where(
      and(
        eq(lmsOauthChoices.tokenHash, hashToken(token)),
        gt(lmsOauthChoices.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!row) return null;
  const roles = parseRoles(row.roles);
  return roles.length ? { email: row.email, roles } : null;
}
