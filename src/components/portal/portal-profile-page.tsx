import {
  BadgeCheck,
  CalendarDays,
  GraduationCap,
  KeyRound,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { PortalShell, type PortalNavItem } from "@/components/portal/portal-shell";
import { EmptyNote, Panel } from "@/components/portal/dashboard-widgets";
import { ProfilePhotoUpload } from "@/components/portal/profile-photo-upload";
import { SignatureStudio } from "@/components/portal/signature-studio";
import { requirePortal, type PortalSession } from "@/lib/portal-auth";
import { getPortalProfile } from "@/lib/portal-profile";
import { chatUnreadBadge } from "@/lib/portal-questions";

/* ────────────────────────────────────────────────────────────────────────
   Shared portal PROFILE page (student / teacher / parent).

   Shows the account card + the school-file (office register) details read
   LIVE through the account → register link, so office edits reflect here
   automatically (the "sync" the owner asked for).
   ──────────────────────────────────────────────────────────────────────── */

const NAV_BASE: Record<
  "student" | "teacher" | "parent" | "principal",
  PortalNavItem[]
> = {
  student: [
    { label: "Dashboard", href: "/student" },
    { label: "Timetable", href: "/student/timetable" },
    { label: "Homework", href: "#homework" },
    { label: "Marks", href: "#marks" },
    { label: "Report card", href: "/student/report-card" },
    { label: "Notices", href: "#notices" },
  ],
  teacher: [
    { label: "Dashboard", href: "/teacher" },
    /* v2.8.41.0 — Attendance was missing from the profile page's nav, so
       teachers on /teacher/profile had no way to reach the register from
       the top navigation (owner bug report). */
    { label: "Attendance", href: "/teacher/attendance" },
    { label: "Timetable", href: "/teacher/timetable" },
    { label: "Report card", href: "/teacher/report-card" },
    { label: "Classes", href: "#classes" },
    { label: "Marking", href: "#marking" },
    { label: "Notices", href: "#notices" },
  ],
  parent: [
    { label: "Dashboard", href: "/parent" },
    { label: "Children", href: "#children" },
    { label: "Report card", href: "/parent/report-card" },
    { label: "Notices", href: "#notices" },
    { label: "Support", href: "#support" },
  ],
  /* v2.8.63.0 — the Principal's certification portal. */
  principal: [
    { label: "Dashboard", href: "/principal" },
    { label: "Certify", href: "/principal/report-card" },
    { label: "Signature", href: "/principal/signature" },
  ],
};

const ROLE_LABEL: Record<"student" | "teacher" | "parent" | "principal", string> = {
  student: "Student Portal",
  teacher: "Teacher Portal",
  parent: "Parent Portal",
  principal: "Principal Portal",
};

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "ST"
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-[var(--pt-divider)] py-2.5 last:border-0">
      <span className="flex shrink-0 items-center gap-2 text-[12.5px] font-medium text-[var(--pt-body)]">
        {icon}
        {label}
      </span>
      <span className="text-right text-[13.5px] font-medium text-[var(--pt-heading)]">{value || "—"}</span>
    </div>
  );
}

/* ── v2.8.48.0 — class-teacher CALL / WHATSAPP chips ────────────────────
   The office register's phone becomes two tap-to-contact chips: tel: opens
   the phone dialler, wa.me opens a WhatsApp chat. The number is normalised
   for WhatsApp (Sri Lanka local 07X → 947X); nothing is sent until the
   parent types the message themselves. Shown only to members of the class
   (the profile page is register-linked, so the chips render exclusively
   for that class's own students/parents). */
