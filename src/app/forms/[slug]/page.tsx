import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customForms } from "@/db/schema";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { CustomFormRenderer } from "@/components/forms/custom-form-renderer";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function loadForm(slug: string) {
  await ensureSchemaExtras();
  const [form] = await db
    .select()
    .from(customForms)
    .where(eq(customForms.slug, slug))
    .limit(1);
  return form ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const form = await loadForm(slug);
  if (!form || !form.published) {
    return { title: "Form — St. Thomas' College" };
  }
  return {
    title: `${form.title} — St. Thomas' College`,
    description: form.description || undefined,
  };
}

export default async function CustomFormPage({ params }: Props) {
  const { slug } = await params;
  const form = await loadForm(slug);
  if (!form || !form.published) notFound();

  return (
    <main className="relative min-h-screen bg-surface text-fg">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="grain absolute inset-0" />
        <div className="relative mx-auto w-full max-w-7xl px-5 pb-14 pt-32 md:px-8 md:pb-16">
          <div className="animate-fade-up flex items-center gap-4">
            <span className="h-px w-12 bg-gold" />
            <p className="font-sans text-[11px] uppercase tracking-[0.4em] text-white/70">
              College Form
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            {form.title}
            <span className="text-gold">.</span>
          </h1>
          {form.description ? (
            <p
              className="animate-fade-up mt-5 max-w-2xl text-base leading-relaxed text-white/65"
              style={{ animationDelay: "280ms" }}
            >
              {form.description}
            </p>
          ) : null}
        </div>
      </section>

      {/* The form */}
      <section className="bg-surface py-14 md:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-5 md:px-8">
          <CustomFormRenderer
            slug={form.slug}
            title={form.title}
            fields={form.fields}
            openAt={form.openAt ? form.openAt.toISOString() : null}
            closeAt={form.closeAt ? form.closeAt.toISOString() : null}
            receiptEmail={form.receiptEmail}
          />
        </div>
      </section>

      <Footer />
    </main>
  );
}
