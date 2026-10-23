/**
 * v2.8.52.0 — the role hint every portal client island sends with its API
 * fetches (`x-portal-role`). One browser may hold BOTH a student and a
 * teacher session at once (per-role cookies); without the hint the API
 * resolved every call student-first, so a teacher's chat reply was saved
 * AS the student's message. The hint only picks WHICH cookie the server
 * reads — it can never escalate, and every authorization check still runs
 * against the resolved account. Client-safe: no server imports here.
 */
export type PortalRoleHint = "student" | "teacher" | "parent";

export function portalRoleHeaders(role: PortalRoleHint): Record<string, string> {
  return { "x-portal-role": role };
}
