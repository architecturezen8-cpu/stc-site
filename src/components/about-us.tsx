import { ArrowRight } from "lucide-react";
import { Eyebrow } from "@/components/eyebrow";
import { Reveal } from "@/components/reveal";
import { SiteImage } from "@/components/site-image";

const stats = [
  { value: "153", label: "Years of Legacy" },
  { value: "2,000+", label: "Students on Roll" },
  { value: "140+", label: "Dedicated Staff" },
  { value: "4", label: "College Houses" },
];

const houses = [
  { name: "Austin", color: "bg-emerald-600" },
  { name: "Bede", color: "bg-[#0b2a5b]" },
  { name: "Clement", color: "bg-gold" },
  { name: "Pius", color: "bg-red-600" },
];

export function AboutUs({
  content = {},
}: {
  content?: Record<string, string>;
}) {
  return (
    <section id="about" className="scroll-mt-20 bg-surface py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        {/* Centered header */}
        <div className="mx-auto max-w-3xl text-center">
          <Reveal className="flex justify-center">
            <Eyebrow>{content.eyebrow ?? "About Us"}</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.12] tracking-[-0.02em] text-fg md:text-6xl md:leading-[1.08]">
              {content.title ?? "A Proud Tradition of Excellence Since 1873"}
            </h2>
          </Reveal>
          <Reveal delay={220}>
            <p className="mx-auto mt-7 max-w-2xl text-[15.5px] leading-relaxed text-fg/60">
              {content.description ??
                "Founded in 1873, St. Thomas' College, Matale is one of Sri Lanka's leading boys' schools, providing quality education from Grade 6 to the G.C.E. Advanced Level. We are committed to academic excellence, discipline and the all-round development of every student entrusted to our care."}
            </p>
            <a
              href="/history"
              className="group mt-8 inline-flex items-center gap-3 font-sans text-[11px] uppercase tracking-[0.25em] text-fg"
            >
              {content.buttonLabel ?? "Discover our history"}
              <span className="h-px w-10 bg-fg/30 transition-all duration-500 group-hover:w-16 group-hover:bg-gold" />
              <ArrowRight size={14} className="slide-arrow" />
            </a>
          </Reveal>
        </div>

        {/* Wide image */}
        <Reveal delay={140} className="mt-16">
          <div className="group relative overflow-hidden rounded-[1.5rem] bg-ink">
            {/* v2.8.45.0 — renders the section's "Feature image" (the CMS
                picker now actually applies; it used to be hardcoded). */}
            <SiteImage
              src={content.image ?? "/images/about.jpg"}
              alt="Students of St. Thomas' College in Robinson Memorial Hall"
              visualKey="home-about-image"
              width={1600}
              height={900}
              className="aspect-[16/10] w-full object-cover transition-transform duration-[1.6s] ease-out group-hover:scale-[1.04] md:aspect-[21/9]"
              fallbackSrc="/images/about.jpg"
            />
            <div className="absolute bottom-5 left-5 flex items-center gap-3 rounded-full bg-ink px-4 py-2.5 md:bottom-6 md:left-6">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              <p className="font-sans text-[9.5px] uppercase tracking-[0.3em] text-white/85">
                Robinson Memorial Hall · Est. 1901
              </p>
            </div>
            <span className="absolute right-5 top-5 rounded-full bg-white px-4 py-2 font-sans text-[9px] uppercase tracking-[0.3em] text-ink md:right-6 md:top-6">
              Est. 1873
            </span>
          </div>
        </Reveal>

        {/* Stats row */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 100} className="h-full">
              <div className="h-full rounded-2xl bg-card p-6 transition-all duration-500 hover:-translate-y-1 hover:border-gold md:p-7">
                <p className="font-display text-4xl font-semibold tracking-[-0.03em] text-white lg:text-5xl">
                  {s.value}
                </p>
                <span className="mb-3 mt-6 block h-px w-7 bg-gold" />
                <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-white/50">
                  {s.label}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Houses — centered */}
        <Reveal delay={140}>
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <p className="font-sans text-[10px] uppercase tracking-[0.4em] text-fg/40">
              Our Houses
            </p>
            <span className="hidden h-px w-8 bg-fg/15 sm:block" />
            <div className="flex flex-wrap justify-center gap-2.5">
              {houses.map((h) => (
                <span
                  key={h.name}
                  className="flex items-center gap-2.5 rounded-full border border-fg/15 px-4 py-2 font-sans text-[10px] uppercase tracking-[0.22em] text-fg/60 transition-colors duration-300 hover:border-fg hover:bg-fg hover:text-surface"
                >
                  <span className={`h-2 w-2 rounded-full ${h.color}`} />
                  {h.name}
                </span>
              ))}
            </div>
          </div>

          {/* Colours & song teaser */}
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <a
              href="/vision-mission#colours"
              className="group flex items-center justify-between gap-5 rounded-2xl bg-card p-7 text-white transition-all duration-500 hover:-translate-y-1"
            >
              <div>
                <p className="font-sans text-[10px] uppercase tracking-[0.3em] text-gold">
                  College Colours
                </p>
                <h3 className="mt-2 font-display text-2xl font-semibold tracking-[-0.01em]">
                  Gold &amp; Double Blue
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-white/55">
                  The meaning behind the tie, the cap and the colours blazer.
                </p>
              </div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/20 transition-colors duration-300 group-hover:border-gold group-hover:bg-gold group-hover:text-ink">
                <ArrowRight size={15} className="slide-arrow" />
              </span>
            </a>

            <a
              href="/vision-mission#colours"
              className="group flex items-center justify-between gap-5 rounded-2xl border border-fg/10 p-7 transition-all duration-500 hover:-translate-y-1 hover:border-fg/25"
            >
              <div>
                <p className="font-sans text-[10px] uppercase tracking-[0.3em] text-fg/45">
                  The College Song
                </p>
                <h3 className="mt-2 font-display text-2xl font-semibold tracking-[-0.01em]">
                  Animo et Fide
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-fg/55">
                  Sung standing at every assembly, Prize Giving and big match.
                </p>
              </div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-fg/20 transition-colors duration-300 group-hover:border-gold group-hover:bg-gold group-hover:text-ink">
                <ArrowRight size={15} className="slide-arrow" />
              </span>
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
