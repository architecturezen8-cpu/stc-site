import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Quote } from "lucide-react";
import { getVisualBlocks } from "@/lib/visual-blocks-server";

type BlockData = Record<string, string>;

function SectionShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section data-visual-block className={`bg-surface text-fg ${className}`}>
      {children}
    </section>
  );
}

function HeroBanner({ d }: { d: BlockData }) {
  return (
    <SectionShell className="relative flex min-h-[60svh] items-end overflow-hidden bg-ink text-white">
      <Image
        src={d.image || "/images/hero.jpg"}
        alt={d.title}
        fill
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-ink/65" />
      <div className="grain absolute inset-0" />
      <div className="relative mx-auto w-full max-w-7xl px-5 pb-16 pt-32 md:px-8 md:pb-20">
        <div className="flex items-center gap-4">
          <span className="h-px w-12 bg-gold" />
          <p className="font-sans text-[11px] uppercase tracking-[0.4em] text-white/70">
            {d.eyebrow}
          </p>
        </div>
        <h2 className="mt-7 max-w-4xl font-display text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-[1.08] tracking-[-0.03em]">
          {d.title}
        </h2>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-white/65">
          {d.subtitle}
        </p>
        {d.buttonLabel && (
          <Link
            href={d.buttonHref || "/contact"}
            className="group mt-9 inline-flex items-center gap-3 rounded-full bg-gold px-8 py-4 text-sm font-medium text-ink transition-all duration-300 hover:bg-white active:scale-95"
          >
            {d.buttonLabel}
            <ArrowRight size={15} className="slide-arrow" />
          </Link>
        )}
      </div>
    </SectionShell>
  );
}

function CtaBanner({ d }: { d: BlockData }) {
  return (
    <SectionShell className="px-5 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-7xl rounded-2xl bg-card p-10 text-white shadow-lift md:p-14">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <h3 className="font-display text-3xl font-semibold leading-[1.15] tracking-[-0.02em] md:text-4xl">
              {d.title}
            </h3>
            <p className="mt-4 text-[15px] leading-relaxed text-white/60">{d.text}</p>
          </div>
          {d.buttonLabel && (
            <Link
              href={d.buttonHref || "/contact"}
              className="group inline-flex items-center gap-3 rounded-full bg-gold px-8 py-4 text-sm font-medium text-ink transition-all duration-300 hover:bg-white active:scale-95"
            >
              {d.buttonLabel}
              <ArrowRight size={15} className="slide-arrow" />
            </Link>
          )}
        </div>
      </div>
    </SectionShell>
  );
}

