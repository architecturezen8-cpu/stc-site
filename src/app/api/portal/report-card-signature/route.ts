import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { lmsClasses, lmsPortalAccounts, lmsReportCards, lmsTeachers } from "@/db/schema-lms";
import { ensureLmsPerson } from "@/lib/lms-identity";
import { getLinkedChild } from "@/lib/portal-parent-children";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { getSignatureBytes } from "@/lib/portal-signature";

export const dynamic = "force-dynamic";

/** The three stamp slots a certified sheet can carry. */
type CardStampKind = "principal-sign" | "principal-seal" | "teacher-sign";

function isCardStampKind(value: string | null): value is CardStampKind {
  return (
    value === "principal-sign" ||
    value === "principal-seal" ||
    value === "teacher-sign"
  );
}

/**
 * v2.8.63.0 — THE STAMP GATE.
 *
 * Serves the certification stamps for ONE certified report card:
 *   kind = principal-sign | principal-seal | teacher-sign
 *
 * Anti-abuse policy (owner-approved):
 * · The sheet must be CERTIFIED — a draft or submitted card serves nothing.
 * · The viewer must hold a session AND be authorised for that card:
 *     student → own card · parent → linked child
 *     teacher → the class teacher · principal → any certified card
 * · The bytes come straight from the database — no public URL, no media
 *   library, no shareable link. Without a valid session this route is a
 *   401; with one it is still a per-card 403 unless authorised.
 */
export async function GET(req: Request) {
  const session = await getPortalSessionForRequest(req, [
    "student",
    "teacher",
    "parent",
    "principal",
  ]);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const cardId = Number(url.searchParams.get("cardId"));
  const kind = url.searchParams.get("kind");
  if (!Number.isInteger(cardId) || cardId <= 0 || !isCardStampKind(kind)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    await ensureSchemaExtras();
    const [card] = await db
      .select({
        id: lmsReportCards.id,
        studentId: lmsReportCards.studentId,
        classId: lmsReportCards.classId,
        status: lmsReportCards.status,
        certifiedByAccountId: lmsReportCards.certifiedByAccountId,
      })
      .from(lmsReportCards)
      .where(eq(lmsReportCards.id, cardId))
      .limit(1);
    if (!card || card.status !== "certified") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const [cls] = await db
      .select({ classTeacherId: lmsClasses.classTeacherId })
      .from(lmsClasses)
      .where(eq(lmsClasses.id, card.classId))
      .limit(1);

    /* Per-role authorisation, mirroring the sheet reader. */
    if (session.role === "student") {
      const self = (await ensureLmsPerson("student", session.accountId)) as
        | { id: number }
        | null;
      if (!self || self.id !== card.studentId) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
    } else if (session.role === "parent") {
      const child = await getLinkedChild(session.accountId, card.studentId);
      if (!child) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
    } else if (session.role === "teacher") {
      const [teacher] = await db
        .select({ id: lmsTeachers.id })
        .from(lmsTeachers)
        .where(eq(lmsTeachers.accountId, session.accountId))
        .limit(1);
      if (!teacher || !cls || cls.classTeacherId !== teacher.id) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
    } else {
      /* principal */
      const [principalAccount] = await db
        .select({ role: lmsPortalAccounts.role })
        .from(lmsPortalAccounts)
        .where(eq(lmsPortalAccounts.id, session.accountId))
        .limit(1);
      if (!principalAccount || principalAccount.role !== "principal") {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
    }

    /* Whose stamp is this? */
    let ownerAccountId: number | null = null;
    if (kind === "teacher-sign") {
      if (!cls?.classTeacherId) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
      const [teacher] = await db
        .select({ accountId: lmsTeachers.accountId })
        .from(lmsTeachers)
        .where(eq(lmsTeachers.id, cls.classTeacherId))
        .limit(1);
      ownerAccountId = teacher?.accountId ?? null;
    } else {
      /* principal-sign / principal-seal — the account that certified. */
      ownerAccountId = card.certifiedByAccountId;
    }
    if (!ownerAccountId) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const stamp = await getSignatureBytes(
      ownerAccountId,
      kind === "principal-seal" ? "seal" : "sign",
    );
    if (!stamp) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const bytes = Buffer.from(stamp.data, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": stamp.mime || "image/png",
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
