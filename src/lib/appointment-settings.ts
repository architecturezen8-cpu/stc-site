import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

/**
 * v2.8.91.0 — THE OFFICE'S APPOINTMENT SETTINGS (the owner: "appinment
 * form edit karanna option ekak na ne … aya machan dan dawasakata danna
 * puluwan appoinment ganak ehema thiyanawa ne samanyayen onama ayathaneka.
 * eka set karanna widiyak na ne aya times ehema kohemada danne").
 *
 * Everything the public appointment form used to hard-code — the visiting
 * time slots, how many bookings a day accepts, how many visitors one
 * booking may bring, whether weekends are open and how far ahead a visit
 * must be booked — now lives in ONE site_settings row (key
 * `appointment_settings`), edited from Admin Studio → Forms → Appointments
 * → "Form settings" and published instantly (the email-switches pattern:
 * saving writes both the draft and the published value).
 *
 * v2.8.92.0 — PER-CARD EDITING (the owner: "time eka hariyata edit wenne
 * na … appoinment card 4 wena wenama edit karanna option ekak danna wei
 * nne"): the four contact-page cards kept winning over the default times
 * (their slot lists were hard-coded in the page), so editing the defaults
 * never changed what visitors saw. Every card now carries its OWN
 * settings — visiting times, name, phone, email, office hours, the
 * description — editable one by one from the same dialog. Empty fields
 * keep the built-in value; a card with an empty time list follows the
 * default visiting times, so one edit to the defaults still flows to
 * every card that hasn't set its own.
 *
 * The public contact page and the POST /api/appointments route both read
 * the PUBLISHED value, so the office's rule and the visitor's form can
 * never disagree.
 */

export const APPOINTMENT_SETTINGS_KEY = "appointment_settings";

export type AppointmentSettings = {
  /** The DEFAULT visiting-time slots — the list every card follows until
      the card sets its own list below. */
  timeSlots: string[];
  /** Bookings accepted per day across all departments. 0 = no limit. */
  maxPerDay: number;
  /** Largest party size one booking may request. */
  maxVisitors: number;
  /** Whether Saturday/Sunday visits are accepted (the office is closed). */
  allowWeekends: boolean;
  /** Minimum days between today and the visit (1 = from tomorrow onwards). */
  minDaysAhead: number;
  /** v2.8.92.0 — per-card overrides, keyed by the card's stable id.
      Missing key / empty fields = keep the built-in value. */
  departments: Record<string, AppointmentCardSettings>;
};

/** One contact-page card's own settings. Empty string = keep the built-in
    text; an empty timeSlots list = follow the default visiting times. */
export type AppointmentCardSettings = {
  name: string;
  phone: string;
  email: string;
  hours: string;
  detail: string;
  timeSlots: string[];
};

export type AppointmentCardIcon = "graduation" | "building" | "trophy" | "users";

/** The four appointment cards the contact page ships with — the single
    source of truth for their stable ids and built-in content. The admin
    dialog lists these ids; the contact page merges the published
    overrides on top of them. */
export const APPOINTMENT_DEPARTMENT_CATALOG: {
  id: string;
  icon: AppointmentCardIcon;
  name: string;
  phone: string;
  email: string;
  hours: string;
  detail: string;
}[] = [
  {
    id: "admissions",
    icon: "graduation",
    name: "Admissions & Registry",
    phone: "+94 66 222 0175",
    email: "admissions@stcmatale.lk",
    hours: "Mon – Fri: 8.00 a.m. – 3.00 p.m.",
    detail:
      "Applications for the 2027 Grade 6 intake and Advanced Level admissions, transfers and student records.",
  },
  {
    id: "principal",
    icon: "building",
    name: "Principal's Secretariat",
    phone: "+94 66 222 0176",
    email: "principal@stcmatale.lk",
    hours: "By prior appointment only",
    detail:
      "Meetings with the Principal are arranged only with a confirmed appointment booked at least two working days ahead.",
  },
  {
    id: "sports",
    icon: "trophy",
    name: "Sports & Pavilion Complex",
    phone: "+94 66 222 0177",
    email: "sports@stcmatale.lk",
    hours: "Mon – Sat: 6.30 a.m. – 6.00 p.m.",
    detail:
      "Sports admissions, coaching enrolment, pavilion and ground bookings, and colours award inquiries.",
  },
  {
    id: "oba",
    icon: "users",
    name: "Old Thomians' Association",
    phone: "+94 66 222 0173",
    email: "oba@stcmatale.lk",
    hours: "Wed & Sat: 9.00 a.m. – 1.00 p.m.",
    detail:
      "Membership, the annual Sports Festival, Colours Nite and the Old Thomians' branch network.",
  },
];

