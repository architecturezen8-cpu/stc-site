import Image from "next/image";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowRight, Backpack, Compass, Flag, Medal, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { staff } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { Navbar } from "@/components/navbar";
import { CountUp } from "@/components/count-up";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { SCENE } from "@/lib/media";
import { UNITS } from "@/lib/units";
import { Crest } from "@/components/crest";
import { CadetExploreLink } from "@/components/cadeting/explore-link";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";
import { getPublishedLogoMap } from "@/lib/logos";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cadeting — St. Thomas' College, Matale",
  description:
    "Army Cadet, Eastern Band, Western Band, Police Cadet and Scouting at St. Thomas' College, Matale.",
};

const pillars = [
  {
    icon: ShieldCheck,
    title: "Drill & Bearing",
    text: "Weekly parade-square training in foot and sword drill — the quiet discipline that steadies every young Thomian.",
  },
  {
    icon: Compass,
    title: "Fieldcraft & Navigation",
    text: "Map reading, expedition planning and survival skills developed across annual assessment camps in the Sri Lankan interior.",
  },
  {
    icon: Flag,
    title: "Leadership & Rank",
    text: "From lance corporal to platoon sergeant — cadets earn rank through service, and learn to lead thirty peers before eighteen.",
  },
  {
    icon: Medal,
    title: "Herman Loos Trials",
    text: "The island's premier cadet competition. Our platoon fielded eleven qualifiers in the 2026 assessment cycle.",
  },
];

const honours = [
  { year: "2026", note: "District Best Platoon — Central Province Brigade" },
  { year: "2025", note: "11 Herman Loos assessment qualifiers" },
  { year: "2024", note: "Inter-School Drill Competition — Runners-up" },
  { year: "2023", note: "Brigade Camp — Best Contingent, Rantambe" },
];

