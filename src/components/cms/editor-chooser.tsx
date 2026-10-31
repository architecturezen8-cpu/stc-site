"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutList, MousePointerClick, X } from "lucide-react";
import { VISUAL_EDITOR_PAGES } from "@/lib/visual-pages";

/**
 * Editor chooser — shown when a page is opened with ?choose=1 (the
 * "Edit page" entry from /admin/pages). Lets the admin pick HOW to edit:
 *
 *  • Visual Editor  — click any element on the live page and restyle/rewrite
 *                     it (?visualEditor=1). Purely element-level: the section
 *                     toolbar stays out of the way.
 *  • Section Editor — structured content editing: headings, lists, hide/show
 *                     and the A/L "Add" buttons (?cmsEditor=1&edit=1).
 */
export function EditorChooser() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requested = searchParams.get("choose") === "1";

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  /* The dialog is genuinely open only while the flag AND the session check
     hold on a public page. Once "choose" leaves the URL (an editor was
     picked, or the user navigated Home → /admin) ready must reset, or the
     scroll-lock effect below re-arms on every navigation and freezes the
     admin dashboard (the "have to reload to scroll" bug). */
  /* v2.9.1.0 — "busy" reset: the pick above flips this component's busy flag
     and the flag survived in the mounted layout component. Coming back to
     edit later (Home → Admin → Edit page) reopened the dialog with BOTH
     cards still disabled (opacity-60) — as if already clicked once — and
     only a full page reload re-enabled them (the owner's "eth e dekama
     fade wela … page eka reload wenna one"). Dropping ?choose=1 now also
     clears busy, so every fresh open starts fully enabled. */
  if (!requested && ready) setReady(false);
  if (!requested && busy) setBusy(false);

  const open =
    requested && ready && !(pathname.startsWith("/admin") || pathname.startsWith("/lms-admin"));

  const isSectionPage = Boolean(
    VISUAL_EDITOR_PAGES.find((page) => page.path === pathname)?.sectionEditor,
  );

  useEffect(() => {
    if (!requested || pathname.startsWith("/admin") || pathname.startsWith("/lms-admin")) return;
    let cancelled = false;
    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error();
      })
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        router.replace(`/admin/login?next=${encodeURIComponent(pathname + "?choose=1")}`);
      });
    return () => {
      cancelled = true;
    };
  }, [requested, pathname, router]);

  useEffect(() => {
    /* Lock scrolls only while the chooser dialog is truly open — ready alone
       would keep re-locking /admin after every editor session. */
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("choose");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, pathname, router, searchParams]);

  const close = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("choose");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (!open) return null;

  const pick = (editor: "visual" | "section") => {
    setBusy(true);
    const joiner = pathname.includes("?") ? "&" : "?";
    const href =
      editor === "visual"
        ? `${pathname}${joiner}visualEditor=1`
        : `${pathname}${joiner}cmsEditor=1&edit=1`;
    router.replace(href, { scroll: false });
  };

  return (
    <div
      data-visual-ui=""
      role="dialog"
      aria-modal="true"
      aria-label="Choose an editor"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      onClick={close}
      style={{ animation: "fadeIn 240ms ease-out both" }}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/12 bg-[#0d0d0c] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "fadeUp 420ms cubic-bezier(0.22,1,0.36,1) both" }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-7 py-6">
          <div>
            <p className="font-sans text-[9px] font-semibold uppercase tracking-[0.28em] text-[#ffd444]">
              Edit mode
            </p>
            <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em] text-white">
              Choose your editor
            </h2>
            <p className="mt-1 font-mono text-[10px] text-white/30">{pathname}</p>
          </div>
          <button
            onClick={close}
            aria-label="Cancel"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-white/60 transition-colors hover:border-white/40 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        <div className="grid gap-4 p-7 sm:grid-cols-2">
          <button
            onClick={() => pick("visual")}
            disabled={busy}
            className="group relative overflow-hidden rounded-2xl border border-white/12 bg-white/[0.03] p-6 text-left transition-all hover:-translate-y-1 hover:border-[#ffd444]/70 hover:bg-[#ffd444]/[0.06] disabled:opacity-60"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#ffd444]/15 text-[#ffd444] transition-colors group-hover:bg-[#ffd444] group-hover:text-[#0b0b0a]">
              <MousePointerClick size={19} />
            </span>
            <h3 className="mt-4 font-display text-lg font-semibold text-white">
              Visual Editor
            </h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/45">
              Click any text, image or button on the real page and edit it in
              place — colours, links, visibility and more.
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ffd444]/80">
              Element-level editing
            </span>
          </button>

          {isSectionPage ? (
            <button
              onClick={() => pick("section")}
              disabled={busy}
              className="group relative overflow-hidden rounded-2xl border border-white/12 bg-white/[0.03] p-6 text-left transition-all hover:-translate-y-1 hover:border-[#ffd444]/70 hover:bg-[#ffd444]/[0.06] disabled:opacity-60"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#ffd444]/15 text-[#ffd444] transition-colors group-hover:bg-[#ffd444] group-hover:text-[#0b0b0a]">
                <LayoutList size={19} />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-white">
                Section Editor
              </h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/45">
                Edit structured content — headings, teachers &amp; classes
                lists, hide/show sections, and more.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ffd444]/80">
                Lists &amp; sections
              </span>
            </button>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 p-6 opacity-45">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.06] text-white/40">
                <LayoutList size={19} />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-white/70">
                Section Editor
              </h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/35">
                Not available on this page — only pages with structured
                sections (Home, History, A/L streams) use it.
              </p>
            </div>
          )}
        </div>

        <p className="border-t border-white/8 px-7 py-4 text-center text-[11px] text-white/30">
          Tip — you can switch between editors any time from the toolbar.
        </p>
      </div>
    </div>
  );
}
