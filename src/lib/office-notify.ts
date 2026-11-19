import "server-only";

import { getSiteSettings } from "@/lib/cms";
import {
  sendOfficeFormNotification,
  type OfficeFormKind,
} from "@/lib/mailer";

/**
 * v2.8.81.0 — the ONE helper every public form route calls after a successful
 * insert. Resolves the office recipient from the PUBLISHED site settings
 * (the same email the contact page shows — currently admissions@stcmatale.lk)
 * with MAIL_SENDER as the fallback, swallows every failure (a mail outage can
 * never break a visitor's submission) and logs the outcome for dev.log QA.
 *
 * Recipient override: the FORM_NOTIFY_EMAIL env key wins when present — the
 * owner can redirect notifications to a private inbox without touching the
 * public contact page.
 */
export async function notifyOfficeForm(
  kind: OfficeFormKind,
  reference: string,
  headline: string,
  fields: [string, string][],
): Promise<boolean> {
  try {
    const settings = await getSiteSettings("published");
    const to =
      process.env.FORM_NOTIFY_EMAIL?.trim() ||
      settings.email?.trim() ||
      process.env.MAIL_SENDER?.trim() ||
      "";
    if (!to) {
      console.warn(
        `[office-notify] ${reference}: no recipient (site settings email + MAIL_SENDER absent) — skipped.`,
      );
      return false;
    }
    const sent = await sendOfficeFormNotification({
      to,
      kind,
      reference,
      headline,
      fields: fields.filter(([, value]) => value && value.trim()),
    });
    console.info(
      `[office-notify] ${reference} → ${to}: ${sent ? "sent" : "FAILED (provider)"}`,
    );
    return sent;
  } catch (error) {
    console.warn(
      `[office-notify] ${reference}: skipped (${error instanceof Error ? error.message : "error"})`,
    );
    return false;
  }
}
