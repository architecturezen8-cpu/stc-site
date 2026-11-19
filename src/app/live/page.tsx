import Image from "next/image";
import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import {
  ArrowUpRight,
  Camera,
  ExternalLink,
  Play,
  Radio,
  Tv,
} from "lucide-react";
import { db } from "@/db";
import { liveStreams, type LiveStream } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { PlatformIconForUrl } from "@/components/platform-icon";
import { SCENE } from "@/lib/media";
import { effectiveEmbed, LIVE_PLATFORMS } from "@/lib/live";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Live — St. Thomas' College, Matale",
  description:
    "Watch college events live — sports meets, ceremonies and celebrations streamed on YouTube, Facebook, Instagram and TikTok.",
};

function PlatformBadge({ platform }: { platform: string }) {
  const label = LIVE_PLATFORMS.find((p) => p.value === platform)?.label ?? platform;
  const Icon = platform === "youtube" ? Play : platform === "instagram" ? Camera : ExternalLink;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">
      <Icon size={11} /> {label}
    </span>
  );
}

/**
 * Premium clean badges (see .live-badge in globals.css):
 * flat glass chip + calm LED dot — no sheen, no glow.
 */
function BadgeDot() {
  return (
    <span className="live-badge__dot" aria-hidden="true">
      <span className="live-badge__ping" />
      <span className="live-badge__core" />
    </span>
  );
}

/** Blinking ON AIR pill used in the hero and on the featured card. */
function OnAirPill({ detail }: { detail?: string }) {
  return (
    <span className="live-badge live-badge--onair">
      <BadgeDot />
      On Air Now
      {detail && (
        <>
          <span className="live-badge__divider" aria-hidden="true" />
          <span className="live-badge__detail">{detail}</span>
        </>
      )}
    </span>
  );
}

function ScheduledPill({ detail }: { detail?: string }) {
  return (
    <span className="live-badge live-badge--scheduled">
      <BadgeDot />
      Scheduled
      {detail && (
        <>
          <span className="live-badge__divider" aria-hidden="true" />
          <span className="live-badge__detail">{detail}</span>
        </>
      )}
    </span>
  );
}

const BADGE_TIME = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function StreamLinks({ stream }: { stream: LiveStream }) {
  const links = (stream.links ?? []).filter((l) => l?.label && l?.url);
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link, i) => (
        <a
          key={`${link.url}-${i}`}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-[11px] font-medium text-white/70 transition-colors hover:border-gold hover:text-gold"
        >
          <PlatformIconForUrl url={link.url ?? ""} size={12} /> {link.label}
        </a>
      ))}
    </div>
  );
}

