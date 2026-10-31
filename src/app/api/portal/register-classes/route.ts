import { NextResponse } from "next/server";
import { db } from "@/db";
import { lmsClasses, lmsStudentRecords } from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * v2.8.59.0 — the owner: "verification records daddi class eka type karanna
 * denne nathuwa selection list ekak demuda. mokada waradiyata type karoth
 * okkoma waradenawa ne ekai. account ekka create karana than walath ehema
 * karamu ne."
 *
 * PUBLIC class list for the self-registration form: the Class and the
 * Child's class fields become dropdowns fed from the school's REAL class
 * names — the register (lms_student_records.class_name, what verification
 * actually matches against) merged with the live class master (lms_classes).
 * A typo can no longer push a registration into the manual-approval queue.
 *
 * Leaks nothing: class names like "10-A" are the school's public face.
 */
export async function GET() {
  try {
    await ensureSchemaExtras();

    const [registerRows, classRows] = await Promise.all([
      db
        .selectDistinct({ name: lmsStudentRecords.className })
        .from(lmsStudentRecords),
      db.selectDistinct({ name: lmsClasses.name }).from(lmsClasses),
    ]);

    /* Natural sort so "10-A" follows "9-B" like a human expects. */
    const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    const classes = [...new Set(
      [...registerRows, ...classRows]
        .map((r) => r.name.trim())
        .filter((n) => n.length > 0 && n.length <= 40),
    )].sort(collator.compare);

    return NextResponse.json(
      { ok: true, classes },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    /* The form keeps a type-in fallback when this fails. */
    return NextResponse.json(
      { ok: false, classes: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
