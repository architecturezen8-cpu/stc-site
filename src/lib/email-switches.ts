import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

/**
 * v2.8.87.0 — the OWNER'S EMAIL SWITCHES (the owner: "admin eke email
 * kiyala section ekak danawada. ekedi adminta control eka thiyenna one —
 * email yawanawada nadda kiyala on/off karanna. applications walata ehema
 * email yawanawada nadda, form submission walata ehema email yawanawada
 * kiyala on/off karanna").
 *
 * Every non-security mail the site sends is now gated by ONE switch, stored
 * in site_settings under `email_switches` as { [key]: boolean }. The mailer
 * checks its switch right before sending, so a switch that is OFF means the
 * mail simply never leaves — submissions still succeed.
 *
 * SECURITY MAIL IS NEVER GATED: portal password resets, backup-download
 * codes (and admin OTP) cannot be turned off — they are the doors, not the
 * announcements.
 */

export const EMAIL_SWITCH_SETTING_KEY = "email_switches";

export type EmailSwitchKey =
  /* receipts — TO THE VISITOR */
  | "receipt_admission"
  | "receipt_contact"
  | "receipt_appointment"
  | "receipt_special_form"
  /* office heads-up — TO THE OFFICE */
  | "office_admission"
  | "office_contact"
  | "office_appointment"
  | "office_special_form"
  /* appointment confirm/cancel — TO THE VISITOR */
  | "appointment_status";

export type EmailSwitchDef = {
  key: EmailSwitchKey;
  label: string;
  description: string;
  audience: "visitor" | "office";
};

/** The switchboard, in display order. Every switch defaults ON. */
export const EMAIL_SWITCH_DEFS: EmailSwitchDef[] = [
  {
    key: "receipt_admission",
    label: "Application receipt",
    description:
      "The applicant gets a branded acknowledgement with their reference (ADM-…) the moment an application arrives.",
    audience: "visitor",
  },
  {
    key: "receipt_contact",
    label: "Contact message receipt",
    description:
      "The sender gets an acknowledgement with their reference (SRN-…) for every contact message.",
    audience: "visitor",
  },
  {
    key: "receipt_appointment",
    label: "Appointment receipt",
    description:
      "The visitor gets an acknowledgement with their booking reference (APT-…).",
    audience: "visitor",
  },
  {
    key: "receipt_special_form",
    label: "Special form receipt",
    description:
      "The master switch for Form Builder form receipts (SF-…). A form's own Receipt email switch must ALSO be on — both must agree.",
    audience: "visitor",
  },
  {
    key: "appointment_status",
    label: "Appointment confirmed / cancelled",
    description:
      "When the office confirms or cancels a booking, the visitor is told by email.",
    audience: "visitor",
  },
  {
    key: "office_admission",
    label: "New application heads-up",
    description:
      "The office inbox gets a heads-up with the application's key details on every new application.",
    audience: "office",
  },
  {
    key: "office_contact",
    label: "New contact message heads-up",
    description:
      "The office inbox gets a heads-up on every new contact message.",
    audience: "office",
  },
  {
    key: "office_appointment",
    label: "New appointment request heads-up",
    description:
      "The office inbox gets a heads-up on every new appointment booking.",
    audience: "office",
  },
  {
    key: "office_special_form",
    label: "New form submission heads-up",
    description:
      "The office inbox gets a heads-up on every Form Builder form submission. A form's own Office heads-up switch must ALSO be on.",
    audience: "office",
  },
];

const ALL_KEYS = new Set(EMAIL_SWITCH_DEFS.map((d) => d.key));

function readMap(value: unknown): Partial<Record<EmailSwitchKey, boolean>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Partial<Record<EmailSwitchKey, boolean>> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (ALL_KEYS.has(key as EmailSwitchKey) && typeof raw === "boolean") {
      out[key as EmailSwitchKey] = raw;
    }
  }
  return out;
}

/** The full switchboard state — defaults merged with the stored values. */
export async function getEmailSwitches(): Promise<Record<EmailSwitchKey, boolean>> {
  const [row] = await db
    .select({ publishedValue: siteSettings.publishedValue })
    .from(siteSettings)
    .where(eq(siteSettings.key, EMAIL_SWITCH_SETTING_KEY))
    .limit(1);
  const stored = readMap(row?.publishedValue);
  const out = {} as Record<EmailSwitchKey, boolean>;
  for (const def of EMAIL_SWITCH_DEFS) {
    out[def.key] = stored[def.key] ?? true;
  }
  return out;
}

/** One switch check — what the mailer calls right before sending. */
export async function isEmailSwitchOn(key: EmailSwitchKey): Promise<boolean> {
  const switches = await getEmailSwitches();
  return switches[key];
}

/** Validate an incoming switch map against the known keys. */
export function validateEmailSwitches(
  value: unknown,
): { ok: true; switches: Record<EmailSwitchKey, boolean> } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Switches must be an object." };
  }
  const out = {} as Record<EmailSwitchKey, boolean>;
  for (const def of EMAIL_SWITCH_DEFS) {
    const raw = (value as Record<string, unknown>)[def.key];
    out[def.key] = typeof raw === "boolean" ? raw : true;
  }
  return { ok: true, switches: out };
}

/** Save the whole switchboard (one site_settings row, upsert by key). */
export async function setEmailSwitches(
  switches: Record<EmailSwitchKey, boolean>,
  userId: number,
): Promise<void> {
  const [existing] = await db
    .select({ id: siteSettings.id })
    .from(siteSettings)
    .where(eq(siteSettings.key, EMAIL_SWITCH_SETTING_KEY))
    .limit(1);
  if (existing) {
    await db
      .update(siteSettings)
      .set({ publishedValue: switches, updatedBy: userId, updatedAt: new Date() })
      .where(eq(siteSettings.id, existing.id));
  } else {
    await db.insert(siteSettings).values({
      key: EMAIL_SWITCH_SETTING_KEY,
      draftValue: switches,
      publishedValue: switches,
      updatedBy: userId,
    });
  }
}
