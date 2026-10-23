# Deploying to Vercel — St. Thomas' College, Matale

> This guide was recreated on 2026-10-23 after a sandbox workspace rollback
> wiped the working tree (see worklog Task 12). The owner's deployed GitHub
> repo (imported from the v2.8.66.2 zip) already carries the original file;
> every instruction below still applies 1:1. The CORS section is the
> authoritative v2.8.66.4 version.

## What the production stack is

- **Next.js 16 (App Router) + Turbopack**, deployed on **Vercel**.
- **Database**: Supabase Postgres over the **transaction-mode pooler (port
  6543)** via drizzle-orm/node-postgres. 5432 (session pooler) exhausts
  connection slots under serverless concurrency — never point a Vercel
  deployment at it.
- **Media storage**: **Backblaze B2, PRIVATE bucket `stc-media`** (region
  `us-east-005`) through the app's S3-compatible `r2` driver. Uploads go
  browser → B2 directly with a presigned PUT; reads are 302-redirected to
  presigned signed URLs, so Vercel bandwidth stays ~zero and the bucket
  stays private (plain URLs 401).

## Environment variables (Vercel → Settings → Environment Variables)

| Key | Value | Notes |
| --- | --- | --- |
| `SITE_DATABASE_URL` | `postgresql://…@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres` | **Port 6543 only.** Copy-exact from the zip's `.env` (`%40` is part of the password). |
| `DATABASE_POOL_MAX` | `1` | Matches per-process pool default; long-lived servers may raise it, Vercel must not. |
| `SUPABASE_URL` | `https://gaiostdtlkdvyuikcjvf.supabase.co` | |
| `SUPABASE_ANON_KEY` | `eyJ…` | Public anon key (safe to expose). |
| `PUBLIC_SITE_URL` | `https://stc-site-eta.vercel.app` | Set AFTER first deploy, then **redeploy** — pins OAuth redirects + absolute URLs. |
| `MEDIA_STORAGE_DRIVER` | `r2` | Selects the S3-compatible driver. |
| `R2_ENDPOINT` | `https://s3.us-east-005.backblazeb2.com` | B2 S3 gateway. |
| `R2_REGION` | `us-east-005` | |
| `R2_BUCKET` | `stc-media` | |
| `R2_PRIVATE_BUCKET` | `1` | Every read becomes a signed URL. |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | scoped app key `stc-site` | Bucket-scoped (read/write/delete/list only) — NOT the account master key. |

All of these also ship inside each release zip's `.env` (owner imports them
into Vercel from there; never commit that file to GitHub).

## One-time B2 CORS rule (v2.8.66.4 steps — REQUIRED for image uploads)

Admin Studio uploads go browser → B2 directly with a presigned PUT, so the
bucket must tell browsers to allow it — otherwise the console shows
`blocked by CORS policy` / "The direct upload connection failed.". The scoped
app key cannot change bucket settings, so do it once in the web console
(the CORS dialog only offers radio presets — there is no JSON field there):

1. Backblaze → **Buckets** → your bucket → **Bucket Settings** → **CORS Rules**.
2. Select **"Share everything in this bucket with every origin"** (the second
   radio button).
3. Click **Update CORS Rules** — the header says changes take effect in about
   **1 minute**. Reload the site and upload again.

That preset is the console's own equivalent of the JSON rule at the bottom of
this section: every origin, all S3 operations (including the presigned PUT).
"Every origin" is safe here: the bucket is PRIVATE, so every GET still needs
a signed URL — the rule only lets browsers complete the signed PUT/GET they
were handed. It covers the Vercel domain, a future custom domain and
localhost dev, so new origins never need a re-edit.

If the upload STILL fails after the preset is saved (give it the minute), the
exact rule can be forced with the B2 CLI using the account **master** key
(the scoped app key cannot update buckets — by design):

```bash
b2 update-bucket stc-media --cors-rules '[
  {
    "corsRuleName": "stcSiteDirectUploads",
    "allowedOrigins": ["*"],
    "allowedHeaders": ["*"],
    "allowedOperations": ["s3_put", "s3_get", "s3_head", "s3_delete"],
    "exposeHeaders": ["etag", "x-amz-request-id", "x-amz-id-2"],
    "maxAgeSeconds": 3600
  }
]'
```

## Deploy loop (owner's standing flow)

1. Download the current release zip (`/api/media-zip?XTransformPort=3030`
   through the preview panel).
2. Upload the changed files to the private GitHub repo (**NEVER `.env`**).
3. Vercel auto-redeploys on push. Watch the build log; the type-check runs
   during build, so a red build usually means a bad env value or a typo.
4. After the first deploy set `PUBLIC_SITE_URL` and trigger a redeploy.

## Troubleshooting (the lessons learned the hard way)

| Symptom | Cause → fix |
| --- | --- |
| `/api/media/thumb` 500s on Vercel | sharp bundled by Turbopack → fixed in v2.8.66.2 (`serverExternalPackages` + lazy loader + tmpdir cache + 302 degrade). |
| `ERR_DLOPEN_FAILED: libvips-cpp.so…` in Vercel logs | File tracer dropped the libvips sibling → fixed in v2.8.66.3 (`outputFileTracingIncludes` + externals + trace-hint imports). |
| "The direct upload connection failed." | The browser's presigned PUT is blocked → the one-time B2 CORS rule above is missing (or just saved — wait the minute). |
| Upload fails with "Image processing is unavailable…" | Native pipeline broken on the host → v2.8.66.4 now degrades instead: the original file is stored unprocessed. A redeploy restores full processing. |
| Build fails on DB errors | Bad `SITE_DATABASE_URL` (wrong port / mangled value) — copy-exact from the zip `.env`. |

## Noted for later

- The one-time B2 backfill of pre-existing media (8/8 public objects) was
  already executed live in the v2.8.66.0 session and stamped in the database.
- Media stored through the v2.8.66.4 degrade path (no-sharp emergency) keeps
  EXIF — re-run processing after the native pipeline is restored to produce
  variants/blur for those assets.
