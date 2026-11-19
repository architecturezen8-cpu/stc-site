import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { like } from "drizzle-orm";
import { guardApi } from "@/lib/admin-auth";
import { getSiteSettings, updateSiteSettings } from "@/lib/cms";
import { db } from "@/db";
import { visualPatches } from "@/db/schema";

/* ── v2.9.1.0 — Footer write-through (the anti-corrupt policy) ───────────
   The visual editor saves footer edits HERE instead of stacking visual
   patches, and Admin → Footer edits the very same site-settings keys.
   One source of truth: the two editors can never fight or corrupt each
   other (the owner's "footer eketh visual editor eke anti-corrupt policy
   eka add karanawada" request — the same pattern as the navbar rows). */

const TEXT_FIELDS = new Set([
  "brandName",
  "brandSubline",
  "footerDescription",
  "address",
  "phone",
  "email",
  "officeHours",
  "footerExploreHeading",
  "footerContactHeading",
  "footerAdmissionsHeading",
  "footerNewsletterText",
  "footerApplyLabel",
  "footerBackToTop",
  "footerCopyright",
]);

const LIST_FIELDS = new Set([
  "footerExploreItems",
  "footerSocials",
  "footerBottomLinks",
]);

/** A text field whose element is an anchor keeps its destination here. */
const COMPANION_HREF: Record<string, string> = {
  footerApplyLabel: "footerApplyHref",
};

/** Legacy page-scoped/global patches that used to hold footer edits. */
async function removeLegacyFooterPatches() {
  try {
    await db
      .delete(visualPatches)
      .where(like(visualPatches.selector, `%data-visual-key="footer%`));
  } catch {
    /* cleanup is best-effort — the write-through itself must never fail */
  }
}

export async function PATCH(req: Request) {
  const admin = await guardApi("footer", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const field = typeof body.field === "string" ? body.field : "";
    const text = typeof body.text === "string" ? body.text.trim() : undefined;
    const href = typeof body.href === "string" ? body.href.trim() : undefined;

    const current = await getSiteSettings("draft");
    const next: Record<string, string> = { ...current };

    if (LIST_FIELDS.has(field)) {
      const index = Number(body.index);
      let list: Array<Record<string, unknown>> = [];
      try {
        const parsed = JSON.parse(current[field] ?? "[]");
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        list = [];
      }
      if (!Number.isInteger(index) || index < 0 || index >= list.length) {
        return NextResponse.json({ error: "Footer item not found." }, { status: 400 });
      }
      const item: Record<string, unknown> = { ...list[index] };
      if (text) item.label = text.slice(0, 200);
      if (href) item.href = href.slice(0, 2000);
      list[index] = item;
      next[field] = JSON.stringify(list);
    } else if (TEXT_FIELDS.has(field)) {
      if (!text) {
        return NextResponse.json({ error: "Text cannot be empty." }, { status: 400 });
      }
      next[field] = text.slice(0, 2000);
      const companion = COMPANION_HREF[field];
      if (companion && href) next[companion] = href.slice(0, 2000);
    } else {
      return NextResponse.json({ error: "Unknown footer field." }, { status: 400 });
    }

    await updateSiteSettings({ data: next, publish: true, userId: admin.id });
    await removeLegacyFooterPatches();
    revalidatePath("/", "layout");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[footer-field] PATCH failed:", error);
    return NextResponse.json({ error: "Unable to update the footer." }, { status: 500 });
  }
}
