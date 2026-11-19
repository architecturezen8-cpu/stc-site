import "server-only";

import { and, eq, isNull, like, sql } from "drizzle-orm";

import { db } from "@/db";
import { lmsStorageLedger } from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/**
 * v2.9.15.6 — the STORAGE LEDGER writer (the owner: "profile photos ehema
 * hariyata storage eke track wenawa ne ... delete karoth ... storage
 * bucket eka full wenna puluwan ... admin eke thiyana storage option eken
 * okkoma storage hariyatama track wenna ona").
 *
 * Every avatar / register-photo write records one row (upsert on the
 * object key) with its REAL byte size, and every delete marks the row —
 * so the admin Storage page sums profile photos like any other file
 * group, and the reconciliation card can prove bucket ↔ database
 * agreement.
 *
 * Best-effort by contract: a ledger hiccup must NEVER break an upload or
 * a profile update — every caller wraps these in try/catch (they already
 * treat blob cleanup the same way).
 */

export type LedgerKind = "avatar" | "person-photo";
export type LedgerOwnerKind = "admin_user" | "portal_account" | "student" | "teacher";

export type LedgerEntry = {
  key: string;
  bytes: number;
  contentType?: string | null;
  kind: LedgerKind;
  ownerKind: LedgerOwnerKind;
  ownerId: number;
};

/** Upsert one blob row — a re-record of the same key (replace flows) resets it. */
export async function recordStorageBlob(entry: LedgerEntry): Promise<void> {
  await ensureSchemaExtras();
  const now = new Date();
  await db
    .insert(lmsStorageLedger)
    .values({
      objectKey: entry.key,
      bytes: Math.max(0, Math.round(entry.bytes)),
      contentType: entry.contentType ?? null,
      kind: entry.kind,
      ownerKind: entry.ownerKind,
      ownerId: entry.ownerId,
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: lmsStorageLedger.objectKey,
      set: {
        bytes: Math.max(0, Math.round(entry.bytes)),
        contentType: entry.contentType ?? null,
        kind: entry.kind,
        ownerKind: entry.ownerKind,
        ownerId: entry.ownerId,
        deletedAt: null,
        createdAt: now,
      },
    });
}

/** Mark one blob's row deleted (audit trail stays; totals drop). */
export async function markStorageBlobDeleted(key: string | null | undefined): Promise<void> {
  if (!key) return;
  await ensureSchemaExtras();
  await db
    .update(lmsStorageLedger)
    .set({ deletedAt: new Date() })
    .where(and(eq(lmsStorageLedger.objectKey, key), isNull(lmsStorageLedger.deletedAt)));
}

/** Adopt bucket-listed keys that the DB references but the ledger missed
    (legacy photos uploaded before the ledger existed). Reconcile calls it. */
export async function adoptLedgerRows(
  entries: Array<Pick<LedgerEntry, "key" | "bytes" | "kind" | "ownerKind">>,
): Promise<number> {
  if (entries.length === 0) return 0;
  await ensureSchemaExtras();
  let adopted = 0;
  for (const entry of entries) {
    try {
      await db
        .insert(lmsStorageLedger)
        .values({
          objectKey: entry.key,
          bytes: Math.max(0, Math.round(entry.bytes)),
          kind: entry.kind,
          ownerKind: entry.ownerKind,
        })
        .onConflictDoNothing({ target: lmsStorageLedger.objectKey });
      adopted += 1;
    } catch {
      /* one bad row must not stop the adoption sweep */
    }
  }
  return adopted;
}

/* ── reads (the Storage page) ──────────────────────────────────────────── */

export type LedgerTotals = {
  /** Active (deleted_at IS NULL) bytes, all kinds. */
  bytes: number;
  files: number;
  /** Bytes whose blobs were removed — history, never counted as usage. */
  freedBytes: number;
  freedFiles: number;
  byKind: { kind: string; bytes: number; files: number }[];
};

export async function getLedgerTotals(): Promise<LedgerTotals> {
  await ensureSchemaExtras();
  const rows = await db
    .select({
      kind: lmsStorageLedger.kind,
      deleted: lmsStorageLedger.deletedAt,
      bytes: sql<number>`coalesce(sum(${lmsStorageLedger.bytes}), 0)::bigint`,
      files: sql<number>`count(*)::int`,
    })
    .from(lmsStorageLedger)
    .groupBy(lmsStorageLedger.kind, lmsStorageLedger.deletedAt);

  const totals: LedgerTotals = { bytes: 0, files: 0, freedBytes: 0, freedFiles: 0, byKind: [] };
  const byKind = new Map<string, { bytes: number; files: number }>();
  for (const row of rows) {
    const bytes = Number(row.bytes ?? 0);
    const files = Number(row.files ?? 0);
    if (row.deleted) {
      totals.freedBytes += bytes;
      totals.freedFiles += files;
      continue;
    }
    totals.bytes += bytes;
    totals.files += files;
    const bucket = byKind.get(row.kind) ?? { bytes: 0, files: 0 };
    bucket.bytes += bytes;
    bucket.files += files;
    byKind.set(row.kind, bucket);
  }
  totals.byKind = [...byKind.entries()].map(([kind, v]) => ({ kind, ...v }));
  return totals;
}

/** Active ledger keys under one prefix (reconciliation cross-check). */
export async function getLedgerActiveKeys(prefix: string): Promise<Map<string, number>> {
  await ensureSchemaExtras();
  const rows = await db
    .select({ key: lmsStorageLedger.objectKey, bytes: lmsStorageLedger.bytes })
    .from(lmsStorageLedger)
    .where(and(like(lmsStorageLedger.objectKey, `${prefix}%`), isNull(lmsStorageLedger.deletedAt)));
  return new Map(rows.map((r) => [r.key, Number(r.bytes ?? 0)]));
}
