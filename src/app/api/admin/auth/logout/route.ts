import { NextResponse } from "next/server";
import { logoutAdmin } from "@/lib/admin-auth";

export async function POST() {
  await logoutAdmin();
  /* Relative Location only — the sandbox proxy reports localhost:3000 in
     Host headers, so resolving against req.url would send the browser to an
     unreachable http://localhost:3000/admin/login. */
  return new NextResponse(null, {
    status: 303,
    headers: { location: "/admin/login", "cache-control": "no-store" },
  });
}
