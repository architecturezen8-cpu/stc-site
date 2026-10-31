import { NextResponse } from "next/server";
import {
  currentLmsAdminTokenHash,
  getLmsAdminSession,
  revokeOtherLmsAdminSessions,
} from "@/lib/lms-admin-auth";

export const dynamic = "force-dynamic";

/**
 * v2.8.40.0 — Profile → "Sign out other devices". POST-only; every live
 * studio session for this admin EXCEPT the one making the request is
 * deleted, so a lost laptop can be cut off from any device they hold.
 */
export async function POST() {
  const session = await getLmsAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const currentHash = await currentLmsAdminTokenHash();
    const revoked = await revokeOtherLmsAdminSessions(session.accountId, currentHash);
    return NextResponse.json({ ok: true, revoked });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
