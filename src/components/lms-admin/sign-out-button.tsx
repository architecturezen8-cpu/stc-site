"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

export function LmsAdminSignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/lms-admin/auth/logout", { method: "POST" });
          window.location.assign("/lms-admin/login");
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--la-border)] bg-[var(--la-panel)] px-3.5 py-2 text-[13px] font-semibold text-[var(--la-body)] transition-colors hover:border-[var(--la-danger-text)] hover:bg-[var(--la-danger-bg)] hover:text-[var(--la-danger-text)] disabled:opacity-60"
      aria-label="Sign out of the LMS Admin Studio"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">{busy ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}
