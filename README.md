# St. Thomas' College, Matale — Website & Admin Platform

A production-focused school website and mobile-first visual content management platform built with Next.js App Router, React, Drizzle ORM and PostgreSQL.

> **Current build: v2.8.66.6** — this README is updated at EVERY release (the owner's rule: "readme eka update karana eka off karada" — it was never off; the detailed changelog lived in README-NEW.md while this file froze at v2.8.16. Both files now carry the full version history, updated together every release).
>
> *2026-10-23: a sandbox workspace rollback wiped the working tree; the 66.x rows below were reconstructed from the live sessions (worklog Task 12).*

| Version | Highlights |
| --- | --- |
| 2.8.66.6 | **MEDIA FIXED FOR VERCEL — private-bucket serving + CORS-proof uploads** (owner: "upload error eka thama fix wela na" with a B2 CORS 403 on the presigned PUT plus five `/api/media/file` 404s for the crest/logos on stc-site-eta.vercel.app). Three root causes, all fixed and browser-verified end-to-end: (1) `/api/media/file` refused to serve anything when the driver was r2 — a hard 404 even though every database-era image (school crest, logos) sat safely in `media_blobs`; the route now streams the configured provider's objects and FALLS BACK to `media_blobs` when the object is not in the bucket — legacy images render on Vercel again (verified 200 image/webp byte-for-byte). (2) The r2 driver's `getPublicUrl` stored raw endpoint URLs (`s3.us-east-005.backblazeb2.com/stc-media/…`) that a private bucket can never serve; it now stores the `/api/media/file?key=…` proxy path — the exact pattern the database driver already used — so every NEW upload renders too, and the bucket can stay private. (3) The `/api/admin/media/upload` multipart route had vanished a THIRD time (sandbox rollback after-effect) — restored verbatim from git history — and both upload clients (Media Library + Media Picker) now FALL BACK to it automatically when the provider refuses the browser-direct presigned PUT (in practice: missing B2 CORS rules — the live probe confirmed the bucket has zero CORS rules, 403 "This CORS request is not allowed"); files ≤4 MB (Vercel's ~4.5 MB serverless body cap) upload through the server with ZERO CORS involvement, larger files get a clear fix-the-CORS message instead of a dead spinner. The bucket-scoped B2 app key cannot change bucket settings by design, so `scripts/b2-set-cors.mjs` is ready to run the moment a full-capability key (or the master key) is provided; the web-UI radio step ("Share everything in this bucket with every origin") remains the owner's one-click alternative. Live browser E2E on the sandbox (same r2 driver + same remote DB as production): upload ran direct→blocked→auto-fallback→complete, r2 WebP variants stored with proxy URLs, master served 200 image/webp from B2, legacy crest 200 from `media_blobs`; Media Library grid rendered both R2 and DATABASE badges; test asset + QA admin + B2 objects fully cleaned up afterwards. Bonus: eslint's new `react-hooks/set-state-in-effect` error in site-brand fixed via the render-time adjustment pattern (server crest wins, async-only state elsewhere). tsc 0 errors, eslint clean. APP_VERSION 2.8.66.5 → **2.8.66.6**; owner zip re-shipped. |
| 2.8.66.5 | **THE REPORT-CARD RESTORATION — off-site backup repaid its debt** (owner: "zip eke version eka updated kiyala watunata report card seen eka ehema na"). Root cause: the sandbox rollback had rewound the tree to the v2.8.60.0 checkpoint and the Task-12 recovery re-applied only the 66.2–66.4 sharp/upload deltas — every feature from the 62–64 era (report-card certification lifecycle, Principal portal, signature studio, rollover UNDO, promotion page, portal UI refresh) was still missing while the version label claimed 66.4. Recovery: the v2.8.64.0 snapshot pushed to the off-site backup repo (commit ca8805f) carried the complete feature tree — 78 files restored verbatim from it (25 new: portal report-card + signature APIs, parent/student/teacher/principal report-card pages, principal portal, certify-actions/report-card-editor/report-card-sheet/signature-studio components, lms-rollover-manager + undo route, promotion page; 53 refreshed: portal shell/nav, teacher & parent pages, schema-lms + schema-extras with lms_report_cards/lms_report_marks/lms_report_terms/lms_signatures/lms_report_card_events, portal-auth with the Principal role, verification), while the 66.3/66.4 sharp hardening files (thumb route, media-processing, next.config) stayed untouched. Live Supabase probe: all five report-card tables present WITH data (1 card, 12 marks, 3 terms, 3 signatures, 4 events) — the DB never lost anything, only the code had. One real bug fixed in the restored rollover manager: the undo card dereferenced `data.lastRollover` whenever `undoResult` was set (19 TS errors + a latent crash) — now guarded via a narrowed local. OOM defence restored to the shipped 1024 MB dev heap. tsc 0 errors, eslint clean. APP_VERSION 2.8.66.4 → **2.8.66.5**; owner zip re-shipped. Artifact refresh in-session: `turbopackMemoryLimit` 1.5 GiB → 768 MiB in next.config (the restored feature tree enlarged the compile graph; the old cap still allowed ~2.8 GB RSS and the 4 GB sandbox kernel kept OOM-killing dev — Vercel unaffected). |
| 2.8.66.4 | **UPLOADS CAN NEVER DIE AGAIN — sharp-optional finalize + CORS steps that match the real dialog** (owner's screenshot of the Backblaze CORS dialog showed it only offers radio presets — no JSON field — while DEPLOY-VERCEL.md still said "paste this JSON"; and if sharp were still broken on the host, finalize would 400 even after the CORS save). (1) DEPLOY-VERCEL.md rewritten to the dialog as it actually is: pick **"Share everything in this bucket with every origin"** (2nd radio) → Update CORS Rules → ~1 minute to take effect; the exact JSON remains only as a CLI fallback using the account master key (the scoped app key cannot update buckets by design). Private bucket stays private — every GET still needs a signed URL. (2) media-processing now DEGRADES instead of failing: when the native pipeline cannot load, the original file is stored as the single "master" variant after a magic-byte sniff (JPEG/PNG/WebP/AVIF/HEIC — judged from the file header, never client headers), with dimensions/blur/dominant unknown and EXIF not stripped (documented trade-off, audit-logged as `original-stored`/`sharp-unavailable`); the upload loop is now network/CORS-sensitive only and can never again be killed by native-binary trouble; the normal WebP variant pipeline is unchanged when sharp loads. Verified with a sandbox probe that pushed a real JPEG through the degrade path against the live DB + B2 storage (asset + master variant + audit row created, then fully cleaned up), tsc + eslint clean. APP_VERSION 2.8.66.3 → **2.8.66.4**; owner zip re-shipped. |
| 2.8.66.3 | **THE LIBVIPS TRACE FIX — sharp binaries pinned into the Vercel bundle** (owner's post-deploy log: the 66.2 lazy fallback worked — `edia/thumb] sharp failed to load — serving originals` instead of a 500 — but the real upload was still dead: `ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.7: cannot open shared object file`). Root cause: Vercel's file tracer shipped sharp's binding (`@img/sharp-linux-x64`, proven present by the dlopen attempt) but DROPPED its 18.7 MB sibling `@img/sharp-libvips-linux-x64` — the package has no JS entry the tracer can follow, just the `.so` the binding dlopens via rpath. Triple fix: (1) `outputFileTracingIncludes` in next.config.ts pins `sharp` + both `@img` binary packages into the `/api/media/thumb` and `/api/admin/media/finalize` function bundles; (2) both packages added to `serverExternalPackages` so Turbopack emits runtime requires the tracer can see; (3) both sharp loaders (thumb route + media-processing `getSharp`) carry a caught hint import of the libvips stub — a literal in the module graph the tracer always follows. Hint sits in its own try/catch so non-glibc dev platforms are unaffected. Owner note: `The direct upload connection failed.` is the XHR onerror string = the B2 PUT still blocked at network level → the one-time B2 CORS rule must ALSO be saved in the Backblaze console; deploy + CORS rule together finish the upload loop. APP_VERSION 2.8.66.2 → **2.8.66.3**; owner zip re-shipped. |
| 2.8.66.2 | **THE VERCEL IMAGE FIX** (owner: live deploy 500s on `/api/media/thumb` ×10 and the presigned PUT to `s3.us-east-005.backblazeb2.com/stc-media` is blocked by CORS). Root causes + fixes: (1) Next 16 dropped sharp from its default `serverExternalPackages`, so Turbopack bundled the native binary into route chunks and every sharp-importing route crashed at MODULE INIT on Vercel (invalid-src probe returned the static 500 page) — sharp externalized and both importers lazy-load it inside try/catch; the thumb route can never 500 again (worst case 302 to the original, `sharp failed to load — serving originals` in the logs), and its cache moved to `os.tmpdir()/stc-thumbs` because the serverless FS is read-only outside /tmp. (2) The private bucket had no CORS rules, so the browser blocked the signed PUT — one-time console rule documented in DEPLOY-VERCEL.md (the scoped app key cannot update buckets: `b2_get_bucket`/`b2_update_bucket` 403 with capabilities read/write/delete/list only; B2 API v3 shape: `apiInfo.storageApi.*`). APP_VERSION 2.8.66.1 → **2.8.66.2**; owner zip re-shipped. |
| 2.8.61.0 → 2.8.66.1 | **THE B2 + VERCEL ARC** *(row reconstructed 2026-10-23 after a workspace rollback wiped the tree — see worklog Task 12; the releases themselves shipped and deployed live)*. Supabase Postgres via drizzle/node-postgres on the 6543 transaction pooler (5432 exhausts serverless connections); `DATABASE_POOL_MAX` pool sizing; Backblaze B2 as the media provider (private bucket `stc-media`, region us-east-005, scoped app key `stc-site`, presigned PUT uploads + 302 signed-URL reads so Vercel bandwidth stays ~zero); live backfill of the legacy public media (8/8 objects, verified byte-identical, plain URLs 401); DEPLOY-VERCEL.md written (env sheet, deploy loop, VPS plan B); first owner zips (git archive lean recipe + filtered `.env` for Vercel import); media backfill + zip-delivery mini-service tooling. APP_VERSION 2.8.60.0 → **2.8.66.1**. |

*(Full v2.8.16 → v2.8.60 history: see README-NEW.md.)*

> **Current implementation status:** Phase 1 is complete. Phase 2 content managers and universal visual editing are functional. Phase 2.1 backup/environment foundations and the provider-neutral local/MinIO/R2 media foundation are now implemented.
>
> **Important:** Cloudflare R2 is **not required for development**. The default driver is local filesystem storage. MinIO can be enabled without a credit card; R2 is an environment-only production switch when billing access becomes available.
>
> Do not begin a later migration phase without reading the migration sequence, rollback plan and Definition of Done in this document.

---

## Implementation Progress — Current Build

### Completed

- [x] Phase 1 visual CMS, drafts, publishing and revisions.
- [x] Universal full-site element editor.
- [x] Structured News, Events, Gallery and Staff managers.
- [x] Persistent custom content collections/categories.
- [x] Phase 2.1 environment template and secret-safe `.gitignore`.
- [x] Database backup, restore and schema/row-count report scripts.
- [x] Provider-neutral media storage contract.
- [x] Local filesystem media adapter (default development mode).
- [x] S3-compatible MinIO adapter.
- [x] S3-compatible Cloudflare R2 adapter (configuration-ready; credentials not required during development).
- [x] Direct signed PUT upload support for MinIO/R2.
- [x] Local multipart development upload fallback.
- [x] Authoritative Sharp image validation and WebP processing.
- [x] EXIF/GPS removal, auto-orientation and safe pixel/file limits.
- [x] Thumbnail, small, medium, large and master variants.
- [x] Duplicate detection using SHA-256 content hashes.
- [x] Media asset, variant and usage metadata tables.
- [x] Categorized, mobile-first Media Library with upload progress, details, variants, filters, trash and restore.
- [x] Phase 2.8 reusable Media Picker (browse, search, folder-first context, inline upload).
- [x] News cover and Gallery frame fields integrated with the Media Picker; manual URLs kept for migration compatibility.
- [x] Universal visual editor image inspector integrated with the Media Picker.
- [x] `media_usage` synchronisation for posts, gallery frames and visual page patches (draft + published).
- [x] Usage locations shown in the asset detail drawer; used assets are blocked from trashing (server 409 + disabled UI).
- [x] v2.8.16 **central logo registry** — every crest/logo syncs by ID site-wide (admin manager `/admin/logos` + visual-editor logo size slider); editor-exit no longer blocks the admin dashboard; dedicated category-based **Online Resources** section (`/admin/resources`, public `/resources`).
- [x] v2.8.17 **storage layer restored** — the missing `@/lib/storage` module (root cause of "cannot upload custom images") is back: local filesystem driver under `.data/media` served via `/api/media/file`, S3-compatible MinIO/R2 adapter with presigned direct uploads, and the multipart `/api/admin/media/upload` endpoint. Uploads verified end-to-end (API + UI modal → WebP variants → serving).
- [x] v2.8.18 **admin studio upgrade (10 requests)** — falcon emblem (changeable, drops in like a crest), realtime logo preview, grouped sidebar sections, dedicated Footer section (Settings = falcon + preloader), cadeting preloader system, photographic dashboard, image zoom sliders everywhere, staff photo preview fix, news Images/Links/Videos toggles (5 photos max) with public rendering, unit-gallery "+" add dialog (images + title + sentence).
- [x] v2.8.19 **calm emblem, per-unit preloaders, Profile & Version History, media-popup fix, staff zoom frame** — the admin emblem is a calm white circle (yellow + drop animation removed), each cadeting unit's preloader is editable separately (`/admin/preloaders`), a new Profile section (name, avatar, email, password change) and a Version History feed (every change with date, time and author) live under System, the media-library picker now opens centred and clickable everywhere (portal fix), and the staff portrait zoom preview is framed.
- [x] v2.8.19.1 **storage module restored again** — `@/lib/storage` disappeared from disk a second time (same symptom: `Module not found: Can't resolve '@/lib/storage'`, site down). Rebuilt all three drivers (`index.ts` factory + `local.ts` + `s3.ts`) and the deleted multipart `/api/admin/media/upload` route, plus installed the real `server-only` package (Next resolves it either way; bun scripts now work too). Hardened `assertSafeObjectKey` to also reject dot-leading segments. Verified: 18/18 unit checks (`bun --conditions react-server ./scripts/verify-storage.ts`), HTTP serving with immutable cache, traversal 404, auth-gated 401s on presign/upload/finalize, home + admin login render clean in browser with zero console errors.
- [x] v2.8.19.2 **PGlite crash recovery + preloader-logo mystery solved** — "preloader logo doesn't apply + error" was the DB engine crashing (`RuntimeError: Aborted()` unhandled rejections); the user's two preloader saves were actually IN the database the whole time, but a silent catch in `resolveCadetIntro` hid the DB failure so pages rendered fallback crests (looked like the change never applied). The catch now logs loudly. The DB then became fully unbootable (WAL replay hang); stock PG17 binaries are ABI-incompatible with PGlite dirs (USE_FLOAT8_BYVAL), so recovery went through PGlite itself: `pg_resetwal -f .data/pglite` → standalone boot → **full JSON dump of all 25 tables (98 rows) to `.data/rescue-backup-*.json` BEFORE restarting** → zero data loss. Verified in-browser: army-cadet preloader renders the real college crest, eastern-band the Thomians logo, media serving 200, no aborts in fresh log.
- [x] v2.8.20 **Form Management, Popups, Live channel, single preloader (4 requests)** —
  1. **Form Management** (own admin section): Grade 6 Applications (`/admin/forms/grade-6`), A/L Applications (`/admin/forms/alevel`), Contact Messages (`/admin/forms/contacts`) and Appointments (`/admin/forms/appointments`) — searchable status-filtered lists, full detail dialogs, one-click status pipelines (received→reviewing→shortlisted→approved/waitlisted/rejected, requested→confirmed→completed/cancelled, unread→read→replied→archived), delete, CSV export; backed by `/api/admin/forms` (GET/PATCH/DELETE, audit-logged).
  2. **Announcement Popups** (`/admin/popups`): full editor — title, message, type badge (event / live / special message), banner via Media Library, button link + label, show-frequency (once / per-session / every load), delay, optional start/end schedule, master ON/OFF toggle; the newest enabled in-window popup renders site-wide (`SitePopup` in root layout, skipped inside /admin) via public `/api/popups/active`; dismissal tracked in local/session storage per frequency.
  3. **Live channel**: new admin Live Streams manager (`/admin/live`) for YouTube / Facebook / Instagram / TikTok / other — URL, auto-derived embed (YouTube watch/shorts/live → embed, Facebook → plugin; IG/TikTok render banner + watch-there card), banner, description, schedule, sort order and extra social links; **LIVE MODE** switch features the stream on the new public `/live` page (ON AIR hero, embed or link-out, upcoming "coming up live" cards, archive grid, friendly empty state) and makes a **blinking red dot** appear next to News & Events in the navbar (plus a "Live · On air" entry in the dropdown and the mobile menu, green dot when a stream is merely scheduled) — navbar polls `/api/live/status` every 45 s and the dot disappears the moment live mode ends.
  4. **Single cadeting preloader**: navigating between cadet pages used to play TWO identical cinematic cards (Explore "leave" card 2.3 s + destination "enter" card). The leave card is gone — clicking a unit card now navigates instantly (mount-time prefetch) and exactly ONE preloader plays on the destination page. Verified frame-by-frame: hub stays visible at click, one crest card on arrival, clean fade into the page.
- [x] v2.8.20.1 **premium live badges** — the flat "On Air Now" / "Scheduled" pills on `/live` were rebuilt as broadcast-grade chips (`.live-badge` system in globals.css): dark glass pill (backdrop-blur + tinted gradient + 1px tinted ring), breathing outer glow, a light sheen sweeping every ~4 s, and a hot LED dot (white-hot core in a recessed socket with an expanding ping ring). The hero pill now carries a detail segment after a hairline divider — platform for ON AIR ("On Air Now │ YouTube") and the next stream's formatted time for Scheduled ("Scheduled │ Sat 11 Oct · 18:30"); upcoming cards use a compact glass `--mini` variant over their banner, and the idle "No live event at the moment" pill matches the same glass language. Pure CSS (server-component friendly); navbar blink dot untouched per user note.
- [x] v2.8.20.2 **live badges: clean refinement** — user feedback: the sheen sweep + breathing glow read as too shiny; wanted premium CLEAN. Rebuilt the `.live-badge` system to quiet-luxury specs: flat translucent glass (single tinted fill, one subtle 1px ring, no gradients, no top highlight, no text shadow, no animations on the pill itself), and the dot calmed to match the navbar blink the user already liked — small solid core with a faint static halo + one slow soft ping (2.4 s, 0.5→0 opacity). Detail segments (platform / next-stream time) and the `--mini` / `--idle` variants kept. Verified in browser for both on-air (real stream) and scheduled (CSS-class injection, no DB writes) states; two Turbopack stale-CSS rebuilds needed (`rm -rf .next`) — chunk filenames are content-deterministic, so always diff the SERVED css content, not the URL hash.
- [x] v2.8.23.0 **preloader storyboard v3 (the user's exact 3-stage cut) + one loader everywhere + toolbar/badge positions** —
  1. **Site preloader rebuilt to the user's storyboard, stage by stage**: (1) black screen → the school logo shows **inside a white circle**; below it an **ultra-thin SHARP-edged (square) GOLD progress bar** — gold only, no white anywhere in the meter — fills while **three short professional sentences cycle one after another** beneath the bar (admin can add/change every sentence); (2) the bar + sentences **hide while the circle + logo stay**, the school name is **drawn letter-by-letter below the logo**, and once shown the motto lands beneath it in a sharp tracked uppercase font; (3) everything **fades** and the site enters. One persistent stage now — no more separate screens. All fields stay editable in Admin → Website → Preloaders (logo, scale, circle toggle, name, motto, sentences, hold, bar toggle, exit style, frequency) with an updated full-screen preview; stored settings matching the OLD long-sentence defaults auto-migrate to the new short defaults.
  2. **ONE navigation loader, as ordered**: the gold top progress bar is GONE and both route-level skeletons were replaced — the **round loading preloader** (black screen + ultra-thin golden ring + "Loading") is the only loading UI anywhere (site + admin, RouteProgress rewritten as RouteLoader + both `loading.tsx` files). It stays a passive overlay — no scroll lock, never combined with the site preloader — which was the source of the user's scroll errors.
  3. **Navbar NEW badge** — sits to the **right of** the label ("Latest News" / "Staff"), desktop + mobile.
  4. **Visual editor toolbar position** — the floating bar now parks at the SAME lifted position on every page (where it sat beside the section editor), instead of hugging the bottom edge on non-section pages.
  5. Ops: fifth PGlite `Aborted()` corruption — `/tmp` had wiped the rebuilt binary, so `pg_resetwal` was rebuilt from PostgreSQL 17.2 source (shims: fake bison + real flex built from source + regenerated `errcodes.h`); recovery clean, zero failed queries after restart, settings/pages verified. Binary persisted at `/home/z/pg_resetwal` (survives /tmp wipes).
- [x] v2.8.23.1 **storage module restored a third time + preloader bar refinement** —
  1. **`@/lib/storage` disappeared from disk again** (same symptom: `Module not found: Can't resolve '@/lib/storage'`, photo uploads broken everywhere). Rebuilt the full provider-neutral layer: `index.ts` (env-driven singleton, `MEDIA_STORAGE_DRIVER=local|minio|r2`, `resetStorage`), `local.ts` (filesystem driver under `.data/media`, temp-file + atomic-rename writes, hardened `assertSafeObjectKey` — rejects traversal, backslashes, null bytes, dot-leading segments, whitespace), `s3.ts` (MinIO path-style + R2, presigned PUT via `s3-request-presigner`, honours `MEDIA_STORAGE_PUBLIC_BASE_URL`) and the deleted multipart `/api/admin/media/upload` route (admin-gated, type + 20 MB validated, straight into `processAndStoreImage`).
  2. **Verified end-to-end in a real browser**: fresh QA admin → Admin → Media Library → Upload modal → device picker → "Upload & optimise" → `presign` 200 (`mode: "proxy"`) → `upload` 200 → asset listed ("Uploaded 1", All Media 38) with a **LOCAL 900×600** thumbnail rendering live via `/api/media/file` (`naturalWidth: 320`, master variant 200 `image/webp`); traversal key returns 404; fresh-session console clean. All QA fixtures (admin, sessions, asset, variants, files, scripts) fully removed afterwards — only the real admin account remains.
  3. **Preloader progress bar refinement** (user: "a bit longer and a bit smaller") — the sharp gold meter is now `min(660px, 94vw)` wide (was 560px slot width) and **1.5px** thin (was 2px), still perfectly centred, gold-only. Verified live in-browser: computed style `660px × 1.5px` with the fill animating.
- [x] v2.8.25.0 **cinematic admin theme system + draggable editor toolbars + 9 mobile/UX fixes (10 requests)** —
  1. **Admin Theme section (new)** — Admin → System → **Theme** (`/admin/theme` + `/api/admin/theme`): four cinematic presets rendered as live gradient cards — **Cinematic Gold** (black + yellow, the new default), **Royal Midnight** (black + `#010736`), **Violet Aura** (black + `#792CA2`) and **Pure Dark** (no glow). `adminTheme` is a published site setting; AdminShell applies it via `data-admin-theme` and a CSS-variable layer in globals.css remaps every gold/dark arbitrary utility (buttons, focus rings, sliders, checkboxes, canvas glows) instantly without a reload (localStorage cache + `stc-admin-theme` broadcast; PATCH merges into the freshest draft so no other pending setting is lost).
  2. **Draggable editor toolbars** — the Visual Editor and Section Editor floating toolbars now default to the bottom centre and can be **dragged anywhere** by the new grip handle (pointer-event drag clamped to the viewport, position persisted per editor in localStorage, double-tap the handle to reset, resize/rotation-safe).
  3. **"Editing stays enabled after Home → can't scroll" bug fixed** — root cause: the global `EditorChooser` kept `ready` true after the `?choose=1` flag left the URL, so its scroll-lock effect re-armed on *every* navigation (including Home → `/admin`) and froze the admin page until a reload. The lock now keys on a derived `open` state and `ready` resets via render-time derived state; verified chooser → editor → Home → admin scrolls freely.
  4. **Visual editor toolbar mobile cleanup** — the + / page-images / history icons sit in properly spaced, wider (44 px) touch targets separated by hairline dividers, so each icon is readable and clickable on phones.
  5. **Preloader crest/circle decoupled (bug)** — the crest-size slider used to multiply the white circle too (`124 × crest × circle`); the disc is now sized **only** by the White-circle setting while the crest scales independently inside it (`.spo-crest-box`, 30–100% of the disc), so crest 220% + circle 100% keeps a 124 px disc.
  6. **Live Streams mobile header** — the "YouTube / Facebook / Instagram / TikTok…" paragraph and the "+ Add stream" button now stack as two rows on phones instead of sharing one cramped row.
  7. **Filters & Categories "Default" badge visible on mobile** — the badge was nested inside the truncating name span and vanished on narrow screens; it is now a sibling chip (higher contrast, wraps under the name when needed).
  8. **Scrollbar spacing** — sliding/scrollable lists (media library mobile folder switcher, live/forms/popups/versions lists) got the `.hscroll` treatment: thin 5px track + real padding so the scrollbar never touches the content.
  9. **Online Resources rows restructured for mobile** — title, description (2 lines on phones) and URL take the full width; category/medium chips and the action buttons moved to their own footer row (desktop keeps the single-row layout).
  10. **Admin selects fit their arrows** — every Admin Studio `<select>` now uses `appearance-none` with an in-box chevron + reserved right padding (`.adm-root select`), so the native down-arrow can never overflow the control; preloader toggle labels wrap (`min-h-11`) instead of clipping long text.
- [x] v2.8.25.2 **full-page theme gradient + popups mobile stack + DB rebuild** —
  1. **Theme gradient now covers the WHOLE admin background** (user: "gradients only added to a small area") — the two radial glows were painted on the tall page element with `background-attachment: fixed`, which phones ignore, so the glow only showed near the page's top/bottom. Replaced with `.adm-canvas` — a `position: fixed; inset: 0; z-index: -1` glow layer (first child of `.adm-root`, which is now `isolation: isolate`): viewport-anchored, visible at every scroll position on every device, still driven by the theme CSS vars (verified gold ↔ violet repaint instantly; still covering at scrollY 1500 on a 390×844 viewport).
  2. **Popups header stacks on mobile** (user: "change the popup section like the live stream one") — same treatment as Live Streams: `flex-col sm:flex-row`, paragraph gets its own row and the "New popup" button becomes a full-width 44px-tall touch target under it on phones; one centred row on desktop (verified at 390px: paragraph top 92 / button top 143; at 1366px: same visual row, centers aligned).
  3. **INCIDENT + recovery: database rebuilt** — during session setup the twice-Aborted PGlite init (unclean `pkill` while a second process attempted access) left the cluster needing WAL reset; `pg_resetwal` succeeded but rewound the catalog past several tables (no backup existed — the pg_dump backup path never worked against embedded PGlite). The data dir was snapshotted to `.data/pglite-salvage-20251010`, then fully rebuilt from the four Drizzle migrations (`bun run db:push` → 30 tables). **Lost:** admin account (user must re-create via /admin/setup — appears automatically), all admin-entered content rows (news, events, gallery, staff, popups, streams, uploads in `.data/media`), CMS draft overrides. **Safe:** code defaults (public site renders complete — verified hero/preloader/sections, 10 images 0 broken), all `public/images` assets, theme canvas, toolbars, all v2.8.25.x fixes.
  4. **pg_resetwal rebuilt from source again** (binary had been wiped): PostgreSQL 17.2 at `/home/z/pg_resetwal` — new faster recipe: fake `bison` shim + `FLEX=`/`BISON=` env overrides to skip configure's functional flex test + `make -C src/backend/utils errcodes.h` (perl) + build real flex 2.6.4 (official release asset; its configure must not see a fake flex) + `make -C src/fe_utils` then `src/bin/pg_resetwal`. Lint baseline unchanged (21 pre-existing). APP_VERSION → 2.8.25.2.
- [x] v2.8.25.3 **theme gradient at the top + no gold flash + themed scrollbars + preloader text size sliders + storage module restored (4 requests)** —
  1. **Theme gradient now covers the TOP of the studio too** (user: "top ekata adda wela na") — the sticky admin header was an opaque bar that cut the viewport-fixed canvas glow off exactly at the top. The header is now a glass pane (`header.adm-header`: 72% translucent + backdrop-blur, out-specifying the `.bg-[#0a0a09]` remap) so the glows shine through it, and the canvas gained a third top-centre radial glow (`1100px 540px at 50% -16%`) so the whole top edge is tinted on every theme (verified: header `rgba(6,6,8,0.72)`, 3 radial gradients, royal + violet repaint instantly; 390px and 1366px both clean).
  2. **No more golden fallback flash on reload + scrollbars follow the theme** (user: "reload karaddi golden color fallback error") — the theme choice now rides a 1-year device cookie set by the theme API (GET + PATCH); a synchronous pre-paint bootstrap in the admin layout reads cookie → localStorage and sets `data-admin-theme` on `<html>` before first paint, AdminShell keeps it in sync (and removes it on unmount so the public site is untouched). Reload after switching to Violet restores violet instantly — no gold flash. Every admin scrollbar (page scrollbar via injected html rules, inner scroll areas via `[data-admin-theme]` CSS incl. `.hscroll` and the drawer nav) is tinted with the theme accent, e.g. `#8fb2ff` mix on Royal (verified computed thumb colors per theme).
  3. **Preloader text size sliders** (user: "title, sentences, subheading sizes edit karanna puluwan") — three new sliders in Admin → Preloaders: **Title size** (60–200%), **Motto / subheading size** (60–220%), **Loading sentences size** (60–220%). Implemented through the settings contract (`titleScale/mottoScale/linesScale`), CSS custom properties on `.spo-root` and `calc()` font sizes for `.spo-name` / `.spo-motto` / `.spo-line`. Verified live in the admin preview: sentences 150% → 16.5px, title 120% → 27.84px, motto 180% → 20.7px; public preloader unchanged at 100%.
  4. **`@/lib/storage` restored (fourth disappearance)** — same "Module not found" symptom; rebuilt `storage/index.ts` (env-driven `local|s3` registry), `storage/local.ts` (filesystem driver under `.data/media`, hardened `assertSafeObjectKey`) and `storage/s3.ts` (MinIO/R2 via `@aws-sdk/client-s3` + presigner), plus the multipart `/api/admin/media/upload` route deleted in a previous commit. Verified: media page renders, `presign` answers `mode:"proxy" driver:"local"`, upload route auth-gated 401, `/api/media/file` 404s unknown keys, zero console errors.
  5. **Settings PATCH no longer wipes other sections** — `updateSiteSettings` blanks any default key missing from the payload, and the preloader manager only sends its own keys, so saving preloaders used to blank schoolName/contact/etc. The API route now merges the patch over the freshest draft (verified: partial save preserved schoolName, adminTheme, email while saving the new scales). Lint baseline unchanged (21 pre-existing). APP_VERSION → 2.8.25.3.
- [x] v2.8.25.1 **mobile admin polish round 2: real overflow fixes + wrap-safe toolbars** —
  1. **Root-cause fix for "preloader & footer edit text boxes overflow"** — grid/flex `<label>` items keep `min-width:auto` by default, so a text input holding a long crest URL inflated the grid track to 362px inside a 316px container and pushed the whole page 9px past the viewport on phones. New global rule `.adm-root label { min-width: 0 }` lets inputs shrink (scrolling internally instead). Verified: **every admin page now measures exactly 390px scrollWidth at 390×844** (dashboard, media, news, events, gallery, staff, filters, live, logos, popups, resources, theme, settings, versions, pages, profile, preloaders, footer — zero overflowing elements on preloaders/footer).
  2. **Visual Editor toolbar Publish button overflow fixed** — the floating toolbar's single-row content (~538px) exceeded a 390px phone viewport, pushing Publish off-screen. Both editor toolbars (Visual + Section) are now `flex-wrap justify-center`: they break into two tidy centred rows on narrow screens (grip/home/pages/edit-mode + blocks/images/history/publish), hairline dividers hidden on mobile, every control inside the viewport. Verified at 390px: 2 rows, Publish fully visible, no page overflow; at 1366px: still one row. Drag-to-position and double-tap reset re-verified after the change (drag persists to `stc:vtb:visual`/`stc:vtb:section`, reset returns to bottom-centre and clears storage).
  3. User-visible confirmation that the earlier v2.8.25.0 fixes were real but being masked by stale Turbopack CSS — cache-clear + server restart recipe applied again during verification (`.next` rebuild + `pg_resetwal` for the by-now-standard seventh PGlite `Aborted()` recovery).
- [x] v2.8.24.0 **preloader admin controls + mobile Admin Studio + admin performance (6 requests)** —
  1. **Network round preloader on/off** — Admin → Website → Preloaders now has a "Network round preloader (slow-navigation ring)" switch; the RouteLoader (black screen + golden ring) mounts only when `routeLoaderEnabled` is published true. Verified: publish off → component unmounted; publish on → restored.
  2. **Admin Studio is mobile-responsive** — the fixed sidebar becomes a slide-in drawer under `lg` (hamburger topbar, backdrop, Escape close, scroll lock, ≥44px touch targets, auto-close on navigation); every manager page collapses to one column on phones with scrollable tables and full-screen sheet modals; desktop layout untouched. Verified at 390×844: `/admin`, `/admin/media`, `/admin/news`, `/admin/preloaders` all report zero horizontal overflow, drawer + modals usable; desktop 1366×900 unchanged.
  3. **Progress bar width slider** — 40–100% (100% = the current 660px design width), applied live to the site preloader and the admin full-screen preview (60% measured at exactly 396px).
  4. **"Global preloader defaults" removed** — the unused cadet-intro fallback section is gone from Admin → Preloaders; per-unit preloaders now resolve unit override → stored/standard cadetIntro values → the unit's own synced crest, so nothing changes for visitors.
  5. **White circle size + golden ring** — new "White circle size" slider (60–200%) composes with the crest slider, and an optional **golden animation ring** (two thin rotating gold arcs, hairline-masked conic gradient, 5.5 s spin, reduced-motion safe) orbits the white circle with its own on/off switch. Verified live: ring renders/spins on the home preloader and in the admin preview; toggle off removes it.
  6. **Admin performance** — new disk-cached thumbnail pipeline: `admin-grid-thumb.ts` + `/api/media/thumb` render legacy `/images/*.jpg` masters once into 480px WebP files under `.data/thumbs` (sha1-keyed, immutable cache, traversal-guarded, graceful redirect fallback); Pexels URLs are downscaled via crop params; uploaded assets keep their WebP thumbnail variant. All admin images lazy-load with async decode and large-surface backdrop blurs were reduced — the media library now decodes tiny thumbs instead of ~200 KB JPEGs.
  - Ops: sixth PGlite `Aborted()` crash recovered with the persisted-binary recipe (`rm .data/pglite/postmaster.pid` + `/home/z/pg_resetwal -f .data/pglite`), zero data loss.
- [x] v2.8.22.1 **preloader sequence rebuilt to the user's exact storyboard + three bug fixes** —
  1. **Cinematic preloader = the user's storyboard, beat for beat**: (1) black screen, school logo visible **blurred**, resolving into focus; (2) an **ultra-thin golden progress bar** below the logo fills; (3) **rotating sentences** cycle beneath the bar; (4) fill complete → back to pure black and the school name is **drawn huge** (outline letters appearing one by one); (5) a sweep **fills the letters white**; (6) fade-in of the identity lockup — crest **in a white circle above**, the name, and **"Animo Et Fide" small below**, all as one composition; (7) everything fades and the site enters. Every element (logo, scale, title, motto, sentences, hold time, progress toggle, white circle, exit style, frequency) is editable in Admin → Website → Preloaders with a full-screen preview. Scroll lock is doubly guaranteed (html class + `:has()` keyed to the overlay) and released on every path out — verified the page scrolls the moment the preloader ends.
  2. **Slow-network loader** — navigations still in flight after ~450 ms take over with the user-specified screen: **black + ultra-thin golden ring spinner + "Loading"** (site and admin, reduced-motion aware).
  3. **Editor-chooser leak fixed** — picking **Visual Editor** from the chooser (`?visualEditor=1`) no longer mounts the section editor's floating toolbar: all three section pages now gate `LiveSiteEditor` behind `cmsEditor=1` only.
  4. **NEW badge position + staff NEW** — the gold NEW chip in the navbar dropdowns now renders **in front of** "Latest News" and "Staff" (desktop + mobile menus), and adding a teacher in Staff Manager now creates it with `isNew: true` so the navbar NEW chip lights up immediately.
  5. Ops: the session was interrupted mid-edit leaving duplicate imports in `site-preloader.tsx` (whole site 500) — repaired and re-verified end to end in the browser.
- [x] v2.8.22.0 **editor chooser + cinematic site preloader + filters management + popup/popup-theme fixes** —
  1. **Popup social-links editor relaid out** — each link row is now a stacked card: name input (full width) on top, URL input at **full width below** with its placeholder always visible (the old 128 px label + squeezed URL row hid the placeholder on narrow screens; verified at 1280 px and 390 px).
  2. **Editor chooser** — "Edit page" in `/admin/pages` now opens the page with `?choose=1` and a **Choose your editor** overlay: *Visual Editor* (element-level, `?visualEditor=1`) or *Section Editor* (structured lists/sections, `?cmsEditor=1&edit=1`; only offered on section pages, shown disabled elsewhere). Escape / backdrop click cancels; session-gated like the editors.
  3. **Light theme popup chips** — the LIVE / EVENT / ANNOUNCEMENT badges and the platform chip used dark-only tints (`text-violet-200`, `bg-white/10`) and vanished on white; now theme-aware (`text-violet-700`-class tints in light, originals in dark). Verified in both themes with a live popup.
  4. **Cinematic site preloader** — first-load "cinema opening": crest blur-scale reveal with a gold light sweep, letter-by-letter title, tagline, italic gold motto, and a **realtime progress line** that tracks actual document loading (fast ramp → creep → 100% on load, 3 s stall cap). Exits via **cinema curtains** or soft fade (selectable), click/Escape skips, honours prefers-reduced-motion, never plays inside /admin, and a `<head>` bootstrap applies session/once/always frequency **before first paint** so it never flashes for returning visitors. **Full admin control** in Admin → Website → Preloaders: enable, frequency, crest/logo (Media Library), logo scale, title, tagline, motto, hold time, progress toggle, exit style + a full-screen **Preview the opening** button.
  5. **Slow-network loading feedback** — new `RouteProgress` top bar (gold, realtime ramp, completes on route change, works on the public site AND admin panel, opt-out via `data-no-progress`) plus route-level `loading.tsx` skeletons (crest pulse + sliding bar) for site and admin.
  6. **Filters & Categories manager** (`/admin/filters`, nav under Content) — one place to manage every public filter system: tabs for News, Campus Gallery, Events, Resources and Staff departments; per category: usage counts, inline **rename** (bulk-updates the content rows), **delete with move-to** (in-use categories demand a target, 409-guarded; removable defaults are hidden via a marker row so the default merge can't resurrect them), and add. Every content manager (news/gallery/events/resources/staff) gained a "Manage filters" shortcut linking to its own tab. Backing API: GET (managed lists + counts), POST (add/unhide), PATCH (rename everywhere), DELETE (with move).
  7. Ops: yet another round of sandbox OOM kills (chronic — baseline test with changes stashed showed identical memory growth, so not caused by this release) + one pg_resetwal recovery that ate the un-checkpointed "basket ball" stream row again (restored + CHECKPOINT); a fresh Turbopack stale-CSS incident after stash/pop needed another `rm -rf .next`.
- [x] v2.8.21.1 **five fixes after user testing** —
  1. **Popup social/watch links** — the "Add link" flow in the popup editor could fail when a row's jsonb `links` arrived malformed (and during the day's DB crash window saves were dying); the edit path now normalises `links` to a real array before opening the editor. Verified end-to-end: added YouTube + Facebook rows, saved, `/api/popups/active` returns both, popup renders both chips with brand SVG icons.
  2. **A/L Teachers & Classes + Old Thomians "+" was unreachable** — root cause: `/admin/pages` opens every page with `?visualEditor=1`, but the section inspector (which hosts the list editor and its "+" buttons) only mounted on `?cmsEditor=1`. The two editor systems never overlapped, so the fix from v2.8.21.0 looked "not applied". Now: section pages (Home, History, 4 A/L streams) also open the section editor from `visualEditor=1`, and `/admin/pages` links straight to `?cmsEditor=1&edit=1` for them. Verified: Teaching Panel → "Add a new teacher" → created with staff-directory sync → appeared on the A/L page AND /staff → deleted cleanly.
  3. **NEW badges** — staff cards now pin the gold NEW chip to the card's **top-right corner** (absolute, z-10, no more squeezing/overflow next to the name; content column gains `min-w-0`); verified on the Academic Faculty, Sports, Arts and Deputy cards. Some items "not getting the badge" was the day's DB crash eating `is_new` flags — flags must be re-set after the recovery.
  4. **Navbar** — Admissions moved from the About Us dropdown to **Academics** (after Achievements).
  5. **Reusable component blocks now land on the page** — the Framer-style "Add a component" library wrote DB rows but six editor-enabled pages never rendered blocks: A/L stream pages, /live, /resources, /cadeting units, /ordinary-level/past-papers and news articles now render `VisualBlockSections` above the footer; on A/L streams it is draft-aware (drafts visible while previewing, published for visitors). Adding a block now also `router.refresh()`es so it appears instantly. Verified: Stats Row added → visible immediately in editor → Publish → visible on the public page. The universal editor's floating bar lifts above the section editor's bar when both run, and section-overlay clicks are marked `data-visual-ui` so element-edit mode can never hijack them.
- [x] v2.8.21.0 **four admin requests** —
  1. **Popups upgraded** — centred on mobile too (was bottom-anchored); new optional **event date & time** (`event_at`) rendered as a calendar chip; live popups gain a **streaming-platform** select that renders the platform's brand icon; new **social/watch links** editor (label + URL rows) rendered as platform-icon buttons on the popup. Live page stream links now show **brand logos** (YouTube/Facebook/Instagram/TikTok inline SVGs — lucide dropped brand marks) instead of a generic link glyph.
  2. **Dropdowns fixed** — native `<select>` option lists went white-on-white in dark mode; fixed globally with `color-scheme: light/dark` + explicit option colours. The navbar hover dropdown panel is now always dark glass with white text (user request), independent of theme.
  3. **Editable A/L & Old Thomians lists** — new `stream_teachers`, `stream_classes`, `old_thomians` tables (seeded from the former static content); A/L stream pages + history honour roll now render from the DB. The visual editor's inspector for these sections shows a **list editor with a "＋ Add" button at the very end of the list** — new A/L teachers can be created from scratch (**"Also add to Staff directory" sync** creates the staff row automatically, department selectable) or **picked from existing staff** (auto-fill name/role/qualification/photo); classes support picking a class teacher by name; Old Thomians has the same add flow. Inline edit (save on blur), NEW-badge toggle and delete on every row. All CRUD via `/api/admin/lists`, audit-logged.
  4. **NEW badges** — posts, events and staff gain an `is_new` flag with a "NEW badge" toggle in News Manager (post + event editors) and Staff Manager; gold NEW chips render on news cards, the featured story, calendar event rows, staff cards, A/L teacher cards and Old Thomians rows. While anything is flagged, a gold **NEW chip appears next to News & Events in the navbar** (polls `/api/new-status` with the live-status interval).

### Editor & CMS Hardening Package — v2.8.14 (14-item admin request)

- [x] Visual editor → persistent **Home button** back to Admin Dashboard (`/admin`).
- [x] Hidden elements stay visible inside the editor (28% opacity, dashed amber outline, grayscale) with an explicit **Restore** action; the public site uses `display:none` so the next element reflows into place.
- [x] **Page Images & Banners navigator** — lists every image/video/iframe/background (incl. hero images hidden behind overlays); one click selects exactly that element for editing. Structured News/Gallery/Staff cards are excluded by design.
- [x] **Premade Component Library (Framer-style)** — Hero Banner, CTA, Stats Row, Image+Text, Heading, Text, Full Image and Quote blocks insertable on any page from the toolbar `+` drawer; draft/publish, hide, reorder, delete; all 16 public pages render blocks above the footer.
- [x] Vision & Mission — colour panels and YouTube embed are now selectable (panels support background colour + image replacement; iframes support `src` editing).
- [x] Staff portraits moved into the database (`staff.image`) with picker in the Staff Manager — principal/deputies/faculty avatars render from the DB with safe fallbacks; `media_usage` synced.
- [x] Exam-results five-year trend — editing a percentage automatically resizes its progress bar (`data-trend-row`/`data-trend-bar`, works in editor preview, bootstrap and public patch application).
- [x] **School logo** setting (Admin → Settings) renders in navbar, footer and mobile menu; circular Crest elements (clubs/societies/cadeting) support background-image replacement through the visual editor.
- [x] A/L course cards — cut-off Z-score chips are now selectable text spans.
- [x] Clubs & Cadeting crests editable via the universal editor (Crest components marked `data-visual-bg`).
- [x] **Unit Galleries** — new `unit_gallery_items` table, admin manager (`/admin/unit-gallery`), per-unit picker + upload, public cadeting page prefers managed photos over built-in frames; usage tracked.
- [x] Cadeting preloader removed from visual-editor scope (`data-visual-ui` shield) and moved to **Admin → Settings → Cadeting preloader** (enable/disable + direct-visit hold ms).
- [x] Structured content protection — DB-driven components (news/events/gallery/staff/posts) are marked `data-structured-content` and ignored by the visual editor; they can only be edited in their own managers.
- [x] Dark theme is now the site default; the toggle stores an explicit light preference.
- [x] **App versioning** — `src/lib/app-version.ts` holds `APP_VERSION` (`major.phase.feature.patch`), displayed in the Admin Studio sidebar.

### v2.8.15 — Media pipeline completion, white crest system, keyed visual patches

Fix package completing the unfinished media foundation and addressing the reported cadeting-gallery / crest-editing / hide-element bugs.

#### Fixed: missing storage module (root cause of media failures)
- `src/lib/storage/` was referenced by six files but **did not exist in the repository** — every media upload, media file request and presign call failed, and any media-URL image broke the pages that rendered it.
- Implemented the provider-neutral storage layer:
  - `src/lib/storage/index.ts` — `getStorage()` / `getStorageDriver()` factory driven by `MEDIA_STORAGE_DRIVER` (`local` | `minio` | `r2`).
  - `src/lib/storage/local.ts` — default filesystem adapter storing objects under `.data/media/`, served via `/api/media/file?key=…`; includes `assertSafeObjectKey` (path-traversal safe).
  - `src/lib/storage/s3.ts` — S3-compatible adapter shared by MinIO (path-style) and Cloudflare R2, with direct signed-PUT upload support.

#### Fixed: cadet unit pages crashing after adding gallery photos
- Next.js 16 requires `images.localPatterns` for local image sources carrying a query string. Managed photos use `/api/media/file?key=…`, so `next/image` **threw during render and the whole unit page returned 500** the moment a managed photo existed.
- Added `localPatterns` for `/images/**` and `/api/media/file` in `next.config.ts`; the image optimiser now serves media objects (verified 200 image/jpeg).
- `next.config.ts` also sets `experimental.workerThreads: false` and `cpus: 1` — PGlite keeps state on globalThis and locks its data directory, so render workers must not open second instances.

#### Added: reusable SiteImage component (site-wide image sync)
- `src/components/site-image.tsx` — the canonical image component:
  - Renders every site image through one place (optimisation, editor keys, fallbacks stay in sync).
  - Graceful `onError` fallback — a removed media file renders `fallbackSrc` or a neutral labelled panel instead of a broken icon; pages can never break on a bad image URL.
  - Stamps a stable `data-visual-key` (via `visualKey` prop) so editor patches target the exact element forever.
- Used for cadet unit gallery frames (`cadet-photo-<unit>-<n>` keys).

#### Changed: crest/logo system — white circles, no gold discs
- All unit/club crests now sit on a **WHITE circle with perfectly centred content**; yellow/gold discs are no longer used for logos.
  - `Crest` component default tone changed to white (`bg-white text-ink` + soft shadow); explicit white discs on the cadet unit dossier plaque and "Other units" links; cinematic intro card disc is white.
  - Crest/logo elements are `data-visual-bg` marked so a real logo image can be attached from the visual editor — the initials fade automatically when a logo is set.
  - Keyed: `cadet-crest-<unit>`, `cadet-unit-crest-<unit>`, `cadet-cine-crest-<unit>`, `club-crest-<slug>`.

#### Fixed: element-hide hydration errors — stable visual keys
- Patches now prefer **stable `data-visual-key` selectors**: `cssSelector()` in the universal visual editor resolves the nearest `[data-visual-key]` ancestor first and only falls back to structural `:nth-of-type` chains when no key exists.
- The public boot script (`VISUAL_PATCH_BOOTSTRAP`) applies **hidden / background-image / background-color patches through an injected stylesheet (`stc-vp-boot-css`), not inline DOM mutation** — mutating attributes before React hydrates caused hydration-mismatch errors (reported as "error when hiding an element"). CSS rules carry `!important` and never touch the DOM, so React and the patch layer cannot fight. Text/src/href patches still mutate post-parse (unavoidable) and re-apply after hydration.
- Verified: keyed hide + keyed crest-logo patches apply with **zero console errors**.

#### Database note (PGlite recovery)
- The app uses embedded PostgreSQL (PGlite) at `.data/pglite`. Killing the dev server abruptly can leave the data directory in a state where the next start aborts (WASM `Aborted()` errors / 500s on every page).
- Recovery: `bun run db:reset` (drops and recreates the data dir + tables; content seed data reloads automatically; admin accounts are removed and `/admin/setup` reopens).

### v2.8.16 — Logo sync system, editor-exit fix, Online Resources section

Fix package addressing three admin requests: (1) visual edit mode leaking into the admin dashboard, (2) a site-wide logo sync system with per-logo size control, (3) a dedicated, category-based Online Resources admin section.

#### Fixed: visual edit mode blocking the admin dashboard
- **Bug:** clicking the editor toolbar's Home button navigated to `/admin`, but *nothing* there was clickable — the editor's capture-phase `mouseover/mouseout/click` interceptors stayed attached because the listener `useEffect` did not depend on `pathname` / the `?visualEditor=1` flag. Its cleanup never ran on navigation, so every admin click was swallowed (`preventDefault` + `stopPropagation`).
- `UniversalVisualEditor` now derives `leftEditor` from the route; the listener effect depends on it, so navigating to `/admin` (or dropping the flag) always **detaches the interceptors**.
- State resets (edit mode off, inspector/drawer closed, hover outlines cleared) use React's render-time derived-state pattern — no phantom edit mode when returning to the editor either.

#### Added: central logo registry (`logo_assets`) — sync every logo by ID
- Every crest/logo on the site now has a **stable sync ID** (`logoKey`): `school-crest`, `club-crest-<slug>`, `cadet-crest-<unit-slug>`, `honour-crest-<title-slug>`.
- New table `logo_assets` (idempotent runtime `CREATE TABLE IF NOT EXISTS` in `src/lib/logos.ts`, plus generated migration `drizzle/0001_red_morg.sql`) holds `draftSrc/publishedSrc` + `draftScale/publishedScale` per key.
- **Render-time sync:** every public page reads the registry (server components) — the school crest flows into `/api/site-settings` (navbar, footer, mobile menu), club crests on `/clubs-societies`, cadet crests on `/cadeting`, `/cadeting/[slug]` (dossier disc **and** cinematic intro card, shared `cadet-crest-<slug>` id) and honours crests on `/achievements`. Change a logo once → every instance updates; no per-page re-editing, and no conflicting per-page patches (legacy logo patches are removed on save).
- **Admin → Logos & Crests** (`/admin/logos`): grouped manager (School / Clubs & Societies / Cadeting Units) with white-circle previews, media picker, per-logo size slider, Save draft / Save & publish / Publish all changes / Revert / Clear.
- **Visual editor integration:** tapping any registry logo shows "Logo image (synced by ID)" plus a **Logo size in circle** slider (40–240%, 100 = fit the white circle). Saving writes the shared registry row (draft), the Publish button counts it and promotes it globally; toast confirms the site-wide sync.
- Logos always render **centred on a WHITE circle** (initials auto-fade when an image is present) — never gold.
- School-logo editing in Admin → Settings now also upserts the `school-crest` registry row, keeping both entry points in sync.

#### Added: Online Resources section (category-based management)
- New table `online_resources` + dedicated admin section **Admin → Online Resources** (`/admin/resources`):
  - Category tabs with counts; create custom categories on the fly (custom-collections type `resources`).
  - Full CRUD: title, URL, description, category, **type** (Website / Past paper / Document / Video), **medium** (All / Sinhala / Tamil / English), featured star, manual ordering.
- New public page **`/resources`** — curated library grouped/filterable by category, medium and free-text search; linked from the Academics menu (navbar) and the footer Explore list.
- Ships with six starter resources (Past Papers WiKi, e-thaksalawa, NIE, DoENets, National Library, British Council English practice).
- Dashboard quick-launch cards + sidebar + mobile admin nav entries for both new sections.

#### Notes
- `bun run db:reset` re-applies both migrations (24 tables total now). First-run `/admin/setup` reopens after any reset.
- Lint: the pre-existing strict react-hooks rule set still reports upstream warnings; the editor-exit fix deliberately uses the documented render-time derived-state pattern to stay rule-clean.

### v2.8.17 — Storage layer restored (custom image uploads fixed)

The `src/lib/storage/` module documented in v2.8.15 was missing from the working tree — every media upload, presign call and media-file request failed with `Module not found: Can't resolve '@/lib/storage'`, so **custom images could not be uploaded anywhere** (admin media library, media picker, gallery, news covers, logo sync, visual editor image inspector).

#### Fixed: recreated the provider-neutral storage layer
- `src/lib/storage/index.ts` — `getStorage()` / `getStorageDriver()` singleton factory driven by `MEDIA_STORAGE_DRIVER` (`local` | `minio` | `r2`); typed `MediaStorage` interface with optional `createSignedUpload` for direct-upload drivers.
- `src/lib/storage/local.ts` — default filesystem adapter:
  - Objects persist under `.data/media/<key>` (survives restarts), written via temp-file + atomic rename so readers never see partial files.
  - `assertSafeObjectKey()` rejects path traversal (`..`), absolute paths, backslashes, null bytes and invalid segments; `resolveMediaPath()` re-checks the joined path stays inside the media root (defence in depth).
  - Public URLs use `/api/media/file?key=…` (immutable cache route, `localPatterns` configured in `next.config.ts`).
- `src/lib/storage/s3.ts` — S3-compatible adapter shared by MinIO (path-style) and Cloudflare R2 using `@aws-sdk/client-s3` + `s3-request-presigner` (both already in dependencies): `putObject` / `getObject` / `deleteObject` / `getPublicUrl` (honours `MEDIA_STORAGE_PUBLIC_BASE_URL`) and `createSignedUpload` (presigned PUT, content type signed).

#### Fixed: multipart upload endpoint
- `src/app/api/admin/media/upload/route.ts` (new) — the presign route answers `mode: "proxy"` for the local driver, and the admin clients (media picker + media library modal) POST to this endpoint. Validates admin session, file type (JPEG/PNG/WebP/AVIF/HEIC), 20 MB limit, then runs `processAndStoreImage` (sharp → WebP variants thumbnail/small/medium/master + blur placeholder + dominant colour + sha256 duplicate detection).

#### Verified end-to-end (API + real browser)
- `/api/media/file?key=…` serves stored bytes with `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`; traversal keys return 404.
- API upload → asset + WebP variants in DB + files on disk; master variant serves `200 image/webp`; duplicate upload returns `duplicate: true` and reuses the asset.
- Presign returns `{"mode":"proxy","driver":"local"}` so clients route correctly.
- Browser UI test (Agent Browser): admin login → Media Library → Upload modal → file chosen via device picker → "Upload & optimise" → asset appears with live-rendering thumbnail ("Uploaded 2"); zero console errors.
- Test data (temp admin + 2 test assets) fully removed afterwards; the real admin account and site content are untouched.

#### Operational notes
- Switching to object storage later needs zero code changes: set `MEDIA_STORAGE_DRIVER=minio|r2` + endpoint/bucket/credentials (+ `MEDIA_STORAGE_PUBLIC_BASE_URL` for R2 reads) and redeploy — existing keys keep resolving because the driver is stored per asset.
- If PGlite reports `failed to initialize` after an unclean shutdown, delete the stale `.data/pglite/postmaster.pid` **while the dev server is stopped** before running DB scripts.

### v2.8.18 — Admin Studio upgrade (10 admin requests)

#### 1. Falcon emblem — changeable, drops in like a crest
- New `AdminEmblem` component (`src/components/admin/admin-emblem.tsx`): the falcon crest appears at the top of Admin Studio — sidebar, dashboard banner, sign-in page — and **drops in from the top like a crest** (`emblemDrop` keyframes in globals.css, respects `prefers-reduced-motion`).
- Admin → Settings → **Falcon emblem**: image picker/URL (built-in gold bird until set), **emblem size slider**, drop-animation toggle, all with a realtime preview circle.
- Settings keys: `falconImage`, `falconScale`, `falconIntroEnabled`.

#### 2. Logos manager — realtime preview
- While editing a logo, the white-circle preview now mirrors the **URL being typed and the size slider** live — no draft/publish needed to see the result (edit ring highlights the active card).

#### 3. Admin Studio — clean grouped sections
- Sidebar reorganised into labelled groups: **Overview · Content (Pages, News & Stories, Events, Faculty & Staff) · Media (Media Library, Campus Gallery, Unit Galleries) · Website (Online Resources, Logos & Crests, Footer) · System (Settings)**. Mobile nav gains the Footer entry.

#### 4. Footer — its own section (out of Settings)
- New **Admin → Footer** (`/admin/footer`, `FooterManager`): description, address, phone, email, office hours + crest, with a live preview mirroring the public footer.
- Settings now holds only **Falcon emblem + Cadeting preloader + brand basics** (name, subline, admissions year, crest) — footer editing lives in its dedicated section.

#### 5. Cadeting preloader system
- Settings → Cadeting preloader now has: enable toggle, direct-visit hold (ms), **global logo override** (empty = each unit's own synced crest from the logo registry) with **logo size slider**, and an optional **tagline override**. Wired through `CinematicIntro` (`cadetIntroLogo`, `cadetIntroLogoScale`, `cadetIntroTagline`).

#### 6. Dashboard — professional, image-led
- Cinematic welcome banner (hero photo + falcon emblem + greeting), refined 8-metric strip, and three photographic **section hub cards** (Content / Media / Website) with real imagery, hover lift and per-section quick links.

#### 7. Image size (zoom) controls while editing
- Shared zoom-slider pattern (50–240 %) with live preview in: **news cover** (`imageScale`, applied on the article cover), **staff portrait** (`photoScale`, applied in admin grid + public avatar), **unit-gallery photos** (`zoom`, applied on public tiles), logos (existing) and the falcon/preloader logos.

#### 8. Faculty & Staff — photo preview fixed
- The admin staff grid always showed initials even when a portrait existed; cards now render the real photo (initials remain the fallback) — matching the public site. Portrait zoom slider added in the editor.

#### 9. News & Stories — Images / Links / Videos toggles
- Tick **Images** → up to **5 story photo slots** (URL + media picker each); tick **Links** → labelled related-link rows; tick **Videos** → YouTube/direct-URL rows. Unticking clears that list. Stored in new `posts` columns `extra_images` / `links` / `videos` (+ `image_scale`), synced with `media_usage`.
- Public article renders them: photo strip ("Story photos"), video section (YouTube → `youtube-nocookie` embed, else `<video>`), and a "Read more" link list.

#### 10. Unit gallery — proper "+" add dialog
- The dashed "+" tile and the new "Add photos" button open a dialog with **multiple image slots + title + short sentence + shape**; one gallery tile is created per image (up to 10 per batch).

#### Schema & infrastructure
- New columns added idempotently at runtime (`src/lib/schema-extras.ts`, called from seed + admin APIs): `staff.photo_scale`, `posts.image_scale/extra_images/links/videos`, `unit_gallery_items.zoom`. `SiteImage` gained a `style` prop for zoom transforms.
- **PGlite crash recovery that preserves data:** abrupt dev-server kills corrupted the WAL twice (`PANIC: could not locate a valid checkpoint record`). `db:reset` would delete all content — instead, a standalone PostgreSQL 17 `pg_resetwal -f .data/pglite` (from theseus-rs/postgresql-binaries) rebuilt the WAL with **zero data loss**. Recovery steps recorded here for future incidents:
  1. Stop the dev server; `rm -f .data/pglite/postmaster.pid`
  2. `pg_resetwal -f .data/pglite` (PG17 binary — PGlite 0.3.x embeds PostgreSQL 17)
  3. Restart `bun run dev`
- All 10 features verified in-browser (Agent Browser): emblem drop + settings preview, logo realtime preview, grouped nav, footer section, preloader override live on `/cadeting/*`, dashboard render, zoom sliders, staff photos, story attachments end-to-end (admin → DB → public article), unit add dialog. Test data (temp admin, demo attachments, test gallery item) removed afterwards.

### v2.8.19 — Calm emblem, per-unit preloaders, Profile & Version History

Five follow-up admin requests on top of v2.8.18.

#### 1. Admin emblem — white circle, no animation
- `AdminEmblem` no longer animates: the yellow circle and the `emblemDrop` keyframes are gone. The falcon now sits calmly in a **white circle** (black ring + soft shadow) across the sidebar, dashboard and sign-in page.
- Settings → Falcon emblem lost the "Play the drop-in animation" checkbox; both preview circles are white. `falconIntroEnabled` default removed (legacy rows are ignored).

#### 2. Cadeting preloaders — edit each unit separately
- New `cadet_intro_overrides` table (one row per unit slug: `enabled` inherit/on/off, `holdMs`, `logoSrc`, `logoScale`, `tagline`) created idempotently in `schema-extras.ts`.
- New **Admin → Preloaders** section (`/admin/preloaders`, moved out of Settings like Footer): global defaults card (draft/publish via site settings) + a card per cadeting unit with its own intro on/off, hold ms, logo (+ size slider), tagline, **live mini preview of the cinematic card**, per-unit Save and "Reset to defaults". Saved through `/api/admin/cadet-intro` (GET/PUT/DELETE, audit-logged, revalidates `/cadeting`).
- `resolveCadetIntro()` (`src/lib/cadet-intro.ts`) merges per-unit override → global settings → the unit's own crest/tagline on `/cadeting/[slug]`.

#### 3. System group — Profile + Version History
- **Admin → Profile** (`/admin/profile`): profile photo (media library + remove), display name, read-only sign-in email, role, last sign-in/admin-since timestamps, and a **Change password** form (current password verified server-side, min 10 chars, confirmation match). New `admin_users.avatar` column (runtime ALTER); the sidebar identity now shows the avatar/initials.
- **Admin → Version History** (`/admin/versions`): first reader of the append-only `admin_audit_logs` table — v2.8.19 site version, total recorded changes, search, entity filter chips and a day-grouped timeline (time · entity badge · human sentence · details · who). Humanised sentences for all ~40 actions.
- Audit coverage completed: logo save/publish/revert and cadet-intro changes are now logged too, so **every** change anywhere on the site is recorded with date, time and author.
- New APIs: `/api/admin/profile` (GET/PATCH/PUT) and `/api/admin/audit` (GET, filters, joins admin name) — both admin-guarded.

#### 4. News & Stories — media picker popup fixed
- Root cause: `MediaLibraryButton` rendered the picker **inside** the editor's `g-panel` modal; the panel's persistent `transform` (animation fill `both`) made it a containing block for `position:fixed` descendants and its `overflow-hidden` clipped the sheet — so the picker overflowed, wasn't centred and sat behind the headline.
- Fix: the picker now renders through `createPortal(document.body)` (fixes all 13 call sites at once) and `.g-panel` uses `backwards` fill so its transform is cleared after the entrance. Verified in the news editor: sheet centred on the viewport, media clickable, cover updates live.

#### 5. Faculty & Staff — framed zoom preview
- The edit-modal portrait preview now sits in a gold-ringed, `overflow-hidden` frame (matching the public circular crop) with a live "N% zoom" badge — the zoom slider (50–240 %) shows exactly how the portrait will be cropped instead of overflowing over the URL input.

#### Infrastructure notes
- `getAdminSession()` runs `ensureSchemaExtras()` first, so late-added columns (e.g. `admin_users.avatar`) always exist before the session query — fresh boots no longer 500 on the first admin request.
- Another abrupt dev-server kill corrupted the PGlite WAL ("RuntimeError: Aborted()"); recovered again with the documented `pg_resetwal -f .data/pglite` procedure, zero data loss. Note: `pg_resetwal` restores to the last checkpoint, so changes made shortly before the crash can roll back — verified test rows were re-cleaned afterwards.
- All five features browser-verified (Agent Browser): white emblem everywhere, per-unit preloader save → live on `/cadeting/army-cadet` → reset, profile save + wrong-password rejection, version-history timeline with real entries, media picker centred + clickable, staff zoom 240 % clipped inside the frame. Temporary verification admin removed afterwards.

### Phase 2.8 verification (performed 2026)

Automated end-to-end checks against a running production build:

1. Multipart local upload produced WebP variants and a `ready` asset.
2. Creating a gallery frame with a library URL inserted a `media_usage` row.
3. Trashing that asset returned HTTP 409 while the usage row existed.
4. Changing the frame image cleared the usage row; trash then succeeded.
5. Saving a visual page patch with a library `src` inserted a page-level usage row; publishing retained it and trash was again blocked.
6. Re-uploading the same file was detected by SHA-256 hash and safely reused (`duplicate: true`).
7. `/api/media/file` delivered processed WebP with immutable caching.
8. `npx next typegen`, `tsc --noEmit` and `next build` all pass.

### v2.8.14 verification (performed 2026)

1. All 16 public routes + cadeting unit pages return 200 with the new schema (`staff.image`, `unit_gallery_items`, `visual_blocks` pushed via Drizzle).
2. New endpoints `/api/admin/visual-blocks` and `/api/admin/unit-gallery` return 401 unauthenticated and are wrapped in the admin layout guard.
3. `data-trend-row`, `data-visual-bg` and `data-structured-content` markers verified in served HTML.
4. Draft/publish lifecycle for blocks shares the same publish endpoint as element patches (single "Publish now" action publishes both).

### Current development mode

```text
MEDIA_STORAGE_DRIVER=local
# Local development assets use the fixed, Git-ignored .data/media directory.
```

Uploaded development images are written under `.data/media`, which is ignored by Git. This storage is suitable for local/sandbox development only; it is not persistent production storage.

### Optional card-free MinIO mode

```text
MEDIA_STORAGE_DRIVER=minio
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_BUCKET=school-media
MINIO_ACCESS_KEY_ID=<local access key>
MINIO_SECRET_ACCESS_KEY=<local secret>
MINIO_PUBLIC_BASE_URL=http://127.0.0.1:9000/school-media
```

The same admin uploader and processing pipeline work in local, MinIO and R2 modes. No UI rewrite is required during the eventual production switch.

Optional MinIO startup (requires Docker on the developer machine):

```bash
docker compose -f docker-compose.media.yml up -d
```

Then open `http://127.0.0.1:9001`, sign in with the local MinIO development credentials, create a `school-media` bucket, configure browser CORS for the development origin, and allow public reads for that **development bucket only**. Do not copy development credentials or public-write policies to production.

If Docker/MinIO is not available, keep `MEDIA_STORAGE_DRIVER=local`; no external account or card is required.

### Utility commands

```bash
# Create a custom-format PostgreSQL backup
node scripts/backup-database.mjs

# Generate a redacted schema and row-count report
node scripts/database-report.mjs

# Restore only after checking the target database carefully
ALLOW_RESTORE=YES BACKUP_FILE=.data/backups/<file>.dump node scripts/restore-database.mjs
```

### Next approved implementation section

1. ~~Test the local upload and WebP pipeline from mobile and desktop admin.~~ ✅ Verified (see Phase 2.8 verification above; retest from a physical phone before production).
2. Test a real local MinIO instance and browser CORS/direct signed uploads (requires Docker on the developer machine).
3. ~~Add media picker integration to News, Gallery, Staff and the universal visual editor.~~ ✅ Done — News, Gallery and the universal visual editor (Staff portraits use presets; no URL field exists there yet).
4. ~~Add `media_usage` synchronization so used assets cannot be trashed.~~ ✅ Done — posts, gallery frames and visual page patches are synced on every mutation.
5. Only then proceed to Supabase PostgreSQL migration.

---

## 1. Product Vision

The platform should remain:

- Premium and cinematic on the public website.
- Safe and simple enough for school staff to manage from a phone.
- Low-cost at school-scale traffic.
- Secure enough for admission applications and administrative records.
- Independent of local server storage.
- Easy to migrate, back up and restore.
- Extendable without repeatedly rewriting the same pages.

The administration experience follows a hybrid model:

- **Visual editor:** marketing pages and normal page content.
- **Structured managers:** news, events, gallery, staff, admissions, appointments and inquiries.
- **Media library:** categorized R2 assets with upload, processing, usage tracking and safe deletion.

---

## 2. Current Project State

### Public website

Implemented public areas include:

- Home
- History
- Vision & Mission
- Principal's Message
- Staff
- Ordinary Level and online resources
- Advanced Level and four stream detail pages
- Exam Results
- Achievements
- Clubs & Societies
- Sports
- Cadeting and five cinematic unit pages
- News & Events
- Gallery
- Admissions
- Contact and appointment booking

### Admin system

Implemented functionality includes:

- Secure first-admin setup and custom session authentication.
- Mobile-first dark admin dashboard.
- Full-width visual editor over the original website.
- Draft, publish, discard and revision workflows.
- Universal element-level visual editing.
- News/blog manager.
- Events manager.
- Gallery manager.
- Staff manager.
- Media asset browser for preloaded images.
- Custom content collections/categories.
- Admission applications and department appointments.
- Audit records.

### Current infrastructure

- Next.js App Router
- React
- PostgreSQL
- Drizzle ORM
- Local/public image assets and external image URLs
- Custom password/session authentication

### Target infrastructure

- **Application:** Next.js remains unchanged.
- **Database:** Supabase PostgreSQL accessed through Drizzle.
- **Authentication:** Supabase Auth using `@supabase/ssr`.
- **Roles:** application profiles/roles plus server-side permission checks.
- **Media:** Cloudflare R2 with a custom media domain.
- **Image delivery:** optimized WebP masters and responsive variants, optionally assisted by Cloudflare Image Transformations.

---

## 3. Final Architecture Recommendation

```text
Browser / Mobile Admin
        |
        |-- Public Website
        |-- Visual Editor
        |-- Structured Managers
        |
Next.js App Router
        |
        |-- Supabase Auth verification
        |-- Server-side permission layer
        |-- Drizzle ORM
        |-- R2 signed-upload API
        |
        |---- Supabase PostgreSQL
        |       |-- content
        |       |-- operational records
        |       |-- profiles and roles
        |       |-- media metadata
        |       |-- audit logs
        |
        |---- Cloudflare R2
                |-- WebP masters
                |-- thumbnails
                |-- optional originals
                |-- documents
                |-- temporary uploads
```

### Why this architecture

- Drizzle can continue to power all existing database code.
- Supabase Auth replaces only authentication/session logic; content APIs do not need a full rewrite.
- Direct signed uploads prevent large images from travelling through the Next.js hosting provider.
- R2 provides inexpensive object storage with no direct R2 egress fees.
- The database stores metadata and references, not binary files.
- Roles are checked on every server mutation instead of trusting the browser UI.

---

# 4. Phase 2 Implementation Roadmap

The migration must be completed in small, independently testable sections. Do not combine database, authentication and media cutovers in one release.

---

## Phase 2.1 — Preparation, Backups & Environment Abstraction

### Goal

Make the current project safe to migrate without changing production behavior.

### Work

1. Create a staging environment separate from production.
2. Export the current PostgreSQL schema and all data.
3. Save an off-site SQL backup.
4. Record current row counts for every table.
5. Record existing admin users, media URLs and page revisions.
6. Add an infrastructure health page visible only to super admins.
7. Document all current environment variables without storing secret values in Git.
8. Add database migration scripts instead of relying only on schema push.
9. Add a migration/cutover maintenance mode.
10. Add a rollback switch so the application can temporarily return to the previous database URL.

### Deliverables

- Verified SQL backup.
- Table-by-table row count report.
- Staging deployment.
- Environment variable template.
- Rollback checklist.

### Definition of Done

- The current application can be rebuilt from a fresh database backup.
- The backup restore has been tested, not merely created.
- No production data changes are required yet.

---

## Phase 2.2 — Supabase PostgreSQL Migration

### Recommendation

Migrate the database **before** migrating authentication. Keep the current custom authentication running temporarily while verifying the new Supabase database.

### Connection strategy

Use:

- `DATABASE_URL`: Supabase Shared Pooler / transaction mode for the running Next.js application.
- `DIRECT_DATABASE_URL`: direct connection for migrations and administrative operations.

Continue using Drizzle ORM.

### Work

1. Create a Supabase project in the closest suitable region.
2. Configure database passwords and network settings.
3. Create all existing tables in Supabase using migrations.
4. Import current content and operational data.
5. Reset database sequences after import.
6. Verify timestamps, JSON columns, unique constraints and indexes.
7. Point staging to Supabase's pooler URL.
8. Test all public reads.
9. Test all admin writes.
10. Test admissions, appointments and contact submissions.
11. Compare source and destination row counts.
12. Run a second delta import immediately before production cutover.

### Drizzle notes

- Keep Drizzle as the application's single content/database ORM.
- Supabase documentation recommends using the Connection Pooler for Drizzle.
- Transaction-pooling drivers may require prepared statements to be disabled, depending on the selected PostgreSQL driver.
- Do not expose direct database credentials to the browser.

### RLS decision

The recommended initial model is **server-owned writes**:

- The browser does not write content tables directly.
- Next.js APIs verify Supabase Auth and permissions.
- Drizzle performs the mutation server-side.
- Sensitive tables are not publicly readable through Supabase Data APIs.

RLS should still be enabled where Data API access exists, but application authorization must not depend only on hiding admin buttons.

### Backup warning

Supabase Free projects do not include the same automatic backup access as paid plans. Until a paid plan is used:

- Schedule regular `supabase db dump` or `pg_dump` exports.
- Store backups outside the Supabase project.
- Run restore tests.
- Retain at least seven recent daily copies and four weekly copies.

### Definition of Done

- Every existing table and row is present in Supabase.
- Public pages and all admin managers pass regression testing.
- New submissions write only to Supabase.
- No local database dependency remains in production.
- A tested rollback procedure exists.

---

## Phase 2.3 — Supabase Auth & Role Management

### Recommendation

Use `@supabase/ssr` with cookie-based sessions for Next.js App Router.

Do not use deprecated Auth Helpers.

For authorization decisions:

- Verify the authenticated identity server-side using trusted claims or a fresh user lookup.
- Never trust an unverified client session object.
- Never use user-editable metadata as the sole permission source.

### Authentication policy

- Public self-signup disabled.
- Accounts are invite-only.
- Email confirmation required.
- MFA required for super admins.
- Password recovery enabled.
- Disabled users lose access immediately.
- Shorter sessions for high-risk roles are preferred.

### Recommended roles

```text
super_admin
content_editor
news_editor
gallery_editor
staff_editor
admissions_officer
viewer
```

### Recommended permission matrix

| Module | Super Admin | Content | News | Gallery | Staff | Admissions | Viewer |
|---|---:|---:|---:|---:|---:|---:|---:|
| Visual pages | Full | Edit | Read | Read | Read | Read | Read |
| News | Full | Read | Edit | Read | Read | Read | Read |
| Events | Full | Read | Edit | Read | Read | Read | Read |
| Gallery | Full | Read | Read | Edit | Read | Read | Read |
| Media | Full | Upload | Upload | Upload | Upload | Read | Read |
| Staff | Full | Read | Read | Read | Edit | Read | Read |
| Admissions | Full | None | None | None | None | Edit | Read-only |
| Appointments | Full | None | None | None | None | Edit | Read-only |
| Settings | Full | Limited | None | None | None | None | None |
| Roles/users | Full | None | None | None | None | None | None |

### Database model

```text
profiles
  user_id              uuid, references auth.users
  display_name
  role
  active
  avatar_asset_id
  last_seen_at
  created_at
  updated_at

role_permissions       optional future normalization
admin_audit_logs       already exists; migrate user IDs to UUID-compatible form
```

### Migration from current auth

Do not migrate password hashes directly.

Recommended process:

1. Invite the existing administrator through Supabase Auth.
2. Confirm the new login works.
3. Assign `super_admin` in `profiles`.
4. Run both auth systems briefly only in staging.
5. Switch server guards to Supabase.
6. Revoke and delete old custom sessions.
7. Archive or remove obsolete custom auth tables after a safety period.

### Definition of Done

- Each role sees only its permitted admin modules.
- Every API mutation enforces permissions server-side.
- Unauthorized API calls return 401 or 403.
- Super admin MFA works.
- Account deactivation immediately blocks access.
- Audit logs identify Supabase user IDs.
- Current custom auth can be safely removed.

---

## Phase 2.4 — Cloudflare R2 Foundation

### Recommendation

Use a dedicated R2 bucket and custom media domain, for example:

```text
media.stcmatale.lk
```

Use the **Standard** storage class initially. School website assets are frequently accessed and should not incur retrieval fees.

### Current official R2 cost envelope

At the time this roadmap was written, Cloudflare documents:

- 10 GB-month Standard storage included per month.
- 1 million Class A operations included per month.
- 10 million Class B operations included per month.
- Direct R2 egress to the Internet is free.
- Standard storage beyond the allowance is listed at a low per-GB monthly price.

Pricing can change; verify the official pricing page before implementation.

### Bucket design

Use one production bucket initially, with clear prefixes:

```text
temporary/
originals/
images/site/
images/news/YYYY/
images/gallery/campus/
images/gallery/academics/
images/gallery/sports/
images/gallery/arts-culture/
images/staff/
images/cadeting/army/
images/cadeting/eastern-band/
images/cadeting/western-band/
images/cadeting/police-cadet/
images/cadeting/scouts/
documents/admissions/
documents/academics/
trash/
```

### Direct upload flow

```text
Authenticated admin chooses file
        ↓
Browser validates size/type
        ↓
Next.js creates one short-lived signed PUT URL
        ↓
Browser uploads directly to R2
        ↓
Server verifies object metadata
        ↓
Image processing runs
        ↓
Metadata record becomes ready
```

### Signed URL security

- Generate an unpredictable server-controlled object key.
- Never accept a complete client-provided R2 key.
- Restrict `Content-Type` in the signed PUT operation.
- Use a short expiry, ideally 5–10 minutes.
- Allow only the exact R2 bucket and object.
- Configure R2 CORS for the real admin origin only.
- Keep R2 access key and secret server-side.
- Enforce per-file and per-user upload limits.
- Verify the resulting object after upload.

### Recommended upload limits

- Images: maximum 15–20 MB before browser compression.
- Processed master: maximum 3–4 MB.
- Documents: maximum based on business need, initially 20 MB.
- Video: do not upload through this system initially; use YouTube/Vimeo embeds.

### Delivery and caching

Use content-hashed object names:

```text
images/gallery/sports/big-match.ab12cd34.webp
```

Recommended cache header:

```text
Cache-Control: public, max-age=31536000, immutable
```

Replacing an image creates a new object key. Do not overwrite a cached object at the same URL.

### Definition of Done

- Signed direct upload succeeds without proxying bytes through Next.js.
- Upload URL cannot write another object key.
- R2 CORS works only for approved origins.
- Custom media domain serves files through Cloudflare cache.
- Secrets are never exposed to the browser or committed to Git.
- Failed temporary uploads are cleaned automatically.

---

## Phase 2.5 — Image Processing & WebP Pipeline

### Main recommendation for low cost

Use a two-layer strategy:

1. **Browser pre-processing** for speed and reduced upload size.
2. **Server/Worker authoritative validation and transformation** for consistency and safety.

Do not rely only on browser conversion.

### Low-cost rollout

#### Initial release

- Browser resizes large phone photos to a maximum long edge of 2560 px.
- Browser converts to WebP around quality 80–84.
- A small blurred/thumbnail WebP is generated.
- Processed assets upload directly to R2 through signed URLs.
- Server verifies extension, content type, dimensions, size and ownership.

#### Later optimization

Use Cloudflare Image Transformations for automatic width/format negotiation if usage and budget justify it. Cloudflare documentation indicates that image transformations can operate on assets stored outside Cloudflare Images, including R2; pricing and included transformations must be verified before enabling production usage.

A Worker with an Images binding can also transform bytes from R2 before writing variants, but some workflows require Cloudflare Images paid capabilities. Do not assume all upload-time transformations are free.

### Recommended outputs

For a typical photograph:

```text
master.webp         max 2560 px, quality ~82
large.webp          1920 px, quality ~80
medium.webp         1280 px, quality ~79
small.webp           640 px, quality ~76
thumbnail.webp       320 px, quality ~72
```

AVIF is optional. Start with WebP for predictable compatibility and processing cost.

### Asset-type presets

| Asset | Master max | Crop | Notes |
|---|---:|---|---|
| Hero | 2560 px | landscape | protect focal point |
| Gallery landscape | 1920 px | none | preserve composition |
| Gallery portrait | 1600 px | none | portrait metadata |
| Staff portrait | 1200 px | 4:5 optional | face focal point |
| News cover | 1920 px | 16:10 preview | original crop preserved |
| Logo/crest | original | none | preserve SVG/PNG where appropriate |

### Privacy and safety

Processing must:

- Auto-rotate based on orientation metadata.
- Strip EXIF data.
- Strip GPS coordinates.
- Reject unsupported/corrupt files.
- Confirm real file signatures instead of trusting extensions.
- Limit pixel dimensions to prevent decompression bombs.
- Prevent SVG script injection; sanitize or disallow arbitrary SVG uploads.

### Originals policy

Recommended low-budget approach:

- Retain originals only for hero, archival and historically significant photos.
- Mark temporary originals for deletion after 7–30 days.
- Keep processed WebP masters permanently.
- Use lifecycle cleanup for abandoned uploads.

### Definition of Done

- A large phone JPEG becomes consistent WebP variants.
- Orientation is correct.
- GPS and EXIF data are removed.
- Variants are recorded in the database.
- Processing failure is visible in admin UI and retryable.
- Failed jobs leave no public broken assets.

---

## Phase 2.6 — Media Metadata Model

### Tables

```text
media_assets
  id                    uuid
  title
  alt_text
  caption
  folder
  category
  status                uploading | processing | ready | failed | trashed
  original_key
  original_filename
  mime_type
  width
  height
  original_size
  dominant_color
  blur_data_url
  content_hash
  focal_x
  focal_y
  uploaded_by
  created_at
  updated_at
  deleted_at

media_variants
  id
  asset_id
  variant_name          thumbnail | small | medium | large | master
  format
  width
  height
  r2_key
  file_size
  public_url
  created_at

media_usage
  id
  asset_id
  entity_type           page | post | gallery | staff | event
  entity_id
  field_name
  page_path
  created_at
```

### Important constraints

- `content_hash` should prevent duplicate uploads.
- An asset cannot be permanently deleted while active usage rows exist.
- Replacing an image creates new variant keys.
- Trashing an asset does not immediately delete R2 objects.
- Permanent deletion should require super-admin permission.

---

## Phase 2.7 — Categorized Media Library Redesign

### Reason for delaying until after R2

The current browser only displays existing URLs. Building the final library before the R2 object model and metadata tables exist would require rewriting it twice.

### Desktop layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Search | Type | Orientation | Year | Sort | Upload           │
├───────────────┬─────────────────────────────────────────────┤
│ All Media     │ Thumbnail grid                              │
│ Recent        │                                             │
│ Site Assets   │                                             │
│ News          │                                             │
│ Gallery       │                                             │
│  ├ Campus     │                                             │
│  ├ Academics  │                                             │
│  ├ Sports     │                                             │
│  └ Arts       │                                             │
│ Staff         │                                             │
│ Cadeting      │                                             │
│ Documents     │                                             │
│ Unused        │                                             │
│ Trash         │                                             │
└───────────────┴─────────────────────────────────────────────┘
```

### Mobile layout

- Two-column thumbnail grid.
- Folder/category switcher in a bottom sheet.
- Floating Upload button.
- Full-screen asset detail panel.
- Sticky search bar.
- Filter and sort sheets.
- Large touch targets.

### Asset card

Each card displays:

- Thumbnail
- Title
- Dimensions
- File size
- Format
- Folder/category
- Usage count
- Processing status

### Asset detail drawer

- Large preview
- Title
- Alt text
- Caption
- Folder
- Category
- Focal point control
- Dimensions and file sizes
- Available variants
- R2 object key
- Public URL
- Usage locations
- Replace
- Copy URL
- Download original, where permitted
- Move to trash

### Filters

- Images / Documents / Video embeds
- Folder
- Category
- Year
- Landscape / Portrait / Square
- Uploaded by
- Used / Unused
- Ready / Processing / Failed
- Newest / Oldest / Largest / Smallest

### Definition of Done

- Admins can understand the library without seeing one stressful infinite grid.
- Uploading from a phone works reliably.
- Search and filters remain usable with thousands of assets.
- Clicking an image opens details instead of immediately copying a URL.
- Unused assets can be identified.
- Used assets cannot be accidentally deleted.

---

## Phase 2.8 — CMS and Content Manager Integration

### Goal

Replace manual image URL fields with an asset picker.

### Integration points

- Universal visual editor image inspector
- Home/History section editor
- News cover images
- Gallery frame images
- Staff portraits
- A/L building images
- Sports/cadeting images
- Settings logo/brand assets

### Picker behavior

1. Open Media Picker.
2. Show context-relevant folder/category first.
3. Select asset.
4. Pick focal point/crop where applicable.
5. Store `asset_id` plus resolved public URL.
6. Create a `media_usage` record.
7. Remove previous usage reference safely.

### Migration compatibility

During transition, fields should support:

- Existing `/images/...` URLs.
- Existing external Pexels URLs.
- New R2 asset URLs.
- New `media_asset_id` references.

Do not break existing pages while migration is incomplete.

---

## Phase 2.9 — Existing Media Migration

### Steps

1. Inventory every image URL used by the website and database.
2. Download or locate source files where legally permitted.
3. Compute content hashes and remove duplicates.
4. Process variants.
5. Upload to R2.
6. Insert media metadata and variants.
7. Update content references in batches.
8. Verify every page visually.
9. Run a broken-image crawler.
10. Keep old paths operational during a safety window.
11. Remove old public assets only after final approval.

### Externally sourced images

Before copying external stock images into R2, confirm that the license allows storage and redistribution. Keep source/attribution metadata where required.

---

## Phase 2.10 — Hardening, Backups & Launch

### Required checks

- Auth role test matrix.
- RLS policy tests where applicable.
- API permission tests.
- Signed upload abuse tests.
- Upload size/type tests.
- Duplicate image test.
- Broken image test.
- Mobile upload test on weak connectivity.
- Database restore test.
- R2 object restoration/versioning plan.
- Content publish/revision restore tests.
- Admin account disable test.
- Audit log completeness.

### Operational jobs

- Nightly database dump on Free plan.
- Temporary R2 object cleanup.
- Failed processing cleanup.
- Orphan media usage scan.
- Revision retention cleanup.
- Audit retention cleanup.
- Broken link/image monitoring.

---

# 5. Environment Variables — Future Target

Do not place secret values in this README or Git.

```text
# Supabase public
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# Supabase server
SUPABASE_SECRET_KEY=
DATABASE_URL=                  # Pooler connection
DIRECT_DATABASE_URL=           # Migration/direct connection

# Cloudflare R2 server-only
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=https://media.example.com

# Optional Cloudflare image processing
CLOUDFLARE_IMAGES_ACCOUNT_HASH=
CLOUDFLARE_IMAGES_TOKEN=

# Application
NEXT_PUBLIC_APP_URL=
```

### Secret rules

- Never prefix R2 or Supabase secret keys with `NEXT_PUBLIC_`.
- Never send service-role/secret credentials to the browser.
- Rotate secrets after accidental exposure.
- Separate staging and production credentials.

---

# 6. Cost-Control Recommendation

For the intended school-scale workload, the recommended starting point is:

- Supabase Free during development/staging if limits are acceptable.
- Supabase Pro for production when uptime and automatic daily backups are required.
- R2 Standard with the free monthly allowance initially.
- WebP-first media pipeline.
- No self-hosted video.
- No large binary files in PostgreSQL.
- No unnecessary realtime subscriptions.
- No automatic generation of dozens of unused image variants.

### Current Supabase free-plan considerations

The official pricing page currently describes, among other limits:

- 500 MB database size.
- 50,000 monthly active users.
- 5 GB egress plus cached egress allowance.
- Free projects can pause after inactivity.
- Automatic backups are not included at the same level as Pro.

Verify limits before production launch.

### Expected media behavior

A school site with several thousand optimized images can often remain inexpensive on R2, especially when:

- Images are WebP.
- Duplicates are detected.
- Originals are cleaned according to policy.
- Public delivery uses Cloudflare cache.
- Video remains external.

---

# 7. Rollback Strategy

Every infrastructure change must be reversible.

## Database rollback

- Keep the pre-migration PostgreSQL backup.
- Keep old database credentials available but disabled.
- Maintain a deployment version that supports the old schema until acceptance.
- If Supabase cutover fails, restore the previous deployment and database URL.

## Authentication rollback

- Do not delete custom auth tables during the first Supabase Auth release.
- Keep the old auth code in a rollback branch.
- Remove old auth only after stable production use and account recovery testing.

## R2 rollback

- Keep old public image paths working during migration.
- Update image references gradually.
- Do not delete old assets until all pages pass visual and broken-link checks.
- Store an export of media metadata and R2 object keys.

---

# 8. Future Phase 3

After infrastructure and media are stable, Phase 3 should focus on operations:

- Admissions workflow dashboard.
- Appointment calendar and confirmation.
- Contact inbox.
- Status changes and internal notes.
- CSV export.
- Email notifications.
- Role administration.
- Full audit viewer.
- Analytics and content health.
- Scheduled publishing.
- Expired announcement handling.

Do not start Phase 3 before Supabase Auth, roles, R2 and media usage tracking are production-stable.

---

# 9. Recommended Next Implementation Session

Start with **Phase 2.1 only**.

### Exact first-session scope

1. Create migration/backup documentation.
2. Add `.env.example` with placeholders only.
3. Add database migration tooling/configuration.
4. Produce table row-count and schema reports.
5. Add staging readiness checks.
6. Do not change authentication.
7. Do not change media storage.
8. Do not change production database yet.

Once Phase 2.1 is tested and accepted, proceed to Phase 2.2 Supabase PostgreSQL migration.

---

# 10. Continuation Checklist for Future AI/Developer Sessions

Before changing code:

- Read this README completely.
- Inspect the current schema and migration history.
- Confirm which Phase 2 sub-phase is approved.
- Do not combine unapproved phases.
- Back up before database changes.
- Preserve mobile-first admin usability.
- Preserve existing URLs and published content.
- Test draft/publish behavior after every change.
- Run Next route type generation, TypeScript and production build.
- End with a production server/healthcheck validation.

After changing code:

- Record completed work in this README.
- Record new environment variables.
- Record schema migrations.
- Record rollback instructions.
- Record tests performed.
- Do not mark a sub-phase complete until its Definition of Done passes.

---

# 11. Decision Log

## Accepted decisions

- Next.js remains the application framework.
- Drizzle remains the ORM.
- Supabase is the target PostgreSQL and authentication provider.
- Cloudflare R2 is the target media/document object storage provider.
- R2 uploads should be direct from the browser through signed URLs.
- Image processing is WebP-first.
- Media metadata is stored in PostgreSQL.
- Visual page editing and structured content managers remain separate.
- Media Library is rebuilt only after the R2/media metadata model is ready.
- Public signup is disabled; admin access is invite-only.

## Decisions still required before implementation

- Production Supabase plan: Free or Pro.
- Final Supabase region.
- Production media domain.
- Keep or delete original images after processing.
- Use browser + Sharp, browser + Worker, or Cloudflare Image Transformations for authoritative variants.
- Exact backup destination and schedule.
- MFA enforcement policy for non-super-admin roles.
- Revision and audit-log retention duration.

---

# 12. Official References

Review current official documentation immediately before implementation because pricing and platform behavior can change.

- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Cloudflare R2 uploads: https://developers.cloudflare.com/r2/objects/upload-objects/
- Cloudflare Image Transformations: https://developers.cloudflare.com/images/optimization/transformations/
- Cloudflare Images pricing: https://developers.cloudflare.com/images/pricing/
- Supabase pricing: https://supabase.com/pricing
- Supabase Next.js guide: https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Drizzle guide: https://supabase.com/docs/guides/database/drizzle
- Supabase database connections: https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase database backups: https://supabase.com/docs/guides/platform/backups

---

_Last updated: 2026. Update this roadmap as each sub-phase is approved and completed._
