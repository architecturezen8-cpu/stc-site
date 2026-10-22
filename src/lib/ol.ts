/**
 * G.C.E. Ordinary Level data for St. Thomas' College, Matale.
 *
 * Past papers are NOT stored by this site. Every link points to
 * Past Papers WiKi (https://pastpapers.wiki), Sri Lanka's largest free
 * archive of Department of Examinations papers.
 *
 * Linking strategy (hub-first — every link should open the paper):
 *   · Years 2021+ have no dedicated posts on the wiki → link to the
 *     subject's hub page, which lists the newest papers with answers.
 *   · Years with verified per-subject posts → link to the post itself.
 *   · Remaining years fall back to the year collection page.
 *
 * Verified against the wiki sitemap (October 2026).
 */

export const PAPERWIKI = "https://pastpapers.wiki";

export type Medium = "Sinhala" | "Tamil" | "English";

export const MEDIUMS: { id: Medium; label: string; native: string }[] = [
  { id: "Sinhala", label: "Sinhala Medium", native: "සිංහල මාධ්‍යය" },
  { id: "Tamil", label: "Tamil Medium", native: "தமிழ் மொழிமூலம்" },
  { id: "English", label: "English Medium", native: "English Medium" },
];

/** Papers are offered from 2016 onwards — nothing older is listed. */
export const PAPER_YEARS = [
  2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016,
] as const;

export type PaperSource = "paper" | "hub" | "year";

export type PPLink = {
  url: string;
  label: string; // "Paper" | "Collection"
  description: string;
  source: PaperSource;
};

export const HUB_LINKS: Record<string, PPLink> = {
  mathematics: {
    url: `${PAPERWIKI}/select-your-medium-o-l-maths/`,
    label: "Select Medium",
    description: "Choose your medium on the wiki for every Maths paper",
    source: "hub",
  },
  science: {
    url: `${PAPERWIKI}/gce-o-l-science-past-papers-with-answers-2/`,
    label: "All Papers",
    description: "Full O/L Science archive with answers",
    source: "hub",
  },
  history: {
    url: `${PAPERWIKI}/select-your-medium-o-l-history/`,
    label: "Select Medium",
    description: "Choose your medium on the wiki for every History paper",
    source: "hub",
  },
  buddhism: {
    url: `${PAPERWIKI}/gce-o-l-buddhism-past-papers-with-answers/`,
    label: "All Papers",
    description: "Full O/L Buddhism archive with answers",
    source: "hub",
  },
  english: {
    url: `${PAPERWIKI}/gce-o-l-english-language-past-papers-with-answers/`,
    label: "All Papers",
    description: "Full O/L English Language archive with answers",
    source: "hub",
  },
  sinhala: {
    url: `${PAPERWIKI}/gce-o-l-sinhala-language-literature-past-papers-with-answers/`,
    label: "All Papers",
    description: "Full O/L Sinhala Language & Literature archive",
    source: "hub",
  },
};

/** Year collection pages that bundle every O/L subject for the year. */
export const YEAR_COLLECTIONS: Record<number, PPLink> = {
  2015: {
    url: `${PAPERWIKI}/2015-o-l-past-papers-free-download-new/`,
    label: "Collection",
    description: "All subjects · 2015 collection",
    source: "year",
  },
  2016: {
    url: `${PAPERWIKI}/2016-o-l-past-papers-free-download/`,
    label: "Collection",
    description: "All subjects · 2016 collection",
    source: "year",
  },
  2017: {
    url: `${PAPERWIKI}/2017-o-l-past-papers-free-download/`,
    label: "Collection",
    description: "All subjects · 2017 collection",
    source: "year",
  },
  2018: {
    url: `${PAPERWIKI}/2018-o-l-past-papers-free-download/`,
    label: "Collection",
    description: "All subjects · 2018 collection",
    source: "year",
  },
  2019: {
    url: `${PAPERWIKI}/2019-o-l-past-papers-free-download/`,
    label: "Collection",
    description: "All subjects · 2019 collection",
    source: "year",
  },
};

export type OLSubject = {
  id: string;
  name: string;
  /** The hub page and per-year posts on the wiki. */
  wiki: {
    hub: PPLink;
    /** Verified per-year posts (medium lower-cased in the slug). */
    perYear: Record<number, Partial<Record<Medium, string>>>;
  };
  native: string;
  category: "Core" | "Religion" | "Language";
  periods: string;
  teacher: string;
  about: string;
  topics: string[];
};

