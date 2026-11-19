"use client";

import { useMemo, useState } from "react";
import { BookOpen, GraduationCap, Search, Users } from "lucide-react";
import { ChildCard } from "@/components/portal/dashboard-widgets";
import { studentAvatarFor } from "@/lib/student-avatar";
import type { TeacherRoster } from "@/lib/portal-dashboard";

/**
 * TEACHER CLASS ROSTER WALL (v2.8.39.0, owner request: "teachers portal eke
 * uda adala class eke select karama eke inna students... image eka eka show
 * wenna") — class pills up top; selecting one fills the wall with that
 * class's students, each with their own deterministic illustration avatar.
 * Client-side selection = instant, no round-trips; all data is already
 * server-fetched and ownership-checked.
 */
export function TeacherClassRoster({ rosters }: { rosters: TeacherRoster[] }) {
  const firstWithStudents = useMemo(
    () => rosters.find((r) => r.students.length > 0)?.classId ?? rosters[0]?.classId ?? 0,
    [rosters],
  );
  const [selected, setSelected] = useState<number>(firstWithStudents);
  /* v2.8.40.0 — big-class helper: a 50-student wall is impossible to scan,
     so the roster gained a name/admission search plus a scroll-bound wall
     (owner: "class eke lamai 50k withara iddi mokada karanne teacherta
     balanna giyama hena amaru wei"). */
  const [query, setQuery] = useState("");

  const active = rosters.find((r) => r.classId === selected) ?? rosters[0];

  const filteredStudents = useMemo(() => {
    if (!active) return [];
    const q = query.trim().toLowerCase();
    if (!q) return active.students;
    return active.students.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.admissionNo.toLowerCase().includes(q),
    );
  }, [active, query]);

  if (rosters.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--pt-border-strong)] bg-[var(--pt-panel-soft)] px-4 py-8 text-center">
        <p className="mx-auto max-w-[280px] text-[12.5px] leading-relaxed text-[var(--pt-muted)]">
          Class rosters appear here once the school office assigns classes and
          enrollments for this year.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Class pills */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Select a class">
        {rosters.map((r) => {
          const isActive = r.classId === active.classId;
          return (
            <button
              key={r.classId}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelected(r.classId)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-semibold transition-all duration-300 ${
                isActive
                  ? "bg-[var(--pt-nav-active-bg)] text-[var(--pt-nav-active-text)] shadow-[var(--pt-nav-glow)]"
                  : "border border-[var(--pt-border)] bg-[var(--pt-panel)] text-[var(--pt-body)] hover:border-[var(--pt-border-strong)] hover:text-[var(--pt-heading)]"
              }`}
            >
              <GraduationCap size={13} aria-hidden="true" />
              {r.className}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                  isActive
                    ? "bg-black/10 text-[var(--pt-nav-active-text)]"
                    : "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]"
                }`}
              >
                {r.students.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Roster meta + in-class search */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pt-chip)] px-2.5 py-1 text-[11px] font-medium text-[var(--pt-chip-text)]">
            <BookOpen size={11} aria-hidden="true" />
            {active.subject}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pt-chip)] px-2.5 py-1 text-[11px] font-medium text-[var(--pt-chip-text)]">
            <Users size={11} aria-hidden="true" />
            {active.students.length} student{active.students.length === 1 ? "" : "s"}
          </span>
        </div>
        <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3 py-1.5 sm:max-w-[260px]">
          <Search size={13} className="shrink-0 text-[var(--pt-accent-text)]" aria-hidden="true" />
          <span className="sr-only">Search students in class</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a student…"
            className="w-full bg-transparent text-[12px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-muted)]"
          />
        </label>
      </div>

      {/* Picture wall — scroll-bound so a 50-student class stays navigable */}
      {active.students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--pt-border-strong)] bg-[var(--pt-panel-soft)] px-4 py-8 text-center">
          <p className="mx-auto max-w-[280px] text-[12.5px] leading-relaxed text-[var(--pt-muted)]">
            No students are enrolled in {active.className} yet — enrollments
            from the office register appear here.
          </p>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--pt-border-strong)] bg-[var(--pt-panel-soft)] px-4 py-8 text-center">
          <p className="mx-auto max-w-[280px] text-[12.5px] leading-relaxed text-[var(--pt-muted)]">
            No student matches “{query.trim()}” — try a name or an admission
            number.
          </p>
        </div>
      ) : (
        <div className="pt-scrollbar max-h-[560px] space-y-3 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredStudents.map((s, i) => (
              <div
                key={s.admissionNo}
                className="pt-rise"
                style={{ animationDelay: `${Math.min(8, i) * 40}ms` }}
              >
                <ChildCard
                  name={s.fullName}
                  /* v2.8.59.0 — the REAL register photo wins when the office
                     or the student has uploaded one; the deterministic
                     illustration avatar remains the stand-in. */
                  avatarSrc={s.photoUrl ?? studentAvatarFor(s.admissionNo)}
                  lines={[`Admission ${s.admissionNo}`]}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
