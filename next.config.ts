import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // v2.8.82.1 — vibe-check scan (Task 75): the X-Powered-By: Next.js header
  // discloses the stack to attackers fingerprinting the site. Off it goes.
  poweredByHeader: false,
  // PGlite ships WASM binaries that must not be bundled by the compiler,
  // and keeps its state on globalThis — render workers would each open a
  // second instance against the same data directory and abort.
  // "pg" (node-postgres, Supabase Phase 2.2 driver) stays external for the
  // same reason — it must run in the Node server runtime, not the bundle.
  // "sharp" (v2.8.66.2) — Next 16 dropped sharp from its default externals,
  // so Turbopack bundled the native binary into route chunks and every
  // sharp-importing route 500'd at module init on Vercel. External it is.
  // "@img/sharp-libvips-linux-x64" (v2.8.66.3) — sharp's binding .node
  // dlopens libvips-cpp.so from this sibling package at runtime; the file
  // tracer shipped the binding but NOT the 18.7 MB libvips package (no JS
  // entry to follow) → ERR_DLOPEN_FAILED on Vercel. External + explicit
  // trace includes below pin both binaries into the function bundles.
  serverExternalPackages: [
    "@electric-sql/pglite",
    "pg",
    "sharp",
    "@img/sharp-libvips-linux-x64",
  ],
  // v2.8.66.3 — belt & braces: the two sharp-importing routes get the full
  // native binary set no matter what the tracer decides on its own.
  outputFileTracingIncludes: {
    "/api/media/thumb": [
      "./node_modules/sharp/**",
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
    "/api/admin/media/finalize": [
      "./node_modules/sharp/**",
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
  },
  // The preview panel proxies the dev server through a *.space-z.ai host —
  // without this Next blocks dev-only assets (fonts, HMR) cross-origin.
  // v2.8.86.0 — "127.0.0.1" joins: the sandbox browser QA reaches the app
  // through the Caddy gateway on 127.0.0.1:81, and without it Next silently
  // refuses the dev assets for that Host (page HTML loads, hydration never
  // happens — clicks do nothing).
  allowedDevOrigins: ["*.space-z.ai", "127.0.0.1"],
  // v2.8.85.0 — SANDBOX WATCHER GUARD. The dev sandbox caps inotify watches
  // at 8192 while the project tree carries ~9.5k non-node_modules files, so
  // Turbopack's watcher periodically died with FATAL "Unable to watch …
  // Permission denied" panics (src/app/fonts, skills/web-search) that took
  // the whole dev server down mid-compile. Keep the watcher on SOURCE only:
  // everything below is runtime data, platform tooling or scratch space —
  // no route/page/component lives there. src/** and public/** stay watched.
  // (v2.8.87.1: this Next build's TurbopackOptions type predates watchOptions
  // — it IS honoured at runtime, the cast only satisfies tsc.)
  turbopack: {
    watchOptions: {
      ignored: [
        "skills/**",
        "tool-results/**",
        "upload/**",
        "examples/**",
        "mini-services/**",
        ".zscripts/**",
        ".data/**",
        "db/**",
        "backups/**",
        "reports/**",
      ],
    },
  } as NextConfig["turbopack"],
  experimental: {
    workerThreads: false,
    cpus: 1,
    /* v2.8.67.1 — D.2: the proxy (dev middleware) buffers request bodies and
       truncates them at 10 MB by default, which silently broke every
       classroom upload over that size (the multipart route 500s mid-parse).
       Raise the cap so the SANDBOX proxy path can carry the 100 MB video
       cap end-to-end while the B2 CORS rule is still off. Vercel does not
       use this proxy — its ~4.5 MB serverless body cap applies there until
       the bucket's CORS radio enables direct browser PUTs. */
    proxyClientMaxBodySize: "128mb",
    /* v2.8.59.1 — OOM GUARD. The sandbox is a 4 GB cgroup and dev-server
       deaths were chronic (dmesg: next-server anon-rss 2.8–3.2 GB →
       oom-killed). Turbopack's engine otherwise keeps every compiled module
       of this ~100-route app resident until IT decides to collect. Setting
       the target limit in BYTES (the unit this Next build's config type
       documents) makes the engine run its garbage collector as it
       approaches the cap, trading a little recompile latency for a
       server that stays alive. v2.8.66.5: 1.5 GiB → 768 MiB — the
       restored 62–64 feature tree enlarged the compile graph and the old
       cap still allowed ~2.8 GB RSS, which the 4 GB sandbox kernel kept
       killing. */
    turbopackMemoryLimit: 805306368,
  },
  // v2.8.78.0 — GLOBAL SECURITY HEADERS (the Phase 2.10 launch gap).
  // CSP is pragmatic, not performative: Next.js REQUIRES 'unsafe-inline'
  // scripts (its hydration bootstrap + the static theme-init blocks), so the
  // real wins here are frame-ancestors 'self' (clickjacking), object-src
  // 'none', base-uri/form-action lockdown, and denying every external
  // script/connect host while keeping exactly the ones the site uses
  // (B2 direct PUTs, YouTube embeds, CMS image hosts). Dev relaxations:
  // 'unsafe-eval' (Turbopack HMR), ws: (HMR socket), and frame-ancestors
  // *.space-z.ai so the sandbox preview panel can still embed the app —
  // production (Vercel) ships the strict set with HSTS.
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' https://*.backblazeb2.com${isDev ? " ws: wss:" : ""}`,
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
      "media-src 'self' https: blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      `frame-ancestors 'self'${isDev ? " https://*.space-z.ai" : ""}`,
    ].join("; ");
    const base: { key: string; value: string }[] = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    if (!isDev) {
      base.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      });
      // v2.8.82.3 — vibe-check re-run (Task 76) WARN: legacy browsers ignore
      // CSP frame-ancestors, so the clickjacking guard needs X-Frame-Options
      // too. SAMEORIGIN matches frame-ancestors 'self' exactly — the admin
      // visual/live-site editors iframe these same pages via RELATIVE urls
      // (same-origin), so previews keep working. Dev stays without it: the
      // sandbox preview panel frames the app cross-origin (*.space-z.ai is
      // allowed only through frame-ancestors, which modern browsers already
      // prefer over XFO).
      base.push({ key: "X-Frame-Options", value: "SAMEORIGIN" });
    }
    return [{ source: "/:path*", headers: base }];
  },
  images: {
    localPatterns: [
      // Static site images.
      { pathname: "/images/**" },
      // v2.8.39.0 — generated illustrations & avatars (studio hero, empty
      // states, student avatars) served from /public.
      { pathname: "/illustrations/**" },
      { pathname: "/avatars/**" },
      // Media library objects served from the local storage driver
      // (/api/media/file?key=…) — search omitted allows any query string.
      { pathname: "/api/media/file" },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        // v2.8.93.0 — a staff member carries an unsplash portrait URL; the
        // missing host crashed the whole /staff page in dev (next/image
        // host check) and 400-ed the optimizer in production (Task 97, H14).
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        // v2.8.65.0 — Backblaze B2 public-bucket friendly URLs (the R2-driver
        // media provider). A custom CDN domain in front of B2 gets added here.
        hostname: "**.backblazeb2.com",
      },
    ],
  },
};

export default nextConfig;
