"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  MailCheck,
  RefreshCw,
  Save,
  ScrollText,
  TriangleAlert,
} from "lucide-react";
import { SwitchCell } from "@/components/admin/form-field-ui";

/**
 * v2.8.87.0 — the Email Alerts switchboard (Admin Studio → System → Email
 * Alerts). The owner's control over WHICH mails the site sends: every
 * receipt and office heads-up gets an on/off switch; security codes are
 * shown as always-on and cannot be touched. One Save persists the board;
 * the mailer checks it on every send.
 */

type SwitchDef = {
  key: string;
  label: string;
  description: string;
  audience: "visitor" | "office";
};

type SwitchMap = Record<string, boolean>;

const GROUP_META: Record<"visitor" | "office", { title: string; hint: string }> = {
  visitor: {
    title: "To the visitor",
    hint: "Acknowledgements and status emails that go to the person who submitted.",
  },
  office: {
    title: "To the office",
    hint: "Heads-up emails that tell the office inbox something new arrived.",
  },
};

const ALWAYS_ON: Array<{ label: string; why: string }> = [
  {
    label: "Portal password reset codes",
    why: "Without it nobody who forgets a password can get back in.",
  },
  {
    label: "Backup download verification codes",
    why: "The second lock on the database dumps.",
  },
];

/* v2.8.88.0 — the EMAIL LOG (the owner: "hadissiye email eka giye naththan
   eka danaganna widiyak na ne"). Every send attempt — went or not, with
   the provider's error when it did not. */
type EmailLogRow = {
  id: number;
  toEmail: string;
  kind: string;
  reference: string | null;
  status: string;
  error: string | null;
  createdAt: string;
};

const KIND_LABELS: Record<string, string> = {
  password_reset: "Password reset code",
  backup_code: "Backup download code",
  office_notify: "Office heads-up",
  appointment_status: "Appointment status",
  submission_receipt: "Submission receipt",
  unknown: "Unknown",
};

function logTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function EmailSwitchesManager() {
  const [switches, setSwitches] = useState<SwitchMap | null>(null);
  const [defs, setDefs] = useState<SwitchDef[]>([]);
  const [mailerOk, setMailerOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /* v2.8.88.0 — the email log feed */
  const [logRows, setLogRows] = useState<EmailLogRow[] | null>(null);
  const [logTotals, setLogTotals] = useState<{ sent30: number; failed30: number } | null>(null);
  const [logLoading, setLogLoading] = useState(true);

  const loadLog = useCallback(() => {
    fetch("/api/admin/email-log", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.rows)) setLogRows(data.rows);
        if (typeof data.sent30 === "number")
          setLogTotals({ sent30: data.sent30, failed30: data.failed30 ?? 0 });
      })
      .catch(() => {
        /* the section shows its own error state */
      })
      .finally(() => setLogLoading(false));
  }, []);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  /* Manual refresh (event handler — may set the spinner directly). */
  const refreshLog = () => {
    setLogLoading(true);
    loadLog();
  };

  useEffect(() => {
    fetch("/api/admin/email-switches", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.switches && typeof data.switches === "object") setSwitches(data.switches);
        if (Array.isArray(data.defs)) setDefs(data.defs);
        setMailerOk(data.mailerConfigured !== false);
      })
      .catch(() => setError("Could not load the email switches."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const patch = (key: string, next: boolean) => {
    setSwitches((prev) => (prev ? { ...prev, [key]: next } : prev));
  };

  const save = async () => {
    if (saving || !switches) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/email-switches", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ switches }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not save the switches.");
      setToast("Saved — every email send checks these switches from now on.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the switches.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-white/50">
        <Loader2 size={18} className="animate-spin" /> Loading the switchboard…
      </div>
    );
  }

  if (!switches) {
    return (
      <p className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-300">
        {error ?? "The email switches are unavailable right now."}
      </p>
    );
  }

  const offCount = Object.values(switches).filter((on) => !on).length;

  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs leading-relaxed text-white/55">
          Master control over every non-security email the site sends. A switch
          that is <span className="text-white/75">off</span> means that email
          simply never leaves — submissions still arrive and are stored as
          usual. Security codes stay on no matter what.
          {offCount > 0 && (
            <span className="text-[#ffd444]"> {offCount} switch(es) are currently off.</span>
          )}
        </p>
      </div>

      {!mailerOk && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-300" />
          <p className="text-xs leading-relaxed text-amber-200/90">
            The mail provider (Mailjet) is not configured on this deployment —
            nothing sends until its API keys are set, whatever the switches say.
          </p>
        </div>
      )}

      {(["visitor", "office"] as const).map((audience) => (
        <section
          key={audience}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
            {GROUP_META[audience].title}
          </h2>
          <p className="mt-1 text-[11px] text-white/40">{GROUP_META[audience].hint}</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {defs
              .filter((def) => def.audience === audience)
              .map((def) => (
                <SwitchCell
                  key={def.key}
                  label={def.label}
                  description={def.description}
                  checked={switches[def.key] !== false}
                  onChange={(next) => patch(def.key, next)}
                />
              ))}
          </div>
        </section>
      ))}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Lock size={13} className="text-white/40" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
            Always on — security codes
          </h2>
        </div>
        <p className="mt-1 text-[11px] text-white/40">
          These are doors, not announcements — they can never be switched off.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {ALWAYS_ON.map((row) => (
            <div
              key={row.label}
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-white/8 bg-transparent px-3.5 py-2 opacity-60"
            >
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-white/75">{row.label}</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-white/35">{row.why}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                <MailCheck size={11} /> on
              </span>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* v2.8.88.0 — THE EMAIL LOG: every outgoing mail, went or not. */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ScrollText size={13} className="text-white/40" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
              Email log — last 100 send attempts
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {logTotals && (
              <span className="text-[11px] text-white/45">
                <span className="text-emerald-300">{logTotals.sent30} sent</span>
                {" · "}
                <span className={logTotals.failed30 > 0 ? "text-red-300" : "text-white/45"}>
                  {logTotals.failed30} failed
                </span>
                {" · 30 days"}
              </span>
            )}
            <button
              type="button"
              onClick={refreshLog}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/15 px-3 text-[11px] font-semibold text-white/60 transition-colors hover:border-[#ffd444] hover:text-[#ffd444]"
            >
              <RefreshCw size={12} className={logLoading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-white/40">
          Every mail the site tried to send — including the failed ones with the reason why.
        </p>

        <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border border-white/8" style={{ scrollbarWidth: "thin" }}>
          {logLoading && logRows === null ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-white/[0.06]" />
              ))}
            </div>
          ) : logRows === null ? (
            <p className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-red-300">
              <AlertCircle size={14} /> Could not load the email log.
            </p>
          ) : logRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-white/45">
              No emails have been sent from this deployment yet.
            </p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="sticky top-0 bg-[#181816] text-[9.5px] uppercase tracking-[0.16em] text-white/35">
                  <th className="px-3 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">To</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Reference</th>
                  <th className="px-3 py-2 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody>
                {logRows.map((row) => (
                  <tr key={row.id} className="border-t border-white/5 align-top">
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-white/45">
                      {logTimeAgo(row.createdAt)}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-[12px] text-white/75" title={row.toEmail}>
                      {row.toEmail}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-white/60">
                      {KIND_LABELS[row.kind] ?? row.kind}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-white/60">
                      {row.reference ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.status === "sent" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-emerald-300">
                          <CheckCircle2 size={11} /> sent
                        </span>
                      ) : (
                        <span className="inline-flex flex-col gap-1">
                          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-red-400/10 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-red-300">
                            <AlertCircle size={11} /> failed
                          </span>
                          {row.error && (
                            <span className="max-w-[320px] break-words text-[10.5px] leading-snug text-red-200/80">
                              {row.error}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/12 bg-[#141414]/95 px-4 py-3 shadow-lift backdrop-blur">
        <p className="text-[11px] text-white/45">
          Saved switches apply to every future send — no restart needed.
        </p>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[#ffd444] px-5 py-2.5 text-xs font-semibold text-[#0b0b0a] transition-colors hover:bg-white disabled:opacity-60"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save switches
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#181818] px-5 py-2.5 text-xs text-white shadow-lift">
          {toast}
        </div>
      )}
    </div>
  );
}
