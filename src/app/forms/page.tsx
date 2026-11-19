import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ClipboardList, FileStack, Lock } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customForms } from "@/db/schema";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Eyebrow } from "@/components/eyebrow";
import { Reveal } from "@/components/reveal";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";
import { isFormWindowOpen } from "@/lib/form-builder";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forms — St. Thomas' College",
  description:
    "Special forms of St. Thomas' College, Matale — applications, registrations and office requests collected online.",
};

export default async function FormsHubPage() {
  await ensureSchemaExtras();
  const forms = await db
    .select({
      id: customForms.id,
      slug: customForms.slug,
      title: customForms.title,
      description: customForms.description,
      fields: customForms.fields,
      openAt: customForms.openAt,
      closeAt: customForms.closeAt,
    })
    .from(customForms)
    .where(eq(customForms.published, true))
    .orderBy(asc(customForms.title));

  return (
    <main className="relative min-h-screen bg-surface text-fg">
      <Navbar />
      <VisualBlockSections path="/forms" position="top" />

      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="grain absolute inset-0" />
        <div className="relative mx-auto w-full max-w-7xl px-5 pb-16 pt-32 md:px-8 md:pb-20">
          <div className="animate-fade-up flex items-center gap-4">
            <span className="h-px w-12 bg-gold" />
            <p className="font-sans text-[11px] uppercase tracking-[0.4em] text-white/70">
              Office of the College
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            Forms<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-white/65"
            style={{ animationDelay: "280ms" }}
          >
            Applications, registrations and office requests currently collected
            online. Every submission receives a reference code — keep it safe.
          </p>
        </div>
      </section>

      {/* Cards */}
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <Eyebrow>Currently Collected</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 max-w-2xl font-display text-4xl font-semibold leading-[1.12] tracking-[-0.02em] md:text-5xl">
              Choose a <span className="underline decoration-gold decoration-[3px] underline-offset-8">form</span>
            </h2>
          </Reveal>

          {forms.length === 0 ? (
            <Reveal delay={160}>
              <div className="mt-12 flex flex-col items-center rounded-2xl border border-dashed border-fg/15 bg-surface-2 px-6 py-20 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-gold/15 text-gold">
                  <FileStack size={26} />
                </span>
                <h3 className="mt-6 font-display text-2xl font-semibold">
                  No forms are open right now
                </h3>
                <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-fg/55">
                  When the office opens an online form — an application window, a
                  registration drive, a survey — it will appear here. Please
                  check back soon, or call the college office on +94 66 222 0173.
                </p>
                <Link
                  href="/contact"
                  className="mt-8 inline-flex items-center gap-2.5 rounded-full bg-gold px-7 py-3.5 font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-ink transition-colors duration-300 hover:bg-fg hover:text-surface"
                >
                  Contact the office instead
                  <ArrowRight size={14} />
                </Link>
              </div>
            </Reveal>
          ) : (
            /* v2.8.88.1 — the form cards (titles, descriptions, open/closed
                windows) are admin-managed data (Form Builder); this grid is
                locked from the visual editor so a patch can never mask or
                distort a live form. */
            <div data-structured-content className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {forms.map((form, i) => {
                const window = isFormWindowOpen(form.openAt, form.closeAt);
                return (
                  <Reveal key={form.id} delay={140 + i * 70} className="h-full">
                    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-fg/10 bg-surface-2 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-gold/60 md:p-7">
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold text-ink">
                          <ClipboardList size={19} />
                        </span>
                        {window.open ? (
                          <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                            Open
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
                            <Lock size={10} />
                            Closed
                          </span>
                        )}
                      </div>
                      <h3 className="mt-5 break-words font-display text-xl font-semibold leading-snug tracking-[-0.01em]">
                        {form.title}
                      </h3>
                      {form.description ? (
                        <p className="mt-2.5 line-clamp-4 text-[13.5px] leading-relaxed text-fg/60">
                          {form.description}
                        </p>
                      ) : (
                        <p className="mt-2.5 text-[13.5px] italic leading-relaxed text-fg/40">
                          No description provided.
                        </p>
                      )}
                      <p className="mt-4 font-sans text-[10px] uppercase tracking-[0.2em] text-fg/40">
                        {form.fields.length} question{form.fields.length === 1 ? "" : "s"}
                        {window.reason ? ` · ${window.reason}` : ""}
                      </p>
                      <div className="mt-auto pt-6">
                        <Link
                          href={`/forms/${form.slug}`}
                          aria-disabled={!window.open}
                          className={`inline-flex w-full items-center justify-center gap-2.5 rounded-full px-6 py-3.5 font-sans text-[11px] font-semibold uppercase tracking-[0.22em] transition-colors duration-300 ${
                            window.open
                              ? "bg-gold text-ink hover:bg-fg hover:text-surface"
                              : "pointer-events-none border border-fg/15 text-fg/40"
                          }`}
                        >
                          {window.open ? (
                            <>
                              Open form
                              <ArrowRight size={14} />
                            </>
                          ) : (
                            "Not accepting submissions"
                          )}
                        </Link>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <VisualBlockSections path="/forms" position="bottom" />
      <Footer />
    </main>
  );
}
