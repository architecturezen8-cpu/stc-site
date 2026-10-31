import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lmsPortalAccounts } from "@/db/schema-lms";
import { PORTAL_HOME, getPortalSession } from "@/lib/portal-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { SecurePasswordForm } from "@/components/portal/secure-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set your new password — St. Thomas' College Matale",
  robots: { index: false, follow: false },
};

/**
 * v2.8.67.0 — /account/secure: where a portal user lands to choose a NEW
 * password. Reached two ways:
 * - FORCED: the login bounce after a teacher-issued temp password
 *   (must_change_password = true — no current password asked).
 * - VOLUNTARY: any portal user who wants to change their password
 *   (current password verified first).
 * Any portal role works here; the role's own cookie resolves the session.
 */
export default async function AccountSecurePage() {
  const session = await getPortalSession();
  if (!session) redirect("/login");

  await ensureSchemaExtras();
  const [account] = await db
    .select({ mustChangePassword: lmsPortalAccounts.mustChangePassword })
    .from(lmsPortalAccounts)
    .where(eq(lmsPortalAccounts.id, session.accountId))
    .limit(1);
  const forced = Boolean(account?.mustChangePassword);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-amber-400/30 bg-amber-400/10">
            <span
              aria-hidden="true"
              className="text-[15px] font-bold tracking-tight text-amber-300"
            >
              STC
            </span>
          </div>
          <h1 className="text-[19px] font-semibold text-zinc-50">
            {forced ? "Choose your own password" : "Change your password"}
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-400">
            {forced
              ? "Your teacher gave you a temporary password. Pick a new one that only you know — you'll use it from now on."
              : `Hi ${session.fullName.split(" ")[0]} — pick a new password for your account.`}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_20px_60px_-30px_rgb(0_0_0/0.8)]">
          <SecurePasswordForm
            redirect={PORTAL_HOME[session.role] || "/"}
            forced={forced}
            role={session.role}
          />
        </div>

        <p className="mt-4 text-center text-[12px] leading-relaxed text-zinc-500">
          Keep it private — never share it, not even with friends.
        </p>
      </div>
    </main>
  );
}
