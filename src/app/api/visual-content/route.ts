import { NextResponse } from "next/server";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { visualPatches } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path") || "/";
  if (!path.startsWith("/") || path.startsWith("/admin") || path.startsWith("/api")) {
    return NextResponse.json({ patches: [] });
  }
  /* v2.8.93.0 — global ("*") rows (the site crest emblem) ride along on
     every page so a hide/replacement is site-wide (Task 97, A4). */
  const rows = await db
    .select({ selector: visualPatches.selector, data: visualPatches.publishedData })
    .from(visualPatches)
    .where(inArray(visualPatches.pagePath, [path, "*"]))
    .orderBy(asc(visualPatches.id));
  return NextResponse.json(
    { patches: rows },
    { headers: { "Cache-Control": "no-store" } },
  );
}
