import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Briefcase,
  ExternalLink,
  FlaskConical,
  Globe2,
  HeartPulse,
  Landmark,
  Languages,
  Link2,
  MonitorSmartphone,
  Music,
  Palette,
  Paperclip,
  PartyPopper,
  Sigma,
  Trophy,
} from "lucide-react";

/* ── Phase 5.1/5.2 (v2.8.58.0) — dashboard refresh widgets ─────────────
   Progress rings, the "today" strip, earned badges, quick actions and
   the submission celebration. Pure re-skin: everything derives from the
   data the dashboards already fetch — zero schema change. All widgets
   are deterministic (SSR == hydration): no clocks, no randomness. */

const RING_TONES = {
  accent: "stroke-[var(--pt-accent)]",
  good: "stroke-[var(--pt-good-text)]",
  warn: "stroke-[var(--pt-warn-text)]",
} as const;

/** A small SVG progress ring (0–100). Deterministic and CSS-animated. */
export function ProgressRing({
  pct,
  size = 46,
  stroke = 4.5,
  tone = "accent",
  label,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  tone?: keyof typeof RING_TONES;
  /** Screen-reader text (visually the caller usually shows the % nearby). */
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circ;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? `${clamped}% complete`}
      className="-rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-[var(--pt-chip)]"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        style={{ ["--ring-circ" as string]: `${circ}` }}
        className={`pt-ring-arc ${RING_TONES[tone]}`}
      />
    </svg>
  );
}

/* ── Reference-style stat cards (v2.8.39.0; rings in v2.8.58.0) ─────────
   The owner's reference dashboard opens with a row of rounded cards —
   tinted circular icon tile, big tabular number, quiet label, ghost
   arrow chip. Token-driven so both portal themes stay first-class.
   Phase 5.1: a stat with `pct` renders a progress ring instead of the
   icon tile — attendance / marks / homework read as progress at a glance. */

const PT_TINTS = [
  "bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]",
  "bg-[var(--pt-info-bg)] text-[var(--pt-info-text)]",
  "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]",
  "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]",
] as const;

