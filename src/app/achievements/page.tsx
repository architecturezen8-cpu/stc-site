import Image from "next/image";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { PostCard } from "@/components/news/post-card";
import { SCENE } from "@/lib/media";
import { Crest } from "@/components/crest";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";
import { getPublishedLogoMap } from "@/lib/logos";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Achievements — St. Thomas' College",
  description:
    "National titles, island ranks and championship honours won by the students of St. Thomas' College.",
};

const trophyWall = [
  {
    crest: "SS",
    year: "2026",
    title: "All-Island Science Fair — Champions",
    detail:
      "First place among 140 schools for the solar-harvest module designed by the senior research team.",
    image: "/images/news-science.jpg",
  },
  {
    crest: "DS",
    year: "2026",
    title: "National Schools Debating Champions",
    detail:
      "A national title with best speaker of the tournament — BMICH, Colombo.",
    image: "/images/clubs.jpg",
  },
  {
    crest: "AC",
    year: "2026",
    title: "Central Province Athletics — 9 Golds",
    detail:
      "Second overall among 62 schools; the U19 4x100m record stood since 2011 — until now.",
    image: "/images/sports.jpg",
  },
  {
    crest: "1XI",
    year: "2025",
    title: "All-Island Schools Cricket — Semi-Finalists",
    detail:
      "The First XI reached the last four of the knockout, the best campaign in fifteen seasons.",
    image: "/images/news-sports.jpg",
  },
  {
    crest: "HC",
    year: "2025",
    title: "Under-19 Hockey — Island Champions",
    detail:
      "The Matale Thomians took the all-island under-19 hockey crown, continuing a proud college tradition.",
    image: SCENE.hockey,
  },
  {
    crest: "WB",
    year: "2025",
    title: "All-Island Western Music — Band Gold",
    detail:
      "The Western Band earned gold classification at the national evaluation for the third consecutive year.",
    image: SCENE.westernBand,
  },
];

const ledger = [
  { value: "300+", label: "National Titles" },
  { value: "41", label: "Championships Since 2015" },
  { value: "14", label: "Island Ranks in 2026" },
  { value: "9", label: "Provincial Records Held" },
];

/** Stable registry slug for a trophy-wall crest. */
function honourSlug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default async function AchievementsPage() {
  await ensureSeed();
  const logos = await getPublishedLogoMap();

  const achievementPosts = await db
    .select()
    .from(posts)
    .where(eq(posts.category, "Achievements"))
    .orderBy(desc(posts.publishedAt))
    .limit(3);

  return (
    <main className="relative bg-surface text-fg">
      <Navbar />

      {/* Hero */}
      <section className="relative flex min-h-[58svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src="/images/news-science.jpg"
          alt="Students celebrating at the science fair"
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
              Honours &amp; Titles
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            Achievements<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-white/65"
            style={{ animationDelay: "280ms" }}
          >
            Five decades of national titles — won in laboratories, on
            podiums, and under floodlights.
          </p>
        </div>
      </section>

      {/* Trophy wall */}
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div>
              <Reveal>
                <Eyebrow>The Trophy Wall</Eyebrow>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-7 max-w-xl font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                  Recent{" "}
                  <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                    Achievements
                  </span>
                </h2>
              </Reveal>
            </div>
            <Reveal delay={180}>
              <p className="max-w-sm text-[15px] leading-relaxed text-fg/60">
                The latest honours from the last two seasons — the archive
                runs much deeper.
              </p>
            </Reveal>
          </div>

          <div data-structured-content className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {trophyWall.map((t, i) => {
              return (
                <Reveal key={t.title} delay={(i % 3) * 100} className="h-full">
                  <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card text-white transition-all duration-500 hover:-translate-y-1.5 hover:shadow-lift">
                    <div className="relative m-2.5 mb-0 aspect-[16/10] overflow-hidden rounded-[1rem] bg-ink">
                      <Image
                        src={t.image}
                        alt={t.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-[1.06]"
                      />
                      <Crest
                        initials={t.crest}
                        label={t.title}
                        className="absolute left-3 top-3"
                        visualKey={`honour-crest-${honourSlug(t.title)}`}
                        logoId={`honour-crest-${honourSlug(t.title)}`}
                        logoSrc={logos[`honour-crest-${honourSlug(t.title)}`]?.src}
                        logoScale={logos[`honour-crest-${honourSlug(t.title)}`]?.scale}
                      />
                      <span className="absolute right-3 top-3 rounded-full bg-ink/85 px-3.5 py-1.5 font-sans text-[9px] uppercase tracking-[0.22em] text-mist">
                        {t.year}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col p-7">
                      <h3 className="font-display text-[1.45rem] font-semibold leading-[1.2] tracking-[-0.01em]">
                        {t.title}
                      </h3>
                      <span className="mt-4 block h-px w-7 bg-gold" />
                      <p className="mt-4 text-[14px] leading-relaxed text-white/60">
                        {t.detail}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

          {/* Ledger */}
          <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {ledger.map((s, i) => (
              <Reveal key={s.label} delay={i * 100} className="h-full">
                <div className="h-full rounded-2xl border border-fg/10 bg-surface-2 p-7 dark:border-transparent dark:bg-card">
                  <p className="font-display text-4xl font-semibold tracking-[-0.03em] lg:text-5xl dark:text-white">
                    {s.value}
                  </p>
                  <span className="mb-3 mt-6 block h-px w-7 bg-gold" />
                  <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-fg/50 dark:text-white/50">
                    {s.label}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* From the newsroom */}
      {achievementPosts.length > 0 && (
        <section className="bg-surface-2 py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="flex flex-wrap items-end justify-between gap-8">
              <div>
                <Reveal>
                  <Eyebrow>From the Newsroom</Eyebrow>
                </Reveal>
                <Reveal delay={120}>
                  <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                    Achievement Highlights
                  </h2>
                </Reveal>
              </div>
              <Reveal delay={180}>
                <Link
                  href="/news?category=Achievements"
                  className="group inline-flex items-center gap-2.5 rounded-full bg-fg px-6 py-3 text-[13px] font-medium text-surface transition-colors duration-300 hover:border-fg/20 hover:bg-surface hover:text-fg hover:border"
                >
                  All Achievement Stories
                  <ArrowRight size={14} className="slide-arrow" />
                </Link>
              </Reveal>
            </div>

            <div className="mt-12 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
              {achievementPosts.map((post, i) => (
                <Reveal key={post.id} delay={i * 120} className="h-full">
                  <PostCard post={post} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <VisualBlockSections path="/achievements" />
      <Footer />
    </main>
  );
}
