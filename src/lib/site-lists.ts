import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  collegeClubs,
  oldThomians,
  streamClasses,
  streamTeachers,
  type CollegeClubRow,
  type OldThomianRow,
  type StreamClassRow,
  type StreamTeacherRow,
} from "@/db/schema";
import { STREAMS } from "@/lib/streams";
import { COLLEGE_CLUBS } from "@/lib/clubs";
import { PORTRAIT } from "@/lib/media";

/** Seed rows for the Old Thomians honour roll (mirrors the original static list). */
export const OLD_THOMIANS_SEED = [
  { name: "Gen. Shavendra Silva", note: "23rd Commander of the Sri Lanka Army (2019–2022) & Chief of Defence Staff", field: "Military", image: PORTRAIT.man1 },
  { name: "Chanaka Welegedara", note: "Sri Lanka Test cricketer, 2007–2014", field: "Cricket", image: PORTRAIT.man2 },
  { name: "Lakdasa Kodituwakku", note: "Inspector General of Police, 1998–2002", field: "Public Service", image: PORTRAIT.man3 },
  { name: "Lahiru Madushanka", note: "ODI & T20I cricketer, 2017–2021", field: "Cricket", image: PORTRAIT.boy4 },
  { name: "Ranjith Wijekoon", note: "Sri Lanka national & Asia hockey teams", field: "Hockey", image: PORTRAIT.man4 },
  { name: "Kingsley Jayasekera", note: "Actor & singer", field: "Arts", image: PORTRAIT.man5 },
  { name: "Dayan Witharana", note: "Singer & photographer", field: "Music", image: PORTRAIT.man6 },
  { name: "Sanath Wimalasiri", note: "Actor & dramatist", field: "Theatre", image: PORTRAIT.man7 },
  { name: "Hemal Ranasinghe", note: "Actor & model", field: "Cinema", image: PORTRAIT.man8 },
  { name: "Damith Wijayathunga", note: "Actor & model", field: "Cinema", image: PORTRAIT.boy5 },
  { name: "Ruwantha Kellepotha", note: "First-class cricketer", field: "Cricket", image: PORTRAIT.man9 },
  { name: "Don Spater Senanayake", note: "Entrepreneur & philanthropist", field: "Business", image: PORTRAIT.man10 },
];

let seeding: Promise<void> | null = null;

/**
 * One-time seed: fills the editable list tables from the original static
 * content, so the visual editor's "+" buttons manage a live copy from day one.
 */
export function ensureListsSeed() {
  if (!seeding) {
    seeding = runListsSeed().catch((error) => {
      seeding = null;
      throw error;
    });
  }
  return seeding;
}

async function runListsSeed() {
  const [teacherCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(streamTeachers);
  if ((teacherCount?.count ?? 0) === 0) {
    const rows = STREAMS.flatMap((stream) =>
      stream.teachers.map((t, i) => ({
        streamSlug: stream.slug,
        name: t.name,
        role: t.role,
        subject: t.subject,
        qualification: t.qualification,
        image: t.image,
        sortOrder: i,
      })),
    );
    if (rows.length) await db.insert(streamTeachers).values(rows);
  }

  const [classCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(streamClasses);
  if ((classCount?.count ?? 0) === 0) {
    const rows = STREAMS.flatMap((stream) =>
      stream.classes.map((c, i) => ({
        streamSlug: stream.slug,
        code: c.code,
        grade: c.grade,
        strength: c.strength,
        classTeacher: c.classTeacher,
        room: c.room,
        sortOrder: i,
      })),
    );
    if (rows.length) await db.insert(streamClasses).values(rows);
  }

  const [thomianCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(oldThomians);
  if ((thomianCount?.count ?? 0) === 0) {
    await db.insert(oldThomians).values(
      OLD_THOMIANS_SEED.map((o, i) => ({ ...o, sortOrder: i })),
    );
  }

  /* v2.8.90.0 — the clubs directory starts as a live copy of the original
     static list, so the admin's edits continue from what visitors saw. */
  const [clubCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(collegeClubs);
  if ((clubCount?.count ?? 0) === 0) {
    await db.insert(collegeClubs).values(
      COLLEGE_CLUBS.map((c, i) => ({ ...c, sortOrder: i })),
    );
  }
}

export async function getStreamTeachers(slug: string): Promise<StreamTeacherRow[]> {
  await ensureListsSeed();
  return db
    .select()
    .from(streamTeachers)
    .where(eq(streamTeachers.streamSlug, slug))
    .orderBy(asc(streamTeachers.sortOrder), asc(streamTeachers.id));
}

export async function getStreamClasses(slug: string): Promise<StreamClassRow[]> {
  await ensureListsSeed();
  return db
    .select()
    .from(streamClasses)
    .where(eq(streamClasses.streamSlug, slug))
    .orderBy(asc(streamClasses.sortOrder), asc(streamClasses.id));
}

export async function getOldThomians(): Promise<OldThomianRow[]> {
  await ensureListsSeed();
  return db
    .select()
    .from(oldThomians)
    .orderBy(asc(oldThomians.sortOrder), asc(oldThomians.id));
}

/** v2.8.90.0 — the admin-managed Clubs & Societies directory. */
export async function getCollegeClubs(): Promise<CollegeClubRow[]> {
  await ensureListsSeed();
  return db
    .select()
    .from(collegeClubs)
    .orderBy(asc(collegeClubs.sortOrder), asc(collegeClubs.id));
}
