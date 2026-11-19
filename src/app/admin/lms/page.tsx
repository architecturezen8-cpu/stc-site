import { redirect } from "next/navigation";

/**
 * LMS Setup moved to the LMS Admin Studio (v2.8.35.0 — module isolation:
 * the website Admin Studio manages the WEBSITE; LMS operations live at
 * /lms-admin with the LMS team's own accounts).
 */
export default function AdminLmsSetupRedirect() {
  redirect("/lms-admin/manage");
}
