"use client";

import { createContext, useContext } from "react";
import type { AdminModule } from "@/lib/admin-roles";

/**
 * v2.9.12.1 — READ-ONLY ENFORCEMENT FOR THE UI (the owner: "viewer dunnath
 * ekata eka edit karanna access thiyanawa").
 *
 * The server APIs already refuse every mutation a read-only account makes,
 * but the studio's managers still RENDERED their edit controls — a viewer
 * could open editors and only hit 403 toasts at save time. AdminShell now
 * resolves the CURRENT page's module from the sidebar map, resolves
 * canEdit = effectiveCan(role, permissions, module, "edit"), and publishes
 * it here. Every manager reads it with useAdminAccess() and hides its
 * create/edit/delete controls for viewers.
 */

export type AdminAccessValue = {
  /** The sidebar module owning the current path (null = no match). */
  module: AdminModule | null;
  /** False when the signed-in account holds only VIEW on this module. */
  canEdit: boolean;
};

/* Default keeps every consumer working outside a provider (tests, pages
   rendered without the shell) — fail OPEN at compile time, while the real
   server guards stay the source of truth at runtime. */
const AdminAccessContext = createContext<AdminAccessValue>({
  module: null,
  canEdit: true,
});

export function useAdminAccess(): AdminAccessValue {
  return useContext(AdminAccessContext);
}

export const AdminAccessProvider = AdminAccessContext.Provider;
