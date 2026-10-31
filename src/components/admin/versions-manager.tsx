"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  History,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { APP_VERSION_LABEL } from "@/lib/app-version";
import { useDebouncedValue } from "@/lib/use-debounced-value";

type Entry = {
  id: number;
  action: string;
  entity: string;
  entityId: string | null;
  details: unknown;
  createdAt: string;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
};

/** Human sentences for every recorded action. */
function describe(action: string, entity: string, entityId: string | null): string {
  const who = entityId ? ` #${entityId}` : "";
  const map: Record<string, string> = {
    login: "Signed in to Admin Studio",
    first_admin_created: "Created the first admin account",
    create_staff: `Added an educator${who}`,
    update_staff: `Updated an educator${who}`,
    delete_staff: `Removed an educator${who}`,
    reorder: `Reordered ${entity.replace("_", " ")}${who}`,
    create_post: `Created a news story${who}`,
    update_post: `Updated a news story${who}`,
    delete_post: `Deleted a news story${who}`,
    create_event: `Created an event${who}`,
    update_event: `Updated an event${who}`,
    delete_event: `Deleted an event${who}`,
    create_gallery_item: `Added a campus gallery photo${who}`,
    update_gallery_item: `Updated a campus gallery photo${who}`,
    delete_gallery_item: `Removed a campus gallery photo${who}`,
    create_unit_gallery_item: `Added a unit gallery photo${who}`,
    update_resource: `Updated an online resource${who}`,
    create_resource: `Added an online resource${who}`,
    delete_resource: `Removed an online resource${who}`,
    create_collection: `Created a category${who}`,
    delete_collection: `Deleted a category${who}`,
    create_visual_block: `Added a visual block${who}`,
    update_visual_block: `Updated a visual block${who}`,
    delete_visual_block: `Removed a visual block${who}`,
    save_visual_patch: `Edited content on the site${who}`,
    publish_visual_page: `Published page edits${who}`,
    publish_snapshot: "Published the site",
    save_draft: "Saved a draft",
    publish: "Published changes",
    discard: "Discarded a draft",
    restore: "Restored content",
    restore_revision: `Restored a revision${who}`,
    upload_media: `Uploaded media${who}`,
    update_media: `Updated media details${who}`,
    trash_media: `Moved media to trash${who}`,
    save_logo_draft: `Saved a logo draft${who}`,
    publish_logo: `Published logo changes${who}`,
    revert_logo: `Reverted a logo to its published version${who}`,
    update_profile: "Updated their profile",
    change_password: "Changed their password",
    update_cadet_intro: `Updated a cadeting preloader${who}`,
    reset_cadet_intro: `Reset a cadeting preloader to defaults${who}`,
    save_settings: "Saved site settings",
  };
  if (map[action]) return map[action];
  const pretty = action.replaceAll("_", " ");
  return `${pretty.charAt(0).toUpperCase()}${pretty.slice(1)} · ${entity}${who}`;
}

const ENTITY_LABELS: Record<string, string> = {
  settings: "Settings",
  cms_section: "Page content",
  cms_page: "Pages",
  staff: "Faculty & Staff",
  post: "News & Stories",
  event: "Events",
  gallery_item: "Campus Gallery",
  unit_gallery: "Unit Galleries",
  resource: "Resources",
  collection: "Categories",
  visual_block: "Visual blocks",
  visual_patch: "On-page edits",
  media: "Media Library",
  logo: "Logos & Crests",
  cadet_intro: "Preloaders",
  admin_user: "Admin account",
  admin_session: "Sign-ins",
};

const ACTION_STYLES: Record<string, string> = {
  create: "bg-emerald-400/10 text-emerald-300",
  upload: "bg-emerald-400/10 text-emerald-300",
  update: "bg-[#ffd444]/10 text-[#ffd444]",
  save: "bg-[#ffd444]/10 text-[#ffd444]",
  publish: "bg-[#ffd444]/15 text-[#ffd444]",
  delete: "bg-red-500/10 text-red-300",
  trash: "bg-red-500/10 text-red-300",
  restore: "bg-sky-400/10 text-sky-300",
  discard: "bg-white/10 text-white/50",
  login: "bg-white/10 text-white/60",
};

