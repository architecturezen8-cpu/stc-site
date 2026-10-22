import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import type { Post } from "@/db/schema";
import { NewBadge } from "@/components/new-badge";
import { formatDate } from "@/lib/format";

export function PostCard({ post }: { post: Post }) {
  return (
    <article data-structured-content className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card text-white transition-all duration-500 hover:-translate-y-1.5 hover:shadow-lift">
      <Link href={`/news/${post.slug}`} className="flex h-full flex-col">
        <div className="relative m-2.5 mb-0 aspect-[16/10] overflow-hidden rounded-[1rem]">
          <Image
            src={post.image}
            alt={post.title}
            width={800}
            height={500}
            className="h-full w-full object-cover transition-transform duration-[1.1s] ease-out group-hover:scale-[1.05]"
          />
          {post.isNew && <NewBadge className="absolute right-3 top-3" />}
        </div>

        <div className="flex flex-1 flex-col gap-3.5 p-6 md:p-7">
          <div className="flex items-center gap-3">
            <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-gold">
              {formatDate(post.publishedAt)}
            </p>
            <span className="h-1 w-1 rounded-full bg-white/30" />
            <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-white/40">
              {post.category}
            </p>
          </div>

          <h3 className="font-display text-2xl font-semibold leading-[1.22] tracking-[-0.01em]">
            {post.title}
          </h3>
          <p className="text-[14.5px] leading-relaxed text-white/55">
            {post.excerpt}
          </p>

          <div className="mt-auto space-y-5 pt-3">
            <p className="flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.18em] text-white/45">
              <MapPin size={13} className="text-gold" />
              {post.location}
            </p>
            <div className="flex items-center justify-between border-t border-white/10 pt-5">
              <span className="font-sans text-[10.5px] uppercase tracking-[0.25em]">
                Read More
              </span>
              <span className="grid h-9 w-9 place-items-center rounded-full border border-white/20 transition-all duration-300 group-hover:border-gold group-hover:bg-gold group-hover:text-ink">
                <ArrowRight size={14} className="slide-arrow" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
