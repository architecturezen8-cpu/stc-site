import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";

const exploreLinks = [
  { label: "News & Events", href: "/news" },
  { label: "Sports", href: "/sports" },
  { label: "Campus Gallery", href: "/gallery" },
  { label: "Cadeting", href: "/cadeting" },
];

const stats = [
  { value: "153", label: "Years of Heritage" },
  { value: "2,000+", label: "Students" },
  { value: "140+", label: "Staff Members" },
  { value: "4", label: "College Houses" },
];

export type HeroContent = {
  eyebrow?: string;
  title?: string;
  motto?: string;
  mottoTranslation?: string;
  description?: string;
  image?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

export function Hero({ content = {} }: { content?: HeroContent }) {
  const title = content.title ?? "St. Thomas' College, Matale";
  const imageSrc = content.image ?? "/images/about.jpg";
  const eyebrow = content.eyebrow ?? "Est. 1873 · A Leading Boys' School";
  const motto = content.motto ?? "Animo et Fide";
  const mottoTrans = content.mottoTranslation ?? "Courage & Faith";
  const desc =
    content.description ??
    "For over 150 years we have educated generations of young men — in the classroom, on the field and on the parade square. We invite you to discover our college, our community and our heritage.";
  const primaryHref = content.primaryHref ?? "/admissions";
  const primaryLabel = content.primaryLabel ?? "Apply for Admission";
  const secondaryHref = content.secondaryHref ?? "/history";
  const secondaryLabel = content.secondaryLabel ?? "Discover Our Story";

  return (
    <section className="relative flex min-h-svh flex-col overflow-hidden bg-ink text-white">
      {/* Backdrop */}
      <div className="absolute inset-0">
        <Image
          src={imageSrc}
          alt={title}
          fill
          priority
          sizes="100vw"
          className="animate-kenburns object-cover"
        />
        <div className="absolute inset-0 bg-ink/72" />
        <div className="grain absolute inset-0" />
      </div>

      {/* Content — centered */}
      <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-5 pb-16 pt-36 text-center md:px-8 md:pt-40">
        <div className="animate-fade-up flex items-center justify-center gap-4">
          <span className="h-px w-10 bg-gold" />
          <p className="font-sans text-[10.5px] uppercase tracking-[0.4em] text-white/70">
            {eyebrow}
          </p>
          <span className="h-px w-10 bg-gold" />
        </div>

        <h1
          className="animate-fade-up mt-8 font-display text-[clamp(2.8rem,7.4vw,5.6rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
          style={{ animationDelay: "140ms" }}
        >
          {title}
          <span className="text-gold">.</span>
        </h1>

        {/* Motto — clean lockup, no pills */}
        <div
          className="animate-fade-up mt-7 flex flex-col items-center"
          style={{ animationDelay: "260ms" }}
        >
          <p className="font-serif text-xl italic tracking-[0.04em] text-gold md:text-2xl">
            {motto}
          </p>
          <span className="mt-2.5 block h-px w-9 bg-gold/70" />
          <p className="mt-2.5 font-sans text-[9px] uppercase tracking-[0.4em] text-white/50">
            {mottoTrans}
          </p>
        </div>

        <p
          className="animate-fade-up mt-7 max-w-xl text-[15px] leading-relaxed text-white/65 md:text-base"
          style={{ animationDelay: "380ms" }}
        >
          {desc}
        </p>

        <div
          className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-4"
          style={{ animationDelay: "480ms" }}
        >
          <Link
            href={primaryHref}
            className="group inline-flex items-center gap-3 rounded-full bg-gold px-8 py-4 text-sm font-medium text-ink transition-all duration-300 hover:bg-white active:scale-95"
          >
            {primaryLabel}
            <ArrowRight size={15} className="slide-arrow" />
          </Link>
          <Link
            href={secondaryHref}
            className="inline-flex items-center gap-3 rounded-full border border-white/25 px-8 py-4 text-sm font-medium text-white transition-all duration-300 hover:border-white hover:bg-white hover:text-ink active:scale-95"
          >
            {secondaryLabel}
          </Link>
        </div>

        <p
          className="animate-fade-up mt-6 flex items-center gap-2.5 font-sans text-[11px] uppercase tracking-[0.2em] text-white/55"
          style={{ animationDelay: "560ms" }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          Admissions open · Grade 6 — 2027 intake
        </p>

        {/* Explore */}
        <div
          className="animate-fade-up mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
          style={{ animationDelay: "640ms" }}
        >
          <span className="font-sans text-[9px] uppercase tracking-[0.3em] text-white/40">
            Explore —
          </span>
          {exploreLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-[12.5px] text-white/70 transition-colors duration-300 hover:text-gold"
            >
              {l.label}
              <ChevronRight
                size={12}
                className="transition-transform duration-300 group-hover:translate-x-0.5"
              />
            </Link>
          ))}
        </div>
      </div>

      {/* Stats band */}
      <div className="relative border-t border-white/10 bg-ink/55 backdrop-blur-sm">
        <div className="mx-auto grid max-w-7xl grid-cols-2 md:grid-cols-4">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`animate-fade-up flex flex-col items-center gap-1 border-white/10 px-4 py-6 md:py-7 ${
                i < 2 ? "border-b md:border-b-0" : ""
              } ${i % 2 === 0 ? "border-r" : ""} ${
                i !== stats.length - 1 ? "md:border-r" : ""
              }`}
              style={{ animationDelay: `${760 + i * 90}ms` }}
            >
              <p className="font-display text-2xl font-semibold tracking-[-0.02em] text-gold md:text-3xl">
                {s.value}
              </p>
              <p className="font-sans text-[8px] uppercase tracking-[0.26em] text-white/50">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll cue */}
      <div className="pointer-events-none absolute bottom-24 left-5 hidden flex-col items-center gap-3 lg:flex">
        <span className="font-sans text-[9px] uppercase tracking-[0.4em] text-white/45 [writing-mode:vertical-rl]">
          Scroll
        </span>
        <span className="scroll-line block h-14 w-px bg-gold" />
      </div>
    </section>
  );
}
