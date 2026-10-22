import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookMarked,
  Clock,
  FolderOpen,
  GraduationCap,
  Users,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";
import {
  OL_BASKETS,
  OL_STATS,
  OL_SUBJECTS,
  OL_TIMELINE,
} from "@/lib/ol";

export const metadata = {
  title: "Ordinary Level — St. Thomas' College, Matale",
  description:
    "G.C.E. Ordinary Level at St. Thomas' College, Matale — Sinhala, Mathematics, English, Buddhism, Science and History, with free past papers for every medium.",
};

export default function OrdinaryLevelPage() {
  return (
    <main className="relative overflow-x-clip bg-surface text-fg">
      <Navbar />

      {/* Hero */}
      <section className="relative flex min-h-[600px] items-end overflow-hidden bg-ink text-white md:min-h-[60svh]">
        <Image
          src="/images/middle-school.jpg"
          alt="Ordinary Level students at St. Thomas' College, Matale"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-ink/74" />
        <div className="grain absolute inset-0" />

        <div className="relative mx-auto w-full max-w-7xl px-4 pb-12 pt-28 sm:px-5 sm:pb-16 sm:pt-32 md:px-8 md:pb-20">
          <div className="animate-fade-up flex items-center gap-3 sm:gap-4">
            <span className="h-px w-10 bg-gold sm:w-12" />
            <p className="font-sans text-[9px] uppercase tracking-[0.26em] text-white/70 sm:text-[11px] sm:tracking-[0.4em]">
              Grades 6 – 11 · G.C.E. Ordinary Level
            </p>
          </div>
          <h1
            className="animate-fade-up mt-6 max-w-4xl break-words font-display text-[clamp(2.15rem,10vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em] sm:mt-7"
            style={{ animationDelay: "140ms" }}
          >
            Ordinary Level<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-5 max-w-xl text-[15px] leading-relaxed text-white/65 sm:mt-6 sm:text-base"
            style={{ animationDelay: "280ms" }}
          >
            The foundation years of a Thomian education — six years that build
            the discipline, curiosity and character every student carries into
            the Advanced Level.
          </p>

          <div
            className="animate-fade-up mt-8 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-white/15 pt-5 sm:mt-10 sm:gap-x-8 sm:pt-6 md:grid-cols-4"
            style={{ animationDelay: "400ms" }}
          >
            {OL_STATS.map((s) => (
              <div key={s.label} className="min-w-0">
                <p className="break-words font-display text-lg font-semibold tracking-[-0.02em] sm:text-2xl md:text-3xl">
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

      {/* Main subjects */}
      <section className="bg-surface py-16 sm:py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <Reveal>
            <Eyebrow>The Core Six</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-2xl font-display text-3xl font-semibold leading-[1.12] tracking-[-0.02em] sm:text-4xl md:text-5xl">
              Main{" "}
              <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                O/L Subjects
              </span>
            </h2>
          </Reveal>
          <Reveal delay={170}>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fg/55">
              Every Thomian sits these six subjects, alongside three chosen
              from the subject baskets below.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
            {OL_SUBJECTS.map((s, i) => (
              <Reveal key={s.id} delay={(i % 3) * 90} className="h-full">
                <div className="group flex h-full min-w-0 flex-col rounded-xl border border-fg/10 bg-surface-2 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-gold/60 hover:shadow-lift">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words font-display text-2xl font-semibold tracking-[-0.01em]">
                        {s.name}
                      </h3>
                      <p className="mt-1 break-words text-[13px] text-fg/50">
                        {s.native}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-fg/15 px-3 py-1 font-sans text-[8px] uppercase tracking-[0.16em] text-fg/50">
                      {s.category}
                    </span>
                  </div>

                  <span className="mb-4 mt-4 block h-px w-8 bg-gold" />

                  <p className="flex-1 text-[13.5px] leading-relaxed text-fg/60">
                    {s.about}
                  </p>

                  <ul className="mt-5 space-y-2">
                    {s.topics.slice(0, 4).map((t) => (
                      <li
                        key={t}
                        className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-fg/55"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                        <span className="break-words">{t}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 space-y-2 border-t border-fg/10 pt-4">
                    <p className="flex items-start gap-2 text-[12px] text-fg/55">
                      <Users size={12} className="mt-0.5 shrink-0 text-gold" />
                      <span className="break-words">{s.teacher}</span>
                    </p>
                    <p className="flex items-center gap-2 text-[12px] text-fg/55">
                      <Clock size={12} className="shrink-0 text-gold" />
                      {s.periods}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Baskets */}
      <section className="bg-surface-2 py-16 sm:py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <Reveal>
            <Eyebrow>Subject Baskets</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-2xl font-display text-3xl font-semibold leading-[1.12] tracking-[-0.02em] sm:text-4xl md:text-5xl">
              Three more, chosen by the student
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:mt-12 md:grid-cols-3">
            {OL_BASKETS.map((b, i) => (
              <Reveal key={b.group} delay={i * 90} className="h-full">
                <div className="h-full min-w-0 rounded-xl bg-card p-6 text-white sm:p-7">
                  <p className="break-words font-sans text-[9px] uppercase tracking-[0.22em] text-gold">
                    {b.group}
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {b.subjects.map((s) => (
                      <li
                        key={s}
                        className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-white/70"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                        <span className="break-words">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Journey */}
      <section className="bg-surface py-16 sm:py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <Reveal>
            <Eyebrow>Grades 6 to 11</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-2xl font-display text-3xl font-semibold leading-[1.12] tracking-[-0.02em] sm:text-4xl md:text-5xl">
              The road to the examination
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {OL_TIMELINE.map((t, i) => (
              <Reveal key={t.grade} delay={(i % 4) * 90} className="h-full">
                <div className="flex h-full min-w-0 flex-col rounded-xl border border-fg/10 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-gold/60">
                  <span className="w-fit rounded-full bg-gold px-3 py-1 font-sans text-[9px] uppercase tracking-[0.16em] text-ink">
                    {t.grade}
                  </span>
                  <h3 className="mt-5 break-words font-display text-xl font-semibold leading-snug tracking-[-0.01em]">
                    {t.title}
                  </h3>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-fg/60">
                    {t.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Online resources CTA */}
      <section className="bg-surface-2 py-16 sm:py-20 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl bg-card p-7 text-white shadow-lift sm:p-10 md:p-12">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/10 blur-3xl"
              />
              <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
                <div className="min-w-0">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-gold text-ink">
                    <FolderOpen size={21} />
                  </span>
                  <h2 className="mt-6 break-words font-display text-2xl font-semibold leading-snug tracking-[-0.02em] sm:text-3xl md:text-4xl">
                    Online Resources
                  </h2>
                  <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-white/60 sm:text-[15px]">
                    Free O/L past papers from 2016 onwards, organised by
                    medium — Sinhala, Tamil and English. Browse by subject
                    and year, then download directly.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {["Sinhala Medium", "Tamil Medium", "English Medium"].map(
                      (m) => (
                        <span
                          key={m}
                          className="rounded-full border border-white/20 px-3.5 py-1.5 font-sans text-[9px] uppercase tracking-[0.16em] text-white/65"
                        >
                          {m}
                        </span>
                      ),
                    )}
                  </div>
                </div>

                <Link
                  href="/ordinary-level/past-papers"
                  className="group inline-flex w-full shrink-0 items-center justify-center gap-2.5 rounded-full bg-gold px-7 py-4 text-center text-[13px] font-medium text-ink transition-colors duration-300 hover:bg-white lg:w-auto"
                >
                  <BookMarked size={16} className="shrink-0" />
                  Online Resources
                  <ArrowRight size={15} className="slide-arrow shrink-0" />
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-6 flex flex-col items-start justify-between gap-5 rounded-xl border border-fg/10 p-6 sm:flex-row sm:items-center">
              <div className="flex items-start gap-4">
                <GraduationCap size={20} className="mt-0.5 shrink-0 text-gold" />
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-semibold tracking-[-0.01em]">
                    After the O/L — the Advanced Level
                  </h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-fg/55">
                    Explore the four A/L streams our O/L students progress to.
                  </p>
                </div>
              </div>
              <Link
                href="/advanced-level"
                className="inline-flex shrink-0 items-center gap-2.5 rounded-full border border-fg/15 px-6 py-3 text-[13px] font-medium text-fg transition-colors hover:border-fg hover:bg-fg hover:text-surface"
              >
                A/L Streams
                <ArrowRight size={14} className="slide-arrow" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <VisualBlockSections path="/ordinary-level" />
      <Footer />
    </main>
  );
}
