import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  Landmark,
  Microscope,
  Palette,
  TrendingUp,
  Users,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";

export const metadata = {
  title: "Advanced Level — St. Thomas' College",
  description:
    "G.C.E. Advanced Level streams at St. Thomas' College: Biological Science, Physical Science, Commerce and Arts.",
};

const streams = [
  {
    icon: Microscope,
    slug: "biological-science",
    name: "Biological Science",
    subjects: ["Biology", "Chemistry", "Physics / Agro-Science"],
    detail:
      "A direct pathway to medicine, veterinary science and bio-medical research, taught in our dedicated life-science wing with weekly practicals.",
    intake: "2 classes · 60 students",
  },
  {
    icon: TrendingUp,
    slug: "physical-science",
    name: "Physical Science",
    subjects: ["Combined Mathematics", "Physics", "Chemistry / ICT"],
    detail:
      "The cohort behind our island-first mathematics results and robotics championships — engineering, data science and architecture begin here.",
    intake: "3 classes · 90 students",
  },
  {
    icon: Landmark,
    slug: "commerce",
    name: "Commerce",
    subjects: ["Accounting", "Business Studies", "Economics"],
    detail:
      "Taught by chartered accountants and MBAs, with an annual student market and audit simulation that has produced national rankers since 2009.",
    intake: "2 classes · 60 students",
  },
  {
    icon: Palette,
    slug: "arts",
    name: "Arts",
    subjects: ["History", "Political Science", "English / Sinhala Literature"],
    detail:
      "Our smallest and most intimate stream — law, diplomacy, journalism and academia. Two island ranks in a single year, and counting.",
    intake: "1 class · 30 students",
  },
];

const features = [
  {
    icon: Users,
    title: "One Mentor, Eight Students",
    text: "Every A/L student is assigned a subject-trained mentor who reviews progress fortnightly — no student revises alone.",
  },
  {
    icon: BookOpen,
    title: "Research Modules",
    text: "From Grade 12, each student completes a supervised research project — the training behind our all-island science fair titles.",
  },
  {
    icon: GraduationCap,
    title: "University Counselling",
    text: "Eleven local and overseas universities visit each year. Counsellors guide applications to Oxbridge, NUS, Melbourne and beyond.",
  },
];

const resultStrip = [
  { value: "98%", label: "University Qualified" },
  { value: "41", label: "Three-A Results" },
  { value: "14", label: "Island Ranks" },
  { value: "3", label: "Island Firsts" },
];

