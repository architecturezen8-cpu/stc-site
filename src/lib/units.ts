import { SCENE } from "@/lib/media";

export type Unit = {
  slug: string;
  name: string;
  crest: string;
  founded: string;
  strength: string;
  image: string;
  tagline: string;
  text: string;
  highlights: string[];
  description: string[];
  achievements: { year: string; title: string; detail: string }[];
  gallery: { image: string; caption: string }[];
};

export const UNITS: Unit[] = [
  {
    slug: "army-cadet",
    name: "Army Cadet Platoon",
    crest: "ACP",
    founded: "Est. 1938",
    strength: "60 cadets",
    image: SCENE.cadetFormation,
    tagline: "National Cadet Corps · Senior Platoon",
    text: "The senior platoon of the National Cadet Corps, inaugurated on 10 December 1938 under J. B. Madasekara. Foot and sword drill, fieldcraft and annual assessment camps form the backbone of Thomian discipline.",
    highlights: ["Herman Loos trials", "Brigade annual camp", "Ceremonial guard duties"],
    description: [
      "Inaugurated on 10 December 1938 under the charge of J. B. Madasekara — with Lieutenant E. A. Perusinghe later taking command — the Army Cadet Platoon is the oldest uniformed unit at St. Thomas' College and the standard against which all others are measured.",
      "Cadets parade every week on the college square in foot and sword drill, and progress through fieldcraft, map reading, weapon handling and first aid. Two annual camps take the platoon into the Sri Lankan interior for assessment, where rank is earned rather than given.",
      "The platoon provides the ceremonial guard at Prize Giving, Founders' Day and the Battle of the Golds, and has sent generations of Thomians into the tri-forces — most famously General Shavendra Silva, the 23rd Commander of the Sri Lanka Army.",
    ],
    achievements: [
      { year: "2026", title: "District Best Platoon", detail: "Central Province Brigade assessment" },
      { year: "2025", title: "11 Herman Loos Qualifiers", detail: "The island's premier cadet competition" },
      { year: "2024", title: "Inter-School Drill — Runners-up", detail: "All-island drill competition finals" },
      { year: "2023", title: "Best Contingent, Rantambe", detail: "Brigade annual camp" },
    ],
    gallery: [
      { image: SCENE.cadetFormation, caption: "Platoon in formation before morning inspection" },
      { image: SCENE.cadetParade, caption: "Officer reviewing the contingent on parade" },
      { image: SCENE.militaryBand, caption: "Ceremonial march-past on national day" },
      { image: "/images/hero.jpg", caption: "The college square at parade hour" },
    ],
  },
  {
    slug: "eastern-band",
    name: "Eastern Band",
    crest: "EB",
    founded: "Traditional Ensemble",
    strength: "38 members",
    image: "/images/news-music.jpg",
    tagline: "Traditional Drums & Horanawa",
    text: "The heartbeat of every college procession. Our traditional drummers lead the Magul Bera at Prize Giving, Founders' Day and the Battle of the Golds parade.",
    highlights: ["Magul Bera invocation", "Perahera processions", "Thomian Nite opening"],
    description: [
      "The Eastern Band carries the oldest sound at St. Thomas' — the geta bera, the davula and the horanawa, played without amplification and heard from the Trinco Road.",
      "Every college ceremony opens with the Magul Bera, the traditional invocation: five drummers, absolute silence in the hall, and a rhythm unchanged for generations. The band leads the annual perahera, the Prize Giving procession and the big match parade.",
      "Members train daily from Grade 6, learning by ear from senior drummers in the way the tradition has always been passed on — no notation, only repetition and respect.",
    ],
    achievements: [
      { year: "2026", title: "Central Province Traditional Music — Gold", detail: "Eastern band category, all-island evaluation" },
      { year: "2025", title: "Kandy Esala Perahera Invitation", detail: "Selected school ensemble" },
      { year: "2024", title: "Inter-School Hewisi Championship — 1st", detail: "District finals, Matale" },
      { year: "2023", title: "Founders' Day Magul Bera", detail: "150th anniversary commemoration" },
    ],
    gallery: [
      { image: "/images/news-music.jpg", caption: "Lead drummer at the Magul Bera invocation" },
      { image: SCENE.orchestra, caption: "Combined bands at the annual music festival" },
      { image: "/images/clubs.jpg", caption: "Rehearsal in the music room" },
      { image: "/images/about.jpg", caption: "Procession assembling at Robinson Memorial Hall" },
    ],
  },
  {
    slug: "western-band",
    name: "Western Band",
    crest: "WB",
    founded: "Brass & Percussion",
    strength: "45 members",
    image: SCENE.westernBand,
    tagline: "Brass, Woodwind & Drum Corps",
    text: "Brass, woodwind and drum corps in full ceremonial dress. The Western Band marches at every inter-house meet, big match and national day parade in Matale.",
    highlights: ["All-Island gold classification", "Big match parade", "National day march-past"],
    description: [
      "Trumpets, trombones, euphoniums, clarinets and a full drum corps — the Western Band is the college in full ceremonial dress, and the sound of every march-past in Matale.",
      "The band holds gold classification at the All-Island Western Music evaluation for three consecutive years, and rehearses six mornings a week under the Director of Music before the school day begins.",
      "It leads the inter-house sports meet, the Battle of the Golds parade and the national day march-past, and closes Colours Nite each December with the college song.",
    ],
    achievements: [
      { year: "2026", title: "All-Island Western Music — Gold", detail: "Third consecutive gold classification" },
      { year: "2025", title: "Central Province Band Championship — 1st", detail: "Senior marching band category" },
      { year: "2024", title: "National Day March-Past", detail: "Lead band, Matale district parade" },
      { year: "2023", title: "Schools Music Festival — Silver", detail: "All-island concert band category" },
    ],
    gallery: [
      { image: SCENE.westernBand, caption: "The band in ceremonial dress on parade" },
      { image: SCENE.militaryBand, caption: "Brass section at the national day march-past" },
      { image: SCENE.orchestra, caption: "Concert performance at the festival of strings" },
      { image: "/images/news-music.jpg", caption: "Combined bands at Thomian Nite" },
    ],
  },
  {
    slug: "police-cadet",
    name: "Police Cadet Corps",
    crest: "PCC",
    founded: "Civic Discipline",
    strength: "42 cadets",
    image: SCENE.cadetParade,
    tagline: "Sri Lanka Police · School Corps",
    text: "Training in civic responsibility, law awareness and community service alongside the Sri Lanka Police — cadets assist at college events and district road-safety programmes.",
    highlights: ["Law awareness training", "Road safety programmes", "Event stewarding"],
    description: [
      "The Police Cadet Corps trains Thomians in civic responsibility: the law, the citizen's part in upholding it, and the discipline required to serve a community rather than command it.",
      "Working directly with officers of the Matale Police Division, cadets complete modules in law awareness, traffic management, first aid and disaster response, alongside standard drill and turnout inspection.",
      "The corps stewards every major college event, supports district road-safety campaigns in Matale town, and has become the natural route for Thomians entering the police and public service.",
    ],
    achievements: [
      { year: "2026", title: "District Road Safety Programme", detail: "Led school campaign across Matale town" },
      { year: "2025", title: "Best Turnout — Divisional Inspection", detail: "Matale Police Division annual review" },
      { year: "2024", title: "Community Service Commendation", detail: "Flood relief assistance, Central Province" },
      { year: "2023", title: "Law Awareness Quiz — 1st", detail: "Inter-school district competition" },
    ],
    gallery: [
      { image: SCENE.cadetParade, caption: "Corps inspection on the college grounds" },
      { image: SCENE.cadetFormation, caption: "Cadets at turnout inspection" },
      { image: SCENE.militaryBand, caption: "Stewarding the national day parade" },
      { image: "/images/hero.jpg", caption: "Duty detail at the main gate" },
    ],
  },
  {
    slug: "scout-troop",
    name: "3rd Matale Scout Troop",
    crest: "SCT",
    founded: "Est. 1935",
    strength: "94 scouts",
    image: SCENE.scouts,
    tagline: "Sri Lanka Scout Association",
    text: "Founded in 1935 with F. de S. Gunawardena as Scout Master — one of the oldest troops in the Central Province. Camping, pioneering, first aid and the President's Scout award.",
    highlights: ["President's Scout award", "District jamborees", "Community service"],
    description: [
      "Inaugurated in 1935 with F. de S. Gunawardena as Scout Master and S. B. Pamunuwa as his assistant, the 3rd Matale Troop is among the oldest scout troops in the Central Province — three years older than the cadet platoon.",
      "Scouts progress through the badge system from Cub to Venture, learning pioneering, knotting, camp craft, navigation and first aid. The troop camps twice a year and competes at district and national jamborees.",
      "Its highest honour is the President's Scout award, presented at the Presidential Secretariat — a distinction several Thomians earn each year, and the truest expression of the college motto in practice.",
    ],
    achievements: [
      { year: "2026", title: "6 President's Scouts", detail: "Presented at the Presidential Secretariat" },
      { year: "2025", title: "District Jamboree — Best Troop", detail: "Central Province scout jamboree" },
      { year: "2024", title: "Pioneering Championship — 1st", detail: "All-island scout skills competition" },
      { year: "2023", title: "Community Service Award", detail: "Matale district reforestation project" },
    ],
    gallery: [
      { image: SCENE.scouts, caption: "Scouts on field observation at summer camp" },
      { image: "/images/clubs.jpg", caption: "Troop meeting and badge instruction" },
      { image: "/images/sports.jpg", caption: "Pioneering challenge at the district jamboree" },
      { image: "/images/about.jpg", caption: "Troop assembly before inspection" },
    ],
  },
];

export const getUnit = (slug: string) => UNITS.find((u) => u.slug === slug);
