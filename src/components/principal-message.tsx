import { ArrowRight, Quote } from "lucide-react";
import { Eyebrow } from "@/components/eyebrow";
import { Reveal } from "@/components/reveal";
import { SiteImage } from "@/components/site-image";

export function PrincipalMessage({
  content = {},
}: {
  content?: Record<string, string>;
}) {
  return (
    <section className="relative overflow-hidden bg-surface-2 py-24 md:py-32">
      <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 md:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        {/* Portrait */}
        <Reveal>
          <div className="relative mx-auto max-w-md lg:max-w-none">
            <div
              className="absolute -bottom-4 -right-4 h-full w-full rounded-[1.5rem] border border-fg/10"
              aria-hidden="true"
            />
            <div className="relative overflow-hidden rounded-[1.5rem] bg-ink">
              {/* v2.8.45.0 — renders the section's "Principal image" (the
                  CMS picker now actually applies; it used to be hardcoded). */}
              <SiteImage
                src={content.image ?? "/images/principal.jpg"}
                alt="Mr. Dhammika Hewawasam, Principal of St. Thomas' College, Matale"
                visualKey="home-principal-image"
                width={900}
                height={1200}
                className="h-auto w-full object-cover transition-transform duration-[1.4s] ease-out hover:scale-[1.03]"
                fallbackSrc="/images/principal.jpg"
              />
              <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-2xl bg-white px-5 py-4">
                <div>
                  <p className="font-display text-lg font-semibold leading-tight tracking-[-0.01em] text-ink">
                    Mr. Dhammika Hewawasam
                  </p>
                  <p className="mt-1 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-ink/70">
                    Principal · Since 2020
                  </p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold text-ink">
                  <Quote size={15} className="fill-current" />
                </span>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Message */}
        <div>
          <Reveal delay={100}>
            <Eyebrow>{content.eyebrow ?? "Principal's Message"}</Eyebrow>
          </Reveal>
          <Reveal delay={180}>
            <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.15] tracking-[-0.02em] text-fg md:text-[3.4rem]">
              {content.title ?? "Nurturing every student to reach his fullest potential."}
            </h2>
          </Reveal>
          <Reveal delay={260}>
            <p className="mt-8 max-w-xl text-[15.5px] leading-relaxed text-fg/60 md:text-base">
              {content.description ??
                "For over 150 years, St. Thomas' College has believed that true education is measured not only by results, but by character. We combine strong academics with sport, the arts and service, so that every Thomian leaves our gates as a confident, disciplined and responsible young man."}
            </p>
          </Reveal>
          <Reveal delay={340}>
            <p className="mt-6 max-w-xl text-[15.5px] leading-relaxed text-fg/60">
              {content.secondary ??
                "I invite you to walk our corridors, hear our choir, and stand at the boundary edge on a Battle of the Golds morning — and feel what makes this place extraordinary."}
            </p>
          </Reveal>
          <Reveal delay={420}>
            <div className="mt-10 flex items-center gap-6">
              <div>
                <p className="font-display text-3xl font-semibold italic tracking-[-0.01em] text-fg">
                  Dhammika Hewawasam
                </p>
                <p className="mt-1.5 font-sans text-[9.5px] uppercase tracking-[0.3em] text-fg/45">
                  Principal · St. Thomas&apos; College, Matale
                </p>
              </div>
              <span className="h-10 w-px bg-fg/10" aria-hidden="true" />
              <p className="hidden text-sm italic text-fg/40 sm:block">
                &ldquo;Animo Et Fide — Courage &amp; Faith.&rdquo;
              </p>
            </div>
          </Reveal>
          <Reveal delay={480}>
            <a
              href="/principals-message"
              className="group mt-9 inline-flex items-center gap-3 font-sans text-[11px] uppercase tracking-[0.25em] text-fg"
            >
              {content.buttonLabel ?? "Read the full message"}
              <span className="h-px w-10 bg-fg/30 transition-all duration-500 group-hover:w-16 group-hover:bg-gold" />
              <ArrowRight size={14} className="slide-arrow" />
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
