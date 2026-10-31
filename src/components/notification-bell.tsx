"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell, ExternalLink, Inbox, X } from "lucide-react";

/* ── v2.8.71.0 — THE NOTIFICATION BELL (shared) ───────────────────────────
   Owner item 2: "notification dashbord ekata danna epa. header eke bell
   icon kak danna. eka click karama full details ekkama neme — nikan just
   notification ekak awith thiyanawa meken kiyala wage. eka uda click
   karama notification eka popup ekak wage open wenna. aya notifications
   walata wenama page ekak thiyanna. ara uda bell icon eke e page ekata
   yanna option ekakuth danna."

   ONE component, THREE mounts:
   · portal  (student / teacher / parent / principal) — receives school
     broadcasts, unread badge, opening one marks it read;
   · lms     (LMS Admin Studio header) — monitors what was posted;
   · site    (website Admin Studio header) — same monitor.
   The dropdown is a compact PREVIEW (title + time only, no full body);
   clicking a row opens the full notification as a popup; the "All
   notifications" option sits at the TOP of the dropdown and leads to the
   dedicated page (the admin variants lead to their composer/history page).

   The dropdown is ABSOLUTE inside the header (headers use backdrop-blur,
   so a fixed layer here would be trapped by the filtered ancestor — the
   drawer lesson); the popup portals to <body> so fixed works. */

export type BellVariant = "portal" | "lms" | "site";

type BellItem = {
  id: number;
  title: string;
  body: string;
  kind: string;
  audience: string;
  authorName: string | null;
  linkUrl: string | null;
  createdAt: string;
  readAt: string | null;
  reads?: number;
};

/* v2.8.88.0 — an admin bell alert row (admin_notifications). */
type AdminAlertRow = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  reference: string | null;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  general: "Notice",
  maintenance: "Maintenance",
  event: "Event",
  urgent: "Urgent",
  /* v2.8.88.0 — the admin bell alert kinds */
  appointment: "Appointment",
  admission: "Application",
  contact: "Message",
  special_form: "Form",
  email_failed: "Email failed",
};

