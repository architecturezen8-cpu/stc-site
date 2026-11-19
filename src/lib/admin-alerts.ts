import "server-only";

/**
 * v2.8.88.0 — the ADMIN BELL ALERTS store + one helper.
 *
 * The owner: "appoinment, email send, applications, contact wage ewage
 * massage ekak awama mn admin eke bell icon eke show wenna dammoth hodai
 * ne. naththan danne na ne awada nadda kiyalawath."
 *
 * Every public form submission (appointments, admission applications,
 * contact messages, special forms) and every FAILED outgoing mail lands
 * in admin_notifications; the Admin Studio's top-bar bell shows them with
 * an unread count. Best-effort by contract: an alert can never break the
 * submission or the mail that raised it (callers wrap it in after() on
 * serverless paths so the work survives the response).
 *
 * The read model is GLOBAL: opening the bell marks every alert read.
 * The office is a tiny team — per-admin read state would be overkill.
 */

export type AdminAlertKind =
  | "appointment"
  | "admission"
  | "contact"
  | "special_form"
  | "email_failed";

/** Where the "Open" button leads, from a submission reference prefix. */
export function alertLinkForReference(reference: string | undefined | null): string | null {
  if (!reference) return null;
  if (reference.startsWith("APT-")) return "/admin/forms/appointments";
  if (reference.startsWith("ADM-")) return "/admin/forms/grade-6";
  if (reference.startsWith("SRN-")) return "/admin/forms/contacts";
  if (reference.startsWith("SF-")) return "/admin/forms/builder";
  return null;
}

export async function notifyAdminAlert(args: {
  kind: AdminAlertKind;
  title: string;
  body?: string;
  reference?: string;
  linkUrl?: string | null;
}): Promise<void> {
  try {
    const [{ db }, { adminNotifications }, { ensureSchemaExtras }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("@/lib/schema-extras"),
    ]);
    await ensureSchemaExtras();
    await db.insert(adminNotifications).values({
      kind: args.kind.slice(0, 30),
      title: args.title.slice(0, 160),
      body: args.body ? args.body.slice(0, 500) : null,
      reference: args.reference?.slice(0, 40) ?? null,
      linkUrl: (args.linkUrl ?? alertLinkForReference(args.reference))?.slice(0, 160) ?? null,
    });
  } catch (error) {
    console.warn(
      "[admin-alerts] insert skipped:",
      error instanceof Error ? error.message : error,
    );
  }
}
