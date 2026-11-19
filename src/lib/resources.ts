import "server-only";

import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { onlineResources, type OnlineResource } from "@/db/schema";

/**
 * Online learning resources — a dedicated, category-based library managed
 * from /admin/resources and displayed on /resources.
 *
 * Everything is organised by category (Past Papers, Video Lessons, …).
 * Categories can be extended by admins via the custom-collections system
 * (type: "resources").
 */

export const RESOURCE_CATEGORIES_DEFAULT = [
  "Past Papers & Answers",
  "Syllabus & Curriculum",
  "Video Lessons",
  "Reference & Libraries",
  "Exam Information",
  "Student Tools",
];

export const RESOURCE_LINK_TYPES = ["link", "paper", "document", "video"] as const;
export type ResourceLinkType = (typeof RESOURCE_LINK_TYPES)[number];

export const RESOURCE_MEDIUMS = ["All", "Sinhala", "Tamil", "English"] as const;
export type ResourceMedium = (typeof RESOURCE_MEDIUMS)[number];

/* ── Runtime schema guard (idempotent) ─────────────────────────────── */
let schemaReady: Promise<void> | null = null;

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "online_resources" (
          "id" serial PRIMARY KEY,
          "title" text NOT NULL,
          "description" text DEFAULT '' NOT NULL,
          "category" varchar(80) DEFAULT 'General' NOT NULL,
          "url" text NOT NULL,
          "link_type" varchar(20) DEFAULT 'link' NOT NULL,
          "medium" varchar(20) DEFAULT 'All' NOT NULL,
          "featured" boolean DEFAULT false NOT NULL,
          "sort_order" integer DEFAULT 0 NOT NULL,
          "created_by" integer,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        )
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/* ── Starter content (loaded once, only while the table is empty) ───── */
const STARTER_RESOURCES: Array<{
  title: string;
  description: string;
  category: string;
  url: string;
  linkType: ResourceLinkType;
  medium: ResourceMedium;
  featured?: boolean;
}> = [
  {
    title: "Past Papers WiKi — O/L & A/L Archive",
    description:
      "Sri Lanka's largest free archive of Department of Examinations past papers with marking schemes and answers.",
    category: "Past Papers & Answers",
    url: "https://pastpapers.wiki",
    linkType: "paper",
    medium: "All",
    featured: true,
  },
  {
    title: "e-thaksalawa — Ministry of Education LMS",
    description:
      "The official national e-learning platform: grades 6–13 lessons, model papers and teacher guides.",
    category: "Video Lessons",
    url: "https://ethaksalawa.moe.gov.lk",
    linkType: "video",
    medium: "Sinhala",
    featured: true,
  },
  {
    title: "National Institute of Education — Syllabi",
    description:
      "Official NIE syllabus documents and teacher instructional manuals for every subject and grade.",
    category: "Syllabus & Curriculum",
    url: "https://nie.lk",
    linkType: "document",
    medium: "All",
  },
  {
    title: "Department of Examinations — Results & Notices",
    description:
      "Official exam time tables, results releases and circulars from the Department of Examinations.",
    category: "Exam Information",
    url: "https://doenets.lk",
    linkType: "link",
    medium: "All",
  },
  {
    title: "National Library & Documentation Services Board",
    description:
      "Digital catalogues and reading-room services available to Thomians preparing for research projects.",
    category: "Reference & Libraries",
    url: "https://nlib.lk",
    linkType: "link",
    medium: "All",
  },
  {
    title: "Learning Poetry — English Practice Hub",
    description:
      "Graded reading, grammar drills and vocabulary games suitable for O/L English preparation.",
    category: "Student Tools",
    url: "https://learnenglish.britishcouncil.org",
    linkType: "link",
    medium: "English",
  },
];

async function ensureSeed() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(onlineResources);
  if (count === 0) {
    await db.insert(onlineResources).values(
      STARTER_RESOURCES.map((resource, index) => ({
        ...resource,
        sortOrder: index,
      })),
    );
  }
}

/** Exported so other routes can guarantee the table exists before querying. */
export async function ensureResourcesSchema() {
  return ensureSchema();
}

/** All resources ordered by category then manual order. */
export async function listOnlineResources(): Promise<OnlineResource[]> {
  await ensureSchema();
  await ensureSeed();
  return db
    .select()
    .from(onlineResources)
    .orderBy(asc(onlineResources.sortOrder), asc(onlineResources.id));
}

/** Category list = defaults + every category actually in use. */
export function mergeResourceCategories(rows: OnlineResource[]): string[] {
  return Array.from(
    new Set([
      ...RESOURCE_CATEGORIES_DEFAULT,
      ...rows.map((row) => row.category),
    ]),
  ).filter(Boolean);
}
