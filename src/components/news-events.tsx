import Link from "next/link";
import { desc } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { Eyebrow } from "@/components/eyebrow";
import { Reveal } from "@/components/reveal";
import { PostCard } from "@/components/news/post-card";

export async function NewsEvents({
  content = {},
}: {
  content?: Record<string, string>;
}) {
  await ensureSeed();

  const latest = await db
    .select()
    .from(posts)
    .orderBy(desc(posts.publishedAt))
    .limit(3);

  return (
    <section id="news" className="scroll-mt-20 bg-surface-2 py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div>
            <Reveal>
              <Eyebrow>{content.eyebrow ?? "News & Events"}</Eyebrow>
            </Reveal>
            <Reveal delay={120}>
              <h2 className="mt-7 max-w-2xl font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-fg md:text-6xl">
                {content.title ?? "Latest News & Events"}
              </h2>
            </Reveal>
          </div>
          <Reveal delay={200}>
            <Link
              href="/news"
              className="group inline-flex items-center gap-2.5 rounded-full border border-transparent bg-fg px-6 py-3 text-[13px] font-medium text-surface transition-colors duration-300 hover:border-fg/20 hover:bg-surface hover:text-fg"
            >
              {content.buttonLabel ?? "View All News"}
              <ArrowRight size={14} className="slide-arrow" />
            </Link>
          </Reveal>
        </div>

        {/* Cards */}
        <div data-structured-content className="mt-14 grid gap-7 md:grid-cols-3">
          {latest.map((post, i) => (
            <Reveal key={post.id} delay={i * 140} className="h-full">
              <PostCard post={post} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
