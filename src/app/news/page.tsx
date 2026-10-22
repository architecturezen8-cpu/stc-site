import Image from "next/image";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";
import { db } from "@/db";
import { events, posts } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { PostCard } from "@/components/news/post-card";
import { CategoryFilter } from "@/components/news/category-filter";
import { NewBadge } from "@/components/new-badge";
import { formatDate } from "@/lib/format";
import { EventsCalendar } from "@/components/news/events-calendar";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "News & Events — St. Thomas' College",
  description:
    "The latest stories, achievements and upcoming events from St. Thomas' College, Matale.",
};

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await ensureSeed();
  const { category = "" } = await searchParams;

  const allPosts = await db
    .select()
    .from(posts)
    .orderBy(desc(posts.publishedAt));

  const featured =
    allPosts.find((p) => p.featured) ?? allPosts[0] ?? null;

  const filtered =
    category && category !== "All"
      ? allPosts.filter((p) => p.category === category)
      : allPosts.filter((p) => p.id !== featured?.id);

  const upcoming = await db
    .select()
    .from(events)
    .orderBy(events.startsAt);

  const announcementCount = allPosts.filter(
    (p) => p.category === "Announcements",
  ).length;

  const categories = Array.from(
    new Set(allPosts.map((post) => post.category)),
  ).sort();

  return (
    <main className="relative bg-surface text-fg">
      <Navbar />

      {/* Page header */}
      <section className="relative flex min-h-[62svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src="/images/hero.jpg"
          alt="St. Thomas' College campus"
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
              The Newsroom
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            News &amp; Events<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-white/65"
            style={{ animationDelay: "280ms" }}
          >
            Stories from the College — achievements, fixtures, festivals and
            announcements, as they happen.
          </p>

          <div
            className="animate-fade-up mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/15 pt-6"
            style={{ animationDelay: "400ms" }}
          >
            {[
              { value: allPosts.length, label: "Stories Published" },
              { value: upcoming.length, label: "Upcoming Events" },
              { value: announcementCount, label: "Announcements" },
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

      {/* Featured story */}
      {featured && !category && (
        <section className="bg-surface py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <Reveal>
              <Eyebrow>Featured Story</Eyebrow>
            </Reveal>

            <Reveal delay={120}>
              <Link
                href={`/news/${featured.slug}`}
                className="group mt-8 grid items-center gap-10 overflow-hidden rounded-[1.5rem] bg-card p-2.5 text-white lg:grid-cols-2 lg:gap-0"
              >
                <div className="relative aspect-[16/11] overflow-hidden rounded-[1.25rem]">
                  <Image
                    src={featured.image}
                    alt={featured.title}
                    width={1200}
                    height={825}
                    className="h-full w-full object-cover transition-transform duration-[1.4s] ease-out group-hover:scale-[1.05]"
                  />
                  {featured.isNew && <NewBadge className="absolute right-3 top-3" />}
                </div>

                <div className="px-4 pb-8 lg:px-12 lg:pb-0">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-gold px-3.5 py-1.5 font-sans text-[9px] uppercase tracking-[0.25em] text-ink">
                      {featured.category}
                    </span>
                    <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-white/45">
                      {formatDate(featured.publishedAt)}
                    </p>
                  </div>

                  <h2 className="mt-6 font-display text-3xl font-semibold leading-[1.12] tracking-[-0.02em] md:text-5xl">
                    {featured.title}
                  </h2>
                  <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/55">
                    {featured.excerpt}
                  </p>

                  <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 font-sans text-[10px] uppercase tracking-[0.2em] text-white/45">
                    <span className="flex items-center gap-2">
                      <MapPin size={13} className="text-gold" />
                      {featured.location}
                    </span>
                    <span className="flex items-center gap-2">
                      <Clock size={13} className="text-gold" />
                      {featured.readMinutes} min read
                    </span>
                  </div>

                  <span className="mt-9 inline-flex items-center gap-3 rounded-full bg-gold px-7 py-3.5 text-[13px] font-medium text-ink transition-colors duration-300 group-hover:bg-white">
                    Read Full Story
                    <ArrowRight size={15} className="slide-arrow" />
                  </span>
                </div>
              </Link>
            </Reveal>
          </div>
        </section>
      )}

      {/* Latest news grid */}
      <section id="latest" className="scroll-mt-24 bg-surface-2 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div>
              <Reveal>
                <Eyebrow>Latest News</Eyebrow>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                  {category ? `${category}` : "All stories"}
                </h2>
              </Reveal>
            </div>
            <Reveal delay={200}>
              <CategoryFilter active={category} categories={categories} />
            </Reveal>
          </div>

          {filtered.length > 0 ? (
            <div className="mt-12 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((post, i) => (
                <Reveal key={post.id} delay={(i % 3) * 120} className="h-full">
                  <PostCard post={post} />
                </Reveal>
              ))}
            </div>
          ) : (
            <div className="mt-12 rounded-2xl border border-dashed border-fg/20 px-8 py-20 text-center">
              <p className="font-display text-2xl font-semibold">
                No stories in this category yet.
              </p>
              <Link
                href="/news"
                className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-fg px-6 py-3 text-[13px] font-medium text-surface"
              >
                View all stories
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Upcoming events */}
      <section id="events" className="scroll-mt-24 bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div>
              <Reveal>
                <Eyebrow>Upcoming Events</Eyebrow>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-7 max-w-xl font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                  Upcoming{" "}
                  <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                    Events
                  </span>
                </h2>
              </Reveal>
            </div>
            <Reveal delay={200}>
              <p className="max-w-sm text-[15px] leading-relaxed text-fg/60">
                Ceremonies, fixtures and admissions dates for the term ahead.
                All times are local to Colombo.
              </p>
            </Reveal>
          </div>

          <Reveal delay={120} className="mt-12 block">
            <EventsCalendar
              events={upcoming.map((e) => ({
                id: e.id,
                title: e.title,
                description: e.description,
                category: e.category,
                startsAt: e.startsAt.toISOString(),
                timeLabel: e.timeLabel,
                location: e.location,
                isNew: e.isNew,
              }))}
            />
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4 rounded-2xl bg-card px-8 py-10 text-center text-white">
              <CalendarDays size={20} className="text-gold" />
              <p className="font-display text-xl font-semibold tracking-[-0.01em] md:text-2xl">
                Never miss a college event
              </p>
              <Link
                href="/#contact"
                className="inline-flex items-center gap-2.5 rounded-full bg-gold px-6 py-3 text-[13px] font-medium text-ink transition-colors duration-300 hover:bg-white"
              >
                Subscribe to updates
                <ArrowRight size={14} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <VisualBlockSections path="/news" />
      <Footer />
    </main>
  );
}
