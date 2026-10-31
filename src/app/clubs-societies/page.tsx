import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { Crest } from "@/components/crest";
import { CountUp } from "@/components/count-up";
import { NewBadge } from "@/components/new-badge";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";
import { clubSlug } from "@/lib/clubs";
import { getPublishedLogoMap } from "@/lib/logos";
import { getCollegeClubs } from "@/lib/site-lists";

export const metadata = {
  title: "Clubs & Societies — St. Thomas' College",
  description:
    "Over forty clubs and societies at St. Thomas' College — debating, robotics, chess, drama, music and more.",
};

export const dynamic = "force-dynamic";

export default async function ClubsSocietiesPage() {
  /* v2.8.90.0 — the directory is admin-managed (Admin Studio → Clubs &
     Societies); the table is seeded from the original static list, so the
     page looks identical until the office edits it. */
  const clubs = await getCollegeClubs();
  const logos = await getPublishedLogoMap();

  return (
    <main className="relative bg-surface text-fg">
      <Navbar />
      <VisualBlockSections path="/clubs-societies" position="top" />

      {/* Hero */}
      <section className="relative flex min-h-[58svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src="/images/clubs.jpg"
          alt="Students in a society meeting"
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
              Co-Curricular Life
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            Clubs &amp; Societies<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-white/65"
            style={{ animationDelay: "280ms" }}
          >
            Forty societies, one rule: every student joins at least two — and
            stays long enough to lead one.
          </p>

          <div
            className="animate-fade-up mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/15 pt-6"
            style={{ animationDelay: "400ms" }}
          >
            {[
              { value: "40+", label: "Active Societies" },
              { value: "2,100+", label: "Memberships Held" },
              { value: "52", label: "Society Prefects" },
              { value: "14", label: "National Titles Held" },
            ].map((s, i) => (
              <div key={s.label}>
                <p className="font-display text-3xl font-semibold tracking-[-0.02em]">
                  <CountUp value={s.value} delay={i * 110} />
                </p>
                <p className="mt-1 font-sans text-[9px] uppercase tracking-[0.28em] text-white/45">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Clubs grid */}
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <Eyebrow>The Directory</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-xl font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
              Our{" "}
              <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                Clubs &amp; Societies
              </span>
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {clubs.map((c, i) => {
              return (
                <Reveal key={c.name} delay={(i % 3) * 90} className="h-full">
                  <div className="group flex h-full flex-col rounded-2xl border border-fg/10 bg-surface p-7 transition-all duration-300 hover:-translate-y-1 hover:border-fg/25 hover:shadow-soft">
                    <div className="flex items-center justify-between">
                      <Crest
                        initials={c.crest}
                        label={c.name}
                        visualKey={`club-crest-${clubSlug(c.name)}`}
                        logoId={`club-crest-${clubSlug(c.name)}`}
                        logoSrc={logos[`club-crest-${clubSlug(c.name)}`]?.src}
                        logoScale={logos[`club-crest-${clubSlug(c.name)}`]?.scale}
                      />
                      <span className="font-sans text-[9px] uppercase tracking-[0.25em] text-fg/35">
                        Est. {c.founded}
                      </span>
                    </div>
                    <h3 className="mt-5 flex items-center gap-2 font-display text-2xl font-semibold tracking-[-0.01em]">
                      <span className="min-w-0 break-words">{c.name}</span>
                      {c.isNew && <NewBadge />}
                    </h3>
                    <p className="mt-1.5 text-[13.5px] text-fg/55">{c.note}</p>
                    <div className="mt-auto flex items-center justify-between border-t border-fg/10 pt-4">
                      <span className="font-sans text-[9.5px] uppercase tracking-[0.2em] text-fg/45">
                        {c.members}
                      </span>
                      <span className="font-sans text-[9.5px] uppercase tracking-[0.2em] text-fg/45">
                        Meets · {c.day}
                      </span>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal delay={120}>
            <div className="mt-14 flex flex-col items-start justify-between gap-8 rounded-2xl bg-card p-8 text-white md:flex-row md:items-center md:p-12">
              <div>
                <h3 className="font-display text-2xl font-semibold tracking-[-0.01em]">
                  And twenty-nine more
                </h3>
                <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-white/60">
                  From the Astronomical Society to the Young Zoologists&apos;
                  Circle — and if a club doesn&apos;t exist, any group of eight
                  students may petition the Principal to found it.
                </p>
              </div>
              <Link
                href="/contact?type=Sports & Co-Curricular"
                className="inline-flex shrink-0 items-center gap-2.5 rounded-full bg-gold px-7 py-3.5 text-[13px] font-medium text-ink transition-colors duration-300 hover:bg-white"
              >
                Enquire About Societies
                <ArrowRight size={15} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <VisualBlockSections path="/clubs-societies" position="bottom" />
      <Footer />
    </main>
  );
}