const APPOINTMENT_CARD_IDS = new Set(APPOINTMENT_DEPARTMENT_CATALOG.map((d) => d.id));

/** The defaults are EXACTLY what the site shipped with — saving never
    surprises the office with a behaviour change they didn't ask for. */
export const DEFAULT_APPOINTMENT_SETTINGS: AppointmentSettings = {
  timeSlots: [
    "8.00 a.m.",
    "9.00 a.m.",
    "10.00 a.m.",
    "11.00 a.m.",
    "1.00 p.m.",
    "2.00 p.m.",
    "3.00 p.m.",
  ],
  maxPerDay: 0,
  maxVisitors: 4,
  allowWeekends: false,
  minDaysAhead: 1,
  departments: {},
};

const CARD_TEXT_CAPS: Record<keyof Omit<AppointmentCardSettings, "timeSlots">, number> = {
  name: 80,
  phone: 40,
  email: 120,
  hours: 120,
  detail: 400,
};

function readCardSettings(value: unknown): AppointmentCardSettings {
  const raw = (value ?? {}) as Record<string, unknown>;
  const str = (key: keyof typeof CARD_TEXT_CAPS) =>
    typeof raw[key] === "string" ? (raw[key] as string).trim().slice(0, CARD_TEXT_CAPS[key]) : "";
  const slots = Array.isArray(raw.timeSlots)
    ? raw.timeSlots
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_SLOTS)
    : [];
  return {
    name: str("name"),
    phone: str("phone"),
    email: str("email"),
    hours: str("hours"),
    detail: str("detail"),
    timeSlots: Array.from(new Set(slots)),
  };
}

function readDepartments(value: unknown): Record<string, AppointmentCardSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, AppointmentCardSettings> = {};
  for (const [id, card] of Object.entries(value as Record<string, unknown>)) {
    if (APPOINTMENT_CARD_IDS.has(id)) out[id] = readCardSettings(card);
  }
  return out;
}

/** A card's EFFECTIVE visiting times: its own list when it has one, else
    the default list. `null` when the name matches no card (the caller
    then falls back to the default list). */
export function resolveAppointmentCardSlots(
  departmentName: string,
  settings: AppointmentSettings,
): string[] | null {
  const wanted = departmentName.trim().toLowerCase();
  if (!wanted) return null;
  for (const card of APPOINTMENT_DEPARTMENT_CATALOG) {
    const override = settings.departments[card.id];
    const effectiveName = (override?.name || card.name).toLowerCase();
    if (effectiveName === wanted) {
      return override?.timeSlots.length ? override.timeSlots : settings.timeSlots;
    }
  }
  return null;
}

const MAX_SLOTS = 16;
const MAX_SLOT_LENGTH = 24;

function readSettings(value: unknown): AppointmentSettings {
  const raw = (value ?? {}) as Record<string, unknown>;
  const slots = Array.isArray(raw.timeSlots)
    ? raw.timeSlots
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_SLOTS)
    : [];
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    timeSlots: slots.length ? Array.from(new Set(slots)) : [...DEFAULT_APPOINTMENT_SETTINGS.timeSlots],
    maxPerDay: num(raw.maxPerDay, DEFAULT_APPOINTMENT_SETTINGS.maxPerDay, 0, 99),
    maxVisitors: num(raw.maxVisitors, DEFAULT_APPOINTMENT_SETTINGS.maxVisitors, 1, 12),
    allowWeekends: raw.allowWeekends === true,
    minDaysAhead: num(raw.minDaysAhead, DEFAULT_APPOINTMENT_SETTINGS.minDaysAhead, 1, 30),
    departments: readDepartments(raw.departments),
  };
}

