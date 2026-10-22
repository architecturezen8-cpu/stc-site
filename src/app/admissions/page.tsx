import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  FileText,
  GraduationCap,
  Info,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { AdmissionForm } from "@/components/admissions/admission-form";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";

export const metadata = {
  title: "Admissions — St. Thomas' College, Matale",
  description:
    "Apply for admission to St. Thomas' College, Matale — the 2027 Grade 6 intake and Advanced Level admissions for Grades 12 and 13.",
};

const STEPS = [
  {
    icon: FileText,
    title: "1 · Submit the application",
    text: "Complete the form below for either the Grade 6 intake or Advanced Level admission. You will receive a reference number immediately.",
  },
  {
    icon: CalendarDays,
    title: "2 · Verification visit",
    text: "The admissions office will call within five working days to arrange a visit, where original documents are verified.",
  },
  {
    icon: BadgeCheck,
    title: "3 · Placement test & offer",
    text: "Grade 6 applicants sit a placement test in March. A/L offers are made on O/L results and an interview with the stream heads.",
  },
];

const REQUIREMENTS = [
  "Birth certificate (original and a photocopy)",
  "Latest school report or O/L results sheet",
  "Transfer certificate from the present school",
  "Guardian's National Identity Card or Passport",
  "Two passport-size photographs of the student",
  "Vaccination record (Grade 6 applicants)",
];

export default async function AdmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ programme?: string }>;
}) {
  const { programme } = await searchParams;
  const initialProgramme = programme === "al" ? "advanced-level" : "grade-6";

  return (
    <main className="relative overflow-x-clip bg-surface text-fg">
      <Navbar />

      {/* Hero */}
      <section className="relative flex min-h-[560px] items-end overflow-hidden bg-ink text-white md:min-h-[58svh]">
        <Image
          src="/images/hero.jpg"
          alt="The main gates of St. Thomas' College, Matale"
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
              Admissions · 2027 Intake Now Open
            </p>
          </div>
          <h1
            className="animate-fade-up mt-6 max-w-4xl break-words font-display text-[clamp(2.15rem,10vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em] sm:mt-7"
            style={{ animationDelay: "140ms" }}
          >
            Apply for Admission<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-5 max-w-xl text-[14.5px] leading-relaxed text-white/65 sm:mt-6 sm:text-base"
            style={{ animationDelay: "280ms" }}
          >
            Two entry points — the Grade 6 intake and the Advanced Level for
            Grades 12 and 13. Applications for 2027 are now open.
          </p>

          <div
            className="animate-fade-up mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/15 ring-1 ring-white/15 sm:mt-10 md:grid-cols-2"
            style={{ animationDelay: "400ms" }}
          >
            <Link
              href="#apply"
              className="flex items-start gap-4 bg-ink/60 p-5 backdrop-blur-sm transition-colors duration-300 hover:bg-gold hover:text-ink sm:p-6"
            >
              <GraduationCap size={22} className="mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block font-display text-lg font-semibold leading-tight tracking-[-0.01em]">
                  Grade 6 Intake
                </span>
                <span className="mt-1 block font-sans text-[10px] uppercase leading-relaxed tracking-[0.18em] opacity-70">
                  2027 · Limited places
                </span>
              </span>
            </Link>
            <Link
              href="#apply"
              className="flex items-start gap-4 bg-ink/60 p-5 backdrop-blur-sm transition-colors duration-300 hover:bg-gold hover:text-ink sm:p-6"
            >
              <ArrowRight size={22} className="mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block font-display text-lg font-semibold leading-tight tracking-[-0.01em]">
                  Advanced Level
                </span>
                <span className="mt-1 block font-sans text-[10px] uppercase leading-relaxed tracking-[0.18em] opacity-70">
                  Grades 12 – 13 · All four streams
                </span>
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="bg-surface py-16 sm:py-20 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <Reveal>
            <Eyebrow>How Admission Works</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-2xl font-display text-3xl font-semibold leading-[1.12] tracking-[-0.02em] sm:text-4xl md:text-5xl">
              Three steps, one{" "}
              <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                decision
              </span>
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:mt-12 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 90} className="h-full">
                <div className="flex h-full min-w-0 flex-col rounded-xl border border-fg/10 bg-surface-2 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-gold/60 sm:p-7">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold text-ink">
                    <s.icon size={19} />
                  </span>
                  <h3 className="mt-5 break-words font-display text-xl font-semibold leading-snug tracking-[-0.01em]">
                    {s.title}
                  </h3>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-fg/60">
                    {s.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Form + requirements */}
      <section id="apply" className="scroll-mt-20 bg-surface-2 py-16 sm:py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <Reveal>
            <Eyebrow>The Application</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-2xl font-display text-3xl font-semibold leading-[1.12] tracking-[-0.02em] sm:text-4xl md:text-5xl">
              Admission application form
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-8 sm:mt-12 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
            <Reveal delay={100}>
              <AdmissionForm initialProgramme={initialProgramme} />
            </Reveal>

            <div className="space-y-5">
              <Reveal delay={160}>
                <div className="rounded-xl bg-card p-6 text-white sm:p-7">
                  <p className="font-sans text-[10px] uppercase tracking-[0.3em] text-gold">
                    Documents Required
                  </p>
                  <ul className="mt-5 space-y-3">
                    {REQUIREMENTS.map((r) => (
                      <li
                        key={r}
                        className="flex items-start gap-3 text-[13px] leading-relaxed text-white/70"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                        <span className="break-words">{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>

              <Reveal delay={220}>
                <div className="rounded-xl border border-fg/10 bg-surface p-6 sm:p-7">
                  <p className="flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.3em] text-fg/45">
                    <Info size={13} className="text-gold" />
                    Please Note
                  </p>
                  <p className="mt-4 text-[13.5px] leading-relaxed text-fg/60">
                    Submitting this form records an application only — it does
                    not guarantee a place. Places are offered after document
                    verification, the placement test (Grade 6) and the stream
                    interview (A/L).
                  </p>
                  <Link
                    href="/contact"
                    className="group mt-5 inline-flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.2em] text-fg/60 transition-colors hover:text-gold"
                  >
                    Rather book an office visit?
                    <span className="h-px w-6 bg-fg/25 transition-all duration-300 group-hover:w-10 group-hover:bg-gold" />
                  </Link>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      <VisualBlockSections path="/admissions" />
      <Footer />
    </main>
  );
}