function waHref(raw: string): string {
  let digits = raw.replace(/[^0-9+]/g, "").replace(/^\+/, "");
  if (digits.startsWith("0")) digits = `94${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
}

function TeacherContact({ name, phone }: { name: string; phone: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <span className="text-[11.5px] text-[var(--pt-body)]">
        Reach {name.split(" ")[0] || "the teacher"}:
      </span>
      <a
        href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-chip)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--pt-chip-text)] transition-colors hover:border-[var(--pt-border-strong)]"
      >
        <Phone size={12} aria-hidden="true" /> Call
      </a>
      <a
        href={waHref(phone)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-good-bg)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--pt-good-text)] transition-colors hover:border-[var(--pt-border-strong)]"
      >
        <MessageCircle size={12} aria-hidden="true" /> WhatsApp
      </a>
    </div>
  );
}

export async function PortalProfilePage({
  role,
}: {
  role: "student" | "teacher" | "parent" | "principal";
}) {
  const session = await requirePortal(role);
  const [profile, chatBadge] = await Promise.all([
    getPortalProfile({
      role,
      accountId: session.accountId,
      email: session.email,
      fullName: session.fullName,
      avatarUrl: session.avatarUrl,
    }),
    /* v2.8.51.0 — the Chat nav badge (student + teacher only; parents and
       the Principal never hold Q&A conversations). */
    role === "student" || role === "teacher"
      ? chatUnreadBadge(role, session.accountId)
      : Promise.resolve(0),
  ]);

  /* v2.8.51.0 — the Chat section rides in the profile nav too (parents
     have no chat — the Q&A is strictly student↔teacher). */
  const nav: PortalNavItem[] = [
    ...NAV_BASE[role].slice(0, role === "student" ? 3 : role === "principal" ? 2 : 2),
    ...(role === "student" || role === "teacher"
      ? [
          {
            label: "Chat",
            href: `/${role}/chat`,
            badge: chatBadge,
          },
        ]
      : []),
    ...NAV_BASE[role].slice(role === "student" ? 3 : 2),
    { label: "Profile", href: `/${role}/profile`, active: true },
  ];

  const hasRecord = profile.record !== null;

  return (
    <PortalShell
      role={role}
      name={profile.account.fullName}
      email={profile.account.email}
      avatarUrl={profile.account.avatarUrl}
      nav={nav}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        {/* Account card — v2.8.59.0: the avatar is now a REAL profile photo
            (register row) when one exists, with a camera badge for
            students/teachers to change it themselves. Parents keep the
            initials disc (they have no register row). */}
        <section className="pt-rise pt-panel-shadow rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5 transition-colors duration-300 hover:border-[var(--pt-border-strong)] sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {role === "parent" ? (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--pt-accent-soft)] font-display text-[20px] font-semibold text-[var(--pt-accent-text)]">
                {initialsOf(profile.account.fullName)}
              </div>
            ) : (
              <ProfilePhotoUpload
                photoUrl={profile.record?.photoUrl ?? null}
                name={profile.account.fullName}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-accent-text)]">
                {ROLE_LABEL[role]}
              </p>
              <h1 className="mt-0.5 font-display text-[22px] font-semibold tracking-[-0.01em] text-[var(--pt-heading)] sm:text-[24px]">
                {profile.account.fullName}
              </h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[var(--pt-body)]">
                <Mail size={13} /> {profile.account.email}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-chip)] px-3 py-1.5 text-[12px] font-medium text-[var(--pt-chip-text)]">
                <KeyRound size={12} /> {profile.account.signIn}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium ${
                  profile.account.status === "active"
                    ? "border-[var(--pt-border)] bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
                    : "border-[var(--pt-border)] bg-[var(--pt-chip)] text-[var(--pt-chip-text)]"
                }`}
              >
                <ShieldCheck size={12} /> {profile.account.status === "active" ? "Verified" : profile.account.status}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-chip)] px-3 py-1.5 text-[12px] font-medium text-[var(--pt-chip-text)]">
                <CalendarDays size={12} /> Since {profile.account.memberSince}
              </span>
            </div>
          </div>
        </section>

        {/* School register record */}
        {role === "parent" ? (
          profile.children.length > 0 ? (
            <Panel
              title="Children · School Register"
              subtitle="Read live from the school office register"
            >
              <div className="space-y-4">
                {profile.children.map((child) => (
                  <div
                    key={child.admissionNo}
                    className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-4 transition-colors duration-300 hover:border-[var(--pt-border-strong)]"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-[15.5px] font-semibold text-[var(--pt-heading)]">
                        {child.fullName}
                      </h3>
                      <span className="rounded-full bg-[var(--pt-chip)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--pt-chip-text)] ring-1 ring-[var(--pt-border)]">
                        {child.enrolledClass ?? child.registerClassName}
                      </span>
                    </div>
                    <Row label="Admission No" value={child.admissionNo} icon={<BadgeCheck size={12} />} />
                    <Row label="Register No" value={child.registerNo} />
                    <Row label="Class (Register)" value={child.registerClassName} icon={<GraduationCap size={12} />} />
                    <Row label="Class Teacher" value={child.classTeacher ?? "—"} />
                    {child.classTeacher && child.classTeacherPhone && (
                      <TeacherContact name={child.classTeacher} phone={child.classTeacherPhone} />
                    )}
                    <Row label="Father" value={child.fatherName} icon={<UserRound size={12} />} />
                    <Row label="Mother" value={child.motherName} icon={<UserRound size={12} />} />
                  </div>
                ))}
              </div>
            </Panel>
          ) : (
            <Panel title="Children · School Register">
              <EmptyNote>
                No child linked yet — the school office links parent accounts to
                their children from the register.
              </EmptyNote>
            </Panel>
          )
        ) : hasRecord && profile.record ? (
          <Panel
            title={role === "student" ? "My School Record" : "Staff Register Record"}
            subtitle="Read live from the school office register — office edits appear here automatically"
          >
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div>
                {role === "student" ? (
                  <>
                    <Row label="Admission No" value={profile.record.admissionNo ?? ""} icon={<BadgeCheck size={12} />} />
                    <Row label="Register No" value={profile.record.registerNo ?? ""} />
                    <Row label="Class (Register)" value={profile.record.className ?? ""} icon={<GraduationCap size={12} />} />
                    <Row label="Full Name" value={profile.record.fullName ?? ""} />
                  </>
                ) : (
                  <>
                    <Row label="Teacher ID" value={profile.record.teacherId ?? ""} icon={<BadgeCheck size={12} />} />
                    <Row label="Full Name" value={profile.record.fullName ?? profile.account.fullName} />
                    <Row label="Designation" value={profile.record.designation ?? ""} icon={<GraduationCap size={12} />} />
                  </>
                )}
              </div>
              <div>
                {role === "student" && (
                  <>
                    <Row label="Father" value={profile.record.fatherName ?? ""} icon={<UserRound size={12} />} />
                    <Row label="Mother" value={profile.record.motherName ?? ""} icon={<UserRound size={12} />} />
                  </>
                )}
                <Row label="Phone (Register)" value={profile.record.phone ?? ""} icon={<Phone size={12} />} />
                <Row label="Email (Register)" value={profile.record.email ?? ""} icon={<Mail size={12} />} />
                {role === "student" && (
                  <>
                    <Row label="My Class" value={profile.enrolledClass ?? ""} icon={<GraduationCap size={12} />} />
                    <Row label="Class Teacher" value={profile.classTeacher ?? ""} icon={<UserRound size={12} />} />
                    {profile.classTeacher && profile.classTeacherPhone && (
                      <TeacherContact name={profile.classTeacher} phone={profile.classTeacherPhone} />
                    )}
                  </>
                )}
              </div>
            </div>
          </Panel>
        ) : (
          <Panel
            title={role === "student" ? "My School Record" : role === "principal" ? "Principal" : "Staff Register Record"}
          >
            <EmptyNote>
              {role === "principal"
                ? "The Principal portal reads the certification queue directly — no school register row is needed here."
                : "The school office hasn't linked your register row yet — once the office confirms your details, they will appear here automatically."}
            </EmptyNote>
          </Panel>
        )}

        {/* v2.8.63.0 — the PRIVATE signature stamp (report-card flow).
            Teachers upload their signature; the Principal uploads their
            signature + the college seal. Bytes stay in the database — no
            public URL, served only through session-gated routes. */}
        {role === "teacher" || role === "principal" ? (
          <SignatureStudio role={role} session={session} />
        ) : null}
      </div>
    </PortalShell>
  );
}
