import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  Clock,
  Download,
  FileText,
  GraduationCap,
  MapPin,
  Star,
  Users,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { NewBadge } from "@/components/new-badge";
import { EditableSection } from "@/components/cms/editable-section";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";
import { LiveSiteEditor } from "@/components/admin/live-site-editor";
import { getAdminSession } from "@/lib/admin-auth";
import { getCmsPage } from "@/lib/cms";
import { getCmsPageDefinition } from "@/lib/cms-defaults";
import { getStreamClasses, getStreamTeachers } from "@/lib/site-lists";
import { STREAMS, getStream } from "@/lib/streams";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const stream = getStream(slug);
  if (!stream) return { title: "Stream not found — St. Thomas' College" };
  return {
    title: `${stream.name} — Advanced Level · St. Thomas' College, Matale`,
    description: stream.about[0],
  };
}

export default async function StreamPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    cmsPreview?: string;
    cmsEditor?: string;
    visualEditor?: string;
    edit?: string;
  }>;
}) {
  const { slug } = await params;
  const stream = getStream(slug);
  if (!stream) notFound();

  const { cmsPreview, cmsEditor, edit } = await searchParams;
  const session = await getAdminSession();
  const preview = cmsPreview === "1" && Boolean(session);
  // Only cmsEditor=1 opens the section editor (with its list "Add" buttons);
  // visualEditor=1 is the pure element-level visual editor.
  const editor = cmsEditor === "1" && Boolean(session);
  const draftMode = preview || editor;
  const editable = draftMode && edit === "1";

  const [teachers, classes] = await Promise.all([
    getStreamTeachers(slug),
    getStreamClasses(slug),
  ]);

  const cmsPage = draftMode
    ? await getCmsPage(`advanced-level-${slug}`, "draft")
    : null;
  const cmsDefinition = getCmsPageDefinition(`advanced-level-${slug}`);
  const cmsSection = (key: string) =>
    cmsPage?.sections.find((item) => item.key === key);

  const others = STREAMS.filter((s) => s.slug !== stream.slug);

  return (
    <main className="relative overflow-x-clip bg-surface text-fg">
      <Navbar />
      <VisualBlockSections path={`/advanced-level/${slug}`} position="top" />

      {/* Hero */}
      <section className="relative flex min-h-[680px] items-end overflow-hidden bg-ink text-white sm:min-h-[620px] md:min-h-[62svh]">
        <Image
          src={stream.building.image}
          alt={stream.building.name}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-ink/75" />
        <div className="grain absolute inset-0" />

        <div className="relative mx-auto w-full max-w-7xl px-4 pb-12 pt-28 sm:px-5 sm:pb-16 sm:pt-32 md:px-8 md:pb-20">
          <Link
            href="/advanced-level"
            className="animate-fade-up group inline-flex items-center gap-2.5 font-sans text-[9px] uppercase tracking-[0.2em] text-white/60 transition-colors hover:text-gold sm:text-[10px] sm:tracking-[0.25em]"
          >
            <ArrowLeft
              size={14}
              className="transition-transform duration-300 group-hover:-translate-x-1"
            />
            All A/L Streams
          </Link>

          <p
            className="animate-fade-up mt-6 max-w-full break-words font-sans text-[9px] uppercase leading-[1.7] tracking-[0.2em] text-gold sm:mt-7 sm:text-[10px] sm:tracking-[0.3em] md:text-[11px] md:tracking-[0.4em]"
            style={{ animationDelay: "120ms" }}
          >
            {stream.tagline}
          </p>
          <h1
            className="animate-fade-up mt-4 max-w-4xl break-words font-display text-[clamp(2.15rem,11vw,4.6rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "200ms" }}
          >
            {stream.name}
            <span className="text-gold">.</span>
          </h1>

          <div
            className="animate-fade-up mt-8 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-white/15 pt-5 sm:mt-10 sm:gap-x-8 sm:pt-6 md:grid-cols-4"
            style={{ animationDelay: "320ms" }}
          >
            {stream.stats.map((s) => (
              <div key={s.label} className="min-w-0">
                <p className="font-display text-xl font-semibold tracking-[-0.02em] sm:text-2xl md:text-3xl">
                  {s.value}
                </p>
                <p className="mt-1 break-words font-sans text-[7.5px] uppercase leading-relaxed tracking-[0.15em] text-white/50 sm:text-[8.5px] sm:tracking-[0.24em]">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About + subjects */}
      <section className="bg-surface py-16 sm:py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
            <div>
              <Reveal>
                <Eyebrow>About the Stream</Eyebrow>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-7 font-display text-3xl font-semibold leading-[1.15] tracking-[-0.02em] md:text-4xl">
                  What {stream.name} means at St. Thomas&apos;
                </h2>
              </Reveal>
              <div className="mt-7 space-y-5">
                {stream.about.map((p, i) => (
                  <Reveal key={i} delay={180 + i * 70}>
                    <p className="text-[15px] leading-[1.85] text-fg/65">{p}</p>
                  </Reveal>
                ))}
              </div>
            </div>

            {/* Subjects */}
            <div>
              <Reveal delay={100}>
                <Eyebrow>Subjects Offered</Eyebrow>
              </Reveal>
              <div className="mt-7 space-y-4">
                {stream.subjects.map((sub, i) => (
                  <Reveal key={sub.name} delay={140 + i * 90}>
                    <div className="rounded-xl border border-fg/10 bg-surface-2 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/50">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-display text-xl font-semibold tracking-[-0.01em]">
                          {sub.name}
                        </h3>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-fg/15 px-3 py-1 font-sans text-[9px] uppercase tracking-[0.18em] text-fg/55">
                          <Clock size={11} className="text-gold" />
                          {sub.periods}
                        </span>
                      </div>
                      <p className="mt-2.5 text-[13.5px] leading-relaxed text-fg/60">
                        {sub.detail}
                      </p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* University pathways */}
      <section className="bg-surface-2 py-16 sm:py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <Reveal>
            <Eyebrow>University Pathways</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-2xl font-display text-3xl font-semibold leading-[1.12] sm:text-4xl tracking-[-0.02em] md:text-5xl">
              Where this stream{" "}
              <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                leads
              </span>
            </h2>
          </Reveal>
          <Reveal delay={170}>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fg/55">
              Courses our students have entered, with the most recent district
              cut-off Z-scores. Highlighted courses are the stream&apos;s
              flagship pathways.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {stream.courses.map((c, i) => (
              <Reveal key={c.course} delay={(i % 2) * 90} className="h-full">
                <div
                  className={`group flex h-full flex-col rounded-xl border p-6 transition-all duration-300 hover:-translate-y-1 ${
                    c.highlight
                      ? "border-gold/60 bg-card text-white shadow-lift"
                      : "border-fg/10 bg-surface hover:border-fg/30"
                  }`}
                >
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
                    <p
                      className={`break-words font-sans text-[8.5px] uppercase leading-relaxed tracking-[0.18em] sm:text-[9px] sm:tracking-[0.24em] ${
                        c.highlight ? "text-gold" : "text-fg/45"
                      }`}
                    >
                      {c.university}
                    </p>
                    {c.highlight && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold px-2.5 py-1 font-sans text-[8px] uppercase tracking-[0.16em] text-ink">
                        <Star size={9} className="fill-current" />
                        Flagship
                      </span>
                    )}
                  </div>
                  <h3
                    className={`mt-3 break-words font-display text-lg font-semibold leading-snug tracking-[-0.01em] sm:text-xl ${
                      c.highlight ? "text-white" : ""
                    }`}
                  >
                    {c.course}
                  </h3>
                  <p
                    className={`mt-2 text-[13px] leading-relaxed ${
                      c.highlight ? "text-white/60" : "text-fg/55"
                    }`}
                  >
                    {c.faculty}
                  </p>
                  <div
                    className={`mt-5 flex items-center gap-2 border-t pt-4 font-sans text-[10px] uppercase tracking-[0.2em] ${
                      c.highlight
                        ? "border-white/15 text-gold"
                        : "border-fg/10 text-fg/50"
                    }`}
                  >
                    <GraduationCap size={13} />
                    <span data-trend-row>
                      Cut-off · <span>{c.zScore}</span>
                    </span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Teachers */}
      <div>
      <EditableSection sectionKey="teachers" label="Teaching Panel" preview={draftMode} editable={editable} hidden={cmsSection("teachers")?.hidden}>
      <section className="bg-surface py-16 sm:py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <Reveal>
            <Eyebrow>The Teaching Panel</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 font-display text-3xl font-semibold leading-[1.12] sm:text-4xl tracking-[-0.02em] md:text-5xl">
              Who teaches this stream
            </h2>
          </Reveal>

          <div className="mt-9 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {teachers.map((t, i) => (
              <Reveal key={t.id} delay={(i % 4) * 90} className="h-full">
                <div className="group flex h-full min-w-0 overflow-hidden rounded-xl bg-card text-white transition-all duration-500 hover:-translate-y-1 hover:shadow-lift sm:flex-col">
                  <div className="relative m-2.5 mr-0 h-32 w-24 shrink-0 overflow-hidden rounded-[0.75rem] bg-ink sm:mb-0 sm:mr-2.5 sm:h-auto sm:w-auto sm:aspect-[4/5]">
                    <Image
                      src={t.image}
                      alt={t.name}
                      fill
                      sizes="(max-width: 639px) 96px, (max-width: 1023px) 50vw, 25vw"
                      className="object-cover object-top transition-transform duration-[1.2s] ease-out group-hover:scale-[1.06]"
                    />
                    {t.isNew && <NewBadge className="absolute right-2 top-2" />}
                    <span className="absolute bottom-2 left-2 rounded-full bg-ink/85 px-2 py-1 font-sans text-[7px] uppercase tracking-[0.14em] text-gold sm:bottom-auto sm:left-3 sm:top-3 sm:px-3 sm:py-1.5 sm:text-[8px] sm:tracking-[0.2em]">
                      {t.subject}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center p-4 sm:justify-start sm:p-6">
                    <h3 className="break-words font-display text-base font-semibold leading-tight tracking-[-0.01em] sm:text-lg">
                      {t.name}
                    </h3>
                    <p className="mt-1 break-words font-sans text-[8px] uppercase leading-relaxed tracking-[0.15em] text-gold sm:text-[9px] sm:tracking-[0.2em]">
                      {t.role}
                    </p>
                    <span className="mb-2.5 mt-2.5 block h-px w-7 bg-gold sm:mb-3 sm:mt-3" />
                    <p className="text-[11.5px] leading-relaxed text-white/60 sm:text-[12.5px]">
                      {t.qualification}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      </EditableSection>
      </div>

      {/* Classes */}
      <div>
      <EditableSection sectionKey="classes" label="Class Structure" preview={draftMode} editable={editable} hidden={cmsSection("classes")?.hidden}>
      <section className="bg-surface-2 py-16 sm:py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <Reveal>
            <Eyebrow>Class Structure</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 font-display text-3xl font-semibold leading-[1.12] sm:text-4xl tracking-[-0.02em] md:text-5xl">
              Classes in this stream
            </h2>
          </Reveal>
          <Reveal delay={170}>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-fg/55">
              {stream.intake} — each class with its own class teacher and
              dedicated room.
            </p>
          </Reveal>

          <div className="mt-12 overflow-hidden rounded-xl border border-fg/10">
            <div className="grid grid-cols-[70px_1fr_1fr_1fr] gap-px bg-fg/10 font-sans text-[9px] uppercase tracking-[0.22em] max-md:hidden">
              <div className="bg-surface px-5 py-4 text-fg/50">Class</div>
              <div className="bg-surface px-5 py-4 text-fg/50">Grade</div>
              <div className="bg-surface px-5 py-4 text-fg/50">
                Class Teacher
              </div>
              <div className="bg-surface px-5 py-4 text-fg/50">Room</div>
            </div>
            {classes.map((c, i) => (
              <div
                key={c.id}
                className={`grid min-w-0 gap-2.5 bg-surface px-4 py-5 transition-colors hover:bg-surface-2 sm:px-5 md:grid-cols-[70px_1fr_1fr_1fr] md:items-center md:gap-2 ${
                  i !== 0 ? "border-t border-fg/10" : ""
                }`}
              >
                <span className="inline-flex w-fit items-center rounded-full bg-gold px-3 py-1 font-display text-sm font-semibold text-ink">
                  {c.code}
                </span>
                <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 font-display text-base font-semibold tracking-[-0.01em] md:block">
                  <span>{c.grade}</span>
                  <span className="font-sans text-[11px] font-normal text-fg/45 md:ml-2">
                    {c.strength}
                  </span>
                </p>
                <p className="flex min-w-0 items-start gap-2 text-[13px] leading-relaxed text-fg/65 sm:text-[13.5px]">
                  <Users size={13} className="mt-1 shrink-0 text-gold" />
                  <span className="break-words">{c.classTeacher}</span>
                </p>
                <p className="flex min-w-0 items-start gap-2 text-[12.5px] leading-relaxed text-fg/55 sm:text-[13px]">
                  <MapPin size={13} className="mt-1 shrink-0 text-gold" />
                  <span className="break-words">{c.room}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
      </EditableSection>
      </div>

      {/* Building */}
      <section className="bg-surface py-16 sm:py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
            <Reveal>
              <div className="overflow-hidden rounded-2xl bg-ink">
                <Image
                  src={stream.building.image}
                  alt={stream.building.name}
                  width={1200}
                  height={800}
                  className="aspect-[4/3] w-full object-cover transition-transform duration-[1.4s] ease-out hover:scale-[1.04]"
                />
              </div>
            </Reveal>

            <div>
              <Reveal delay={100}>
                <Eyebrow>Where We Teach</Eyebrow>
              </Reveal>
              <Reveal delay={150}>
                <h2 className="mt-7 font-display text-3xl font-semibold leading-[1.12] tracking-[-0.02em] md:text-4xl">
                  <Building2 size={26} className="mb-3 text-gold" />
                  {stream.building.name}
                </h2>
              </Reveal>
              <Reveal delay={200}>
                <p className="mt-5 text-[15px] leading-relaxed text-fg/60">
                  {stream.building.caption}
                </p>
              </Reveal>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {stream.building.facilities.map((f, i) => (
                  <Reveal key={f} delay={240 + i * 60}>
                    <div className="flex items-center gap-3 rounded-xl border border-fg/10 px-4 py-3.5 transition-colors hover:border-gold/50">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                      <p className="text-[13.5px] font-medium">{f}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Resources + downloads */}
      <section className="bg-surface-2 py-16 sm:py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <Reveal>
            <Eyebrow>Learning Resources</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-2xl font-display text-3xl font-semibold leading-[1.12] sm:text-4xl tracking-[-0.02em] md:text-5xl">
              Resources &amp; downloads
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14">
            {/* Subject resources */}
            <div className="space-y-5">
              {stream.resources.map((r, i) => (
                <Reveal key={r.subject} delay={i * 90}>
                  <div className="rounded-xl border border-fg/10 bg-surface p-7">
                    <p className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-[-0.01em]">
                      <BookOpen size={17} className="text-gold" />
                      {r.subject}
                    </p>
                    <ul className="mt-4 space-y-2.5">
                      {r.items.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-3 text-[13.5px] leading-relaxed text-fg/60"
                        >
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* Downloads */}
            <div>
              <Reveal>
                <div className="rounded-xl bg-card p-7 text-white md:p-8">
                  <p className="flex items-center gap-2.5 font-sans text-[10px] uppercase tracking-[0.3em] text-gold">
                    <Download size={14} />
                    Online Resources
                  </p>
                  <h3 className="mt-4 font-display text-2xl font-semibold tracking-[-0.01em]">
                    Download Centre
                  </h3>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/55">
                    Syllabus guides, workbooks and past paper packs for this
                    stream. Request access through the academic office.
                  </p>

                  <div className="mt-7 space-y-3">
                    {stream.downloads.map((d) => (
                      <Link
                        key={d.title}
                        href={d.href}
                        className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/12 px-3.5 py-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold hover:bg-white/5 sm:gap-4 sm:px-4"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-gold transition-colors duration-300 group-hover:bg-gold group-hover:text-ink">
                          <FileText size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-[12.5px] font-medium leading-snug sm:text-[13.5px]">
                            {d.title}
                          </span>
                          <span className="mt-1 block font-sans text-[8px] uppercase tracking-[0.14em] text-white/45 sm:text-[9px] sm:tracking-[0.18em]">
                            {d.type} · {d.size}
                          </span>
                        </span>
                        <Download
                          size={14}
                          className="shrink-0 text-white/35 transition-colors duration-300 group-hover:text-gold"
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* Other streams + CTA */}
      <section className="bg-surface py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <Reveal>
            <Eyebrow>Other Streams</Eyebrow>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((o, i) => (
              <Reveal key={o.slug} delay={i * 80} className="h-full">
                <Link
                  href={`/advanced-level/${o.slug}`}
                  className="group flex h-full min-w-0 items-center gap-3 rounded-xl border border-fg/10 bg-surface p-4 transition-all duration-300 hover:-translate-y-1 hover:border-gold sm:gap-4 sm:p-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-display text-[15px] font-semibold leading-snug tracking-[-0.01em] sm:text-base">
                      {o.name}
                    </p>
                    <p className="mt-1 break-words font-sans text-[8px] uppercase leading-relaxed tracking-[0.16em] text-fg/45 sm:text-[9px] sm:tracking-[0.2em]">
                      {o.intake}
                    </p>
                  </div>
                  <ArrowRight
                    size={15}
                    className="slide-arrow shrink-0 text-fg/40"
                  />
                </Link>
              </Reveal>
            ))}
          </div>

          <Reveal delay={140}>
            <div className="mt-10 flex flex-col items-start justify-between gap-6 rounded-2xl bg-card p-6 text-white sm:mt-12 sm:p-8 md:flex-row md:items-center md:p-10">
              <div className="min-w-0">
                <h3 className="break-words font-display text-xl font-semibold leading-snug tracking-[-0.01em] sm:text-2xl">
                  Considering {stream.name}?
                </h3>
                <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-white/60 sm:text-[14.5px]">
                  Speak with the academic office about stream selection,
                  entry requirements and the diagnostic term.
                </p>
              </div>
              <Link
                href="/contact?type=Academic"
                className="inline-flex w-full shrink-0 items-center justify-center gap-2.5 rounded-full bg-gold px-5 py-3.5 text-center text-[12px] font-medium text-ink transition-colors duration-300 hover:bg-white sm:w-auto sm:px-7 sm:text-[13px]"
              >
                Contact the Academic Office
                <ArrowRight size={15} className="slide-arrow shrink-0" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Reusable component blocks (Framer-style library) — draft-aware */}
      <VisualBlockSections path={`/advanced-level/${slug}`} position="bottom" />

      <Footer />

      {editor && cmsPage && cmsDefinition && (
        <LiveSiteEditor initialPage={cmsPage} definition={cmsDefinition} />
      )}
    </main>
  );
}
