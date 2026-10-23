"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, GraduationCap, HeartHandshake, Loader2 } from "lucide-react";

type Role = "student" | "teacher" | "parent";

const CHOICES: {
  role: Role;
  label: string;
  blurb: string;
  icon: typeof GraduationCap;
}[] = [
  {
    role: "student",
    label: "Student",
    blurb: "Homework, marks & timetable",
    icon: GraduationCap,
  },
  {
    role: "teacher",
    label: "Teacher",
    blurb: "Classes, assignments & marks",
    icon: BookOpen,
  },
  {
    role: "parent",
    label: "Parent",
    blurb: "Follow your child's progress",
    icon: HeartHandshake,
  },
];

export function PortalChooserButtons({
  allowed,
}: {
  allowed: Role[];
}) {
  const [busy, setBusy] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(role: Role) {
    if (busy) return;
    setBusy(role);
    setError(null);
    try {
      const res = await fetch("/api/portal/auth/choose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        redirect?: string;
        error?: string;
      };
      if (data.ok && data.redirect) {
        /* HARD navigation: guarantees the fresh session cookie is sent
           with the dashboard request. router.replace() raced the cookie
           and landed users back on the login page. */
        window.location.assign(data.redirect);
        return;
      }
      if (data.error === "expired") {
        setError(
          "This choice expired (the sign-in step took too long). Please start again from the login page.",
        );
      } else {
        setError("That portal isn't available for this account.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="w-full space-y-3">
      {CHOICES.filter((entry) => allowed.includes(entry.role)).map((entry) => {
        const Icon = entry.icon;
        return (
          <button
            key={entry.role}
            type="button"
            onClick={() => choose(entry.role)}
            disabled={busy !== null}
            className="pt-hover-lift group flex w-full items-center gap-4 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 text-left pt-panel-shadow hover:-translate-y-0.5 hover:border-[var(--pt-accent)]/60 disabled:cursor-not-allowed disabled:opacity-70 sm:p-5"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)] transition-colors duration-300 group-hover:bg-[var(--pt-accent)] group-hover:text-[var(--pt-on-accent)]">
              {busy === entry.role ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Icon size={22} strokeWidth={1.8} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[17px] font-semibold tracking-[-0.01em] text-[var(--pt-heading)]">
                {entry.label}
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-[var(--pt-body)]">
                {entry.blurb}
              </span>
            </span>
          </button>
        );
      })}

      {error && (
        <div
          role="status"
          className="space-y-2 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-danger-bg)] px-4 py-3 text-[13px] leading-relaxed text-[var(--pt-danger-text)]"
        >
          <p>{error}</p>
          <Link
            href="/login"
            className="inline-block font-semibold text-[var(--pt-accent-text)] underline underline-offset-2 hover:text-[var(--pt-accent-hover)]"
          >
            Back to sign in
          </Link>
        </div>
      )}
    </div>
  );
}
