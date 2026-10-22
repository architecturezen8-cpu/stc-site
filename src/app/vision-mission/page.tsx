import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Compass,
  HeartHandshake,
  Music,
  Quote,
  ShieldCheck,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";

export const metadata = {
  title: "Vision & Mission — St. Thomas' College",
  description:
    "The vision, mission and enduring values that guide every classroom at St. Thomas' College, Matale.",
};

const missionPoints = [
  {
    title: "Rigorous Scholarship",
    text: "To hold every student to the highest academic standard while teaching them to love the work itself — not merely the result.",
  },
  {
    title: "Whole-Person Formation",
    text: "To develop the body through sport, the imagination through art, and the conscience through service, as one indivisible education.",
  },
  {
    title: "Character Before Credit",
    text: "To place integrity above achievement, so that every Thomian leaves our gates ready to stand tall in any room in the world.",
  },
  {
    title: "Heritage and Innovation",
    text: "To honour the traditions that made us while equipping every student for a century we cannot yet imagine.",
  },
];

const values = [
  {
    icon: ShieldCheck,
    name: "Discipline",
    text: "The quiet architecture of everything we build — punctuality, precision, and pride in work done properly.",
  },
  {
    icon: BookOpen,
    name: "Wisdom",
    text: "Knowledge that looks beyond the syllabus — judgment, curiosity and the humility to keep learning.",
  },
  {
    icon: Compass,
    name: "Character",
    text: "Doing what is right when no one is watching; the truest measure of a Thomian.",
  },
  {
    icon: HeartHandshake,
    name: "Service",
    text: "Excellence is only worth having when it is spent on others — our classrooms train guardians, not guests.",
  },
];

