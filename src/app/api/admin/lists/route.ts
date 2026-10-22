import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLogs,
  oldThomians,
  staff,
  streamClasses,
  streamTeachers,
} from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/**
 * Editable page lists — A/L stream teachers, A/L stream classes and the
 * Old Thomians honour roll. Powers the visual editor's "+" add buttons
 * with optional Staff-directory sync.
 */

const LIST_TYPES = ["stream_teachers", "stream_classes", "old_thomians"] as const;
type ListType = (typeof LIST_TYPES)[number];

const STREAM_SLUGS = ["biological-science", "physical-science", "commerce", "arts"];

function isListType(value: unknown): value is ListType {
  return typeof value === "string" && (LIST_TYPES as readonly string[]).includes(value);
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeImage(value: unknown, fallback = "") {
  const img = text(value);
  return img && (img.startsWith("/") || img.startsWith("https://")) ? img : fallback;
}

function bool(value: unknown) {
  return value === true || value === "true";
}

function sortOrderValue(value: unknown) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : 100;
}

async function logAudit(
  adminId: number,
  action: string,
  entity: string,
  entityId: number | string,
  details: Record<string, unknown>,
) {
  await db.insert(adminAuditLogs).values({
    userId: adminId,
    action,
    entity,
    entityId: String(entityId),
    details,
  });
}

async function loadItems(type: ListType, streamSlug: string | null) {
  if (type === "stream_teachers") {
    return db
      .select()
      .from(streamTeachers)
      .where(streamSlug ? eq(streamTeachers.streamSlug, streamSlug) : undefined)
      .orderBy(asc(streamTeachers.sortOrder), asc(streamTeachers.id));
  }
  if (type === "stream_classes") {
    return db
      .select()
      .from(streamClasses)
      .where(streamSlug ? eq(streamClasses.streamSlug, streamSlug) : undefined)
      .orderBy(asc(streamClasses.sortOrder), asc(streamClasses.id));
  }
  return db.select().from(oldThomians).orderBy(asc(oldThomians.sortOrder), asc(oldThomians.id));
}

