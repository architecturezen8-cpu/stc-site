import type { Metadata } from "next";
import { PortalProfilePage } from "@/components/portal/portal-profile-page";

export const metadata: Metadata = {
  title: "Profile | Student Portal — St. Thomas' College, Matale",
};

export const dynamic = "force-dynamic";

export default function StudentProfilePage() {
  return <PortalProfilePage role="student" />;
}
