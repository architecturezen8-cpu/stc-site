import "server-only";

/**
 * v2.8.67.0 — the ESSENTIALS-ONLY mailer (Mailjet).
 *
 * Owner policy: the site NEVER mails "everything to everyone". Email goes
 * out only for the essential, low-volume events agreed with the owner.
 * The provider is pluggable: these env keys are the ONLY provider coupling
 *
 *   MAILJET_API_KEY / MAILJET_SECRET_KEY  — Mailjet account keys
 *   MAIL_SENDER                           — the verified sender address
 *   MAIL_FROM_NAME                        — display name (optional)
 *   PUBLIC_SITE_URL                       — absolute origin used to turn the
 *                                           relative crest path into an
 *                                           email-safe image URL (optional;
 *                                           falls back to the production URL)
 *
 * …so swapping providers later (Resend + a school domain, etc.) is an env
 * change plus this one file, never the auth flow.
 *
 * v2.8.84.0 — the owner asked every mail to look like the SITE: "otp,
 * appointment massages ehema email ekata yawaddi email ekata ena massage
 * eka thiyenne eke ui eka henama simple eka poddak lassanata hadanawada
 * dark theme ekata ehema school logo eka ehema use karala eka lassanata
 * one." All four essentials now share ONE dark branded shell (ink canvas,
 * warm dark card, gold accents, the college crest on top) built in
 * renderDarkEmail() below — one design, zero duplicated markup.
 *
 * Free-tier reality (owner-verified): portal password resets are RARE
 * (a handful per day at school scale) — Mailjet's 200/day free limit has
 * an order of magnitude of headroom. Broadcast mail is deliberately NOT
 * built (it is the only thing that would ever cost money).
 */

import { getSchoolCrestSrc } from "@/lib/logos";
import type { EmailSwitchKey } from "@/lib/email-switches";

const MAILJET_SEND_URL = "https://api.mailjet.com/v3.1/send";
const SEND_TIMEOUT_MS = 15_000;

/**
 * v2.8.85.0 — every send attempt lands in `email_log` (sent OR failed) so
 * the Admin dashboard can answer "email quota eka mada wedda da" from the
 * site's own data. Best-effort: a logging hiccup must never fail a mail.
 * The DB round-trip is imported lazily to keep the mail module free of
 * heavy imports until it actually sends.
 */
async function logEmailSend(
  to: string,
  kind: string,
  reference: string | undefined,
  sent: boolean,
  errorText?: string,
): Promise<void> {
  try {
    const [{ db }, { emailLog }, { ensureSchemaExtras }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("@/lib/schema-extras"),
    ]);
    await ensureSchemaExtras();
    await db.insert(emailLog).values({
      toEmail: to.slice(0, 200),
      kind: kind.slice(0, 40),
      reference: reference?.slice(0, 40) ?? null,
      status: sent ? "sent" : "failed",
      error: sent ? null : (errorText?.slice(0, 500) ?? null),
    });
  } catch (error) {
    console.warn(
      "[mailer] email_log write skipped:",
      error instanceof Error ? error.message : error,
    );
  }
  /* v2.8.88.0 — every failure raises an admin bell alert (best-effort —
     the alert can never touch the mail outcome). */
  if (!sent) {
    try {
      const { notifyAdminAlert } = await import("@/lib/admin-alerts");
      await notifyAdminAlert({
        kind: "email_failed",
        title: `Email failed · ${kind}`,
        body: `${to} — ${errorText || "unknown error"}`,
        reference,
        linkUrl: null,
      });
    } catch {
      /* already logged to email_log above */
    }
  }
}

export function mailerConfigured(): boolean {
  return Boolean(
    process.env.MAILJET_API_KEY?.trim() &&
      process.env.MAILJET_SECRET_KEY?.trim() &&
      process.env.MAIL_SENDER?.trim(),
  );
}

