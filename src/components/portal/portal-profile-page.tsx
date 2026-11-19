import {
  BadgeCheck,
  CalendarDays,
  GraduationCap,
  KeyRound,
  Mail,
  MessageCircle,
  Phone,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { PortalShell, type PortalNavItem } from "@/components/portal/portal-shell";
import { EmptyNote, Panel } from "@/components/portal/dashboard-widgets";
import { ParentChildLinkForm, ParentChildUnlinkButton } from "@/components/portal/parent-child-link";
import { PasswordSecurityCard } from "@/components/portal/password-security-card";
import { ProfileAvatarControl } from "@/components/portal/profile-photo-studio";
import { ProfileDetailsEditor } from "@/components/portal/profile-details-editor";
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
    { label: "My Storage", href: "/student/storage" },
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
    { label: "Student passwords", href: "/teacher/passwords" },
    { label: "My Storage", href: "/teacher/storage" },
  ],
  parent: [
    { label: "Dashboard", href: "/parent" },
    { label: "Children", href: "#children" },
    { label: "Report card", href: "/parent/report-card" },
    { label: "Materials", href: "/parent/materials" },
    { label: "Notices", href: "/parent/notices" },
    { label: "Support", href: "#support" },
    { label: "My Storage", href: "/parent/storage" },
  ],
  /* v2.8.63.0 — the Principal's certification portal. */
  principal: [
    { label: "Dashboard", href: "/principal" },
    { label: "Certify", href: "/principal/report-card" },
    { label: "Certified", href: "/principal/report-card?view=certified" },
    { label: "Signature", href: "/principal/signature" },
  ],
};

const ROLE_LABEL: Record<"student" | "teacher" | "parent" | "principal", string> = {
  student: "Student Portal",
  teacher: "Teacher Portal",
  parent: "Parent Portal",
  principal: "Principal Portal",
};

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

/* v2.9.15.10 — the office's EXTRA sheet columns (anything beyond the
   standard register fields that rode in on an Excel import). They used to
   live only inside the Verification Records manager; now every register
   row carries them onto the profile pages too (owner: extra fields eka
   profiles walath pennanna). */