export default function VisionMissionPage() {
  return (
    <main className="relative bg-surface text-fg">
      <Navbar />

      {/* Hero */}
      <section className="relative flex min-h-[58svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src="/images/about.jpg"
          alt="Students studying in the Great Hall Library"
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
              Our Compass Since 1873
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            Vision &amp; Mission<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-white/65"
            style={{ animationDelay: "280ms" }}
          >
            The guiding principles that shape every classroom, assembly and
            activity at St. Thomas&apos; College, Matale.
          </p>
        </div>
      </section>

      {/* Vision statement */}
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <div className="rounded-[1.5rem] bg-card p-10 text-white md:p-16">
              <div className="flex items-center gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-gold text-ink">
                  <Quote size={20} className="fill-current" />
                </span>
                <Eyebrow tone="light">Our Vision</Eyebrow>
              </div>
              <p className="mt-9 max-w-4xl font-display text-3xl font-medium leading-[1.3] tracking-[-0.01em] md:text-5xl md:leading-[1.25]">
                To be a leading boys&apos; college whose graduates are men of{" "}
                <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                  intellect
                </span>
                ,{" "}
                <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                  character
                </span>{" "}
                and{" "}
                <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                  service
                </span>{" "}
                to their nation and the world.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Mission */}
      <section className="bg-surface-2 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_2fr] lg:items-start">
            <div>
              <Reveal>
                <Eyebrow>Our Mission</Eyebrow>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                  Our Commitment to{" "}
                  <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                    Every Student
                  </span>
                </h2>
              </Reveal>
              <Reveal delay={200}>
                <p className="mt-6 max-w-md text-[15px] leading-relaxed text-fg/60">
                  The mission of the college in daily practice — the four
                  commitments we make to every student and his family.
                </p>
              </Reveal>
            </div>

            <div className="space-y-5">
              {missionPoints.map((m, i) => (
                <Reveal key={m.title} delay={i * 100}>
                  <div className="group flex gap-6 rounded-2xl border border-fg/10 bg-surface p-7 transition-all duration-300 hover:-translate-y-1 hover:border-fg/25 md:p-8">
                    <span className="mt-1 h-px w-8 shrink-0 bg-gold" />
                    <div>
                      <h3 className="font-display text-2xl font-semibold tracking-[-0.01em]">
                        {m.title}
                      </h3>
                      <p className="mt-2.5 text-[15px] leading-relaxed text-fg/60">
                        {m.text}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* Colours, Crest & Song */}
      <section id="colours" className="scroll-mt-24 bg-surface-2 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal className="flex justify-center">
            <Eyebrow>College Identity</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mx-auto mt-7 max-w-2xl text-center font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
              Our Colours, Houses &amp;{" "}
              <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                College Song
              </span>
            </h2>
          </Reveal>
          <Reveal delay={170}>
            <p className="mx-auto mt-5 max-w-xl text-center text-[15px] leading-relaxed text-fg/55">
              The symbols every Thomian carries from his first day — and for
              the rest of his life.
            </p>
          </Reveal>

          {/* Colours — cinematic full-width showcase */}
          <Reveal delay={80}>
            <div className="relative mt-14 overflow-hidden rounded-2xl bg-card text-white shadow-lift">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 flex h-2.5"
              >
                <span className="w-1/3 bg-gold" />
                <span className="w-1/3 bg-[#3E7CB1]" />
                <span className="w-1/3 bg-[#081428]" />
              </span>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-gold/10 blur-3xl"
              />
              <div className="grain pointer-events-none absolute inset-0 opacity-60" />

              <div className="relative p-8 pt-10 md:p-12 md:pt-14">
                <div className="flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <p className="font-sans text-[10px] uppercase tracking-[0.35em] text-gold">
                      College Colours
                    </p>
                    <h3 className="mt-4 font-display text-3xl font-semibold tracking-[-0.02em] md:text-5xl">
                      Gold and Double Blue
                    </h3>
                  </div>
                  <p className="max-w-md text-[14px] leading-relaxed text-white/55">
                    Gold for the light of learning and the courage of the
                    motto; the double blue — one light, one deep — for
                    constancy and faith.
                  </p>
                </div>

                {/* Cinematic colour panels */}
                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                  {[
                    {
                      name: "College Gold",
                      hex: "#FFD444",
                      panel: "bg-gold",
                      title: "text-ink",
                      chip: "bg-ink/10 text-ink/70",
                      body: "text-ink/75",
                      line: "bg-ink/25",
                      meaning:
                        "The light of learning — worn with pride on the tie and the cap.",
                    },
                    {
                      name: "Light Blue",
                      hex: "#3E7CB1",
                      panel: "bg-[#3E7CB1]",
                      title: "text-white",
                      chip: "bg-white/15 text-white/85",
                      body: "text-white/75",
                      line: "bg-white/35",
                      meaning:
                        "Constancy — calm above every season the college weathers.",
                    },
                    {
                      name: "Deep Blue",
                      hex: "#081428",
                      panel: "bg-[#081428] border border-white/15",
                      title: "text-white",
                      chip: "bg-white/15 text-white/85",
                      body: "text-white/75",
                      line: "bg-white/35",
                      meaning:
                        "Faith — the deep that steadies every Thomian who wears it.",
                    },
                  ].map((c, i) => (
                    <Reveal key={c.name} delay={120 + i * 110} className="h-full">
                      <div
                        data-visual-bg=""
                        title={`${c.name} colour panel`}
                        className={`group relative h-52 overflow-hidden rounded-xl bg-cover bg-center md:h-64 ${c.panel}`}
                      >
                        {/* sheen sweep on hover */}
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 w-24 -translate-x-[200%] -skew-x-12 bg-white/20 blur-sm transition-transform duration-[1100ms] ease-out group-hover:translate-x-[900%]"
                        />
                        <span
                          className={`absolute right-4 top-4 rounded-full px-3 py-1 font-sans text-[9px] uppercase tracking-[0.18em] ${c.chip}`}
                        >
                          {c.hex}
                        </span>
                        <div className="absolute inset-x-5 bottom-5">
                          <p
                            className={`font-display text-xl font-semibold tracking-[-0.01em] md:text-2xl ${c.title}`}
                          >
                            {c.name}
                          </p>
                          <span
                            className={`mt-3 block h-px w-8 ${c.line}`}
                          />
                          <p
                            className={`mt-3 text-[12.5px] leading-relaxed ${c.body}`}
                          >
                            {c.meaning}
                          </p>
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </div>

                <p className="mt-8 text-center font-sans text-[10px] uppercase tracking-[0.28em] text-white/40">
                  The college tie · the First XI cap · every colours blazer of
                  Colours Nite
                </p>
              </div>
            </div>
          </Reveal>

          {/* Houses — full width, below the colours */}
          <Reveal delay={140}>
            <div className="mt-6 rounded-2xl border border-fg/10 bg-surface p-8 shadow-lift md:p-10">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="font-sans text-[10px] uppercase tracking-[0.35em] text-fg/45">
                    The Four Houses
                  </p>
                  <h3 className="mt-4 font-display text-3xl font-semibold tracking-[-0.02em]">
                    The House System
                  </h3>
                </div>
                <p className="max-w-xl text-[14px] leading-relaxed text-fg/60">
                  Every Thomian is placed in one of four houses on the day he
                  enrols, and competes for it until the day he leaves — at the
                  inter-house sports meet, the drill competition and the house
                  music festival.
                </p>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { name: "Austin", color: "bg-emerald-600", label: "Green" },
                  { name: "Bede", color: "bg-[#0b2a5b]", label: "Navy Blue" },
                  { name: "Clement", color: "bg-gold", label: "Yellow" },
                  { name: "Pius", color: "bg-red-600", label: "Red" },
                ].map((h) => (
                  <div
                    key={h.name}
                    className="group flex items-center gap-4 rounded-xl border border-fg/10 px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-fg/30 hover:shadow-lift"
                  >
                    <span
                      className={`h-3.5 w-3.5 rounded-full ring-4 ring-fg/5 transition-transform duration-300 group-hover:scale-110 ${h.color}`}
                    />
                    <p className="font-display text-xl font-semibold tracking-[-0.01em]">
                      {h.name}
                    </p>
                    <span className="ml-auto font-sans text-[10px] uppercase tracking-[0.2em] text-fg/45">
                      {h.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* College Song */}
          <Reveal delay={140}>
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="relative overflow-hidden rounded-2xl bg-card p-8 text-white shadow-lift ring-1 ring-gold/25 md:p-12 lg:col-span-3">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/10 blur-3xl"
                />
                <div className="flex flex-wrap items-center gap-4">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-gold text-ink shadow-lift">
                    <Music size={24} />
                  </span>
                  <div>
                    <p className="font-sans text-[10px] uppercase tracking-[0.35em] text-gold">
                      The College Song
                    </p>
                    <h3 className="mt-1.5 font-display text-3xl font-semibold tracking-[-0.02em] md:text-4xl">
                      &ldquo;Animo et Fide&rdquo;
                    </h3>
                  </div>
                </div>

                {/* 1 — Watch */}
                <div className="mt-9 overflow-hidden rounded-xl border border-white/15 bg-ink shadow-lift">
                  <div className="relative aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/RL94GHWvcFA"
                      title="St. Thomas' College, Matale — College Song"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      loading="lazy"
                      className="absolute inset-0 h-full w-full"
                    />
                  </div>
                  <p className="bg-ink px-5 py-3 font-sans text-[10px] uppercase tracking-[0.22em] text-white/60">
                    Watch · The College Song
                  </p>
                </div>

                {/* 2 — About the song */}
                <div className="mx-auto mt-8 max-w-3xl space-y-5 text-center">
                  <p className="text-[15px] leading-relaxed text-white/70">
                    The college song is sung at the opening of every general
                    assembly, at Prize Giving, at Colours Nite, and — loudest
                    of all — from the pavilion at the Battle of the Golds.
                  </p>
                  <p className="text-[15px] leading-relaxed text-white/70">
                    Old Thomians will tell you that the song is the one thing
                    that never changes: the boy who sang it in 1968 and the boy
                    who sings it today are singing the same four lines, and
                    mean them equally.
                  </p>
                </div>

                {/* 3 — Lyrics */}
                <div className="mt-10 rounded-xl border border-gold/25 bg-ink px-7 py-10 text-center">
                  <p className="font-sans text-[10px] uppercase tracking-[0.35em] text-gold">
                    The Refrain
                  </p>
                  <p className="mx-auto mt-6 max-w-2xl font-display text-2xl font-medium italic leading-[1.7] tracking-[-0.01em] text-white md:text-[1.75rem]">
                    &ldquo;Animo et Fide, Thomians true,
                    <br />
                    Gold of the morning, double blue —
                    <br />
                    Courage to strive and faith to stand,
                    <br />
                    Sons of Matale, heart and hand.&rdquo;
                  </p>
                  <span className="mx-auto mt-7 block h-px w-10 bg-gold" />
                  <p className="mt-4 text-[12.5px] text-white/50">
                    As sung at assembly, Prize Giving and the Battle of the
                    Golds.
                  </p>
                </div>

                {/* 4 — Tags */}
                <div className="mt-7 flex flex-wrap justify-center gap-2.5">
                  {["Sung at Assembly", "Prize Giving", "Colours Nite", "Big Match"].map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-white/20 px-4 py-2 font-sans text-[10px] uppercase tracking-[0.2em] text-white/65 transition-colors duration-300 hover:border-gold hover:text-gold"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Values */}
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal className="flex justify-center">
            <Eyebrow>Our Values</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mx-auto mt-7 max-w-2xl text-center font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
              The Values That Define Us
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v, i) => {
              const Icon = v.icon;
              return (
                <Reveal key={v.name} delay={i * 100} className="h-full">
                  <div className="flex h-full flex-col rounded-2xl bg-card p-8 text-white transition-all duration-500 hover:-translate-y-1.5">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-gold text-ink">
                      <Icon size={19} />
                    </span>
                    <h3 className="mt-6 font-display text-2xl font-semibold tracking-[-0.01em]">
                      {v.name}
                    </h3>
                    <span className="mt-4 block h-px w-7 bg-gold" />
                    <p className="mt-4 text-[14px] leading-relaxed text-white/60">
                      {v.text}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>

          {/* Motto */}
          <Reveal delay={140}>
            <div className="mx-auto mt-16 max-w-3xl rounded-2xl border border-fg/10 bg-surface-2 px-8 py-12 text-center md:py-16">
              <p className="font-sans text-[10px] uppercase tracking-[0.4em] text-fg/40">
                The College Motto
              </p>
              <p className="mt-5 font-display text-4xl font-semibold italic tracking-[-0.02em] md:text-6xl">
                Animo Et Fide
              </p>
              <p className="mt-4 text-[15px] italic text-fg/50">
                — &ldquo;Courage & Faith&rdquo;
              </p>
              <Link
                href="/staff"
                className="group mt-9 inline-flex items-center gap-3 font-sans text-[11px] uppercase tracking-[0.25em] text-fg"
              >
                Meet the people who carry it
                <span className="h-px w-10 bg-fg/30 transition-all duration-500 group-hover:w-16 group-hover:bg-gold" />
                <ArrowRight size={14} className="slide-arrow" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <VisualBlockSections path="/vision-mission" />
      <Footer />
    </main>
  );
}