const KIND_DOT: Record<string, string> = {
  general: "bg-stone-400",
  maintenance: "bg-amber-500",
  event: "bg-sky-500",
  urgent: "bg-red-500",
  appointment: "bg-emerald-500",
  admission: "bg-amber-500",
  contact: "bg-stone-400",
  special_form: "bg-orange-500",
  email_failed: "bg-red-500",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* Every scope has its own token set (.portal-scope --pt-*, .lms-admin-scope
   --la-*); the website Admin Studio has none — fixed cinematic dark. */
const THEME: Record<
  BellVariant,
  {
    btn: string;
    panel: string;
    heading: string;
    body: string;
    muted: string;
    faint: string;
    row: string;
    rowActive: string;
    chip: string;
    allBtn: string;
    closeBtn: string;
    popupCard: string;
    popupTitle: string;
    linkBtn: string;
    badge: string;
    divider: string;
    skeleton: string;
  }
> = {
  portal: {
    btn: "border-[var(--pt-border)] bg-[var(--pt-panel)] text-[var(--pt-body)] hover:border-[var(--pt-border-strong)] hover:text-[var(--pt-heading)]",
    panel: "border-[var(--pt-border)] bg-[var(--pt-panel)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.55)]",
    heading: "text-[var(--pt-heading)]",
    body: "text-[var(--pt-body)]",
    muted: "text-[var(--pt-muted)]",
    faint: "text-[var(--pt-faint)]",
    row: "hover:bg-[var(--pt-panel-soft)]",
    rowActive: "bg-[var(--pt-panel-soft)]",
    chip: "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]",
    allBtn: "border-[var(--pt-border)] text-[var(--pt-muted)] hover:border-[var(--pt-accent)] hover:text-[var(--pt-accent-text)]",
    closeBtn: "text-[var(--pt-muted)] hover:bg-[var(--pt-panel-soft)] hover:text-[var(--pt-heading)]",
    popupCard: "border-[var(--pt-border)] bg-[var(--pt-panel)]",
    popupTitle: "text-[var(--pt-heading)]",
    linkBtn: "bg-[var(--pt-accent)] text-[var(--pt-on-accent)] hover:opacity-90",
    badge: "bg-[var(--pt-accent)] text-[var(--pt-on-accent)]",
    divider: "border-[var(--pt-border)]",
    skeleton: "bg-[var(--pt-chip)]",
  },
  lms: {
    btn: "border-[var(--la-border)] bg-[var(--la-panel)] text-[var(--la-body)] hover:border-[var(--la-border-strong)] hover:text-[var(--la-heading)]",
    panel: "border-[var(--la-border)] bg-[var(--la-panel)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.5)]",
    heading: "text-[var(--la-heading)]",
    body: "text-[var(--la-body)]",
    muted: "text-[var(--la-muted)]",
    faint: "text-[var(--la-faint)]",
    row: "hover:bg-[var(--la-panel-soft)]",
    rowActive: "bg-[var(--la-panel-soft)]",
    chip: "bg-[var(--la-chip)] text-[var(--la-chip-text)]",
    allBtn: "border-[var(--la-border)] text-[var(--la-muted)] hover:border-[var(--la-border-strong)] hover:text-[var(--la-heading)]",
    closeBtn: "text-[var(--la-muted)] hover:bg-[var(--la-panel-soft)] hover:text-[var(--la-heading)]",
    popupCard: "border-[var(--la-border)] bg-[var(--la-panel)]",
    popupTitle: "text-[var(--la-heading)]",
    linkBtn: "bg-[#ffd444] text-[#141400] hover:bg-[#e8c13a]",
    badge: "bg-[#ffd444] text-black",
    divider: "border-[var(--la-divider)]",
    skeleton: "bg-[var(--la-chip)]",
  },
  site: {
    btn: "border-white/15 bg-white/[0.06] text-white/70 hover:border-white/35 hover:text-white",
    panel: "border-white/12 bg-[#141412] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]",
    heading: "text-white",
    body: "text-white/80",
    muted: "text-white/50",
    faint: "text-white/35",
    row: "hover:bg-white/[0.05]",
    rowActive: "bg-white/[0.05]",
    chip: "bg-white/[0.08] text-white/60",
    allBtn: "border-white/15 text-white/60 hover:border-[#ffd444] hover:text-[#ffd444]",
    closeBtn: "text-white/50 hover:bg-white/10 hover:text-white",
    popupCard: "border-white/12 bg-[#141412]",
    popupTitle: "text-white",
    linkBtn: "bg-[#ffd444] text-[#0b0b0a] hover:bg-white",
    badge: "bg-[#ffd444] text-black",
    divider: "border-white/10",
    skeleton: "bg-white/[0.06]",
  },
};

export function NotificationBell({
  variant,
  role,
  manageHref,
  initialUnread = 0,
}: {
  variant: BellVariant;
  /** portal only — the reader's role (drives the x-portal-role header) */
  role?: string;
  /** where "All notifications" leads (the dedicated page / manage page) */
  manageHref: string;
  /** portal only — server-fetched unread count for the badge */
  initialUnread?: number;
}) {
  const t = THEME[variant];
  const [open, setOpen] = useState(false);
  const [popup, setPopup] = useState<BellItem | null>(null);
  const [items, setItems] = useState<BellItem[] | null>(null);
  const [alerts, setAlerts] = useState<AdminAlertRow[]>([]);
  const [error, setError] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  /* Portal to <body> for the popup; dropdown stays absolute in the header. */
  useEffect(() => {
    const t2 = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t2);
  }, []);

  const load = useCallback(async () => {
    try {
      if (variant === "portal") {
        const res = await fetch("/api/portal/broadcasts?filter=all", {
          headers: { "x-portal-role": role ?? "student" },
        });
        const data = (await res.json()) as {
          ok: boolean;
          items?: BellItem[];
          unread?: number;
        };
        if (data.ok && data.items) {
          setItems(data.items);
          setError(false);
          if (typeof data.unread === "number") setUnread(data.unread);
        } else setError(true);
      } else if (variant === "lms") {
        const res = await fetch("/api/admin/broadcasts");
        const data = (await res.json()) as { ok: boolean; items?: BellItem[] };
        if (data.ok && data.items) {
          setItems(data.items);
          setError(false);
        } else setError(true);
      } else {
        /* v2.8.88.0 — the site bell reads its OWN feed: form-submission
           alerts + failed-mail alerts (+ best-effort broadcasts). A role
           without the portal module no longer hits the old 403 wall. */
        const res = await fetch("/api/admin/bell", { cache: "no-store" });
        const data = (await res.json()) as {
          ok: boolean;
          alerts?: AdminAlertRow[];
          unread?: number;
          broadcasts?: BellItem[] | null;
        };
        if (data.ok) {
          setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
          setUnread(typeof data.unread === "number" ? data.unread : 0);
          setItems(Array.isArray(data.broadcasts) ? data.broadcasts : []);
          setError(false);
        } else setError(true);
      }
    } catch {
      setError(true);
    }
  }, [role, variant]);

  /* Mount fetch — so the badge is live on EVERY page, not only the ones
     that hand us a server count. All setState runs post-await. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  /* Refresh each time the dropdown opens (post-await setState only). */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [open, load]);

  /* v2.8.88.0 — the site bell marks every alert read when the dropdown
     opens (one global read) and polls softly so a new submission surfaces
     without a manual refresh. */
  useEffect(() => {
    if (!open || variant !== "site" || unread <= 0) return;
    const t = setTimeout(() => {
      fetch("/api/admin/bell", { method: "POST" }).catch(() => {
        /* next load re-syncs */
      });
      const now = new Date().toISOString();
      setAlerts((prev) => prev.map((a) => (a.readAt ? a : { ...a, readAt: now })));
      setUnread(0);
    }, 0);
    return () => clearTimeout(t);
  }, [open, variant, unread]);

  useEffect(() => {
    if (variant !== "site") return;
    const t = setInterval(() => {
      void load();
    }, 60_000);
    return () => clearInterval(t);
  }, [variant, load]);

  /* Outside-click + Escape close for the dropdown (document listeners —
     no fixed backdrop inside the blurred header). */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* Body scroll lock + Escape while the popup is open. */
  useEffect(() => {
    if (!popup) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopup(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [popup]);

  function openItem(item: BellItem) {
    setOpen(false);
    setPopup(item);
    if (variant === "portal" && !item.readAt) {
      /* Optimistic: the row goes quiet and the badge counts down. */
      setItems((prev) =>
        prev
          ? prev.map((i) =>
              i.id === item.id
                ? { ...i, readAt: i.readAt ?? new Date().toISOString() }
                : i,
            )
          : prev,
      );
      setUnread((n) => Math.max(0, n - 1));
      fetch("/api/portal/broadcasts/read", {
        method: "POST",
        headers: { "content-type": "application/json", "x-portal-role": role ?? "student" },
        body: JSON.stringify({ id: item.id }),
      }).catch(() => {
        /* the next load re-syncs */
      });
    }
  }

  const isAdmin = variant !== "portal";

  /* v2.8.88.0 — the site dropdown merges the two feeds: alerts first
     (new submissions + failed mails, unread-dotted), then broadcasts. */
  const alertItems: BellItem[] = alerts.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body ?? "",
    kind: a.kind,
    audience: "staff",
    authorName: a.reference,
    linkUrl: a.linkUrl,
    createdAt: a.createdAt,
    readAt: a.readAt,
  }));
  const merged = variant === "site" ? [...alertItems, ...(items ?? [])] : (items ?? []);

  const dropdown = (
    <div
      /* v2.8.76.1 — mobile: the wrap goes STATIC below md so the dropdown
         anchors to the sticky header instead of the bell — the bell sits
         LEFT of the menu button, so right-0 of a 320px panel ran off the
         LEFT viewport edge on phones (the owner's "left side ekata move
         wela overflow wenawa"). right-4 from the header = a 16px gutter.
         md+ keeps the exact bell-anchored dropdown. */
      className={`absolute right-0 top-[calc(100%+10px)] z-50 w-80 max-w-[calc(100vw-2rem)] max-md:right-4 overflow-hidden rounded-2xl border ${t.panel}`}
      role="dialog"
      aria-label="Notifications preview"
    >
      {/* The owner's "go to the page" option sits at the TOP of the bell. */}
      <div className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${t.divider}`}>
        <p className={`text-[13px] font-semibold ${t.heading}`}>Notifications</p>
        <Link
          href={manageHref}
          onClick={() => setOpen(false)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold transition-colors ${t.allBtn}`}
        >
          <Inbox size={13} aria-hidden="true" />
          {isAdmin ? "All notifications" : "View all"}
        </Link>
      </div>

      <div className="max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {items === null ? (
          <div className="space-y-2 p-3" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-12 animate-pulse rounded-xl ${t.skeleton}`} />
            ))}
          </div>
        ) : error ? (
          <p className={`px-4 py-6 text-center text-[12.5px] ${t.muted}`}>
            Could not load notifications.
          </p>
        ) : merged.length === 0 ? (
          <p className={`px-4 py-8 text-center text-[12.5px] ${t.muted}`}>
            {isAdmin ? "Nothing yet — new appointments, applications, messages and email failures will appear here." : "No notifications yet."}
          </p>
        ) : (
          merged.slice(0, 10).map((item) => {
            const isAlert = item.audience === "staff";
            const isUnread = (variant === "portal" || isAlert) && !item.readAt;
            /* v2.8.91.0 — a failed mail reads as a failure at a glance:
               red title + red preview (the owner: "email alerts walath
               fail ekak awoth witharak red walain pennana dammoth hodai
               ne"). */
            const isFail = isAlert && item.kind === "email_failed";
            return (
              <button
                key={`${isAlert ? "alert" : "bc"}-${item.id}`}
                type="button"
                onClick={() => openItem(item)}
                className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors ${t.row} ${
                  isUnread ? t.rowActive : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_DOT[item.kind] ?? KIND_DOT.general}`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[12.5px] font-semibold ${
                      isFail ? "text-red-300" : t.heading
                    }`}
                  >
                    {item.title}
                  </span>
                  {/* v2.8.91.0 — a real two-line PREVIEW of what arrived
                     (was a truncated one-liner with a dangling separator). */}
                  {isAlert && item.body ? (
                    <span
                      className={`mt-0.5 line-clamp-2 block whitespace-normal text-[11px] leading-snug ${
                        isFail ? "text-red-300/75" : t.muted
                      }`}
                    >
                      {item.body}
                    </span>
                  ) : null}
                  <span className={`mt-0.5 block text-[11px] ${t.faint}`}>
                    {isAdmin && !isAlert && item.reads != null ? `${item.reads} read · ` : ""}
                    {timeAgo(item.createdAt)}
                  </span>
                </span>
                {isUnread && (
                  <span
                    aria-label="Unread"
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${t.badge.split(" ")[0]}`}
                  />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  const popupDialog = popup
    ? createPortal(
        <div
          /* v2.8.95.0 — same portal fix as the media library: mark the
             body-portal as editor UI so the visual editor's capture-phase
             click/hover handlers never treat clicks inside this dialog as
             page selections. */
          data-visual-ui=""
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPopup(null)}
          role="dialog"
          aria-modal="true"
          aria-label={popup.title}
        >
          <div
            className={`max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border p-6 ${t.popupCard}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${t.chip}`}>
                  {KIND_LABEL[popup.kind] ?? popup.kind}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-medium ${t.chip}`}>
                  {popup.audience === "all"
                    ? "Everyone"
                    : popup.audience.charAt(0).toUpperCase() + popup.audience.slice(1)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPopup(null)}
                aria-label="Close notification"
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors ${t.closeBtn}`}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            <h3 className={`mt-3 font-display text-lg font-semibold leading-snug ${t.popupTitle}`}>
              {popup.title}
            </h3>
            <p className={`mt-0.5 text-[11.5px] ${t.faint}`}>
              {popup.authorName ? `${popup.authorName} · ` : ""}
              {fullDate(popup.createdAt)}
              {variant !== "portal" && popup.reads != null ? ` · ${popup.reads} read` : ""}
            </p>

            <p
              className={`mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed ${
                popup.kind === "email_failed" ? "text-red-200/85" : t.body
              }`}
            >
              {popup.body}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {popup.linkUrl && popup.linkUrl.startsWith("/") ? (
                <Link
                  href={popup.linkUrl}
                  onClick={() => setPopup(null)}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[12.5px] font-semibold transition-opacity ${t.linkBtn}`}
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  Open
                </Link>
              ) : popup.linkUrl ? (
                <a
                  href={popup.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[12.5px] font-semibold transition-opacity ${t.linkBtn}`}
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  Open link
                </a>
              ) : null}
              <Link
                href={manageHref}
                onClick={() => setPopup(null)}
                className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-4 text-[12.5px] font-semibold transition-colors ${t.allBtn}`}
              >
                <Inbox size={14} aria-hidden="true" />
                {isAdmin ? "All notifications" : "View all notifications"}
              </Link>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    /* v2.8.76.1 — max-md:static: below md the positioning context becomes
        the sticky header (every shell's header is sticky), so the panel
        pins to the screen edge instead of the bell's left-shifted box. */
    <div ref={wrapRef} className="relative max-md:static">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`relative grid h-10 w-10 place-items-center rounded-full border transition-colors ${t.btn}`}
      >
        <Bell size={17} aria-hidden="true" />
        {unread > 0 && (
          <span
            className={`absolute -right-1 -top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-[9.5px] font-bold ${t.badge}`}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open ? dropdown : null}
      {mounted ? popupDialog : null}
    </div>
  );
}
