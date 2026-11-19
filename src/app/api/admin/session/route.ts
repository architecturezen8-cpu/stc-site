import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({
    authenticated: true,
    /* v2.9.12.3 — role + parsed permissions ride along so client chrome
       (visual editor toolbar) can resolve read-only vs edit for itself. */
    user: {
      id: session.id,
      name: session.name,
      role: session.role,
      permissions: session.permissions,
    },
  });
}