export default async function CadetingPage() {
  await ensureSeed();
  const logos = await getPublishedLogoMap();

  const [commander] = await db
    .select()
    .from(staff)
    .where(eq(staff.role, "Cadet Platoon Commander"))
    .orderBy(asc(staff.sortOrder))
    .limit(1);

  return (
    <main className="relative bg-surface text-fg">
      <Navbar />
      <VisualBlockSections path="/cadeting" position="top" />

      {/* Hero */}
      <section className="relative flex min-h-[58svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src={SCENE.cadetFormation}
          alt="Cadets standing in formation on the college grounds"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-ink/72" />
        <div className="grain absolute inset-0" />

        <div className="relative mx-auto w-full max-w-7xl px-5 pb-16 pt-32 md:px-8 md:pb-20">
          <div className="animate-fade-up flex items-center gap-4">
            <span className="h-px w-12 bg-gold" />
            <p className="font-sans text-[11px] uppercase tracking-[0.4em] text-white/70">
              Cadeting, Bands &amp; Scouting
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            Cadeting<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-white/65"
            style={{ animationDelay: "280ms" }}
          >
            Five uniformed units — where discipline becomes instinct, on the
            parade square of St. Thomas&apos; since 1935.
          </p>

          <div
            className="animate-fade-up mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/15 pt-6"
            style={{ animationDelay: "400ms" }}
          >
            {[
              { value: "5", label: "Uniformed Units" },
              { value: "279", label: "Serving Members" },
              { value: "88", label: "Years of the Platoon" },
              { value: "2", label: "Annual Camps" },
            ].map((s, i) => (
              <div key={s.label}>
                <p className="font-display text-3xl font-semibold tracking-[-0.02em]">
                  <CountUp value={s.value} delay={i * 110} />
                </p>
                <p className="mt-1 font-sans text-[9px] uppercase tracking-[0.28em] text-white/45">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The five units */}
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <Eyebrow>The Five Units</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-2xl font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
              Every Thomian finds his{" "}
              <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                formation
              </span>
            </h2>
          </Reveal>

          <div className="mt-12 space-y-7">
            {UNITS.map((u, i) => {
              const flip = i % 2 === 1;
              return (
                <Reveal key={u.name} delay={60}>
                  <div
                    className={`group grid overflow-hidden rounded-2xl bg-card text-white transition-all duration-500 hover:shadow-lift lg:grid-cols-2 ${
                      flip ? "lg:[&>div:first-child]:order-2" : ""
                    }`}
                  >
                    <div className="relative m-2.5 aspect-[16/10] overflow-hidden rounded-[1rem] bg-ink lg:aspect-auto lg:min-h-[320px]">
                      <Image
                        src={u.image}
                        alt={u.name}
                        fill
                        sizes="(max-width: 1024px) 100vw, 50vw"
                        className="object-cover transition-transform duration-[1.4s] ease-out group-hover:scale-[1.05]"
                      />
                      <Crest
                        initials={u.crest}
                        label={u.name}
                        visualKey={`cadet-unit-crest-${u.slug}`}
                        logoId={`cadet-crest-${u.slug}`}
                        logoSrc={logos[`cadet-crest-${u.slug}`]?.src}
                        logoScale={logos[`cadet-crest-${u.slug}`]?.scale}
                        className="absolute left-4 top-4"
                      />
                    </div>

                    <div className="flex flex-col justify-center p-7 md:p-10">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-white/15 px-3.5 py-1.5 font-sans text-[9px] uppercase tracking-[0.22em] text-mist">
                          {u.founded}
                        </span>
                        <span className="rounded-full bg-white/10 px-3.5 py-1.5 font-sans text-[9px] uppercase tracking-[0.22em] text-white/70">
                          {u.strength}
                        </span>
                      </div>
                      <h3 className="mt-5 font-display text-3xl font-semibold tracking-[-0.02em] md:text-4xl">
                        {u.name}
                      </h3>
                      <span className="mt-4 block h-px w-8 bg-gold" />
                      <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-white/60">
                        {u.text}
                      </p>
                      <div className="mt-6 flex flex-wrap gap-2">
                        {u.highlights.map((h) => (
                          <span
                            key={h}
                            className="rounded-full border border-white/15 px-3.5 py-1.5 text-[12px] text-white/70"
                          >
                            {h}
                          </span>
                        ))}
                      </div>

                      <CadetExploreLink
                        href={`/cadeting/${u.slug}`}
                        unitName={u.name}
                        crest={u.crest}
                        tagline={u.tagline}
                        logoId={`cadet-crest-${u.slug}`}
                        logoSrc={logos[`cadet-crest-${u.slug}`]?.src}
                        logoScale={logos[`cadet-crest-${u.slug}`]?.scale}
                        className="mt-7 inline-flex items-center gap-2.5 self-start rounded-full bg-gold px-6 py-3 text-[13px] font-medium text-ink transition-colors duration-300 hover:bg-white"
                      >
                        Explore {u.name}
                        <ArrowRight size={15} className="slide-arrow" />
                      </CadetExploreLink>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="bg-surface-2 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <Eyebrow>What Cadeting Teaches</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-2xl font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
              The uniform is the{" "}
              <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                smallest
              </span>{" "}
              part
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {pillars.map((p, i) => {
              const Icon = p.icon;
              return (
                <Reveal key={p.title} delay={(i % 2) * 100} className="h-full">
                  <div className="group flex h-full gap-6 rounded-2xl border border-fg/10 bg-surface p-8 transition-all duration-300 hover:-translate-y-1 hover:border-fg/25 hover:shadow-soft">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fg text-surface transition-colors duration-300 group-hover:bg-gold group-hover:text-ink">
                      <Icon size={18} />
                    </span>
                    <div>
                      <h3 className="font-display text-2xl font-semibold tracking-[-0.01em]">
                        {p.title}
                      </h3>
                      <p className="mt-2.5 text-[14.5px] leading-relaxed text-fg/60">
                        {p.text}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Honours + commander */}
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
            <div>
              <Reveal>
                <Eyebrow>Recent Honours</Eyebrow>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                  Recent Cadet Honours
                </h2>
              </Reveal>

              <div className="mt-10 space-y-4">
                {honours.map((h, i) => (
                  <Reveal key={h.year} delay={i * 80}>
                    <div className="flex items-center gap-5 rounded-xl border border-fg/10 bg-surface-2 px-6 py-5 transition-colors hover:border-fg/25">
                      <span className="rounded-full bg-gold px-4 py-1.5 font-display text-base font-semibold text-ink">
                        {h.year}
                      </span>
                      <p className="text-[14px] font-medium text-fg/75">
                        {h.note}
                      </p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>

            <div>
              <Reveal>
                <Eyebrow>Officer in Command</Eyebrow>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                  Cadet Leadership
                </h2>
              </Reveal>

              {commander && (
                <Reveal delay={200}>
                  <div className="mt-10 flex items-start gap-5 rounded-2xl bg-card p-7 text-white">
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gold font-display text-lg font-semibold text-ink">
                      RW
                    </span>
                    <div>
                      <h3 className="font-display text-2xl font-semibold tracking-[-0.01em]">
                        {commander.name}
                      </h3>
                      <p className="mt-1 font-sans text-[9.5px] uppercase tracking-[0.24em] text-gold">
                        {commander.role}
                      </p>
                      <p className="mt-3 text-[13.5px] leading-relaxed text-white/60">
                        {commander.qualification} · Commanding the platoon
                        through drills, camps and ceremonial duties since 2018.
                      </p>
                    </div>
                  </div>
                </Reveal>
              )}

              <Reveal delay={260}>
                <div className="mt-6 flex flex-col items-start justify-between gap-6 rounded-2xl bg-card p-7 text-white md:flex-row md:items-center">
                  <div className="flex items-start gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold text-ink">
                      <Backpack size={19} />
                    </span>
                    <div>
                      <h3 className="font-display text-xl font-semibold tracking-[-0.01em]">
                        Enlistment opens every February
                      </h3>
                      <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-white/60">
                        Grade 9 students may enlist in any of the five units at
                        the annual intake.
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/contact?type=Sports & Co-Curricular"
                    className="inline-flex shrink-0 items-center gap-2.5 rounded-full bg-gold px-6 py-3 text-[13px] font-medium text-ink transition-colors duration-300 hover:bg-white"
                  >
                    Enquire
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      <VisualBlockSections path="/cadeting" position="bottom" />
      <Footer />
    </main>
  );
}
