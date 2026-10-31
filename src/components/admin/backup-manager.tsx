"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  CloudDownload,
  CloudUpload,
  DatabaseBackup,
  Loader2,
  Lock,
  Mail,
  Play,
  RefreshCw,
  Save,
  Timer,
  TriangleAlert,
  Undo2,
  XCircle,
} from "lucide-react";
import { MailSpamNote } from "@/components/mail-spam-note";

/* ── v2.8.75.0 — Admin Studio → BACKUP (the owner's asks) ────────────────
   "main admin studio eke backup section eka hadala na ne. backup setting
   okkoma admin studio eke backup section eken controll karanna puluwan
   wenna ona" — every knob of the database backup lives here: on/off
   switch, FREQUENCY (daily / weekly / monthly / every 3 months / yearly),
   DESTINATION (GitHub only / Drive only / both), schedule hour
   (Asia/Colombo), retention sizes, "Backup now", the dump list with
   password-guarded downloads and the run history.

   v2.8.75.0 owner asks applied:
   - the Refresh button now SPINS while it re-fetches and is never stuck
     disabled by a running backup;
   - the Store card shows just "GitHub" — the repo name never leaves the
     server (same for the run links: "open" is gone, Recent runs are plain);
   - a destination selector decides if backups land on GitHub, Google
     Drive, or both (gates the workflow's two destination steps);
   - dump downloads require re-entering the signed-in account's PASSWORD. */

type BackupDump = { name: string; size: number; date: string };
type BackupRun = {
  id: number;
  runNumber: number;
  status: string;
  conclusion: string | null;
  createdAt: string;
  steps: { github: string | null; drive: string | null };
};
type BackupSettings = {
  enabled: boolean;
  frequency: string;
  destination: string;
  keepDaily: number;
  keepMonthly: number;
  scheduleHour: number | null;
  scheduleMinute: number;
};
type BackupStatus = {
  configured: boolean;
  branch: string;
  drive: { folderId: string; url: string } | null;
  settings: BackupSettings;
  dumps: BackupDump[];
  runs: BackupRun[];
  lastSuccessAt: string | null;
  error: string | null;
};

const FREQ_OPTIONS: { value: string; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly (Sundays)" },
  { value: "monthly", label: "Monthly (1st)" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "yearly", label: "Yearly (Jan 1)" },
];
const FREQ_TEXT: Record<string, string> = {
  daily: "Daily",
  weekly: "Sundays",
  monthly: "Monthly (1st)",
  quarterly: "Every 3 months (Jan/Apr/Jul/Oct 1st)",
  yearly: "Yearly (Jan 1st)",
};

const DEST_OPTIONS: { value: string; label: string }[] = [
  { value: "both", label: "GitHub + Google Drive" },
  { value: "github", label: "GitHub only" },
  { value: "drive", label: "Google Drive only" },
];
const DEST_TEXT: Record<string, string> = {
  both: "GitHub + Drive",
  github: "GitHub only",
  drive: "Drive only",
};

function stepChip(conclusion: string) {
  if (conclusion === "success") {
    return "bg-emerald-500/15 text-emerald-400";
  }
  if (conclusion === "skipped") {
    return "bg-white/10 text-white/40";
  }
  return "bg-rose-500/15 text-rose-400";
}

function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function fmtAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function two(n: number) {
  return String(n).padStart(2, "0");
}

const CARD =
  "rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5";
const FIELD =
  "rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3";
const INPUT =
  "w-24 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#ffd444]/50";