export async function GET(req: Request) {
  const admin = await guardApi("pages", "read");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  // Staff picker options for "add from existing staff".
  if (type === "staff_options") {
    const rows = await db
      .select({
        id: staff.id,
        name: staff.name,
        role: staff.role,
        department: staff.department,
        qualification: staff.qualification,
        image: staff.image,
      })
      .from(staff)
      .orderBy(asc(staff.sortOrder), asc(staff.id));
    return NextResponse.json({ staff: rows });
  }

  if (!isListType(type)) {
    return NextResponse.json({ error: "Unknown list type." }, { status: 400 });
  }
  const streamSlug = url.searchParams.get("stream");
  const items = await loadItems(type, streamSlug);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const admin = await guardApi("pages", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  try {
    const body = await req.json();
    const type = body.type as ListType;
    if (!isListType(type)) {
      return NextResponse.json({ error: "Unknown list type." }, { status: 400 });
    }

    const streamSlug = text(body.stream);
    if (type === "stream_teachers" || type === "stream_classes") {
      if (!STREAM_SLUGS.includes(streamSlug)) {
        return NextResponse.json({ error: "A valid A/L stream is required." }, { status: 400 });
      }
    }

    const item = body.item ?? {};
    const staffId = Number(body.staffId) || null;
    let linkedStaffId = staffId;

    // ── Stream teacher ────────────────────────────────────────────────
    if (type === "stream_teachers") {
      const name = text(item.name);
      if (!name) return NextResponse.json({ error: "Teacher name is required." }, { status: 400 });

      // Staff-directory sync — create a staff row for this new teacher.
      if (!linkedStaffId && bool(body.syncStaff)) {
        const [createdStaff] = await db
          .insert(staff)
          .values({
            name,
            role: text(item.role, "Teacher") || "Teacher",
            department: text(body.staffDepartment, "Science & ICT") || "Science & ICT",
            qualification: text(item.qualification),
            image: safeImage(item.image),
            isNew: true,
            sortOrder: 100,
          })
          .returning({ id: staff.id });
        linkedStaffId = createdStaff?.id ?? null;
      }

      const [created] = await db
        .insert(streamTeachers)
        .values({
          streamSlug,
          name,
          role: text(item.role, "Teacher") || "Teacher",
          subject: text(item.subject, name) || name,
          qualification: text(item.qualification),
          image: safeImage(item.image, "/images/staff/teacher-1.jpg"),
          staffId: linkedStaffId,
          isNew: bool(item.isNew) || bool(body.syncStaff),
          sortOrder: sortOrderValue(item.sortOrder),
        })
        .returning();
      await logAudit(admin.id, "list_add", "stream_teacher", created.id, { streamSlug, name, syncedStaff: linkedStaffId });
      return NextResponse.json({ item: created, staffId: linkedStaffId });
    }

    // ── Stream class ──────────────────────────────────────────────────
    if (type === "stream_classes") {
      const code = text(item.code);
      if (!code) return NextResponse.json({ error: "Class code is required." }, { status: 400 });
      const [created] = await db
        .insert(streamClasses)
        .values({
          streamSlug,
          code,
          grade: text(item.grade, code) || code,
          strength: text(item.strength),
          classTeacher: text(item.classTeacher),
          room: text(item.room),
          sortOrder: sortOrderValue(item.sortOrder),
        })
        .returning();
      await logAudit(admin.id, "list_add", "stream_class", created.id, { streamSlug, code });
      return NextResponse.json({ item: created });
    }

    // ── Old Thomians ──────────────────────────────────────────────────
    const name = text(item.name);
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    const [created] = await db
      .insert(oldThomians)
      .values({
        name,
        note: text(item.note),
        field: text(item.field, "Old Thomian") || "Old Thomian",
        image: safeImage(item.image, "/images/staff/teacher-1.jpg"),
        staffId: linkedStaffId,
        isNew: bool(item.isNew),
        sortOrder: sortOrderValue(item.sortOrder),
      })
      .returning();
    await logAudit(admin.id, "list_add", "old_thomian", created.id, { name });
    return NextResponse.json({ item: created });
  } catch (error) {
    console.error("[lists] POST failed:", error);
    return NextResponse.json({ error: "Could not add to the list." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const admin = await guardApi("pages", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  try {
    const body = await req.json();
    const type = body.type as ListType;
    const id = Number(body.id);
    if (!isListType(type) || !id) {
      return NextResponse.json({ error: "Unknown list type or id." }, { status: 400 });
    }
    const item = body.item ?? {};

    if (type === "stream_teachers") {
      const patch: Partial<typeof streamTeachers.$inferInsert> = {};
      if (item.name !== undefined) patch.name = text(item.name);
      if (item.role !== undefined) patch.role = text(item.role);
      if (item.subject !== undefined) patch.subject = text(item.subject);
      if (item.qualification !== undefined) patch.qualification = text(item.qualification);
      if (item.image !== undefined) patch.image = safeImage(item.image, "/images/staff/teacher-1.jpg");
      if (item.isNew !== undefined) patch.isNew = bool(item.isNew);
      if (item.sortOrder !== undefined) patch.sortOrder = sortOrderValue(item.sortOrder);
      const [updated] = await db
        .update(streamTeachers)
        .set(patch)
        .where(eq(streamTeachers.id, id))
        .returning();
      await logAudit(admin.id, "list_update", "stream_teacher", id, patch);
      return NextResponse.json({ item: updated });
    }

    if (type === "stream_classes") {
      const patch: Partial<typeof streamClasses.$inferInsert> = {};
      if (item.code !== undefined) patch.code = text(item.code);
      if (item.grade !== undefined) patch.grade = text(item.grade);
      if (item.strength !== undefined) patch.strength = text(item.strength);
      if (item.classTeacher !== undefined) patch.classTeacher = text(item.classTeacher);
      if (item.room !== undefined) patch.room = text(item.room);
      if (item.sortOrder !== undefined) patch.sortOrder = sortOrderValue(item.sortOrder);
      const [updated] = await db
        .update(streamClasses)
        .set(patch)
        .where(eq(streamClasses.id, id))
        .returning();
      await logAudit(admin.id, "list_update", "stream_class", id, patch);
      return NextResponse.json({ item: updated });
    }

    const patch: Partial<typeof oldThomians.$inferInsert> = {};
    if (item.name !== undefined) patch.name = text(item.name);
    if (item.note !== undefined) patch.note = text(item.note);
    if (item.field !== undefined) patch.field = text(item.field);
    if (item.image !== undefined) patch.image = safeImage(item.image, "/images/staff/teacher-1.jpg");
    if (item.isNew !== undefined) patch.isNew = bool(item.isNew);
    if (item.sortOrder !== undefined) patch.sortOrder = sortOrderValue(item.sortOrder);
    const [updated] = await db
      .update(oldThomians)
      .set(patch)
      .where(eq(oldThomians.id, id))
      .returning();
    await logAudit(admin.id, "list_update", "old_thomian", id, patch);
    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error("[lists] PATCH failed:", error);
    return NextResponse.json({ error: "Could not update the item." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("pages", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const id = Number(url.searchParams.get("id"));
  if (!isListType(type) || !id) {
    return NextResponse.json({ error: "Unknown list type or id." }, { status: 400 });
  }

  if (type === "stream_teachers") {
    await db.delete(streamTeachers).where(eq(streamTeachers.id, id));
  } else if (type === "stream_classes") {
    await db.delete(streamClasses).where(eq(streamClasses.id, id));
  } else {
    await db.delete(oldThomians).where(eq(oldThomians.id, id));
  }
  await logAudit(admin.id, "list_delete", type, id, {});
  return NextResponse.json({ ok: true });
}
