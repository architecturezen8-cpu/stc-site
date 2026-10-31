import { NextResponse } from "next/server";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { setStorageCap } from "@/lib/student-storage";

export const dynamic = "force-dynamic";

/**
 * v2.8.67.3 — D.3: set / change / remove ONE person's storage cap.
 * Body: { role: 'student'|'teacher'|'parent', personId, quotaBytes } where
 * quotaBytes is a positive byte count, or null to remove the override and
 * fall back to the role default (students 500 MB, others unlimited).
 */
export async function POST(req: Request) {
  const admin = await guardPortalOrLmsAdmin("edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = (await req.json()) as {
      role?: unknown;
      personId?: unknown;
      quotaBytes?: unknown;
    };

    const role = body.role;
    const personId = Number(body.personId);
    if (
      (role !== "student" && role !== "teacher" && role !== "parent") ||
      !Number.isInteger(personId) ||
      personId <= 0
    ) {
      return NextResponse.json(
        { ok: false, error: "A valid role and personId are required." },
        { status: 400 },
      );
    }

    let quotaBytes: number | null = null;
    if (body.quotaBytes !== null && body.quotaBytes !== undefined && body.quotaBytes !== "") {
      quotaBytes = Number(body.quotaBytes);
      if (!Number.isFinite(quotaBytes) || quotaBytes <= 0) {
        return NextResponse.json(
          { ok: false, error: "The cap must be a positive size, or empty to remove it." },
          { status: 400 },
        );
      }
    }

    await setStorageCap(role, personId, quotaBytes);

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "storage_cap_set",
      entity: "lms_storage_cap",
      entityId: `${role}:${personId}`,
      details: { quotaBytes },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not save the cap.",
      },
      { status: 500 },
    );
  }
}
