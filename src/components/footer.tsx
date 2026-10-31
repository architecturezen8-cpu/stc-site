"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { ArrowUp, Clock, Mail, MapPin, Phone } from "lucide-react";
import { SiteCrestImg, useSiteBrand } from "@/components/site-brand";

type IconProps = { size?: number; className?: string };

const FacebookIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const InstagramIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const TwitterXIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const SOCIAL_ICONS: Record<string, ComponentType<IconProps>> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  x: TwitterXIcon,
};

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

/** Settings list keys hold JSON rows; bad/empty values fall back honestly. */
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

export function Footer() {
  /* v2.8.61.0 — the crest is SERVER-DELIVERED (root layout provider) — the
     footer no longer paints the golden disc while the fetch lands.
     v2.8.62.0 — renders through SiteCrestImg (browser remembers the last
     good crest; the golden "S" only after the registry is confirmed empty),
     and the settings refresh can never clobber a good value with "".
     v2.9.1.0 — EVERY footer item is settings-backed now (headings, explore
     links, socials, newsletter, button, copyright, bottom bar).
     v2.9.2.0 — ADMIN-ONLY POLICY (the owner: "visual editor eken mewa edit
     karanna bari wenna one — footer — ewa edit karanna puluwan admin eke
     footer section eken witharai"): data-footer-field marks each item as
     MANAGED — the on-site visual editor refuses to select or patch them
     and points the admin to Admin → Footer. One editor per source. */
  const { schoolLogo: serverLogo } = useSiteBrand();
  const [settings, setSettings] = useState({
    brandName: "St. Thomas' College",
    brandSubline: "Matale · Est. 1873",
    footerDescription:
      "Shaping scholars, athletes, artists and citizens of character in the heart of Matale for over 150 years.",
    phone: "+94 66 222 0173",
    email: "admissions@stcmatale.lk",
    address: "St. Thomas' College, Matale, Sri Lanka",
    officeHours: "Mon – Fri · 7.30 a.m. – 3.30 p.m.",
    footerExploreHeading: "Explore",
    footerContactHeading: "Contact",
    footerAdmissionsHeading: "Admissions 2027",
    footerNewsletterText:
      "Applications for Grade 6 and Advanced Level 2027 intake are now open.",
    footerApplyLabel: "Start Application",
    footerApplyHref: "/admissions",
    footerBackToTop: "Back to top",
    footerCopyright: "© 2026 St. Thomas' College · All Rights Reserved",
    footerExploreItems: "",
    footerSocials: "",
    footerBottomLinks: "",
    schoolLogo: serverLogo,
  });

  useEffect(() => {
    fetch("/api/site-settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) =>
        setSettings((current) => ({
          ...current,
          ...data,
          schoolLogo: data.schoolLogo || current.schoolLogo,
        })),
      )
      .catch(() => undefined);
  }, []);

  const explore = parseLinks(settings.footerExploreItems, FALLBACK_EXPLORE);
  const socials = parseLinks(settings.footerSocials, FALLBACK_SOCIALS);
  const bottomLinks = parseLinks(settings.footerBottomLinks, FALLBACK_BOTTOM);

  return (
    <footer id="contact" className="relative scroll-mt-20 overflow-hidden bg-ink text-white">
      <div className="grain pointer-events-none absolute inset-0" />

      <div className="relative mx-auto max-w-7xl px-5 pt-20 md:px-8 md:pt-24">
        {/* Top row */}
        <div className="grid gap-14 lg:grid-cols-12">
          {/* Brand — v2.9.0.0: stable visual keys so chrome patches stay
              attached to the right element across re-renders. */}
          <div className="lg:col-span-4" data-visual-key="footer-brand">
            <Link href="/#home" className="flex items-center gap-3">
              <SiteCrestImg size={44} alt={`${settings.brandName} logo`} />
              <span className="leading-tight">
                <span
                  className="block font-display text-xl font-semibold tracking-[-0.01em]"
                  data-footer-field="brandName"
                >
                  {settings.brandName}
                </span>
                <span
                  className="block font-sans text-[9px] uppercase tracking-[0.35em] text-white/45"
                  data-footer-field="brandSubline"
                >
                  {settings.brandSubline}
                </span>
              </span>
            </Link>
            <p
              className="mt-6 max-w-sm text-sm leading-relaxed text-white/55"
              data-visual-key="footer-desc"
              data-footer-field="footerDescription"
            >
              {settings.footerDescription}
            </p>
            <div className="mt-8 flex gap-2.5" data-visual-key="footer-socials">
              {socials.map(({ icon, label, href }, index) => {
                const Icon = SOCIAL_ICONS[icon ?? ""] ?? FacebookIcon;
                return (
                  <a
                    key={`${label}-${index}`}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    title={label}
                    data-footer-field="footerSocials"
                    data-footer-index={index}
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-white/65 transition-all duration-300 hover:border-white hover:bg-white hover:text-ink"
                  >
                    <Icon />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Explore */}
          <div className="lg:col-span-2" data-visual-key="footer-explore">
            <p
              className="font-sans text-[10px] uppercase tracking-[0.4em] text-gold"
              data-footer-field="footerExploreHeading"
            >
              {settings.footerExploreHeading}
            </p>
            <ul className="mt-7 space-y-3.5">
              {explore.map((link, index) => (
                <li key={`${link.label}-${index}`}>
                  <Link
                    href={link.href}
                    data-footer-field="footerExploreItems"
                    data-footer-index={index}
                    className="group inline-flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white"
                  >
                    <span className="h-px w-0 bg-gold transition-all duration-300 group-hover:w-3.5" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="lg:col-span-3" data-visual-key="footer-contact">
            <p
              className="font-sans text-[10px] uppercase tracking-[0.4em] text-gold"
              data-footer-field="footerContactHeading"
            >
              {settings.footerContactHeading}
            </p>
            <ul className="mt-7 space-y-5 text-sm text-white/60">
              <li className="flex gap-3.5" data-footer-field="address">
                <MapPin size={16} className="mt-0.5 shrink-0 text-gold" />
                {settings.address}
              </li>
              <li className="flex items-center gap-3.5" data-footer-field="phone">
                <Phone size={16} className="shrink-0 text-gold" />
                {settings.phone}
              </li>
              <li className="flex items-center gap-3.5" data-footer-field="email">
                <Mail size={16} className="shrink-0 text-gold" />
                {settings.email}
              </li>
              <li className="flex gap-3.5" data-footer-field="officeHours">
                <Clock size={16} className="mt-0.5 shrink-0 text-gold" />
                {settings.officeHours}
              </li>
            </ul>
          </div>

          {/* Admissions */}
          <div className="lg:col-span-3" data-visual-key="footer-newsletter">
            <p
              className="font-sans text-[10px] uppercase tracking-[0.4em] text-gold"
              data-footer-field="footerAdmissionsHeading"
            >
              {settings.footerAdmissionsHeading}
            </p>
            <p
              className="mt-7 text-sm leading-relaxed text-white/60"
              data-footer-field="footerNewsletterText"
            >
              {settings.footerNewsletterText}
            </p>
            <div className="mt-6">
              <Link
                href={settings.footerApplyHref || "/admissions"}
                data-footer-field="footerApplyLabel"
                className="inline-flex items-center justify-center rounded-full bg-gold px-7 py-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-white"
              >
                {settings.footerApplyLabel}
              </Link>
            </div>
            <Link
              href="/#home"
              data-footer-field="footerBackToTop"
              className="group mt-8 inline-flex items-center gap-3 font-sans text-[10px] uppercase tracking-[0.25em] text-white/45 transition-colors hover:text-white"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full border border-white/20 transition-colors group-hover:border-white/60">
                <ArrowUp size={14} />
              </span>
              {settings.footerBackToTop}
            </Link>
          </div>
        </div>

        <div className="mt-16" />
      </div>

      {/* Bottom bar */}
      <div className="relative border-t border-white/10" data-visual-key="footer-bottom">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-4 px-5 py-6 text-center font-sans text-[9.5px] uppercase tracking-[0.25em] text-white/35 md:flex-row md:justify-between md:text-left md:px-8">
          <p className="w-full md:w-auto" data-footer-field="footerCopyright">
            {settings.footerCopyright}
          </p>
          <div className="hidden items-center gap-7 md:flex">
            {bottomLinks.map((link, index) => (
              <Link
                key={`${link.label}-${index}`}
                href={link.href}
                data-footer-field="footerBottomLinks"
                data-footer-index={index}
                className="transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
