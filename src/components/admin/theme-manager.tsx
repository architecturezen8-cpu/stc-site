"use client";

import { useState } from "react";
import { Check, Loader2, Palette, Sparkles } from "lucide-react";
import type { AdminTheme } from "@/components/admin/admin-shell";

/**
 * Admin → Theme — the user picks their Admin Studio colour theme / style.
 * Each preset is a cinematic gradient over black; the choice applies
 * instantly (broadcast to AdminShell) and is published for every device.
 */
const THEMES: Array<{
  key: AdminTheme;
  name: string;
  tagline: string;
  accent: string;
  ink: string;
  gradient: string;
}> = [
  {
    key: "gold",
    name: "Cinematic Gold",
    tagline: "Black + yellow — the signature look (default)",
    accent: "#ffd444",
    ink: "#0b0b0a",
    gradient:
      "radial-gradient(420px 260px at 82% -10%, rgba(255,212,68,0.30), transparent 62%), radial-gradient(360px 240px at -8% 112%, rgba(255,176,32,0.14), transparent 58%), #08080a",
  },
  {
    key: "royal",
    name: "Royal Midnight",
    tagline: "Black + #010736 deep-blue glow",
    accent: "#8fb2ff",
    ink: "#051031",
    gradient:
      "radial-gradient(420px 260px at 82% -10%, rgba(23,62,195,0.55), transparent 62%), radial-gradient(360px 240px at -8% 112%, rgba(1,7,54,0.85), transparent 58%), #06070d",
  },
  {
    key: "violet",
    name: "Violet Aura",
    tagline: "Black + #792CA2 purple glow",
    accent: "#d795ff",
    ink: "#1c0829",
    gradient:
      "radial-gradient(420px 260px at 82% -10%, rgba(121,44,162,0.62), transparent 62%), radial-gradient(360px 240px at -8% 112%, rgba(64,18,92,0.55), transparent 58%), #08060c",
  },
  {
    key: "dark",
    name: "Pure Dark",
    tagline: "No colour glow — calm neutral studio",
    accent: "#ffd444",
    ink: "#0b0b0a",
    gradient:
      "radial-gradient(420px 260px at 82% -10%, rgba(255,255,255,0.07), transparent 62%), #08080a",
  },
];

export function ThemeManager({ initialTheme }: { initialTheme: AdminTheme }) {
  const [theme, setTheme] = useState<AdminTheme>(initialTheme);
  const [busy, setBusy] = useState<AdminTheme | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const pick = async (key: AdminTheme) => {
    if (busy) return;
    setBusy(key);
    setMessage(null);
    /* Apply instantly — the shell listens for this broadcast. */
    window.dispatchEvent(
      new CustomEvent("stc-admin-theme", { detail: { theme: key } }),
    );
    setTheme(key);
    try {
      const res = await fetch("/api/admin/theme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: key }),
      });
      const json = await res.json().catch(() => ({}));
      setMessage(res.ok ? "Theme applied and published." : json.error ?? "Unable to save theme.");
      if (!res.ok) {
        /* Roll back the optimistic application. */
        setTheme(initialTheme);
        window.dispatchEvent(
          new CustomEvent("stc-admin-theme", { detail: { theme: initialTheme } }),
        );
      }
    } catch {
      setMessage("Network error — theme not saved.");
      setTheme(initialTheme);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <div className="flex items-center gap-2.5">
          <Palette size={16} className="text-[#ffd444]" />
          <h2 className="font-display text-xl font-semibold tracking-[-0.01em]">
            Admin colour theme
          </h2>
        </div>
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-white/45">
          Pick the cinematic style for your Admin Studio — every page, dialog,
          slider and control follows the theme. Your choice is saved for all
          your devices.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {THEMES.map((t) => {
            const active = theme === t.key;
            return (
              <button
                key={t.key}
                onClick={() => pick(t.key)}
                disabled={busy !== null}
                aria-pressed={active}
                className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 disabled:opacity-60 ${
                  active
                    ? "border-[#ffd444] ring-1 ring-[#ffd444]/50"
                    : "border-white/12 hover:border-white/30"
                }`}
                style={{ background: t.gradient }}
              >
                {active && (
                  <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-[#ffd444] text-[#0b0b0a]">
                    <Check size={13} />
                  </span>
                )}
                {busy === t.key && (
                  <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-black/50 text-white">
                    <Loader2 size={13} className="animate-spin" />
                  </span>
                )}
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[8.5px] font-bold uppercase tracking-[0.16em]"
                  style={{ background: t.accent, color: t.ink }}
                >
                  <Sparkles size={10} /> {t.key === "gold" ? "Default" : "Preset"}
                </span>
                <span className="mt-16 block font-display text-[15px] font-semibold text-white">
                  {t.name}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-white/45">
                  {t.tagline}
                </span>
                {/* Mini studio mock — sidebar + accent button */}
                <span className="mt-4 flex items-center gap-2">
                  <span
                    className="grid h-7 w-7 place-items-center rounded-lg text-[10px] font-bold"
                    style={{ background: t.accent, color: t.ink }}
                  >
                    A
                  </span>
                  <span className="h-1.5 w-14 rounded-full bg-white/15" />
                  <span className="h-1.5 w-8 rounded-full bg-white/10" />
                </span>
              </button>
            );
          })}
        </div>

        {message && (
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-400/10 px-4 py-3 text-[12px] text-emerald-300">
            <Check size={14} /> {message}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">
          How themes work
        </h2>
        <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-white/45">
          <li>• The theme paints a cinematic colour gradient over the black studio canvas.</li>
          <li>• Accent colours on buttons, sliders, checkboxes and focus rings follow the preset.</li>
          <li>• The look applies to every admin page immediately — no reload needed.</li>
        </ul>
      </section>
    </div>
  );
}