export function BackupManager() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justDispatched, setJustDispatched] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // local editable copy of the settings
  const [enabled, setEnabled] = useState(true);
  const [frequency, setFrequency] = useState("daily");
  const [destination, setDestination] = useState("both");
  const [hour, setHour] = useState(1);
  const [keepDaily, setKeepDaily] = useState(35);
  const [keepMonthly, setKeepMonthly] = useState(366);
  const [dirty, setDirty] = useState(false);

  // verification-gated dump download (owner asks #4 + the Google follow-up)
  const [dlFile, setDlFile] = useState<string | null>(null);
  const [dlPassword, setDlPassword] = useState("");
  const [dlBusy, setDlBusy] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);
  // v2.8.76.0 — Google-login admins verify with an emailed code instead
  const [dlChallenge, setDlChallenge] = useState<{ hasPassword: boolean; email: string } | null>(null);
  const [dlUseOtp, setDlUseOtp] = useState(false);
  const [dlOtp, setDlOtp] = useState("");
  const [dlOtpSent, setDlOtpSent] = useState(false);
  const [dlSending, setDlSending] = useState(false);
  const [dlDevCode, setDlDevCode] = useState<string | null>(null);

  const apply = useCallback((s: BackupStatus) => {
    setStatus(s);
    setEnabled(s.settings.enabled);
    setFrequency(s.settings.frequency);
    setDestination(s.settings.destination ?? "both");
    if (s.settings.scheduleHour !== null) setHour(s.settings.scheduleHour);
    setKeepDaily(s.settings.keepDaily);
    setKeepMonthly(s.settings.keepMonthly);
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/backup", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        const s = json.status as BackupStatus;
        apply(s);
        // the dispatch flag's job is done once a live run shows up
        if (s.runs.some((r) => r.status === "in_progress" || r.status === "queued")) {
          setJustDispatched(false);
        }
        setLoadError(null);
      } else {
        setLoadError(json.error ?? "Could not load the backup status.");
      }
    } catch {
      setLoadError("Could not load the backup status.");
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    // deferred one tick — the fetch + setState pair must not run synchronously
    // inside the effect body
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  /** owner ask #1: the Refresh button spins while it re-fetches and is
   * never blocked by a running backup. */
  async function refreshNow() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const activeRun = status?.runs.find(
    (r) => r.status === "in_progress" || r.status === "queued",
  );
  const running = Boolean(activeRun) || justDispatched;

  // while a manual run is in flight, poll the status every 8s
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      void load();
    }, 8000);
    return () => clearInterval(t);
  }, [running, load]);

  async function saveSettings() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/backup/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          frequency,
          destination,
          keepDaily,
          keepMonthly,
          scheduleHour: hour,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        apply(json.status as BackupStatus);
        setNote({ kind: "ok", text: "Backup settings saved." });
      } else {
        setNote({ kind: "err", text: json.error ?? "Could not save." });
      }
    } catch {
      setNote({ kind: "err", text: "Could not save — try again." });
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/backup/run", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setNote({ kind: "ok", text: "Backup started — watch it run below." });
        setJustDispatched(true);
        void load();
      } else {
        setNote({ kind: "err", text: json.error ?? "Could not start." });
      }
    } catch {
      setNote({ kind: "err", text: "Could not start — try again." });
    } finally {
      setBusy(false);
    }
  }

  /** Opens the download dialog and asks the server which verification the
   * signed-in account can use (password and/or an emailed code). */
  function openDownload(file: string) {
    setDlFile(file);
    setDlPassword("");
    setDlOtp("");
    setDlOtpSent(false);
    setDlDevCode(null);
    setDlError(null);
    setDlChallenge(null);
    setDlUseOtp(false);
    (async () => {
      try {
        const res = await fetch("/api/admin/backup/download-challenge", { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; hasPassword?: boolean; email?: string };
        if (json.ok) {
          const hasPassword = Boolean(json.hasPassword);
          setDlChallenge({ hasPassword, email: json.email ?? "" });
          // A Google-login admin (no local password) starts on the code path.
          setDlUseOtp(!hasPassword);
        } else {
          setDlChallenge({ hasPassword: true, email: "" }); // fail open to the password field
        }
      } catch {
        setDlChallenge({ hasPassword: true, email: "" });
      }
    })();
  }

  /** v2.8.76.0: mail the one-time 6-digit code to the admin's own address. */
  async function sendCode() {
    if (dlSending) return;
    setDlSending(true);
    setDlError(null);
    try {
      const res = await fetch("/api/admin/backup/download-challenge", { method: "POST" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; devCode?: string } | null;
      if (json?.ok) {
        setDlOtpSent(true);
        setDlOtp("");
        setDlDevCode(json.devCode ?? null);
      } else {
        const err = json?.error ?? "";
        setDlError(
          err === "rate_limited"
            ? "Too many codes requested — wait a few minutes and try again."
            : err === "mail_failed"
              ? "The email could not be sent — try again in a moment."
              : "Could not send the code — try again.",
        );
      }
    } catch {
      setDlError("Could not send the code — try again.");
    } finally {
      setDlSending(false);
    }
  }

  /** owner ask #4: confirm the download with the signed-in account's own
   * password (or, for Google-login admins, the emailed one-time code),
   * then pull the bytes and hand them to the browser. */
  async function confirmDownload() {
    if (!dlFile) return;
    const usingOtp = dlUseOtp || !(dlChallenge?.hasPassword ?? true);
    if (usingOtp && (!dlOtpSent || dlOtp.length !== 6)) return;
    setDlBusy(true);
    setDlError(null);
    try {
      const res = await fetch("/api/admin/backup/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          usingOtp ? { file: dlFile, otp: dlOtp } : { file: dlFile, password: dlPassword },
        ),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        const err = json?.error ?? "";
        setDlError(
          err === "wrong_password"
            ? "That password is not correct."
            : err === "wrong_code"
              ? "That code is not correct."
              : err === "code_expired"
                ? "That code has expired — send a new one."
                : err === "too_many_attempts"
                  ? "Too many wrong attempts — request a new code."
                  : err === "no_password" || err === "password_required"
                    ? "This account signs in with Google — use the emailed code."
                    : err === "not_found"
                      ? "That dump is not in the store anymore."
                      : "Download failed — try again.",
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = dlFile;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDlFile(null);
      setDlPassword("");
      setDlOtp("");
      setDlOtpSent(false);
      setDlDevCode(null);
      setNote({ kind: "ok", text: `Dump downloaded — ${dlFile}.` });
    } catch {
      setDlError("Download failed — try again.");
    } finally {
      setDlBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={CARD} data-testid="backup-loading">
        <div className="flex items-center gap-3 text-white/60">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading the backup store…
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={CARD}>
        <p className="text-rose-400">{loadError}</p>
      </div>
    );
  }

  if (!status) return null;

  if (!status.configured) {
    return (
      <div className={CARD}>
        <div className="flex items-start gap-3">
          <DatabaseBackup className="mt-0.5 h-5 w-5 text-amber-400" />
          <div>
            <p className="font-semibold text-white">Backup store is not configured</p>
            <p className="mt-1 text-sm text-white/55">
              Set <code className="text-[#ffd444]">DB_BACKUP_REPO</code> and{" "}
              <code className="text-[#ffd444]">DB_BACKUP_GH_TOKEN</code> in the server
              environment to connect the daily database backup store.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const lastRun = status.runs[0];
  const totalSize = status.dumps.reduce((a, d) => a + d.size, 0);

  return (
    <div className="space-y-4" data-testid="backup-manager">
      {/* ── status strip ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <div className={CARD}>
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
            Last backup
          </p>
          <p className="mt-1 text-lg font-semibold text-white" data-testid="last-backup">
            {fmtAgo(status.lastSuccessAt)}
          </p>
          <p className="mt-0.5 text-[11px] text-white/40">
            {status.settings.scheduleHour !== null
              ? `${FREQ_TEXT[status.settings.frequency] ?? "Daily"} at ${two(status.settings.scheduleHour)}:${two(status.settings.scheduleMinute)} (Asia/Colombo)`
              : "Schedule unknown"}
          </p>
        </div>
        <div className={CARD}>
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
            Result
          </p>
          <p
            className="mt-1 flex items-center gap-2 text-lg font-semibold text-white"
            data-testid="last-result"
          >
            {running ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-sky-400" /> Running…
              </>
            ) : lastRun?.conclusion === "success" ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-400" /> OK
              </>
            ) : lastRun?.conclusion ? (
              <>
                <XCircle className="h-5 w-5 text-rose-400" /> Failed
              </>
            ) : (
              "—"
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-white/40">
            {lastRun ? `#${lastRun.runNumber} · ${fmtAgo(lastRun.createdAt)}` : "no runs yet"}
          </p>
        </div>
        <div className={CARD}>
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
            Dumps kept
          </p>
          <p className="mt-1 text-lg font-semibold text-white" data-testid="dump-count">
            {status.dumps.length}
          </p>
          <p className="mt-0.5 text-[11px] text-white/40">{fmtSize(totalSize)} total</p>
        </div>
        <div className={CARD}>
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
            Store
          </p>
          {/* v2.8.75.0 — owner: "store location eke repo name eka danna epa.
              nikan github kiyala witharak danna" — the name lives on the
              server only. */}
          <p
            className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-white"
            data-testid="store-label"
          >
            <Lock className="h-4 w-4 shrink-0 text-emerald-400" />
            GitHub
          </p>
          <p className="mt-0.5 text-[11px] text-white/40">
            {destination === "drive"
              ? "not used — Drive only"
              : "private · off-site copy"}
          </p>
        </div>
        <div className={CARD}>
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
            Mirror
          </p>
          {status.drive && destination !== "github" ? (
            <>
              <a
                href={status.drive.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex items-center gap-1.5 truncate text-sm font-semibold text-white hover:text-[#ffd444]"
                title="Google Drive folder"
                data-testid="drive-link"
              >
                <CloudUpload className="h-4 w-4 shrink-0 text-emerald-400" />
                Google Drive
              </a>
              <p className="mt-0.5 text-[11px] text-white/40">
                {destination === "drive" ? "Drive only · same retention" : "mirror copy ON · same retention"}
              </p>
              {status.runs[0]?.steps?.drive === "failure" && (
                <p
                  className="mt-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] leading-snug text-amber-400"
                  data-testid="drive-attention"
                >
                  <TriangleAlert className="mr-1 inline h-3 w-3" />
                  Last upload failed — see the DR chip in Recent runs. The GitHub
                  copy is safe; only the Drive mirror needs attention.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-white/50">
                <CloudUpload className="h-4 w-4 shrink-0" />
                Drive not connected
              </p>
              <p className="mt-0.5 text-[11px] text-white/40">
                {destination === "github" ? "not used — GitHub only" : "GitHub only for now"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── actions ── */}
      <div className={CARD}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runNow}
            disabled={busy || running}
            data-testid="backup-now"
            className="inline-flex items-center gap-2 rounded-full bg-[#ffd444] px-5 py-2.5 text-[13px] font-semibold text-[#0b0b0a] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {running ? "Backup running…" : "Backup now"}
          </button>
          <button
            type="button"
            onClick={() => void refreshNow()}
            disabled={refreshing}
            aria-label="Refresh backup status"
            data-testid="backup-refresh"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-[13px] font-semibold text-white/85 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin text-[#ffd444]" : ""}`}
              data-testid={refreshing ? "refresh-spinning" : "refresh-idle"}
            />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <span className="text-xs text-white/45">
            {status.settings.enabled
              ? `Automatic backups are ON · ${FREQ_TEXT[status.settings.frequency] ?? "Daily"}`
              : "Automatic backups are OFF"}
          </span>
        </div>
        {note && (
          <p
            className={`mt-3 text-sm ${note.kind === "ok" ? "text-emerald-400" : "text-rose-400"}`}
            data-testid="backup-note"
          >
            {note.text}
          </p>
        )}
      </div>

      {/* ── settings ── */}
      <div className={CARD}>
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <Timer className="h-4 w-4 text-[#ffd444]" /> Backup settings
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className={`flex items-center justify-between gap-3 ${FIELD}`}>
            <span>
              <span className="block text-sm font-medium text-white">
                Automatic backup
              </span>
              <span className="mt-0.5 block text-[11px] text-white/40">
                the schedule below is skipped while OFF
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Automatic backup"
              data-testid="backup-enabled"
              onClick={() => {
                setEnabled((v) => !v);
                setDirty(true);
              }}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                enabled ? "bg-emerald-500" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  enabled ? "left-[1.375rem]" : "left-0.5"
                }`}
              />
            </button>
          </div>

          <div className={`flex items-center justify-between gap-3 ${FIELD}`}>
            <span>
              <span className="block text-sm font-medium text-white">
                How often
              </span>
              <span className="mt-0.5 block text-[11px] text-white/40">
                the day-part of the schedule
              </span>
            </span>
            <select
              value={frequency}
              aria-label="Backup frequency"
              data-testid="backup-frequency"
              onChange={(e) => {
                setFrequency(e.target.value);
                setDirty(true);
              }}
              className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#ffd444]/50 [&>option]:bg-[#141412] [&>option]:text-white"
            >
              {FREQ_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className={`flex items-center justify-between gap-3 ${FIELD}`}>
            <span>
              <span className="block text-sm font-medium text-white">
                Backup goes to
              </span>
              <span className="mt-0.5 block text-[11px] text-white/40">
                where the dumps are kept
              </span>
            </span>
            <select
              value={destination}
              aria-label="Backup destination"
              data-testid="backup-destination"
              onChange={(e) => {
                setDestination(e.target.value);
                setDirty(true);
              }}
              className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#ffd444]/50 [&>option]:bg-[#141412] [&>option]:text-white"
            >
              {DEST_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className={`flex items-center justify-between gap-3 ${FIELD}`}>
            <span>
              <span className="block text-sm font-medium text-white">
                Runs at (Asia/Colombo)
              </span>
              <span className="mt-0.5 block text-[11px] text-white/40">
                whole hour, on the days above
              </span>
            </span>
            <select
              value={hour}
              aria-label="Runs at (Asia/Colombo)"
              data-testid="backup-hour"
              onChange={(e) => {
                setHour(Number.parseInt(e.target.value, 10));
                setDirty(true);
              }}
              className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-[#ffd444]/50 [&>option]:bg-[#141412] [&>option]:text-white"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {two(h)}:00
                </option>
              ))}
            </select>
          </div>

          <div className={`flex items-center justify-between gap-3 ${FIELD}`}>
            <span>
              <span className="block text-sm font-medium text-white">
                Keep daily dumps
              </span>
              <span className="mt-0.5 block text-[11px] text-white/40">
                7 – 730 days
              </span>
            </span>
            <input
              type="number"
              min={7}
              max={730}
              value={keepDaily}
              aria-label="Keep daily dumps (days)"
              data-testid="backup-keep-daily"
              onChange={(e) => {
                setKeepDaily(Number.parseInt(e.target.value, 10) || 0);
                setDirty(true);
              }}
              className={INPUT}
            />
          </div>

          <div className={`flex items-center justify-between gap-3 ${FIELD}`}>
            <span>
              <span className="block text-sm font-medium text-white">
                Keep month-start dumps
              </span>
              <span className="mt-0.5 block text-[11px] text-white/40">
                30 – 3650 days
              </span>
            </span>
            <input
              type="number"
              min={30}
              max={3650}
              value={keepMonthly}
              aria-label="Keep month-start dumps (days)"
              data-testid="backup-keep-monthly"
              onChange={(e) => {
                setKeepMonthly(Number.parseInt(e.target.value, 10) || 0);
                setDirty(true);
              }}
              className={INPUT}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={saveSettings}
            disabled={busy}
            data-testid="backup-save"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save settings
          </button>
          {dirty && (
            <span className="text-xs text-amber-400">Unsaved changes</span>
          )}
        </div>
      </div>

      {/* ── dumps ── */}
      <div className={CARD}>
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <CloudDownload className="h-4 w-4 text-[#ffd444]" /> Dumps in the store
        </h2>
        {destination === "drive" && (
          <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-400">
            Dumps are going to Google Drive only — new files won&apos;t appear in
            this list; download them from the Drive folder instead.
          </p>
        )}
        <div className="mt-3 max-h-96 overflow-y-auto rounded-xl border border-white/10 [scrollbar-width:thin]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#131311] text-left text-[11px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-2.5 font-medium">File</th>
                <th className="px-4 py-2.5 font-medium">Size</th>
                <th className="px-4 py-2.5 font-medium">Age</th>
                <th className="px-4 py-2.5 font-medium text-right">Get</th>
              </tr>
            </thead>
            <tbody data-testid="dump-rows">
              {status.dumps.map((d) => (
                <tr key={d.name} className="border-t border-white/10">
                  <td className="px-4 py-2.5 font-mono text-xs text-white/85">{d.name}</td>
                  <td className="px-4 py-2.5 text-white/70">{fmtSize(d.size)}</td>
                  <td className="px-4 py-2.5 text-white/70">
                    {fmtAgo(d.date ? `${d.date}T00:00:00Z` : null)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => openDownload(d.name)}
                      aria-label={`Download ${d.name} — verification required`}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/10"
                    >
                      <Lock className="h-3 w-3" />
                      Download
                    </button>
                  </td>
                </tr>
              ))}
              {status.dumps.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-white/45">
                    No dumps yet — press “Backup now”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── run history ── */}
      <div className={CARD}>
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <Clock3 className="h-4 w-4 text-[#ffd444]" /> Recent runs
        </h2>
        <ul
          className="mt-3 max-h-96 space-y-2 overflow-y-auto [scrollbar-width:thin]"
          data-testid="run-rows"
        >
          {status.runs.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 px-4 py-2.5 text-sm"
            >
              {r.status !== "completed" ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-400" />
              ) : r.conclusion === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
              )}
              <span className="font-medium text-white">#{r.runNumber}</span>
              <span className="text-white/45">{fmtAgo(r.createdAt)}</span>
              {r.steps?.github && (
                <span
                  title={`GitHub push: ${r.steps.github}`}
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${stepChip(r.steps.github)}`}
                >
                  GH
                </span>
              )}
              {r.steps?.drive && (
                <span
                  title={`Google Drive upload: ${r.steps.drive}`}
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${stepChip(r.steps.drive)}`}
                >
                  DR
                </span>
              )}
              <span className="ml-auto text-xs text-white/45">
                {r.status !== "completed" ? r.status : r.conclusion}
              </span>
            </li>
          ))}
          {status.runs.length === 0 && (
            <li className="px-1 py-4 text-sm text-white/45">No runs yet.</li>
          )}
        </ul>
      </div>

      {/* ── restore ── */}
      <div className={CARD} data-testid="restore-card">
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <Undo2 className="h-4 w-4 text-[#ffd444]" /> Restore (apply a backup)
        </h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-white/70">
          <li>
            Download a dump from the list above (the newest one is usually the
            right one).
          </li>
          <li>
            On the server, inside the site project, run{" "}
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-[#ffd444]">
              bun run db:restore -- dumps/stc-db-YYYY-MM-DD.dump
            </code>
          </li>
          <li>
            Press <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs">Ctrl+C</kbd>{" "}
            within 5 seconds to abort — after that the live database is
            replaced by that day&apos;s copy.
          </li>
        </ol>
        <p className="mt-3 text-[11px] text-white/40">
          A restore REPLACES all current data with the chosen day&apos;s copy —
          when unsure, ask the site developer first.
        </p>
      </div>

      {/* ── verification gate for dump downloads (owner asks #4 + Google) ── */}
      {dlFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm dump download"
          data-testid="download-dialog"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#171715] p-5 shadow-2xl">
            <h3 className="flex items-center gap-2 font-semibold text-white">
              <Lock className="h-4 w-4 text-[#ffd444]" /> Confirm download
            </h3>
            <p className="mt-2 text-sm text-white/60">
              Verify it&apos;s really you, then download{" "}
              <span className="font-mono text-xs text-[#ffd444]">{dlFile}</span>.
            </p>

            {dlChallenge === null ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking your sign-in method…
              </div>
            ) : dlUseOtp || !dlChallenge.hasPassword ? (
              /* ── emailed-code path (the Google-login default) ── */
              <>
                <p className="mt-3 text-sm text-white/60" data-testid="download-otp-mode">
                  We&apos;ll email a 6-digit code to{" "}
                  <span className="font-medium text-white">{dlChallenge.email || "your address"}</span>.
                </p>
                {!dlOtpSent ? (
                  <button
                    type="button"
                    onClick={() => void sendCode()}
                    disabled={dlSending}
                    data-testid="download-send-code"
                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 text-xs font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                  >
                    {dlSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    {dlSending ? "Sending…" : "Email me a code"}
                  </button>
                ) : (
                  <>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={dlOtp}
                      autoFocus
                      maxLength={6}
                      autoComplete="one-time-code"
                      aria-label="6-digit email code"
                      data-testid="download-otp"
                      onChange={(e) => {
                        setDlOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                        setDlError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && dlOtp.length === 6 && !dlBusy) void confirmDownload();
                      }}
                      placeholder="000000"
                      className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-white outline-none focus:border-[#ffd444]/50"
                    />
                    {dlDevCode && (
                      <p className="mt-1.5 text-[11px] text-amber-400/80" data-testid="download-dev-code">
                        Sandbox dev code: {dlDevCode}
                      </p>
                    )}
                    {/* v2.8.84.0 — the owner's red spam warning (item 2). */}
                    <MailSpamNote className="mt-2.5 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2.5 text-left text-[11.5px] leading-relaxed text-rose-300" />
                    <button
                      type="button"
                      onClick={() => void sendCode()}
                      disabled={dlSending}
                      className="mt-2 text-[11px] font-medium text-white/45 underline-offset-2 transition-colors hover:text-white/70 hover:underline disabled:opacity-50"
                    >
                      {dlSending ? "Sending…" : "Resend code"}
                    </button>
                  </>
                )}
                {dlChallenge.hasPassword && (
                  <button
                    type="button"
                    onClick={() => {
                      setDlUseOtp(false);
                      setDlError(null);
                    }}
                    className="mt-3 block text-[11px] font-medium text-white/45 underline-offset-2 transition-colors hover:text-white/70 hover:underline"
                  >
                    Use my password instead
                  </button>
                )}
              </>
            ) : (
              /* ── password path (accounts that sign in with a password) ── */
              <>
                <input
                  type="password"
                  value={dlPassword}
                  autoFocus
                  autoComplete="current-password"
                  aria-label="Your account password"
                  data-testid="download-password"
                  onChange={(e) => {
                    setDlPassword(e.target.value);
                    setDlError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && dlPassword && !dlBusy) void confirmDownload();
                  }}
                  placeholder="Your password"
                  className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none focus:border-[#ffd444]/50"
                />
                <button
                  type="button"
                  onClick={() => {
                    setDlUseOtp(true);
                    setDlOtpSent(false);
                    setDlError(null);
                  }}
                  className="mt-3 block text-[11px] font-medium text-white/45 underline-offset-2 transition-colors hover:text-white/70 hover:underline"
                >
                  Signing in with Google? Email me a code instead
                </button>
              </>
            )}

            {dlError && (
              <p className="mt-2 text-xs text-rose-400" data-testid="download-error">
                {dlError}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDlFile(null);
                  setDlPassword("");
                  setDlOtp("");
                  setDlOtpSent(false);
                  setDlDevCode(null);
                  setDlError(null);
                }}
                disabled={dlBusy}
                className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDownload()}
                disabled={
                  dlBusy ||
                  (dlUseOtp || !(dlChallenge?.hasPassword ?? true)
                    ? !dlOtpSent || dlOtp.length !== 6
                    : !dlPassword)
                }
                data-testid="download-confirm"
                className="inline-flex items-center gap-2 rounded-full bg-[#ffd444] px-4 py-2 text-xs font-semibold text-[#0b0b0a] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dlBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
                {dlBusy ? "Downloading…" : "Download"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
