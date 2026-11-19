import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import { ArrowLeft, ArrowRight, Clock, MapPin, User } from "lucide-react";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { visiblePostsCondition } from "@/lib/post-visibility";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { PostCard } from "@/components/news/post-card";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Convert a YouTube watch/short/share URL into a nocookie embed URL. */
function toYouTubeEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "www.youtube.com" || parsed.hostname === "youtube.com" || parsed.hostname === "m.youtube.com") {
      const id = parsed.pathname === "/watch" ? parsed.searchParams.get("v") : parsed.pathname.split("/").filter(Boolean).pop();
      if (parsed.pathname.startsWith("/embed/") && parsed.pathname.length > 7) return `https://www.youtube-nocookie.com${parsed.pathname}`;
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.slice(1);
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await ensureSeed();
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), visiblePostsCondition()));

  if (!post) return { title: "Story not found — St. Thomas' College" };

  return {
    title: `${post.title} — St. Thomas' College`,
    description: post.excerpt,
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await ensureSeed();

  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), visiblePostsCondition()));
  if (!post) notFound();

  const related = await db
    .select()
    .from(posts)
    .where(
      and(
        visiblePostsCondition(),
        eq(posts.category, post.category),
        ne(posts.id, post.id),
      ),
    )
    .orderBy(desc(posts.publishedAt))
    .limit(3);

  const fallback = related.length
    ? related
    : (
        await db
          .select()
          .from(posts)
          .where(and(visiblePostsCondition(), ne(posts.id, post.id)))
          .orderBy(desc(posts.publishedAt))
          .limit(3)
      );

  const paragraphs = post.body.split("\n\n");

  return (
    <main className="relative bg-surface text-fg">
      <Navbar />
      <VisualBlockSections path={`/news/${slug}`} position="top" />

      {/* Cover */}
      <section className="relative flex min-h-[70svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src={post.image}
          alt={post.title}
          fill
          priority
          sizes="100vw"
          className="object-cover"
          style={
            post.imageScale && post.imageScale !== 100
              ? { transform: `scale(${post.imageScale / 100})` }
              : undefined
          }
        />
        <div className="absolute inset-0 bg-ink/72" />
        <div className="grain absolute inset-0" />

        <div className="relative mx-auto w-full max-w-4xl px-5 pb-16 pt-32 md:px-8 md:pb-20">
          <Link
            href="/news"
            className="animate-fade-up group inline-flex items-center gap-2.5 font-sans text-[10px] uppercase tracking-[0.25em] text-white/60 transition-colors hover:text-gold"
          >
            <ArrowLeft
              size={14}
              className="transition-transform duration-300 group-hover:-translate-x-1"
            />
            Back to Newsroom
          </Link>

          <span
            className="animate-fade-up mt-7 inline-block rounded-full bg-gold px-4 py-1.5 font-sans text-[9px] uppercase tracking-[0.25em] text-ink"
            style={{ animationDelay: "120ms" }}
          >
            {post.category}
          </span>

          <h1
            className="animate-fade-up mt-6 font-display text-[clamp(2.1rem,4.8vw,4rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ animationDelay: "220ms" }}
          >
            {post.title}
          </h1>

          <div
            className="animate-fade-up mt-8 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-white/15 pt-6 font-sans text-[10px] uppercase tracking-[0.2em] text-white/55"
            style={{ animationDelay: "340ms" }}
          >
            <span className="text-gold">{formatDate(post.publishedAt)}</span>
            <span className="flex items-center gap-2">
              <User size={13} />
              {post.author}
            </span>
            <span className="flex items-center gap-2">
              <Clock size={13} />
              {post.readMinutes} min read
            </span>
            <span className="flex items-center gap-2">
              <MapPin size={13} />
              {post.location}
            </span>
          </div>
        </div>
      </section>

      {/* Body */}
      <article data-structured-content className="bg-surface py-20 md:py-24">
        <div className="mx-auto max-w-3xl px-5 md:px-8">
          <Reveal>
            <p className="font-display text-2xl font-medium leading-[1.45] tracking-[-0.01em] text-fg md:text-[1.7rem]">
              {post.excerpt}
            </p>
          </Reveal>

          <div className="mt-10 space-y-6 border-t border-fg/10 pt-10">
            {paragraphs.map((paragraph, i) => (
              <Reveal key={i} delay={Math.min(i * 60, 240)}>
                <p className="text-[16.5px] leading-[1.85] text-fg/70">
                  {paragraph}
                </p>
              </Reveal>
            ))}
          </div>

          {/* Story photo strip — up to five optional photos */}
          {post.extraImages?.length > 0 && (
            <div className="mt-12">
              <p className="flex items-center gap-4 font-sans text-[10px] uppercase tracking-[0.4em] text-fg/45">
                <span className="h-px w-10 bg-gold" />
                Story photos
              </p>
              <div
                data-structured-content
                className={`mt-6 grid gap-4 ${post.extraImages.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
              >
                {post.extraImages.map((src, i) => (
                  <Reveal key={`${src}-${i}`} delay={(i % 4) * 80}>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`${post.title} — photo ${i + 1}`}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-[1.2s] ease-out hover:scale-[1.04]"
                      />
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          )}

          {/* Optional videos — YouTube embeds or direct files */}
          {post.videos?.length > 0 && (
            <div className="mt-12">
              <p className="flex items-center gap-4 font-sans text-[10px] uppercase tracking-[0.4em] text-fg/45">
                <span className="h-px w-10 bg-gold" />
                Videos
              </p>
              <div className="mt-6 space-y-6">
                {post.videos.map((url, i) => {
                  const embed = toYouTubeEmbed(url);
                  return (
                    <Reveal key={`${url}-${i}`} delay={(i % 3) * 80}>
                      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
                        {embed ? (
                          <iframe
                            src={embed}
                            title={`${post.title} — video ${i + 1}`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            loading="lazy"
                            className="h-full w-full"
                          />
                        ) : (
                          <video src={url} controls preload="metadata" className="h-full w-full" />
                        )}
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          )}

          {/* Optional further-reading links */}
          {post.links?.length > 0 && (
            <div className="mt-12">
              <p className="flex items-center gap-4 font-sans text-[10px] uppercase tracking-[0.4em] text-fg/45">
                <span className="h-px w-10 bg-gold" />
                Read more
              </p>
              <div className="mt-6 space-y-3">
                {post.links.map((link, i) => (
                  <Reveal key={`${link.url}-${i}`} delay={i * 60}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center justify-between gap-4 rounded-2xl border border-fg/10 bg-white/[0.03] px-5 py-4 transition-colors hover:border-gold/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-display text-[15px] font-semibold text-fg">
                          {link.label}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-fg/45">{link.url}</span>
                      </span>
                      <ArrowRight
                        size={16}
                        className="shrink-0 text-fg/30 transition-all group-hover:translate-x-1 group-hover:text-gold"
                      />
                    </a>
                  </Reveal>
                ))}
              </div>
            </div>
          )}

          {/* Author card */}
          <Reveal delay={120}>
            <div className="mt-14 flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-card px-7 py-7 text-white">
              <div className="flex items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold font-display text-lg font-semibold text-ink">
                  {post.author
                    .replace(/^(Mr|Mrs|Ms|Dr)\.\s*/, "")
                    .charAt(0)}
                </span>
                <div>
                  <p className="font-display text-lg font-semibold tracking-[-0.01em]">
                    {post.author}
                  </p>
                  <p className="mt-0.5 font-sans text-[9px] uppercase tracking-[0.28em] text-white/45">
                    Contributing Editor
                  </p>
                </div>
              </div>
              <Link
                href="/news"
                className="inline-flex items-center gap-2.5 rounded-full border border-white/20 px-6 py-3 text-[13px] font-medium text-white transition-colors duration-300 hover:border-gold hover:bg-gold hover:text-ink"
              >
                More stories
                <ArrowRight size={14} />
              </Link>
            </div>
          </Reveal>
        </div>
      </article>

      {/* Related */}
      {fallback.length > 0 && (
        <section className="bg-surface-2 py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <Reveal>
              <Eyebrow>Related Stories</Eyebrow>
            </Reveal>
            <Reveal delay={120}>
              <h2 className="mt-7 font-display text-3xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                Keep reading
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
              {fallback.map((item, i) => (
                <Reveal key={item.id} delay={i * 120} className="h-full">
                  <PostCard post={item} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <VisualBlockSections path={`/news/${slug}`} position="bottom" />
      <Footer />
    </main>
  );
}