/**
 * v2.8.87.0 — the OWNER'S SWITCHBOARD GATE (the owner: "admin eke email
 * kiyala section ekak — email yawanawada nadda kiyala on/off karanna").
 * Every non-security sender below checks its switch right before sending;
 * OFF means the mail simply never leaves (a skipped mail is NOT logged as
 * failed — it never happened). Security mail (password resets, backup
 * codes) is deliberately NOT gated. The switchboard import is lazy — same
 * pattern as logEmailSend — and a switchboard hiccup fails OPEN (mail
 * still goes) so a settings bug can never silence the school.
 */
async function emailSwitchOn(key: EmailSwitchKey): Promise<boolean> {
  try {
    const { isEmailSwitchOn } = await import("@/lib/email-switches");
    return await isEmailSwitchOn(key);
  } catch {
    return true;
  }
}

type SendArgs = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** v2.8.85.0 — email_log classifier + reference (best-effort audit row). */
  logKind?: string;
  logReference?: string;
};

async function sendMail({ to, subject, text, html, logKind, logReference }: SendArgs): Promise<boolean> {
  if (!mailerConfigured()) {
    console.warn(
      "[mailer] MAILJET_API_KEY/MAILJET_SECRET_KEY/MAIL_SENDER not configured — mail skipped.",
    );
    await logEmailSend(
      to,
      logKind || "unknown",
      logReference,
      false,
      "Mail provider not configured on this deployment — MAILJET_API_KEY / MAILJET_SECRET_KEY / MAIL_SENDER missing.",
    );
    return false;
  }

  const auth = Buffer.from(
    `${process.env.MAILJET_API_KEY}:${process.env.MAILJET_SECRET_KEY}`,
  ).toString("base64");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(MAILJET_SEND_URL, {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        Messages: [
          {
            From: {
              Email: process.env.MAIL_SENDER!.trim(),
              Name: process.env.MAIL_FROM_NAME?.trim() || "St. Thomas' College Matale",
            },
            To: [{ Email: to }],
            Subject: subject,
            TextPart: text,
            HTMLPart: html,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[mailer] Mailjet send failed HTTP ${res.status}: ${body.slice(0, 300)}`);
      await logEmailSend(
        to,
        logKind || "unknown",
        logReference,
        false,
        `Mailjet HTTP ${res.status}: ${body.slice(0, 300) || "(no response body)"}`,
      );
      return false;
    }
    await logEmailSend(to, logKind || "unknown", logReference, true);
    return true;
  } catch (error) {
    console.error(
      "[mailer] Mailjet send error:",
      error instanceof Error ? error.message : error,
    );
    await logEmailSend(
      to,
      logKind || "unknown",
      logReference,
      false,
      `Network/timeout error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** User-supplied values go into HTML — escape everything. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* ── v2.8.84.0 — the shared DARK BRANDED SHELL ────────────────────────────
   The crest lives in the site's media registry as a RELATIVE path
   (/api/media/file?key=…), which an email client cannot resolve — so the
   shell prefixes the deployment origin (PUBLIC_SITE_URL, else the known
   production URL). /api/media/file is deliberately public (maintenance
   exempt), so the image renders inside Gmail / Outlook / Apple Mail.
   The crest lookup is cached 5 minutes per process — sends are rare and
   the extra DB round-trip would otherwise sit on every mail. */

const FALLBACK_ORIGIN = "https://stc-site-eta.vercel.app";

let crestCache: { url: string; at: number } | null = null;
const CREST_TTL_MS = 5 * 60 * 1000;

async function crestEmailUrl(): Promise<string> {
  if (crestCache && Date.now() - crestCache.at < CREST_TTL_MS) return crestCache.url;
  let url = "";
  try {
    const src = (await getSchoolCrestSrc()) || "";
    if (src && !src.startsWith("data:")) {
      url = /^https?:\/\//i.test(src)
        ? src
        : `${(process.env.PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "") || FALLBACK_ORIGIN}${src.startsWith("/") ? "" : "/"}${src}`;
    }
  } catch {
    url = "";
  }
  crestCache = { url, at: Date.now() };
  return url;
}

const EMAIL_FONT = "Arial,Helvetica,sans-serif";
const INK = "#0b0b0a";
const CARD_BG = "#15140f";
const CARD_BORDER = "#2e2c24";
const GOLD = "#ffd444";
const HEADING = "#f4f1e6";
const BODY_TEXT = "#b8b3a4";
const MUTED = "#77725f";

function brandBlock(school: string, crestUrl: string): string {
  const logo = crestUrl
    ? `<img src="${escapeHtml(crestUrl)}" width="54" height="54" alt="${escapeHtml(school)} crest" style="display:block;width:54px;height:54px;border-radius:12px;object-fit:contain;background:#ffffff;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="54" height="54" align="center" valign="middle" bgcolor="${GOLD}" style="width:54px;height:54px;background-color:${GOLD};border-radius:12px;font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:bold;color:${INK};">S</td></tr></table>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="54" valign="middle">${logo}</td>
    <td valign="middle" style="padding-left:14px;">
      <p style="margin:0;font-family:${EMAIL_FONT};font-size:10px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">${escapeHtml(school)}</p>
      <p style="margin:3px 0 0;font-family:${EMAIL_FONT};font-size:12px;color:${MUTED};">stcmatale.lk · Matale, Sri Lanka</p>
    </td>
  </tr></table>`;
}

type DarkEmailBlock =
  | { type: "text"; html: string }
  | { type: "code"; code: string; label?: string }
  | { type: "banner"; tone: "good" | "bad"; label: string }
  | { type: "rows"; rows: [string, string][] }
  | { type: "note"; html: string };

async function renderDarkEmail(args: {
  heading: string;
  intro?: string;
  blocks: DarkEmailBlock[];
  closing?: string;
}): Promise<string> {
  const school = process.env.MAIL_FROM_NAME?.trim() || "St. Thomas' College Matale";
  const crestUrl = await crestEmailUrl();

  const blocks = args.blocks
    .map((block) => {
      if (block.type === "text") return block.html;
      if (block.type === "code") {
        return `<p style="margin:18px 0 4px;font-family:${EMAIL_FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">${escapeHtml(block.label || "One-time code")}</p>
<p style="margin:0;"><span style="display:inline-block;background-color:#242108;border:1px solid #6b5d1d;border-radius:10px;padding:12px 22px;font-family:'Courier New',monospace;font-size:26px;font-weight:bold;letter-spacing:9px;color:${GOLD};">${escapeHtml(block.code)}</span></p>`;
      }
      if (block.type === "banner") {
        const tone =
          block.tone === "good"
            ? { bg: "#10241a", border: "#2c5e42", text: "#7ee2b8" }
            : { bg: "#2a1414", border: "#6e2f2f", text: "#fda4a4" };
        return `<p style="margin:18px 0 0;"><span style="display:inline-block;background-color:${tone.bg};border:1px solid ${tone.border};border-radius:9px;padding:9px 18px;font-family:${EMAIL_FONT};font-size:12.5px;font-weight:bold;letter-spacing:3px;color:${tone.text};">${escapeHtml(block.label)}</span></p>`;
      }
      if (block.type === "rows") {
        const rows = block.rows
          .map(
            ([label, value]) =>
              `<tr><td style="padding:7px 14px 7px 0;font-family:${EMAIL_FONT};font-size:10.5px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:7px 0;font-family:${EMAIL_FONT};font-size:13.5px;font-weight:bold;color:${HEADING};">${escapeHtml(value)}</td></tr>`,
          )
          .join("");
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0;border-collapse:collapse;background-color:#1c1b15;border:1px solid ${CARD_BORDER};border-radius:12px;"><tr><td style="padding:14px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table></td></tr></table>`;
      }
      return `<p style="margin:14px 0 0;font-family:${EMAIL_FONT};font-size:12px;line-height:1.7;color:${MUTED};">${block.html}</p>`;
    })
    .join("\n");

  return `<!doctype html><html><body style="margin:0;padding:0;background-color:${INK};">
<div style="margin:0;padding:28px 16px;background-color:${INK};">
  <div style="max-width:560px;margin:0 auto;background-color:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:16px;padding:30px 28px;">
    ${brandBlock(school, crestUrl)}
    <div style="height:1px;line-height:1px;font-size:0;background-color:${CARD_BORDER};margin:22px 0;">&nbsp;</div>
    <h2 style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:normal;color:${HEADING};">${escapeHtml(args.heading)}</h2>
    ${args.intro ? `<p style="margin:0 0 6px;font-family:${EMAIL_FONT};font-size:13.5px;line-height:1.7;color:${BODY_TEXT};">${escapeHtml(args.intro)}</p>` : ""}
    ${blocks}
    ${args.closing ? `<p style="margin:18px 0 0;font-family:${EMAIL_FONT};font-size:13px;line-height:1.7;color:${BODY_TEXT};">${escapeHtml(args.closing)}</p>` : ""}
    <div style="height:1px;line-height:1px;font-size:0;background-color:${CARD_BORDER};margin:24px 0 14px;">&nbsp;</div>
    <p style="margin:0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.7;color:${MUTED};">This is an automated message from the ${escapeHtml(school)} website. School emails sometimes land in the Spam / Junk folder — please check there too.</p>
  </div>
</div>
</body></html>`;
}

/** Warm, calm reset email for school users (including 12-year-olds). */
export async function sendPasswordResetCode(to: string, code: string): Promise<boolean> {
  const subject = `Your password reset code: ${code}`;
  const text = [
    `Hello from St. Thomas' College Matale,`,
    "",
    `Your password reset code is:  ${code}`,
    "",
    "This code works for 10 minutes and can be used only once.",
    "If you did not ask for this, you can safely ignore this email —",
    "your password will not change.",
    "",
    `St. Thomas' College Matale`,
  ].join("\n");
  const html = await renderDarkEmail({
    heading: "Password reset code",
    intro: "Here is the code you asked for. It works for 10 minutes and can be used only once.",
    blocks: [{ type: "code", code, label: "Your reset code" }],
    closing:
      "If you did not ask for this, you can safely ignore this email — your password will not change.",
  });
  return sendMail({ to, subject, text, html, logKind: "password_reset" });
}

/**
 * v2.8.76.0 — the SECOND essential mail event (owner-approved): the admin
 * backup-download re-verification code. An admin who signs in with Google
 * has no local password to re-enter, so the download gate mails this code
 * to their own address instead. Same low-volume class as the reset code —
 * a handful per day at school scale.
 */
export async function sendBackupDownloadCode(to: string, code: string): Promise<boolean> {
  const subject = `Your backup download code: ${code}`;
  const text = [
    `Hello from St. Thomas' College Matale,`,
    "",
    "Someone is downloading a database backup while signed in as you.",
    `Your one-time verification code is:  ${code}`,
    "",
    "This code works for 10 minutes and can be used only once.",
    "If this was not you, sign out of the Admin Studio on that device.",
    "",
    `St. Thomas' College Matale`,
  ].join("\n");
  const html = await renderDarkEmail({
    heading: "Backup download verification",
    intro:
      "Someone is downloading a database backup while signed in as your account. Use this one-time code to continue.",
    blocks: [{ type: "code", code, label: "Verification code" }],
    closing:
      "This code works for 10 minutes and can be used only once. If this was not you, sign out of the Admin Studio on that device — nothing else changes.",
  });
  return sendMail({ to, subject, text, html, logKind: "backup_code" });
}

/**
 * v2.8.81.0 — the THIRD essential mail event (the last Phase 3 gap): office
 * notifications on the four PUBLIC form events (Grade 6 + A/L applications,
 * appointment requests, contact messages). Until now the office learned of a
 * submission only by opening the admin inbox; the reply itself stays a
 * mailto (the owner's contact-flow choice) — this is a one-way HEADS-UP.
 * Volume is naturally tiny and rate-limited (8 submissions / 10 min / IP),
 * so it stays inside the essentials-only owner policy.
 */
export type OfficeFormKind = "admission" | "appointment" | "contact" | "special_form";

const OFFICE_LABELS: Record<OfficeFormKind, string> = {
  admission: "New application received",
  appointment: "New appointment request",
  contact: "New contact message",
  /* v2.8.85.0 — Form Builder forms ride the same office heads-up chain. */
  special_form: "New form submission",
};

export async function sendOfficeFormNotification(args: {
  to: string;
  kind: OfficeFormKind;
  reference: string;
  headline: string;
  fields: [string, string][];
}): Promise<boolean> {
  /* v2.8.87.0 — the per-form office heads-up switch (Admin → Email Alerts). */
  if (!(await emailSwitchOn(`office_${args.kind}` as EmailSwitchKey))) {
    console.info(
      `[mailer] office_${args.kind} switch is OFF — heads-up for ${args.reference} skipped.`,
    );
    return false;
  }
  const title = OFFICE_LABELS[args.kind];
  const subject = `${title} · ${args.reference} — ${args.headline}`;
  const text = [
    `St. Thomas' College Matale — office notification`,
    "",
    `${title} · ${args.reference}`,
    ...args.fields.map(([label, value]) => `${label}: ${value}`),
    "",
    "Open the Admin Studio → Form Management to act on it.",
  ].join("\n");
  const html = await renderDarkEmail({
    heading: `${title} · ${args.reference}`,
    intro: `${args.headline} — open the Admin Studio → Form Management to act on it.`,
    blocks: [{ type: "rows", rows: args.fields }],
  });
  return sendMail({ to: args.to, subject, text, html, logKind: "office_notify", logReference: args.reference });
}

/**
 * v2.8.83.0 — the FOURTH essential mail event (owner-approved): the
 * appointment status confirmation. When the office moves a booking to
 * "confirmed" or "cancelled" the VISITOR is now told by email — until this
 * the only channel was a phone call. Volume is office-driven (one mail per
 * deliberate status change in the Admin Studio), so it stays inside the
 * essentials-only owner policy. Never sent for completed (that needs no
 * heads-up) and never for requested (the office has not spoken yet).
 */
export async function sendAppointmentStatusEmail(args: {
  to: string;
  reference: string;
  visitorName: string;
  status: "confirmed" | "cancelled";
  department: string;
  visitDate: string;
  visitTime: string;
  visitors: string;
}): Promise<boolean> {
  /* v2.8.87.0 — the appointment confirm/cancel switch (Admin → Email Alerts). */
  if (!(await emailSwitchOn("appointment_status"))) {
    console.info(
      `[mailer] appointment_status switch is OFF — status email for ${args.reference} skipped.`,
    );
    return false;
  }
  const confirmed = args.status === "confirmed";
  const school = "St. Thomas' College Matale";
  const subject = confirmed
    ? `Your appointment is confirmed · ${args.reference}`
    : `Your appointment was cancelled · ${args.reference}`;
  const detailRows: [string, string][] = [
    ["Reference", args.reference],
    ["Department", args.department],
    ["Date", args.visitDate],
    ["Time", args.visitTime],
    ["Visitors", args.visitors],
  ];
  const closing = confirmed
    ? "We look forward to welcoming you. Please bring a valid ID (National Identity Card or Passport) — every visitor receives a temporary badge at the security gate. If the time no longer suits you, please call the office."
    : "This appointment has been cancelled by the office. If this is a surprise, please call the office to sort it out — or book a new visit any time on the school website's Contact page.";
  const text = [
    `Hello ${args.visitorName},`,
    "",
    confirmed
      ? `Your appointment with the ${args.department} of ${school} is CONFIRMED.`
      : `Your appointment with the ${args.department} of ${school} has been CANCELLED.`,
    "",
    ...detailRows.map(([label, value]) => `${label}: ${value}`),
    "",
    closing,
    "",
    `${school}`,
  ].join("\n");
  const html = await renderDarkEmail({
    heading: `Hello ${args.visitorName},`,
    intro: confirmed
      ? `Your appointment with the ${args.department} is CONFIRMED.`
      : `Your appointment with the ${args.department} has been CANCELLED.`,
    blocks: [
      {
        type: "banner",
        tone: confirmed ? "good" : "bad",
        label: confirmed ? "CONFIRMED" : "CANCELLED",
      },
      { type: "rows", rows: detailRows },
      {
        type: "note",
        html: `You can always check this appointment on the school website — Contact page → <b style="color:${HEADING};">Check your appointment status</b> (reference ${escapeHtml(args.reference)} + the email you booked with).`,
      },
    ],
    closing,
  });
  return sendMail({ to: args.to, subject, text, html, logKind: "appointment_status", logReference: args.reference });
}

/**
 * v2.8.85.0 — the FIFTH essential mail event (owner-approved): the
 * submission receipt. When a visitor books an appointment, sends a contact
 * message, files an application or answers a Special Form, THEY now get a
 * branded acknowledgement with their reference code — the owner asked for
 * exactly the same behaviour the status emails already had. Volume stays
 * 1:1 with submissions (a school-scale trickle) and each form decides its
 * own receipt switch (Special Forms) while the three fixed forms always
 * send — the owner's "user ta confirmation ekak" rule.
 */
export async function sendSubmissionReceipt(args: {
  to: string;
  reference: string;
  submitterName: string;
  /** What was submitted — "appointment request", form title, etc. */
  title: string;
  /** Key echoed rows (max ~8) — the office never gets blind copies here. */
  fields: [string, string][];
  /**
   * v2.8.87.0 — which form produced this receipt, for its switchboard gate
   * (receipt_admission / receipt_contact / receipt_appointment /
   * receipt_special_form). Callers that pass no event are never gated.
   */
  event?: "admission" | "contact" | "appointment" | "special_form";
}): Promise<boolean> {
  if (args.event && !(await emailSwitchOn(`receipt_${args.event}` as EmailSwitchKey))) {
    console.info(
      `[mailer] receipt_${args.event} switch is OFF — receipt for ${args.reference} skipped.`,
    );
    return false;
  }
  const school = "St. Thomas' College Matale";
  const subject = `We received your ${args.title} · ${args.reference}`;
  const text = [
    `Hello ${args.submitterName},`,
    "",
    `${school} has received your ${args.title}.`,
    "",
    `Reference: ${args.reference}`,
    ...args.fields.map(([label, value]) => `${label}: ${value}`),
    "",
    "Keep this reference — you can use it on the school website to check your appointment status. The office will contact you if anything more is needed.",
    "",
    school,
  ].join("\n");
  const html = await renderDarkEmail({
    heading: `Hello ${args.submitterName},`,
    intro: `${school} has received your ${args.title}.`,
    blocks: [
      { type: "banner", tone: "good", label: "RECEIVED" },
      { type: "rows", rows: [["Reference", args.reference], ...args.fields] },
      {
        type: "note",
        html: `Keep this reference. Appointments can be checked any time on the school website — Contact page → <b style="color:${HEADING};">Check your appointment status</b>.`,
      },
    ],
    closing:
      "The office will contact you if anything more is needed. Please do not reply to this email — it is sent by an unattended mailbox.",
  });
  return sendMail({ to: args.to, subject, text, html, logKind: "submission_receipt", logReference: args.reference });
}
