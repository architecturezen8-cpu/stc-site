import {
  BadgeCheck,
  CalendarCheck,
  ClipboardList,
  BookOpen,
  FileBarChart2,
  FolderOpen,
  Megaphone,
  CalendarDays,
  Users,
  HeartHandshake,
} from "lucide-react";
import type { PortalSession } from "@/lib/portal-auth";
import type { LucideIcon } from "lucide-react";

/* ── 3.1-a dashboard skeleton shared by all three portals ─────────────────
   Honest "foundation" state: sign-in verified + the exact page plan from
   README-NEW.md, each item tagged with the batch that ships it. */

type IntroItem = { icon: LucideIcon; label: string; note: string; batch: string };

const BATCH_LABELS: Record<string, string> = {
  "3.1-b": "Batch 3.1-b",
  "3.1-c": "Batch 3.1-c",
  "3.1-d": "Batch 3.1-d",
  "3.1-e": "Batch 3.1-e",
  "3.2": "Phase 3.2",
};

const TEACHER_ITEMS = [
  { icon: Users, label: "My Classes", note: "Rosters & class overview", batch: "3.1-b" },
  { icon: CalendarCheck, label: "Attendance register", note: "Daily present / absent / late", batch: "3.1-c" },
  { icon: ClipboardList, label: "Assignments", note: "Set homework & grade submissions", batch: "3.1-d" },
  { icon: FileBarChart2, label: "Marks", note: "Term tests & class statistics", batch: "3.1-e" },
  { icon: FolderOpen, label: "Materials", note: "Share notes & files", batch: "3.1-e" },
  { icon: Megaphone, label: "Notices", note: "Post to your classes", batch: "3.1-e" },
];

const STUDENT_ITEMS = [
  { icon: CalendarDays, label: "My timetable", note: "Weekly period grid", batch: "3.1-b" },
  { icon: ClipboardList, label: "Assignments", note: "Submit homework & see feedback", batch: "3.1-d" },
  { icon: CalendarCheck, label: "My attendance", note: "Month view & percentage", batch: "3.1-c" },
  { icon: FileBarChart2, label: "My marks", note: "Per subject, per term", batch: "3.1-e" },
  { icon: FolderOpen, label: "Materials", note: "Download study notes", batch: "3.1-e" },
  { icon: Megaphone, label: "Notices", note: "Class & school announcements", batch: "3.1-e" },
];

const PARENT_ITEMS = [
  { icon: Users, label: "Children linked", note: "Switch between siblings", batch: "3.2" },
  { icon: CalendarCheck, label: "Attendance", note: "Follow your child's presence", batch: "3.2" },
  { icon: FileBarChart2, label: "Marks", note: "Term results, read-only", batch: "3.2" },
  { icon: ClipboardList, label: "Assignments", note: "Pending & submitted overview", batch: "3.2" },
  { icon: Megaphone, label: "Notices", note: "School & class announcements", batch: "3.2" },
];

const ITEMS: Partial<Record<PortalSession["role"], IntroItem[]>> = {
  teacher: TEACHER_ITEMS,
  student: STUDENT_ITEMS,
  parent: PARENT_ITEMS,
};

export function PortalDashboardIntro({ session }: { session: PortalSession }) {
  // LmsPortalRole is wider than the three intro maps (future roles render the
  // roadmap once their batch lands) — unlisted roles fall back to no cards.
  const items: IntroItem[] = ITEMS[session.role] ?? [];
  const firstName = session.fullName.trim().split(/\s+/)[0] || session.fullName;

  return (
    <div className="space-y-5">
      {/* Welcome */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-5 sm:p-7">
        <p className="text-[9.5px] uppercase tracking-[0.3em] text-[#ffd444]">
          Welcome back
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
          Ayubowan, {firstName}.
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-white/50">
          Your {session.role} account is live and the portal foundation is in
          place. The features below arrive batch by batch — everything is
          planned and building in order.
        </p>
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-[11.5px] font-medium text-emerald-300">
          <BadgeCheck size={13} /> Sign-in verified · {session.email}
        </p>
      </section>

      {/* Roadmap cards */}
      <section>
        <h2 className="mb-3 text-[10px] uppercase tracking-[0.28em] text-white/40">
          Coming to this portal
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.label}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-[#ffd444]">
                  <Icon size={17} />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold">{item.label}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
                      {BATCH_LABELS[item.batch] ?? item.batch}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-white/45">
                    {item.note}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Family/school strip */}
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[12px] text-white/45">
        <BookOpen size={14} className="text-[#ffd444]" />
        <span className="font-display text-[12px] font-semibold tracking-[0.08em] text-white/60">
          Animo et Fide
        </span>
        — Courage &amp; Faith. The school portal grows with the college
        website. Need help? Contact the school office.
      </section>
    </div>
  );
}
