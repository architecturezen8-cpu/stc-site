import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Studio — St. Thomas' College",
  robots: { index: false, follow: false },
};

/**
 * Theme bootstrap — runs SYNCHRONOUSLY before the admin paints, so a saved
 * colour theme (violet/royal/dark) can never flash the gold default on
 * reload. Order: cookie (set by the theme API, per device) → localStorage
 * (older saves). The attribute on <html> drives the same [data-admin-theme]
 * CSS the shell div drives after hydration — both stay in sync.
 */
const THEME_BOOTSTRAP = `(function(){try{
var m=document.cookie.match(/(?:^|; )stc-admin-theme=([^;]*)/);
var t=m?decodeURIComponent(m[1]):"";
if(!/^(gold|royal|violet|dark)$/.test(t)){t="";try{t=window.localStorage.getItem("stc-admin-theme")||""}catch(e){}}
if(/^(gold|royal|violet|dark)$/.test(t)){document.documentElement.setAttribute("data-admin-theme",t);}
}catch(e){}})();`;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      {children}
    </>
  );
}
