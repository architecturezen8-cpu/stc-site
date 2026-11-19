import { LmsAdminShell } from "@/components/lms-admin/lms-admin-shell";
import { TimetableEditor } from "@/components/portal/teacher-timetable";
import { requireLmsAdmin } from "@/lib/lms-admin-auth";
import { listTimetableClassesForAdmin } from "@/lib/portal-timetable";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * v2.8.55.0 (owner item 3) — LMS Admin → Timetable. The studio holds the
 * MASTER pen: every class on the school register is editable here, through
 * the SAME editor island the teacher portal uses (different endpoint —
 * /api/admin/lms/timetable — guarded by the studio session).
 *
 * THE SYNC (owner items 3, 4, 7): everything the studio writes lands in
 * lms_timetable_slots — the students' class timetable page, the teacher's
 * personal "My Teaching Timetable" week and the dashboards all read from
 * those same rows, so office-made assignments and relief cover appear on
 * every side instantly. One source of truth, nothing to sync by hand.
 */
export default async function LmsAdminTimetablePage() {
  const session = await requireLmsAdmin();
  await ensureSchemaExtras();
  const classes = await listTimetableClassesForAdmin();

  return (
    <LmsAdminShell
      session={session}
      active="timetable"
      title="Timetables"
      subtitle="Create every class's week here — saves sync to the students' timetables and the teachers' personal weeks instantly"
    >
      <div className="rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-4 shadow-sm sm:p-6">
        <TimetableEditor
          classes={classes}
          meTeacherId={null}
          endpoint="/api/admin/lms/timetable"
          roleHint={null}
        />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--la-muted)]">
        Tip: “Custom activity…” on the subject picker stores periods that have
        no subject — outside activities, assemblies, sports. Assigning a
        teacher to any period puts it on that teacher&apos;s personal
        timetable and the class&apos;s student grid at once.
      </p>
    </LmsAdminShell>
  );
}
