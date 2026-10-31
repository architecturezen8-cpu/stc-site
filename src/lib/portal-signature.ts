import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { lmsPortalAccounts, lmsSignatures } from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/* ────────────────────────────────────────────────────────────────────────
   v2.8.63.0 — PRIVATE SIGNATURE STAMPS

   The owner's anti-abuse policy, implemented:
   · The PNG lives INSIDE the database as base64 — no public URL, no place
     in the media library, nothing for a crawler to guess.
   · A browser only ever receives stamp bytes through a session-gated
     route that re-checks its authorisation for THAT card (and only for
     certified sheets) — possessing a URL without a session is useless.
   · Who may upload what:
       teacher   → their own signature ('sign'), replaceable anytime
       principal → their signature ('sign') + the college seal ('seal')
   · The Principal's certification decision is server-side state on the
     sheet row (status/certified_at/certified_by) — never a client claim.
   ──────────────────────────────────────────────────────────────────────── */

export type SignatureKind = "sign" | "seal";

/** 2 MB decoded cap — a scanned stamp PNG never needs more. */
const MAX_BYTES = 2 * 1024 * 1024;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type SignatureFail =
  | "bad_request"
  | "forbidden_kind"
  | "not_png"
  | "too_large"
  | "server_error";

export function isSignatureKind(value: unknown): value is SignatureKind {
  return value === "sign" || value === "seal";
}

/** Which stamps this role may hold. */
export function allowedKindsForRole(role: string): SignatureKind[] {
  if (role === "principal") return ["sign", "seal"];
  if (role === "teacher") return ["sign"];
  return [];
}

function isPng(bytes: Buffer): boolean {
  if (bytes.length < 8) return false;
  return PNG_MAGIC.every((b, i) => bytes[i] === b);
}

/**
 * Save (upsert) one stamp. Accepts a data URL ("data:image/png;base64,…")
 * or bare base64; validates the PNG magic and the size cap.
 */
export async function saveSignature(
  accountId: number,
  role: string,
  kind: SignatureKind,
  raw: string,
): Promise<{ ok: true } | { ok: false; error: SignatureFail }> {
  try {
    await ensureSchemaExtras();
    if (!allowedKindsForRole(role).includes(kind)) return { ok: false, error: "forbidden_kind" };
    if (typeof raw !== "string" || raw.length < 32) return { ok: false, error: "bad_request" };

    let b64 = raw.trim();
    const comma = b64.indexOf(",");
    if (b64.startsWith("data:") && comma > 0) {
      const meta = b64.slice(5, comma);
      if (meta && !/^image\/png/i.test(meta)) return { ok: false, error: "not_png" };
      b64 = b64.slice(comma + 1);
    }
    b64 = b64.replace(/\s+/g, "");
    let bytes: Buffer;
    try {
      bytes = Buffer.from(b64, "base64");
    } catch {
      return { ok: false, error: "bad_request" };
    }
    if (bytes.length === 0) return { ok: false, error: "bad_request" };
    if (bytes.length > MAX_BYTES) return { ok: false, error: "too_large" };
    if (!isPng(bytes)) return { ok: false, error: "not_png" };

    const data = bytes.toString("base64");
    const [existing] = await db
      .select({ id: lmsSignatures.id })
      .from(lmsSignatures)
      .where(and(eq(lmsSignatures.accountId, accountId), eq(lmsSignatures.kind, kind)))
      .limit(1);
    if (existing) {
      await db
        .update(lmsSignatures)
        .set({ data, mime: "image/png", bytes: bytes.length, updatedAt: new Date() })
        .where(eq(lmsSignatures.id, existing.id));
    } else {
      await db.insert(lmsSignatures).values({
        accountId,
        kind,
        data,
        mime: "image/png",
        bytes: bytes.length,
      });
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "server_error" };
  }
}

export async function removeSignature(
  accountId: number,
  role: string,
  kind: SignatureKind,
): Promise<{ ok: true } | { ok: false; error: SignatureFail }> {
  try {
    await ensureSchemaExtras();
    if (!allowedKindsForRole(role).includes(kind)) return { ok: false, error: "forbidden_kind" };
    await db
      .delete(lmsSignatures)
      .where(and(eq(lmsSignatures.accountId, accountId), eq(lmsSignatures.kind, kind)));
    return { ok: true };
  } catch {
    return { ok: false, error: "server_error" };
  }
}

/** One stamp's bytes for the gated image route (never public). */
export async function getSignatureBytes(
  accountId: number,
  kind: SignatureKind,
): Promise<{ data: string; mime: string } | null> {
  const [row] = await db
    .select({ data: lmsSignatures.data, mime: lmsSignatures.mime })
    .from(lmsSignatures)
    .where(and(eq(lmsSignatures.accountId, accountId), eq(lmsSignatures.kind, kind)))
    .limit(1);
  return row ? { data: row.data, mime: row.mime } : null;
}

export type SignatureMeta = { kind: SignatureKind; bytes: number; updatedAtLabel: string };

export type OwnSignatures = {
  allowed: SignatureKind[];
  stamps: SignatureMeta[];
};

function colomboStamp(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** The signed-in person's own stamp status (metadata only — no bytes). */
export async function getOwnSignatures(accountId: number, role: string): Promise<OwnSignatures> {
  const allowed = allowedKindsForRole(role);
  if (allowed.length === 0) return { allowed: [], stamps: [] };
  const rows = await db
    .select({ kind: lmsSignatures.kind, bytes: lmsSignatures.bytes, updatedAt: lmsSignatures.updatedAt })
    .from(lmsSignatures)
    .where(eq(lmsSignatures.accountId, accountId));
  return {
    allowed,
    stamps: rows
      .filter((r) => allowed.includes(r.kind as SignatureKind))
      .map((r) => ({
        kind: r.kind as SignatureKind,
        bytes: r.bytes,
        updatedAtLabel: colomboStamp(r.updatedAt),
      })),
  };
}

/**
 * Stamp presence for a set of accounts — the flags the sheet needs to know
 * whether a certified card actually has images to place.
 */
export async function stampPresence(
  accountIds: number[],
): Promise<Map<number, { sign: boolean; seal: boolean }>> {
  const map = new Map<number, { sign: boolean; seal: boolean }>();
  if (accountIds.length === 0) return map;
  const rows = await db
    .select({ accountId: lmsSignatures.accountId, kind: lmsSignatures.kind })
    .from(lmsSignatures)
    .where(inArray(lmsSignatures.accountId, accountIds));
  for (const id of accountIds) map.set(id, { sign: false, seal: false });
  for (const row of rows) {
    const entry = map.get(row.accountId);
    if (!entry) continue;
    if (row.kind === "sign") entry.sign = true;
    if (row.kind === "seal") entry.seal = true;
  }
  return map;
}

/**
 * The school's active Principal portal account (role = 'principal') — the
 * name the signature line prints and the stamps certify with.
 */
export async function getActivePrincipalAccount(): Promise<{ id: number; fullName: string } | null> {
  const [row] = await db
    .select({ id: lmsPortalAccounts.id, fullName: lmsPortalAccounts.fullName })
    .from(lmsPortalAccounts)
    .where(and(eq(lmsPortalAccounts.role, "principal"), eq(lmsPortalAccounts.active, true)))
    .orderBy(asc(lmsPortalAccounts.id))
    .limit(1);
  return row ?? null;
}
