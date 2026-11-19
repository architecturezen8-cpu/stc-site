import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { requestCookieFlags } from "@/lib/cookie-flags";
import { getSiteSettings } from "@/lib/cms";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/** The Admin Studio colour themes offered in Admin → Theme. */
const ADMIN_THEMES = new Set(["gold", "royal", "violet", "dark"]);

/**
 * v2.9.10.0 — the studio theme is PER ADMIN now. One admin applying a theme
 * never restyles another admin's studio (the owner: "hama ekkenek theme ekak
 * apply karama anith adminlatath e theme ekama apply wenna neme").
 *
 * The choice lives on the admin_users row; the one-year device cookie only
 * exists so a saved theme never flashes gold on reload (each login re-sets
 * it from the account's own row).
 */
async function withThemeCookie(response: NextResponse, theme: string) {
  response.cookies.set("stc-admin-theme", theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    ...(await requestCookieFlags()),
    httpOnly: false,
  });
  return response;
}

export async function GET() {
  const admin = await guardApi("theme", "read");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  const [row] = await db
    .select({ theme: adminUsers.theme })
    .from(adminUsers)
    .where(eq(adminUsers.id, admin.id))
    .limit(1);

  let theme = row?.theme ?? "";
  if (!ADMIN_THEMES.has(theme)) {
    /* One-time seed: this account has never picked a theme, so adopt the
       look it already had (the old global setting) as its own — nobody's
       studio changes on upgrade, and future choices stay private. */
    try {
      const settings = await getSiteSettings("draft");
      theme = ADMIN_THEMES.has(settings.adminTheme) ? settings.adminTheme : "gold";
    } catch {
      theme = "gold";
    }
    await db
      .update(adminUsers)
      .set({ theme, updatedAt: new Date() })
      .where(eq(adminUsers.id, admin.id))
      .catch(() => undefined);
  }

  return await withThemeCookie(NextResponse.json({ theme }), theme);
}

export async function PATCH(req: Request) {
  const admin = await guardApi("theme", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();
  try {
    const { theme } = (await req.json()) as { theme?: string };
    if (!theme || !ADMIN_THEMES.has(theme)) {
      return NextResponse.json({ error: "Unknown theme" }, { status: 400 });
    }
    /* This admin's row ONLY — no global setting, no revalidation. */
    await db
      .update(adminUsers)
      .set({ theme, updatedAt: new Date() })
      .where(eq(adminUsers.id, admin.id));
    return await withThemeCookie(
      NextResponse.json({ success: true, theme }),
      theme,
    );
  } catch {
    return NextResponse.json({ error: "Unable to save theme." }, { status: 400 });
  }
}
