"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { ManageFiltersLink } from "@/components/admin/manage-filters-link";

type EventItem = {
  id: number;
  title: string;
  description: string;
  category: string;
  startsAt: string;
  timeLabel: string;
  location: string;
  isNew: boolean;
};

const input =
  "w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

export function EventsManager() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newCatModal, setNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const loadData = () => {
    Promise.all([
      fetch("/api/admin/events", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/collections", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([evData, collData]) => {
        setEvents(evData.events ?? []);
        if (collData.eventCategories) setCategories(collData.eventCategories);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "event", name: newCatName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setCategories((prev) => Array.from(new Set([...prev, data.name])));
        if (editing) setEditing({ ...editing, category: data.name });
        setNewCatName("");
        setNewCatModal(false);
        setToast(`Category "${data.name}" added!`);
      } else {
        setToast(data.error || "Failed to add category");
      }
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New College Event",
        description: "Event details and timetable…",
        category: categories[0] || "Ceremony",
        timeLabel: "8.00 a.m.",
        location: "Robinson Memorial Hall",
        startsAt: new Date().toISOString(),
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setEvents((prev) => [...prev, json.event]);
      setEditing(json.event);
      setToast("Event created — edit it now");
    } else setToast(json.error);
    setBusy(false);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const res = await fetch("/api/admin/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const json = await res.json();
    if (res.ok) {
      setEvents((prev) => prev.map((item) => (item.id === json.event.id ? json.event : item)));
      setEditing(null);
      setToast("Event saved");
    } else setToast(json.error);
    setBusy(false);
  };

  const remove = async (id: number) => {
    if (!window.confirm("Delete this event from the calendar?")) return;
    setBusy(true);
    const res = await fetch("/api/admin/events", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setEvents((prev) => prev.filter((item) => item.id !== id));
      setEditing(null);
      setToast("Event deleted");
    }
    setBusy(false);
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-white/45">
          {events.length} upcoming events scheduled on the calendar
        </p>
        <div className="flex items-center gap-2">
          <ManageFiltersLink tab="event" />
          <button
            onClick={add}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#ffd444] px-5 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
            Schedule Event
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {events.map((ev) => {
          const date = new Date(ev.startsAt);
          return (
            <div
              key={ev.id}
              className="group min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-[#ffd444]/50"
            >
              <div className="flex items-start gap-3.5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#ffd444] font-display text-xl font-bold text-[#0b0b0a]">
                  {date.getUTCDate()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-sans text-[8px] uppercase tracking-[0.2em] text-[#ffd444]">
                      {ev.category}
                    </span>
                    <span className="text-[10px] text-white/40">
                      {date.toLocaleString("default", { month: "short", year: "numeric" })}
                    </span>
                  </div>
                  <h3 className="mt-1.5 line-clamp-1 font-display text-base font-semibold text-white">
                    {ev.title}
                  </h3>
                </div>
              </div>

              <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-white/50">
                {ev.description}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/10 pt-3 text-[10px] text-white/40">
                <span className="flex items-center gap-1">
                  <Clock size={12} className="text-[#ffd444]" />
                  {ev.timeLabel}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin size={12} className="text-[#ffd444]" />
                  {ev.location}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3">
                <button
                  onClick={() => setEditing(ev)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold text-[#ffd444] hover:bg-white/5"
                >
                  <Pencil size={12} /> Edit Event
                </button>
                <button
                  onClick={() => remove(ev.id)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-white/30 hover:bg-red-500/10 hover:text-red-400"
                  aria-label="Delete event"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-[160] flex items-end bg-black/75 sm:items-center sm:justify-center sm:p-6">
          <div className="g-panel flex max-h-[90svh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#0d0d0b] text-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <h3 className="font-display text-lg font-semibold">Edit Event</h3>
              <button
                onClick={() => setEditing(null)}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 hover:bg-white/10"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                  Event Title
                </span>
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className={`${input} h-11 text-[14px] font-semibold`}
                  placeholder="Event title"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                  Category
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setEditing({ ...editing, category: cat })}
                      className={`rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                        editing.category === cat
                          ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                          : "border-white/12 text-white/45 hover:text-white"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <button
                    onClick={() => setNewCatModal(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#ffd444]/40 bg-[#ffd444]/10 px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[#ffd444] hover:bg-[#ffd444]/20"
                  >
                    <Plus size={10} /> Add Category
                  </button>
                  <button
                    onClick={() => setEditing({ ...editing, isNew: !editing.isNew })}
                    className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                      editing.isNew
                        ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                        : "border-white/12 text-white/45 hover:text-white"
                    }`}
                  >
                    NEW badge
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                    Event Date
                  </span>
                  <input
                    type="date"
                    value={editing.startsAt.slice(0, 10)}
                    onChange={(e) =>
                      setEditing({ ...editing, startsAt: new Date(e.target.value).toISOString() })
                    }
                    className={`${input} h-11 text-[13px]`}
                  />
                </div>
                <div>
                  <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                    Time Label
                  </span>
                  <input
                    value={editing.timeLabel}
                    onChange={(e) => setEditing({ ...editing, timeLabel: e.target.value })}
                    className={`${input} h-11 text-[13px]`}
                    placeholder="e.g. 8.00 a.m. – 2.00 p.m."
                  />
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                  Location
                </span>
                <input
                  value={editing.location}
                  onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                  className={`${input} h-11 text-[13px]`}
                  placeholder="e.g. College Cricket Grounds"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                  Description
                </span>
                <textarea
                  rows={3}
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className={`${input} resize-none py-3 text-[13px] leading-relaxed`}
                  placeholder="Short description of the event…"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-white/10 p-4">
              <button
                onClick={() => setEditing(null)}
                className="rounded-full border border-white/15 px-5 py-2.5 text-[11px] font-medium text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-[#ffd444] px-6 py-2.5 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Collection Modal */}
      {newCatModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#121210] p-6 text-white shadow-2xl">
            <h3 className="font-display text-lg font-semibold">New Event Category</h3>
            <p className="mt-1 text-[12px] text-white/50">
              Create a custom category for schedule events.
            </p>
            <input
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. Workshop, Big Match…"
              className="mt-4 h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 text-[13px] text-white outline-none focus:border-[#ffd444]"
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory();
                if (e.key === "Escape") setNewCatModal(false);
              }}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setNewCatModal(false)}
                className="rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={addCategory}
                disabled={!newCatName.trim() || busy}
                className="rounded-full bg-[#ffd444] px-5 py-2 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
              >
                Create Category
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="g-fade fixed bottom-6 left-1/2 z-[250] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#ffd444] px-5 py-3 text-[12px] font-semibold text-[#0b0b0a] shadow-2xl lg:bottom-7">
          <Check size={14} /> {toast}
        </div>
      )}
    </>
  );
}
