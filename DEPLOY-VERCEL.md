# Deploying the St. Thomas' College site (v2.8.64.1)

**Sinhala TL;DR:** me zip eka thawath kaletama private GitHub repo ekakata push karanna.
Eeta passe Vercel eken import karanna, env variables 4ka dennama site eka wada.
Mokak hari prashnayak unoth VPS section eka balanna.

---

## What this build is

Next.js 16 (App Router) + TypeScript. **All data already lives in Supabase Postgres** —
the CMS tables, the whole LMS (`lms_*`), admin/portal sessions, and every uploaded
image (the `media_blobs` table, served through `/api/media/file`). The app writes
nothing to the local filesystem in production, which is exactly what a serverless
platform like Vercel needs. There is **no socket.io, no cron, no edge runtime** in
this app — a plain Node server deployment.

Pre-flight already done on this tree:

- `bun run typecheck` exits clean (`examples/`, `skills/`, `mini-services/` are
  sandbox-only and excluded from the TS project).
- All 65 tables verified present on the live Supabase database.
- `.env*` files are **not** in this zip (gitignored — secrets stay with you).

---

## Step 1 — Push the source to a PRIVATE GitHub repo

The public origin (`sasikadiv-cyber/School`) must not become the deploy source.
Create a **private** repo, e.g. `stc-matale-site`, then:

```bash
unzip stc-site-v2.8.64.1-vercel.zip -d stc-matale-site
cd stc-matale-site
git init -b main
git add -A
git commit -m "v2.8.64.1 — first production deployment"
git remote add origin git@github.com:<your-user>/stc-matale-site.git
git push -u origin main
```

> Never copy your local `.env` into this repo. Vercel env vars are set in the
> dashboard (Step 3).

## Step 2 — Import into Vercel

1. vercel.com → **Add New… → Project** → import `stc-matale-site`.
2. Framework preset: **Next.js** (auto-detected). Build command / output: defaults.
3. Vercel sees `bun.lock` and installs with Bun automatically. Node 22 default is fine.
4. **Before clicking Deploy**, add the environment variables below (Production
   + Preview).

## Step 3 — Environment variables (Vercel → Settings → Environment Variables)

| Variable | Value | Notes |
| --- | --- | --- |
| `SITE_DATABASE_URL` | The same value as your local `.env` `SITE_DATABASE_URL` line | **Required.** The Supabase connection string. The app reads `SITE_DATABASE_URL` FIRST — a plain `DATABASE_URL` is only the embedded-dev fallback and must NOT be set on Vercel. |
| `SUPABASE_URL` | Same as local `.env` | Required (Supabase OAuth sign-in). |
| `SUPABASE_ANON_KEY` | Same as local `.env` | Required (public-by-design key). |
| `PUBLIC_SITE_URL` | `https://<your-app>.vercel.app` | Required. Set it AFTER the first deploy creates the URL, then redeploy (it pins the OAuth redirect origin). Custom domain? Use `https://<domain>` with **no trailing slash**. |
| `MEDIA_STORAGE_DRIVER` | Leave unset for the first test; set to `r2` once Backblaze B2 is configured (see the B2 section below) | Unset = `database` — images stream from Supabase through the app (fine for a smoke test, NOT for real traffic: it burns Vercel bandwidth + Supabase egress). With `r2` + the B2 variables, `/api/media/file` 302s browsers straight to B2. |
| `BACKUP_GIT_URL`, `DIRECT_DATABASE_URL`, `NEXT_PUBLIC_*` | not needed | Sandbox/backup-script-only variables. |

## Step 4 — First deploy + smoke test

- `https://<app>.vercel.app/` renders the homepage with images (they come from
  `/api/media/file?key=…` — check one loads, it should return 200 bytes).
- `/login` renders; an admin or teacher portal sign-in works (sessions are DB
  rows — they survive cold starts).
- Admin Studio → a CMS edit (e.g. a news post) saves and survives a redeploy.

## Step 5 — Pin the URL and redeploy

