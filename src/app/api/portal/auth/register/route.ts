import { NextResponse } from "next/server";
import {
  PORTAL_HOME,
  createPortalSessionRow,
  isPortalRole,
  portalCookieName,
  portalSessionCookieOptions,
  registerPortalAccount,
} from "@/lib/portal-auth";
import {
  studentAccountEmail,
  verifyParentRegistration,
  verifyStudentRegistration,
  verifyTeacherRegistration,
} from "@/lib/verification";

export const dynamic = "force-dynamic";

/* Light per-IP throttle — 10 registrations / 15 minutes is plenty for real
   families, and it blunts scripted form spam. */
const globalForRegister = globalThis as typeof globalThis & {
  __stcPortalRegisters?: Map<string, { count: number; resetAt: number }>;
};
const attempts = globalForRegister.__stcPortalRegisters ?? new Map();
globalForRegister.__stcPortalRegisters = attempts;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{6,20}$/;

type RegisterBody = {
  role?: string;
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  /* student */
  admissionNo?: string;
  registerNo?: string;
  className?: string;
  fatherName?: string;
  motherName?: string;
  phone?: string;
  /* teacher */
  teacherId?: string;
  /* parent */
  childAdmissionNo?: string;
  childClass?: string;
  relation?: string;
  guardianName?: string;
};

/** Every failure returns 200 with {ok:false,status} so the form stays calm. */
export async function POST(req: Request) {
  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
  }

  const role = body.role;
  if (!isPortalRole(role)) {
    return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
  }

  const password = body.password || "";
  const confirmPassword = body.confirmPassword || "";
  const phone = (body.phone || "").trim();

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const record = attempts.get(ip);
  if (record && record.resetAt > now && record.count >= 10) {
    return NextResponse.json({ ok: false, status: "rate_limited" }, { status: 200 });
  }

  if (password !== confirmPassword) {
    return NextResponse.json({ ok: false, status: "password_mismatch" }, { status: 200 });
  }
  if (phone && !PHONE_RE.test(phone)) {
    return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
  }

  /* ── Per-role required fields + verification against the registers ── */
  const missing = (fields: Array<string | undefined | null>) =>
    fields.some((value) => !value || !value.trim());

  let accountEmail = "";
  let fullName = "";
  let outcome: Awaited<ReturnType<typeof verifyStudentRegistration>>;

  try {
    if (role === "student") {
      const admissionNo = (body.admissionNo || "").trim();
      fullName = (body.fullName || "").trim();
      const className = (body.className || "").trim();
      const registerNo = (body.registerNo || "").trim();
      const fatherName = (body.fatherName || "").trim();
      const motherName = (body.motherName || "").trim();
      const email = (body.email || "").trim().toLowerCase();

      if (missing([admissionNo, fullName, className, registerNo, fatherName, motherName])) {
        return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
      }
      if (email && !EMAIL_RE.test(email)) {
        return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
      }

      /* The ADMISSION NUMBER is the student's portal identity — the login
         field accepts it directly. Email stays optional contact info. */
      accountEmail = studentAccountEmail(admissionNo);

      outcome = await verifyStudentRegistration({
        admissionNo,
        fullName,
        className,
        registerNo,
        fatherName,
        motherName,
      });

      fullName = fullName.replace(/\s+/g, " ").slice(0, 120);
      const snapshot = {
        admissionNo,
        fullName,
        className,
        registerNo,
        fatherName,
        motherName,
        phone: phone || null,
        email: email || null,
        outcome: outcome.result,
        reason: outcome.reason,
        recordId: outcome.recordId,
      };
      return await finish(role, accountEmail, password, fullName, outcome, snapshot, {
        record,
        ip,
        now,
      });
    }

    if (role === "teacher") {
      const teacherId = (body.teacherId || "").trim();
      fullName = (body.fullName || "").trim();
      const email = (body.email || "").trim().toLowerCase();

      if (missing([teacherId, fullName, email]) || !EMAIL_RE.test(email)) {
        return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
      }

      accountEmail = email;
      outcome = await verifyTeacherRegistration({ teacherId, fullName, email });

      fullName = fullName.replace(/\s+/g, " ").slice(0, 120);
      const snapshot = {
        teacherId,
        fullName,
        email,
        phone: phone || null,
        outcome: outcome.result,
        reason: outcome.reason,
        recordId: outcome.recordId,
      };
      return await finish(role, accountEmail, password, fullName, outcome, snapshot, {
        record,
        ip,
        now,
      });
    }

    /* parent */
    const childAdmissionNo = (body.childAdmissionNo || "").trim();
    const childClass = (body.childClass || "").trim();
    const relation = (body.relation || "").trim().toLowerCase();
    const guardianName = (body.guardianName || (body.fullName || "")).trim();
    const email = (body.email || "").trim().toLowerCase();

    if (missing([childAdmissionNo, childClass, relation, guardianName, email])) {
      return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
    }
    if (!["father", "mother", "guardian"].includes(relation)) {
      return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
    }

    accountEmail = email;
    outcome = await verifyParentRegistration({
      childAdmissionNo,
      childClass,
      relation,
      guardianName,
    });

    fullName = guardianName.replace(/\s+/g, " ").slice(0, 120);
    const snapshot = {
      childAdmissionNo,
      childClass,
      relation,
      guardianName: fullName,
      email,
      phone: phone || null,
      outcome: outcome.result,
      reason: outcome.reason,
      recordId: outcome.recordId,
    };
    return await finish(role, accountEmail, password, fullName, outcome, snapshot, {
      record,
      ip,
      now,
    });
  } catch {
    return NextResponse.json({ ok: false, status: "server_error" }, { status: 200 });
  }
}

/** Shared tail: insert the account, issue a session ONLY when approved. */
async function finish(
  role: "student" | "teacher" | "parent",
  accountEmail: string,
  password: string,
  fullName: string,
  outcome: { result: "approved" | "pending"; reason: string | null },
  snapshot: Record<string, unknown>,
  ctx: {
    record?: { count: number; resetAt: number };
    ip: string;
    now: number;
  },
) {
  let result;
  try {
    result = await registerPortalAccount({
      role,
      email: accountEmail,
      password,
      fullName,
      status: outcome.result === "approved" ? "active" : "pending",
      verification: JSON.stringify(snapshot),
    });
  } catch {
    return NextResponse.json({ ok: false, status: "server_error" }, { status: 200 });
  }

  if (result.status !== "ok" && result.status !== "pending") {
    if (ctx.record && ctx.record.resetAt > ctx.now) {
      attempts.set(ctx.ip, { count: ctx.record.count + 1, resetAt: ctx.record.resetAt });
    } else {
      attempts.set(ctx.ip, { count: 1, resetAt: ctx.now + 15 * 60 * 1000 });
    }
    return NextResponse.json({ ok: false, status: result.status }, { status: 200 });
  }

  attempts.delete(ctx.ip);

  /* PENDING — no session. The office sees it in Registration Approvals. */
  if (result.status === "pending") {
    return NextResponse.json(
      { ok: true, status: "pending" },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  /* APPROVED — straight into the portal. */
  const { token, expiresAt } = await createPortalSessionRow(result.accountId);
  const response = NextResponse.json(
    { ok: true, redirect: PORTAL_HOME[role] },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
  response.cookies.set(portalCookieName(role), token, portalSessionCookieOptions(expiresAt));
  return response;
}