export function StatCards({
  stats,
}: {
  stats: {
    value: string;
    label: string;
    icon: ReactNode;
    href?: string;
    /** When present the card shows a progress ring instead of the icon. */
    pct?: number | null;
  }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {stats.map((stat, i) => {
        const ringTone =
          stat.pct != null ? (stat.pct >= 75 ? "good" : stat.pct < 35 ? "warn" : "accent") : "accent";
        const body = (
          <>
            <div className="flex items-start justify-between">
              {stat.pct != null ? (
                <span className="relative grid place-items-center">
                  <ProgressRing pct={stat.pct} tone={ringTone} label={`${stat.pct}% ${stat.label}`} />
                  <span className="absolute font-display text-[10.5px] font-bold tabular-nums text-[var(--pt-heading)]">
                    {Math.round(stat.pct)}%
                  </span>
                </span>
              ) : (
                <span
                  className={`grid h-10 w-10 place-items-center rounded-2xl ${PT_TINTS[i % PT_TINTS.length]}`}
                >
                  {stat.icon}
                </span>
              )}
              <span className="grid h-7 w-7 place-items-center rounded-full border border-[var(--pt-border)] text-[var(--pt-faint)] transition-all duration-300 group-hover:border-[var(--pt-accent)] group-hover:text-[var(--pt-accent-text)]">
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-4 font-display text-[28px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-[var(--pt-heading)] sm:text-[30px]">
              {stat.value}
            </p>
            <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--pt-muted)]">
              {stat.label}
            </p>
          </>
        );
        const cls = `pt-rise pt-d${Math.min(3, i + 1)} pt-panel-shadow group rounded-3xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--pt-border-strong)] sm:p-5`;
        return stat.href ? (
          <Link key={stat.label} href={stat.href} className={cls}>
            {body}
          </Link>
        ) : (
          <div key={stat.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/* ── Phase 5.1/5.2 — the "today" strip ─────────────────────────────────
   One glanceable horizontal line of the day's periods right under the
   hero (scrolls sideways on phones). The full detail stays in the
   timetable panel below — this is the at-the-door summary. */

export function TodayStrip({
  dayLabel,
  dateLabel,
  slots,
  ctaLabel,
  ctaHref,
  chipHref,
}: {
  dayLabel: string;
  dateLabel: string;
  slots: { period: number; subject: string; room?: string }[];
  ctaLabel?: string;
  ctaHref?: string;
  /** v2.8.61.0 — each period chip jumps somewhere real (the dashboard's
      timetable panel) instead of sitting static. */
  chipHref?: string;
}) {
  if (slots.length === 0) return null;
  return (
    <div className="pt-rise pt-d1 rounded-3xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 pt-panel-shadow sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-accent-text)]">
          Today · {dayLabel} {dateLabel}
        </p>
        {ctaLabel && ctaHref ? (
          <Link
            href={ctaHref}
            className="shrink-0 text-[11px] font-semibold text-[var(--pt-body)] underline-offset-2 hover:text-[var(--pt-heading)] hover:underline"
          >
            {ctaLabel}
          </Link>
        ) : null}
      </div>
      <div className="pt-scrollbar mt-2.5 flex gap-2 overflow-x-auto pb-1">
        {slots.map((slot, i) => {
          const chip = (
            <>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--pt-accent-soft)] font-display text-[11px] font-bold text-[var(--pt-accent-text)]">
                {slot.period}
              </span>
              <span className="whitespace-nowrap text-[12px] font-semibold text-[var(--pt-heading)]">
                {slot.subject}
              </span>
              {slot.room ? (
                <span className="whitespace-nowrap text-[10.5px] text-[var(--pt-muted)]">
                  {slot.room}
                </span>
              ) : null}
            </>
          );
          const cls =
            "flex shrink-0 items-center gap-2 rounded-2xl border border-[var(--pt-divider)] bg-[var(--pt-panel-soft)] py-1.5 pl-1.5 pr-3";
          return chipHref ? (
            <Link key={i} href={chipHref} className={cls} title={`See ${slot.subject} in the timetable`}>
              {chip}
            </Link>
          ) : (
            <span key={i} className={cls}>
              {chip}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── Phase 5.1 — earned badges (subtle, honest, derived) ───────────────
   Only earned badges render — nothing fake, nothing nagging. */

export function BadgeStrip({
  badges,
}: {
  badges: { icon: ReactNode; label: string }[];
}) {
  if (badges.length === 0) return null;
  return (
    <div className="pt-rise pt-d1 flex flex-wrap items-center gap-2">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-muted)]">
        Earned
      </span>
      {badges.map((b, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-accent-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--pt-accent-text)]"
        >
          {b.icon}
          {b.label}
        </span>
      ))}
    </div>
  );
}

/* ── Phase 5.2 — quick actions ──────────────────────────────────────────
   The teacher's four everyday doors, right under the hero. */

export function QuickActions({
  actions,
}: {
  actions: { label: string; sub: string; href: string; icon: ReactNode }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {actions.map((a, i) => (
        <Link
          key={a.label}
          href={a.href}
          className={`pt-rise pt-d${Math.min(3, i + 1)} pt-panel-shadow group flex items-center gap-3 rounded-3xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--pt-accent)]`}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
            {a.icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-[var(--pt-heading)]">
              {a.label}
            </span>
            <span className="block truncate text-[11px] text-[var(--pt-body)]">{a.sub}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/* ── Phase 5.2 — the pending-marking counter ───────────────────────────
   One honest number: submissions waiting for a grade. */

export function MarkingCounter({
  count,
  href,
}: {
  count: number;
  href: string;
}) {
  const done = count === 0;
  return (
    <Link
      href={href}
      className={`pt-rise pt-d2 pt-panel-shadow flex items-center justify-between gap-4 rounded-3xl border p-5 transition-all duration-300 hover:-translate-y-0.5 ${
        done
          ? "border-[var(--pt-border)] bg-[var(--pt-panel)]"
          : "border-[var(--pt-border)] bg-[var(--pt-warn-bg)]"
      }`}
    >
      <div className="flex items-center gap-4">
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-[19px] font-bold tabular-nums ${
            done
              ? "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
              : "bg-[var(--pt-panel)] text-[var(--pt-warn-text)]"
          }`}
        >
          {count}
        </span>
        <div>
          <p className="font-display text-[15px] font-semibold text-[var(--pt-heading)]">
            {done ? "Marking all caught up" : "Submissions to grade"}
          </p>
          <p className="text-[11.5px] text-[var(--pt-body)]">
            {done
              ? "Every submitted answer has its grade."
              : "Students are waiting — open the marking queue."}
          </p>
        </div>
      </div>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--pt-border)] text-[var(--pt-faint)] transition-all duration-300 group-hover:border-[var(--pt-accent)] group-hover:text-[var(--pt-accent-text)]">
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

/* ── Phase 5.1 — submission celebration ────────────────────────────────
   Fires when the student has handed in EVERY visible piece of work —
   one calm gold banner, no confetti libraries, no layout shift. */

export function CelebrationBanner({
  title,
  note,
}: {
  title: string;
  note?: string;
}) {
  return (
    <div
      role="status"
      className="pt-rise relative overflow-hidden rounded-2xl border border-[var(--pt-accent)] bg-[var(--pt-accent-soft)] px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--pt-accent)] text-[var(--pt-on-accent)]">
          <PartyPopper size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[var(--pt-heading)]">{title}</p>
          {note ? <p className="text-[11.5px] text-[var(--pt-body)]">{note}</p> : null}
        </div>
      </div>
      {/* deterministic sparkle dots — same 6 positions every render */}
      <span aria-hidden="true" className="pt-spark s1 absolute h-1.5 w-1.5 rounded-full bg-[var(--pt-accent)]" />
      <span aria-hidden="true" className="pt-spark s2 absolute h-1 w-1 rounded-full bg-[var(--pt-accent)]" />
      <span aria-hidden="true" className="pt-spark s3 absolute h-1.5 w-1.5 rounded-full bg-[var(--pt-accent)]" />
    </div>
  );
}

/* ── Phase 5.1 — subject cards with icons ──────────────────────────────
   A deterministic glyph per subject (keyword match, hash fallback) so
   SSR and hydration always agree. */

const SUBJECT_GLYPHS: { keys: string[]; icon: ReactNode }[] = [
  { keys: ["math", "arith", "algebra", "geometry"], icon: <Sigma size={15} /> },
  { keys: ["science", "physic", "chem", "bio"], icon: <FlaskConical size={15} /> },
  { keys: ["ict", "computer", "tech", "coding"], icon: <MonitorSmartphone size={15} /> },
  { keys: ["english", "lit", "language", "tamil", "hindi", "french", "sinhala"], icon: <Languages size={15} /> },
  { keys: ["history", "civic"], icon: <Landmark size={15} /> },
  { keys: ["geograph", "env"], icon: <Globe2 size={15} /> },
  { keys: ["art", "draw", "paint"], icon: <Palette size={15} /> },
  { keys: ["music", "song"], icon: <Music size={15} /> },
  { keys: ["sport", "physical", "health", "pe"], icon: <Trophy size={15} /> },
  { keys: ["business", "commerce", "account", "econom"], icon: <Briefcase size={15} /> },
  { keys: ["buddh", "relig", "truth"], icon: <HeartPulse size={15} /> },
];

export function SubjectGlyph({ name }: { name: string }) {
  const lower = name.toLowerCase();
  const hit = SUBJECT_GLYPHS.find((g) => g.keys.some((k) => lower.includes(k)));
  return hit ? hit.icon : <BookOpen size={15} />;
}

/** Phase 5.1 — the My Subjects panel's card wall.
 *  v2.8.61.0 — the owner: the tiles sat static with a hover lift and did
 *  nothing. Each card is now a real link — on the student dashboard it
 *  opens the homework list filtered to that subject (hrefBase). */
export function SubjectCards({
  subjects,
  hrefBase,
}: {
  subjects: string[];
  /** e.g. "/student/homework" — each tile links to <hrefBase>?subject=<name>. */
  hrefBase?: string;
}) {
  if (subjects.length === 0) return null;
  const card = (s: string, i: number) => (
    <>
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${PT_TINTS[i % PT_TINTS.length]}`}
      >
        <SubjectGlyph name={s} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-semibold text-[var(--pt-heading)]">
          {s}
        </span>
        <span className="block text-[10.5px] text-[var(--pt-muted)]">This year</span>
      </span>
    </>
  );
  const cls =
    "flex items-center gap-2.5 rounded-2xl border border-[var(--pt-divider)] bg-[var(--pt-panel-soft)] p-3 transition-all duration-300 hover:-translate-y-px hover:border-[var(--pt-border-strong)]";
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {subjects.map((s, i) =>
        hrefBase ? (
          <Link
            key={`${s}-${i}`}
            href={`${hrefBase}?subject=${encodeURIComponent(s)}`}
            className={cls}
            title={`Open ${s} homework`}
          >
            {card(s, i)}
          </Link>
        ) : (
          <div key={`${s}-${i}`} className={cls}>
            {card(s, i)}
          </div>
        ),
      )}
    </div>
  );
}

/* ── Student card with avatar picture (v2.8.39.0) ──────────────────────
   Used by the teacher's class roster wall and the parent's children list.
   Each student shows their own deterministic illustration avatar. */

const AVATAR_RINGS = ["#f5c536", "#8CA3D6", "#D98A7C", "#7FA98F"] as const;

export function ChildCard({
  name,
  avatarSrc,
  badge,
  lines,
  actions,
  className = "",
}: {
  name: string;
  avatarSrc: string;
  badge?: ReactNode;
  lines?: string[];
  /** v2.8.46.0 — optional action pills under the info lines (the parent
      dashboard links each child to their homework + marks views). */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`pt-panel-shadow flex items-center gap-3.5 rounded-3xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--pt-border-strong)] ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarSrc}
        alt={`${name}'s avatar`}
        className="h-14 w-14 shrink-0 rounded-full object-cover"
        style={{ boxShadow: `0 0 0 2px ${AVATAR_RINGS[name.length % AVATAR_RINGS.length]}, 0 8px 18px -10px rgb(0 0 0 / 0.5)` }}
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-display text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--pt-heading)]">
            {name}
          </p>
          {badge}
        </div>
        {lines && lines.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {lines.map((line, i) => (
              <p key={i} className="truncate text-[11.5px] text-[var(--pt-body)]">
                {line}
              </p>
            ))}
          </div>
        )}
        {actions}
      </div>
    </div>
  );
}

/* ── Card chrome ─────────────────────────────────────────────────────── */

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  /** v2.8.61.0 — only "period" survives; the decorative Search/Filter/
      More circle buttons are GONE (the owner: they did nothing and looked
      broken). "period" renders one passive info chip — no chevron, no
      fake dropdown. */
  action?: "period" | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`pt-panel-shadow rounded-3xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5 transition-colors duration-300 hover:border-[var(--pt-border-strong)] sm:p-6 ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3 sm:mb-5">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-[var(--pt-heading)] sm:text-[18px]">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[12.5px] text-[var(--pt-body)]">{subtitle}</p>
          )}
        </div>
        {action === "period" && (
          <span className="shrink-0 rounded-full bg-[var(--pt-chip)] px-3 py-1.5 text-[11px] font-semibold text-[var(--pt-chip-text)]">
            Weekly view
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/* ── Hero row ────────────────────────────────────────────────────────── */

export function HeroRow({
  overline,
  firstName,
  secondaryLabel,
  secondaryValue,
  ctaLabel,
  ctaHref,
}: {
  overline: string;
  firstName: string;
  secondaryLabel: string;
  secondaryValue: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="pt-rise flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] text-[var(--pt-accent-text)]">{overline}</p>
        <h1 className="mt-1 font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-[var(--pt-heading)] sm:text-[42px]">
          Welcome Back, {firstName}
        </h1>
      </div>

      <div className="flex items-center gap-5 sm:gap-7">
        <span className="hidden h-12 w-px bg-[var(--pt-border-strong)] md:block" />
        <div className="min-w-0">
          <p className="text-[12.5px] text-[var(--pt-body)]">{secondaryLabel}</p>
          <p className="mt-0.5 truncate font-display text-[19px] font-semibold tracking-[-0.01em] text-[var(--pt-heading)]">
            {secondaryValue}
          </p>
        </div>
        <Link
          href={ctaHref}
          className="flex h-11 items-center gap-2 rounded-full bg-[var(--pt-accent)] px-5 text-[13.5px] font-semibold text-[var(--pt-on-accent)] transition-all duration-300 hover:-translate-y-px hover:bg-[var(--pt-accent-hover)] hover:shadow-[0_10px_24px_-12px_rgb(255_212_68/0.5)]"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}

/* ── Big stats + chart ───────────────────────────────────────────────── */

export function PerformanceStats({
  stats,
}: {
  stats: {
    value: string;
    label: string;
    delta?: string;
    deltaTone?: "up" | "down" | "flat";
    /** Displayed before the big value — "%" for rates, "" for counts. */
    prefix?: string;
  }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 border-b border-[var(--pt-divider)] pb-5 sm:grid-cols-3 sm:gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="sm:border-l sm:border-[var(--pt-divider)] sm:pl-5 sm:first:border-l-0 sm:first:pl-0"
        >
          <div className="flex items-baseline gap-1.5">
            {stat.prefix !== "" && (
              <span className="text-[15px] font-medium text-[var(--pt-muted)]">%</span>
            )}
            <span className="font-display text-[34px] font-semibold leading-none tracking-[-0.02em] text-[var(--pt-heading)]">
              {stat.value}
            </span>
            {stat.delta && stat.delta !== "—" && (
              <span
                className={`ml-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${
                  stat.deltaTone === "down"
                    ? "bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]"
                    : stat.deltaTone === "flat"
                      ? "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]"
                      : "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]"
                }`}
              >
                {stat.delta}
              </span>
            )}
          </div>
          <p className="mt-2 text-[12.5px] text-[var(--pt-body)]">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Hand-rolled performance chart — thin gold bars under a smooth line, one
 * highlighted day with a floating chip, exactly like the reference. Fully
 * deterministic (no randomness) so SSR and hydration always agree.
 * Motion: bars grow from the baseline (staggered), the line draws itself,
 * then the chip pops in — all pure CSS, disabled under reduced-motion.
 */
export function PerformanceChart({
  points,
  highlightIndex,
  chipLabel,
  chipValue,
  emptyNote,
}: {
  /** Normalised 0–1 values, one per day column. */
  points: number[];
  highlightIndex?: number;
  chipLabel: string;
  chipValue: string;
  emptyNote?: string;
}) {
  const width = 720;
  const height = 190;
  const count = points.length;
  const barWidth = width / count - 4;

  const barX = (i: number) => i * (width / count) + 2;
  const barH = (v: number) => Math.max(4, v * (height - 46));

  const hi = highlightIndex ?? -1;

  /* v2.8.59.0 — the owner: "charts thiyenne ewage line eka ehema smooth na
     bend ehema penawa. ewa lassanata charts re design karanawada." The
     polyline-through-midpoints is gone. Two fixes:
       1. The line now runs a MONOTONE CUBIC (Fritsch–Carlson) spline —
          it can never overshoot a data point or kink at a column edge
          (the old quadratic midpoint chain wobbled exactly there).
       2. Every stroke carries vector-effect="non-scaling-stroke": the
          viewBox still stretches to the panel width, but the old
          distorted-width strokes (fat one end, thin the other) are gone. */
  const midY = (i: number) => height - 24 - barH(points[i]) / 1.35;
  const spline = (() => {
    const pts = points.map((_, i) => ({ x: barX(i) + barWidth / 2, y: midY(i) }));
    const n = pts.length;
    if (n === 0) return "";
    if (n === 1) return `M ${pts[0].x} ${pts[0].y}`;
    const dx: number[] = [];
    const m: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1].x - pts[i].x;
      m[i] = (pts[i + 1].y - pts[i].y) / dx[i];
    }
    const t: number[] = [m[0]];
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) {
        t[i] = 0;
      } else {
        const w1 = 2 * dx[i] + dx[i - 1];
        const w2 = dx[i] + 2 * dx[i - 1];
        t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
      }
    }
    t[n - 1] = m[n - 2];
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i];
      d += ` C ${pts[i].x + h / 3} ${pts[i].y + (t[i] * h) / 3} ${
        pts[i + 1].x - h / 3
      } ${pts[i + 1].y - (t[i + 1] * h) / 3} ${pts[i + 1].x} ${pts[i + 1].y}`;
    }
    return d;
  })();
  const areaPath =
    spline && count > 0
      ? `${spline} L ${barX(count - 1) + barWidth / 2} ${height - 24} L ${
          barX(0) + barWidth / 2
        } ${height - 24} Z`
      : "";

  return (
    <div className="relative pt-6">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[180px] w-full sm:h-[200px]"
        preserveAspectRatio="none"
        role="img"
        aria-label={emptyNote ? "No data yet" : "Weekly performance chart"}
      >
        <defs>
          <linearGradient id="pt-chart-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--pt-accent)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="var(--pt-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {points.map((v, i) => (
          <rect
            key={i}
            x={barX(i)}
            y={height - 24 - barH(v)}
            width={Math.max(2, barWidth)}
            height={barH(v)}
            rx={Math.min(7, Math.max(2, barWidth / 2.4))}
            className={`pt-chart-bar ${
              i === hi ? "fill-[var(--pt-accent)]" : "fill-[var(--pt-bar)]"
            }`}
            style={{ animationDelay: `${i * 45}ms` }}
          />
        ))}
        {areaPath && (
          <path d={areaPath} fill="url(#pt-chart-area)" className="pt-chart-area" />
        )}
        {spline && (
          <path
            d={spline}
            fill="none"
            pathLength={1}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="pt-chart-line stroke-[var(--pt-accent)]"
          />
        )}
        {hi >= 0 && (
          <circle
            cx={barX(hi) + barWidth / 2}
            cy={midY(hi)}
            r={4.5}
            vectorEffect="non-scaling-stroke"
            className="pt-chart-dot fill-[var(--pt-accent)] stroke-[var(--pt-panel)]"
            strokeWidth={2}
          />
        )}
        <line
          x1={0}
          y1={height - 23.5}
          x2={width}
          y2={height - 23.5}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          className="stroke-[var(--pt-divider)]"
        />
      </svg>

      {hi >= 0 && (
        <div
          className="pt-chart-chip absolute -top-1 hidden rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3.5 py-2 pt-panel-shadow sm:block"
          style={{ left: `${Math.min(86, (hi / count) * 100)}%` }}
        >
          <p className="font-display text-[15px] font-semibold leading-none text-[var(--pt-heading)]">
            {chipValue}
          </p>
          <p className="mt-1 text-[10.5px] leading-tight text-[var(--pt-body)]">
            {chipLabel}
          </p>
        </div>
      )}

      {emptyNote && (
        <p className="absolute inset-x-0 bottom-9 text-center text-[12px] text-[var(--pt-faint)]">
          {emptyNote}
        </p>
      )}
    </div>
  );
}

/* ── Rows ────────────────────────────────────────────────────────────── */

export function ListRow({
  icon,
  title,
  desc,
  meta,
  right,
  href,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  /** Small pills rendered under the title (with icon + text each). */
  meta?: { icon?: ReactNode; text: string }[];
  right?: ReactNode;
  /** v2.8.61.0 — a real destination turns the whole row into a link
      (the parent Support panel's "call the office" row). */
  href?: string;
}) {
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)] transition-colors duration-300">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--pt-heading)]">
            {title}
          </p>
          {desc && (
            <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--pt-body)]">
              {desc}
            </p>
          )}
          {meta && meta.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {meta.map((m, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pt-chip)] px-2.5 py-1 text-[11px] font-medium text-[var(--pt-chip-text)]"
                >
                  {m.icon}
                  {m.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {right && <div className="shrink-0 pt-0.5">{right}</div>}
    </div>
  );
  const cls =
    /* v2.8.76.1 — `block`: with an href this renders as <a>, whose default
       INLINE display fragments the card's background/border around the
       block children inside (ghost arcs peeking out of the rows on mobile,
       icon chip sliding out of the padding). Block == the div behaviour. */
    "block rounded-2xl border border-[var(--pt-divider)] bg-[var(--pt-panel-soft)] p-3.5 transition-all duration-300 hover:-translate-y-px hover:border-[var(--pt-border-strong)] sm:p-4";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function AvatarPair({ names }: { names: string[] }) {
  const shown = names.slice(0, 3);
  return (
    <span className="flex -space-x-1.5">
      {shown.map((n, i) => (
        <span
          key={i}
          className="grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--pt-panel)] text-[9.5px] font-bold text-white"
          style={{
            background: ["#8CA3D6", "#D98A7C", "#D9A441"][i % 3],
          }}
        >
          {n
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() ?? "")
            .join("")}
        </span>
      ))}
    </span>
  );
}

/* ── v2.8.59.0 — notice attachments (links, images, PDFs) ─────────────
   The chip row that rides under every notice row on the three dashboards.
   Server-safe markup (plain <a>), so it renders inside SSR dashboard rows;
   files open through the audience-checked notices file route. */
export function NoticeAttachments({
  noticeId,
  linkUrl,
  files,
}: {
  noticeId: number;
  linkUrl: string | null;
  files: { id: number; fileName: string; sizeBytes: number }[];
}) {
  if (!linkUrl && files.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {linkUrl ? (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-[240px] items-center gap-1.5 truncate rounded-full border border-[var(--pt-border)] bg-[var(--pt-accent-soft)] px-2.5 py-1 text-[10.5px] font-medium text-[var(--pt-accent-text)] transition-opacity hover:opacity-85"
        >
          <Link2 size={11} className="shrink-0" />
          <span className="truncate">{linkUrl.replace(/^https?:\/\//, "")}</span>
          <ExternalLink size={10} className="shrink-0" />
        </a>
      ) : null}
      {files.map((f) => (
        <a
          key={f.id}
          href={`/api/portal/notices/${noticeId}/file/${f.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title={f.fileName}
          className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-2.5 py-1 text-[10.5px] font-medium text-[var(--pt-heading)] transition-colors hover:border-[var(--pt-accent)]"
        >
          <Paperclip size={11} className="shrink-0 text-[var(--pt-muted)]" />
          <span className="truncate">{f.fileName}</span>
          <span className="shrink-0 text-[9px] text-[var(--pt-muted)]">
            {f.sizeBytes < 1024 * 1024
              ? `${Math.max(1, Math.round(f.sizeBytes / 1024))} KB`
              : `${(f.sizeBytes / (1024 * 1024)).toFixed(1)} MB`}
          </span>
        </a>
      ))}
    </div>
  );
}

export function PeopleRow({
  name,
  sub,
  value,
  tone = 0,
}: {
  name: string;
  sub: string;
  value: string;
  tone?: number;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
        style={{
          background: ["#8CA3D6", "#D98A7C", "#D9A441", "#7FA98F"][tone % 4],
        }}
      >
        {name
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? "")
          .join("")}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-[var(--pt-heading)]">
          {name}
        </p>
        <p className="truncate text-[11.5px] text-[var(--pt-body)]">{sub}</p>
      </div>
      <p className="shrink-0 font-display text-[14px] font-semibold text-[var(--pt-heading)]">
        {value}
      </p>
    </div>
  );
}

/** Dashed-divided triple stat with gold progress bars (Learning Time style). */
export function SplitStats({
  items,
  footer,
}: {
  items: { value: string; label: string; fill?: number }[];
  footer?: ReactNode;
}) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0">
        {items.map((item, i) => (
          <div
            key={item.label}
            className={`sm:px-4 ${i === 0 ? "sm:pl-0" : ""} ${
              i > 0 ? "sm:border-l sm:border-dashed sm:border-[var(--pt-border-strong)]" : ""
            }`}
          >
            <p className="font-display text-[16px] font-semibold text-[var(--pt-heading)]">
              {item.value}
            </p>
            <p className="mt-0.5 text-[11.5px] text-[var(--pt-body)]">{item.label}</p>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--pt-chip)]">
              <div
                className="h-full rounded-full bg-[var(--pt-accent)]"
                style={{
                  width: `${Math.min(100, Math.max(0, item.fill ?? 0))}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      {footer && <div className="mt-5">{footer}</div>}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--pt-border-strong)] bg-[var(--pt-panel-soft)] px-4 py-8 text-center">
      {/* v2.8.39.0 — soft illustration so empty states feel designed, not broken. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/illustrations/empty-notes.png"
        alt=""
        aria-hidden="true"
        className="mx-auto mb-3 h-16 w-16 rounded-2xl object-cover opacity-90"
        loading="lazy"
      />
      <p className="mx-auto max-w-[280px] text-[12.5px] leading-relaxed text-[var(--pt-muted)]">
        {children}
      </p>
    </div>
  );
}

/** Gold foot chip used inside panels (e.g. "+6 since last week"). */
export function PanelFooter({
  left,
  right,
}: {
  left: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--pt-divider)] pt-4">
      <div className="min-w-0">{left}</div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
