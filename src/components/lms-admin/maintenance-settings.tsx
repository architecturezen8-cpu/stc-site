"use client";

import { useEffect, useState } from "react";
import { Loader2, MoonStar, ShieldCheck, TriangleAlert } from "lucide-react";

type State = {
  enabled: boolean;
  message: string;
  updatedAt: string | null;
};

/**
 * Maintenance-mode control (v2.8.38.0) — the owner's request: when the site
 * needs work, flip ONE switch and every visitor is locked out behind the
 * /maintenance screen, while signed-in LMS admins keep a live preview of the
 * real site. ON flips take effect within ~3s (middleware state cache).
 */
export function MaintenanceSettings() {
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/lms-admin/settings/maintenance", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("load failed");
        const data = (await res.json()) as State;
        if (cancelled) return;
        setState(data);
        setMessage(data.message);
      } catch {
        if (!cancelled) setLoadError("Could not load the maintenance setting.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);

  async function save(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/lms-admin/settings/maintenance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, message }),
      });
      const data = (await res.json().catch(() => ({}))) as State & { error?: string };
      if (!res.ok) throw new Error(data.error || "save failed");
      setState(data);
      setMessage(data.message);
      setFlash({
        ok: true,
        text: enabled
          ? "Maintenance mode is ON — visitors now see the maintenance screen; your studio session still previews the site."
          : "Maintenance mode is OFF — the site is open to everyone.",
      });
    } catch {
      setFlash({ ok: false, text: "Could not update maintenance mode — try again." });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="la-panel-shadow rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-6">
        <p className="text-sm text-[var(--la-danger-text)]">{loadError}</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="la-panel-shadow flex h-40 items-center justify-center gap-2 rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] text-sm text-[var(--la-muted)]">
        <Loader2 className="animate-spin" size={16} /> Loading maintenance settings…
      </div>
    );
  }

  const enabled = state.enabled;

  return (
    <div className="space-y-4">
      {flash ? (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3 text-[13px] ${
            flash.ok
              ? "border-[var(--la-good-bg)] bg-[var(--la-good-bg)] text-[var(--la-good-text)]"
              : "border-[var(--la-danger-bg)] bg-[var(--la-danger-bg)] text-[var(--la-danger-text)]"
          }`}
        >
          {flash.text}
        </div>
      ) : null}

      <div className="la-panel-shadow rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                enabled
                  ? "bg-[var(--la-tint-coral)] text-[var(--la-coral-text)]"
                  : "bg-[var(--la-tint-blue)] text-[var(--la-blue-text)]"
              }`}
            >
              {enabled ? <TriangleAlert className="h-5 w-5" /> : <MoonStar className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--la-heading)]">
                Maintenance mode
              </h2>
              <p className="mt-0.5 max-w-xl text-[13px] leading-relaxed text-[var(--la-body)]">
                Locks the whole site behind a maintenance screen. Signed-in LMS admins still
                see the real site, so you can keep editing and previewing while it&apos;s down.
                Takes effect within a few seconds.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${
                enabled
                  ? "bg-[var(--la-danger-bg)] text-[var(--la-danger-text)]"
                  : "bg-[var(--la-good-bg)] text-[var(--la-good-text)]"
              }`}
            >
              {enabled ? "Site down" : "Site open"}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Toggle maintenance mode"
              disabled={busy}
              onClick={() => save(!enabled)}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-300 disabled:opacity-60 ${
                enabled ? "bg-[#d96a5b]" : "bg-[var(--la-border-strong)]"
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all duration-300 ${
                  enabled ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-5 border-t border-[var(--la-divider)] pt-5">
          <label
            htmlFor="maintenance-message"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--la-muted)]"
          >
            Message shown to visitors
          </label>
          <textarea
            id="maintenance-message"
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={400}
            className="w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-4 py-3 text-sm text-[var(--la-heading)] outline-none transition placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444] focus:ring-2 focus:ring-[rgb(255_212_68/0.25)]"
            placeholder="We're performing scheduled maintenance…"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-[var(--la-faint)]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Admin preview: your studio session bypasses the screen automatically.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => save(enabled)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--la-accent)] px-4 text-[13px] font-semibold text-[var(--la-on-accent)] transition-colors hover:bg-[var(--la-accent-hover)] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Save message
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
