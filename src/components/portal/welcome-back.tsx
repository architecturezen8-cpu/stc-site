"use client";

import { useEffect, useState } from "react";
import { HardDrive, PartyPopper } from "lucide-react";

/* ── v2.8.70.2 — WELCOME BACK popup ──────────────────────────────────────
   The owner: "log weddi welcome back wage popup ekak show wenna hadanna
   barida — storage full nam ehema warning ekak show wennath danna."
   Two themes, one component:
   · portal (student / teacher / parent / principal) — dark cream card,
     personal storage meter from /api/portal/my-files/usage;
   · studio (main admin / LMS admin) — dark studio card; the MAIN admin
     additionally sees the B2 bucket fill from /api/admin/storage/bucket.
   Shows only when the server says the session is FRESH (created within
   the last 5 minutes) AND this browser tab hasn't seen it yet
   (sessionStorage) — so refreshes never nag, but every new login does.

   v2.8.76.0 — the owner's refinement: the STORAGE message is a WARNING
   now — it appears ONLY when usage is 90% or higher ("storage eke 90%
   pass wela thiyanawa nama witharai warning ekak widiyata"). Below 90%
   the greeting is just the greeting: no meter, no numbers. */

const SEEN_KEY = "stc_welcome_seen_v1";

type StorageInfo =
  | { kind: "personal"; used: number; cap: number | null }
  | { kind: "bucket"; used: number; soft: number | null; files: number }
  | null;