export const OL_SUBJECTS: OLSubject[] = [
  {
    id: "sinhala",
    name: "Sinhala",
    wiki: {
      hub: HUB_LINKS.sinhala,
      perYear: {
        2015: { Sinhala: "2015-o-l-sinhala-language-literature-past-paper-sinhala-medium" },
        2017: { Sinhala: "2017-o-l-sinhala-language-literature-past-paper-sinhala-medium" },
        2019: { Sinhala: "2019-o-l-sinhala-language-literature-past-paper-sinhala-medium" },
      },
    },
    native: "සිංහල භාෂාව හා සාහිත්‍යය",
    category: "Language",
    periods: "6 periods / week",
    teacher: "Mrs. K. Dissanayake · Head of Languages",
    about:
      "First language Sinhala covers grammar, comprehension, creative writing and the prescribed literary texts. Paper I tests language and comprehension; Paper II covers essay writing and literature appreciation. Tamil-medium students sit Tamil (First Language) instead.",
    topics: [
      "Grammar & usage (ව්‍යාකරණ)",
      "Comprehension (අවබෝධය)",
      "Essay & creative writing",
      "Prescribed poetry & prose",
      "Letter and précis writing",
    ],
  },
  {
    id: "mathematics",
    name: "Mathematics",
    wiki: {
      hub: HUB_LINKS.mathematics,
      perYear: {
        2015: {
          Sinhala: "2015-o-l-mathematics-past-paper-sinhala-medium",
          English: "2015-o-l-mathematics-past-paper-english-medium",
        },
        2016: {
          English: "2016-o-l-mathematics-past-paper-english-medium",
          Tamil: "2016-o-l-mathematics-with-answers-tamil-medium",
        },
        2017: { English: "2017-o-l-mathematics-past-paper-english-medium" },
        2018: {
          Sinhala: "2018-o-l-mathematics-past-paper-sinhala-medium",
          English: "2018-o-l-mathematics-past-paper-english-medium",
          Tamil: "2018-o-l-mathematics-with-answers-tamil-medium",
        },
        2019: {
          English: "2019-o-l-mathematics-past-paper-english-medium",
          Tamil: "2019-o-l-mathematics-past-paper-tamil-medium",
        },
        2020: {
          Sinhala: "2020-o-l-mathematics-past-paper-and-answers-sinhala-medium",
          English: "2020-o-l-mathematics-past-paper-english-medium",
          Tamil: "2020-o-l-mathematics-past-paper-and-answers-tamil-medium",
        },
      },
    },
    native: "ගණිතය",
    category: "Core",
    periods: "7 periods / week",
    teacher: "Mr. L. Gunasekara · Head of Mathematics",
    about:
      "The compulsory core subject and the strongest predictor of Advanced Level stream choice. Two papers: Paper I is short structured questions, Paper II is extended essay-type problems with choice.",
    topics: [
      "Number & indices, logarithms",
      "Algebra, equations & inequalities",
      "Geometry & constructions",
      "Trigonometry & Pythagoras",
      "Sets, probability & statistics",
      "Graphs and matrices",
    ],
  },
  {
    id: "english",
    name: "English",
    wiki: {
      hub: HUB_LINKS.english,
      perYear: {
        2015: { English: "2015-o-l-english-language-past-paper-english-medium" },
        2016: { English: "2016-o-l-english-language-past-paper-english-medium" },
        2017: { English: "2017-o-l-english-language-past-paper-english-medium" },
        2020: { English: "2020-o-l-english-language-past-paper-and-answers" },
        2021: { English: "2021-o-l-english-language-past-paper-and-answers-english-medium" },
      },
    },
    native: "ඉංග්‍රීසි භාෂාව",
    category: "Language",
    periods: "6 periods / week",
    teacher: "Mr. A. Rajapakse · Senior Teacher, English",
    about:
      "English as a second language, taught in graded sets. Paper I covers reading, grammar and vocabulary; Paper II covers writing tasks, and the oral test is conducted separately in Grade 11.",
    topics: [
      "Reading comprehension",
      "Grammar & structures",
      "Guided and free writing",
      "Letters, notices & reports",
      "Speaking & listening (oral test)",
    ],
  },
  {
    id: "buddhism",
    name: "Buddhism",
    wiki: {
      hub: HUB_LINKS.buddhism,
      perYear: {
        2015: {
          Sinhala: "2015-o-l-buddhism-past-paper-sinhala-medium",
          English: "2015-o-l-buddhism-past-paper-english-medium",
        },
        2016: {
          Sinhala: "2016-o-l-buddhism-past-paper-sinhala-medium",
          English: "2016-o-l-buddhism-past-paper-english-medium",
        },
        2017: {
          Sinhala: "2017-o-l-buddhism-past-paper-sinhala-medium",
          English: "2017-o-l-buddhism-past-paper-english-medium",
          Tamil: "2017-o-l-buddhism-past-paper-tamil-medium",
        },
        2018: {
          Sinhala: "2018-o-l-buddhism-past-paper-sinhala-medium",
          Tamil: "2018-o-l-buddhism-past-paper-tamil-medium",
        },
        2019: {
          Sinhala: "2019-o-l-buddhism-past-paper-sinhala-medium",
          English: "2019-o-l-buddhism-past-paper-english-medium",
          Tamil: "2019-o-l-buddhism-past-paper-tamil-medium",
        },
        2020: {
          Sinhala: "2020-o-l-buddhism-past-paper-and-answers-sinhala-medium-new",
          English: "2020-o-l-buddhism-past-paper-and-answers-english-medium",
        },
      },
    },
    native: "බුද්ධ ධර්මය",
    category: "Religion",
    periods: "4 periods / week",
    teacher: "Ven. S. Dhammika Thero · Religion Department",
    about:
      "The religion paper taken by the majority of Thomians. Catholicism, Saivanery and Islam are offered to students of other faiths, taught in parallel during the same periods.",
    topics: [
      "Life of the Buddha",
      "Core doctrine (Dhamma)",
      "Jataka stories & their lessons",
      "Buddhist history in Sri Lanka",
      "Rituals, festivals & practice",
    ],
  },
  {
    id: "science",
    name: "Science",
    wiki: {
      hub: HUB_LINKS.science,
      perYear: {
        2015: {
          Sinhala: "2015-o-l-science-past-paper-sinhala-medium",
          English: "2015-o-l-science-past-paper-english-medium",
          Tamil: "2015-o-l-science-past-paper-tamil-medium",
        },
        2016: {
          English: "2016-o-l-science-past-paper-english-medium",
          Tamil: "2016-o-l-science-past-paper-tamil-medium",
        },
        2017: {
          Sinhala: "2017-o-l-science-past-paper-sinhala-medium",
          English: "2017-o-l-science-past-paper-english-medium",
          Tamil: "2017-o-l-science-past-paper-tamil-medium",
        },
        2018: {
          English: "2018-o-l-science-past-paper-english-medium",
          Tamil: "2018-o-l-science-past-paper-tamil-medium",
        },
        2019: {
          Sinhala: "2019-o-l-science-past-paper-sinhala-medium-2",
          English: "2019-o-l-science-past-paper-english-medium",
          Tamil: "2019-o-l-science-past-paper-tamil-medium",
        },
        2020: {
          Sinhala: "2020-o-l-science-past-paper-and-answers-sinhala-medium",
          English: "2020-o-l-science-past-paper-and-answers-english-medium",
          Tamil: "2020-o-l-science-past-paper-and-answers-tamil-medium",
        },
      },
    },
    native: "විද්‍යාව",
    category: "Core",
    periods: "7 periods / week",
    teacher: "Dr. R. Jayasuriya · Head of Science",
    about:
      "Integrated science covering biology, chemistry and physics, taught with weekly laboratory practicals in the junior science laboratories. A strong pass here is required for the Advanced Level science streams.",
    topics: [
      "Living world & human biology",
      "Matter, atoms & chemical reactions",
      "Force, motion & energy",
      "Electricity & magnetism",
      "Environment & sustainability",
    ],
  },
  {
    id: "history",
    name: "History",
    wiki: {
      hub: HUB_LINKS.history,
      perYear: {
        2015: {
          Sinhala: "2015-o-l-history-past-paper-sinhala-medium",
          English: "2015-o-l-history-past-paper-english-medium",
          Tamil: "2015-o-l-history-past-paper-and-answers-tamil-medium",
        },
        2016: {
          English: "2016-o-l-history-past-paper-english-medium",
          Tamil: "2016-o-l-history-past-paper-and-answers-tamil-medium",
        },
        2017: {
          Tamil: "2017-o-l-history-past-paper-and-answers-tamil-medium",
        },
        2018: {
          English: "2018-o-l-history-past-paper-english-medium",
          Tamil: "2018-o-l-history-past-paper-tamil-medium",
        },
        2019: {
          Sinhala: "2019-o-l-history-past-paper-sinhala-medium",
          English: "2019-o-l-history-past-paper-english-medium",
          Tamil: "2019-o-l-history-past-paper-tamil-medium",
        },
        2020: {
          Sinhala: "2020-o-l-history-past-paper-and-answers-sinhala-medium",
          English: "2020-o-l-history-past-paper-and-answers-english-medium",
          Tamil: "2020-o-l-history-past-paper-tamil-medium",
        },
      },
    },
    native: "ඉතිහාසය",
    category: "Core",
    periods: "5 periods / week",
    teacher: "Mr. J. Weerasinghe · Head of Humanities",
    about:
      "Compulsory history covering Sri Lankan history from the pre-Anuradhapura period through colonial rule to independence, alongside key themes in world history.",
    topics: [
      "Ancient Sri Lanka & the great kingdoms",
      "Colonial period (Portuguese, Dutch, British)",
      "Independence & modern Sri Lanka",
      "World history: revolutions & world wars",
      "Source analysis & map work",
    ],
  },
];