function ExtraRows({ fields }: { fields: { label: string; value: string }[] | undefined }) {
  if (!fields || fields.length === 0) return null;
  return (
    <>
      {fields.map((f) => (
        <Row key={f.label} label={f.label} value={f.value} />
      ))}
    </>
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
        {/* Account card — v2.9.15.6: EVERY role's avatar is now a door
            into the Photo Studio popup (crop, filters, fine-tune, remove
            — the owner: "profile photo ekata photo ekak danna giyama eka
            click karama popup ekak enna one"). Students/teachers write to
            their office register row; parents/principals to their account
            row (a Google picture shows until they upload their own). */}
        <section className="pt-rise pt-panel-shadow rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5 transition-colors duration-300 hover:border-[var(--pt-border-strong)] sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <ProfileAvatarControl
              photoUrl={
                profile.record?.photoUrl ??
                (role === "parent" || role === "principal" ? profile.account.avatarUrl : null)
              }
              name={profile.account.fullName}
              photoBytes={profile.photoBytes}
            />
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
              {/* v2.9.15.0 — the honest badge: the office's classification
                  wins, then a register match; a manual approval WITHOUT a
                  register match arrives as verificationState='unverified'
                  (approvals route) and shows amber — never a green shield.
                  No classification and no match falls back to the status. */}
              {profile.account.effectiveVerification === "verified" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-good-bg)] px-3 py-1.5 text-[12px] font-medium text-[var(--pt-good-text)]">
                  <ShieldCheck size={12} /> Verified
                </span>
              ) : profile.account.effectiveVerification === "unverified" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-warn-bg)] px-3 py-1.5 text-[12px] font-medium text-[var(--pt-warn-text)]">
                  <ShieldAlert size={12} /> Unverified
                </span>
              ) : profile.account.effectiveVerification === "guest" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-chip)] px-3 py-1.5 text-[12px] font-medium text-[var(--pt-chip-text)]">
                  Guest account
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-chip)] px-3 py-1.5 text-[12px] font-medium text-[var(--pt-chip-text)]">
                  <ShieldCheck size={12} />{" "}
                  {profile.account.status === "pending"
                    ? "Pending approval"
                    : profile.account.status === "active"
                      ? "Active"
                      : profile.account.status}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-chip)] px-3 py-1.5 text-[12px] font-medium text-[var(--pt-chip-text)]">
                <CalendarDays size={12} /> Since {profile.account.memberSince}
              </span>
            </div>
          </div>
        </section>

        {/* School register record — parents also get the v2.9.15.5
            self-service islands: a "Link a child" form (one admission
            number at a time, with a helper line) inside the panel and an
            Unlink chip on every child card, so a family can be linked or
            fixed from the profile itself instead of only at registration
            or through the office (owner request). */}
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
                      <span className="flex items-center gap-2">
                        <span className="rounded-full bg-[var(--pt-chip)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--pt-chip-text)] ring-1 ring-[var(--pt-border)]">
                          {child.enrolledClass ?? child.registerClassName}
                        </span>
                        <ParentChildUnlinkButton
                          studentId={child.studentId}
                          childName={child.fullName}
                        />
                      </span>
                    </div>
                    <Row label="Admission No" value={child.admissionNo} icon={<BadgeCheck size={12} />} />
                    <Row label="Register No" value={child.registerNo} />
                    <Row label="Class (Register)" value={child.registerClassName} icon={<GraduationCap size={12} />} />
                    <Row label="Class Teacher" value={child.classTeacher ?? "—"} />
                    {child.classAssistantTeacher ? (
                      <Row label="Assistant Class Teacher" value={child.classAssistantTeacher} />
                    ) : null}
                    {child.classTeacher && child.classTeacherPhone && (
                      <TeacherContact name={child.classTeacher} phone={child.classTeacherPhone} />
                    )}
                    <Row label="Father" value={child.fatherName} icon={<UserRound size={12} />} />
                    <Row label="Mother" value={child.motherName} icon={<UserRound size={12} />} />
                    <ExtraRows fields={child.extraFields} />
                  </div>
                ))}
                {/* v2.9.15.5 — the self-service link form rides at the bottom
                    of the same panel; the register list re-renders above it
                    after every successful link. */}
                <ParentChildLinkForm />
              </div>
            </Panel>
          ) : (
            <Panel title="Children · School Register">
              <EmptyNote>
                No child linked yet — type ONE child&apos;s admission number in
                the form below and press Link child. Have more children? Link
                them one by one the same way.
              </EmptyNote>
              <div className="mt-4">
                <ParentChildLinkForm />
              </div>
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
                    {/* v2.9.13.0 — the assistant class teacher now shows beside
                        the class teacher (owner: "assisten class teacherge
                        name eka watenne na ne"). */}
                    {profile.classAssistantTeacher ? (
                      <>
                        <Row
                          label="Assistant Class Teacher"
                          value={profile.classAssistantTeacher}
                          icon={<UserRound size={12} />}
                        />
                        {profile.classAssistantTeacherPhone ? (
                          <TeacherContact
                            name={profile.classAssistantTeacher}
                            phone={profile.classAssistantTeacherPhone}
                          />
                        ) : null}
                      </>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            {profile.record.extraFields && profile.record.extraFields.length > 0 ? (
              <div className="mt-4 border-t border-[var(--pt-divider)] pt-2">
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--pt-body)] uppercase">
                  More register details
                </p>
                <div className="grid gap-x-8 sm:grid-cols-2">
                  <ExtraRows fields={profile.record.extraFields} />
                </div>
              </div>
            ) : null}
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

        {/* v2.9.15.8 — MY DETAILS: the signed-in owner edits their own
            account-level display name + phone (owner: "aya machan ewage
            acc eka haduwa haduwamai details mukuth adala owner ta edit
            karanna ba" — office-created accounts froze everything). The
            register record above stays the office's file; the login email
            stays read-only with a pointer to the office. */}
        <Panel title="My details" subtitle="Your own account details — editable here any time">
          {/* v2.9.15.10 — the EMAIL field edits the person's real contact
              address (register row included, so the verification records
              follow); students/teachers see their register email here since
              that is what the record panel displays. */}
          <ProfileDetailsEditor
            role={role}
            fullName={profile.account.fullName}
            phone={profile.account.phone}
            email={profile.record?.email ?? profile.account.email}
            signInKind={profile.account.signIn}
          />
        </Panel>

        {/* v2.9.15.8 — PASSWORD & SECURITY on the profile itself (owner:
            "profile eken password eka change karanna option ekak na").
            Password accounts get the full change form (current password
            verified first — the same endpoint /account/secure uses);
            Google-only accounts get an honest note instead. */}
        <Panel
          title="Password & security"
          subtitle={profile.account.signIn === "Password" ? "Change your password any time" : "Your sign-in is managed by Google"}
        >
          <PasswordSecurityCard role={role} signIn={profile.account.signIn} />
        </Panel>

        {/* v2.8.63.0 — the PRIVATE signature stamp (report-card flow).
            Teachers upload their signature; the Principal uploads their
            signature + the college seal; parents upload theirs for the
            printed report's Parent/Guardian line (v2.9.15.0). Bytes stay
            in the database — no public URL, served only through
            session-gated routes. */}
        {role === "teacher" || role === "principal" || role === "parent" ? (
          <SignatureStudio role={role} session={session} />
        ) : null}
      </div>
    </PortalShell>
  );
}
