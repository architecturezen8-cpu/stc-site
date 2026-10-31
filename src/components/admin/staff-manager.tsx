"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { MediaLibraryButton } from "@/components/admin/media-picker";
import { ManageFiltersLink } from "@/components/admin/manage-filters-link";
import { adminGridThumbSrc } from "@/lib/admin-grid-thumb";

type StaffMember = {
  id: number;
  name: string;
  role: string;
  department: string;
  qualification: string;
  image: string | null;
  photoScale: number;
  featured: boolean;
  isNew: boolean;
  sortOrder: number;
};

const input =
  "w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

export function StaffManager() {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [activeDept, setActiveDept] = useState("All");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newDeptModal, setNewDeptModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");

  const loadData = () => {
    Promise.all([
      fetch("/api/admin/staff", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/collections", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([stData, collData]) => {
        setStaffList(stData.staff ?? []);
        if (collData.staffDepartments) setDepartments(collData.staffDepartments);
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

  const addDepartment = async () => {
    if (!newDeptName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "staff", name: newDeptName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setDepartments((prev) => Array.from(new Set([...prev, data.name])));
        if (editing) setEditing({ ...editing, department: data.name });
        setNewDeptName("");
        setNewDeptModal(false);
        setToast(`Department "${data.name}" added!`);
      } else {
        setToast(data.error || "Failed to add department");
      }
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Educator",
        role: "Senior Teacher",
        department: departments[0] || "Science & ICT",
        qualification: "B.Sc (Hons) · PGDE",
        featured: false,
        isNew: true,
        sortOrder: staffList.length + 1,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setStaffList((prev) => [...prev, json.staff]);
      setEditing(json.staff);
      setToast("Educator added — edit details now");
    } else setToast(json.error);
    setBusy(false);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const res = await fetch("/api/admin/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const json = await res.json();
    if (res.ok) {
      setStaffList((prev) => prev.map((item) => (item.id === json.staff.id ? json.staff : item)));
      setEditing(null);
      setToast("Staff record saved");
    } else setToast(json.error);
    setBusy(false);
  };

  const remove = async (id: number) => {
    if (!window.confirm("Remove this staff member from the directory?")) return;
    setBusy(true);
    const res = await fetch("/api/admin/staff", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setStaffList((prev) => prev.filter((item) => item.id !== id));
      setEditing(null);
      setToast("Staff member removed");
    }
    setBusy(false);
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= staffList.length) return;
    const next = [...staffList];
    [next[index], next[target]] = [next[target], next[index]];
    setStaffList(next);
    await fetch("/api/admin/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((item) => item.id) }),
    });
    setToast("Staff order saved");
  };

  if (loading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="animate-spin text-[#ffd444]" />
      </div>
    );
  }

  const filtered = activeDept === "All" ? staffList : staffList.filter((s) => s.department === activeDept);

  return (
    <>
      {/* Department Filter & Action Bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {["All", ...departments].map((dept) => (
            <button
              key={dept}
              onClick={() => setActiveDept(dept)}
              className={`rounded-full border px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] transition-colors ${
                activeDept === dept
                  ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                  : "border-white/12 text-white/50 hover:border-white/30 hover:text-white"
              }`}
            >
              {dept}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ManageFiltersLink tab="staff" />
          <button
            onClick={add}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#ffd444] px-5 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
            Add Educator
          </button>
        </div>
      </div>

      {/* Staff Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((member, index) => {
          const initials = member.name
            .split(" ")
            .map((n) => n[0])
            .filter(Boolean)
            .slice(-2)
            .join("")
            .toUpperCase() || "ST";

          return (
            <div
              key={member.id}
              className="group min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-[#ffd444]/50"
            >
              <div className="flex items-start gap-3.5">
                {member.image ? (
                  /* Real photo — the same portrait the public site shows */
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/15">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={adminGridThumbSrc(member.image)}
                      alt={member.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover object-top"
                      style={
                        member.photoScale && member.photoScale !== 100
                          ? { transform: `scale(${member.photoScale / 100})` }
                          : undefined
                      }
                    />
                  </span>
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#ffd444] font-display text-base font-bold text-[#0b0b0a]">
                    {initials}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <span className="inline-block rounded-full bg-white/10 px-2 py-0.5 font-sans text-[8px] uppercase tracking-[0.16em] text-gold">
                    {member.department}
                  </span>
                  <h3 className="mt-1 line-clamp-1 font-display text-base font-semibold text-white">
                    {member.name}
                  </h3>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-white/50">
                    {member.role}
                  </p>
                </div>
              </div>

              <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-white/40">
                {member.qualification}
              </p>

              {member.featured && (
                <div className="mt-3 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-[#ffd444]">
                  <Star size={11} className="fill-current" />
                  Featured in Leadership
                </div>
              )}

              {member.isNew && (
                <div className="mt-2 flex w-fit items-center rounded-full bg-[#ffd444] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-[#0b0b0a]">
                  New
                </div>
              )}

              <div className="mt-4 flex items-center gap-px border-t border-white/10 pt-3">
                <button
                  onClick={() => setEditing(member)}
                  className="flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] font-semibold text-[#ffd444] hover:bg-white/5"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="grid h-8 w-8 place-items-center border-l border-white/10 text-white/40 hover:bg-white/5 hover:text-white disabled:opacity-20"
                  aria-label="Move up"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={index === filtered.length - 1}
                  className="grid h-8 w-8 place-items-center border-l border-white/10 text-white/40 hover:bg-white/5 hover:text-white disabled:opacity-20"
                  aria-label="Move down"
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  onClick={() => remove(member.id)}
                  className="grid h-8 w-8 place-items-center border-l border-white/10 text-white/30 hover:bg-red-500/10 hover:text-red-400"
                  aria-label="Delete member"
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
          <div className="g-panel flex max-h-[90svh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#0d0d0b] text-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <h3 className="font-display text-lg font-semibold">Edit Educator</h3>
              <button
                onClick={() => setEditing(null)}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 hover:bg-white/10"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[9px] uppercase tracking-[0.18em] text-white/40">
                    Portrait
                  </span>
                  <MediaLibraryButton
                    preferFolder="staff"
                    onSelect={(picked) => setEditing({ ...editing, image: picked.url })}
                  />
                </div>
                <div className="flex items-center gap-3">
                  {editing.image ? (
                    /* Framed preview — the ring + overflow-hidden box mirrors
                       the round frame on the public site, so the zoom slider
                       shows exactly how the portrait will be cropped. */
                    <span className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-black ring-2 ring-[#ffd444]/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={editing.image}
                        alt="Portrait preview"
                        className="h-full w-full object-cover object-top"
                        style={
                          editing.photoScale && editing.photoScale !== 100
                            ? { transform: `scale(${editing.photoScale / 100})` }
                            : undefined
                        }
                      />
                      <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[7.5px] uppercase tracking-[0.14em] text-white/70">
                        {editing.photoScale ?? 100}% zoom
                      </span>
                    </span>
                  ) : (
                    <span className="grid h-28 w-24 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-[9px] text-white/30 ring-1 ring-white/10">No photo</span>
                  )}
                  <input
                    value={editing.image ?? ""}
                    onChange={(e) => setEditing({ ...editing, image: e.target.value || null })}
                    className={`${input} h-11 min-w-0 flex-1 text-[11px]`}
                    placeholder="URL or choose from Library"
                  />
                </div>
                {editing.image && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-white/40">
                      <span>Portrait zoom (applies on the site)</span>
                      <span className="font-display text-[12px] font-semibold text-white">
                        {editing.photoScale ?? 100}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={240}
                      step={5}
                      value={editing.photoScale ?? 100}
                      onChange={(e) => setEditing({ ...editing, photoScale: Number(e.target.value) })}
                      aria-label="Portrait zoom"
                      className="mt-2 w-full accent-[#ffd444]"
                    />
                  </div>
                )}
              </div>

              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                  Full Name
                </span>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className={`${input} h-11 text-[14px] font-semibold`}
                  placeholder="e.g. Dr. Ruwan Jayasuriya"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                  Designation / Role
                </span>
                <input
                  value={editing.role}
                  onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                  className={`${input} h-11 text-[13px]`}
                  placeholder="e.g. Head of Science"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                  Department
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {departments.map((dept) => (
                    <button
                      key={dept}
                      onClick={() => setEditing({ ...editing, department: dept })}
                      className={`rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                        editing.department === dept
                          ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                          : "border-white/12 text-white/45 hover:text-white"
                      }`}
                    >
                      {dept}
                    </button>
                  ))}
                  <button
                    onClick={() => setNewDeptModal(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#ffd444]/40 bg-[#ffd444]/10 px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[#ffd444] hover:bg-[#ffd444]/20"
                  >
                    <Plus size={10} /> Add Dept
                  </button>
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                  Qualifications & Honors
                </span>
                <textarea
                  rows={2}
                  value={editing.qualification}
                  onChange={(e) => setEditing({ ...editing, qualification: e.target.value })}
                  className={`${input} resize-none py-3 text-[13px] leading-relaxed`}
                  placeholder="e.g. Ph.D Molecular Biology (Peradeniya) · PGDE"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing({ ...editing, featured: !editing.featured })}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-medium transition-colors ${
                    editing.featured
                      ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                      : "border-white/12 text-white/50 hover:text-white"
                  }`}
                >
                  <Star size={13} className={editing.featured ? "fill-current" : ""} />
                  {editing.featured ? "Featured in Leadership" : "Set as Featured"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing({ ...editing, isNew: !editing.isNew })}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-medium transition-colors ${
                    editing.isNew
                      ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                      : "border-white/12 text-white/50 hover:text-white"
                  }`}
                >
                  NEW badge
                </button>
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
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Department Modal */}
      {newDeptModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#121210] p-6 text-white shadow-2xl">
            <h3 className="font-display text-lg font-semibold">New Department</h3>
            <p className="mt-1 text-[12px] text-white/50">
              Create a faculty or co-curricular department.
            </p>
            <input
              autoFocus
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              placeholder="e.g. Aesthetics, Vocational Studies…"
              className="mt-4 h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 text-[13px] text-white outline-none focus:border-[#ffd444]"
              onKeyDown={(e) => {
                if (e.key === "Enter") addDepartment();
                if (e.key === "Escape") setNewDeptModal(false);
              }}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setNewDeptModal(false)}
                className="rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={addDepartment}
                disabled={!newDeptName.trim() || busy}
                className="rounded-full bg-[#ffd444] px-5 py-2 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
              >
                Create Department
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
