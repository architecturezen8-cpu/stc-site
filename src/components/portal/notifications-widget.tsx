"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { Bell, CheckCheck, ExternalLink, Megaphone } from "lucide-react";
import type { LmsPortalRole } from "@/db/schema-lms";
import { PurgeConsentCards, type ConsentCard } from "@/components/portal/purge-consent-cards";

/* ── v2.8.70.0 — SCHOOL BROADCASTS widget (portal side) ──────────────────
   The read side of the school-wide notification system: every portal
   dashboard mounts this panel. The owner asked for filters on BOTH ends —
   sending filters by audience (teachers / students / parents) on the admin
   side, and here the reader filters All / Unread / Read and marks items
   read (one by one or all at once). */

type BroadcastItem = {
  id: number;
  title: string;
  body: string;
  kind: string;
  audience: string;
  authorVia: string;
  authorName: string | null;
  linkUrl: string | null;
  createdAt: string;
  readAt: string | null;
};

type Filter = "all" | "unread" | "read";

const KIND_CHIP: Record<string, { label: string; cls: string }> = {
  general: { label: "Notice", cls: "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]" },
  maintenance: { label: "Maintenance", cls: "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]" },
  event: { label: "Event", cls: "bg-[var(--pt-info-bg)] text-[var(--pt-info-text)]" },
  urgent: { label: "Urgent", cls: "bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]" },
};

