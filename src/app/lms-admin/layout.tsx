import type { ReactNode } from "react";

/**
 * LMS Admin Studio layout — opts the studio out of any public-site chrome
 * the same way /admin does. The studio theme boot script lives in the ROOT
 * layout <head> (this layout renders inside <body>, where React never
 * executes script tags on client navigations — see dev.log warning).
 */
export default function LmsAdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
