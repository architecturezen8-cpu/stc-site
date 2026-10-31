import { NextResponse } from "next/server";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, adminUsers } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Version history — every change made anywhere on the site, with the date,
 * time and the admin who made it. Reads the append-only audit log.
 */
export async function GET(req: Request) {
  const admin = await guardApi("audit", "read");
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const entity = url.searchParams.get("entity")?.trim() ?? "";
  const action = url.searchParams.get("action")?.trim() ?? "";
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));

  const filters: SQL[] = [];
  if (entity) filters.push(eq(adminAuditLogs.entity, entity));
  if (action) filters.push(eq(adminAuditLogs.action, action));

  const rows = await db
    .select({
      id: adminAuditLogs.id,
      action: adminAuditLogs.action,
      entity: adminAuditLogs.entity,
      entityId: adminAuditLogs.entityId,
      details: adminAuditLogs.details,
      createdAt: adminAuditLogs.createdAt,
      userId: adminAuditLogs.userId,
      userName: adminUsers.name,
      userEmail: adminUsers.email,
    })
    .from(adminAuditLogs)
    .leftJoin(adminUsers, eq(adminAuditLogs.userId, adminUsers.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(adminAuditLogs.createdAt), desc(adminAuditLogs.id))
    .limit(limit);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adminAuditLogs);

  return NextResponse.json({ entries: rows, total: count });
}
