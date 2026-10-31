import { NextResponse } from "next/server";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import {
  FIXED_FORM_BASE_FIELDS,
  FIXED_FORM_KEYS,
  getAllEffectiveBaseFields,
  getAllFixedFormBaseOverrides,
  getAllFixedFormExtraFields,
  setFixedFormBaseOverrides,
  setFixedFormExtraFields,
  validateFixedFormBaseOverrides,
  validateFixedFormFieldList,
  type FixedBaseOverride,
} from "@/lib/form-extra-fields";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 / v2.8.86.0 — ADMIN fields for the FIXED forms (contact +
 * admission): the extra questions AND the built-in-question overrides.
 *
 * GET /api/admin/forms/extra-fields
 *   → { contact, admission }                    — the PUBLISHED extra questions
 *     + { baseFields: { contact, admission } }  — the EFFECTIVE built-ins
 *       (canonical defaults merged with the stored overrides; each entry
 *       carries label/placeholder/required/hidden + the canHide /
 *       canUnrequire guard-rail flags for the editor UI).
 * PUT /api/admin/forms/extra-fields
 *   body {
 *     contact: [...], admission: [...],          — extra fields (unchanged rules:
 *       text-only types, 10 max per form)
 *     baseOverrides?: { contact: {...}, admission: {...} } — built-in overrides
 *       keyed by field key; the server validates each against the canonical
 *       specs (locked fields cannot hide/unrequire; unknown keys rejected).
 *   }
 *   Both panels saved together; public forms pick the change up immediately.
 */
export async function GET() {
  const admin = await guardApi("forms", "read");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();
  const [fields, baseDefaults, baseOverrides, baseFields] = await Promise.all([
    getAllFixedFormExtraFields(),
    Promise.resolve(FIXED_FORM_BASE_FIELDS),
    getAllFixedFormBaseOverrides(),
    getAllEffectiveBaseFields(),
  ]);
  return NextResponse.json({ ...fields, baseDefaults, baseOverrides, baseFields });
}

export async function PUT(req: Request) {
  const admin = await guardApi("forms", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  try {
    const body = (await req.json()) as {
      contact?: unknown;
      admission?: unknown;
      baseOverrides?: { contact?: unknown; admission?: unknown };
    };
    const cleaned: Record<(typeof FIXED_FORM_KEYS)[number], unknown[]> = {
      contact: Array.isArray(body.contact) ? body.contact : [],
      admission: Array.isArray(body.admission) ? body.admission : [],
    };

    const contactVerdict = validateFixedFormFieldList(cleaned.contact);
    if (!contactVerdict.ok) {
      return NextResponse.json({ error: `contact: ${contactVerdict.errors.join(" ")}` }, { status: 400 });
    }
    const admissionVerdict = validateFixedFormFieldList(cleaned.admission);
    if (!admissionVerdict.ok) {
      return NextResponse.json({ error: `admission: ${admissionVerdict.errors.join(" ")}` }, { status: 400 });
    }

    /* v2.8.86.0 — built-in-question overrides (optional; absent = untouched). */
    let baseMaps: {
      contact: Record<string, FixedBaseOverride>;
      admission: Record<string, FixedBaseOverride>;
    } | null = null;
    if (body.baseOverrides && typeof body.baseOverrides === "object") {
      const contactV = validateFixedFormBaseOverrides("contact", body.baseOverrides.contact ?? {});
      if (!contactV.ok) {
        return NextResponse.json({ error: `contact: ${contactV.errors.join(" ")}` }, { status: 400 });
      }
      const admissionV = validateFixedFormBaseOverrides("admission", body.baseOverrides.admission ?? {});
      if (!admissionV.ok) {
        return NextResponse.json({ error: `admission: ${admissionV.errors.join(" ")}` }, { status: 400 });
      }
      baseMaps = { contact: contactV.overrides, admission: admissionV.overrides };
    }

    await setFixedFormExtraFields(
      { contact: contactVerdict.fields, admission: admissionVerdict.fields },
      admin.id,
    );
    if (baseMaps) {
      await setFixedFormBaseOverrides(baseMaps, admin.id);
    }

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: baseMaps ? "update_fixed_form_fields" : "update_fixed_form_extra_fields",
      entity: "site_settings",
      entityId: "contact_extra_fields+admission_extra_fields",
      details: {
        contact: contactVerdict.fields.length,
        admission: admissionVerdict.fields.length,
        ...(baseMaps
          ? {
              contactBaseKeys: Object.keys(baseMaps.contact),
              admissionBaseKeys: Object.keys(baseMaps.admission),
            }
          : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      contact: contactVerdict.fields,
      admission: admissionVerdict.fields,
    });
  } catch {
    return NextResponse.json({ error: "Unable to save the extra fields." }, { status: 400 });
  }
}
