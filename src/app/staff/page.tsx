import Image from "next/image";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowRight, GraduationCap, Mail } from "lucide-react";
import { db } from "@/db";
import { staff, type StaffMember } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { Navbar } from "@/components/navbar";
import { CountUp } from "@/components/count-up";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { NewBadge } from "@/components/new-badge";
import { PORTRAIT } from "@/lib/media";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";

export const dynamic = "force-dynamic";

const DEPUTY_PHOTO = [PORTRAIT.man4, PORTRAIT.woman1, PORTRAIT.man7];

export const metadata = {
  title: "Our Staff — St. Thomas' College",
  description:
    "Meet the leadership, academic faculty and specialists of St. Thomas' College, Matale.",
};

function initials(name: string) {
  const clean = name.replace(/^(Mr|Mrs|Ms|Dr|Capt)\.\s*/, "");
  const parts = clean.split(" ").filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts[parts.length - 1]?.charAt(0) ?? "";
  return (first + last).toUpperCase();
}

/** URL-safe anchor id for an ad-hoc department section. */
function deptSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function StaffAvatar({
  member,
  small = false,
}: {
  member: StaffMember & { photoScale?: number };
  small?: boolean;
}) {
  const size = small ? "h-14 w-14 text-lg" : "h-16 w-16 text-xl";
  if (member.image) {
    const scale = Math.min(240, Math.max(50, Number(member.photoScale) || 100));
    return (
      <span className={`relative block ${size} shrink-0 overflow-hidden rounded-full`}>
        <Image
          src={member.image}
          alt={member.name}
          fill
          sizes="64px"
          className="object-cover object-top"
          style={scale !== 100 ? { transform: `scale(${scale / 100})` } : undefined}
        />
      </span>
    );
  }
  return (
    <span
      className={`grid ${size} shrink-0 place-items-center rounded-full font-display font-semibold bg-fg text-surface`}
    >
      {initials(member.name)}
    </span>
  );
}

function SectionHeader({
  title,
  sub,
  id,
}: {
  title: string;
  sub: string;
  id: string;
}) {
  return (
    <Reveal>
      <div id={id} className="flex scroll-mt-28 flex-wrap items-center gap-5">
        <span className="h-px w-8 bg-gold" />
        <span className="font-sans text-[10px] uppercase tracking-[0.4em] text-fg/45">
          {title}
        </span>
        <span className="text-[13px] text-fg/40">{sub}</span>
        <span className="h-px flex-1 bg-fg/10" />
      </div>
    </Reveal>
  );
}

/**
 * v2.8.93.0 — one shared grid section for every non-leadership group
 * (worklog Task 97, E11): the designed Academic / Sports / Arts sections
 * and every ad-hoc department added later all render through this, so a
 * new staff category ALWAYS generates its live section.
 */
