import { redirect } from "next/navigation";

/**
 * Verification Records moved to the LMS Admin Studio (v2.8.35.0 — module
 * isolation): /lms-admin/registers.
 */
export default function AdminVerificationRecordsRedirect() {
  redirect("/lms-admin/registers");
}
