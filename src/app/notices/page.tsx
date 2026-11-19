import { CalendarDays, Megaphone, Pin } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { SiteImage } from "@/components/site-image";
import { ExpandableNoticeBody } from "@/components/notices/expandable-notice-body";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";
import { getPublishedNotices } from "@/lib/notice-board";
import { formatDate } from "@/lib/format";
import type { Notice } from "@/db/schema";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notice Board — St. Thomas' College",
  description:
    "Official notices from the school office — admissions, examinations, events and general announcements for students, parents and well-wishers.",
};

function NoticeDate({ notice }: { notice: Notice }) {
  const date = notice.publishedAt ?? notice.createdAt;
  return (
    <p className="flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.28em] text-white/45">
      <CalendarDays size={13} className="text-gold" />
      {date ? formatDate(date) : "Undated"}
    </p>
  );
}

function NoticeCard({ notice }: { notice: Notice }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[1.5rem] bg-card text-white">
      {notice.image && (
        <div className="relative aspect-[16/9] overflow-hidden">
          <SiteImage
            src={notice.image}
            alt={notice.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
            fallbackLabel={notice.title}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col p-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-gold px-3.5 py-1.5 font-sans text-[9px] uppercase tracking-[0.25em] text-ink">
            {notice.category}
          </span>
          {notice.pinned && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/50 px-3 py-1.5 font-sans text-[9px] uppercase tracking-[0.25em] text-gold">
              <Pin size={10} className="fill-current" aria-hidden="true" />
              Pinned
            </span>
          )}
        </div>

        <h2 className="mt-5 font-display text-2xl font-semibold leading-[1.15] tracking-[-0.02em]">
          {notice.title}
        </h2>

        <div className="mt-4">
          <ExpandableNoticeBody body={notice.body} />
        </div>

        <div className="mt-auto pt-6">
          <NoticeDate notice={notice} />
        </div>
      </div>
    </article>
  );
}

export default async function NoticesPage() {
  const notices = await getPublishedNotices();

  const pinnedCount = notices.filter((n) => n.pinned).length;
  const categoryCount = new Set(notices.map((n) => n.category)).size;

  return (
    <main className="relative bg-surface text-fg">
      <Navbar />
      <VisualBlockSections path="/notices" position="top" />

      {/* Page header */}
      <section className="relative flex min-h-[58svh] items-end overflow-hidden bg-ink text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,212,68,0.14),transparent_55%)]" />
        <div className="grain absolute inset-0" />

        <div className="relative mx-auto w-full max-w-7xl px-5 pb-16 pt-32 md:px-8 md:pb-20">
          <div className="animate-fade-up flex items-center gap-4">
            <span className="h-px w-12 bg-gold" />
            <p className="font-sans text-[11px] uppercase tracking-[0.4em] text-white/70">
              Official Communications
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            Notice Board<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-white/65"
            style={{ animationDelay: "280ms" }}
          >
            Official announcements from the College office — admissions,
            examinations, events and everything the school community needs to
            know.
          </p>

          {/* v2.8.88.1 — the counts are DB-derived (notices/pinned/categories);
              locked from element editing so visual-editor patches can never
              freeze stale numbers over live admin data. */}
          <div
            data-structured-content
            className="animate-fade-up mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/15 pt-6"
            style={{ animationDelay: "400ms" }}
          >
            {[
              { value: notices.length, label: "Active Notices" },
              { value: pinnedCount, label: "Pinned" },
              { value: categoryCount, label: "Categories" },
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

      {/* Notices grid */}
      <section aria-label="Current notices" className="bg-surface-2 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          {/* v2.8.88.1 — the notices themselves are admin-managed data
              (Admin → Notices); this grid is locked from the visual editor
              so a patch can never mask or distort a live notice. */}
          {notices.length > 0 ? (
            <div data-structured-content className="grid items-stretch gap-7 md:grid-cols-2 lg:grid-cols-3">
              {notices.map((notice, i) => (
                <Reveal key={notice.id} delay={(i % 3) * 120} className="h-full">
                  <NoticeCard notice={notice} />
                </Reveal>
              ))}
            </div>
          ) : (
            <Reveal>
              <div className="mx-auto max-w-2xl rounded-[1.5rem] border border-dashed border-fg/20 bg-card/40 px-8 py-20 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-gold/40 bg-gold/10 text-gold">
                  <Megaphone size={22} aria-hidden="true" />
                </span>
                <h2 className="mt-7 font-display text-2xl font-semibold tracking-[-0.02em] text-fg md:text-3xl">
                  The board is clear for now.
                </h2>
                <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-fg/60">
                  There are no active notices at the moment. Official
                  announcements from the school office will appear here as soon
                  as they are posted.
                </p>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* v2.8.88.0 — the visual editor's appended blocks now have a render
          surface here, matching /live and /forms — part of unlocking the
          three feature pages for the visual editor. */}
      <VisualBlockSections path="/notices" position="bottom" />

      <Footer />
    </main>
  );
}
