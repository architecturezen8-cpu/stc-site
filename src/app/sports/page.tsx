import Image from "next/image";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import {
  ArrowRight,
  Dumbbell,
  MapPin,
  Target,
  Trophy,
  Waves,
} from "lucide-react";
import { db } from "@/db";
import { staff } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { SCENE } from "@/lib/media";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sports — St. Thomas' College",
  description:
    "Cricket, hockey, volleyball and tennis — the four main sports of St. Thomas' College, Matale.",
};

const mainSports = ["Cricket", "Hockey", "Volleyball", "Tennis"];

const otherDisciplines = [
  "Athletics", "Swimming", "Basketball", "Football", "Badminton",
  "Table Tennis", "Chess", "Karate", "Rugby", "Netball",
  "Elle", "Carrom", "Weightlifting", "Boxing",
];

const programmes = [
  {
    image: "/images/news-sports.jpg",
    title: "Cricket",
    season: "Term 1 – 3",
    text: "The flagship. Home of the Battle of the Golds against Science College, Matale — the biggest date on the college calendar.",
    honour: "All-Island knockout semi-finalists 2025",
  },
  {
    image: SCENE.hockey,
    title: "Hockey",
    season: "Term 2 – 3",
    text: "A proud Thomian tradition that has sent players to the Sri Lanka national and Asia teams, including Old Thomian Ranjith Wijekoon.",
    honour: "Under-19 island champions 2025",
  },
  {
    image: SCENE.volleyball,
    title: "Volleyball",
    season: "Term 1 – 2",
    text: "The national sport, played hard in our indoor hall — a squad built on quick hands, sharp calls and relentless court discipline.",
    honour: "Central Province champions 2026",
  },
  {
    image: SCENE.tennis,
    title: "Tennis",
    season: "Year-round",
    text: "Two courts, individual coaching and a singles ladder that runs all year — the college's quietest, most precise discipline.",
    honour: "District singles & doubles titles 2026",
  },
];

const facilities = [
  "The main oval & pavilion",
  "25-metre swimming pool",
  "Two synthetic tennis courts",
  "Indoor badminton hall — 4 courts",
  "Weights & conditioning room",
  "400m eight-lane cinder track",
];

