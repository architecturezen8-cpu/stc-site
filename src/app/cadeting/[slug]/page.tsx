import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";
import { Reveal } from "@/components/reveal";
import { SiteImage } from "@/components/site-image";
import { CinematicIntro } from "@/components/cadeting/cinematic-intro";
import { CadetExploreLink } from "@/components/cadeting/explore-link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { unitGalleryItems } from "@/db/schema";
import { UNITS, getUnit } from "@/lib/units";
import { resolveCadetIntro } from "@/lib/cadet-intro";
import { getPublishedLogoMap } from "@/lib/logos";

export function generateStaticParams() {
  return UNITS.map((u) => ({ slug: u.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const unit = getUnit(slug);
  if (!unit) return { title: "Unit not found — St. Thomas' College" };
  return {
    title: `${unit.name} — St. Thomas' College, Matale`,
    description: unit.text,
  };
}

export default async function UnitPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const unit = getUnit(slug);
  if (!unit) notFound();

  const others = UNITS.filter((u) => u.slug !== unit.slug);
  const logos = await getPublishedLogoMap();
  const unitLogo = logos[`cadet-crest-${unit.slug}`];
  const intro = await resolveCadetIntro(unit, unitLogo);

  // Admin-managed Unit Gallery takes priority over the built-in frames.
  const managedPhotos = await db
    .select()
    .from(unitGalleryItems)
    .where(eq(unitGalleryItems.unitSlug, unit.slug))
    .orderBy(asc(unitGalleryItems.sortOrder), asc(unitGalleryItems.id));
  const galleryFrames = managedPhotos.length
    ? managedPhotos.map((photo) => ({
        image: photo.image,
        caption: photo.title || photo.caption,
        zoom: photo.zoom,
      }))
    : unit.gallery;

  return (
    <main className="relative bg-[#0a0a09] text-white">
      <CinematicIntro
        crest={unit.crest}
        name={unit.name}
        tagline={intro.tagline}
        path={`/cadeting/${unit.slug}`}
        enabled={intro.enabled}
        holdMs={intro.holdMs}
        logoId={`cadet-crest-${unit.slug}`}
        logoSrc={intro.logoSrc}
        logoScale={intro.logoScale}
      >
        <Navbar />
        <VisualBlockSections path={`/cadeting/${slug}`} position="top" />

        {/* ——— Scene 1 · Banner ——— */}
        <section className="relative flex min-h-[74svh] items-end overflow-hidden bg-ink text-white">
          <Image
            src={unit.image}
            alt={unit.name}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a09] via-ink/70 to-ink/40" />
          <div className="grain absolute inset-0" />
          {/* Letterbox bars */}
          <span className="absolute inset-x-0 top-0 z-10 h-10 bg-black/90 md:h-12" />
          <span className="absolute inset-x-0 bottom-0 z-10 h-10 bg-black/90 md:h-12" />

          <div className="relative mx-auto w-full max-w-7xl px-5 pb-24 pt-36 md:px-8 md:pb-28">
            <Link
              href="/cadeting"
              className="animate-fade-up group inline-flex items-center gap-2.5 font-sans text-[10px] uppercase tracking-[0.25em] text-white/60 transition-colors hover:text-gold"
            >
              <ArrowLeft
                size={14}
                className="transition-transform duration-300 group-hover:-translate-x-1"
              />
              All Cadeting Units
            </Link>

            <p
              className="animate-fade-up mt-8 flex items-center gap-3 font-sans text-[9.5px] uppercase leading-relaxed tracking-[0.3em] text-gold sm:gap-4 sm:text-[10.5px] sm:tracking-[0.4em]"
              style={{ animationDelay: "120ms" }}
            >
              <span className="hidden h-px w-10 shrink-0 bg-gold sm:block" />
              {unit.tagline}
            </p>
            <h1
              className="animate-fade-up mt-5 max-w-4xl font-display text-[clamp(2.6rem,6.5vw,5.2rem)] font-semibold leading-[1.03] tracking-[-0.03em]"
              style={{ animationDelay: "220ms" }}
            >
              {unit.name}
              <span className="text-gold">.</span>
            </h1>

            {/* Sharp meta strip — gap-based dividers, no border maths */}
            <div
              className="animate-fade-up mt-10 grid grid-cols-2 gap-px bg-white/12 ring-1 ring-white/12 md:mt-12 md:grid-cols-4"
              style={{ animationDelay: "340ms" }}
            >
              {[
                { label: "Founded", value: unit.founded },
                { label: "Unit Strength", value: unit.strength },
                { label: "Honours", value: `${unit.achievements.length} recent` },
                { label: "Unit Insignia", value: unit.crest },
              ].map((m) => (
                <div
                  key={m.label}
                  className="min-w-0 bg-[#0a0a09]/85 px-4 py-4 backdrop-blur-sm sm:px-5"
                >
                  <p className="font-sans text-[8px] uppercase tracking-[0.26em] text-white/45 sm:tracking-[0.3em]">
                    {m.label}
                  </p>
                  <p className="mt-1.5 break-words font-display text-[13.5px] font-semibold leading-snug tracking-[-0.01em] text-gold sm:text-[15px]">
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ——— Scene 2 · Dossier ——— */}
        <section className="border-t border-white/10 bg-[#0a0a09] py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
              {/* Unit logo disc — always a WHITE circle, centred content.
                  Keyed + registry-backed: the image shown here is the SAME
                  `cadet-crest-<slug>` logo used on the list page, the cine
                  intro and the explore transition — change it once and it
                  syncs everywhere. Still marked data-visual-bg so the
                  universal visual editor can attach/adjust the logo. */}
              <Reveal>
                <div className="relative border border-white/12 bg-white/[0.02] lg:sticky lg:top-28">
                  <div className="p-7 sm:p-9 md:p-11">
                    <span
                      data-visual-bg=""
                      data-visual-key={`cadet-crest-${unit.slug}`}
                      data-logo-id={`cadet-crest-${unit.slug}`}
                      data-logo-scale={unitLogo?.src ? unitLogo.scale : undefined}
                      style={
                        unitLogo?.src
                          ? {
                              backgroundImage: `url("${unitLogo.src.replaceAll('"', "%22")}")`,
                              backgroundRepeat: "no-repeat",
                              backgroundPosition: "center",
                              ...(unitLogo.scale !== 100
                                ? { backgroundSize: `${unitLogo.scale}%` }
                                : {}),
                            }
                          : undefined
                      }
                      className="relative grid h-20 w-20 place-items-center rounded-full bg-white text-ink shadow-[0_2px_18px_rgba(0,0,0,0.4)] ring-2 ring-white/60 sm:h-24 sm:w-24 md:h-28 md:w-28"
                    >
                      <span className="absolute inset-[6px] rounded-full border border-ink/20" />
                      <span
                        className={`font-display text-xl font-semibold tracking-[-0.02em] sm:text-2xl ${
                          unitLogo?.src ? "opacity-0" : ""
                        }`}
                      >
                        {unit.crest}
                      </span>
                    </span>
                    <h2 className="mt-7 font-display text-2xl font-semibold tracking-[-0.01em]">
                      {unit.name}
                    </h2>
                    <p className="mt-2 font-sans text-[9.5px] uppercase tracking-[0.26em] text-gold">
                      {unit.founded}
                    </p>
                    <span className="mt-6 block h-px w-full bg-white/10" />
                    <p className="mt-5 font-sans text-[10px] uppercase tracking-[0.3em] text-white/45">
                      Field of Duty
                    </p>
                    <div className="mt-3.5 flex flex-wrap gap-2">
                      {unit.highlights.map((h) => (
                        <span
                          key={h}
                          className="border border-white/15 px-3.5 py-1.5 font-sans text-[10.5px] uppercase tracking-[0.14em] text-white/65 transition-colors duration-300 hover:border-gold hover:text-gold"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>

              {/* Copy */}
              <div>
                <Reveal delay={100}>
                  <p className="flex items-center gap-4 font-sans text-[10px] uppercase tracking-[0.4em] text-white/45">
                    <span className="h-px w-10 bg-gold" />
                    The Dossier
                  </p>
                </Reveal>
                <Reveal delay={160}>
                  <h2 className="mt-7 font-display text-3xl font-semibold leading-[1.18] tracking-[-0.02em] text-white/95 md:text-[2.5rem]">
                    {unit.text}
                  </h2>
                </Reveal>
                <div className="mt-9 space-y-6">
                  {unit.description.map((p, i) => (
                    <Reveal key={i} delay={200 + i * 80}>
                      <div className="border-l-2 border-gold/70 pl-6">
                        <p className="text-[15px] leading-[1.85] text-white/60">
                          {p}
                        </p>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ——— Scene 3 · Honours ——— */}
        <section className="border-t border-white/10 bg-[#0d0d0b] py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <Reveal>
              <p className="flex items-center gap-4 font-sans text-[10px] uppercase tracking-[0.4em] text-white/45">
                <span className="h-px w-10 bg-gold" />
                Latest Achievements
              </p>
            </Reveal>
            <Reveal delay={120}>
              <h2 className="mt-7 max-w-xl font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                Honours on the Record
              </h2>
            </Reveal>

            <div className="mt-12 border border-white/12">
              {unit.achievements.map((a, i) => (
                <Reveal key={a.title} delay={i * 70}>
                  <div
                    className={`group grid gap-x-5 gap-y-2 bg-white/[0.015] p-5 transition-colors duration-300 hover:bg-white/[0.05] sm:grid-cols-[88px_1fr] sm:items-baseline md:p-7 ${
                      i !== 0 ? "border-t border-white/12" : ""
                    }`}
                  >
                    <div className="flex items-baseline gap-3 sm:block">
                      <p className="font-display text-2xl font-semibold text-gold md:text-3xl">
                        {a.year}
                      </p>
                      <p className="font-sans text-[9px] uppercase tracking-[0.28em] text-white/30 sm:mt-1">
                        № {String(i + 1).padStart(2, "0")}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-xl font-semibold tracking-[-0.01em] text-white transition-colors duration-300 group-hover:text-gold">
                        {a.title}
                      </h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-white/55">
                        {a.detail}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ——— Scene 4 · Stills ——— */}
        <section className="border-t border-white/10 bg-[#0a0a09] py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="flex flex-wrap items-end justify-between gap-8">
              <div>
                <Reveal>
                  <p className="flex items-center gap-4 font-sans text-[10px] uppercase tracking-[0.4em] text-white/45">
                    <span className="h-px w-10 bg-gold" />
                    Unit Gallery
                  </p>
                </Reveal>
                <Reveal delay={120}>
                  <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                    In the Field
                  </h2>
                </Reveal>
              </div>
              <Reveal delay={180}>
                <Link
                  href="/gallery"
                  className="group inline-flex items-center gap-2.5 rounded-full border border-white/15 px-6 py-3 text-[13px] font-medium text-white/80 transition-all duration-300 hover:border-gold hover:text-gold"
                >
                  Full Campus Gallery
                  <ArrowRight size={14} className="slide-arrow" />
                </Link>
              </Reveal>
            </div>

            <div
              data-structured-content
              className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
            >
              {galleryFrames.map((g, i) => (
                <Reveal key={`${g.image}-${i}`} delay={(i % 4) * 90}>
                  <div className="group relative aspect-[4/5] overflow-hidden bg-black">
                    <SiteImage
                      src={g.image}
                      alt={g.caption}
                      visualKey={`cadet-photo-${unit.slug}-${i}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 25vw"
                      fallbackSrc="/images/hero.jpg"
                      fallbackLabel={g.caption}
                      style={
                        (g as { zoom?: number }).zoom && (g as { zoom?: number }).zoom !== 100
                          ? { transform: `scale(${((g as { zoom?: number }).zoom ?? 100) / 100})` }
                          : undefined
                      }
                      className="object-cover opacity-90 transition-all duration-[1.3s] ease-out group-hover:scale-[1.06] group-hover:opacity-100"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/20" />
                    {/* cinematic hover bars */}
                    <span className="absolute inset-x-0 top-0 h-1 bg-gold/80 opacity-0 transition-all duration-500 group-hover:opacity-100" />
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-gold/80 opacity-0 transition-all duration-500 group-hover:opacity-100" />
                    {/* Stacked caption block — can never overlap */}
                    <div className="absolute inset-x-4 bottom-4 sm:inset-x-5 sm:bottom-5">
                      <p className="line-clamp-3 text-[12.5px] leading-snug text-white/90 sm:text-[13px]">
                        {g.caption}
                      </p>
                      <p className="mt-2 translate-y-1 font-sans text-[8.5px] uppercase tracking-[0.28em] text-gold opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100 sm:text-[9px]">
                        Frame {String(i + 1).padStart(2, "0")}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ——— Scene 5 · Other units ——— */}
        <section className="border-t border-white/10 bg-[#0d0d0b] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <Reveal>
              <p className="flex items-center gap-4 font-sans text-[10px] uppercase tracking-[0.4em] text-white/45">
                <span className="h-px w-10 bg-gold" />
                Other Units
              </p>
            </Reveal>
            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {others.map((o, i) => (
                <Reveal key={o.slug} delay={i * 80} className="h-full">
                  <CadetExploreLink
                    href={`/cadeting/${o.slug}`}
                    unitName={o.name}
                    crest={o.crest}
                    tagline={o.tagline}
                    logoId={`cadet-crest-${o.slug}`}
                    logoSrc={logos[`cadet-crest-${o.slug}`]?.src}
                    logoScale={logos[`cadet-crest-${o.slug}`]?.scale}
                    className="group flex h-full items-center gap-4 border border-white/12 bg-white/[0.02] p-5 transition-all duration-300 hover:border-gold/60 hover:bg-white/[0.05]"
                  >
                    <span
                      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink ring-1 ring-ink/15 bg-cover bg-center"
                      style={
                        logos[`cadet-crest-${o.slug}`]?.src
                          ? {
                              backgroundImage: `url("${
                                logos[`cadet-crest-${o.slug}`].src
                              }")`,
                              backgroundRepeat: "no-repeat",
                              backgroundPosition: "center",
                            }
                          : undefined
                      }
                    >
                      <span className="absolute inset-[3px] rounded-full border border-ink/20" />
                      <span
                        className={`font-display text-[11px] font-semibold ${
                          logos[`cadet-crest-${o.slug}`]?.src ? "opacity-0" : ""
                        }`}
                      >
                        {o.crest}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-base font-semibold tracking-[-0.01em] text-white">
                        {o.name}
                      </span>
                      <span className="mt-0.5 block font-sans text-[9px] uppercase tracking-[0.2em] text-white/45">
                        {o.strength}
                      </span>
                    </span>
                    <ArrowRight
                      size={15}
                      className="slide-arrow ml-auto shrink-0 text-white/40 group-hover:text-gold"
                    />
                  </CadetExploreLink>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <VisualBlockSections path={`/cadeting/${slug}`} position="bottom" />
      <Footer />
      </CinematicIntro>
    </main>
  );
}
