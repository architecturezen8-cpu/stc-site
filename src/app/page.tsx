import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { PrincipalMessage } from "@/components/principal-message";
import { AboutUs } from "@/components/about-us";
import { NewsEvents } from "@/components/news-events";
import { Academics } from "@/components/academics";
import { Footer } from "@/components/footer";
import { EditableSection } from "@/components/cms/editable-section";
import { LiveSiteEditor } from "@/components/admin/live-site-editor";
import { getAdminSession } from "@/lib/admin-auth";
import { getCmsPage } from "@/lib/cms";
import { getCmsPageDefinition } from "@/lib/cms-defaults";
import { VisualBlockSections } from "@/components/cms/visual-block-sections";

export const dynamic = "force-dynamic";

const ADMIN_PKCE_COOKIE = "stc_admin_pkce";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  /* OAuth SAFETY NET — if Supabase ever redirects to the Site URL root
     instead of the real callback (redirect_to allowlist miss), the PKCE
     code lands here as /?code=… and the sign-in would die silently. The
     PKCE verifier cookie is still alive in the browser, so forwarding the
     query to the matching callback COMPLETES the login as intended. */
  if (sp.code || sp.error) {
    const store = await cookies();
    const adminFlow = Boolean(store.get(ADMIN_PKCE_COOKIE)?.value);
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (typeof value === "string") qs.set(key, value);
    }
    const target = adminFlow
      ? "/api/admin/auth/google/callback"
      : "/api/portal/auth/oauth/callback";
    const query = qs.toString();
    redirect(query ? `${target}?${query}` : target);
  }

  const { cmsPreview, cmsEditor, edit } = sp;
  const session = await getAdminSession();
  const preview = cmsPreview === "1" && Boolean(session);
  // Only cmsEditor=1 opens the section editor; visualEditor=1 is the pure
  // element-level visual editor and must not mount the section toolbar.
  const editor = cmsEditor === "1" && Boolean(session);
  const draftMode = preview || editor;
  const editable = draftMode && edit === "1";
  const page = await getCmsPage("home", draftMode ? "draft" : "published");
  const definition = getCmsPageDefinition("home");

  const components: Record<string, (data: Record<string, string>) => React.ReactNode> = {
    hero: (data) => <Hero content={data} />,
    principal: (data) => <PrincipalMessage content={data} />,
    about: (data) => <AboutUs content={data} />,
    news: (data) => <NewsEvents content={data} />,
    academics: (data) => <Academics content={data} />,
  };

  return (
    <main id="home" className="relative bg-surface text-fg">
      <Navbar />
      <div className="flex flex-col">
        {page?.sections.map((section) => (
          <EditableSection
            key={section.key}
            sectionKey={section.key}
            label={section.label}
            preview={draftMode}
            editable={editable}
            hidden={section.hidden}
          >
            {components[section.key]?.(section.data)}
          </EditableSection>
        ))}
      </div>
      <VisualBlockSections path="/" />
      <Footer />
      {editor && page && definition && (
        <LiveSiteEditor initialPage={page} definition={definition} />
      )}
    </main>
  );
}
