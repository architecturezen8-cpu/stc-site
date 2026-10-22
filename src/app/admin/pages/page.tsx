import Link from "next/link";
import { desc } from "drizzle-orm";
import {
  ArrowRight,
  ExternalLink,
  FileText,
  MousePointerClick,
} from "lucide-react";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { AdminShell } from "@/components/admin/admin-shell";
import { requirePermission } from "@/lib/admin-auth";
import {
  VISUAL_EDITOR_PAGES,
  type VisualEditorPage,
} from "@/lib/visual-pages";

export const dynamic = "force-dynamic";

export default async function AdminPagesList() {
  const admin = await requirePermission("pages", "read");
  const newsPosts = await db
    .select({ title: posts.title, slug: posts.slug, excerpt: posts.excerpt })
    .from(posts)
    .orderBy(desc(posts.publishedAt));

  const articlePages: VisualEditorPage[] = newsPosts.map((post) => ({
    title: post.title,
    path: `/news/${post.slug}`,
    group: "News Articles",
    description: post.excerpt,
  }));
  const allPages = [...VISUAL_EDITOR_PAGES, ...articlePages];
  const groups = Array.from(new Set(allPages.map((page) => page.group)));

  /** Every "Edit page" entry opens the editor CHOOSER (?choose=1) — the
   *  admin picks Visual or Section editor on the page itself. */
  const editorHref = (path: string) => {
    const joiner = path.includes("?") ? "&" : "?";
    return `${path}${joiner}choose=1`;
  };

  return (
    <AdminShell
      user={admin}
      title="Pages"
      subtitle={`${allPages.length} pages · choose any page and edit it directly on the original site`}
    >
      <div className="space-y-9">
        {groups.map((group) => {
          const groupPages = allPages.filter((page) => page.group === group);
          return (
            <section key={group}>
              <div className="mb-4 flex items-center gap-4">
                <p className="shrink-0 font-sans text-[9px] font-semibold uppercase tracking-[0.25em] text-[#ffd444]">
                  {group}
                </p>
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-[9px] text-white/25">{groupPages.length} pages</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {groupPages.map((page) => (
                  <article
                    key={page.path}
                    className="group min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all hover:-translate-y-0.5 hover:border-[#ffd444]/55"
                  >
                    <Link
                      href={editorHref(page.path)}
                      className="block p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ffd444] text-[#0b0b0a]">
                          <FileText size={16} />
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[8px] uppercase tracking-[0.15em] text-emerald-300">
                          <MousePointerClick size={9} /> Visual Ready
                        </span>
                      </div>
                      <h2 className="mt-4 line-clamp-2 font-display text-xl font-semibold leading-snug tracking-[-0.02em]">
                        {page.title}
                      </h2>
                      <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-white/42">
                        {page.description}
                      </p>
                      <p className="mt-4 truncate font-mono text-[9px] text-white/25">
                        {page.path}
                      </p>
                    </Link>

                    <div className="flex border-t border-white/10">
                      <Link
                        href={editorHref(page.path)}
                        className="flex flex-1 items-center justify-center gap-2 py-3.5 text-[11px] font-semibold text-[#ffd444] transition-colors hover:bg-white/5"
                      >
                        Edit page
                        <ArrowRight
                          size={12}
                          className="transition-transform group-hover:translate-x-1"
                        />
                      </Link>
                      <Link
                        href={page.path}
                        target="_blank"
                        className="flex flex-1 items-center justify-center gap-2 border-l border-white/10 py-3.5 text-[11px] text-white/45 transition-colors hover:bg-white/5 hover:text-white"
                      >
                        <ExternalLink size={12} /> Live site
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </AdminShell>
  );
}