/** Subject baskets offered alongside the six main subjects. */
export const OL_BASKETS = [
  {
    group: "Basket 1 · Aesthetic",
    subjects: ["Art", "Eastern Music", "Western Music", "Dancing", "Drama & Theatre"],
  },
  {
    group: "Basket 2 · Applied",
    subjects: [
      "Information & Communication Technology",
      "Health & Physical Education",
      "Home Economics",
      "Agriculture & Food Technology",
    ],
  },
  {
    group: "Basket 3 · Social & Commerce",
    subjects: [
      "Business & Accounting Studies",
      "Geography",
      "Civic Education",
      "Entrepreneurship Studies",
      "Second Language (Tamil / English)",
    ],
  },
];

export const OL_STATS = [
  { value: "Grades 6–11", label: "Junior & Middle School" },
  { value: "9", label: "Subjects at O/L" },
  { value: "94%", label: "Qualified for A/L · 2025" },
  { value: "412", label: "Students in Grades 10 & 11" },
];

export const OL_TIMELINE = [
  {
    grade: "Grade 6 – 8",
    title: "Junior School",
    text: "A broad common curriculum — all students study the same subjects, with aesthetic and practical subjects rotated each term so every boy tries everything before choosing.",
  },
  {
    grade: "Grade 9",
    title: "Subject Selection",
    text: "Students choose their O/L basket subjects with guidance from class teachers and the counselling office, after a term of sampling each option.",
  },
  {
    grade: "Grade 10",
    title: "The O/L Syllabus Begins",
    text: "The two-year Ordinary Level syllabus starts. Termly assessments, practical work and a structured homework schedule run alongside regular teaching.",
  },
  {
    grade: "Grade 11",
    title: "Examination Year",
    text: "Full past-paper programme from the second term, model examinations in August and October, and subject clinics after school for students needing support.",
  },
];

/**
 * Resolves the best pastpapers.wiki link for a subject + medium + year.
 *
 *  1. A verified per-year post for that exact medium — opens the paper.
 *  2. Otherwise the year collection page (2015–2019 list all subjects).
 *  3. Years without dedicated posts (2021+) → the subject hub, which
 *     always lists the newest papers.
 *
 * A result flag (`direct`) tells the UI whether the link opens the paper
 * itself or a collection page.
 */
export function resolvePaperLink(
  subject: OLSubject,
  medium: Medium,
  year: number,
): PPLink & { direct: boolean } {
  const slug = subject.wiki.perYear[year]?.[medium];
  if (slug) {
    return {
      url: `${PAPERWIKI}/${slug}/`,
      label: "Paper",
      description: `${medium} medium · ${year} paper`,
      source: "paper",
      direct: true,
    };
  }

  const yearHub = YEAR_COLLECTIONS[year];
  if (yearHub) {
    return {
      url: yearHub.url,
      label: "Collection",
      description: `${year} collection — find ${subject.name} on the page`,
      source: "year",
      direct: false,
    };
  }

  return { ...subject.wiki.hub, direct: false };
}

export function getOLSubject(id: string) {
  return OL_SUBJECTS.find((s) => s.id === id);
}
