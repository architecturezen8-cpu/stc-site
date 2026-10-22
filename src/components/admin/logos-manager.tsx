"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  History,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { MediaLibraryButton } from "@/components/admin/media-picker";

/** v2.8.60.0 — brand logos save-and-publish in ONE step (no draft trap). */
const BRAND_GROUP = "brand";

type LogoAsset = {
  id: number;
  logoKey: string;
  label: string;
  group: string;
  draftSrc: string;
  publishedSrc: string;
  draftScale: number;
  publishedScale: number;
};

type Group = { id: string; label: string };

export function LogosManager() {
  const [logos, setLogos] = useState<LogoAsset[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState(BRAND_GROUP);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editSrc, setEditSrc] = useState("");
  const [editScale, setEditScale] = useState(100);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = () => {
    return fetch("/api/admin/logos", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setLogos(data.logos ?? []);
        setGroups(data.groups ?? []);
        setPending(data.pending ?? 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const isDirty = (logo: LogoAsset) =>
    logo.draftSrc !== logo.publishedSrc || logo.draftScale !== logo.publishedScale;

  const visible = useMemo(
    () =>
      logos.filter(
        (logo) =>
          logo.group === activeGroup &&
          (!query || logo.label.toLowerCase().includes(query.toLowerCase())),
      ),
    [logos, activeGroup, query],
  );

  const openEditor = (logo: LogoAsset) => {
    setEditingKey(logo.logoKey);
    setEditSrc(logo.draftSrc);
    setEditScale(logo.draftScale);
  };

  const saveLogo = async (logoKey: string, publish = false) => {
    setBusy(logoKey);
    try {
      const logo = logos.find((l) => l.logoKey === logoKey);
      /* v2.8.59.1 — an empty URL box no longer wipes the logo by accident:
         the server keeps the existing image (scale-only save), and the
         toast says so honestly. Removing a logo stays a deliberate action
         via the Remove button. */
      const keepEmptyWarning =
        !editSrc.trim() && Boolean(logo?.draftSrc || logo?.publishedSrc);
      const res = await fetch("/api/admin/logos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoKey, src: editSrc, scale: editScale, publish }),
      });
      const json = await res.json();
      if (res.ok) {
        await load();
        setEditingKey(null);
        setToast(
          keepEmptyWarning
            ? "URL box was empty — the existing image was KEPT (size updated). Use Remove to clear a logo."
            : publish
              ? "Logo published — live on every page"
              : "Logo draft saved — use Publish to make it live",
        );
      } else setToast(json.error ?? "Unable to save the logo.");
    } finally {
      setBusy(null);
    }
  };

  const logoAction = async (logoKey: string, action: "publish" | "revert") => {
    setBusy(`${logoKey}:${action}`);
    try {
      const res = await fetch("/api/admin/logos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoKey, action }),
      });
      if (res.ok) {
        await load();
        setToast(action === "publish" ? "Logo published everywhere" : "Draft reverted");
      }
    } finally {
      setBusy(null);
    }
  };

  const clearLogo = async (logoKey: string) => {
    if (!window.confirm("Remove this logo image? The initials will show again.")) return;
    setBusy(logoKey);
    try {
      const logo = logos.find((l) => l.logoKey === logoKey);
      const res = await fetch("/api/admin/logos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        /* v2.8.60.0 — brand entries have no draft step, so their removal
            must go live in the same action (publish mirrors the blank). */
        body: JSON.stringify({
          logoKey,
          src: "",
          ...(logo?.group === BRAND_GROUP ? { publish: true } : {}),
        }),
      });
      if (res.ok) {
        await load();
        setEditingKey(null);
        setToast("Logo cleared");
      }
    } finally {
      setBusy(null);
    }
  };

  const publishAll = async () => {
    setBusy("all");
    try {
      const res = await fetch("/api/admin/logos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      const json = await res.json();
      if (res.ok) {
        await load();
        setToast(`${json.published ?? 0} logo change(s) synced across the site`);
      } else setToast(json.error ?? "Unable to publish.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="animate-spin text-[#ffd444]" />
      </div>
    );
  }

  return (
    <>
      {/* Sync explainer + global publish */}
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-[#ffd444]/25 bg-[#ffd444]/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-[#ffd444]">
            Logo sync system
          </h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-white/55">
            Every logo has an ID. Change it once — here, or by tapping it in
            the visual editor — and every page showing that ID updates
            together. Logos always sit centred on a white circle.
            {" "}
            <span className="font-semibold text-[#ffd444]">
              School &amp; Portals logos go LIVE the moment you save.
            </span>
          </p>
        </div>
        <button
          onClick={publishAll}
          disabled={busy === "all" || pending === 0}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#ffd444] px-5 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-50"
        >
          {busy === "all" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          Publish all changes
          {pending > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#0b0b0a] px-1 text-[9px] font-bold text-[#ffd444]">
              {pending}
            </span>
          )}
        </button>
      </div>

      {/* Group tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map((group) => {
          const count = logos.filter((l) => l.group === group.id).length;
          return (
            <button
              key={group.id}
              onClick={() => setActiveGroup(group.id)}
              className={`rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                activeGroup === group.id
                  ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                  : "border-white/12 text-white/50 hover:text-white"
              }`}
            >
              {group.label}
              <span className="ml-1.5 opacity-60">{count}</span>
            </button>
          );
        })}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or sync ID…"
          className="ml-auto h-9 w-full rounded-full border border-white/12 bg-white/[0.05] px-4 text-[12px] text-white outline-none placeholder:text-white/30 focus:border-[#ffd444] sm:w-64"
        />
      </div>

      {/* Logo grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((logo) => {
          const dirty = isDirty(logo);
          const editing = editingKey === logo.logoKey;
          const isBrand = logo.group === BRAND_GROUP;
          // Realtime preview: while editing, the circle mirrors the URL and
          // size being typed — no draft/publish needed to see the result.
          const previewSrc = editing ? editSrc : logo.draftSrc;
          const previewScale = editing ? editScale : logo.draftScale;
          return (
            <div
              key={logo.logoKey}
              className={`rounded-2xl border bg-white/[0.03] p-4 ${
                dirty ? "border-[#ffd444]/50" : "border-white/10"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* White-circle preview — exactly how it renders on the site,
                    live-updated while the URL/size are being edited */}
                <span
                  className={`relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-white text-ink shadow-[0_1px_6px_rgba(0,0,0,0.25)] ring-1 ring-ink/15 bg-cover bg-center ${
                    editing ? "ring-2 ring-[#ffd444]/70" : ""
                  }`}
                  style={
                    previewSrc
                      ? {
                          backgroundImage: `url("${previewSrc}")`,
                          backgroundRepeat: "no-repeat",
                          ...(previewScale !== 100
                            ? { backgroundSize: `${previewScale}%` }
                            : {}),
                        }
                      : undefined
                  }
                >
                  <span className="absolute inset-[4px] rounded-full border border-ink/15" />
                  <span
                    className={`font-display text-[13px] font-semibold ${
                      previewSrc ? "opacity-0" : ""
                    }`}
                  >
                    {logo.label.slice(0, 2).toUpperCase()}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[15px] font-semibold">
                    {logo.label}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[9px] text-white/35">
                    {logo.logoKey}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {isBrand ? (
                      logo.publishedSrc ? (
                        <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                          Live
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-white/40">
                          Initials only
                        </span>
                      )
                    ) : dirty ? (
                      <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                        Draft pending
                      </span>
                    ) : logo.publishedSrc ? (
                      <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                        Live
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/8 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-white/40">
                        Initials only
                      </span>
                    )}
                    {logo.draftScale !== 100 && (
                      <span className="rounded-full bg-white/8 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-white/45">
                        {logo.draftScale}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {editing ? (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <label className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2">
                    <ImageIcon size={12} className="shrink-0 text-[#ffd444]" />
                    <input
                      value={editSrc}
                      onChange={(e) => setEditSrc(e.target.value)}
                      placeholder="/images/… or https://…"
                      className="min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-white/30"
                    />
                    <MediaLibraryButton
                      preferFolder="logos"
                      onSelect={(picked) => setEditSrc(picked.url)}
                    />
                  </label>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-white/40">
                      <span>Size in circle</span>
                      <span className="font-display text-[12px] font-semibold text-white">
                        {editScale}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={40}
                      max={240}
                      step={5}
                      value={editScale}
                      onChange={(e) => setEditScale(Number(e.target.value))}
                      aria-label="Logo size"
                      className="mt-2 w-full accent-[#ffd444]"
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {isBrand ? (
                      /* v2.8.60.0 — brand logos have NO draft step: one save
                          is live everywhere (the owner kept losing changes
                          to the draft/publish split). */
                      <button
                        onClick={() => saveLogo(logo.logoKey, true)}
                        disabled={busy === logo.logoKey}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#ffd444] px-4 text-[10px] font-semibold text-[#0b0b0a] disabled:opacity-60"
                      >
                        {busy === logo.logoKey ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Send size={12} />
                        )}
                        Save &amp; go live
                      </button>
                    ) : (
                      <button
                        onClick={() => saveLogo(logo.logoKey)}
                        disabled={busy === logo.logoKey}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#ffd444] px-4 text-[10px] font-semibold text-[#0b0b0a] disabled:opacity-60"
                      >
                        {busy === logo.logoKey ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        Save draft
                      </button>
                    )}
                    {!isBrand && (
                      <button
                        onClick={() => saveLogo(logo.logoKey, true)}
                        disabled={busy === logo.logoKey}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#ffd444]/50 px-4 text-[10px] font-semibold text-[#ffd444] disabled:opacity-60"
                      >
                        <Send size={11} /> Save &amp; publish
                      </button>
                    )}
                    <button
                      onClick={() => setEditingKey(null)}
                      className="rounded-full border border-white/15 px-4 py-2 text-[10px] font-medium text-white/55 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-px border-t border-white/10 pt-3">
                  <button
                    onClick={() => openEditor(logo)}
                    className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[10.5px] font-semibold text-[#ffd444] hover:bg-white/5"
                  >
                    <ImageIcon size={12} /> Change
                  </button>
                  {!isBrand && dirty && (
                    <>
                      <button
                        onClick={() => logoAction(logo.logoKey, "publish")}
                        disabled={busy === `${logo.logoKey}:publish`}
                        className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[10.5px] font-semibold text-emerald-300 hover:bg-white/5"
                      >
                        <Send size={12} /> Publish
                      </button>
                      <button
                        onClick={() => logoAction(logo.logoKey, "revert")}
                        disabled={busy === `${logo.logoKey}:revert`}
                        className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[10.5px] font-semibold text-white/50 hover:bg-white/5"
                      >
                        <History size={12} /> Revert
                      </button>
                    </>
                  )}
                  {logo.draftSrc && (
                    <button
                      onClick={() => clearLogo(logo.logoKey)}
                      disabled={busy === logo.logoKey}
                      className="grid w-10 place-items-center border-l border-white/10 py-1.5 text-white/35 hover:bg-red-500/10 hover:text-red-400"
                      aria-label={`Clear ${logo.label} logo`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="col-span-full rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-[12px] text-white/40">
            No logos match “{query}” in this group.
          </p>
        )}
      </div>

      <p className="mt-6 flex items-center gap-2 text-[11px] text-white/35">
        <RefreshCw size={12} /> Sync IDs are stable — pages added in the future
        automatically pick up whichever logo carries their ID.
      </p>

      {toast && (
        <div className="g-fade fixed bottom-6 left-1/2 z-[250] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#ffd444] px-5 py-3 text-[12px] font-semibold text-[#0b0b0a] shadow-2xl lg:bottom-7">
          <Check size={14} /> {toast}
        </div>
      )}
    </>
  );
}
