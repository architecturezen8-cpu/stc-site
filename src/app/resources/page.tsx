import Image from "next/image";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";
import { Reveal } from "@/components/reveal";
import { ResourceBrowser } from "@/components/resources/resource-browser";
import { listOnlineResources } from "@/lib/resources";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Online Resources — St. Thomas' College",
  description:
    "Curated online learning resources for Thomians — past papers, syllabi, video lessons, reference libraries and study tools, organised by category.",
};

export default async function ResourcesPage() {
  const rows = await listOnlineResources();
  const resources = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    url: row.url,
    linkType: row.linkType,
    medium: row.medium,
    featured: row.featured,
  }));

  return (
    <main className="relative bg-surface text-fg">
      <Navbar />

      {/* Hero */}
      <section className="relative flex min-h-[52svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src="/images/hero.jpg"
          alt="Thomians studying on the college grounds"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-ink/70" />
        <div className="grain absolute inset-0" />

        <div className="relative mx-auto w-full max-w-7xl px-5 pb-14 pt-32 md:px-8 md:pb-16">
          <div className="animate-fade-up flex items-center gap-4">
            <span className="h-px w-12 bg-gold" />
            <p className="font-sans text-[11px] uppercase tracking-[0.4em] text-white/70">
              Digital Learning
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            Online{" "}
            <span className="underline decoration-gold decoration-[3px] underline-offset-8">
              Resources
            </span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-2xl text-[15px] leading-relaxed text-white/65"
            style={{ animationDelay: "240ms" }}
          >
            A curated library of trusted learning links — past papers, official
            syllabi, video lessons, reference libraries and study tools. Every
            resource is organised by category and filtered by medium, so the
            right material is never more than two taps away.
          </p>
        </div>
      </section>

      <ResourceBrowser resources={resources} />
      <VisualBlockSections path="/resources" />
      <Footer />
    </main>
  );
}
