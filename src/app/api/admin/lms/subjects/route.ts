import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsClassSubjects, lmsSubjects } from "@/db/schema-lms";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/* ────────────────────────────────────────────────────────────────────────
   Admin → LMS Setup → Subjects

   POST   { name, code? }   create (duplicate names blocked)
   DELETE ?id=              delete (blocked while assigned to classes)
   ──────────────────────────────────────────────────────────────────────── */

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

export async function POST(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = clean(body?.name, 80);
  const code = clean(body?.code, 30);
  if (!name) {
    return NextResponse.json({ error: "Subject name is required." }, { status: 400 });
  }

  const [dup] = await db
    .select({ id: lmsSubjects.id })
    .from(lmsSubjects)
    .where(sql`lower(${lmsSubjects.name}) = ${name.toLowerCase()}`)
    .limit(1);
  if (dup) {
    return NextResponse.json({ error: `Subject "${name}" already exists.` }, { status: 409 });
  }

  const [created] = await db.insert(lmsSubjects).values({ name, code: code || null }).returning();
  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "lms_subject_created",
    entity: "lms_subject",
    entityId: String(created.id),
  });

  return NextResponse.json({ ok: true, subject: created });
}

export async function DELETE(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid subject." }, { status: 400 });
  }

  const [refs] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lmsClassSubjects)
    .where(eq(lmsClassSubjects.subjectId, id));
  if ((refs?.n ?? 0) > 0) {
    return NextResponse.json(
      { error: `Subject is assigned to ${refs?.n ?? 0} class assignment(s) — remove those first.` },
      { status: 409 },
    );
  }

  await db.delete(lmsSubjects).where(eq(lmsSubjects.id, id));
  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "lms_subject_deleted",
    entity: "lms_subject",
    entityId: String(id),
  });

  return NextResponse.json({ ok: true });
}