export default async function SportsPage() {
  await ensureSeed();

  const coaches = await db
    .select()
    .from(staff)
    .where(eq(staff.department, "Sports & Cadeting"))
    .orderBy(asc(staff.sortOrder));

  return (
    <main className="relative bg-surface text-fg">
      <Navbar />

      {/* Hero */}
      <section className="relative flex min-h-[58svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src="/images/sports.jpg"
          alt="Athletes sprinting on the college track"
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
              Grit, Glory &amp; Game
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            Sports<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-white/65"
            style={{ animationDelay: "280ms" }}
          >
            Sport is central to life at the college — building teamwork,
            discipline and character under floodlights, at
            dawn sessions, and in the roar of a big match crowd.
          </p>

          <div
            className="animate-fade-up mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/15 pt-6"
            style={{ animationDelay: "400ms" }}
          >
            {[
              { value: "4", label: "Main Sports" },
              { value: "34", label: "Inter-School Fixtures / Year" },
              { value: "22", label: "Coaching Staff" },
              { value: "9", label: "Provincial Golds 2026" },
            ].map((s) => (
              <div key={s.label}>
                <p className="font-display text-3xl font-semibold tracking-[-0.02em]">
                  {s.value}
                </p>
                <p className="mt-1 font-sans text-[9px] uppercase tracking-[0.28em] text-white/45">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Discipline chips */}
      <section className="border-b border-fg/10 bg-surface">
        <div className="mx-auto max-w-7xl px-5 py-7 md:px-8">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-sans text-[10px] uppercase tracking-[0.3em] text-fg/40">
              Main Sports
            </span>
            {mainSports.map((d) => (
              <span
                key={d}
                className="rounded-full bg-gold px-4 py-2 font-sans text-[10px] font-medium uppercase tracking-[0.2em] text-ink"
              >
                {d}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <span className="font-sans text-[10px] uppercase tracking-[0.3em] text-fg/40">
              Also Played
            </span>
            {otherDisciplines.map((d) => (
              <span
                key={d}
                className="rounded-full border border-fg/15 px-4 py-2 font-sans text-[10px] uppercase tracking-[0.2em] text-fg/60 transition-colors duration-300 hover:border-fg hover:text-fg"
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Featured programmes */}
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <Eyebrow>Featured Programmes</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-xl font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
              Our four{" "}
              <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                main sports
              </span>
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
            {programmes.map((p, i) => (
              <Reveal key={p.title} delay={i * 120} className="h-full">
                <article className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card text-white transition-all duration-500 hover:-translate-y-1.5 hover:shadow-lift">
                  <div className="relative m-2.5 mb-0 aspect-[16/10] overflow-hidden rounded-[1rem]">
                    <Image
                      src={p.image}
                      alt={p.title}
                      width={800}
                      height={500}
                      className="h-full w-full object-cover transition-transform duration-[1.1s] ease-out group-hover:scale-[1.05]"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-3.5 p-7">
                    <p className="font-sans text-[9.5px] uppercase tracking-[0.3em] text-mist">
                      {p.season}
                    </p>
                    <h3 className="font-display text-3xl font-semibold tracking-[-0.02em]">
                      {p.title}
                    </h3>
                    <p className="text-[14.5px] leading-relaxed text-white/60">
                      {p.text}
                    </p>
                    <div className="mt-auto flex items-center gap-2.5 border-t border-white/10 pt-5">
                      <Trophy size={14} className="text-gold" />
                      <p className="font-sans text-[10px] uppercase tracking-[0.22em] text-white/55">
                        {p.honour}
                      </p>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Facilities + coaches */}
      <section className="bg-surface-2 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
            {/* Facilities */}
            <div>
              <Reveal>
                <Eyebrow>The Grounds</Eyebrow>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                  Sports Facilities &amp; Grounds
                </h2>
              </Reveal>
              <div className="mt-9 space-y-3">
                {facilities.map((f, i) => (
                  <Reveal key={f} delay={i * 60}>
                    <div className="flex items-center gap-4 rounded-xl border border-fg/10 bg-surface px-5 py-4 transition-colors hover:border-fg/25">
                      <MapPin size={15} className="shrink-0 text-gold" />
                      <p className="text-[14.5px] font-medium">{f}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>

            {/* Coaches (from DB) */}
            <div>
              <Reveal>
                <Eyebrow>The Coaching Room</Eyebrow>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                  Professional Coaching Staff
                </h2>
              </Reveal>
              <div className="mt-9 space-y-4">
                {coaches.map((c) => (
                  <Reveal key={c.id} delay={80}>
                    <div className="flex items-start gap-5 rounded-2xl bg-card p-6 text-white">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-fg font-display text-base font-semibold text-surface dark:bg-gold dark:text-ink">
                        {c.name
                          .replace(/^(Mr|Mrs|Ms|Dr|Capt)\.\s*/, "")
                          .split(" ")
                          .filter(Boolean)
                          .map((w, wi, arr) =>
                            wi === 0 || wi === arr.length - 1 ? w.charAt(0) : "",
                          )
                          .join("")
                          .toUpperCase()}
                      </span>
                      <div>
                        <h3 className="font-display text-xl font-semibold tracking-[-0.01em]">
                          {c.name}
                        </h3>
                        <p className="mt-0.5 font-sans text-[9.5px] uppercase tracking-[0.28em] text-gold">
                          {c.role}
                        </p>
                        <p className="mt-2 text-[13px] text-white/55">
                          {c.qualification}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                ))}
                <Reveal delay={160}>
                  <div className="flex items-center gap-4 rounded-2xl border border-dashed border-fg/20 p-6">
                    <Target size={18} className="shrink-0 text-fg/40" />
                    <p className="text-[13.5px] leading-relaxed text-fg/55">
                      Former national players and Level II coaches head every
                      senior squad — cricket, athletics, swimming and rugby.
                    </p>
                  </div>
                </Reveal>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-surface py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <div className="flex flex-col items-start justify-between gap-8 rounded-2xl bg-card p-8 text-white md:flex-row md:items-center md:p-12">
              <div className="flex items-start gap-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold text-ink">
                  <Dumbbell size={22} />
                </span>
                <div>
                  <h3 className="font-display text-2xl font-semibold tracking-[-0.01em]">
                    Trials open every November
                  </h3>
                  <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-white/60">
                    Scholarship places exist for outstanding young athletes.
                    Contact the Director of Sports through the admissions desk.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/news?category=Sports"
                  className="inline-flex items-center gap-2.5 rounded-full border border-white/20 px-6 py-3.5 text-[13px] font-medium text-white transition-colors hover:border-white hover:bg-white hover:text-ink"
                >
                  <Waves size={15} />
                  Sports News
                </Link>
                <Link
                  href="/contact?type=Sports & Co-Curricular"
                  className="inline-flex items-center gap-2.5 rounded-full bg-gold px-6 py-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-white"
                >
                  Contact Sports Desk
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <VisualBlockSections path="/sports" />
      <Footer />
    </main>
  );
}
