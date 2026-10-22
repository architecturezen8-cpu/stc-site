import Image from "next/image";
import Link from "next/link";
import { sql } from "drizzle-orm";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  FilePenLine,
  FolderKanban,
  GraduationCap,
  Hexagon,
  Images,
  Inbox,
  Layers,
  Newspaper,
  PanelBottom,
  UserPlus,
} from "lucide-react";
import { db } from "@/db";
import {
  admissionApplications,
  appointments,
  events,
  galleryItems,
  inquiries,
  posts,
  staff,
} from "@/db/schema";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminEmblem } from "@/components/admin/admin-emblem";
import { requirePermission } from "@/lib/admin-auth";
import { cmsDashboardStats } from "@/lib/cms";

export const dynamic = "force-dynamic";

/** Dashboard hub cards — real photography instead of flat icon rows. */
const SECTIONS = [
  {
    label: "Content",
    caption: "Stories, calendar & people",
    image: "/images/news-sports.jpg",
    links: [
      { label: "News & Stories", desc: "Publish articles & photos", icon: Newspaper, href: "/admin/news" },
      { label: "Events & Schedule", desc: "Fixtures, venues & times", icon: CalendarDays, href: "/admin/events" },
      { label: "Faculty & Staff", desc: "Portraits & departments", icon: GraduationCap, href: "/admin/staff" },
    ],
  },
  {
    label: "Media",
    caption: "Photos for every page",
    image: "/images/sports.jpg",
    links: [
      { label: "Media Library", desc: "Upload & organise images", icon: FolderKanban, href: "/admin/media" },
      { label: "Campus Gallery", desc: "Curated college frames", icon: Images, href: "/admin/gallery" },
      { label: "Unit Galleries", desc: "Cadet unit archives", icon: Images, href: "/admin/unit-gallery" },
    ],
  },
  {
    label: "Website",
    caption: "Identity & structure",
    image: "/images/clubs.jpg",
    links: [
      { label: "Logos & Crests", desc: "Sync every logo by ID", icon: Hexagon, href: "/admin/logos" },
      { label: "Online Resources", desc: "Learning links by category", icon: BookOpenCheck, href: "/admin/resources" },
      { label: "Footer", desc: "Contact details & description", icon: PanelBottom, href: "/admin/footer" },
    ],
  },
];

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const admin = await requirePermission("dashboard", "read");
  const { denied } = await searchParams;
  const { pages, revisions } = await cmsDashboardStats();
  const [
    [admissions],
    [visits],
    [messages],
    [postCount],
    [eventCount],
    [galCount],
    [staffCount],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(admissionApplications),
    db.select({ count: sql<number>`count(*)::int` }).from(appointments),
    db.select({ count: sql<number>`count(*)::int` }).from(inquiries),
    db.select({ count: sql<number>`count(*)::int` }).from(posts),
    db.select({ count: sql<number>`count(*)::int` }).from(events),
    db.select({ count: sql<number>`count(*)::int` }).from(galleryItems),
    db.select({ count: sql<number>`count(*)::int` }).from(staff),
  ]);

  const metrics = [
    { label: "Stories", value: postCount.count, href: "/admin/news" },
    { label: "Events", value: eventCount.count, href: "/admin/events" },
    { label: "Gallery frames", value: galCount.count, href: "/admin/gallery" },
    { label: "Staff", value: staffCount.count, href: "/admin/staff" },
    { label: "Admissions", value: admissions.count, href: "/admin" },
    { label: "Visit requests", value: visits.count, href: "/admin" },
    { label: "Inquiries", value: messages.count, href: "/admin" },
    { label: "Revisions", value: revisions, href: "/admin/pages" },
  ];

  return (
    <AdminShell
      user={admin}
      title="Dashboard"
      subtitle={`Welcome back, ${admin.name}`}
      actions={
        <Link
          href="/"
          target="_blank"
          className="rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
        >
          View site
        </Link>
      }
    >
      {denied && (
        <div className="mb-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200">
          Your role ({admin.role.replaceAll("_", " ")}) does not have access to the
          <strong className="mx-1 font-semibold">{denied.replaceAll("-", " ")}</strong>
          section. Ask a Super Admin if you need it.
        </div>
      )}
      {/* ── Welcome banner — cinematic, image-led ─────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink text-white">
        <Image
          src="/images/hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a09] via-[#0a0a09]/85 to-transparent" />
        <div className="grain absolute inset-0 opacity-60" />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-center gap-4 sm:gap-5">
            <AdminEmblem size={64} />
            <div>
              <p className="text-[9px] uppercase tracking-[0.32em] text-[#ffd444]/90">
                Admin Studio
              </p>
              <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                Good to see you, {admin.name.split(" ")[0]}.
              </h2>
              <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-white/55">
                {pages.length} pages under your care — edit, preview and publish
                the college website from one place.
              </p>
            </div>
          </div>
          <Link
            href="/admin/news"
            className="group inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-full bg-[#ffd444] px-6 text-[12px] font-semibold text-[#0b0b0a] transition-transform hover:-translate-y-0.5 sm:self-center"
          >
            Continue publishing
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* ── Metrics strip ─────────────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
        {metrics.map(({ label, value, href }) => (
          <Link
            key={label}
            href={href}
            className="group rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:border-[#ffd444]/50"
          >
            <p className="font-display text-2xl font-semibold tracking-[-0.02em] text-white transition-colors group-hover:text-[#ffd444]">
              {value}
            </p>
            <p className="mt-0.5 truncate text-[9.5px] font-medium uppercase tracking-[0.14em] text-white/40">
              {label}
            </p>
          </Link>
        ))}
      </div>

      {/* ── Section hub cards — the studio at a glance ────────────── */}
      <div className="mt-7 grid gap-5 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <section
            key={section.label}
            className="group/card flex min-w-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] transition-colors hover:border-[#ffd444]/40"
          >
            {/* Photographic header */}
            <div className="relative h-36 shrink-0 overflow-hidden">
              <Image
                src={section.image}
                alt={section.label}
                fill
                sizes="(max-width: 1024px) 100vw, 33vw"
                className="object-cover transition-transform duration-700 group-hover/card:scale-[1.05]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0b] via-black/35 to-transparent" />
              <div className="absolute inset-x-5 bottom-3.5">
                <p className="text-[8px] uppercase tracking-[0.3em] text-[#ffd444]/90">{section.caption}</p>
                <h3 className="mt-1 font-display text-xl font-semibold tracking-[-0.02em] text-white">
                  {section.label}
                </h3>
              </div>
            </div>
            {/* Links */}
            <div className="flex-1 divide-y divide-white/[0.06]">
              {section.links.map(({ label, desc, icon: Icon, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="group/link flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-white/[0.04]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#ffd444]/12 text-[#ffd444] transition-colors group-hover/link:bg-[#ffd444] group-hover/link:text-[#0b0b0a]">
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-white/90">
                      {label}
                    </span>
                    <span className="block truncate text-[11px] text-white/40">{desc}</span>
                  </span>
                  <ArrowUpRight
                    size={15}
                    className="shrink-0 text-white/20 transition-all group-hover/link:translate-x-0.5 group-hover/link:text-[#ffd444]"
                  />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* ── Pages under the visual editor ─────────────────────────── */}
      <section className="mt-7 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">
              Visual Editor
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em]">
              Website pages
            </h2>
          </div>
          <Link
            href="/admin/pages"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[10px] font-medium text-white/55 hover:border-white/35 hover:text-white"
          >
            <Layers size={12} /> All pages
          </Link>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {pages.map((page) => (
            <Link
              key={page.slug}
              href={`/admin/editor/${page.slug}`}
              className="group flex min-w-0 items-center gap-4 rounded-xl border border-white/10 p-4 transition-all hover:-translate-y-0.5 hover:border-[#ffd444]/60"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ffd444] text-[#0b0b0a]">
                <FilePenLine size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[16px] font-semibold">
                  {page.title}
                </span>
                <span className="mt-0.5 block text-[11px] text-white/35">
                  Updated {page.updatedAt.toLocaleDateString()}
                </span>
              </span>
              <span
                className={`hidden rounded-full px-2.5 py-1 text-[8px] uppercase tracking-[0.15em] sm:inline ${
                  page.status === "draft"
                    ? "bg-amber-400/15 text-amber-300"
                    : "bg-emerald-400/15 text-emerald-300"
                }`}
              >
                {page.status}
              </span>
              <ArrowRight
                size={15}
                className="shrink-0 text-white/25 transition-transform group-hover:translate-x-1"
              />
            </Link>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
