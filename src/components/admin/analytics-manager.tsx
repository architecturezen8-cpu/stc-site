"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Globe, RefreshCw, Smartphone, Tablet, Monitor, Users } from "lucide-react";

type SeriesPoint = { day: string; label: string; views: number; uniques: number };
type TopPath = { path: string; views: number; uniques: number };
type Referrer = { host: string; views: number };
type DeviceRow = { device: string; views: number };

type Payload = {
  generatedAt: string;
  today: string;
  totals: {
    viewsToday: number;
    uniquesToday: number;
    views7: number;
    uniques7: number;
    views30: number;
    uniques30: number;
  };
  series: SeriesPoint[];
  topPaths: TopPath[];
  referrers: Referrer[];
  devices: DeviceRow[];
};

const DEVICE_ICONS: Record<string, typeof Monitor> = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
};

function StatTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <p className="text-[9px] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p
        className={`mt-2 font-display text-2xl font-semibold ${
          accent ? "text-[#ffd444]" : "text-white"
        }`}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export function AnalyticsManager() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analytics", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Payload & { error?: string };
      if (res.ok) {
        setData(json);
      } else {
        setError(json.error || "Could not load analytics.");
      }
    } catch {
      setError("Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const chart = useMemo(() => {
    if (!data) return { max: 0, points: [] as SeriesPoint[] };
    const max = Math.max(1, ...data.series.map((p) => p.views));
    return { max, points: data.series };
  }, [data]);

  const maxPathViews = useMemo(
    () => Math.max(1, ...(data?.topPaths ?? []).map((p) => p.views)),
    [data],
  );

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-5 text-[13px] text-red-200">
        {error}
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const empty = data.totals.views30 === 0;

  return (
    <div className="space-y-5">
      {/* Stat tiles */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Views today" value={data.totals.viewsToday} accent />
        <StatTile label="Uniques today" value={data.totals.uniquesToday} />
        <StatTile label="Views · 7 days" value={data.totals.views7} />
        <StatTile label="Uniques · 7 days" value={data.totals.uniques7} />
        <StatTile label="Views · 30 days" value={data.totals.views30} accent />
        <StatTile label="Uniques · 30 days" value={data.totals.uniques30} />
      </div>

      {empty ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <Eye size={22} className="mx-auto text-white/25" />
          <p className="mt-3 text-[13px] text-white/60">
            No traffic recorded yet — numbers appear here as visitors browse the
            public site.
          </p>
          <p className="mt-1.5 text-[11.5px] text-white/35">
            First-party and cookie-less: only page paths and daily-rotating
            anonymous counts are stored — never IPs, user agents or anything
            that identifies a person across days.
          </p>
        </div>
      ) : (
        <>
          {/* 30-day chart */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[9px] uppercase tracking-[0.2em] text-white/35">
                Page views — last 30 days (Asia/Colombo days)
              </p>
              <button
                onClick={() => void load()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-[10.5px] text-white/60 hover:border-white/35 hover:text-white"
              >
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
            <div className="mt-4 flex h-40 items-end gap-[3px]">
              {chart.points.map((p, i) => (
                <div
                  key={p.day}
                  className="group relative flex h-full flex-1 items-end"
                  title={`${p.day} — ${p.views} view(s), ${p.uniques} unique visitor(s)`}
                >
                  <div
                    className="w-full rounded-t-[3px] bg-[#ffd444]/25 transition-colors group-hover:bg-[#ffd444]/70"
                    style={{ height: `${Math.max(p.views > 0 ? 4 : 0, (p.views / chart.max) * 100)}%` }}
                  />
                  {(i % 5 === 0 || i === chart.points.length - 1) && (
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8.5px] text-white/30">
                      {p.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="h-6" />
            <p className="text-[10.5px] text-white/35">
              Gold bars — page views per day. Hover a bar for the exact numbers.
            </p>
          </div>

          {/* Top pages + referrers/devices */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-white/35">
                <Eye size={11} /> Most visited pages · 30 days
              </p>
              <div className="mt-4 max-h-96 space-y-2.5 overflow-y-auto pr-1">
                {data.topPaths.map((p) => (
                  <div key={p.path}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[12px] text-white/85">{p.path}</span>
                      <span className="shrink-0 text-[10.5px] text-white/45">
                        {p.views.toLocaleString()} · {p.uniques.toLocaleString()} uniq
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-[#ffd444]/60"
                        style={{ width: `${Math.max(3, (p.views / maxPathViews) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-white/35">
                  <Globe size={11} /> Where visitors came from · 30 days
                </p>
                {data.referrers.length === 0 ? (
                  <p className="mt-3 text-[12px] text-white/40">
                    No external referrers recorded yet (direct visits don&apos;t
                    count).
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.referrers.map((r) => (
                      <span
                        key={r.host}
                        className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[11px] text-white/70"
                      >
                        {r.host}
                        <span className="ml-1.5 text-[#ffd444]">{r.views.toLocaleString()}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-white/35">
                  <Users size={11} /> Devices · 30 days
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {["mobile", "tablet", "desktop"].map((d) => {
                    const Icon = DEVICE_ICONS[d] ?? Monitor;
                    const row = data.devices.find((x) => x.device === d);
                    const total = Math.max(1, data.devices.reduce((s, x) => s + x.views, 0));
                    return (
                      <div
                        key={d}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center"
                      >
                        <Icon size={14} className="mx-auto text-white/40" />
                        <p className="mt-1.5 font-display text-lg font-semibold text-white">
                          {Math.round(((row?.views ?? 0) / total) * 100)}%
                        </p>
                        <p className="text-[9.5px] uppercase tracking-[0.14em] text-white/35">{d}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <p className="text-[10.5px] text-white/30">
            Updated {new Date(data.generatedAt).toLocaleTimeString("en-GB")} ·
            Counts only — visitor identities never exist (the daily hash rotates
            every Asia/Colombo midnight) · Studios, portals and account pages
            are excluded from tracking.
          </p>
        </>
      )}
    </div>
  );
}