function StatsRow({ d }: { d: BlockData }) {
  const stats = [1, 2, 3, 4]
    .map((i) => ({ value: d[`value${i}`], label: d[`label${i}`] }))
    .filter((s) => s.value);
  return (
    <SectionShell className="px-5 py-16 md:px-8 md:py-20">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-8 rounded-2xl border border-fg/10 bg-surface-2 px-8 py-10 md:grid-cols-4">
        {stats.map((s, i) => (
          <div key={i}>
            <p className="break-words font-display text-3xl font-semibold tracking-[-0.02em] md:text-4xl">
              {s.value}
            </p>
            <p className="mt-2 font-sans text-[9px] uppercase leading-relaxed tracking-[0.24em] text-fg/45">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function ImageText({ d }: { d: BlockData }) {
  return (
    <SectionShell className="px-5 py-20 md:px-8 md:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div className="relative overflow-hidden rounded-2xl bg-ink">
          <Image
            src={d.image || "/images/about.jpg"}
            alt={d.title}
            width={1200}
            height={900}
            className="aspect-[4/3] w-full object-cover"
          />
        </div>
        <div>
          <p className="flex items-center gap-4 font-sans text-[10px] uppercase tracking-[0.4em] text-fg/45">
            <span className="h-px w-10 bg-gold" />
            {d.eyebrow}
          </p>
          <h3 className="mt-6 font-display text-3xl font-semibold leading-[1.12] tracking-[-0.02em] md:text-4xl">
            {d.title}
          </h3>
          <p className="mt-6 text-[15.5px] leading-relaxed text-fg/60">{d.text}</p>
        </div>
      </div>
    </SectionShell>
  );
}

function HeadingBlock({ d }: { d: BlockData }) {
  return (
    <SectionShell className="px-5 pb-6 pt-20 md:px-8 md:pt-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="inline-flex items-center gap-4 font-sans text-[10px] uppercase tracking-[0.4em] text-fg/45">
          <span className="h-px w-8 bg-gold" />
          {d.eyebrow}
          <span className="h-px w-8 bg-gold" />
        </p>
        <h2 className="mt-6 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
          {d.title}
        </h2>
        {d.subtitle && (
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-fg/55">
            {d.subtitle}
          </p>
        )}
      </div>
    </SectionShell>
  );
}

function ParagraphBlock({ d }: { d: BlockData }) {
  return (
    <SectionShell className="px-5 py-10 md:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="whitespace-pre-line text-[16px] leading-[1.85] text-fg/70">
          {d.text}
        </p>
      </div>
    </SectionShell>
  );
}

function FullImage({ d }: { d: BlockData }) {
  return (
    <SectionShell className="px-5 py-10 md:px-8">
      <figure className="mx-auto max-w-7xl">
        <div className="overflow-hidden rounded-2xl bg-ink">
          <Image
            src={d.image || "/images/hero.jpg"}
            alt={d.caption || "College photograph"}
            width={1920}
            height={960}
            className="aspect-[2/1] w-full object-cover"
          />
        </div>
        {d.caption && (
          <figcaption className="mt-4 text-center font-sans text-[10px] uppercase tracking-[0.3em] text-fg/40">
            {d.caption}
          </figcaption>
        )}
      </figure>
    </SectionShell>
  );
}

function QuoteBlock({ d }: { d: BlockData }) {
  return (
    <SectionShell className="px-5 py-16 md:px-8 md:py-20">
      <div className="mx-auto max-w-3xl rounded-2xl bg-card p-10 text-center text-white md:p-14">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gold text-ink">
          <Quote size={20} className="fill-current" />
        </span>
        <blockquote className="mt-7 font-display text-2xl font-medium leading-[1.35] md:text-3xl">
          {d.quote}
        </blockquote>
        {d.attribution && (
          <p className="mt-6 font-sans text-[10px] uppercase tracking-[0.3em] text-gold">
            {d.attribution}
          </p>
        )}
      </div>
    </SectionShell>
  );
}

const RENDERERS: Record<string, (props: { d: BlockData }) => React.ReactNode> = {
  "hero-banner": HeroBanner,
  "cta-banner": CtaBanner,
  "stats-row": StatsRow,
  "image-text": ImageText,
  "heading-block": HeadingBlock,
  paragraph: ParagraphBlock,
  "full-image": FullImage,
  "quote-block": QuoteBlock,
};

/**
 * Renders every published premade block for a public page. Insert directly
 * above the page footer — blocks follow the user's saved order.
 *
 * While an admin is previewing/editing (cmsPreview / cmsEditor), pass
 * status="draft" so freshly added blocks appear on the page immediately,
 * before they are published.
 */
export async function VisualBlockSections({
  path,
  status = "published",
}: {
  path: string;
  status?: "draft" | "published";
}) {
  /* Data loading is the only fallible step — parse/DB failures fall back to
     nothing. The JSX itself is built OUTSIDE the try/catch: React renders
     the returned component tree after this function completes, so a
     try/catch here could never intercept a renderer's render errors. */
  let blocks: Awaited<ReturnType<typeof getVisualBlocks>> = [];
  try {
    blocks = await getVisualBlocks(path, status);
  } catch {
    return null;
  }
  if (!blocks.length) return null;
  return (
    <>
      {blocks.map((block) => {
        const Renderer = RENDERERS[block.blockType];
        if (!Renderer) return null;
        const data =
          status === "draft" && block.draftData
            ? (block.draftData as BlockData)
            : (block.publishedData as BlockData);
        if (!data || Object.keys(data).length === 0) {
          if (status !== "draft") return null;
          const draft = block.draftData as BlockData | undefined;
          if (!draft || Object.keys(draft).length === 0) return null;
          return <Renderer key={block.id} d={draft} />;
        }
        return <Renderer key={block.id} d={data} />;
      })}
    </>
  );
}