export default function AdvancedLevelPage() {
  return (
    <main className="relative bg-surface text-fg">
      <Navbar />

      {/* Hero */}
      <section className="relative flex min-h-[58svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src="/images/senior-school.jpg"
          alt="Advanced Level students in the chemistry laboratory"
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
              Grades 12 – 13 · G.C.E. Advanced Level
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            Advanced Level<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-white/65"
            style={{ animationDelay: "280ms" }}
          >
            Two years that carry our graduates to the finest universities in
            the island — and across the world.
          </p>
        </div>
      </section>

      {/* Streams */}
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <Eyebrow>Four Streams</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-2xl font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
              A/L Subject{" "}
              <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                Streams
              </span>
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {streams.map((s, i) => {
              const Icon = s.icon;
              return (
                <Reveal key={s.name} delay={i * 100} className="h-full">
                  <div className="flex h-full min-w-0 flex-col rounded-2xl bg-card p-6 text-white transition-all duration-500 hover:-translate-y-1.5 hover:shadow-lift sm:p-8 md:p-9">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold text-ink sm:h-12 sm:w-12">
                        <Icon size={21} />
                      </span>
                      <span className="max-w-full rounded-full border border-white/15 px-3 py-1.5 text-right font-sans text-[8px] uppercase leading-relaxed tracking-[0.16em] text-mist sm:px-3.5 sm:text-[9px] sm:tracking-[0.22em]">
                        {s.intake}
                      </span>
                    </div>
                    <h3 className="mt-5 break-words font-display text-2xl font-semibold leading-tight tracking-[-0.02em] sm:mt-6 sm:text-3xl">
                      {s.name}
                    </h3>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {s.subjects.map((sub) => (
                        <span
                          key={sub}
                          className="rounded-full bg-white/10 px-3.5 py-1.5 text-[12px] text-white/75"
                        >
                          {sub}
                        </span>
                      ))}
                    </div>
                    <p className="mt-5 flex-1 text-[14.5px] leading-relaxed text-white/60">
                      {s.detail}
                    </p>

                    <Link
                      href={`/advanced-level/${s.slug}`}
                      className="group/btn mt-7 inline-flex max-w-full items-center justify-center gap-2.5 self-start rounded-full bg-gold px-5 py-3 text-center text-[12px] font-medium leading-snug text-ink transition-colors duration-300 hover:bg-white sm:px-6 sm:text-[13px]"
                    >
                      <span className="break-words">Explore {s.name}</span>
                      <ArrowRight size={15} className="slide-arrow shrink-0" />
                    </Link>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-surface-2 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_2fr] lg:items-start">
            <div>
              <Reveal>
                <Eyebrow>The Thomian Method</Eyebrow>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                  Student-Centred Guidance
                </h2>
              </Reveal>
              <Reveal delay={200}>
                <p className="mt-6 max-w-md text-[15px] leading-relaxed text-fg/60">
                  Stream choice in Grade 11 is followed by a diagnostic term —
                  if a student is better suited elsewhere, we move them early,
                  never late.
                </p>
              </Reveal>
            </div>

            <div className="space-y-5">
              {features.map((f, i) => {
                const Icon = f.icon;
                return (
                  <Reveal key={f.title} delay={i * 100}>
                    <div className="group flex gap-6 rounded-2xl border border-fg/10 bg-surface p-7 transition-all duration-300 hover:-translate-y-1 hover:border-fg/25 md:p-8">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fg text-surface">
                        <Icon size={18} />
                      </span>
                      <div>
                        <h3 className="font-display text-2xl font-semibold tracking-[-0.01em]">
                          {f.title}
                        </h3>
                        <p className="mt-2.5 text-[15px] leading-relaxed text-fg/60">
                          {f.text}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Results strip + CTA */}
      <section className="bg-surface py-20 md:py-24">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <Eyebrow>2026 Advanced Level</Eyebrow>
          </Reveal>
          <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {resultStrip.map((s, i) => (
              <Reveal key={s.label} delay={i * 100} className="h-full">
                <div className="h-full rounded-2xl bg-card p-7 transition-all duration-500 hover:-translate-y-1">
                  <p className="font-display text-4xl font-semibold tracking-[-0.03em] text-white lg:text-5xl">
                    {s.value}
                  </p>
                  <span className="mb-3 mt-6 block h-px w-7 bg-gold" />
                  <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-white/50">
                    {s.label}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={140}>
            <div className="mt-14 flex flex-col items-start justify-between gap-8 rounded-2xl bg-card p-8 text-white md:flex-row md:items-center md:p-12">
              <div>
                <h3 className="font-display text-2xl font-semibold tracking-[-0.01em]">
                  Join the Grade 12 cohort of 2027
                </h3>
                <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-white/60">
                  Art-stream applicants and stream transfers are interviewed
                  individually. Applications close with the O/L results release.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/exam-results"
                  className="inline-flex items-center gap-2.5 rounded-full border border-white/20 px-6 py-3.5 text-[13px] font-medium text-white transition-colors hover:border-white hover:bg-white hover:text-ink"
                >
                  View Exam Results
                </Link>
                <Link
                  href="/admissions"
                  className="inline-flex items-center gap-2.5 rounded-full bg-gold px-6 py-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-white"
                >
                  Apply Now
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <VisualBlockSections path="/advanced-level" />
      <Footer />
    </main>
  );
}