export default async function LivePage() {
  await ensureSeed();
  const rows = await db
    .select()
    .from(liveStreams)
    .orderBy(desc(liveStreams.liveMode), asc(liveStreams.sortOrder), desc(liveStreams.id));

  const onAir = rows.find((r) => r.liveMode) ?? null;
  const now = new Date();
  const upcoming = rows.filter((r) => !r.liveMode && r.scheduledAt && r.scheduledAt > now);
  const archive = rows.filter((r) => !r.liveMode && !(r.scheduledAt && r.scheduledAt > now));
  const onAirPlatform =
    LIVE_PLATFORMS.find((p) => p.value === onAir?.platform)?.label ?? onAir?.platform;
  const nextTime = upcoming[0]?.scheduledAt
    ? BADGE_TIME.format(new Date(upcoming[0].scheduledAt))
    : undefined;

  return (
    <main className="relative bg-surface text-fg">
      <Navbar />
      <VisualBlockSections path="/live" position="top" />

      {/* Hero */}
      <section className="relative flex min-h-[52svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src={SCENE.cadetParade}
          alt="St. Thomas' College grounds during a live event"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/30" />
        <div className="relative mx-auto w-full max-w-7xl px-5 pb-14 pt-32 md:px-8">
          <Reveal>
            <Eyebrow tone="light">News &amp; Events · Live</Eyebrow>
            {/* v2.8.88.1 — this heading's wording follows the DB state
                (on-air / scheduled / idle); locked so a visual patch can
                never freeze one state's text over another. */}
            <h1
              data-structured-content
              className="mt-4 font-display text-4xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl md:text-6xl"
            >
              {onAir ? (
                <>
                  We are <span className="text-gold">live</span> right now.
                </>
              ) : upcoming.length ? (
                <>
                  A live stream is <span className="text-gold">coming up</span>.
                </>
              ) : (
                <>
                  Live from <span className="text-gold">Matale</span>.
                </>
              )}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
              College events streamed live — big matches, annual ceremonies and celebrations on
              YouTube, Facebook, Instagram and TikTok.
            </p>
            {/* v2.8.88.1 — the on-air/scheduled pill reflects live DB state;
                locked from element editing. */}
            <div data-structured-content className="mt-6">
              {onAir ? (
                <OnAirPill detail={onAirPlatform} />
              ) : upcoming.length ? (
                <ScheduledPill detail={nextTime} />
              ) : (
                <span className="live-badge live-badge--idle">
                  <Tv size={12} aria-hidden="true" /> No live event at the moment
                </span>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* On-air featured stream */}
      {onAir && (
        <section className="mx-auto w-full max-w-7xl px-5 py-14 md:px-8" id="now">
          <Reveal>
            {/* v2.8.88.1 — stream details (title, platform, embed, banner,
                description, links) are admin-managed (Admin → Live); the
                whole card is locked from the visual editor. */}
            <div
              data-structured-content
              className="overflow-hidden rounded-3xl border border-red-500/25 bg-ink text-white shadow-lift"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <OnAirPill />
                  <h2 className="font-display text-lg font-semibold leading-tight tracking-[-0.01em] sm:text-xl">
                    {onAir.title}
                  </h2>
                </div>
                <PlatformBadge platform={onAir.platform} />
              </div>

              <div className="relative aspect-video w-full bg-black">
                {(() => {
                  const embed = effectiveEmbed(onAir.url, onAir.platform, onAir.embedUrl);
                  if (embed) {
                    return (
                      <iframe
                        src={embed}
                        title={onAir.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        className="absolute inset-0 h-full w-full"
                      />
                    );
                  }
                  // Platforms without a reliable inline embed → banner + link out
                  return (
                    <div className="absolute inset-0">
                      {onAir.bannerUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={onAir.bannerUrl}
                          alt={onAir.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center">
                          <Radio size={44} className="text-white/25" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink/60 p-6 text-center">
                        <a
                          href={onAir.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full bg-red-500 px-7 py-3.5 text-sm font-bold text-white transition-transform hover:scale-[1.03]"
                        >
                          <ExternalLink size={15} />
                          Watch live on{" "}
                          {LIVE_PLATFORMS.find((p) => p.value === onAir.platform)?.label ??
                            onAir.platform}
                        </a>
                        <p className="max-w-md text-xs text-white/60">
                          This platform does not allow playing the stream on other websites — tap
                          above to watch it there.
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {(onAir.description || (onAir.links ?? []).length > 0) && (
                <div className="space-y-4 px-6 py-5">
                  {onAir.description && (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-white/65">
                      {onAir.description}
                    </p>
                  )}
                  <StreamLinks stream={onAir} />
                </div>
              )}
            </div>
          </Reveal>
        </section>
      )}

      {/* Upcoming streams */}
      {upcoming.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-5 pb-6 pt-2 md:px-8" id="upcoming">
          <Reveal>
            <Eyebrow>Coming up live</Eyebrow>
          </Reveal>
          {/* v2.8.88.1 — upcoming stream cards are admin-managed data;
              locked from the visual editor. */}
          <div data-structured-content className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((stream, i) => (
              <Reveal key={stream.id} delay={i * 60}>
                <article className="group h-full overflow-hidden rounded-3xl border border-fg/10 bg-surface shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                  <div className="relative h-44 overflow-hidden bg-ink">
                    {stream.bannerUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={stream.bannerUrl}
                        alt={stream.title}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <Radio size={34} className="text-white/25" />
                      </div>
                    )}
                    <span className="live-badge live-badge--scheduled live-badge--mini absolute left-4 top-4">
                      <span className="live-badge__dot" aria-hidden="true">
                        <span className="live-badge__ping" />
                        <span className="live-badge__core" />
                      </span>
                      Scheduled
                    </span>
                  </div>
                  <div className="space-y-3 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-base font-semibold leading-snug tracking-[-0.01em]">
                        {stream.title}
                      </h3>
                      <PlatformBadge platform={stream.platform} />
                    </div>
                    <p className="text-xs font-medium text-fg/50">
                      {stream.scheduledAt
                        ? new Date(stream.scheduledAt).toLocaleString("en-GB", {
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </p>
                    {stream.description && (
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-fg/60">
                        {stream.description}
                      </p>
                    )}
                    <StreamLinks stream={stream} />
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* Archive / other streams */}
      {archive.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-5 py-12 md:px-8" id="archive">
          <Reveal>
            <Eyebrow>{onAir ? "More streams" : "Our streams"}</Eyebrow>
          </Reveal>
          {/* v2.8.88.1 — archive stream cards are admin-managed data;
              locked from the visual editor. */}
          <div data-structured-content className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {archive.map((stream, i) => (
              <Reveal key={stream.id} delay={i * 60}>
                <article className="group h-full overflow-hidden rounded-3xl border border-fg/10 bg-surface shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                  <div className="relative h-44 overflow-hidden bg-ink">
                    {stream.bannerUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={stream.bannerUrl}
                        alt={stream.title}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <Tv size={34} className="text-white/25" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-base font-semibold leading-snug tracking-[-0.01em]">
                        {stream.title}
                      </h3>
                      <PlatformBadge platform={stream.platform} />
                    </div>
                    {stream.description && (
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-fg/60">
                        {stream.description}
                      </p>
                    )}
                    <a
                      href={stream.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-fg transition-colors hover:text-gold"
                    >
                      Watch <ArrowUpRight size={13} />
                    </a>
                    <StreamLinks stream={stream} />
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!onAir && !upcoming.length && !archive.length && (
        <section className="mx-auto w-full max-w-3xl px-5 py-20 text-center md:px-8">
          <Reveal>
            <div className="rounded-3xl border border-dashed border-fg/15 px-6 py-16">
              <Tv size={40} className="mx-auto text-fg/25" />
              <h2 className="mt-5 font-display text-2xl font-semibold tracking-[-0.01em]">
                No live streams published yet
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fg/55">
                When the college goes live — sports, ceremonies, concerts — the stream will appear
                here and the navbar will blink red.
              </p>
              <Link
                href="/news"
                className="mt-7 inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-[13px] font-semibold text-ink transition-colors hover:bg-fg hover:text-surface"
              >
                Back to News &amp; Events
              </Link>
            </div>
          </Reveal>
        </section>
      )}

      <VisualBlockSections path="/live" position="bottom" />
      <Footer />
    </main>
  );
}
