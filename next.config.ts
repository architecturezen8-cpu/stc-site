import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  allowedDevOrigins: ["*.space-z.ai"],
  experimental: {
    workerThreads: false,
    cpus: 1,
    /* v2.8.59.1 — OOM GUARD. The sandbox is a 4 GB cgroup and dev-server
       deaths were chronic (dmesg: next-server anon-rss 2.8–3.2 GB →
       oom-killed). Turbopack's engine otherwise keeps every compiled module
       of this ~100-route app resident until IT decides to collect. Setting
       the target limit in BYTES (the unit this Next build's config type
       documents) makes the engine run its garbage collector as it
       approaches 1.5 GiB, trading a little recompile latency for a
       server that stays alive. */
    turbopackMemoryLimit: 1610612736,
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
