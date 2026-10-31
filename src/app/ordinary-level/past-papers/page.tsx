import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { PastPapersClient } from "@/components/ol/past-papers-client";
import { PAPERWIKI, PAPER_YEARS } from "@/lib/ol";

export const metadata = {
  title: "O/L Past Papers — Online Resources · St. Thomas' College, Matale",
  description:
    "Free G.C.E. Ordinary Level past papers from 2016 onwards in Sinhala, Tamil and English medium — Sinhala, Mathematics, English, Buddhism, Science and History.",
};

export default function OLPastPapersPage() {
  return (
    <main className="relative overflow-x-clip bg-surface text-fg">
      <Navbar />
      <VisualBlockSections path="/ordinary-level/past-papers" position="top" />

      {/* Hero */}
      <section className="relative flex min-h-[520px] items-end overflow-hidden bg-ink text-white md:min-h-[54svh]">
        <Image
          src="/images/senior-school.jpg"
          alt="Students preparing for the Ordinary Level examination"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-ink/78" />
        <div className="grain absolute inset-0" />

        <div className="relative mx-auto w-full max-w-7xl px-4 pb-12 pt-28 sm:px-5 sm:pb-16 sm:pt-32 md:px-8 md:pb-20">
          <Link
            href="/ordinary-level"
            className="animate-fade-up group inline-flex items-center gap-2.5 font-sans text-[9px] uppercase tracking-[0.2em] text-white/60 transition-colors hover:text-gold sm:text-[10px] sm:tracking-[0.25em]"
          >
            <ArrowLeft
              size={14}
              className="transition-transform duration-300 group-hover:-translate-x-1"
            />
            Back to Ordinary Level
          </Link>

          <p
            className="animate-fade-up mt-6 font-sans text-[9px] uppercase leading-[1.7] tracking-[0.22em] text-gold sm:mt-7 sm:text-[10px] sm:tracking-[0.34em]"
            style={{ animationDelay: "120ms" }}
          >
            Online Resources · Free Downloads
          </p>
          <h1
            className="animate-fade-up mt-4 max-w-4xl break-words font-display text-[clamp(2.05rem,9vw,4.4rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "200ms" }}
          >
            O/L Past Papers<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-5 max-w-xl text-[14.5px] leading-relaxed text-white/65 sm:text-base"
            style={{ animationDelay: "300ms" }}
          >
            Department of Examinations past papers from {PAPER_YEARS.at(-1)} to{" "}
            {PAPER_YEARS[0]}, in all three mediums. Choose your medium, pick a
            subject, then open the year you need.
          </p>
        </div>
      </section>

      {/* Browser */}
      <section className="bg-surface py-16 sm:py-20 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <Reveal>
            <Eyebrow>Past Paper Library</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-2xl font-display text-3xl font-semibold leading-[1.12] tracking-[-0.02em] sm:text-4xl md:text-5xl">
              Browse by medium, subject &amp;{" "}
              <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                year
              </span>
            </h2>
          </Reveal>

          <div className="mt-10 sm:mt-12">
            <PastPapersClient />
          </div>
        </div>
      </section>

      {/* Source note */}
      <section className="bg-surface-2 py-14 sm:py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8">
          <Reveal>
            <div className="flex flex-col items-start gap-6 rounded-xl border border-fg/10 bg-surface p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold text-ink">
                  <Info size={17} />
                </span>
                <div className="min-w-0">
                  <h3 className="break-words font-display text-lg font-semibold tracking-[-0.01em] sm:text-xl">
                    Papers are hosted by Past Papers WiKi
                  </h3>
                  <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-fg/60">
                    St. Thomas&apos; College does not host or store any
                    examination paper. Every link above opens the matching
                    collection on Past Papers WiKi, Sri Lanka&apos;s largest
                    free library of Department of Examinations past papers and
                    marking schemes, in Sinhala, Tamil and English. All
                    downloads there are free of charge.
                  </p>
                </div>
              </div>

              <a
                href={PAPERWIKI}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full shrink-0 items-center justify-center gap-2.5 rounded-full border border-fg/15 px-6 py-3.5 text-[12.5px] font-medium text-fg transition-colors hover:border-fg hover:bg-fg hover:text-surface lg:w-auto"
              >
                Visit pastpapers.wiki
                <ExternalLink size={14} className="shrink-0" />
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <VisualBlockSections path="/ordinary-level/past-papers" position="bottom" />
      <Footer />
    </main>
  );
}
