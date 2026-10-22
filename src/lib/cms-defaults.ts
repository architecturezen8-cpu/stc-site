export type CmsFieldType = "text" | "textarea" | "url" | "image";

export type CmsFieldDefinition = {
  key: string;
  label: string;
  type: CmsFieldType;
  help?: string;
};

export type CmsSectionDefinition = {
  key: string;
  label: string;
  type: string;
  fields: CmsFieldDefinition[];
  data: Record<string, string>;
};

export type CmsPageDefinition = {
  slug: string;
  title: string;
  description: string;
  path: string;
  sections: CmsSectionDefinition[];
};

export const CMS_PAGES: CmsPageDefinition[] = [
  {
    slug: "home",
    title: "Home Page",
    description: "The main college landing page",
    path: "/",
    sections: [
      {
        key: "hero",
        label: "Hero",
        type: "hero",
        fields: [
          { key: "eyebrow", label: "Top label", type: "text" },
          { key: "title", label: "Main title", type: "text" },
          { key: "motto", label: "Motto", type: "text" },
          { key: "mottoTranslation", label: "Motto translation", type: "text" },
          { key: "description", label: "Introduction", type: "textarea" },
          { key: "image", label: "Background image", type: "image", help: "Use a local /images path or an HTTPS image URL." },
          { key: "primaryLabel", label: "Primary button", type: "text" },
          { key: "primaryHref", label: "Primary link", type: "url" },
          { key: "secondaryLabel", label: "Secondary button", type: "text" },
          { key: "secondaryHref", label: "Secondary link", type: "url" },
        ],
        data: {
          eyebrow: "Est. 1873 · A Leading Boys' School",
          title: "St. Thomas' College, Matale",
          motto: "Animo et Fide",
          mottoTranslation: "Courage & Faith",
          description: "For over 150 years we have educated generations of young men — in the classroom, on the field and on the parade square. We invite you to discover our college, our community and our heritage.",
          image: "/images/about.jpg",
          primaryLabel: "Apply for Admission",
          primaryHref: "/admissions",
          secondaryLabel: "Discover Our Story",
          secondaryHref: "/history",
        },
      },
      {
        key: "principal",
        label: "Principal's Message",
        type: "split_content",
        fields: [
          { key: "eyebrow", label: "Section label", type: "text" },
          { key: "title", label: "Heading", type: "text" },
          { key: "description", label: "Message", type: "textarea" },
          { key: "secondary", label: "Second paragraph", type: "textarea" },
          { key: "image", label: "Principal image", type: "image" },
          { key: "buttonLabel", label: "Button label", type: "text" },
        ],
        data: {
          eyebrow: "Principal's Message",
          title: "Nurturing every student to reach his fullest potential.",
          description: "For over 150 years, St. Thomas' College has believed that true education is measured not only by results, but by character. We combine strong academics with sport, the arts and service, so that every Thomian leaves our gates as a confident, disciplined and responsible young man.",
          secondary: "I invite you to walk our corridors, hear our choir, and stand at the boundary edge on a Battle of the Golds morning — and feel what makes this place extraordinary.",
          image: "/images/principal.jpg",
          buttonLabel: "Read the full message",
        },
      },
      {
        key: "about",
        label: "About the College",
        type: "feature",
        fields: [
          { key: "eyebrow", label: "Section label", type: "text" },
          { key: "title", label: "Heading", type: "text" },
          { key: "description", label: "Description", type: "textarea" },
          { key: "image", label: "Feature image", type: "image" },
          { key: "buttonLabel", label: "Button label", type: "text" },
        ],
        data: {
          eyebrow: "About Us",
          title: "A Proud Tradition of Excellence Since 1873",
          description: "Founded in 1873, St. Thomas' College, Matale is one of Sri Lanka's leading boys' schools, providing quality education from Grade 6 to the G.C.E. Advanced Level. We are committed to academic excellence, discipline and the all-round development of every student entrusted to our care.",
          image: "/images/about.jpg",
          buttonLabel: "Discover our history",
        },
      },
      {
        key: "news",
        label: "News & Events",
        type: "collection",
        fields: [
          { key: "eyebrow", label: "Section label", type: "text" },
          { key: "title", label: "Heading", type: "text" },
          { key: "buttonLabel", label: "Button label", type: "text" },
        ],
        data: {
          eyebrow: "News & Events",
          title: "Latest News & Events",
          buttonLabel: "View All News",
        },
      },
      {
        key: "academics",
        label: "Academics & Co-Curricular",
        type: "cards",
        fields: [
          { key: "eyebrow", label: "Section label", type: "text" },
          { key: "title", label: "Heading", type: "text" },
          { key: "description", label: "Description", type: "textarea" },
        ],
        data: {
          eyebrow: "Academics & Beyond",
          title: "Our Academic Pathways",
          description: "From Grade 6 to the Advanced Level, our curriculum combines strong classroom teaching with sport, the arts and practical learning — preparing every student for higher education and beyond.",
        },
      },
    ],
  },
  {
    slug: "history",
    title: "History Page",
    description: "The college story and historical timeline",
    path: "/history",
    sections: [
      {
        key: "hero",
        label: "History Hero",
        type: "hero",
        fields: [
          { key: "eyebrow", label: "Top label", type: "text" },
          { key: "title", label: "Page title", type: "text" },
          { key: "description", label: "Introduction", type: "textarea" },
          { key: "image", label: "Background image", type: "image" },
        ],
        data: {
          eyebrow: "St. Thomas' College · Est. 1873",
          title: "Our History",
          description: "Founded on 10 August 1873, St. Thomas' College has served the community of Matale for over 150 years as one of the region's leading boys' schools.",
          image: "/images/hero.jpg",
        },
      },
      {
        key: "timeline",
        label: "Historical Timeline",
        type: "timeline",
        fields: [
          { key: "eyebrow", label: "Section label", type: "text" },
          { key: "title", label: "Heading", type: "text" },
          { key: "description", label: "Introduction", type: "textarea" },
        ],
        data: {
          eyebrow: "Milestones Since 1873",
          title: "The History of the College at a Glance",
          description: "From a church verandah with seventy-five pupils to a college of over two thousand — the defining moments of St. Thomas'.",
        },
      },
      {
        key: "alumni",
        label: "Notable Old Thomians",
        type: "list_old_thomians",
        fields: [
          { key: "eyebrow", label: "Section label", type: "text" },
          { key: "title", label: "Heading", type: "text" },
          { key: "description", label: "Description", type: "textarea" },
        ],
        data: {
          eyebrow: "Old Boys of the College",
          title: "Notable Old Thomians",
          description: "The Matale Old Thomians' Association — founded 1953, revived in 1983 — unites four local and three overseas branches of the college's alumni.",
        },
      },
      {
        key: "legacy",
        label: "College Today & CTA",
        type: "stats_cta",
        fields: [
          { key: "eyebrow", label: "Section label", type: "text" },
          { key: "title", label: "CTA title", type: "text" },
          { key: "description", label: "CTA description", type: "textarea" },
          { key: "buttonLabel", label: "Button label", type: "text" },
          { key: "buttonHref", label: "Button link", type: "url" },
        ],
        data: {
          eyebrow: "The College Today",
          title: "Admissions Open for 2027",
          description: "Applications are now open for the Grade 6 intake. For details and application forms, please contact the college office.",
          buttonLabel: "Apply for 2027",
          buttonHref: "/admissions",
        },
      },
    ],
  },
];

