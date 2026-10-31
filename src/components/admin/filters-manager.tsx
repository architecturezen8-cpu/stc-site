"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  Image as ImageIcon,
  Loader2,
  Newspaper,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from "lucide-react";

type ManagedCategory = { name: string; count: number; source: string };

type Managed = Record<string, ManagedCategory[]>;

const TABS = [
  { key: "news", label: "News & Stories", icon: Newspaper, addLabel: "Add category", hint: "Filter chips on the public News page and in the news manager." },
  { key: "gallery", label: "Campus Gallery", icon: ImageIcon, addLabel: "Add collection", hint: "Collection chips on the Campus Gallery page." },
  { key: "event", label: "Events", icon: SlidersHorizontal, addLabel: "Add category", hint: "Category filter on the events calendar." },
  { key: "resources", label: "Resources", icon: SlidersHorizontal, addLabel: "Add category", hint: "Category filter in the Online Resources browser." },
  { key: "staff", label: "Staff Departments", icon: Users, addLabel: "Add department", hint: "Department filter on the Staff page." },
] as const;

export function FiltersManager({ initialTab }: { initialTab?: string }) {
  const searchParams = useSearchParams();
  const validTab = (value: string | null | undefined) =>
    TABS.some((t) => t.key === value) ? (value as string) : "news";
  const [tab, setTab] = useState(validTab(initialTab ?? searchParams.get("tab")));

  const [managed, setManaged] = useState<Managed>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  /** Delete confirmation: category + where its items should go. */
  const [deleting, setDeleting] = useState<{ name: string; count: number } | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/collections", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        setManaged(json.managed ?? {});
        setError(json.error ?? null);
      })
      .catch(() => setError("Unable to load filters."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    /* Deferred a tick — load() sets state synchronously and effects must not. */
    const t = window.setTimeout(load, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const categories = useMemo(() => managed[tab] ?? [], [managed, tab]);
  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0];

  const addCategory = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: tab, name: newName.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setToast(`"${json.name}" added to ${activeTab.label}.`);
        setNewName("");
        load();
      } else {
        setToast(json.error ?? "Failed to add.");
      }
    } catch {
      setToast("Network error — could not add the category.");
    } finally {
      setBusy(false);
    }
  };

  const startRename = (name: string) => {
    setRenaming(name);
    setRenameValue(name);
  };

  const commitRename = async () => {
    if (!renaming) return;
    const to = renameValue.trim().replace(/\s+/g, " ");
    if (!to || to === renaming) {
      setRenaming(null);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: tab, from: renaming, to }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setToast(
          json.moved > 0
            ? `Renamed to "${to}" — ${json.moved} item${json.moved === 1 ? "" : "s"} updated.`
            : `Renamed to "${to}".`,
        );
        setRenaming(null);
        load();
      } else {
        setToast(json.error ?? "Rename failed.");
      }
    } catch {
      setToast("Network error — could not rename.");
    } finally {
      setBusy(false);
    }
  };

  const requestDelete = (cat: ManagedCategory) => {
    const others = categories.filter((c) => c.name !== cat.name);
    setDeleting({ name: cat.name, count: cat.count });
    setMoveTo(cat.count > 0 ? (others.find((o) => o.count !== undefined)?.name ?? "") : "");
  };

  const commitDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/collections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tab,
          name: deleting.name,
          moveTo: deleting.count > 0 ? moveTo : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setToast(
          json.moved
            ? `"${deleting.name}" removed — its items moved to "${json.moved}".`
            : `"${deleting.name}" removed from the filters.`,
        );
        setDeleting(null);
        load();
      } else if (res.status === 409) {
        setToast(`In use by ${json.count} item${json.count === 1 ? "" : "s"} — pick where they should go.`);
      } else {
        setToast(json.error ?? "Delete failed.");
      }
    } catch {
      setToast("Network error — could not remove.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[11px] font-semibold transition-colors ${
                active
                  ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                  : "border-white/12 text-white/55 hover:border-white/35 hover:text-white"
              }`}
            >
              <Icon size={13} /> {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] leading-none ${
                  active ? "bg-black/15 text-[#0b0b0a]" : "bg-white/10 text-white/45"
                }`}
              >
                {(managed[t.key] ?? []).length}
              </span>
            </button>
          );
        })}
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em]">
              {activeTab.label} — filter options
            </h2>
            <p className="mt-1 text-[12.5px] text-white/45">{activeTab.hint}</p>
          </div>

          {/* Add */}
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              placeholder={activeTab.addLabel}
              className="h-10 w-48 rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444] sm:w-56"
            />
            <button
              onClick={addCategory}
              disabled={busy || newName.trim().length < 2}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ffd444] px-4 text-[11.5px] font-semibold text-[#0b0b0a] disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-8 grid place-items-center py-10 text-white/40">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : error ? (
          <p className="mt-6 rounded-xl bg-red-400/10 px-4 py-3 text-[12px] text-red-300">{error}</p>
        ) : (
          <div className="mt-6 space-y-2.5">
            {categories.map((cat) => (
              <div
                key={cat.name}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
              >
                {renaming === cat.name ? (
                  <>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-[#ffd444]/50 bg-white/[0.05] px-3 text-[12.5px] text-white outline-none"
                    />
                    <button
                      onClick={commitRename}
                      disabled={busy}
                      className="grid h-9 w-9 place-items-center rounded-lg bg-[#ffd444] text-[#0b0b0a] disabled:opacity-50"
                      aria-label="Save name"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setRenaming(null)}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-white/12 text-white/50 hover:text-white"
                      aria-label="Cancel rename"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    {/* Name + "default" badge sit side by side and wrap to a
                        second row on narrow screens — the badge can no longer
                        be truncated away (mobile visibility fix). */}
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      <span className="min-w-0 max-w-full truncate text-[13px] font-medium text-white">
                        {cat.name}
                      </span>
                      {cat.source === "default" && (
                        <span className="shrink-0 rounded-full border border-white/15 bg-white/[0.09] px-2.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.14em] text-white/60">
                          Default
                        </span>
                      )}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tabular-nums ${
                        cat.count > 0 ? "bg-[#ffd444]/15 text-[#ffd444]" : "bg-white/[0.06] text-white/30"
                      }`}
                    >
                      {cat.count} item{cat.count === 1 ? "" : "s"}
                    </span>
                    <button
                      onClick={() => startRename(cat.name)}
                      aria-label={`Rename ${cat.name}`}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-white/12 text-white/55 transition-colors hover:border-white/35 hover:text-white"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => requestDelete(cat)}
                      aria-label={`Remove ${cat.name}`}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-white/12 text-white/50 transition-colors hover:border-red-400/50 hover:text-red-300"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            ))}
            {categories.length === 0 && (
              <p className="py-6 text-center text-[12.5px] text-white/35">
                No filter options yet — add the first one above.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Delete / move modal */}
      {deleting && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#121210] p-6 text-white shadow-2xl">
            <h3 className="font-display text-lg font-semibold">
              Remove &ldquo;{deleting.name}&rdquo;?
            </h3>
            {deleting.count > 0 ? (
              <>
                <p className="mt-2 text-[12.5px] leading-relaxed text-white/50">
                  {deleting.count} item{deleting.count === 1 ? "" : "s"} still use this
                  category. Choose where they should move — the public filters update
                  everywhere instantly.
                </p>
                <select
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                  className="mt-4 h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-3.5 text-[13px] text-white outline-none focus:border-[#ffd444]"
                >
                  <option value="">Select target category…</option>
                  {categories
                    .filter((c) => c.name !== deleting.name)
                    .map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </>
            ) : (
              <p className="mt-2 text-[12.5px] leading-relaxed text-white/50">
                This filter option is not used by any item. Removing it only changes
                the filter list — nothing else is affected.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleting(null)}
                className="rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={commitDelete}
                disabled={busy || (deleting.count > 0 && !moveTo)}
                className="inline-flex items-center gap-2 rounded-full bg-red-400 px-5 py-2 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                {deleting.count > 0 ? `Move & remove` : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[250] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#ffd444] px-5 py-3 text-[12px] font-semibold text-[#0b0b0a] shadow-2xl lg:bottom-7">
          <Check size={14} /> {toast}
        </div>
      )}
    </div>
  );
}
