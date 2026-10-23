import type { Metadata } from "next";
import { PortalProfilePage } from "@/components/portal/portal-profile-page";

export const metadata: Metadata = {
  title: "Profile | Principal Portal · St. Thomas' College, Matale",
};

/** v2.8.63.0 — the shared profile page, wearing the Principal portal. */
export default function PrincipalProfilePage() {
  return <PortalProfilePage role="principal" />;
}
