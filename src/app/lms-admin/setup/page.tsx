import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LmsAdminSetupForm } from "@/components/lms-admin/setup-form";
import { lmsAdminSetupAvailable } from "@/lib/lms-admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "LMS Admin Setup · St. Thomas' College Matale",
};

export default async function LmsAdminSetupPage() {
  // The one-time screen closes the moment the first lms_admin exists.
  if (!(await lmsAdminSetupAvailable())) redirect("/lms-admin/login");

  return (
    <div className="lms-admin-scope flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <LmsAdminSetupForm />
    </div>
  );
}
