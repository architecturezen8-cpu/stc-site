"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_NAV_LINKS, type NavItem } from "@/lib/site-nav-defs";

/**
 * v2.9.0.0 — server-delivered navigation. The root layout resolves the
 * admin-managed tree ON THE SERVER and hands it down through this context,
 * so the real menu is inside the first HTML byte (same proven pattern as
 * the crest). The navbar + mobile menu render from it; Admin → Navigation
 * edits and visual-editor writes both land in the same DB rows, and any
 * change re-renders the layout (router.refresh / next navigation).
 */

const SiteNavContext = createContext<NavItem[]>(DEFAULT_NAV_LINKS);

export function SiteNavProvider({
  navTree,
  children,
}: {
  navTree: NavItem[];
  children: ReactNode;
}) {
  const [items, setItems] = useState<NavItem[]>(
    navTree.length > 0 ? navTree : DEFAULT_NAV_LINKS,
  );

  /* Keep an open tab in sync: a gentle poll picks up Admin → Navigation
     edits made elsewhere without a reload. The functional update keeps the
     current tree when the server returned nothing new, so the canvas
     never flickers. */
  useEffect(() => {
    let alive = true;
    const pull = () => {
      fetch("/api/site-nav", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (!alive || !json?.items?.length) return;
          setItems((current) =>
            JSON.stringify(current) === JSON.stringify(json.items)
              ? current
              : json.items,
          );
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(pull, 20000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <SiteNavContext.Provider value={items}>{children}</SiteNavContext.Provider>
  );
}

/** The published menu tree (falls back to the original hardcoded menu). */
export function useSiteNav(): NavItem[] {
  return useContext(SiteNavContext);
}
