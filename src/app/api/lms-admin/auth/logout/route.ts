import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  LMS_ADMIN_LEGACY_COOKIE,
  LMS_ADMIN_SESSION_COOKIE,
  destroyLmsAdminSessionByToken,
  legacyTokenHoldsLmsAdmin,
} from "@/lib/lms-admin-auth";

export const dynamic = "force-dynamic";

/**
 * LMS Admin — sign out (v2.8.37.1). Destroys ONLY the studio session:
 * the studio cookie row, plus the legacy shared cookie WHEN it holds an
 * lms_admin session. Student/teacher/parent portals on this browser are
 * NOT touched.
 */
export async function POST() {
  const cookieStore = await cookies();
  await destroyLmsAdminSessionByToken(cookieStore.get(LMS_ADMIN_SESSION_COOKIE)?.value);

  const response = NextResponse.json({ ok: true, redirect: "/lms-admin/login" });
  response.cookies.delete(LMS_ADMIN_SESSION_COOKIE);

  /* Legacy shared cookie: clear only when it carries an lms_admin session
     (so an old studio login can't resurrect after sign-out) — a portal
     session living in that cookie survives the studio logout. */
  const legacyToken = cookieStore.get(LMS_ADMIN_LEGACY_COOKIE)?.value;
  if (legacyToken && (await legacyTokenHoldsLmsAdmin(legacyToken))) {
    await destroyLmsAdminSessionByToken(legacyToken);
    response.cookies.delete(LMS_ADMIN_LEGACY_COOKIE);
  }
  return response;
}