export const SITE_SETTINGS_DEFAULTS = {
  brandName: "St. Thomas' College",
  brandSubline: "Matale · Est. 1873",
  footerDescription:
    "Shaping scholars, athletes, artists and citizens of character in the heart of Matale for over 150 years.",
  phone: "+94 66 222 0173",
  email: "admissions@stcmatale.lk",
  address: "St. Thomas' College, Matale, Sri Lanka",
  officeHours: "Mon – Fri · 7.30 a.m. – 3.30 p.m.",
  admissionsYear: "2027",
  schoolLogo: "",
  cadetIntroEnabled: "true",
  cadetIntroHold: "2400",
  /** Admin falcon emblem — a calm white-circle crest shown across Admin Studio. */
  falconImage: "",
  falconScale: "100",
  /** Cadeting preloader defaults — each unit can override these per page. */
  cadetIntroLogo: "",
  cadetIntroLogoScale: "100",
  cadetIntroTagline: "",
  /** Site-wide cinematic preloader — "The Opening" (first-load experience). */
  sitePreloaderEnabled: "true",
  sitePreloaderLogo: "",
  sitePreloaderLogoScale: "100",
  sitePreloaderTitle: "St. Thomas' College Matale",
  sitePreloaderMotto: "Animo Et Fide",
  sitePreloaderLines:
    "Shaping scholars of uncommon character since 1873\nAnimo Et Fide — with courage and faith\nA tradition of learning, faith and service",
  sitePreloaderTitleScale: "100",
  sitePreloaderMottoScale: "100",
  sitePreloaderLinesScale: "100",
  sitePreloaderHold: "2600",
  sitePreloaderProgress: "true",
  sitePreloaderWhiteCircle: "true",
  sitePreloaderCircleScale: "100",
  sitePreloaderCircleRing: "true",
  sitePreloaderBarWidth: "100",
  sitePreloaderExit: "fade",
  sitePreloaderFrequency: "session",
  /** Network round loader (slow-navigation ring) — admin on/off switch. */
  routeLoaderEnabled: "true",
  /** Maintenance screen content (v2.8.39.2) — the Apple-style "We'll be
   * back" page. Edited from Admin → Settings → "Maintenance page content",
   * saved through PATCH /api/admin/settings exactly like the preloader keys. */
  siteMaintenanceTitle: "We'll be back soon.",
  siteMaintenanceSubtitle:
    "We're busy upgrading the college systems. Please check back soon.",
  /** Empty → falls back to the identity crest (schoolLogo), then the shield mark. */
  siteMaintenanceLogo: "",
  siteMaintenanceShowSocial: "true",
  /** Social URLs prefilled from the site footer; empty = icon hidden. */
  siteMaintenanceFacebook: "https://www.facebook.com/St.ThomasMatale/",
  siteMaintenanceInstagram: "https://www.instagram.com/stcmum/",
  siteMaintenanceYoutube: "",
  siteMaintenanceThreads: "",
  siteMaintenanceX: "https://x.com/stcmediaunit",
  /** Admin Studio colour theme — cinematic gradient preset. */
  adminTheme: "gold",
};

export function getCmsPageDefinition(slug: string) {
  return CMS_PAGES.find((page) => page.slug === slug);
}

/** A/L stream pages — list-backed sections (teachers + classes). */
const AL_STREAMS: { slug: string; path: string; title: string }[] = [
  { slug: "biological-science", path: "/advanced-level/biological-science", title: "Biological Science" },
  { slug: "physical-science", path: "/advanced-level/physical-science", title: "Physical Science" },
  { slug: "commerce", path: "/advanced-level/commerce", title: "Commerce" },
  { slug: "arts", path: "/advanced-level/arts", title: "Arts" },
];

for (const stream of AL_STREAMS) {
  CMS_PAGES.push({
    slug: `advanced-level-${stream.slug}`,
    title: `A/L — ${stream.title}`,
    description: `${stream.title} stream page — teaching panel and class structure`,
    path: stream.path,
    sections: [
      {
        key: "teachers",
        label: "Teaching Panel",
        type: "list_stream_teachers",
        fields: [],
        data: {},
      },
      {
        key: "classes",
        label: "Class Structure",
        type: "list_stream_classes",
        fields: [],
        data: {},
      },
    ],
  });
}
