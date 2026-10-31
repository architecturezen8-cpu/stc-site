"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Link2,
  Loader2,
  Menu as MenuIcon,
  Plus,
  Trash2,
  X,
} from "lucide-react";

/**
 * v2.9.0.0 — Admin Studio → Navigation.
 * v2.9.2.0 — ADMIN-ONLY POLICY: this section is now the ONLY editor of the
 * menu. The navbar (desktop + mobile) renders from the site_nav_links
 * table; the on-site visual editor no longer touches menu items at all —
 * clicking one there simply points back to this section — so there is
 * exactly one editor for one source of truth and nothing can corrupt.
 */

type NavRow = {
  id: number;
  label: string;
  href: string;
  parentId: number | null;
  sortOrder: number;
};

const input =
  "h-10 w-full rounded-xl border border-white/12 bg-white/[0.055] px-3.5 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

export function NavigationManager() {
  const [items, setItems] = useState<NavRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | "new" | "new-child" | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingTop, setAddingTop] = useState(false);
  const [topForm, setTopForm] = useState({ label: "", href: "" });
  const [childForm, setChildForm] = useState({ label: "", href: "" });

  const load = useCallback(() => {
    return fetch("/api/admin/navigation", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setError("Could not load the menu."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const tops = useMemo(
    () => items.filter((item) => item.parentId === null),
    [items],
  );
  const childrenOf = useCallback(
    (parentId: number) =>
      items
        .filter((item) => item.parentId === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [items],
  );

  const patchItem = async (id: number, item: Partial<NavRow>, message?: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/navigation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, item }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update the menu item.");
      await load();
      if (message) setToast(message);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the menu item.");
      await load();
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const moveItem = async (row: NavRow, direction: -1 | 1) => {
    const siblings = (row.parentId === null ? tops : childrenOf(row.parentId)).slice();
    const index = siblings.findIndex((sibling) => sibling.id === row.id);
    const neighbour = siblings[index + direction];
    if (!neighbour) return;
    setBusyId(row.id);
    try {
      await Promise.all([
        fetch("/api/admin/navigation", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id, item: { sortOrder: neighbour.sortOrder } }),
        }),
        fetch("/api/admin/navigation", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: neighbour.id, item: { sortOrder: row.sortOrder } }),
        }),
      ]);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const removeItem = async (row: NavRow) => {
    const kids = row.parentId === null ? childrenOf(row.id) : [];
    const warning = kids.length
      ? `Remove "${row.label}" and its ${kids.length} submenu item${kids.length === 1 ? "" : "s"}?`
      : `Remove "${row.label}" from the menu?`;
    if (!window.confirm(warning)) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/navigation?id=${row.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not remove the menu item.");
      await load();
      setToast(`"${row.label}" removed from the menu.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the menu item.");
    } finally {
      setBusyId(null);
    }
  };

  const addItem = async (parentId: number | null) => {
    const form = parentId === null ? topForm : childForm;
    if (!form.label.trim() || !form.href.trim()) {
      setError("Label and link are both required.");
      return;
    }
    setError(null);
    const siblings = parentId === null ? tops : childrenOf(parentId);
    const nextOrder = siblings.length ? Math.max(...siblings.map((s) => s.sortOrder)) + 10 : 10;
    setBusyId(parentId === null ? "new" : "new-child");
    try {
      const res = await fetch("/api/admin/navigation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, parentId, sortOrder: nextOrder }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not add the menu item.");
      if (parentId === null) setTopForm({ label: "", href: "" });
      else setChildForm({ label: "", href: "" });
      await load();
      setToast(`"${json.item?.label ?? form.label}" added to the menu.`);
      if (parentId !== null) setExpanded(parentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the menu item.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
        <Loader2 className="animate-spin text-[#ffd444]" size={22} />
      </div>
    );
  }

  const renderRow = (row: NavRow, siblings: NavRow[], isChild: boolean) => {
    const index = siblings.findIndex((sibling) => sibling.id === row.id);
    const kids = isChild ? [] : childrenOf(row.id);
    const isOpen = expanded === row.id;
    return (
      <div
        key={row.id}
        className={`rounded-2xl border border-white/10 bg-white/[0.03] ${
          isChild ? "ml-4 border-l-2 border-l-[#ffd444]/40 p-4" : "p-4 sm:p-5"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#ffd444]/12 text-[#ffd444]">
            {isChild ? <Link2 size={14} /> : <MenuIcon size={14} />}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <input
              value={row.label}
              onChange={(event) =>
                setItems((rows) =>
                  rows.map((r) =>
                    r.id === row.id ? { ...r, label: event.target.value } : r,
                  ),
                )
              }
              onBlur={(event) => {
                /* v2.9.2.0 — BUGFIX (the owner: "eke danata thiyana sub menuth
                   edit karanna puluwan wenna ona"): the old guard compared
                   against `row.label`, but the controlled input's onChange
                   had ALREADY updated row.label — so the guard never fired
                   and label edits silently never saved. The original value
                   is now captured on FOCUS and compared against that. */
                const value = event.target.value.trim();
                const original = event.target.dataset.original ?? row.label;
                if (value && value !== original) {
                  void patchItem(row.id, { label: value }, "Menu label updated.");
                }
              }}
              onFocus={(event) => {
                event.target.dataset.original = row.label;
              }}
              placeholder="Menu label"
              className={input}
              aria-label={`${isChild ? "Submenu" : "Menu"} item label`}
            />
            <input
              value={row.href}
              onChange={(event) =>
                setItems((rows) =>
                  rows.map((r) =>
                    r.id === row.id ? { ...r, href: event.target.value } : r,
                  ),
                )
              }
              onBlur={(event) => {
                /* v2.9.2.0 — same BUGFIX as the label field above: compare
                   against the value captured on FOCUS, not the live row. */
                const value = event.target.value.trim();
                const original = event.target.dataset.original ?? row.href;
                if (value && value !== original) {
                  void patchItem(row.id, { href: value }, "Menu link updated.");
                }
              }}
              onFocus={(event) => {
                event.target.dataset.original = row.href;
              }}
              placeholder="/page or https://…"
              className={`${input} font-mono text-[11.5px]`}
              aria-label={`${isChild ? "Submenu" : "Menu"} item link`}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => void moveItem(row, -1)}
              disabled={index === 0 || busyId === row.id}
              aria-label={`Move ${row.label} up`}
              title="Move up"
              className="grid h-8 w-8 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-25"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={() => void moveItem(row, 1)}
              disabled={index === siblings.length - 1 || busyId === row.id}
              aria-label={`Move ${row.label} down`}
              title="Move down"
              className="grid h-8 w-8 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-25"
            >
              <ChevronDown size={14} />
            </button>
            <button
              onClick={() => void removeItem(row)}
              disabled={busyId === row.id}
              aria-label={`Remove ${row.label}`}
              title="Remove"
              className="grid h-8 w-8 place-items-center rounded-lg text-white/40 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-25"
            >
              {busyId === row.id ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Trash2 size={13} />
              )}
            </button>
          </div>
        </div>

        {!isChild && (
          <div className="mt-3 border-t border-white/8 pt-3">
            <button
              onClick={() => setExpanded(isOpen ? null : row.id)}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3.5 py-1.5 text-[10.5px] font-semibold text-white/55 hover:border-white/30 hover:text-white"
            >
              {isOpen ? <X size={11} /> : <Plus size={11} />}
              {isOpen ? "Hide submenu" : `Submenu (${kids.length})`}
            </button>
            {isOpen && (
              <div className="mt-3 space-y-2.5">
                {kids.map((kid) =>
                  renderRow(kid, kids, true),
                )}
                <div className="rounded-xl border border-dashed border-white/15 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input
                      value={childForm.label}
                      onChange={(event) =>
                        setChildForm((form) => ({ ...form, label: event.target.value }))
                      }
                      placeholder="Submenu label"
                      className={input}
                      aria-label="New submenu label"
                    />
                    <input
                      value={childForm.href}
                      onChange={(event) =>
                        setChildForm((form) => ({ ...form, href: event.target.value }))
                      }
                      placeholder="/page or https://…"
                      className={`${input} font-mono text-[11.5px]`}
                      aria-label="New submenu link"
                    />
                    <button
                      onClick={() => void addItem(row.id)}
                      disabled={busyId === "new-child"}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ffd444] px-4 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
                    >
                      {busyId === "new-child" ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Plus size={13} />
                      )}
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.62fr]">
      <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">
          Navbar · desktop + mobile
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em]">
          Main navigation
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/45">
          Every menu item shown in the site navbar and the mobile fullscreen
          menu — main items AND submenu items. Changes go live immediately.
          This is the ONLY place the menu can be edited: the on-site visual
          editor points here, so there is exactly one source of truth.
        </p>

        {error && (
          <div className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {tops.map((top) => renderRow(top, tops, false))}
        </div>

        <div className="mt-6 rounded-2xl border border-dashed border-white/15 p-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              value={topForm.label}
              onChange={(event) =>
                setTopForm((form) => ({ ...form, label: event.target.value }))
              }
              placeholder="New top-level label (e.g. Admissions)"
              className={input}
              aria-label="New menu item label"
            />
            <input
              value={topForm.href}
              onChange={(event) =>
                setTopForm((form) => ({ ...form, href: event.target.value }))
              }
              placeholder="/page or https://…"
              className={`${input} font-mono text-[11.5px]`}
              aria-label="New menu item link"
            />
            <button
              onClick={() => void addItem(null)}
              disabled={busyId === "new"}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ffd444] px-4 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
            >
              {busyId === "new" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Plus size={13} />
              )}
              Add item
            </button>
          </div>
        </div>
      </section>

      <aside className="min-w-0 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-[#0d0d0b] p-6">
          <p className="text-[9px] uppercase tracking-[0.25em] text-[#ffd444]">
            How this works
          </p>
          <ul className="mt-4 space-y-3 text-[12px] leading-relaxed text-white/50">
            <li className="flex gap-2.5">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-300" />
              Edits are LIVE the moment the field loses focus — no publish step.
            </li>
            <li className="flex gap-2.5">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-300" />
              The menu is edited ONLY here. Clicking a menu item in the
              on-site visual editor simply points to this section — one
              editor, one source, nothing corrupts.
            </li>
            <li className="flex gap-2.5">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-300" />
              Removing a top-level item removes its submenu with it.
            </li>
            <li className="flex gap-2.5">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-300" />
              Links accept local paths (/admissions), in-page anchors
              (/#about) and full HTTPS URLs.
            </li>
          </ul>
        </div>
        <div className="rounded-2xl border border-[#ffd444]/25 bg-[#ffd444]/[0.06] p-6">
          <p className="text-[11px] font-semibold text-[#ffd444]">
            Menu order tip
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-white/50">
            Use the ↑ / ↓ arrows to reorder. The order here is exactly the
            order visitors see — top to bottom on mobile, left to right on
            desktop.
          </p>
        </div>
      </aside>
    </div>
  );
}
