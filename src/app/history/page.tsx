import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Landmark } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { NewBadge } from "@/components/new-badge";
import { EditableSection } from "@/components/cms/editable-section";
import { LiveSiteEditor } from "@/components/admin/live-site-editor";
import { getAdminSession } from "@/lib/admin-auth";
import { getCmsPage } from "@/lib/cms";
import { getCmsPageDefinition } from "@/lib/cms-defaults";
import { getOldThomians } from "@/lib/site-lists";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";

export const metadata = {
  title: "Our History — St. Thomas' College, Matale",
  description:
    "From a church verandah in 1873 to a leading boys' school in Matale — the story of St. Thomas' College.",
};

type Milestone = {
  year: string;
  title: string;
  text: string;
  image?: string;
  imageAlt?: string;
};

const milestones: Milestone[] = [
  {
    year: "1873",
    title: "The Church Verandah",
    text: "Founded on 10 August 1873 by the Catholic Church in the verandah of a small mud-and-wattle church in Matale. The first roll call: seventy-five boys and twelve girls.",
  },
  {
    year: "1876",
    title: "Two Schools, One Founding",
    text: "Rev. Fr. Aloysius J. M. Marrer divides the school into separate boys' and girls' institutions. Leo de Silva leads the boys' school; Rosa Perera leads the girls', which becomes St. Agnes Convent — today's St. Thomas' Girls' School.",
  },
  {
    year: "1880",
    title: "The Half-Century Priest",
    text: "Rev. Fr. Pius Fernando arrives from Negombo in January 1880. He spends half a century of his priestly life in Matale, shaping the college until his death in 1930.",
    image: "/images/hero.jpg",
    imageAlt: "The college campus",
  },
  {
    year: "1901",
    title: "Robinson Memorial Hall",
    text: "The Robinson Memorial Hall is built on land donated by John Croos of Negombo. More than a century later, it remains the heart of the college.",
    image: "/images/about.jpg",
    imageAlt: "Robinson Memorial Hall reading room",
  },
  {
    year: "1923",
    title: "The Robinson Era",
    text: "Charles Robinson is appointed headmaster on 1 September 1923, serving thirty-five years until 1958. Around him serve headmasters J. M. Direckse, A. S. Scharnignivel, L. D'w. Jayasighe and C. J. Rodrigo — with Joseph Master, the beloved pupil-teacher of 1904, retiring in 1946.",
  },
  {
    year: "1935",
    title: "3rd Matale Scout Troop",
    text: "The Scout Troop 3rd Matale is inaugurated with F. de S. Gunawardena as Scout Master and S. B. Pamunuwa as his assistant — a tradition of service that continues today.",
  },
  {
    year: "1938",
    title: "The Cadet Platoon",
    text: "The Cadet Platoon (Junior) is inaugurated on 10 December 1938 under the charge of J. B. Madasekara, with Lt. E. A. Perusinghe later taking command.",
  },
  {
    year: "1953",
    title: "The Old Thomians' Association",
    text: "A group of former students of Charles Robinson founds the Old Boys' Association with his support, with K. M. D. Jayanetti as founder President. Revitalised decisively in 1983 with the backing of Principal A. J. Wijesinghe, MOTA today unites four local and three overseas branches.",
  },
  {
    year: "1958",
    title: "The Modern Era",
    text: "Robinson retires and is succeeded by D. Aidan de Silva, beginning the modern line of principals: W. B. Gopallawa, A. J. Wijesinghe, Upali Weragama, J. H. M. W. Ranjith, E. M. P. Ekanayake, Dampiya Wanasinghe, K. A. J. Kulasuriya and D. M. W. Dissanayake.",
    image: "/images/principal.jpg",
    imageAlt: "The college leadership",
  },
  {
    year: "2020",
    title: "Principal Dhammika Hewawasam",
    text: "Mr. Dhammika Hewawasam is appointed Principal. Today the college educates more than 2,000 boys from Grade 6 to the Advanced Level, served by over 140 staff.",
  },
];

