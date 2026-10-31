import Link from "next/link";
import Image from "next/image";
import { desc, eq, sql } from "drizzle-orm";
import {
  ArrowUpRight,
  ClipboardList,
  Settings2,
  UserRoundCheck,
  Users,
  BookOpen,
  School,
  GraduationCap,
} from "lucide-react";
import { db } from "@/db";
import {
  lmsClasses,
  lmsEnrollments,
  lmsPortalAccounts,
  lmsStudents,
  lmsSubjects,
  lmsTeacherRecords,
} from "@/db/schema-lms";
import { LmsAdminShell } from "@/components/lms-admin/lms-admin-shell";
import { requireLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { isFreshPortalLogin } from "@/lib/fresh-login";
import { WelcomeBack } from "@/components/portal/welcome-back";

export const dynamic = "force-dynamic";

/**
 * LMS Admin Studio — Dashboard. Live counts straight from the school
 * database plus the newest registration-approval queue entries, so the
 * LMS team opens ONE screen and sees the day's work.
 *
 * v2.8.38.0 redesign: reference-style rounded-3xl white cards with soft
 * shadows, tinted circular icon tiles rotating blue → coral → gold, and
 * an ink pill "Review all" action — all reading --la-* tokens so light
 * and dark themes are first-class.
 *
 * v2.8.39.0 enrichment (owner: "images, animations, charts ehema add karamu"):
 * illustrated welcome banner, a live "students per class" chart that grows
 * from the baseline, and staggered la-rise entrances — no new colours, all
 * token-driven.
 */

const TINTS = [
  { bg: "bg-[var(--la-tint-blue)] text-[var(--la-blue-text)]" },
  { bg: "bg-[var(--la-tint-coral)] text-[var(--la-coral-text)]" },
  { bg: "bg-[var(--la-tint-gold)] text-[var(--la-warn-text)]" },
] as const;

function colomboToday() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export default async function LmsAdminDashboardPage() {
  const session = await requireLmsAdmin();
  await ensureSchemaExtras();

  const [
    classesCount,
    subjectsCount,
    studentsCount,
    enrollmentsActive,
    staffRegister,
    pendingRegistrations,
    newestPending,
    perClass,
    freshLogin,
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(lmsClasses),
    db.select({ n: sql<number>`count(*)::int` }).from(lmsSubjects),
    db.select({ n: sql<number>`count(*)::int` }).from(lmsStudents),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(lmsEnrollments)
      .where(eq(lmsEnrollments.status, "active")),
    db.select({ n: sql<number>`count(*)::int` }).from(lmsTeacherRecords),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.status, "pending")),
    db
      .select({
        id: lmsPortalAccounts.id,
        email: lmsPortalAccounts.email,
        role: lmsPortalAccounts.role,
        fullName: lmsPortalAccounts.fullName,
        createdAt: lmsPortalAccounts.createdAt,
      })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.status, "pending"))
      .orderBy(desc(lmsPortalAccounts.id))
      .limit(5),
    // Chart: active enrollments per class (top 10 by class name).
    db
      .select({
        name: lmsClasses.name,
        count: sql<number>`count(${lmsEnrollments.id})::int`,
      })
      .from(lmsClasses)
      .leftJoin(
        lmsEnrollments,
        sql`${lmsEnrollments.classId} = ${lmsClasses.id} and ${lmsEnrollments.status} = 'active'`,
      )
      .groupBy(lmsClasses.id, lmsClasses.name)
      .orderBy(sql`count(${lmsEnrollments.id}) desc, ${lmsClasses.name} asc`)
      .limit(10),
    /* v2.8.70.2 — the welcome-back popup. */
    isFreshPortalLogin(session.accountId),
  ]);

  const stats = [
    {
      label: "Classes",
      value: classesCount[0]?.n ?? 0,
      icon: School,
      href: "/lms-admin/manage",
    },
    {
      label: "Subjects",
      value: subjectsCount[0]?.n ?? 0,
      icon: BookOpen,
      href: "/lms-admin/manage",
    },
    {
      label: "Students",
      value: studentsCount[0]?.n ?? 0,
      icon: GraduationCap,
      href: "/lms-admin/manage",
    },
    {
      label: "Active enrollments",
      value: enrollmentsActive[0]?.n ?? 0,
      icon: Users,
      href: "/lms-admin/manage",
    },
    {
      label: "Staff register",
      value: staffRegister[0]?.n ?? 0,
      icon: ClipboardList,
      href: "/lms-admin/registers",
    },
    {
      label: "Pending approvals",
      value: pendingRegistrations[0]?.n ?? 0,
      icon: UserRoundCheck,
      href: "/lms-admin/registrations",
    },
  ];

  const chart = perClass.filter((c) => c.name);
  const chartMax = Math.max(1, ...chart.map((c) => c.count));

  return (
    <LmsAdminShell
      session={session}
      active="dashboard"
      title={`Welcome, ${session.fullName || session.email}`}
      subtitle="The learning-management back office — registrations, registers and the class master data behind every portal."
    >
      {/* v2.8.70.2 — welcome back on a fresh login. */}
      <WelcomeBack name={session.fullName || session.email} roleLabel="LMS Admin Studio" theme="studio" freshLogin={freshLogin} storageKind="none" />
      {/* Illustrated welcome banner */}
      <section
        aria-label="Welcome"
        className="la-rise la-panel-shadow relative mt-1 overflow-hidden rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)]"
      >
        <div className="grid sm:grid-cols-[1fr_240px]">
          <div className="p-5 sm:p-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--la-accent-text)]">
              <span className="lmsa-gold-link">{colomboToday()}</span>
            </p>
            <h2 className="mt-1.5 font-display text-[22px] font-semibold leading-snug tracking-[-0.02em] text-[var(--la-heading)] sm:text-[26px]">
              {pendingRegistrations[0]?.n
                ? `${pendingRegistrations[0].n} registration${pendingRegistrations[0].n === 1 ? "" : "s"} waiting for review`
                : "Everything is in order — no pending registrations"}
            </h2>
            <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-[var(--la-body)]">
              Classes, subjects, teaching assignments and the office registers sit
              behind every portal. Start with what needs a human today.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/lms-admin/registrations"
                className="rounded-full bg-[var(--la-accent)] px-4 py-2 text-xs font-semibold text-[var(--la-on-accent)] transition-colors hover:bg-[var(--la-accent-hover)]"
              >
                Review registrations
              </Link>
              <Link
                href="/lms-admin/manage"
                className="rounded-full border border-[var(--la-border)] px-4 py-2 text-xs font-semibold text-[var(--la-body)] transition-colors hover:border-[var(--la-border-strong)] hover:text-[var(--la-heading)]"
              >
                LMS Setup
              </Link>
            </div>
          </div>
          <div className="relative hidden min-h-[176px] sm:block">
            <Image
              src="/illustrations/studio-hero.png"
              alt="Illustration of the learning platform: laptop, books and a graduation cap"
              fill
              sizes="240px"
              className="object-cover object-center"
              priority
            />
          </div>
        </div>
      </section>

      <section
        aria-label="Key figures"
        className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
      >
        {stats.map((stat, i) => (
          <Link
            key={stat.label}
            href={stat.href}
            className={`la-rise la-d${(i % 4) + 1} la-hover-lift la-panel-shadow group rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-4 hover:border-[var(--la-border-strong)] sm:p-5`}
          >
            <div className="flex items-start justify-between">
              <span
                className={`grid h-10 w-10 place-items-center rounded-2xl ${TINTS[i % TINTS.length].bg}`}
              >
                <stat.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="grid h-7 w-7 place-items-center rounded-full border border-[var(--la-border)] text-[var(--la-faint)] transition-all duration-300 group-hover:border-[var(--la-accent-text)] group-hover:text-[var(--la-accent-text)]">
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-4 font-display text-[28px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-[var(--la-heading)] sm:text-[32px]">
              {stat.value}
            </p>
            <p className="mt-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--la-muted)]">
              {stat.label}
            </p>
          </Link>
        ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* Students-per-class chart */}
        <div
          aria-label="Students per class chart"
          className="la-rise la-d2 la-panel-shadow rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--la-heading)]">
                Students per class
              </h2>
              <p className="text-xs text-[var(--la-muted)]">
                Active enrollments across the class master
              </p>
            </div>
            <span className="rounded-full bg-[var(--la-chip)] px-3 py-1.5 text-[11px] font-semibold text-[var(--la-chip-text)]">
              {enrollmentsActive[0]?.n ?? 0} enrolled
            </span>
          </div>

          {chart.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--la-body)]">
              No classes yet — the chart fills in the moment you create them in
              LMS Setup.
            </p>
          ) : (
            <div className="mt-6">
              <div className="flex h-40 items-end gap-2 sm:gap-2.5">
                {chart.map((c, i) => {
                  const h = Math.max(6, Math.round((c.count / chartMax) * 100));
                  const isTop = c.count === chartMax && c.count > 0;
                  return (
                    <div key={c.name} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                      <span
                        className={`text-[10.5px] font-semibold tabular-nums ${isTop ? "text-[var(--la-heading)]" : "text-[var(--la-faint)]"}`}
                      >
                        {c.count}
                      </span>
                      <div
                        className={`la-bar w-full max-w-[34px] rounded-t-lg ${isTop ? "bg-[#ffd444]" : "bg-[var(--la-blue)]"}`}
                        style={{ height: `${h}%`, animationDelay: `${i * 55}ms` }}
                        title={`${c.name}: ${c.count}`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2 sm:gap-2.5">
                {chart.map((c) => (
                  <span
                    key={c.name}
                    className="min-w-0 flex-1 truncate text-center text-[9.5px] font-medium uppercase tracking-wide text-[var(--la-faint)]"
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Newest registrations */}
        <div
          aria-label="Latest registrations"
          className="la-rise la-d3 la-panel-shadow rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--la-divider)] px-5 py-4">
            <div>
              <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--la-heading)]">
                Newest registration requests
              </h2>
              <p className="text-xs text-[var(--la-muted)]">
                Self-registrations waiting in the office queue
              </p>
            </div>
            <Link
              href="/lms-admin/registrations"
              className="shrink-0 rounded-full bg-[var(--la-accent)] px-4 py-2 text-xs font-semibold text-[var(--la-on-accent)] transition-colors hover:bg-[var(--la-accent-hover)]"
            >
              Review all
            </Link>
          </div>

          {newestPending.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--la-body)]">
              Nothing in the queue — every registration has been processed. ✨
            </p>
          ) : (
            <ul className="divide-y divide-[var(--la-divider)]">
              {newestPending.map((row, i) => {
                const initial = (row.fullName || row.email || "?").trim().charAt(0).toUpperCase();
                return (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${TINTS[i % TINTS.length].bg}`}
                      >
                        {initial}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--la-heading)]">
                          {row.fullName}
                        </p>
                        <p className="truncate text-xs text-[var(--la-muted)]">
                          {row.email} · {row.role}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--la-warn-bg)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--la-warn-text)]">
                      pending
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="la-rise la-d4 mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Link
          href="/lms-admin/manage"
          className="group la-hover-lift la-panel-shadow flex items-start gap-3.5 rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-5 hover:border-[var(--la-border-strong)]"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--la-tint-blue)] text-[var(--la-blue-text)]">
            <Settings2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--la-heading)]">
              LMS Setup
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-[var(--la-muted)]">
              Classes (6A–11E, A/L streams), subjects, teaching assignments and enrollment —
              the master data every portal reads.
            </span>
          </span>
        </Link>
        <Link
          href="/lms-admin/registers"
          className="group la-hover-lift la-panel-shadow flex items-start gap-3.5 rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-5 hover:border-[var(--la-border-strong)]"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--la-tint-coral)] text-[var(--la-coral-text)]">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--la-heading)]">
              Verification Records
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-[var(--la-muted)]">
              The admission &amp; staff registers used to verify every self-registration.
            </span>
          </span>
        </Link>
      </section>
    </LmsAdminShell>
  );
}
