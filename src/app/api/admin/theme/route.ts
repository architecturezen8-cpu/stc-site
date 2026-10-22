import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { guardApi } from "@/lib/admin-auth";
import { getSiteSettings, updateSiteSettings } from "@/lib/cms";

/** The Admin Studio colour themes offered in Admin → Theme. */
const ADMIN_THEMES = new Set(["gold", "royal", "violet", "dark"]);

/** One-year device cookie so a saved theme never flashes gold on reload. */
function withThemeCookie(response: NextResponse, theme: string) {
  response.cookies.set("stc-admin-theme", theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });
  return response;
}

export async function GET() {
  const admin = await guardApi("theme", "read");
  if (admin instanceof NextResponse) return admin;
  const settings = await getSiteSettings("draft");
  const theme = ADMIN_THEMES.has(settings.adminTheme) ? settings.adminTheme : "gold";
  return withThemeCookie(NextResponse.json({ theme }), theme);
}

export async function PATCH(req: Request) {
  const admin = await guardApi("theme", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const { theme } = (await req.json()) as { theme?: string };
    if (!theme || !ADMIN_THEMES.has(theme)) {
      return NextResponse.json({ error: "Unknown theme" }, { status: 400 });
    }
    /* Merge into the FRESHEST draft so no other pending setting is lost. */
    const settings = await getSiteSettings("draft");
    await updateSiteSettings({
      data: { ...settings, adminTheme: theme },
      publish: true,
      userId: admin.id,
    });
    revalidatePath("/", "layout");
    return withThemeCookie(
      NextResponse.json({ success: true, theme }),
      theme,
    );
  } catch {
    return NextResponse.json({ error: "Unable to save theme." }, { status: 400 });
  }
}
