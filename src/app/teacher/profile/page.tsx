import type { Metadata } from "next";
import { PortalProfilePage } from "@/components/portal/portal-profile-page";

export const metadata: Metadata = {
  title: "Profile | Teacher Portal — St. Thomas' College, Matale",
};

export const dynamic = "force-dynamic";

export default function TeacherProfilePage() {
  return <PortalProfilePage role="teacher" />;
}