const legacy = [
  { value: "153", label: "Years in Matale" },
  { value: "2,000+", label: "Students Today" },
  { value: "140+", label: "Staff & Educators" },
  { value: "4", label: "College Houses" },
];

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    cmsPreview?: string;
    cmsEditor?: string;
    visualEditor?: string;
    edit?: string;
  }>;
}) {
  const { cmsPreview, cmsEditor, edit } = await searchParams;
  const session = await getAdminSession();
  const preview = cmsPreview === "1" && Boolean(session);
  // Only cmsEditor=1 opens the section editor; visualEditor=1 is the pure
  // element-level visual editor and must not mount the section toolbar.
  const editor = cmsEditor === "1" && Boolean(session);
  const draftMode = preview || editor;
  const editable = draftMode && edit === "1";
  const page = await getCmsPage(
    "history",
    draftMode ? "draft" : "published",
  );
  const definition = getCmsPageDefinition("history");
  const section = (key: string) => page?.sections.find((item) => item.key === key);
  const hero = section("hero");
  const timeline = section("timeline");
  const alumni = section("alumni");
  const legacySection = section("legacy");
  const thomians = await getOldThomians();

  return (
    <main className="relative bg-surface text-fg">
      <Navbar />
      <div className="flex flex-col">

      {/* Hero */}
      <div style={{ order: hero?.order ?? 0 }}>
      <EditableSection sectionKey="hero" label={hero?.label ?? "History Hero"} preview={draftMode} editable={editable} hidden={hero?.hidden}>
      <section className="relative flex min-h-[58svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src={hero?.data.image ?? "/images/hero.jpg"}
          alt={hero?.data.title ?? "St. Thomas' College, Matale campus"}
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
              {hero?.data.eyebrow ?? "St. Thomas' College · Est. 1873"}
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            {hero?.data.title ?? "Our History"}<span className="text-gold">.</span>
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-white/65"
            style={{ animationDelay: "280ms" }}
          >
            {hero?.data.description ??
              "Founded on 10 August 1873, St. Thomas' College has served the community of Matale for over 150 years as one of the region's leading boys' schools."}
          </p>
        </div>
      </section>
      </EditableSection>
      </div>

      {/* Timeline */}
      <div style={{ order: timeline?.order ?? 1 }}>
      <EditableSection sectionKey="timeline" label={timeline?.label ?? "Historical Timeline"} preview={draftMode} editable={editable} hidden={timeline?.hidden}>
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-5 md:px-8">
          <Reveal className="flex justify-center">
            <Eyebrow>{timeline?.data.eyebrow ?? "Milestones Since 1873"}</Eyebrow>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mx-auto mt-7 max-w-2xl text-center font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
              {timeline?.data.title ?? "The History of the College at a Glance"}
            </h2>
          </Reveal>
          <Reveal delay={180}>
            <p className="mx-auto mt-5 max-w-xl text-center text-[15px] leading-relaxed text-fg/55">
              {timeline?.data.description ??
                "From a church verandah with seventy-five pupils to a college of over two thousand — the defining moments of St. Thomas'."}
            </p>
          </Reveal>

          <div className="relative mt-16 md:mt-20">
            {/* Rail — centred at every breakpoint */}
            <span
              className="timeline-rail absolute left-1/2 top-2 h-[calc(100%-1rem)] w-px -translate-x-1/2 bg-fg/15"
              aria-hidden="true"
            />

            <div className="space-y-10 md:space-y-20">
              {milestones.map((m, i) => {
                const leftSide = i % 2 === 0;
                return (
                  <Reveal key={m.year} delay={80}>
                    <div className="relative grid grid-cols-2 gap-5 md:gap-24">
                      {/* Dot — centred on the rail */}
                      <span
                        className="absolute left-1/2 top-2 grid h-[15px] w-[15px] -translate-x-1/2 place-items-center"
                        aria-hidden="true"
                      >
                        <span
                          className="timeline-dot h-[13px] w-[13px] rounded-full border-2 border-gold bg-surface md:h-[15px] md:w-[15px]"
                          style={{ animationDelay: `${i * 260}ms` }}
                        />
                      </span>

                      <div
                        className={
                          leftSide
                            ? "col-start-1 pr-5 text-right md:pr-0"
                            : "col-start-2 pl-5 md:pl-0"
                        }
                      >
                        <p className="font-display text-3xl font-semibold tracking-[-0.03em] text-gold sm:text-4xl md:text-5xl lg:text-7xl">
                          {m.year}
                        </p>
                        <h3 className="mt-2 font-display text-lg font-semibold leading-snug tracking-[-0.01em] sm:text-xl md:mt-3 md:text-3xl">
                          {m.title}
                        </h3>
                        <p
                          className={`mt-2 max-w-xl text-[13px] leading-relaxed text-fg/60 sm:text-[14px] md:mt-3 md:text-[15px] ${
                            leftSide ? "md:ml-auto" : ""
                          }`}
                        >
                          {m.text}
                        </p>

                        {m.image && (
                          <div
                            className={`mt-4 overflow-hidden rounded-xl md:mt-6 md:rounded-2xl ${
                              leftSide ? "md:ml-auto" : ""
                            } max-w-md`}
                          >
                            <Image
                              src={m.image}
                              alt={m.imageAlt ?? m.title}
                              width={800}
                              height={500}
                              className="aspect-[16/10] w-full object-cover transition-transform duration-[1.2s] ease-out hover:scale-[1.04]"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      </EditableSection>
      </div>

      {/* Old Thomians — a quiet honour roll, secondary to the history itself */}
      <div style={{ order: alumni?.order ?? 2 }}>
      <EditableSection sectionKey="alumni" label={alumni?.label ?? "Notable Old Thomians"} preview={draftMode} editable={editable} hidden={alumni?.hidden}>
      <section className="border-t border-fg/10 bg-surface py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Reveal>
                <Eyebrow>{alumni?.data.eyebrow ?? "Old Boys of the College"}</Eyebrow>
              </Reveal>
              <Reveal delay={100}>
                <h2 className="mt-6 font-display text-3xl font-semibold leading-[1.12] tracking-[-0.02em] md:text-4xl">
                  {alumni?.data.title ?? "Notable Old Thomians"}
                </h2>
              </Reveal>
            </div>
            <Reveal delay={140}>
              <p className="max-w-md text-[13.5px] leading-relaxed text-fg/50">
                The Matale Old Thomians&apos; Association — founded 1953,
                revived in 1983 — unites four local and three overseas
                branches of the college&apos;s alumni.
              </p>
            </Reveal>
          </div>

          <div className="mt-10 grid gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
            {thomians.map((o, i) => (
              <Reveal key={o.id} delay={(i % 3) * 70}>
                <div className="group flex items-center gap-4 rounded-xl border border-fg/10 px-4 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/60 hover:shadow-lift">
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-ink">
                    <Image
                      src={o.image}
                      alt={o.name}
                      fill
                      sizes="48px"
                      className="object-cover object-top"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-2 truncate font-display text-[15px] font-semibold tracking-[-0.01em]">
                      <span className="truncate">{o.name}</span>
                      {o.isNew && <NewBadge />}
                    </h3>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-fg/50">
                      {o.note}
                    </p>
                  </div>
                  <span className="ml-auto hidden shrink-0 rounded-full bg-fg/5 px-2.5 py-1 font-sans text-[8px] uppercase tracking-[0.18em] text-fg/45 transition-colors duration-300 group-hover:bg-gold group-hover:text-ink sm:inline">
                    {o.field}
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      </EditableSection>
      </div>

      {/* Legacy numbers + CTA */}
      <div style={{ order: legacySection?.order ?? 3 }}>
      <EditableSection sectionKey="legacy" label={legacySection?.label ?? "College Today & CTA"} preview={draftMode} editable={editable} hidden={legacySection?.hidden}>
      <section className="bg-surface py-20 md:py-24">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <Eyebrow>The College Today</Eyebrow>
          </Reveal>
          <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {legacy.map((s, i) => (
              <Reveal key={s.label} delay={i * 100} className="h-full">
                <div className="h-full rounded-2xl bg-card p-7 transition-all duration-500 hover:-translate-y-1">
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

          <Reveal delay={140}>
            <div className="mt-14 flex flex-col items-start justify-between gap-8 rounded-2xl bg-card p-8 text-white md:flex-row md:items-center md:p-12">
              <div className="flex items-start gap-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold text-ink">
                  <Landmark size={22} />
                </span>
                <div>
                  <h3 className="font-display text-2xl font-semibold tracking-[-0.01em]">
                    {legacySection?.data.title ?? "Admissions Open for 2027"}
                  </h3>
                  <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-white/60">
                    Applications are now open for the Grade 6 intake. For
                    details and application forms, please contact the college
                    office.
                  </p>
                </div>
              </div>
              <Link
                href={legacySection?.data.buttonHref ?? "/admissions"}
                className="inline-flex shrink-0 items-center gap-2.5 rounded-full bg-gold px-7 py-3.5 text-[13px] font-medium text-ink transition-colors duration-300 hover:bg-white"
              >
                {legacySection?.data.buttonLabel ?? "Apply for 2027"}
                <ArrowRight size={15} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
      </EditableSection>
      </div>
      </div>

      <VisualBlockSections path="/history" />
      <Footer />
      {editor && page && definition && (
        <LiveSiteEditor initialPage={page} definition={definition} />
      )}
    </main>
  );
}

