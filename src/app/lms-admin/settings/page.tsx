import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Fingerprint, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { LmsAdminShell } from "@/components/lms-admin/lms-admin-shell";
import { ProfileSessions, type ProfileSessionRow } from "@/components/lms-admin/profile-sessions";
import { currentLmsAdminTokenHash, getLmsAdminProfile, requireLmsAdmin } from "@/lib/lms-admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile · LMS Admin Studio · St. Thomas' College Matale",
};

const COLOMBO_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Colombo",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function colomboLabel(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "—";
  return COLOMBO_FMT.format(date);
}

/** Friendly browser + OS from the snapshotted session user-agent. */
function deviceParts(ua: string | null): { browser: string; os: string } {
  if (!ua) return { browser: "Unknown browser", os: "Unknown device" };
  let browser = "Browser";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua)) browser = "Safari";
  let os = "Device";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";
  return { browser, os };
}

/**
 * LMS Admin Studio → Profile (v2.8.40.0, owner: "settings wenuwata profile
 * kiyala danna… full details watenna one name, mokenda log wela inne google
 * da nomalda, last login time, log wela inna anith devices"). The full
 * account card: identity, sign-in method, last login, live devices.
 * Site-wide maintenance stays in the MAIN Admin Studio (pointer card kept).
 */
export default async function LmsAdminProfilePage() {
  const session = await requireLmsAdmin();
  const tokenHash = await currentLmsAdminTokenHash();
  const data = await getLmsAdminProfile(session.accountId, tokenHash);

  const initial = (session.fullName || session.email || "L").trim().charAt(0).toUpperCase();
  const sessions: ProfileSessionRow[] = (data?.sessions ?? []).map((s) => {
    const { browser, os } = deviceParts(s.userAgent);
    return {
      id: s.id,
      browser,
      os,
      createdLabel: colomboLabel(s.createdAt),
      expiresLabel: colomboLabel(s.expiresAt),
      current: s.current,
    };
  });

  const isGoogle = data?.loginMethod === "google";

  return (
    <LmsAdminShell
      session={session}
      active="settings"
      title="Profile"
      subtitle="Your studio account — identity, sign-in method, last login and signed-in devices."
    >
      <div className="space-y-4">
        {/* Identity + account details */}
        <section
          aria-label="Account details"
          className="rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-4">
            {data?.avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={data.avatarUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-[var(--la-border)]"
              />
            ) : (
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#ffd444] text-xl font-bold text-black">
                {initial}
              </span>
            )}
            <div className="min-w-0">
              {/* v2.8.41.0 — the LMS Admin chip sits INLINE with the name
                  (owner: "LMS Admin kiyana badge eka wenama ne thiyenne,
                  galapena thanakata danna") instead of floating on its own
                  pushed-right row where it looked stranded. */}
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-[var(--la-heading)]">
                  {data?.fullName || session.fullName}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--la-tint-gold)] px-2.5 py-1 text-[10.5px] font-semibold text-[var(--la-heading)]">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                  LMS Admin
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-[var(--la-body)]">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {session.email}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-4 py-3.5">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--la-muted)]">
                {isGoogle ? (
                  <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Sign-in method
              </dt>
              <dd className="mt-1.5 text-[13.5px] font-semibold text-[var(--la-heading)]">
                {isGoogle ? "Google account" : "Email + password"}
                <span className="ml-2 rounded-full bg-[var(--la-tint-blue)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--la-blue-text)]">
                  {isGoogle
                    ? "Google-only — no password set"
                    : data?.googleConnected
                      ? "Google also connected"
                      : "Password only"}
                </span>
              </dd>
            </div>
            <div className="rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-4 py-3.5">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--la-muted)]">
                Last login (Colombo)
              </dt>
              <dd className="mt-1.5 text-[13.5px] font-semibold text-[var(--la-heading)]">
                {colomboLabel(data?.lastLoginAt ?? null)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Live devices */}
        <ProfileSessions sessions={sessions} />

        {/* Site-wide controls pointer */}
        <Link
          href="/admin/settings"
          className="la-hover-lift la-panel-shadow group flex items-start justify-between gap-4 rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-5 transition-colors hover:border-[var(--la-border-strong)] sm:p-6"
        >
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--la-tint-blue)] text-[var(--la-blue-text)]">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--la-heading)]">
                Maintenance mode &amp; site-wide settings
              </h2>
              <p className="mt-0.5 max-w-xl text-[13px] leading-relaxed text-[var(--la-body)]">
                The site-wide maintenance curtain is managed from the main Admin
                Studio → Settings. Your studio session still keeps a live preview of
                the site while it is down.
              </p>
            </div>
          </div>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--la-border)] text-[var(--la-faint)] transition-all duration-300 group-hover:border-[var(--la-accent-text)] group-hover:text-[var(--la-accent-text)]">
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </Link>
      </div>
    </LmsAdminShell>
  );
}