function fmt(bytes: number | null): string {
  if (bytes == null || bytes < 0) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function WelcomeBack({
  name,
  roleLabel,
  theme,
  freshLogin,
  storageKind,
}: {
  name: string;
  roleLabel: string;
  theme: "portal" | "studio";
  freshLogin: boolean;
  /** personal = the signed-in person's storage; bucket = the B2 tracker (main admin); none = lms-admin. */
  storageKind: "personal" | "bucket" | "none";
}) {
  const [shown, setShown] = useState(false);
  const [storage, setStorage] = useState<StorageInfo>(null);

  /* The decision runs post-timeout (never a synchronous setState inside
     the effect) and marks the tab as seen the moment it decides — a
     refresh re-renders nothing, a NEW login gets the popup again. */
  useEffect(() => {
    const t = setTimeout(() => {
      if (!freshLogin || sessionStorage.getItem(SEEN_KEY)) return;
      sessionStorage.setItem(SEEN_KEY, "1");
      setShown(true);
    }, 0);
    return () => clearTimeout(t);
  }, [freshLogin]);

  /* Storage numbers load only when the popup is actually open. */
  useEffect(() => {
    if (!shown) return;
    let cancelled = false;
    (async () => {
      try {
        if (storageKind === "personal") {
          const res = await fetch("/api/portal/my-files/usage");
          const data = (await res.json()) as {
            ok: boolean;
            used?: number;
            capBytes?: number | null;
          };
          if (!cancelled && data.ok) {
            setStorage({
              kind: "personal",
              used: data.used ?? -1,
              cap: data.capBytes ?? null,
            });
          }
        } else if (storageKind === "bucket") {
          const res = await fetch("/api/admin/storage/bucket");
          const data = (await res.json()) as {
            ok: boolean;
            bytes?: number;
            files?: number;
            softQuotaBytes?: number | null;
          };
          if (!cancelled && data.ok) {
            setStorage({
              kind: "bucket",
              used: data.bytes ?? 0,
              soft: data.softQuotaBytes ?? null,
              files: data.files ?? 0,
            });
          }
        }
      } catch {
        /* the greeting still shows — storage is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shown, storageKind]);

  if (!shown) return null;

  const firstName = name.trim().split(/\s+/)[0] || "there";

  const pct =
    storage == null
      ? null
      : storage.kind === "personal"
        ? storage.cap && storage.cap > 0 && storage.used >= 0
          ? Math.min(100, Math.round((storage.used / storage.cap) * 100))
          : null
        : storage.soft && storage.soft > 0
          ? Math.min(100, Math.round((storage.used / storage.soft) * 100))
          : null;

  const storageFull = pct != null && pct >= 100;
  const storageAlmost = pct != null && pct >= 90 && !storageFull;

  const cardCls =
    theme === "portal"
      ? "border-[var(--pt-border)] bg-[var(--pt-panel)] text-[var(--pt-heading)]"
      : "border-[#3f3f46] bg-[#18181b] text-[#fafafa]";
  const mutedCls = theme === "portal" ? "text-[var(--pt-muted)]" : "text-zinc-400";
  const chipBg = theme === "portal" ? "bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]" : "bg-amber-300/15 text-amber-300";
  const trackCls = theme === "portal" ? "bg-[var(--pt-chip)]" : "bg-zinc-800";
  const barCls = storageFull
    ? "bg-[var(--pt-danger-text, #dc2626)]"
    : storageAlmost
      ? "bg-[var(--pt-warn-text, #d97706)]"
      : "bg-[var(--pt-accent, #eab308)]";

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome back"
    >
      <div className={`pt-rise w-full max-w-sm rounded-3xl border p-6 shadow-2xl ${cardCls}`}>
        <span className={`grid h-12 w-12 place-items-center rounded-2xl ${chipBg}`}>
          <PartyPopper size={22} aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-display text-[24px] font-semibold leading-tight">
          Welcome back, {firstName}!
        </h2>
        <p className={`mt-1 text-[13px] ${mutedCls}`}>
          {roleLabel} · {todayLabel()}
        </p>

        {storageKind !== "none" && pct != null && pct >= 90 && (
          <div
            className={`mt-5 rounded-2xl border p-4 ${
              theme === "portal" ? "border-[var(--pt-border)] bg-[var(--pt-chip)]" : "border-[#3f3f46] bg-zinc-900"
            }`}
          >
            <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide">
              <HardDrive size={13} aria-hidden="true" />
              {storageKind === "bucket" ? "Media bucket usage" : "My storage"}
            </p>

            {storage == null ? (
              <div className={`mt-2.5 h-2 animate-pulse rounded-full ${trackCls}`} />
            ) : pct == null ? (
              <p className={`mt-2 text-[12.5px] ${mutedCls}`}>
                {storage.kind === "personal" && storage.used < 0
                  ? "Usage is being calculated…"
                  : storage.kind === "bucket"
                    ? `${fmt(storage.used)} · ${storage.files} files`
                    : "No storage cap for your account"}
              </p>
            ) : (
              <>
                <div className={`mt-2.5 h-2 overflow-hidden rounded-full ${trackCls}`}>
                  <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${pct}%` }} />
                </div>
                <p className={`mt-2 text-[12.5px] ${mutedCls}`}>
                  {pct}% used · {storage.kind === "bucket" ? fmt(storage.used) : `${fmt(storage.used)} of ${fmt(storage.cap)}`}
                </p>
              </>
            )}

            {storageFull && (
              <p
                role="alert"
                className="mt-2.5 rounded-xl bg-[var(--pt-danger-bg,#fee2e2)] px-3 py-2 text-[12.5px] font-medium text-[var(--pt-danger-text,#b91c1c)]"
              >
                Your storage is FULL — new uploads will be refused. Please open My Storage and free up some space.
              </p>
            )}
            {storageAlmost && (
              <p className="mt-2.5 rounded-xl bg-[var(--pt-warn-bg,#fef3c7)] px-3 py-2 text-[12.5px] font-medium text-[var(--pt-warn-text,#92400e)]">
                Storage is almost full ({pct}%) — consider clearing old files soon.
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShown(false)}
          className={`mt-5 h-11 w-full rounded-xl text-[14px] font-semibold transition-opacity hover:opacity-90 ${
            theme === "portal"
              ? "bg-[var(--pt-accent)] text-[var(--pt-on-accent)]"
              : "bg-amber-300 text-zinc-900"
          }`}
        >
          Let&apos;s go
        </button>
      </div>
    </div>
  );
}
