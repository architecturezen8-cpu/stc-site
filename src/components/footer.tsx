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

const explore = [
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

const socials: {
  icon: ComponentType<IconProps>;
  label: string;
  href: string;
}[] = [
  {
    icon: FacebookIcon,
    label: "Facebook",
    href: "https://www.facebook.com/St.ThomasMatale/",
  },
  {
    icon: InstagramIcon,
    label: "Instagram",
    href: "https://www.instagram.com/stcmum/",
  },
  {
    icon: TwitterXIcon,
    label: "X (Twitter)",
    href: "https://x.com/stcmediaunit",
  },
  {
    icon: FacebookIcon,
    label: "Media Unit on Facebook",
    href: "https://www.facebook.com/stcmum/",
  },
];

export function Footer() {
  /* v2.8.61.0 — the crest is SERVER-DELIVERED (root layout provider) — the
     footer no longer paints the golden disc while the fetch lands.
     v2.8.62.0 — renders through SiteCrestImg (browser remembers the last
     good crest; the golden "S" only after the registry is confirmed empty),
     and the settings refresh can never clobber a good value with "". */
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
    admissionsYear: "2027",
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

  return (
    <footer id="contact" className="relative scroll-mt-20 overflow-hidden bg-ink text-white">
      <div className="grain pointer-events-none absolute inset-0" />

      <div className="relative mx-auto max-w-7xl px-5 pt-20 md:px-8 md:pt-24">
        {/* Top row */}
        <div className="grid gap-14 lg:grid-cols-12">
          {/* Brand */}
          <div className="lg:col-span-4">
            <Link href="/#home" className="flex items-center gap-3">
              <SiteCrestImg size={44} alt={`${settings.brandName} logo`} />
              <span className="leading-tight">
                <span className="block font-display text-xl font-semibold tracking-[-0.01em]">
                  {settings.brandName}
                </span>
                <span className="block font-sans text-[9px] uppercase tracking-[0.35em] text-white/45">
                  {settings.brandSubline}
                </span>
              </span>
            </Link>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/55">
              {settings.footerDescription}
            </p>
            <div className="mt-8 flex gap-2.5">
              {socials.map(({ icon: Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-white/65 transition-all duration-300 hover:border-white hover:bg-white hover:text-ink"
                >
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          {/* Explore */}
          <div className="lg:col-span-2">
            <p className="font-sans text-[10px] uppercase tracking-[0.4em] text-gold">
              Explore
            </p>
            <ul className="mt-7 space-y-3.5">
              {explore.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
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
          <div className="lg:col-span-3">
            <p className="font-sans text-[10px] uppercase tracking-[0.4em] text-gold">
              Contact
            </p>
            <ul className="mt-7 space-y-5 text-sm text-white/60">
              <li className="flex gap-3.5">
                <MapPin size={16} className="mt-0.5 shrink-0 text-gold" />
                {settings.address}
              </li>
              <li className="flex items-center gap-3.5">
                <Phone size={16} className="shrink-0 text-gold" />
                {settings.phone}
              </li>
              <li className="flex items-center gap-3.5">
                <Mail size={16} className="shrink-0 text-gold" />
                {settings.email}
              </li>
              <li className="flex gap-3.5">
                <Clock size={16} className="mt-0.5 shrink-0 text-gold" />
                {settings.officeHours}
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div className="lg:col-span-3">
            <p className="font-sans text-[10px] uppercase tracking-[0.4em] text-gold">
              Admissions 2027
            </p>
            <p className="mt-7 text-sm leading-relaxed text-white/60">
              Applications for Grade 6 and Advanced Level {settings.admissionsYear} intake are now open.
            </p>
            <div className="mt-6">
              <Link
                href="/admissions"
                className="inline-flex items-center justify-center rounded-full bg-gold px-7 py-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-white"
              >
                Start Application
              </Link>
            </div>
            <Link
              href="/#home"
              className="group mt-8 inline-flex items-center gap-3 font-sans text-[10px] uppercase tracking-[0.25em] text-white/45 transition-colors hover:text-white"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full border border-white/20 transition-colors group-hover:border-white/60">
                <ArrowUp size={14} />
              </span>
              Back to top
            </Link>
          </div>
        </div>

        <div className="mt-16" />
      </div>

      {/* Bottom bar */}
      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-4 px-5 py-6 text-center font-sans text-[9.5px] uppercase tracking-[0.25em] text-white/35 md:flex-row md:justify-between md:text-left md:px-8">
          <p className="w-full md:w-auto">© 2026 St. Thomas&apos; College · All Rights Reserved</p>
          <div className="hidden items-center gap-7 md:flex">
            <Link href="/contact" className="transition-colors hover:text-white">
              Admissions Portal
            </Link>
            <Link href="/gallery" className="transition-colors hover:text-white">
              Media Archive
            </Link>
            <Link href="/news" className="transition-colors hover:text-white">
              Newsroom
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
