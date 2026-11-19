import "server-only";

import { isNull } from "drizzle-orm";

import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import {
  lmsPortalAccounts,
  lmsStudentRecords,
  lmsTeacherRecords,
} from "@/db/schema-lms";
import { explorePrefix } from "@/lib/storage-explorer";
import { getLedgerActiveKeys, getLedgerTotals } from "@/lib/storage-ledger";

/**
 * v2.9.15.6 — STORAGE RECONCILIATION (the owner: "profile photos ehema
 * hariyata storage eke track wenawa ne ... delete karoth ehema frontend
 * eke thibbe pennuwe nathi unata storage bucket eka full wenna puluwan
 * ekai. admin eke thiyana storage option eken okkoma storage hariyatama
 * track wenna ona").
 *
 * The Storage page's numbers used to come from two ledgers that never
 * met: DB size-columns (which never saw profile photos at all) and the
 * bucket walk (which saw EVERYTHING, including orphans). This module
 * makes the two meet, prefix by prefix, for the profile-photo family:
 *
 *   · bucket keys vs tracked keys → ORPHANS (bytes in the bucket nothing
 *     in the database claims);
 *   · ledger rows vs the bucket → GHOSTS (rows still counting bytes whose
 *     object is already gone — e.g. an explorer delete);
 *   · legacy keys the DB references but the ledger missed are ADOPTED on
 *     the sweep, so the ledger self-heals the first time it runs.
 *
 * Cached 5 minutes per process; `force` re-walks immediately.
 */

export type ReconcileRow = {
  prefix: string;
  label: string;
  /** Bucket truth: objects + bytes actually under the prefix. */
  bucketFiles: number;
  bucketBytes: number;
  /** Bucket objects that ARE tracked (DB columns ∪ active ledger rows). */
  trackedFiles: number;
  trackedBytes: number;
  /** Bucket objects nothing in the database claims. */
  orphanFiles: number;
  orphanBytes: number;
  /** Tracked rows whose bucket object is already gone. */
  ghostFiles: number;
  ghostBytes: number;
};

export type StorageReconciliation = {
  ok: true;
  rows: ReconcileRow[];
  /** Ledger-wide freed history (rows marked deleted). */
  freedBytes: number;
  freedFiles: number;
  adopted: number;
  generatedAt: string;
  cached: boolean;
};

/* The profile-photo family. temporary/ is reported by the bucket card and
   media explorer already — keeping this list focused keeps the sweep fast. */
const RECONCILE_PREFIXES: Array<{
  prefix: string;
  label: string;
  kind: "avatar" | "person-photo";
  ownerKind: "admin_user" | "portal_account" | "student" | "teacher";
}> = [
  {
    prefix: "lms-people/",
    label: "Student & teacher register photos",
    kind: "person-photo",
    ownerKind: "student",
  },
  {
    prefix: "admin-avatars/",
    label: "Admin studio avatars",
    kind: "avatar",
    ownerKind: "admin_user",
  },
  {
    prefix: "lms-admin-avatars/",
    label: "LMS-admin avatars",
    kind: "avatar",
    ownerKind: "portal_account",
  },
  {
    prefix: "portal-avatars/",
    label: "Parent & principal avatars",
    kind: "avatar",
    ownerKind: "portal_account",
  },
];

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { payload: StorageReconciliation; expires: number } | null = null;

export async function getStorageReconciliation(
  force = false,
): Promise<StorageReconciliation | { ok: false; error: string }> {
  if (!force && cache && cache.expires > Date.now()) {
    return { ...cache.payload, cached: true };
  }

  try {
    /* All DB-referenced photo/avatar keys, per prefix. These columns are
       the pre-ledger source of truth — sizes come from the bucket listing. */
    const [adminKeys, portalKeys, studentKeys, teacherKeys] = await Promise.all([
      db.select({ key: adminUsers.avatarKey }).from(adminUsers),
      db
        .select({ key: lmsPortalAccounts.avatarKey })
        .from(lmsPortalAccounts)
        .where(isNull(lmsPortalAccounts.deletedAt)),
      db.select({ key: lmsStudentRecords.photoKey }).from(lmsStudentRecords),
      db.select({ key: lmsTeacherRecords.photoKey }).from(lmsTeacherRecords),
    ]);
    const referenced = new Set<string>();
    for (const list of [adminKeys, portalKeys, studentKeys, teacherKeys]) {
      for (const row of list) if (row.key) referenced.add(row.key);
    }

    const rows: ReconcileRow[] = [];
    const adoptQueue: Array<{
      key: string;
      bytes: number;
      kind: "avatar" | "person-photo";
      ownerKind: "admin_user" | "portal_account" | "student" | "teacher";
    }> = [];
    let adopted = 0;

    for (const spec of RECONCILE_PREFIXES) {
      const listing = await explorePrefix(spec.prefix, force ? { force: true } : undefined);
      if (!listing.ok) {
        return { ok: false, error: listing.error };
      }

      const ledgerKeys = await getLedgerActiveKeys(spec.prefix);

      let bucketBytes = 0;
      let trackedBytes = 0;
      let orphanFiles = 0;
      let orphanBytes = 0;
      let trackedFiles = 0;
      const bucketKeys = new Set<string>();

      for (const file of listing.files) {
        bucketBytes += file.size;
        bucketKeys.add(file.key);
        const isReferenced = referenced.has(file.key);
        const isLedgered = ledgerKeys.has(file.key);
        if (isReferenced || isLedgered) {
          trackedFiles += 1;
          trackedBytes += file.size;
          /* Legacy upload: the DB references it but the ledger has no row
             yet — adopt it with the bucket's real size (self-healing). */
          if (isReferenced && !isLedgered) {
            adoptQueue.push({
              key: file.key,
              bytes: file.size,
              kind: spec.kind,
              ownerKind: spec.ownerKind,
            });
          }
        } else {
          orphanFiles += 1;
          orphanBytes += file.size;
        }
      }

      /* Ghosts: active ledger rows (and DB-referenced keys) with no object. */
      let ghostFiles = 0;
      let ghostBytes = 0;
      for (const [key, bytes] of ledgerKeys) {
        if (!bucketKeys.has(key)) {
          ghostFiles += 1;
          ghostBytes += bytes;
        }
      }

      rows.push({
        prefix: spec.prefix,
        label: spec.label,
        bucketFiles: listing.files.length,
        bucketBytes,
        trackedFiles,
        trackedBytes,
        orphanFiles,
        orphanBytes,
        ghostFiles,
        ghostBytes,
      });
    }

    /* Adopt the legacy rows (fire-and-forget — the NEXT read sees them). */
    if (adoptQueue.length > 0) {
      try {
        const { adoptLedgerRows } = await import("@/lib/storage-ledger");
        adopted = await adoptLedgerRows(adoptQueue);
      } catch {
        /* adoption is opportunistic */
      }
    }

    const totals = await getLedgerTotals();

    const payload: StorageReconciliation = {
      ok: true,
      rows,
      freedBytes: totals.freedBytes,
      freedFiles: totals.freedFiles,
      adopted,
      generatedAt: new Date().toISOString(),
      cached: false,
    };
    cache = { payload, expires: Date.now() + CACHE_TTL_MS };
    return payload;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reconcile storage.",
    };
  }
}
