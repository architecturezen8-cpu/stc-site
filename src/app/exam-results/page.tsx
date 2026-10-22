import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { PORTRAIT } from "@/lib/media";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";

export const metadata = {
  title: "Exam Results — St. Thomas' College",
  description:
    "G.C.E. Ordinary and Advanced Level results at St. Thomas' College — 2026 summary, stream breakdowns and honour roll.",
};

const alStreams = [
  { stream: "Physical Science", qualified: "100%", passA: "52%", note: "District-best mean" },
  { stream: "Biological Science", qualified: "100%", passA: "49%", note: "Island 1st — Biology" },
  { stream: "Commerce", qualified: "96%", passA: "44%", note: "Island 1st — Accounting" },
  { stream: "Arts", qualified: "97%", passA: "38%", note: "Two island ranks" },
];

const trend = [
  { year: "2022", score: 91 },
  { year: "2023", score: 94 },
  { year: "2024", score: 95 },
  { year: "2025", score: 96 },
  { year: "2026", score: 98 },
];

const honourRoll = [
  {
    name: "Kavindu Bandaranayake",
    honour: "Island 1st — Biological Science",
    detail: "3 A passes · reading Medicine, University of Colombo",
    image: PORTRAIT.boy1,
  },
  {
    name: "Sasindu Ratnayake",
    honour: "Island 1st — Physical Science",
    detail: "3 A passes · Engineering scholarship, NUS Singapore",
    image: PORTRAIT.boy2,
  },
  {
    name: "Oshada Wijeratne",
    honour: "Island 1st — Commerce",
    detail: "3 A passes · ICASL direct-entry award",
    image: PORTRAIT.boy3,
  },
];

const olStats = [
  { value: "99.2%", label: "O/L Pass Rate" },
  { value: "187", label: "Nine-A Distinctions" },
  { value: "100%", label: "English Pass Rate" },
  { value: "6", label: "District Ranks" },
];

export default function ExamResultsPage() {
  return (
    <main className="relative bg-surface text-fg">
      <Navbar />

      {/* Hero */}
      <section className="relative flex min-h-[55svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src="/images/senior-school.jpg"
          alt="Senior students at study"
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
              G.C.E. O/L &amp; A/L · Academic Year 2026
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            Exam Results<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-white/65"
            style={{ animationDelay: "280ms" }}
          >
            Annual G.C.E. Ordinary Level and Advanced Level results of the
            college — a record of our students&apos; hard work and success.
            Here is both.
          </p>
        </div>
      </section>

      {/* A/L summary + trend */}
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="grid gap-14 lg:grid-cols-2 lg:items-start">
            <div>
              <Reveal>
                <Eyebrow>Advanced Level 2026</Eyebrow>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.12] tracking-[-0.02em] md:text-5xl">
                  214 of 218 students{" "}
                  <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                    university-qualified
                  </span>
                </h2>
              </Reveal>
              <Reveal delay={200}>
                <p className="mt-6 max-w-xl text-[15.5px] leading-relaxed text-fg/60">
                  A 98% qualification rate — the strongest in the
                  college&apos;s history and among the best in the island.
                  Forty-one students earned three A grades.
                </p>
              </Reveal>
            </div>

            {/* Trend bars */}
            <Reveal delay={160}>
              <div className="rounded-2xl border border-fg/10 bg-surface-2 p-8">
                <p className="font-sans text-[10px] uppercase tracking-[0.3em] text-fg/45">
                  University-qualification rate · five-year trend
                </p>
                <div className="mt-7 space-y-4">
                  {trend.map((t) => (
                    <div
                      key={t.year}
                      data-trend-row
                      className="flex items-center gap-4"
                    >
                      <span className="w-10 font-display text-lg font-semibold">
                        {t.year}
                      </span>
                      <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-fg/10">
                        <div
                          data-trend-bar
                          className={`h-full rounded-full transition-[width] duration-500 ${t.year === "2026" ? "bg-gold" : "bg-fg/70"}`}
                          style={{ width: `${t.score}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-sm font-semibold text-fg/70">
                        {t.score}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>

          {/* Stream table */}
          <Reveal delay={120}>
            <div className="mt-14 overflow-hidden rounded-2xl border border-fg/10">
              <div className="grid grid-cols-[1.2fr_0.6fr_0.6fr_1fr] gap-px bg-fg/10 font-sans text-[9px] uppercase tracking-[0.25em] max-md:hidden">
                <div className="bg-surface-2 px-6 py-4 text-fg/50">Stream</div>
                <div className="bg-surface-2 px-6 py-4 text-fg/50">Qualified</div>
                <div className="bg-surface-2 px-6 py-4 text-fg/50">A-Grade Rate</div>
                <div className="bg-surface-2 px-6 py-4 text-fg/50">Highlight</div>
              </div>
              {alStreams.map((s, i) => (
                <div
                  key={s.stream}
                  className={`grid gap-2 px-6 py-6 md:grid-cols-[1.2fr_0.6fr_0.6fr_1fr] md:items-center ${
                    i !== 0 ? "border-t border-fg/10" : ""
                  } transition-colors hover:bg-surface-2`}
                >
                  <p className="font-display text-xl font-semibold tracking-[-0.01em]">
                    {s.stream}
                  </p>
                  <p className="font-display text-2xl font-semibold text-fg">
                    {s.qualified}
                  </p>
                  <p className="text-sm font-medium text-fg/60">{s.passA}</p>
                  <p className="flex items-center gap-2 text-sm text-fg/60">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                    {s.note}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Honour roll */}
      <section className="bg-surface-2 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal className="flex justify-center">
            <Eyebrow>Honour Roll 2026</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mx-auto mt-7 max-w-2xl text-center font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
              Island&apos;s Best{" "}
              <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                Performances
              </span>
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {honourRoll.map((h, i) => (
              <Reveal key={h.name} delay={i * 110} className="h-full">
                <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card text-white transition-all duration-500 hover:-translate-y-1.5 hover:shadow-lift">
                  <div className="relative m-2.5 mb-0 aspect-[4/3] overflow-hidden rounded-[1rem] bg-ink">
                    <Image
                      src={h.image}
                      alt={h.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover object-top transition-transform duration-[1.2s] ease-out group-hover:scale-[1.06]"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-7">
                    <h3 className="font-display text-2xl font-semibold tracking-[-0.01em]">
                      {h.name}
                    </h3>
                    <p className="mt-2 font-sans text-[10px] uppercase tracking-[0.24em] text-gold">
                      {h.honour}
                    </p>
                    <span className="mt-4 block h-px w-7 bg-gold" />
                    <p className="mt-4 text-[14px] leading-relaxed text-white/60">
                      {h.detail}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* O/L stats */}
      <section className="bg-surface py-20 md:py-24">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div>
              <Reveal>
                <Eyebrow>Ordinary Level 2026</Eyebrow>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-7 max-w-xl font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                  A Strong Academic Foundation
                </h2>
              </Reveal>
            </div>
            <Reveal delay={180}>
              <Link
                href="/advanced-level"
                className="group inline-flex items-center gap-2.5 rounded-full border border-fg/15 px-6 py-3 text-[13px] font-medium text-fg transition-colors hover:border-fg hover:bg-fg hover:text-surface"
              >
                Explore A/L Streams
                <ArrowRight size={14} className="slide-arrow" />
              </Link>
            </Reveal>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {olStats.map((s, i) => (
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
        </div>
      </section>

      <VisualBlockSections path="/exam-results" />
      <Footer />
    </main>
  );
}
