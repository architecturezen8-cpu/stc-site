"use client";

import { useState } from "react";
import {
  Check,
  Clock,
  ImagePlus,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { MediaLibraryButton } from "@/components/admin/media-picker";

/* v2.9.1.0 — the footer section now edits EVERY item the public footer
   renders: brand, description, contact details, the Explore heading +
   links, social links, the Admissions panel, the copyright line and the
   bottom-bar links.
   v2.9.2.0 — ADMIN-ONLY POLICY: this section is now the ONLY editor of
   the footer. The on-site visual editor no longer touches footer items —
   clicking one there points back here — so Admin Studio and the footer
   share one editor per source and can never corrupt.
   v2.9.3.0 — the owner: "footer eke visual editor eken thama editable
   ewage images tikak damma ona — e tka fixx karanna": the footer's IMAGE
   (the College crest) is now managed HERE as well. The editor writes to
   the ONE central registry entry (logoKey school-crest — the same single
   source Admin → Logos & Crests edits), so the navbar + footer + portals
   all change together and there is still exactly one source of truth. */

type FooterLink = { label: string; href: string; icon?: string };

const FALLBACK_EXPLORE: FooterLink[] = [
  { label: "Home", href: "/#home" },
  { label: "About Us", href: "/#about" },
  { label: "Academics", href: "/#academics" },
  { label: "Online Resources", href: "/resources" },
  { label: "Co-Curricular", href: "/#cocurricular" },
  { label: "News & Events", href: "/news" },
  { label: "Campus Gallery", href: "/gallery" },
  { label: "Admissions", href: "/admissions" },
  { label: "Contact", href: "/contact" },
];

const FALLBACK_SOCIALS: FooterLink[] = [
  { label: "Facebook", href: "https://www.facebook.com/St.ThomasMatale/", icon: "facebook" },
  { label: "Instagram", href: "https://www.instagram.com/stcmum/", icon: "instagram" },
  { label: "X (Twitter)", href: "https://x.com/stcmediaunit", icon: "x" },
  { label: "Media Unit on Facebook", href: "https://www.facebook.com/stcmum/", icon: "facebook" },
];

const FALLBACK_BOTTOM: FooterLink[] = [
  { label: "Admissions Portal", href: "/contact" },
  { label: "Media Archive", href: "/gallery" },
  { label: "Newsroom", href: "/news" },
];

function parseLinks(value: string | undefined, fallback: FooterLink[]): FooterLink[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return fallback;
    const rows = parsed
      .filter((row) => row && typeof row.label === "string" && typeof row.href === "string")
      .map((row) => ({
        label: row.label as string,
        href: row.href as string,
        ...(typeof row.icon === "string" ? { icon: row.icon } : {}),
      }));
    return rows.length > 0 ? rows : fallback;
  } catch {
    return fallback;
  }
}

const textFields: Array<[string, string, string, boolean]> = [
  ["brandName", "Brand name", "St. Thomas' College", false],
  ["brandSubline", "Brand sub-line", "Matale · Est. 1873", false],
  ["footerDescription", "Footer description", "Short college description", true],
  ["address", "Address", "College address", false],
  ["phone", "Main phone", "+94 …", false],
  ["email", "Public email", "office@example.com", false],
  ["officeHours", "Office hours", "Mon – Fri …", false],
  ["footerAdmissionsHeading", "Admissions panel heading", "Admissions 2027", false],
  ["footerNewsletterText", "Admissions panel text", "Applications … are now open.", true],
  ["footerApplyLabel", "Apply button label", "Start Application", false],
  ["footerApplyHref", "Apply button link", "/admissions", false],
  ["footerBackToTop", "Back-to-top label", "Back to top", false],
  ["footerCopyright", "Copyright line", "© 2026 … All Rights Reserved", false],
];

const input =
  "h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";
const listInput =
  "h-10 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12.5px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

