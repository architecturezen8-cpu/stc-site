"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { clubSlug } from "@/lib/clubs";

/**
 * v2.8.90.0 — Clubs & Societies manager (Admin Studio → Content).
 * The office can add, edit and remove the society directory cards that
 * render on /clubs-societies. Same data channel as the other editable
 * page lists (/api/admin/lists → the college_clubs table).
 */

type Club = {
  id: number;
  name: string;
  crest: string;
  members: string;
  day: string;
  note: string;
  founded: string;
  isNew: boolean;
  sortOrder: number;
};

const input =
  "w-full rounded-xl border border-white/12 bg-white/[0.055] px-3.5 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

export function ClubsManager() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Add-form state
  const [form, setForm] = useState({
    name: "",
    crest: "",
    founded: "",
    members: "",
    day: "",
    note: "",
  });
  const [markNew, setMarkNew] = useState(true);

  const load = useCallback(() => {
    return fetch("/api/admin/lists?type=clubs", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setClubs(data.items ?? []))
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

  const resetForm = () => {
    setForm({ name: "", crest: "", founded: "", members: "", day: "", note: "" });
    setMarkNew(true);
    setAdding(false);
    setError(null);
  };

  const addClub = async () => {
    if (!form.name.trim()) {
      setError("Club name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "clubs", item: { ...form, isNew: markNew } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add the club.");
      resetForm();
      await load();
      setToast(`"${data.item?.name ?? form.name}" added to the directory.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the club.");
    } finally {
      setBusy(false);
    }
  };

  const patchClub = async (id: number, patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch("/api/admin/lists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "clubs", id, item: patch }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const removeClub = async (club: Club) => {
    if (!window.confirm(`Remove "${club.name}" from the directory?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/lists?type=clubs&id=${club.id}`, { method: "DELETE" });
      await load();
      setToast(`"${club.name}" removed.`);
    } finally {
      setBusy(false);
    }
  };

  const addField = (key: keyof typeof form, label: string, placeholder = "") => (
    <label className="block min-w-0">
      <span className="mb-1.5 block font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </span>
      <input
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((c) => ({ ...c, [key]: e.target.value }))}
        className={`${input} h-10`}
      />
    </label>
  );

  const editField = (club: Club, key: keyof Club, label: string, placeholder = "") => (
    <label className="block min-w-0">
      <span className="mb-1.5 block font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </span>
      <input
        defaultValue={String(club[key] ?? "")}
        key={`${club.id}-${key}-${String(club[key] ?? "")}`}
        placeholder={placeholder}
        onBlur={(e) => {
          if (e.target.value !== String(club[key] ?? "")) {
            patchClub(club.id, { [key]: e.target.value });
          }
        }}
        className={`${input} h-10`}
      />
    </label>
  );

  return (
    <div className="min-w-0">
      {/* Header row */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-white/45">
          {clubs.length} societies in the directory · live on the{" "}
          <a
            href="/clubs-societies"
            target="_blank"
            rel="noreferrer"
            className="text-[#ffd444]/85 underline-offset-4 hover:text-[#ffd444] hover:underline"
          >
            Clubs &amp; Societies page
          </a>
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            aria-label="Refresh clubs"
            className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-white/55 transition-colors hover:border-white/35 hover:text-white"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => (adding ? resetForm() : setAdding(true))}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#ffd444] px-5 text-[12px] font-semibold text-[#0b0b0a] transition-opacity disabled:opacity-60"
            disabled={busy}
          >
            {adding ? <X size={15} /> : <Plus size={15} />}
            {adding ? "Close" : "Add a Club"}
          </button>
        </div>
      </div>

      {toast && (
        <p className="mb-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2.5 text-[12px] text-emerald-200">
          {toast}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-[#ffd444]" />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {clubs.map((club) => {
            const editing = editingId === club.id;
            return (
              <div
                key={club.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
              >
                <div className="flex items-center gap-3.5 px-4 py-3.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#ffd444] font-display text-[15px] font-bold text-[#0b0b0a]">
                    {club.crest || club.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[13px] font-semibold text-white">
                      <span className="truncate">{club.name}</span>
                      {club.isNew && (
                        <span className="shrink-0 rounded-full bg-[#ffd444] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#0b0b0a]">
                          New
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[10.5px] text-white/40">
                      {[club.founded && `Est. ${club.founded}`, club.members, club.day]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditingId(editing ? null : club.id)}
                    aria-label="Edit club"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${editing ? "rotate-180" : ""}`}
                    />
                  </button>
                  <button
                    onClick={() => removeClub(club)}
                    aria-label="Delete club"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/45 transition-colors hover:bg-red-500/20 hover:text-red-300"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {editing && (
                  <div className="space-y-3 border-t border-white/10 px-4 py-4">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {editField(club, "name", "Club name", "e.g. Astronomical Society")}
                      {editField(club, "crest", "Crest initials", "AS")}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {editField(club, "founded", "Founded", "1998")}
                      {editField(club, "members", "Members line", "46 members")}
                      {editField(club, "day", "Meets", "Wednesday")}
                    </div>
                    {editField(club, "note", "Short note", "What the society is known for")}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        onClick={() => patchClub(club.id, { isNew: !club.isNew })}
                        className={`h-10 rounded-xl border px-4 text-[11px] font-semibold transition-colors ${
                          club.isNew
                            ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                            : "border-white/12 text-white/45 hover:border-white/30"
                        }`}
                      >
                        {club.isNew ? "NEW badge shown" : "NEW badge hidden"}
                      </button>
                      <p className="text-[10px] text-white/30">
                        Crest logo key:{" "}
                        <span className="text-white/50">club-crest-{clubSlug(club.name)}</span>
                      </p>
                    </div>
                    <p className="flex items-center gap-1.5 text-[10px] text-white/25">
                      <RefreshCw size={10} /> Changes save the moment you leave a field.
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {clubs.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
              <UsersRound size={26} className="mx-auto text-white/25" />
              <p className="mt-3 text-[13px] text-white/45">
                The directory is empty — add the first society.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Add form ─────────────────────────────────────────────── */}
      {adding && (
        <div className="mt-4 space-y-3 rounded-2xl border border-[#ffd444]/40 bg-[#ffd444]/[0.06] p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ffd444]">
            Add a new club or society
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {addField("name", "Club name *", "e.g. Astronomical Society")}
            {addField("crest", "Crest initials (optional)", "Auto from the name")}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {addField("founded", "Founded", "1998")}
            {addField("members", "Members line", "46 members")}
            {addField("day", "Meets", "Wednesday")}
          </div>
          {addField("note", "Short note", "What the society is known for")}
          <label className="flex items-center gap-2.5 text-[12px] text-white/70">
            <input
              type="checkbox"
              checked={markNew}
              onChange={(e) => setMarkNew(e.target.checked)}
              className="h-4 w-4 accent-[#ffd444]"
            />
            Show the NEW badge on the public page
          </label>
          {error && <p className="text-[11.5px] text-red-300">{error}</p>}
          <button
            onClick={addClub}
            disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#ffd444] text-[12px] font-bold text-[#0b0b0a] transition-opacity disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add to the directory
          </button>
        </div>
      )}

      <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[11px] leading-relaxed text-white/35">
        Every club&apos;s crest image is managed in{" "}
        <span className="text-white/55">Logos &amp; Crests</span> under the key shown in its edit
        panel (<span className="text-white/55">club-crest-&lt;name&gt;</span>) — upload or sync a
        crest there and the public card picks it up automatically.
      </p>
    </div>
  );
}