/** The published settings the PUBLIC site runs on (always complete). */
export async function getPublishedAppointmentSettings(): Promise<AppointmentSettings> {
  try {
    const [row] = await db
      .select({ publishedValue: siteSettings.publishedValue })
      .from(siteSettings)
      .where(eq(siteSettings.key, APPOINTMENT_SETTINGS_KEY))
      .limit(1);
    return readSettings(row?.publishedValue);
  } catch {
    /* The form must never go down because a settings read failed. */
    return { ...DEFAULT_APPOINTMENT_SETTINGS };
  }
}

/** Validate an incoming settings object (the admin route's gate). */
export function validateAppointmentSettings(
  value: unknown,
): { ok: true; settings: AppointmentSettings } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Settings must be an object." };
  }
  const raw = value as Record<string, unknown>;
  const slots = Array.isArray(raw.timeSlots)
    ? raw.timeSlots.map((s) => String(s ?? "").trim()).filter(Boolean)
    : [];
  if (!slots.length) {
    return { ok: false, error: "Keep at least one visiting time slot." };
  }
  if (slots.length > MAX_SLOTS) {
    return { ok: false, error: `At most ${MAX_SLOTS} time slots.` };
  }
  if (slots.some((s) => s.length > MAX_SLOT_LENGTH)) {
    return { ok: false, error: `Each time slot must be ${MAX_SLOT_LENGTH} characters or fewer.` };
  }
  const seen = new Set<string>();
  for (const slot of slots) {
    const key = slot.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: `Duplicate time slot: "${slot}".` };
    }
    seen.add(key);
  }
  const maxPerDay = Math.round(Number(raw.maxPerDay));
  if (!Number.isFinite(maxPerDay) || maxPerDay < 0 || maxPerDay > 99) {
    return { ok: false, error: "Bookings per day must be between 0 and 99 (0 = no limit)." };
  }
  const maxVisitors = Math.round(Number(raw.maxVisitors));
  if (!Number.isFinite(maxVisitors) || maxVisitors < 1 || maxVisitors > 12) {
    return { ok: false, error: "Visitors per booking must be between 1 and 12." };
  }
  const minDaysAhead = Math.round(Number(raw.minDaysAhead));
  if (!Number.isFinite(minDaysAhead) || minDaysAhead < 1 || minDaysAhead > 30) {
    return { ok: false, error: "The booking window must be between 1 and 30 days ahead." };
  }
  /* v2.8.92.0 — the per-card overrides. */
  const departments = readDepartments(raw.departments);
  for (const card of APPOINTMENT_DEPARTMENT_CATALOG) {
    const override = departments[card.id];
    if (!override) continue;
    if (override.timeSlots.length > MAX_SLOTS) {
      return { ok: false, error: `${card.name}: at most ${MAX_SLOTS} time slots.` };
    }
    if (override.timeSlots.some((s) => s.length > MAX_SLOT_LENGTH)) {
      return {
        ok: false,
        error: `${card.name}: each time slot must be ${MAX_SLOT_LENGTH} characters or fewer.`,
      };
    }
  }
  return {
    ok: true,
    settings: {
      timeSlots: Array.from(new Set(slots)),
      maxPerDay,
      maxVisitors,
      allowWeekends: raw.allowWeekends === true,
      minDaysAhead,
      departments,
    },
  };
}

/** Save (and publish immediately — the email-switches pattern). */
export async function setAppointmentSettings(
  settings: AppointmentSettings,
  userId: number,
): Promise<void> {
  const [existing] = await db
    .select({ id: siteSettings.id })
    .from(siteSettings)
    .where(eq(siteSettings.key, APPOINTMENT_SETTINGS_KEY))
    .limit(1);
  if (existing) {
    await db
      .update(siteSettings)
      .set({ draftValue: settings, publishedValue: settings, updatedBy: userId, updatedAt: new Date() })
      .where(eq(siteSettings.id, existing.id));
  } else {
    await db.insert(siteSettings).values({
      key: APPOINTMENT_SETTINGS_KEY,
      draftValue: settings,
      publishedValue: settings,
      updatedBy: userId,
    });
  }
}
