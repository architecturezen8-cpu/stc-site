import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Award, Briefcase, GraduationCap } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/eyebrow";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";

export const metadata = {
  title: "Principal's Message — St. Thomas' College, Matale",
  description:
    "A message from Mr. Dhammika Hewawasam, Principal of St. Thomas' College, Matale since 2020.",
};

const paragraphs = [
  "When I first walked through these gates as Principal in 2020, a Grade 8 boy held the door for me, then apologised — not for nearly missing the gesture, but for being three seconds late to his class. In that small exchange I understood exactly what this college is: a place where standards are not enforced, but inherited.",
  "For over 150 years, St. Thomas' College has believed that true education is measured not only in grades, but in grace — the quiet confidence of a boy who knows who he is. Grades open doors; character decides what you do in the room. We are determined that our students are fluent in both.",
  "Our promise to every family is simple and severe: we will know your son. We will know his name, his temperament, the subject that frightens him and the one that makes him lose track of time. In an era of mass education, we remain deliberately, defiantly personal. Classes are small, counsellors are present, and no boy here is ever merely a registration number.",
  "We pair that intimacy with genuine rigour. Our laboratories hum after hours, Robinson Memorial Hall opens before dawn, and our teachers — many of whom gave up their Saturdays for years — hold our students to standards that have produced island-first results across four Advanced Level streams. Excellence here is not an accident; it is a habit, rehearsed daily.",
  "But a school that only teaches is a factory with a crest. Between the finish at the hundred-metre line and the final drum of Thomian Nite, our boys learn to lead a team, to lose with dignity, to argue a case they did not choose, and to serve a community that will never know their name. These are not extras. At St. Thomas', they are the curriculum.",
  "To our Old Thomians: you remain our proudest export. Wherever you stand today — a parade ground, a lecture hall, a hospital theatre, a start-up — know that you carry Matale with you, and that these gates are always open to you.",
  "And to every parent considering this college for their son: I do not ask you to take my word. Come and see. Hear the choir drift from Robinson Memorial Hall. Watch a junior debugger celebrate his first working circuit. Stand at the boundary edge on a Battle of the Golds morning and feel what a century and a half of brotherhood sounds like. Then decide. I am confident what you will decide.",
];

const facts = [
  {
    icon: Briefcase,
    label: "Principal Since",
    value: "2020 — Present",
    sub: "Appointed Principal of the College",
  },
  {
    icon: GraduationCap,
    label: "Education",
    value: "B.Sc (Peradeniya)",
    sub: "Postgraduate Diploma in Education",
  },
  {
    icon: Award,
    label: "Prior Service",
    value: "30+ Years in Education",
    sub: "Senior educator, Central Province",
  },
];

export default function PrincipalsMessagePage() {
  return (
    <main className="relative bg-surface text-fg">
      <Navbar />

      {/* Hero */}
      <section className="relative flex min-h-[50svh] items-end overflow-hidden bg-ink text-white">
        <Image
          src="/images/principal.jpg"
          alt="Mr. Dhammika Hewawasam, Principal of St. Thomas' College, Matale"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-ink/65" />
        <div className="grain absolute inset-0" />

        <div className="relative mx-auto w-full max-w-7xl px-5 pb-16 pt-32 md:px-8 md:pb-20">
          <div className="animate-fade-up flex items-center gap-4">
            <span className="h-px w-12 bg-gold" />
            <p className="font-sans text-[11px] uppercase tracking-[0.4em] text-white/70">
              From the Principal&apos;s Desk
            </p>
          </div>
          <h1
            className="animate-fade-up mt-7 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ animationDelay: "140ms" }}
          >
            The Principal&apos;s Message<span className="text-gold">.</span>
          </h1>
        </div>
      </section>

      {/* Message */}
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            {/* Sticky portrait */}
            <Reveal>
              <div className="lg:sticky lg:top-28">
                <div className="relative mx-auto max-w-md lg:max-w-none">
                  <div
                    className="absolute -bottom-4 -right-4 h-full w-full rounded-[1.5rem] border border-fg/10"
                    aria-hidden="true"
                  />
                  <div className="relative overflow-hidden rounded-[1.5rem] bg-ink">
                    <Image
                      src="/images/principal.jpg"
                      alt="Mr. Dhammika Hewawasam"
                      width={900}
                      height={1200}
                      className="h-auto w-full object-cover"
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
                        <GraduationCap size={16} />
                      </span>
                    </div>
                  </div>
                </div>

                {/* Facts */}
                <div className="mt-10 space-y-4">
                  {facts.map((f, i) => {
                    const Icon = f.icon;
                    return (
                      <Reveal key={f.label} delay={i * 90}>
                        <div className="flex items-start gap-4 rounded-2xl border border-fg/10 bg-surface-2 p-5">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold text-ink">
                            <Icon size={17} />
                          </span>
                          <div>
                            <p className="font-sans text-[9px] uppercase tracking-[0.25em] text-fg/50">
                              {f.label}
                            </p>
                            <p className="mt-1 font-display text-base font-semibold leading-snug">
                              {f.value}
                            </p>
                            <p className="mt-0.5 text-[13px] text-fg/50">
                              {f.sub}
                            </p>
                          </div>
                        </div>
                      </Reveal>
                    );
                  })}
                </div>
              </div>
            </Reveal>

            {/* Body */}
            <div>
              <Reveal delay={100}>
                <Eyebrow>Dear Parents, Students &amp; Old Thomians</Eyebrow>
              </Reveal>

              <Reveal delay={160}>
                <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.15] tracking-[-0.02em] md:text-[2.9rem]">
                  A Message from{" "}
                  <span className="underline decoration-gold decoration-[3px] underline-offset-8">
                    Our Principal
                  </span>
                </h2>
              </Reveal>

              <div className="mt-10 space-y-6">
                {paragraphs.map((p, i) => (
                  <Reveal key={i} delay={Math.min(i * 60, 300)}>
                    <p className="text-[16px] leading-[1.85] text-fg/70">
                      {p}
                    </p>
                  </Reveal>
                ))}
              </div>

              <Reveal delay={120}>
                <div className="mt-12 border-t border-fg/10 pt-10">
                  <p className="text-[15px] italic text-fg/50">
                    With warm regards, and with the gates always open —
                  </p>
                  <p className="mt-6 font-display text-4xl font-semibold italic tracking-[-0.01em]">
                    Dhammika Hewawasam
                  </p>
                  <p className="mt-2 font-sans text-[10px] uppercase tracking-[0.3em] text-fg/45">
                    Principal · St. Thomas&apos; College, Matale
                  </p>
                </div>
              </Reveal>

              <Reveal delay={180}>
                <Link
                  href="/staff"
                  className="group mt-10 inline-flex items-center gap-3 rounded-full border border-fg/15 px-7 py-3.5 text-[13px] font-medium text-fg transition-colors duration-300 hover:border-fg hover:bg-fg hover:text-surface"
                >
                  Meet the Faculty Behind the Vision
                  <ArrowRight size={15} className="slide-arrow" />
                </Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* Motto strip */}
      <section className="bg-surface-2 py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-5 text-center md:px-8">
          <Reveal>
            <p className="font-display text-3xl font-semibold italic tracking-[-0.01em] text-fg/70 md:text-4xl">
              &ldquo;Animo Et Fide — Courage &amp; Faith.&rdquo;
            </p>
            <p className="mt-4 font-sans text-[10px] uppercase tracking-[0.35em] text-fg/40">
              The College Motto · Since 1873
            </p>
          </Reveal>
        </div>
      </section>

      <VisualBlockSections path="/principals-message" />
      <Footer />
    </main>
  );
}
