import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  lmsClassSubjects,
  lmsEnrollments,
  lmsMaterialFiles,
  lmsMaterials,
  lmsNoticeFiles,
  lmsNotices,
  lmsSubjects,
} from "@/db/schema-lms";
import { getLinkedChild, type ParentChildRef } from "@/lib/portal-parent-children";

/* ── Phase 3.3 (v2.8.77.0) — PARENT CLASSROOM READERS ────────────────────
   The owner's roadmap item: "class materials + notices on the parent
   portal". Parents already mirror homework + marks (Phase 3.2); these
   readers add the two remaining classroom surfaces, strictly READ-ONLY:

   · Materials — everything the teachers handed to the child's class
     (files open through the same audience-checked object route the
     students use — the route gained a parent branch in this version).
   · Notices — the class notices, FULL list (the dashboard preview caps
     at 3 per child), attachments included.

   The Phase 3.2 contract is kept: every reader re-verifies the
   parent→child link at the server boundary via getLinkedChild, anything
   unknown or failed degrades to null — never an exception in a page. */

export type ParentMaterialView = {
  id: number;
  title: string;
  subject: string;
  whenLabel: string;
  linkUrl: string | null;
  files: {
    key: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }[];
};

export type ParentNoticeView = {
  id: number;
  title: string;
  body: string;
  whenLabel: string;
  linkUrl: string | null;
  files: {
    id: number;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }[];
};

export type ParentChildMaterials = {
  child: ParentChildRef;
  materials: ParentMaterialView[];
};

export type ParentChildNotices = {
  child: ParentChildRef;
  notices: ParentNoticeView[];
};

function colomboDay(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** The linked child's active class ids (usually exactly one). */
async function childClassIds(studentId: number): Promise<number[]> {
  const rows = await db
    .select({ classId: lmsEnrollments.classId })
    .from(lmsEnrollments)
    .where(
      and(
        eq(lmsEnrollments.studentId, studentId),
        eq(lmsEnrollments.status, "active"),
      ),
    );
  return rows.map((r) => r.classId);
}

/**
 * FULL class-material list for one linked child — the read-only parent
 * mirror of the student dashboard's materials panel, without the 6-item
 * cap. Guarded: the child must be linked to this parent account.
 */
export async function getParentChildMaterials(
  accountId: number,
  childStudentId: number,
): Promise<ParentChildMaterials | null> {
  try {
    const child = await getLinkedChild(accountId, childStudentId);
    if (!child) return null;
    const classIds = await childClassIds(child.studentId);
    if (classIds.length === 0) return { child, materials: [] };

    const rows = await db
      .select({
        id: lmsMaterials.id,
        title: lmsMaterials.title,
        linkUrl: lmsMaterials.externalUrl,
        createdAt: lmsMaterials.createdAt,
        classSubjectId: lmsMaterials.classSubjectId,
        subjectName: lmsSubjects.name,
      })
      .from(lmsMaterials)
      .innerJoin(lmsClassSubjects, eq(lmsMaterials.classSubjectId, lmsClassSubjects.id))
      .innerJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
      .where(inArray(lmsClassSubjects.classId, classIds))
      .orderBy(desc(lmsMaterials.createdAt))
      .limit(60);
    if (rows.length === 0) return { child, materials: [] };

    const fileRows = await db
      .select({
        materialId: lmsMaterialFiles.materialId,
        key: lmsMaterialFiles.objectKey,
        fileName: lmsMaterialFiles.fileName,
        mimeType: lmsMaterialFiles.mimeType,
        sizeBytes: lmsMaterialFiles.sizeBytes,
      })
      .from(lmsMaterialFiles)
      .where(
        inArray(
          lmsMaterialFiles.materialId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(lmsMaterialFiles.id);

    const materials: ParentMaterialView[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      subject: r.subjectName,
      whenLabel: colomboDay(r.createdAt),
      linkUrl: r.linkUrl ?? null,
      files: fileRows
        .filter((f) => f.materialId === r.id)
        .map((f) => ({
          key: f.key,
          fileName: f.fileName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
        })),
    }));
    return { child, materials };
  } catch {
    return null;
  }
}

/**
 * FULL class-notice list for one linked child — the dashboard preview
 * caps at 3; parents get the complete feed here, attachments included
 * (they already open through the audience-checked notice file route).
 * Guarded like every other parent reader.
 */
export async function getParentChildNotices(
  accountId: number,
  childStudentId: number,
): Promise<ParentChildNotices | null> {
  try {
    const child = await getLinkedChild(accountId, childStudentId);
    if (!child) return null;
    const classIds = await childClassIds(child.studentId);
    if (classIds.length === 0) return { child, notices: [] };

    const rows = await db
      .select({
        id: lmsNotices.id,
        title: lmsNotices.title,
        body: lmsNotices.body,
        linkUrl: lmsNotices.linkUrl,
        createdAt: lmsNotices.createdAt,
      })
      .from(lmsNotices)
      .where(inArray(lmsNotices.classId, classIds))
      .orderBy(desc(lmsNotices.createdAt))
      .limit(40);
    if (rows.length === 0) return { child, notices: [] };

    const fileRows = await db
      .select({
        noticeId: lmsNoticeFiles.noticeId,
        id: lmsNoticeFiles.id,
        fileName: lmsNoticeFiles.fileName,
        mimeType: lmsNoticeFiles.mimeType,
        sizeBytes: lmsNoticeFiles.sizeBytes,
      })
      .from(lmsNoticeFiles)
      .where(
        inArray(
          lmsNoticeFiles.noticeId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(lmsNoticeFiles.id);

    const notices: ParentNoticeView[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      whenLabel: colomboDay(r.createdAt),
      linkUrl: r.linkUrl ?? null,
      files: fileRows
        .filter((f) => f.noticeId === r.id)
        .map((f) => ({
          id: f.id,
          fileName: f.fileName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
        })),
    }));
    return { child, notices };
  } catch {
    return null;
  }
}