Set `PUBLIC_SITE_URL` to the real origin (Step 3) and trigger **Redeploy** so
OAuth redirects point at the live domain. If you later add a custom domain,
update the value and also add the new origin in the Supabase dashboard
(Auth → URL Configuration → Redirect URLs).

---

## Function region

Vercel → Settings → Functions → Region: pick the region **closest to your
Supabase project** (Supabase dashboard → Settings → General → Region; for most
Sri Lanka / Asia setups that is Singapore `ap-southeast-1`). Every page hit does
DB work, so DB-side latency dominates.

## Database connections on serverless

Every serverless instance keeps a `pg` Pool (max 10). If Supabase ever reports
"too many connections", switch `SITE_DATABASE_URL` to the **Supavisor transaction
pooler** URL (port 6543, from Supabase → Connect) — the app already relaxes TLS
verification for `*.supabase.co` poolers.

## Serving images from Backblaze B2 (v2.8.65.0 — set up before real traffic)

Why: with the default `database` driver every image byte flows
Supabase → Vercel function → visitor, burning BOTH Supabase egress (5 GB/mo
free tier) and Vercel bandwidth (100 GB Hobby). Backblaze B2 gives ~free
egress (up to 3× your stored volume per month) and storage at ~$6/TB-month.

**Use a PRIVATE bucket — no credit card needed.** Backblaze only demands a
payment method to create PUBLIC buckets; a PRIVATE bucket is free to create
and works identically for this site (reads go through presigned URLs,
v2.8.66.0). Create:

1. **Private** bucket (e.g. `stc-matale-media`) — "Files in Bucket are:
   Private". Pick a region near your visitors (e.g. `us-west-004`).
2. App Keys → **Add New Application Key** (name `stc-site`, Read+Write on
   that bucket only). Copy the **keyID** and the **applicationKey**.
3. From the bucket details, note the **endpoint**
   (`https://s3.<region>.backblazeb2.com`) and the **region**.

**Vercel env additions:**

```
MEDIA_STORAGE_DRIVER=r2
R2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
R2_REGION=us-west-004
R2_BUCKET=stc-matale-media
R2_PRIVATE_BUCKET=1
R2_ACCESS_KEY_ID=<keyID>
R2_SECRET_ACCESS_KEY=<applicationKey>
```

(If you ever switch to a PUBLIC bucket, drop `R2_PRIVATE_BUCKET` — plain
bucket URLs are used then. `R2_PUBLIC_BASE_URL` from older docs is no longer
read: the database now stores stable app paths, never provider URLs.)

**One-time B2 CORS rule (v2.8.66.2 — REQUIRED for image uploads).** Admin
Studio uploads go browser → B2 directly with a presigned PUT, so the bucket
must tell browsers to allow it — otherwise the console shows
`blocked by CORS policy: No 'Access-Control-Allow-Origin'`. The scoped app
key cannot change bucket settings, so do it once in the web console:

1. Backblaze → **Buckets** → your bucket → **Bucket Settings** → **CORS Rules**.
2. Paste this JSON (one rule, Save):

```json
[
  {
    "corsRuleName": "stcSiteDirectUploads",
    "allowedOrigins": ["*"],
    "allowedHeaders": ["*"],
    "allowedOperations": ["s3_put", "s3_get", "s3_head", "s3_delete"],
    "exposeHeaders": ["etag", "x-amz-request-id", "x-amz-id-2"],
    "maxAgeSeconds": 3600
  }
]
```

`allowedOrigins: ["*"]` is safe here: the bucket is PRIVATE, so every GET
still needs a signed URL — the rule only lets browsers complete the signed
PUT/GET they were handed. It covers the Vercel domain, a future custom
domain and localhost dev, so new origins never need a re-edit.

**One-time backfill of the images already in the database** (run from the
project root on a machine that has the repo + `.env` — the sandbox works):