function LinkListEditor({
  hint,
  rows,
  onChange,
  withIcon = false,
}: {
  hint: string;
  rows: FooterLink[];
  onChange: (rows: FooterLink[]) => void;
  withIcon?: boolean;
}) {
  const update = (index: number, patch: Partial<FooterLink>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-[10.5px] leading-relaxed text-white/35">{hint}</p>
      <div className="mt-3 space-y-2.5">
        {rows.map((row, index) => (
          <div
            key={index}
            className={`grid items-center gap-2 ${withIcon ? "sm:grid-cols-[1fr_1.4fr_0.7fr_auto]" : "sm:grid-cols-[1fr_1.4fr_auto]"}`}
          >
            <input
              value={row.label}
              onChange={(e) => update(index, { label: e.target.value })}
              placeholder="Label"
              aria-label={`Link ${index + 1} label`}
              className={listInput}
            />
            <input
              value={row.href}
              onChange={(e) => update(index, { href: e.target.value })}
              placeholder="/page or https://…"
              aria-label={`Link ${index + 1} destination`}
              className={`${listInput} font-mono text-[11.5px]`}
            />
            {withIcon && (
              <select
                value={row.icon ?? "facebook"}
                onChange={(e) => update(index, { icon: e.target.value })}
                aria-label={`Link ${index + 1} icon`}
                className={listInput}
              >
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="x">X (Twitter)</option>
              </select>
            )}
            <button
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              aria-label={`Remove link ${index + 1}`}
              title="Remove this link"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white/35 transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...rows, { label: "", href: "", ...(withIcon ? { icon: "facebook" } : {}) }])}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-white/12 px-4 text-[11px] font-semibold text-white/55 transition-colors hover:border-[#ffd444]/50 hover:text-[#ffd444]"
      >
        <Plus size={12} /> Add link
      </button>
    </div>
  );
}

export function FooterManager({
  initial,
  crestSrc: initialCrestSrc,
}: {
  initial: Record<string, string>;
  /** v2.8.60.0 — the registry crest. v2.9.3.0 — editable right here (the
      editor PATCHes the central registry, never a footer-local copy). */
  crestSrc: string;
}) {
  const [data, setData] = useState(initial);
  const [explore, setExplore] = useState(() =>
    parseLinks(initial.footerExploreItems, FALLBACK_EXPLORE),
  );
  const [socials, setSocials] = useState(() =>
    parseLinks(initial.footerSocials, FALLBACK_SOCIALS),
  );
  const [bottomLinks, setBottomLinks] = useState(() =>
    parseLinks(initial.footerBottomLinks, FALLBACK_BOTTOM),
  );
  const [busy, setBusy] = useState<"save" | "publish" | "crest" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /* v2.9.3.0 — footer crest image state (central registry backed). */
  const [crestSrc, setCrestSrc] = useState(initialCrestSrc);
  const [crestUrl, setCrestUrl] = useState(initialCrestSrc);

  const submit = async (publish: boolean) => {
    setBusy(publish ? "publish" : "save");
    setMessage(null);
    const payload = {
      ...data,
      footerExploreItems: JSON.stringify(explore),
      footerSocials: JSON.stringify(socials),
      footerBottomLinks: JSON.stringify(bottomLinks),
    };
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: payload, publish }),
    });
    const json = await res.json();
    setMessage(res.ok ? (publish ? "Footer published to the site." : "Footer draft saved.") : json.error);
    setBusy(null);
  };

  /* v2.9.3.0 — save the crest through the CENTRAL REGISTRY (the same one
     source Logos & Crests uses) and publish it in one step, so the footer,
     navbar and portals change together with zero second copies. */
  const saveCrest = async () => {
    const url = crestUrl.trim();
    if (!url) {
      setMessage("Paste an image URL or pick one from the Media Library first.");
      return;
    }
    setBusy("crest");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/logos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoKey: "school-crest", src: url, publish: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update the crest.");
      const next = json.logo?.publishedSrc || json.logo?.draftSrc || url;
      setCrestSrc(next);
      setCrestUrl(next);
      setMessage("Crest updated — the footer, navbar and portals all show the new image.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update the crest.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.75fr]">
      <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">Dedicated section</p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em]">Site footer</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/45">
          Every item the public footer shows — brand, description, contact
          details, Explore links, socials, the Admissions panel, the copyright
          line and the bottom bar — edited in one place. The footer is edited
          ONLY here: the on-site visual editor points here, so there is
          exactly one source of truth.
        </p>

        <div className="mt-7 grid gap-5">
          {textFields.map(([key, label, placeholder, long]) => (
            <label key={key} className="block">
              <span className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">{label}</span>
              {long ? (
                <textarea
                  rows={3}
                  value={data[key] ?? ""}
                  onChange={(e) => setData((d) => ({ ...d, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full resize-y rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-[13px] leading-relaxed text-white outline-none focus:border-[#ffd444]"
                />
              ) : (
                <input
                  value={data[key] ?? ""}
                  onChange={(e) => setData((d) => ({ ...d, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className={input}
                />
              )}
            </label>
          ))}

          <label className="block">
            <span className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">Explore column heading</span>
            <input
              value={data.footerExploreHeading ?? ""}
              onChange={(e) => setData((d) => ({ ...d, footerExploreHeading: e.target.value }))}
              placeholder="Explore"
              className={input}
            />
          </label>
          <LinkListEditor
            hint="Explore column links — the menu under the heading."
            rows={explore}
            onChange={setExplore}
          />

          <label className="block">
            <span className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">Contact column heading</span>
            <input
              value={data.footerContactHeading ?? ""}
              onChange={(e) => setData((d) => ({ ...d, footerContactHeading: e.target.value }))}
              placeholder="Contact"
              className={input}
            />
          </label>

          <LinkListEditor
            hint="Social icons — pick the platform, set the full profile URL."
            rows={socials}
            onChange={setSocials}
            withIcon
          />

          <LinkListEditor
            hint="Bottom bar links — the small links beside the copyright line."
            rows={bottomLinks}
            onChange={setBottomLinks}
          />

          {/* v2.9.3.0 — the footer's image is edited RIGHT HERE now. It
              writes to the ONE central registry entry (logoKey
              school-crest), so the crest changes on the footer, navbar
              and portals together — still exactly one source of truth,
              no second copies that can drift or corrupt. */}
          <div className="rounded-xl border border-[#ffd444]/30 bg-[#ffd444]/[0.06] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[#ffd444]">
                  Footer crest image
                </p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-white/40">
                  The round College Crest shown at the top of the footer.
                  This is the central registry entry — one image, used by the
                  footer, the navbar and every portal together.
                </p>
              </div>
              {crestSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={crestSrc}
                  alt="Current College Crest"
                  className="h-12 w-12 shrink-0 rounded-full border border-white/20 bg-white object-contain p-0.5"
                />
              ) : (
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#ffd444] font-display text-lg font-semibold text-[#0b0b0a]">
                  S
                </span>
              )}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={crestUrl}
                onChange={(event) => setCrestUrl(event.target.value)}
                placeholder="https://… crest image URL"
                aria-label="Footer crest image URL"
                className={`${input} font-mono text-[11.5px]`}
              />
              <div className="flex gap-2">
                <MediaLibraryButton
                  preferFolder="site-assets"
                  title="Pick crest image"
                  onSelect={(picked) => setCrestUrl(picked.url)}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-white/15 px-4 text-[11px] font-semibold text-white/70 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444]"
                />
                <button
                  onClick={() => void saveCrest()}
                  disabled={busy === "crest"}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#ffd444] px-4 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
                >
                  {busy === "crest" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <ImagePlus size={13} />
                  )}
                  Update crest
                </button>
              </div>
            </div>
          </div>
        </div>

        {message && <div className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-400/10 px-4 py-3 text-[12px] text-emerald-300"><Check size={14} />{message}</div>}
        <div className="mt-7 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
          <button onClick={() => submit(false)} disabled={busy !== null} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/15 px-6 text-[12px] font-semibold text-white/70 hover:border-white/35 hover:text-white disabled:opacity-50">{busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save draft</button>
          <button onClick={() => submit(true)} disabled={busy !== null} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-6 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-50">{busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Publish footer</button>
        </div>
      </section>

      {/* Live footer preview — mirrors the public footer */}
      <aside className="min-w-0 rounded-2xl border border-white/10 bg-[#0d0d0b] p-6 sm:p-7">
        <p className="text-[9px] uppercase tracking-[0.25em] text-[#ffd444]">Live preview</p>
        <div className="mt-6 rounded-xl border border-white/12 bg-[#0a0a09] p-5">
          <div className="flex items-center gap-3">
            {crestSrc ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={crestSrc} alt="" className="h-11 w-11 rounded-full border border-white/15 bg-white object-contain p-1" />
            ) : (
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#ffd444] font-display text-lg font-semibold text-[#0b0b0a]">S</span>
            )}
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-[15px] font-semibold">{data.brandName}</span>
              <span className="block truncate text-[8px] uppercase tracking-[0.26em] text-white/40">{data.brandSubline}</span>
            </span>
          </div>
          <p className="mt-5 text-[12.5px] leading-relaxed text-white/50">{data.footerDescription}</p>
          <div className="mt-5 space-y-2.5 border-t border-white/10 pt-4 text-[11.5px] text-white/45">
            <p className="flex items-start gap-2.5"><MapPin size={13} className="mt-0.5 shrink-0 text-[#ffd444]/70" />{data.address}</p>
            <p className="flex items-center gap-2.5"><Phone size={13} className="shrink-0 text-[#ffd444]/70" />{data.phone}</p>
            <p className="flex items-center gap-2.5"><Mail size={13} className="shrink-0 text-[#ffd444]/70" />{data.email}</p>
            <p className="flex items-center gap-2.5"><Clock size={13} className="shrink-0 text-[#ffd444]/70" />{data.officeHours}</p>
          </div>
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-[9px] uppercase tracking-[0.26em] text-[#ffd444]/80">{data.footerExploreHeading}</p>
            <ul className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-white/45">
              {explore.map((link, index) => (
                <li key={index}>{link.label || "—"}</li>
              ))}
            </ul>
          </div>
          <p className="mt-5 border-t border-white/10 pt-4 text-[10px] uppercase tracking-[0.2em] text-white/30">
            {data.footerCopyright}
          </p>
        </div>
      </aside>
    </div>
  );
}
