import { redirect } from "next/navigation";

/**
 * Registration Approvals moved to the LMS Admin Studio (v2.8.35.0 — module
 * isolation): /lms-admin/registrations.
 */
export default function AdminVerificationsRedirect() {
  redirect("/lms-admin/registrations");
}
