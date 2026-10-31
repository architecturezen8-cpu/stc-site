"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, PenLine, Stamp, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import { portalRoleHeaders } from "@/lib/portal-client";
import { isUploadCancelled, xhrUpload } from "@/lib/upload-client";
import { speedLabel } from "@/components/portal/upload-progress-row";

/* ────────────────────────────────────────────────────────────────────────
   v2.8.63.0 — SIGNATURE STUDIO (the owner's upload-option request).

   The school had no ready PNGs, so the stamps enter the system here:
   · teacher   → uploads their signature
   · principal → uploads their signature AND the college seal
   Rules: PNG only, ≤ 2 MB, stored as base64 INSIDE the database — no
   public URL, no media library. The preview draws from the gated
   /api/portal/signature/image route (own session only). Replacing an
   upload overwrites the old stamp; removing clears it.
   ──────────────────────────────────────────────────────────────────────── */

type StampKind = "sign" | "seal";

type StampMeta = { kind: StampKind; bytes: number; updatedAtLabel: string };

const KIND_LABEL: Record<StampKind, string> = {
  sign: "Signature",
  seal: "College seal",
};

const KIND_HINT: Record<StampKind, string> = {
  sign: "Sign on white paper, photograph or scan it, crop close, save as PNG.",
  seal: "The round college stamp — scan or photograph it on white, save as PNG.",
};

function StampSlot({
  role,
  kind,
  meta,
  busy,
  progress,
  onCancel,
  onChange,
  onRemove,
}: {
  role: "teacher" | "principal";
  kind: StampKind;
  meta: StampMeta | null;
  busy: boolean;
  /** v2.8.68.1 — live upload progress for THIS slot (null while idle). */
  progress?: { pct: number; bps: number | null } | null;
  onCancel?: () => void;
  onChange: (kind: StampKind, file: File) => void;
  onRemove: (kind: StampKind) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.type !== "image/png") {
      setError("Only PNG files are accepted (a signature scan saves best as PNG).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("That PNG is over 2 MB — crop it smaller or compress it first.");
      return;
    }
    onChange(kind, file);
  }

  const shown = meta ? `/api/portal/signature/image?kind=${kind}&v=${encodeURIComponent(meta.updatedAtLabel)}` : "";

  return (
    <div className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--pt-heading)]">
          {kind === "sign" ? <PenLine size={14} aria-hidden="true" /> : <Stamp size={14} aria-hidden="true" />}
          {KIND_LABEL[kind]}
        </p>
        {meta ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pt-good-bg)] px-2.5 py-1 text-[10px] font-bold text-[var(--pt-good-text)]">
            <Check size={11} aria-hidden="true" /> On file · {meta.updatedAtLabel}
          </span>
        ) : (
          <span className="rounded-full bg-[var(--pt-chip)] px-2.5 py-1 text-[10px] font-semibold text-[var(--pt-chip-text)]">
            Not uploaded
          </span>
        )}
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--pt-muted)]">{KIND_HINT[kind]}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div
          className={`grid h-20 w-40 place-items-center overflow-hidden rounded-xl border border-dashed ${
            meta ? "border-[var(--pt-border-strong)] bg-white" : "border-[var(--pt-border)]"
          }`}
        >
          {meta ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={shown} alt={`Your ${KIND_LABEL[kind]}`} className="max-h-20 max-w-40 object-contain" />
          ) : (
            <span className="text-[10.5px] text-[var(--pt-muted)]">PNG preview</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png"
            className="sr-only"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pt-accent)] px-4 py-2 text-[12px] font-bold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Upload size={13} aria-hidden="true" />}
            {meta ? "Replace" : role === "principal" && kind === "seal" ? "Upload the seal" : "Upload"}
          </button>
          {meta ? (
            <button
              type="button"
              onClick={() => onRemove(kind)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] px-4 py-2 text-[12px] font-semibold text-[var(--pt-body)] transition-colors hover:bg-[var(--pt-danger-bg)] hover:text-[var(--pt-danger-text)] disabled:opacity-50"
            >
              <Trash2 size={13} aria-hidden="true" />
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {busy && progress ? (
        <div role="status" aria-label={`Uploading: ${progress.pct}%`} className="mt-3 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10.5px] font-semibold text-[var(--pt-heading)]">Uploading…</span>
            <span className="text-[9.5px] font-semibold tabular-nums text-[var(--pt-muted)]">
              {progress.pct}%{speedLabel(progress.bps) ? ` · ${speedLabel(progress.bps)}` : ""}
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--pt-border)]">
            <div
              className="h-full rounded-full bg-[var(--pt-accent)] transition-[width] duration-300"
              style={{ width: `${Math.max(3, progress.pct)}%` }}
            />
          </div>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-danger-bg)] hover:text-[var(--pt-danger-text)]"
            >
              <X size={10} aria-hidden="true" /> Cancel
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--pt-danger-text)]">
          <TriangleAlert size={12} aria-hidden="true" /> {error}
        </p>
      ) : null}
    </div>
  );
}

