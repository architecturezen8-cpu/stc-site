import Link from "next/link";
import { ArrowRight, CalendarDays, Pin } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { getLatestPublishedNotices } from "@/lib/notice-board";
import { formatDate } from "@/lib/format";

/**
 * v2.8.85.0 — Homepage Notice Board strip.
 *
 * A compact band under the News & Events section: the latest three published
 * notices (title + date + category), linking to the /notices archive.
 * Renders NOTHING when there is nothing to show — the homepage never
 * carries an empty notice box.
 */
export async function NoticeStrip() {
  const latest = await getLatestPublishedNotices(3);
  if (latest.length === 0) return null;

  return (
    <section
      aria-label="Notice board"
      className="border-y border-fg/10 bg-surface py-16 md:py-20"
    >
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Reveal>
              <Eyebrow>Notice Board</Eyebrow>
            </Reveal>
            <Reveal delay={100}>
              <h2 className="mt-5 font-display text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-fg md:text-4xl">
                Official notices
              </h2>
            </Reveal>
          </div>
          <Reveal delay={180}>
            <Link
              href="/notices"
              className="group inline-flex items-center gap-2.5 rounded-full border border-fg/20 px-6 py-3 text-[13px] font-medium text-fg transition-colors duration-300 hover:border-fg/40 hover:bg-fg hover:text-surface"
            >
              View all notices
              <ArrowRight size={14} className="slide-arrow" />
            </Link>
          </Reveal>
        </div>

        <Reveal delay={120}>
          {/* v2.9.0.0 — the rows are Admin-managed notice data (same policy
              the /notices grid follows since v2.8.88.1): the visual editor
              skips them so an on-site text edit can never be fought by the
              next notice posted from the studio. The heading + button above
              stay freely editable. */}
          <ul
            data-structured-content=""
            className="mt-10 divide-y divide-fg/10 overflow-hidden rounded-[1.25rem] border border-fg/10 bg-card text-white"
          >
            {latest.map((notice) => {
              const date = notice.publishedAt ?? notice.createdAt;
              return (
                <li key={notice.id}>
                  <Link
                    href="/notices"
                    className="group flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-5 transition-colors duration-300 hover:bg-white/[0.04] md:px-7"
                  >
                    {notice.pinned ? (
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold text-ink"
                        title="Pinned notice"
                      >
                        <Pin size={12} className="fill-current" aria-hidden="true" />
                      </span>
                    ) : (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 text-gold">
                        <span className="font-display text-[11px] font-semibold">
                          N
                        </span>
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[15px] font-semibold tracking-[-0.01em] md:text-base">
                        {notice.title}
                      </span>
                      <span className="mt-1 flex items-center gap-3 text-[9.5px] uppercase tracking-[0.2em] text-white/40">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays size={11} className="text-gold" aria-hidden="true" />
                          {date ? formatDate(date) : "Undated"}
                        </span>
                        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[8.5px] tracking-[0.18em] text-white/60">
                          {notice.category}
                        </span>
                      </span>
                    </span>

                    <ArrowRight
                      size={15}
                      aria-hidden="true"
                      className="slide-arrow shrink-0 text-gold"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
