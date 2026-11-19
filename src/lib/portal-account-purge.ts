import "server-only";

import { and, eq, isNull, like, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  lmsParentChildren,
  lmsParents,
  lmsPasswordResets,
  lmsPortalAccounts,
  lmsPortalSessions,
  lmsStorageLedger,
  lmsStudents,
  lmsTeachers,
} from "@/db/schema-lms";
import { getStorage } from "@/lib/storage";
import { markStorageBlobDeleted } from "@/lib/storage-ledger";

/* ────────────────────────────────────────────────────────────────────────
   v2.9.15.10 — THE ONE TRUE PURGE (owner: "dan database eke thiyana
   teachers,students,parents, acc tika ain karanawada ... kalin delete
   karapu ewage acc database eke thama thiyanawa. e nisa acc currupt
   wenawa ekai. storage ekenuth ain karanna storage use karala thiyanawa
   ewath. admin,pricipal acc mukuth karanna one na").

   Deleting a portal account used to leave a trail:
     · the website-admin DELETE removed ONLY the account row + sessions —
       lms_students/lms_teachers kept pointing at a ghost id (the identity
       bridge then re-created duplicates), parents left ghosts + orphaned
       child links, and the avatar blob + its ledger rows stayed in the
       bucket forever;
     · the lms-admin purge was closer but still never freed the avatar blob
       or its ledger bytes.

   This helper is the shared engine BOTH offices (and the cleanup script)
   now use. Per deleted account:

     1. sessions + password-reset tokens            → gone
     2. lms_students / lms_teachers person rows     → account_id released
       (the register rows and every enrollment/mark stay — they are the
       OFFICE's file; the identity bridge re-adopts the person row when a
       new account for the same person ever appears)
     3. lms_parents + lms_parent_children           → gone (a parent's
       identity IS the account; account_id is NOT NULL so no ghost rows)
     4. the account's avatar blob (portal-avatars/) → deleted from the
       bucket + every ledger row it owned marked freed (real storage release)
     5. the account row itself                      → gone

   PROTECTED ROLES: lms_admin and principal accounts can never be purged
   through here — the owner was explicit ("admin,pricipal acc mukuth
   karanna one na").
   ──────────────────────────────────────────────────────────────────── */

export type PurgeCandidate = {
  id: number;
  role: string;
  email: string;
  fullName: string;
  avatarKey: string | null;
};

export type PurgeResult =
  | { ok: true; freedBlobs: number }
  | { ok: false; error: string };

const PROTECTED_ROLES = new Set(["lms_admin", "principal"]);

export async function purgePortalAccountCompletely(
  target: PurgeCandidate,
): Promise<PurgeResult> {
  if (PROTECTED_ROLES.has(target.role)) {
    return {
      ok: false,
      error: `${target.role} accounts are protected — they can never be purged.`,
    };
  }
  const id = target.id;

  /* 1 — sessions + password-reset tokens. */
  await db.delete(lmsPortalSessions).where(eq(lmsPortalSessions.accountId, id));
  await db.delete(lmsPasswordResets).where(eq(lmsPasswordResets.accountId, id));

  /* 2 — release the student/teacher person rows (register + enrollments
     survive; the bridge re-adopts the row for a future account).
     lms_teachers.account_id is declared notNull in the drizzle schema but
     is NULLABLE in the live database (verified) — sql`null` states the
     intent and the live column accepts it. */
  await db.update(lmsStudents).set({ accountId: null }).where(eq(lmsStudents.accountId, id));
  await db
    .update(lmsTeachers)
    .set({ accountId: sql`null` })
    .where(eq(lmsTeachers.accountId, id));

  /* 3 — the parent row + its child links go with the account. */
  const [ghostParent] = await db
    .select({ id: lmsParents.id })
    .from(lmsParents)
    .where(eq(lmsParents.accountId, id))
    .limit(1);
  if (ghostParent) {
    await db.delete(lmsParentChildren).where(eq(lmsParentChildren.parentId, ghostParent.id));
    await db.delete(lmsParents).where(eq(lmsParents.id, ghostParent.id));
  }

  /* 4 — the avatar blob really leaves the bucket + its ledger rows are
     marked freed, so the Storage page stops counting the bytes at once. */
  let freedBlobs = 0;
  const blobKeys = new Set<string>();
  if (target.avatarKey) blobKeys.add(target.avatarKey);
  try {
    const ledgerRows = await db
      .select({ key: lmsStorageLedger.objectKey })
      .from(lmsStorageLedger)
      .where(
        and(
          eq(lmsStorageLedger.ownerKind, "portal_account"),
          eq(lmsStorageLedger.ownerId, id),
          isNull(lmsStorageLedger.deletedAt),
          like(lmsStorageLedger.objectKey, "portal-avatars/%"),
        ),
      );
    for (const row of ledgerRows) blobKeys.add(row.key);
  } catch {
    /* ledger query hiccup — the avatar_key blob still goes below */
  }
  for (const key of blobKeys) {
    try {
      await getStorage().deleteObject(key);
      freedBlobs += 1;
    } catch {
      /* a storage hiccup must never block the account purge */
    }
    try {
      await markStorageBlobDeleted(key);
    } catch {
      /* ledger hiccup must never block the account purge */
    }
  }

  /* 5 — the account row itself. */
  await db.delete(lmsPortalAccounts).where(eq(lmsPortalAccounts.id, id));

  return { ok: true, freedBlobs };
}

/** Load one account row for the purge engine (null = already gone). */
export async function findPurgeCandidate(id: number): Promise<PurgeCandidate | null> {
  const [row] = await db
    .select({
      id: lmsPortalAccounts.id,
      role: lmsPortalAccounts.role,
      email: lmsPortalAccounts.email,
      fullName: lmsPortalAccounts.fullName,
      avatarKey: lmsPortalAccounts.avatarKey,
    })
    .from(lmsPortalAccounts)
    .where(eq(lmsPortalAccounts.id, id))
    .limit(1);
  return row ?? null;
}
