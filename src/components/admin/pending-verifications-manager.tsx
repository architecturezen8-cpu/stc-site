"use client";

import { useState } from "react";
import { Check, Hourglass, Loader2, X } from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────
   Admin → Registration Approvals — registrations the register matcher
   could NOT fully verify. The office sees exactly what was submitted (and
   WHY it didn't auto-match), then approves or rejects in one tap.
   ──────────────────────────────────────────────────────────────────────── */

export type PendingRegistration = {
  id: number;
  email: string;
  role: string;
  fullName: string;
  details: Record<string, unknown> | null;
  createdAt: string;
};

const btnGold =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-4 text-[12.5px] font-semibold text-[#0b0b0a] transition-colors hover:bg-white disabled:opacity-50";
const btnGhost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/15 px-4 text-[12.5px] font-medium text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50";

const LABELS: Record<string, string> = {
  admissionNo: "Admission no",
  fullName: "Name",
  registerNo: "Register no",
  className: "Class",
  fatherName: "Father",
  motherName: "Mother",
  teacherId: "Teacher ID",
  childAdmissionNo: "Child's admission no",
  childClass: "Child's class",
  relation: "Relation",
  guardianName: "Guardian name",
  phone: "Phone",
  email: "Email",
  reason: "Didn't match",
};
const HIDDEN = new Set(["outcome", "recordId"]);

function fmtDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PendingVerificationsManager({
  initialPending,
}: {
  initialPending: PendingRegistration[];
}) {
  const [items, setItems] = useState(initialPending);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const flash = (kind: "ok" | "err", text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 4200);
  };

  const decide = async (id: number, action: "approve" | "reject") => {
    if (action === "reject" && !window.confirm("Reject this registration? The person will not be able to sign in.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Unable to process the request.");
      setItems((list) => list.filter((item) => item.id !== id));
      flash("ok", action === "approve" ? "Approved — the account is now open." : "Rejected — the account stays closed.");
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to process the request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${
            notice.kind === "ok"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-red-400/30 bg-red-500/10 text-red-200"
          }`}
        >
          {notice.text}
        </div>
      )}

      <p className="text-[12.5px] leading-relaxed text-white/45">
        These registrations did not fully match the school register. Check the
        details below (call the family if unsure), then approve to open the
        account — or reject to keep it closed.
      </p>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="max-h-[34rem] divide-y divide-white/[0.06] overflow-y-auto">
          {items.length === 0 && (
            <p className="px-5 py-10 text-center text-[13px] text-white/40">
              No registrations waiting — every submission so far matched the
              register automatically.
            </p>
          )}

          {items.map((item) => (
            <div key={item.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold">{item.fullName}</span>
                <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-amber-300">
                  {item.role}
                </span>
                <span className="text-[11.5px] text-white/35">
                  {item.email} · {fmtDate(item.createdAt)}
                </span>
              </div>

              {item.details && (
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(item.details)
                    .filter(
                      ([key, value]) =>
                        !HIDDEN.has(key) && value !== null && value !== "",
                    )
                    .map(([key, value]) => (
                      <p key={key} className="text-[12px] leading-relaxed text-white/55">
                        <span className="text-white/35">{LABELS[key] || key}:</span>{" "}
                        <span
                          className={
                            key === "reason" ? "font-medium text-amber-300" : "text-white/80"
                          }
                        >
                          {String(value)}
                        </span>
                      </p>
                    ))}
                </div>
              )}

              <div className="mt-3.5 flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => decide(item.id, "approve")} className={btnGold}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Approve
                </button>
                <button disabled={busy} onClick={() => decide(item.id, "reject")} className={btnGhost}>
                  <X size={14} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {items.length > 0 && (
        <p className="flex items-center gap-2 text-[12px] text-white/35">
          <Hourglass size={13} /> {items.length} registration
          {items.length === 1 ? "" : "s"} waiting for the office.
        </p>
      )}
    </div>
  );
}
