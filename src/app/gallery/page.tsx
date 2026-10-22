import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Camera, Sparkles } from "lucide-react";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { galleryItems } from "@/db/schema";
import { ensureSeed } from "@/db/seed";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { GalleryClient } from "@/components/gallery/gallery-client";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Campus Gallery — St. Thomas' College",
  description:
    "A visual journey through life at St. Thomas' College: academic rigor, sporting triumphs, arts, and the golden jubilee.",
};

export default async function GalleryPage() {
  await ensureSeed();

  const items = await db
    .select()
    .from(galleryItems)
    .orderBy(asc(galleryItems.sortOrder), asc(galleryItems.id));

  const campusCount = items.filter((i) => i.category === "Campus").length;
  const sportsCount = items.filter((i) => i.category === "Sports").length;
  const artsCount = items.filter((i) => i.category === "Arts & Culture").length;
  const academicsCount = items.filter(
    (i) => i.category === "Academics",
  ).length;

  return (
    <main className="relative bg-surface text-fg">
      <Navbar />

      {/* Hero */}
      <section className="relative flex min-h-[60svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src="/images/about.jpg"
          alt="St. Thomas' College campus library"
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
              Visual Archive
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            Campus Gallery<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-white/65"
            style={{ animationDelay: "280ms" }}
          >
            Explore moments of college life — academics, sports, culture and
            campus — captured through the years.
          </p>

          <div
            className="animate-fade-up mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/15 pt-6"
            style={{ animationDelay: "400ms" }}
          >
            {[
              { value: items.length, label: "Photographs" },
              { value: campusCount, label: "Campus Architecture" },
              { value: academicsCount, label: "Academics & Labs" },
              { value: sportsCount + artsCount, label: "Sports & Arts" },
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

      {/* Main Gallery Section */}
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div>
              <Reveal>
                <Eyebrow>Archive Collection</Eyebrow>
              </Reveal>
              <Reveal delay={120}>
                <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
                  Moments of{" "}
                  <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                    distinction
                  </span>
                </h2>
              </Reveal>
            </div>
            <Reveal delay={200}>
              <p className="max-w-md text-[15px] leading-relaxed text-fg/60">
                Click any photograph to view high resolution, captions and
                archival details.
              </p>
            </Reveal>
          </div>

          <div className="mt-12">
            <GalleryClient items={items} />
          </div>
        </div>
      </section>

      {/* Archival Note Banner */}
      <section className="bg-surface-2 py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <div className="flex flex-col items-start justify-between gap-8 rounded-2xl bg-card p-8 text-white md:flex-row md:items-center md:p-12">
              <div className="flex items-start gap-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold text-ink">
                  <Camera size={22} />
                </span>
                <div>
                  <h3 className="font-display text-2xl font-semibold tracking-[-0.01em]">
                    Submit Archival Photographs
                  </h3>
                  <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-white/60">
                    Are you an alumnus with photographs of historic matches,
                    prize givings or assemblies? We are continually expanding the
                    college digital archive.
                  </p>
                </div>
              </div>
              <Link
                href="/contact?type=Media"
                className="inline-flex shrink-0 items-center gap-2.5 rounded-full bg-gold px-7 py-3.5 text-[13px] font-medium text-ink transition-colors duration-300 hover:bg-white"
              >
                Contact Archivist
                <ArrowRight size={15} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <VisualBlockSections path="/gallery" />
      <Footer />
    </main>
  );
}
