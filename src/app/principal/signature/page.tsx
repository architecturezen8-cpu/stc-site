import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { HeroRow } from "@/components/portal/dashboard-widgets";
import { SignatureStudio } from "@/components/portal/signature-studio";
import { requirePortal } from "@/lib/portal-auth";

export const metadata: Metadata = {
  title: "Signature & seal | Principal Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.63.0 — the Principal's one-time stamp setup. Upload here once;
 * every certification afterwards stamps these onto sheets server-side.
 */
export default async function PrincipalSignaturePage() {
  const session = await requirePortal("principal");

  return (
    <PortalShell
      role="principal"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/principal" },
        { label: "Certify", href: "/principal/report-card" },
        { label: "Signature", href: "/principal/signature", active: true },
        { label: "Profile", href: "/principal/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1000px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Principal · one-time setup"
          firstName={session.fullName.trim().split(/\s+/)[0] || "Principal"}
          secondaryLabel="Stamps"
          secondaryValue="Signature + college seal"
          ctaLabel="Certification queue"
          ctaHref="/principal/report-card"
        />
        <SignatureStudio
          role="principal"
          session={{ accountId: session.accountId }}
        />
      </div>
    </PortalShell>
  );
}