export function SignatureStudio({
  role,
  session,
}: {
  role: "teacher" | "principal";
  session: { accountId: number };
}) {
  const [stamps, setStamps] = useState<StampMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyKind, setBusyKind] = useState<StampKind | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  /* v2.8.68.1 — live upload progress for the stamp going up right now. */
  const [stampProg, setStampProg] = useState<{ pct: number; bps: number | null } | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/signature", {
        headers: portalRoleHeaders(role),
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; stamps?: StampMeta[] }
        | null;
      if (res.ok && json?.ok && Array.isArray(json.stamps)) setStamps(json.stamps);
    } catch {
      /* the empty state is honest enough */
    } finally {
      setLoaded(true);
    }
  }, [role]);

  useEffect(() => {
    /* Deferred one tick — the fetch + setState chain must not start
       synchronously inside the effect body (cascading-render guard). */
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function change(kind: StampKind, file: File) {
    if (busyKind) return;
    setBusyKind(kind);
    setFlash(null);
    setStampProg({ pct: 0, bps: null });
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      /* v2.8.68.1 — XHR instead of fetch: the base64 POST reports live
         progress and can be cancelled mid-flight. */
      const up = xhrUpload({
        url: "/api/portal/signature",
        method: "POST",
        headers: { "content-type": "application/json", ...portalRoleHeaders(role) },
        body: JSON.stringify({ kind, dataUrl }),
        onProgress: (info) =>
          setStampProg({ pct: info.pct, bps: info.bytesPerSecond }),
      });
      abortRef.current = up.abort;
      const res = await up.promise;
      const json = (res.json ?? null) as { ok?: boolean; error?: string } | null;
      if (res.ok && json?.ok) {
        setFlash({
          ok: true,
          text:
            kind === "sign"
              ? "Signature saved — certified report cards will print it above your signature line."
              : "Seal saved — certified report cards will carry it beside your signature.",
        });
        await load();
      } else {
        setFlash({
          ok: false,
          text:
            json?.error === "not_png"
              ? "That file is not a real PNG — re-save it as PNG and try again."
              : json?.error === "too_large"
                ? "The PNG is over 2 MB — crop or compress it first."
                : "The stamp could not be saved — try again.",
        });
      }
    } catch (cause) {
      if (isUploadCancelled(cause)) {
        setFlash({ ok: true, text: "Upload cancelled — nothing was saved." });
      } else {
        setFlash({ ok: false, text: "Network problem — the stamp was not saved." });
      }
    } finally {
      abortRef.current = null;
      setStampProg(null);
      setBusyKind(null);
    }
  }

  async function remove(kind: StampKind) {
    if (busyKind) return;
    setBusyKind(kind);
    setFlash(null);
    try {
      const res = await fetch("/api/portal/signature", {
        method: "DELETE",
        headers: { "content-type": "application/json", ...portalRoleHeaders(role) },
        body: JSON.stringify({ kind }),
      });
      if (res.ok) {
        setFlash({ ok: true, text: "Stamp removed." });
        await load();
      } else {
        setFlash({ ok: false, text: "Could not remove the stamp." });
      }
    } catch {
      setFlash({ ok: false, text: "Network problem — nothing changed." });
    } finally {
      setBusyKind(null);
    }
  }

  const metaFor = (kind: StampKind) => stamps.find((s) => s.kind === kind) ?? null;

  return (
    <section
      className="pt-rise rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5"
      aria-busy={busyKind != null}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-muted)]">
        Report card stamp · private
      </p>
      <h2 className="mt-0.5 font-display text-[16px] font-semibold text-[var(--pt-heading)]">
        {role === "principal" ? "Your signature & the college seal" : "Your signature"}
      </h2>
      <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-[var(--pt-body)]">
        {role === "principal"
          ? "Certifying a report card places these two stamps on it automatically, server-side. The files live inside the school's database — never on a public link — and reach browsers only through the signed-in sheet view."
          : "Certified report cards print this signature above your class-teacher line. The file lives inside the school's database — never on a public link — and reaches browsers only through the signed-in sheet view."}
      </p>

      <div className={`mt-4 grid gap-3 ${role === "principal" ? "lg:grid-cols-2" : ""}`}>
        <StampSlot
          role={role}
          kind="sign"
          meta={metaFor("sign")}
          busy={busyKind != null}
          progress={busyKind === "sign" ? stampProg : null}
          onCancel={() => abortRef.current?.()}
          onChange={change}
          onRemove={remove}
        />
        {role === "principal" ? (
          <StampSlot
            role={role}
            kind="seal"
            meta={metaFor("seal")}
            busy={busyKind != null}
            progress={busyKind === "seal" ? stampProg : null}
            onCancel={() => abortRef.current?.()}
            onChange={change}
            onRemove={remove}
          />
        ) : null}
      </div>

      {flash ? (
        <div
          role="status"
          className={`mt-3 rounded-xl border px-4 py-2.5 text-[12px] ${
            flash.ok
              ? "border-transparent bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
              : "border-transparent bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]"
          }`}
        >
          {flash.text}
        </div>
      ) : null}
      {!loaded ? (
        <p className="mt-3 flex items-center gap-2 text-[11.5px] text-[var(--pt-muted)]">
          <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Checking your saved stamps…
        </p>
      ) : null}
    </section>
  );
}
