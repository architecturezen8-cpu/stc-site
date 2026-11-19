import { NextResponse } from "next/server";
import {
  PORTAL_HOME,
  createPortalSessionRow,
  isPortalRole,
  portalCookieName,
  portalSessionCookieOptions,
  registerPortalAccount,
  resubmitPortalRegistration,
} from "@/lib/portal-auth";
import {
  normalizeId,
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
  /* parent — v2.9.15.3: children[] carries EVERY child (legacy
     childAdmissionNo/childClass still arrive from older clients and are
     honoured as the single-child fallback). */
  children?: Array<{ admissionNo?: string; className?: string }>;
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
  /* v2.8.63.0 — the Principal portal is INVITE-ONLY: the office creates it
     in Admin Studio → Portal Accounts. No public registration path. */
  if (role === "principal") {
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

      /* v2.8.62.0 — the owner: "verification records daddi godak welawata
         thawa details danna wenawa ne" — registration now needs ONLY the
         essentials (admission no, name, class). Register no and parents'
         names are optional: they are still VERIFIED when typed, and the
         register matcher already skips the details the office has not
         recorded, so blank fields can never fail a family.
         v2.9.13.0 — EMAIL IS NO LONGER OPTIONAL (owner: "acc ekak create
         karaddi email eka optional nemei required karanna") — the account
         identity stays adm-…@portal.stcmatale.lk, but every student now
         hands over a real contact address that the office register carries
         and the profile header shows. */
      if (missing([admissionNo, fullName, className]) || !email || !EMAIL_RE.test(email)) {
        return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
      }

      /* v2.9.15.10 — THE STUDENT'S OWN EMAIL IS NOW THE SIGN-IN EMAIL
         (owner: "student kenek acc eka create karaddi dana email eken thama
         sign in weddith enna ona ... nomal login ekedi default portal email
         eka add wenne. eka balal fix karanna. ekedi user dena email eken eka
         replace wenna ona"). The synthetic adm-…@portal.stcmatale.lk address
         is retired for new accounts; the normalised admission number rides
         admission_ref so the sign-in field still accepts it. If the typed
         email is already taken by ANOTHER student (a shared family address),
         the account quietly falls back to the synthetic identity — that
         sibling signs in with their admission number and the register email
         keeps the display honest. */
      accountEmail = email;
      const admissionRef = normalizeId(admissionNo);

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
      }, {
        admissionRef,
        fallbackEmail: studentAccountEmail(admissionNo),
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
    const relation = (body.relation || "").trim().toLowerCase();
    const guardianName = (body.guardianName || (body.fullName || "")).trim();
    const email = (body.email || "").trim().toLowerCase();

    if (missing([relation, guardianName, email])) {
      return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
    }
    if (!["father", "mother", "guardian"].includes(relation)) {
      return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
    }

    /* v2.9.15.3 — MULTI-CHILD REGISTRATION. Build the child list from
       children[] (new form) with the legacy single-child fields as the
       fallback. Every child must be COMPLETE (admission no + class), the
       list is de-duplicated, and a sane cap of 6 keeps the register
       re-check loop bounded. */
    const rawChildren = Array.isArray(body.children) ? body.children : [];
    let childList = rawChildren
      .map((c) => ({
        admissionNo: (c?.admissionNo || "").trim(),
        className: (c?.className || "").trim(),
      }))
      .filter((c) => c.admissionNo || c.className);
    if (childList.length === 0) {
      const singleAdmission = (body.childAdmissionNo || "").trim();
      const singleClass = (body.childClass || "").trim();
      if (singleAdmission || singleClass) {
        childList = [{ admissionNo: singleAdmission, className: singleClass }];
      }
    }
    if (
      childList.length === 0 ||
      childList.length > 6 ||
      childList.some((c) => !c.admissionNo || !c.className)
    ) {
      return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
    }
    {
      const seen = new Set<string>();
      childList = childList.filter((c) => {
        const key = c.admissionNo.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    accountEmail = email;

    /* Verify EACH child against the register; the account is approved only
       when EVERY child matches — one mismatch sends the whole family to
       the office queue with the honest, child-tagged reason. */
    const verifiedChildren: Array<{
      admissionNo: string;
      className: string;
      outcome: string;
      reason: string | null;
    }> = [];
    const aggregate: {
      result: "approved" | "pending";
      reason: string | null;
      recordId: number | null;
    } = { result: "approved", reason: null, recordId: null };
    for (const child of childList) {
      const res = await verifyParentRegistration({
        childAdmissionNo: child.admissionNo,
        childClass: child.className,
        relation,
        guardianName,
      });
      verifiedChildren.push({
        admissionNo: child.admissionNo,
        className: child.className,
        outcome: res.result,
        reason: res.reason,
      });
      if (res.result !== "approved" && aggregate.result === "approved") {
        aggregate.result = "pending";
        aggregate.reason = `Child ${child.admissionNo}: ${res.reason || "needs office approval"}`;
        aggregate.recordId = res.recordId;
      } else if (aggregate.recordId === null && res.recordId !== null) {
        aggregate.recordId = res.recordId;
      }
    }
    outcome = aggregate;

    fullName = guardianName.replace(/\s+/g, " ").slice(0, 120);
    const snapshot = {
      /* legacy flat fields = FIRST child — keeps old readers working */
      childAdmissionNo: childList[0].admissionNo,
      childClass: childList[0].className,
      relation,
      guardianName: fullName,
      email,
      phone: phone || null,
      /* v2.9.15.3 — every child rides the snapshot; ensureParentPerson
         links them all and the office queue renders this list. */
      children: verifiedChildren,
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

/** Shared tail: insert (or re-submit) the account, issue a session ONLY
 *  when approved. v2.9.15.10 — a pending/rejected registration with the
 *  same identity is UPDATED in place (edit + resubmit), and a student
 *  whose typed email is already taken by a sibling falls back to the
 *  synthetic identity so the family is never blocked. */
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
  student?: { admissionRef: string; fallbackEmail: string },
) {
  const verificationText = JSON.stringify(snapshot);

  /* Edit + resubmit: the SAME registration corrected and sent again —
     status returns to pending and the old rejection reason is cleared. */
  let result = await resubmitPortalRegistration({
    role,
    email: accountEmail,
    password,
    fullName,
    verification: verificationText,
    admissionRef: student?.admissionRef ?? null,
  });

  let admissionLoginHint = false;
  if (!result) {
    result = await registerPortalAccount({
      role,
      email: accountEmail,
      password,
      fullName,
      status: outcome.result === "approved" ? "active" : "pending",
      verification: verificationText,
      admissionRef: student?.admissionRef ?? null,
    });
    if (result.status === "exists" && student) {
      /* Shared family email → the synthetic identity keeps the unique
         index happy; the sibling signs in with their admission number. */
      result = await registerPortalAccount({
        role,
        email: student.fallbackEmail,
        password,
        fullName,
        status: outcome.result === "approved" ? "active" : "pending",
        verification: verificationText,
        admissionRef: student.admissionRef,
      });
      admissionLoginHint = result.status === "pending" || result.status === "ok";
    }
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
      { ok: true, status: "pending", admissionLoginHint },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  /* APPROVED — straight into the portal. */
  const { token, expiresAt } = await createPortalSessionRow(result.accountId);
  const response = NextResponse.json(
    { ok: true, redirect: PORTAL_HOME[role] },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
  response.cookies.set(
    portalCookieName(role),
    token,
    await portalSessionCookieOptions(expiresAt),
  );
  return response;
}
