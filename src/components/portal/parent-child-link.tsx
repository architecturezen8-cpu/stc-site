"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Unlink, UserPlus } from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────
   v2.9.15.5 — SELF-SERVICE parent→child links on the PROFILE page
   (owner: "paren acc eka create karata passeth profile eken childrensla
   link karanna option eka danna").

   Until now children could only be linked while the parent account was
   created (registration form or the office's dialog). These two tiny
   client islands ride INSIDE the server-rendered "Children · School
   Register" panel so the parent can also fix it later themselves:

   · ParentChildLinkForm  — one admission number at a time; stays put so
     more children can be linked one after another. A small helper line
     explains exactly what to type (owner: "ethana podi instruction ekakuth
     danna wei ne").
   · ParentChildUnlinkButton — the small chip on each child card; a wrong
     link (typo) can be removed by the parent without calling the office.

   Both call /api/portal/profile/children and then router.refresh() so the
   server-rendered register data stays the single source of truth.
   ──────────────────────────────────────────────────────────────────────── */

type LinkNotice = { kind: "ok" | "err"; text: string } | null;

export function ParentChildLinkForm() {
  const router = useRouter();
  const [admission, setAdmission] = useState("");
  const [notice, setNotice] = useState<LinkNotice>(null);
  const [busy, setBusy] = useState(false);

  const linkChild = async () => {
    const value = admission.trim();
    if (!value || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/portal/profile/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admissionNo: value }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            alreadyLinked?: boolean;
            message?: string;
            error?: string;
            child?: { fullName: string; admissionNo: string };
          }
        | null;
      if (!res.ok || !data?.ok) {
        throw new Error(
          data?.message ?? data?.error ?? "Unable to link the child.",
        );
      }
      const name = data.child?.fullName ?? value;
      setNotice({
        kind: "ok",
        text: data.alreadyLinked
          ? `${name} (${data.child?.admissionNo ?? value}) is already linked to this account.`
          : `${name} linked — their school record appears below. Have more children? Link them the same way.`,
      });
      setAdmission("");
      router.refresh();
    } catch (err) {
      setNotice({
        kind: "err",
        text: err instanceof Error ? err.message : "Unable to link the child.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-4">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--pt-muted)]">
        Link a child
      </p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--pt-body)]">
        Type ONE child&apos;s admission number exactly as it is on the school
        register (e.g. 1903) and press Link child. Have more children in this
        school? Link them one by one the same way — the school register is
        checked, so the number must match a student row.
      </p>
      <div className="mt-2.5 flex gap-2">
        <input
          value={admission}
          onChange={(e) => setAdmission(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void linkChild();
            }
          }}
          className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3 text-[13px] text-[var(--pt-heading)] outline-none transition-colors placeholder:text-[var(--pt-faint)] focus:border-[var(--pt-accent)]"
          placeholder="Child's admission number"
          aria-label="Child's admission number"
          inputMode="numeric"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => void linkChild()}
          disabled={busy || !admission.trim()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-4 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-colors hover:bg-[var(--pt-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <UserPlus size={14} aria-hidden="true" />
          )}
          Link child
        </button>
      </div>
      {notice && (
        <p
          role="status"
          className={`mt-2.5 rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${
            notice.kind === "ok"
              ? "border-[var(--pt-border)] bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
              : "border-[var(--pt-border)] bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]"
          }`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}

export function ParentChildUnlinkButton({
  studentId,
  childName,
}: {
  studentId: number;
  childName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const unlink = async () => {
    if (busy) return;
    if (
      !window.confirm(
        `Unlink ${childName} from this account? Their school records stay untouched — only the parent link is removed.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/portal/profile/children", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        window.alert(
          data?.error ?? "Unable to unlink the child. Try again in a moment.",
        );
        return;
      }
      router.refresh();
    } catch {
      window.alert("Unable to unlink the child. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void unlink()}
      disabled={busy}
      title={`Unlink ${childName} from this account`}
      aria-label={`Unlink ${childName} from this account`}
      className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] px-2.5 text-[11px] font-semibold text-[var(--pt-body)] transition-colors hover:border-[var(--pt-danger-text)] hover:text-[var(--pt-danger-text)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? (
        <Loader2 size={11} className="animate-spin" aria-hidden="true" />
      ) : (
        <Unlink size={11} aria-hidden="true" />
      )}
      Unlink
    </button>
  );
}