function StaffGridSection({
  id,
  title,
  sub,
  members,
  alt = false,
}: {
  id: string;
  title: string;
  sub: string;
  members: (StaffMember & { photoScale?: number })[];
  alt?: boolean;
}) {
  if (members.length === 0) return null;
  return (
    <section className={`${alt ? "bg-surface-2" : "bg-surface"} py-20 md:py-24`}>
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <SectionHeader
          id={id}
          title={title}
          sub={sub}
        />

        <div data-structured-content className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m, i) => (
            <Reveal key={m.id} delay={(i % 3) * 90} className="h-full">
              <div
                className={`group relative flex h-full items-start gap-5 rounded-2xl border border-fg/10 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-fg/25 hover:shadow-soft ${
                  alt ? "bg-surface" : "bg-surface-2"
                }`}
              >
                {m.isNew && <NewBadge className="absolute right-5 top-5 z-10" />}
                <StaffAvatar member={m} small />
                <div className="min-w-0">
                  <p className="font-sans text-[9px] uppercase tracking-[0.28em] text-fg/40">
                    {m.department}
                  </p>
                  <h3 className="mt-1.5 font-display text-xl font-semibold tracking-[-0.01em]">
                    {m.name}
                  </h3>
                  <p className="mt-1 text-[13.5px] font-medium text-fg/70">
                    {m.role}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-fg/50">
                    {m.qualification}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function StaffPage() {
  await ensureSeed();

  const members = await db.select().from(staff).orderBy(asc(staff.sortOrder));

  const principal = members.find((m) => m.featured);

  /* v2.8.93.0 — sections are built FROM the data, not a hard-coded list
     (worklog Task 97, E11). The leadership group survives renames
     ("Leadership" → "Leaderships") by following the featured principal's
     own department plus any leader* department; every other department
     outside the designed groups gets its own live section automatically. */
  const leadershipDepts = new Set<string>();
  if (principal) leadershipDepts.add(principal.department.trim());
  for (const m of members) {
    const dept = m.department.trim();
    if (dept && /^leader/i.test(dept)) leadershipDepts.add(dept);
  }

  const leadership = members.filter(
    (m) => leadershipDepts.has(m.department.trim()) && !m.featured,
  );
  const academic = members.filter((m) =>
    [
      "Science & ICT",
      "Mathematics",
      "Languages & Humanities",
      "Commerce",
      "Junior School",
    ].includes(m.department),
  );
  const sports = members.filter((m) => m.department === "Sports & Cadeting");
  const arts = members.filter((m) => m.department === "Arts & Culture");

  const grouped = new Set<string>([
    ...leadershipDepts,
    "Science & ICT",
    "Mathematics",
    "Languages & Humanities",
    "Commerce",
    "Junior School",
    "Sports & Cadeting",
    "Arts & Culture",
  ]);
  const extras = [
    ...new Set(
      members
        .map((m) => m.department.trim())
        .filter((dept) => dept && !grouped.has(dept)),
    ),
  ].map((dept) => ({
    dept,
    members: members.filter((m) => m.department.trim() === dept),
  }));

  const anchorList = [
    ...(principal || leadership.length
      ? [{ label: "Leadership", href: "#leadership" }]
      : []),
    ...(academic.length ? [{ label: "Academic Faculty", href: "#faculty" }] : []),
    ...(sports.length ? [{ label: "Sports & Cadeting", href: "#sports" }] : []),
    ...(arts.length ? [{ label: "Arts & Culture", href: "#arts" }] : []),
    ...extras.map((e) => ({
      label: e.dept,
      href: `#dept-${deptSlug(e.dept)}`,
    })),
  ];

  return (
    <main className="relative bg-surface text-fg">
      <Navbar />
      <VisualBlockSections path="/staff" position="top" />

      {/* Hero */}
      <section className="relative flex min-h-[58svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src="/images/clubs.jpg"
          alt="Staff of St. Thomas' College in the common room"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-ink/70" />
        <div className="grain absolute inset-0" />

        <div className="relative mx-auto w-full max-w-7xl px-5 pb-16 pt-32 md:px-8 md:pb-20">
          <div className="animate-fade-up flex items-center gap-4">
            <span className="h-px w-12 bg-gold" />
            <p className="font-sans text-[11px] uppercase tracking-[0.4em] text-white/70">
              The Faculty
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            Our Staff<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-white/65"
            style={{ animationDelay: "280ms" }}
          >
            One hundred and forty educators, coaches and specialists — each
            chosen for two things: mastery of their craft, and the patience
            to teach it kindly.
          </p>

          {/* 2 × 2 on mobile / tablet, single row from md up */}
          <div
            className="animate-fade-up mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/15 pt-5 sm:mt-10 sm:gap-x-10 sm:pt-6 md:grid-cols-4"
            style={{ animationDelay: "400ms" }}
          >
            {[
              { value: "140", label: "Dedicated Educators" },
              { value: members.length, label: "Senior Faculty Listed" },
              { value: "85%", label: "Postgraduate Qualified" },
              { value: "1:14", label: "Teacher–Student Ratio" },
            ].map((s, i) => (
              <div key={s.label} className="min-w-0">
                <p className="break-words font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                  <CountUp value={s.value} delay={i * 110} />
                </p>
                <p className="mt-1 break-words font-sans text-[8px] uppercase leading-relaxed tracking-[0.2em] text-white/45 sm:text-[9px] sm:tracking-[0.28em]">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Anchor pills */}
      {anchorList.length > 0 && (
        <section className="border-b border-fg/10 bg-surface">
          <div className="mx-auto flex max-w-7xl flex-wrap gap-2.5 px-5 py-6 md:px-8">
            {anchorList.map((a) => (
              <a
                key={a.href}
                href={a.href}
                className="rounded-full border border-fg/15 px-5 py-2.5 font-sans text-[10px] uppercase tracking-[0.22em] text-fg/60 transition-colors duration-300 hover:border-fg hover:text-fg"
              >
                {a.label}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Leadership — rename-proof: follows the featured principal's own
          department (plus any leader* department), renders only when the
          college actually has leadership to show. */}
      {(principal || leadership.length > 0) && (
        <section className="bg-surface py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <SectionHeader
              id="leadership"
              title="Leadership"
              sub={`${(principal ? 1 : 0) + leadership.length} senior officers`}
            />

            <div data-structured-content className="mt-10 grid gap-7 lg:grid-cols-[1.35fr_1fr]">
              {/* Principal featured card */}
              {principal && (
                <Reveal delay={80}>
                  <Link
                    href="/principals-message"
                    className="group relative block overflow-hidden rounded-2xl bg-card text-white"
                  >
                    <Image
                      src={principal.image || "/images/principal.jpg"}
                      alt={principal.name}
                      width={1200}
                      height={900}
                      className="aspect-[16/13] w-full object-cover transition-transform duration-[1.4s] ease-out group-hover:scale-[1.04]"
                    />
                    <div className="absolute inset-0 bg-ink/45 transition-colors duration-500 group-hover:bg-ink/55" />
                    <div className="absolute inset-x-6 bottom-6 md:inset-x-8 md:bottom-8">
                      <p className="font-sans text-[9.5px] uppercase tracking-[0.32em] text-gold">
                        {principal.role}
                      </p>
                      <h3 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] md:text-4xl">
                        {principal.name}
                      </h3>
                      <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-white/65">
                        {principal.qualification}
                      </p>
                      <span className="mt-5 inline-flex items-center gap-2.5 rounded-full bg-gold px-5 py-2.5 text-[12px] font-medium text-ink transition-colors duration-300 group-hover:bg-white">
                        Read the Principal&apos;s Message
                        <ArrowRight size={14} className="slide-arrow" />
                      </span>
                    </div>
                  </Link>
                </Reveal>
              )}

              {/* Deputy principals */}
              {leadership.length > 0 && (
                <div className="grid gap-7">
                  {leadership.map((m, i) => (
                    <Reveal key={m.id} delay={120 + i * 90} className="h-full">
                      <div className="group relative flex h-full items-center gap-5 overflow-hidden rounded-2xl bg-card p-3 pr-7 text-white transition-all duration-500 hover:-translate-y-1 hover:shadow-lift">
                        {m.isNew && <NewBadge className="absolute right-4 top-4 z-10" />}
                        <div className="relative h-32 w-28 shrink-0 overflow-hidden rounded-xl bg-ink sm:h-36 sm:w-32">
                          <Image
                            src={m.image || DEPUTY_PHOTO[i % DEPUTY_PHOTO.length]}
                            alt={m.name}
                            fill
                            sizes="140px"
                            className="object-cover object-top transition-transform duration-[1.2s] ease-out group-hover:scale-[1.06]"
                          />
                        </div>
                        <div className="min-w-0 flex-1 py-2">
                          <h3 className="font-display text-xl font-semibold tracking-[-0.01em]">
                            {m.name}
                          </h3>
                          <p className="mt-1 font-sans text-[9.5px] uppercase tracking-[0.24em] text-gold">
                            {m.role}
                          </p>
                          <span className="mb-3 mt-3 block h-px w-7 bg-gold" />
                          <p className="text-[13px] text-white/55">
                            {m.qualification}
                          </p>
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Academic Faculty */}
      <StaffGridSection
        id="faculty"
        title="Academic Faculty"
        sub={`${academic.length} heads of department & senior teachers`}
        members={academic}
        alt
      />

      {/* Sports & Cadeting */}
      <StaffGridSection
        id="sports"
        title="Sports & Cadeting"
        sub={`${sports.length} coaches & officers`}
        members={sports}
      />

      {/* Arts & Culture */}
      <StaffGridSection
        id="arts"
        title="Arts & Culture"
        sub={`${arts.length} directors & mentors`}
        members={arts}
        alt
      />

      {/* v2.8.93.0 — every department added beyond the designed groups
          gets its own section, alternating surfaces, before the CTA. */}
      {extras.map((e, i) => (
        <StaffGridSection
          key={e.dept}
          id={`dept-${deptSlug(e.dept)}`}
          title={e.dept}
          sub={`${e.members.length} staff members`}
          members={e.members}
          alt={i % 2 === 1}
        />
      ))}

      {/* Careers CTA */}
      <section className="bg-surface pb-20 md:pb-24">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal delay={120}>
            <div className="flex flex-col items-start justify-between gap-8 rounded-2xl bg-card p-8 text-white md:flex-row md:items-center md:p-12">
              <div className="flex items-start gap-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold text-ink">
                  <GraduationCap size={22} />
                </span>
                <div>
                  <h3 className="font-display text-2xl font-semibold tracking-[-0.01em]">
                    Teach at the College
                  </h3>
                  <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-white/60">
                    We welcome applications from passionate educators year-round.
                    Write to the Principal&apos;s Secretariat with your curriculum
                    vitae.
                  </p>
                </div>
              </div>
              <a
                href="mailto:principal@stcmatale.lk"
                className="inline-flex shrink-0 items-center gap-2.5 rounded-full bg-gold px-7 py-3.5 text-[13px] font-medium text-ink transition-colors duration-300 hover:bg-white"
              >
                <Mail size={15} />
                principal@stcmatale.lk
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <VisualBlockSections path="/staff" position="bottom" />
      <Footer />
    </main>
  );
}
