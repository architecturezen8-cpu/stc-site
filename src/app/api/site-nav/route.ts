import { NextResponse } from "next/server";
import { getNavTree } from "@/lib/site-nav";

export const dynamic = "force-dynamic";

/**
 * v2.9.0.0 — the published navigation tree for client refreshes. The tree
 * is server-delivered through the root layout first (no flash); this GET
 * keeps an open tab in sync after Admin → Navigation edits happen elsewhere.
 */
export async function GET() {
  const items = await getNavTree();
  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "no-store" } },
  );
}
