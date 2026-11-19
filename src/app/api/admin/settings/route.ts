import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { guardApi } from "@/lib/admin-auth";
import { getSiteSettings, updateSiteSettings } from "@/lib/cms";

export async function GET() {
  const admin = await guardApi("settings", "read");
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({ settings: await getSiteSettings("draft") });
}

export async function PATCH(req: Request) {
  const admin = await guardApi("settings", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const { data, publish = false } = await req.json();
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }
    /* Merge the incoming patch over the FRESHEST draft — callers (e.g. the
       preloader manager) send only their own keys, and updateSiteSettings
       blanks any default key that is missing. Without this merge, saving one
       manager's section wiped every other site setting. */
    const current = await getSiteSettings("draft");
    /* v2.8.60.0 — the school crest is NO LONGER edited through settings.
       The central registry (Admin → Logos & Crests) is the ONE source; the
       old sync below used to replay a STALE settings value over whatever
       the registry held — exactly the "everything corrupts" loop the owner
       kept hitting. The key is ignored here on purpose. */
    const { schoolLogo: _ignoredSchoolLogo, ...patch } = data as Record<string, unknown>;
    await updateSiteSettings({
      data: { ...current, ...patch } as Record<string, string>,
      publish: Boolean(publish),
      userId: admin.id,
    });
    revalidatePath("/", "layout");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unable to save settings." }, { status: 400 });
  }
}
