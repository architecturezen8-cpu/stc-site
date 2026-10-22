import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Eyebrow } from "@/components/eyebrow";
import { Reveal } from "@/components/reveal";

const academicCards = [
  {
    meta: "Grades 6 – 9",
    title: "Middle School",
    description:
      "A rigorous, joyful foundation where curiosity becomes craft — young learners find their voice across sciences, humanities and the arts.",
    image: "/images/middle-school.jpg",
    alt: "Middle school students collaborating in a bright classroom",
  },
  {
    meta: "Grades 10 – 13",
    title: "Senior School",
    description:
      "O/L and A/L mastery with university counselling, research projects and leadership tracks that carry our graduates to the world's finest halls.",
    image: "/images/senior-school.jpg",
    alt: "Senior school students in a chemistry laboratory",
  },
];

const cocurricularCards = [
  {
    meta: "18 Disciplines",
    title: "Sports",
    description:
      "Cricket, rugby, athletics, swimming and more — where grit becomes glory under the floodlights, and character is built one match at a time.",
    image: "/images/sports.jpg",
    alt: "Athletes sprinting on the college track at golden hour",
  },
  {
    meta: "40+ Societies",
    title: "Clubs & Societies",
    description:
      "From chess and choir to robotics and debate — a stage for every passion, and a society for every kind of brilliant.",
    image: "/images/clubs.jpg",
    alt: "Students at a chess and debate club meeting",
  },
];

type Card = (typeof academicCards)[number];

function AcademicCard({ card, delay }: { card: Card; delay: number }) {
  return (
    <Reveal delay={delay}>
      <Link
        href="/contact?type=Academics"
        className="group relative block aspect-[4/3] overflow-hidden rounded-2xl bg-ink sm:aspect-[16/11]"
      >
        <Image
          src={card.image}
          alt={card.alt}
          width={900}
          height={675}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1.4s] ease-out group-hover:scale-[1.06]"
        />
        <div className="absolute inset-0 bg-ink/55 transition-colors duration-500 group-hover:bg-ink/60" />

        {/* Arrow */}
        <span className="absolute right-6 top-6 grid h-11 w-11 translate-y-2 place-items-center rounded-full bg-gold text-ink opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100 md:right-7 md:top-7">
          <ArrowUpRight size={16} />
        </span>

        {/* Copy */}
        <div className="absolute inset-x-6 bottom-6 text-white md:inset-x-7 md:bottom-7">
          <p className="font-sans text-[9.5px] uppercase tracking-[0.32em] text-mist">
            {card.meta}
          </p>
          <h3 className="mt-2 font-display text-3xl font-semibold leading-none tracking-[-0.01em] md:text-4xl">
            {card.title}
          </h3>
          <div className="grid grid-rows-[0fr] transition-all duration-500 ease-out group-hover:mt-3 group-hover:grid-rows-[1fr]">
            <p className="overflow-hidden text-[13.5px] leading-relaxed text-white/70">
              {card.description}
            </p>
          </div>
        </div>
      </Link>
    </Reveal>
  );
}

function GroupLabel({ label, id }: { label: string; id?: string }) {
  return (
    <Reveal>
      <div id={id} className="flex scroll-mt-28 items-center gap-5">
        <span className="h-px w-8 bg-gold" />
        <span className="font-sans text-[10px] uppercase tracking-[0.4em] text-fg/45">
          {label}
        </span>
        <span className="h-px flex-1 bg-fg/10" />
      </div>
    </Reveal>
  );
}

export function Academics({
  content = {},
}: {
  content?: Record<string, string>;
}) {
  return (
    <section id="academics" className="scroll-mt-20 bg-surface py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        {/* Header */}
        <div className="grid gap-10 lg:grid-cols-2 lg:items-end">
          <div>
            <Reveal>
              <Eyebrow>{content.eyebrow ?? "Academics & Beyond"}</Eyebrow>
            </Reveal>
            <Reveal delay={120}>
              <h2 className="mt-7 font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-fg md:text-6xl">
                {content.title ?? "Our Academic Pathways"}
              </h2>
            </Reveal>
          </div>
          <Reveal delay={200}>
            <p className="max-w-xl text-[15.5px] leading-relaxed text-fg/60 lg:ml-auto">
              {content.description ??
                "From Grade 6 to the Advanced Level, our curriculum combines strong classroom teaching with sport, the arts and practical learning — preparing every student for higher education and beyond."}
            </p>
          </Reveal>
        </div>

        {/* Academic pathways */}
        <div className="mt-16">
          <GroupLabel label="Academic Pathways" />
          <div className="mt-8 grid gap-7 md:grid-cols-2">
            {academicCards.map((card, i) => (
              <AcademicCard key={card.title} card={card} delay={i * 150} />
            ))}
          </div>
        </div>

        {/* Co-curricular life */}
        <div className="mt-14">
          <GroupLabel label="Co-Curricular Life" id="cocurricular" />
          <div className="mt-8 grid gap-7 md:grid-cols-2">
            {cocurricularCards.map((card, i) => (
              <AcademicCard key={card.title} card={card} delay={i * 150} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