function actionBadge(action: string) {
  const prefix = action.split("_")[0];
  return ACTION_STYLES[prefix] ?? "bg-white/10 text-white/60";
}

function shortDetails(details: unknown): string | null {
  if (details === null || details === undefined) return null;
  try {
    const text = typeof details === "string" ? details : JSON.stringify(details);
    return text.length > 110 ? `${text.slice(0, 110)}…` : text;
  } catch {
    return null;
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export function VersionsManager() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState("");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (entity) params.set("entity", entity);
      const res = await fetch(`/api/admin/audit?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setEntries(json.entries ?? []);
        setTotal(json.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    // Defer the first fetch to a macrotask so no setState happens
    // synchronously inside the effect body.
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const entityOptions = useMemo(() => {
    const set = new Set(entries.map((e) => e.entity));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.action, e.entity, e.entityId ?? "", e.userName ?? "", describe(e.action, e.entity, e.entityId)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [entries, debouncedQuery]);

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    filtered.forEach((e) => {
      const day = new Date(e.createdAt).toLocaleDateString("en-GB");
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(e);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-white/35">
            <History size={11} /> Site version
          </p>
          <p className="mt-2 font-display text-2xl font-semibold text-[#ffd444]">{APP_VERSION_LABEL.replace("Version ", "v")}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-white/35">
            <Activity size={11} /> Recorded changes
          </p>
          <p className="mt-2 font-display text-2xl font-semibold text-white">{total.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/35">Showing</p>
          <p className="mt-2 font-display text-2xl font-semibold text-white">{filtered.length.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="flex h-11 flex-1 items-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.05] px-3.5">
            <Search size={14} className="shrink-0 text-white/35" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search changes…"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-white outline-none placeholder:text-white/30"
            />
          </label>
          <button
            onClick={() => void load()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-[11.5px] text-white/60 hover:border-white/35 hover:text-white"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setEntity("")}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[9.5px] font-medium uppercase tracking-[0.12em] transition-colors ${
              entity === "" ? "border-transparent bg-[#ffd444] text-[#0b0b0a]" : "border-white/12 text-white/45 hover:text-white"
            }`}
          >
            Everything
          </button>
          {entityOptions.map((name) => (
            <button
              key={name}
              onClick={() => setEntity(name)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[9.5px] font-medium uppercase tracking-[0.12em] transition-colors ${
                entity === name ? "border-transparent bg-[#ffd444] text-[#0b0b0a]" : "border-white/12 text-white/45 hover:text-white"
              }`}
            >
              {ENTITY_LABELS[name] ?? name.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        {loading && !entries.length ? (
          <div className="grid h-48 place-items-center text-white/35">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : groups.length ? (
          <div className="hscroll max-h-[62svh] space-y-6 overflow-y-auto pr-2.5">
            {groups.map(([day, dayEntries]) => (
              <div key={day}>
                <p className="sticky top-0 z-10 -mx-1 bg-[#0f0f0d]/95 px-1 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45 backdrop-blur-sm">
                  {formatDay(dayEntries[0].createdAt)}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {dayEntries.map((e) => (
                    <li
                      key={e.id}
                      className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <span className="w-full shrink-0 font-mono text-[10px] text-white/40 sm:w-20">
                        {formatTime(e.createdAt)}
                      </span>
                      <span className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] ${actionBadge(e.action)}`}>
                        {e.entity === "admin_session" ? "account" : ENTITY_LABELS[e.entity] ?? e.entity.replaceAll("_", " ")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] text-white/85">{describe(e.action, e.entity, e.entityId)}</p>
                        {shortDetails(e.details) && (
                          <p className="truncate font-mono text-[9.5px] text-white/30">{shortDetails(e.details)}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10.5px] text-white/45">
                        {e.userName ? e.userName : "System"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 py-14 text-center">
            <p className="text-sm text-white/40">No changes recorded for this filter yet.</p>
            <p className="mt-1 text-[11px] text-white/25">Every edit made in Admin Studio appears here automatically.</p>
          </div>
        )}
      </div>
    </div>
  );
}