```bash
bun scripts/media-backfill-b2.mjs --dry-run   # preview what would upload
bun scripts/media-backfill-b2.mjs             # upload → verify → stamp
```

- Idempotent — safe to re-run; failed keys stay unstamped and retry next time.
- Database copies are KEPT as a free backup (nothing is deleted).
- PRIVATE files — `lms-work/` (submissions/materials/notices), `lms-people/`
  (profile photos), `lms-chat/` (Q&A/chat attachments) — are **skipped by
  design**: they stay in Supabase behind their authorization-checked routes
  so they can never become publicly guessable URLs.

**How serving works after the switch:** every page keeps using the stable
`/api/media/file?key=…` URLs; migrated objects answer a tiny 302 → B2. On a
private bucket the 302 target is a **presigned GET URL** (valid 6 days,
signed locally per redirect — no extra latency or cost), so image bytes flow
browser ← B2 directly while the DB copy remains the fallback during the
backfill. Nothing breaks mid-migration.

*Honest note:* pages rendered through next/image still deliver the
**optimized** output via Vercel (far smaller than the original — that is the
perf trade-off). The raw masters and every direct `<img>` load from B2. If
you later want literally zero Vercel image bytes, the media surfaces can be
flipped to `unoptimized` as a follow-up.

## Honest limits on Vercel

- Hobby plan: 100 GB bandwidth/mo, ~60 s function timeout, cold starts after
  inactivity. Fine for a test + a school's traffic; Pro removes the squeaks.
- `bun run backup` / `scripts/boot-heal.mjs` / `dev-watchdog` are sandbox
  operations tools — they are NOT part of the deployed app. For production
  backups use Supabase's built-in backups (paid tiers) or a scheduled
  `pg_dump` (VPS plan), plus the private `env-snapshot` repo you already have
  for secrets.

---

## Plan B — VPS (full control, no cold starts)

Works on any Ubuntu box (1 vCPU / 1 GB is enough to start):

```bash
# 1. Runtime
curl -fsSL https://bun.sh/install | bash        # Bun 1.x (installs Node-compatible toolchain)
sudo apt install -y caddy                        # reverse proxy + auto-HTTPS

# 2. Code + env
git clone git@github.com:<your-user>/stc-matale-site.git /opt/stc-site
cd /opt/stc-site
nano .env                                        # SAME variables as the Vercel table above,
                                                 # PUBLIC_SITE_URL=https://<domain>
bun install
bun run build

# 3. Run + auto-restart (systemd)
sudo tee /etc/systemd/system/stc-site.service >/dev/null <<'UNIT'
[Unit]
Description=STC Matale site (next start)
After=network-online.target

[Service]
WorkingDirectory=/opt/stc-site
ExecStart=/home/<you>/.bun/bin/bun run start -- -p 3000
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl enable --now stc-site

# 4. TLS reverse proxy (Caddyfile)
#    <domain> {
#        reverse_proxy 127.0.0.1:3000
#    }
sudo systemctl reload caddy
```

Notes for the VPS path:

- `bun run start` runs `next start` — the production server. Memory stays flat
  (the sandbox OOM story was a dev-mode/Turbopack artifact on a 4 GB cgroup).
- `docker-compose.media.yml` (MinIO) is NOT needed — media lives in Supabase.
- Point the school DNS A record at the VPS IP; Caddy issues the certificate.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Build fails on types | Should not happen (tsc clean on this tree) — run `bun run typecheck` locally and check the file named. |
| 500s on every page | `SITE_DATABASE_URL` missing/typo — check Vercel function logs. |
| Images 404 | Driver fell back to `local`? Ensure `MEDIA_STORAGE_DRIVER` is NOT set (or = `database`). |
| Google sign-in loops / redirect mismatch | `PUBLIC_SITE_URL` wrong (must match the browser origin exactly, https, no trailing slash) **and** the origin must exist in Supabase Auth → Redirect URLs. |
| "Too many connections" from Postgres | Use the Supavisor pooler URL (port 6543) for `SITE_DATABASE_URL`. |