const AUDIENCE_LABEL: Record<string, string> = {
  all: "Everyone",
  teachers: "Teachers",
  students: "Students",
  parents: "Parents",
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
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function NotificationsWidget({
  role,
  initialUnread = 0,
}: {
  role: LmsPortalRole;
  initialUnread?: number;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<BroadcastItem[] | null>(null);
  const [consents, setConsents] = useState<ConsentCard[]>([]);
  const [unread, setUnread] = useState(initialUnread);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  /* Every setState below happens POST-AWAIT (never synchronously inside
     the effect), so no cascading renders — the same pattern site-brand
     uses to stay clean under react-hooks/set-state-in-effect. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/portal/broadcasts?filter=${filter}`, {
          headers: { "x-portal-role": role },
        });
        const data = (await res.json()) as {
          ok: boolean;
          items?: BroadcastItem[];
          consents?: ConsentCard[];
        };
        if (cancelled) return;
        if (data.ok && data.items) {
          setItems(data.items);
          setError(false);
          setConsents(data.consents ?? []);
        } else {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, role]);

  /* Reset happens at CLICK time (not inside the effect) — the refresh
     then flows through the [filter] effect above. */
  function chooseFilter(next: Filter) {
    if (next === filter) return;
    setFilter(next);
    setItems(null);
    setError(false);
  }

  async function markRead(id: number) {
    if (busyId != null) return;
    setBusyId(id);
    // Optimistic: the card goes quiet immediately, the list trims on unread.
    setItems((prev) =>
      prev
        ? prev.map((i) =>
            i.id === id
              ? { ...i, readAt: i.readAt ?? new Date().toISOString() }
              : i,
          )
        : prev,
    );
    if (filter === "unread") {
      setItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
    }
    setUnread((n) => Math.max(0, n - 1));
    try {
      await fetch("/api/portal/broadcasts/read", {
        method: "POST",
        headers: { "content-type": "application/json", "x-portal-role": role },
        body: JSON.stringify({ id }),
      });
    } catch {
      /* keep the optimistic state — it re-syncs on the next load */
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    if (markingAll || unread === 0) return;
    setMarkingAll(true);
    try {
      await fetch("/api/portal/broadcasts/read", {
        method: "POST",
        headers: { "content-type": "application/json", "x-portal-role": role },
        body: JSON.stringify({ all: true }),
      });
      setUnread(0);
      /* Re-pull the current tab so the cards match the server. */
      const res = await fetch(`/api/portal/broadcasts?filter=${filter}`, {
        headers: { "x-portal-role": role },
      });
      const data = (await res.json()) as { ok: boolean; items?: BroadcastItem[] };
      if (data.ok && data.items) setItems(data.items);
    } catch {
      /* next tab switch re-syncs */
    } finally {
      setMarkingAll(false);
    }
  }

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: unread > 0 ? `Unread (${unread})` : "Unread" },
    { key: "read", label: "Read" },
  ];

  return (
    <section id="notifications" aria-label="School notifications">
      <div className="pt-panel-shadow rounded-3xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5">
        {/* v2.8.70.3 — storage-purge consent requests land here first. */}
        <PurgeConsentCards initial={consents} portalRole={role} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
              <Bell size={17} aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-[16px] font-semibold text-[var(--pt-heading)]">
                School notifications
              </h2>
              <p className="text-[11.5px] text-[var(--pt-muted)]">
                Notices for the whole school and for your role
              </p>
            </div>
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={markingAll}
              className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--pt-border)] px-3 text-[12px] font-medium text-[var(--pt-muted)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-accent-text)] disabled:opacity-60"
            >
              <CheckCheck size={14} aria-hidden="true" />
              {markingAll ? "Marking…" : "Mark all read"}
            </button>
          )}
        </div>

        {/* The owner's read-side filter: All / Unread / Read */}
        <div
          role="tablist"
          aria-label="Filter notifications"
          className="mt-3.5 flex w-full gap-1 rounded-xl bg-[var(--pt-chip)] p-1 sm:w-auto"
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={filter === t.key}
              onClick={() => chooseFilter(t.key)}
              className={`h-8 flex-1 rounded-lg px-3.5 text-[12.5px] font-medium transition-all sm:flex-none ${
                filter === t.key
                  ? "bg-[var(--pt-panel)] text-[var(--pt-heading)] shadow-sm"
                  : "text-[var(--pt-muted)] hover:text-[var(--pt-heading)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3.5 max-h-96 space-y-2.5 overflow-y-auto pr-1">
          {items === null ? (
            <div className="space-y-2.5" aria-live="polite">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-2xl bg-[var(--pt-chip)]"
                />
              ))}
            </div>
          ) : error ? (
            <p className="rounded-2xl bg-[var(--pt-info-bg)] px-4 py-3 text-[13px] text-[var(--pt-info-text)]">
              Could not load notifications. Please refresh and try again.
            </p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-7 text-center">
              <Megaphone size={22} className="text-[var(--pt-faint)]" aria-hidden="true" />
              <p className="text-[13px] text-[var(--pt-muted)]">
                {filter === "unread"
                  ? "Nothing unread — you are all caught up."
                  : filter === "read"
                    ? "No read notifications yet."
                    : "No school notifications yet."}
              </p>
            </div>
          ) : (
            items.map((item) => {
              const chip = KIND_CHIP[item.kind] ?? KIND_CHIP.general;
              const isUnread = !item.readAt;
              return (
                <div
                  key={item.id}
                  {...(isUnread
                    ? {
                        role: "button" as const,
                        tabIndex: 0,
                        onClick: () => void markRead(item.id),
                        onKeyDown: (e: KeyboardEvent) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void markRead(item.id);
                          }
                        },
                        "aria-label": `Mark "${item.title}" as read`,
                      }
                    : {})}
                  className={`block w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                    isUnread
                      ? "cursor-pointer border-[var(--pt-border-strong)] bg-[var(--pt-panel)] hover:border-[var(--pt-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pt-ring)]"
                      : "border-[var(--pt-border)] bg-[var(--pt-chip)] opacity-80"
                  } ${busyId === item.id ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${chip.cls}`}>
                          {chip.label}
                        </span>
                        <span className="rounded-full border border-[var(--pt-border)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--pt-muted)]">
                          {AUDIENCE_LABEL[item.audience] ?? "School"}
                        </span>
                        {isUnread && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--pt-accent)]" aria-label="Unread" />
                        )}
                      </div>
                      <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-[var(--pt-heading)]">
                        {item.title}
                      </p>
                      <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--pt-muted)]">
                        {item.body}
                      </p>
                      <p className="mt-1.5 text-[11px] text-[var(--pt-faint)]">
                        {item.authorName ? `${item.authorName} · ` : ""}
                        {timeAgo(item.createdAt)}
                      </p>
                    </div>
                    {item.linkUrl && (
                      <a
                        href={item.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--pt-border)] text-[var(--pt-muted)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-accent-text)]"
                        aria-label="Open the attached link"
                      >
                        <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
