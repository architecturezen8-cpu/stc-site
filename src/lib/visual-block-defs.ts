export type BlockFieldType = "text" | "textarea" | "image" | "url" | "color";

export type BlockFieldDef = {
  key: string;
  label: string;
  type: BlockFieldType;
  placeholder?: string;
};

export type VisualBlockDef = {
  type: string;
  label: string;
  description: string;
  category: "Sections" | "Content";
  accent: string;
  fields: BlockFieldDef[];
  defaults: Record<string, string>;
};

/** Framer-style premade blocks insertable on any public page. */
export const VISUAL_BLOCK_DEFS: VisualBlockDef[] = [
  {
    type: "hero-banner",
    label: "Hero Banner",
    description: "Full-width cinematic banner with heading and button",
    category: "Sections",
    accent: "bg-[#ffd444] text-[#0b0b0a]",
    fields: [
      { key: "image", label: "Background image", type: "image" },
      { key: "eyebrow", label: "Eyebrow", type: "text" },
      { key: "title", label: "Title", type: "textarea" },
      { key: "subtitle", label: "Subtitle", type: "textarea" },
      { key: "buttonLabel", label: "Button label", type: "text" },
      { key: "buttonHref", label: "Button link", type: "url" },
    ],
    defaults: {
      image: "/images/hero.jpg",
      eyebrow: "St. Thomas' College",
      title: "A new section title",
      subtitle: "Write a short, powerful line of supporting text here.",
      buttonLabel: "Learn More",
      buttonHref: "/contact",
    },
  },
  {
    type: "cta-banner",
    label: "Call to Action",
    description: "Gold accent strip with one clear button",
    category: "Sections",
    accent: "bg-emerald-400/20 text-emerald-300",
    fields: [
      { key: "title", label: "Title", type: "textarea" },
      { key: "text", label: "Supporting text", type: "textarea" },
      { key: "buttonLabel", label: "Button label", type: "text" },
      { key: "buttonHref", label: "Button link", type: "url" },
    ],
    defaults: {
      title: "Admissions are open",
      text: "Speak to the college office today and secure your son's place.",
      buttonLabel: "Contact Us",
      buttonHref: "/contact",
    },
  },
  {
    type: "stats-row",
    label: "Stats Row",
    description: "Four headline numbers in a row",
    category: "Sections",
    accent: "bg-sky-400/20 text-sky-300",
    fields: [
      { key: "value1", label: "Value 1", type: "text" },
      { key: "label1", label: "Label 1", type: "text" },
      { key: "value2", label: "Value 2", type: "text" },
      { key: "label2", label: "Label 2", type: "text" },
      { key: "value3", label: "Value 3", type: "text" },
      { key: "label3", label: "Label 3", type: "text" },
      { key: "value4", label: "Value 4", type: "text" },
      { key: "label4", label: "Label 4", type: "text" },
    ],
    defaults: {
      value1: "1873",
      label1: "Founded",
      value2: "1,250",
      label2: "Students",
      value3: "140",
      label3: "Educators",
      value4: "48",
      label4: "Clubs & Societies",
    },
  },
  {
    type: "image-text",
    label: "Image + Text",
    description: "Split row — photograph beside rich text",
    category: "Sections",
    accent: "bg-violet-400/20 text-violet-300",
    fields: [
      { key: "image", label: "Image", type: "image" },
      { key: "eyebrow", label: "Eyebrow", type: "text" },
      { key: "title", label: "Title", type: "textarea" },
      { key: "text", label: "Body text", type: "textarea" },
    ],
    defaults: {
      image: "/images/about.jpg",
      eyebrow: "Our Story",
      title: "Write your section title",
      text: "Write the supporting paragraph here. Keep it to two or three sentences for the best layout on mobile.",
    },
  },
  {
    type: "heading-block",
    label: "Heading",
    description: "Eyebrow, big title and intro line",
    category: "Content",
    accent: "bg-white/10 text-white/70",
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "text" },
      { key: "title", label: "Title", type: "textarea" },
      { key: "subtitle", label: "Subtitle", type: "textarea" },
    ],
    defaults: {
      eyebrow: "New Section",
      title: "Your heading goes here",
      subtitle: "Optional one-line introduction.",
    },
  },
  {
    type: "paragraph",
    label: "Text Block",
    description: "Simple rich paragraph",
    category: "Content",
    accent: "bg-white/10 text-white/70",
    fields: [{ key: "text", label: "Text", type: "textarea" }],
    defaults: {
      text: "Write your paragraph here. This block preserves the site typography and spacing automatically.",
    },
  },
  {
    type: "full-image",
    label: "Full Image",
    description: "Edge-to-edge photograph with caption",
    category: "Content",
    accent: "bg-white/10 text-white/70",
    fields: [
      { key: "image", label: "Image", type: "image" },
      { key: "caption", label: "Caption", type: "text" },
    ],
    defaults: {
      image: "/images/hero.jpg",
      caption: "Add a caption",
    },
  },
  {
    type: "quote-block",
    label: "Quote",
    description: "Large centred quotation with attribution",
    category: "Content",
    accent: "bg-white/10 text-white/70",
    fields: [
      { key: "quote", label: "Quote", type: "textarea" },
      { key: "attribution", label: "Attribution", type: "text" },
    ],
    defaults: {
      quote: "Write the quotation here.",
      attribution: "Name, Role",
    },
  },
];

export function blockDef(type: string) {
  return VISUAL_BLOCK_DEFS.find((def) => def.type === type) ?? null;
}

export function defaultsFor(type: string) {
  return { ...(blockDef(type)?.defaults ?? {}) };
}
