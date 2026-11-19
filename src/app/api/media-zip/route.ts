import { NextResponse } from "next/server";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ZipArchive } from "archiver";
import { APP_VERSION } from "@/lib/app-version";

/**
 * v2.8.87.1 — RELEASE ZIP FOR THE OWNER'S MANUAL VERCEL UPLOAD.
 *
 * The owner's alternate deploy path (DEPLOY-VERCEL.md "Deploy loop"): download
 * the release zip through the preview panel, upload its contents to the
 * GitHub repo Vercel builds from (NEVER .env), let Vercel auto-redeploy.
 * The route that served this in the 66.x era was lost in a sandbox rollback;
 * this rebuilt version generates the zip on demand instead of storing it.
 *
 * The archive is the RUNTIME-ONLY tree — the same file set the push-deploy
 * snapshot ships (src + public + drizzle + build configs):
 *   · src/ public/ drizzle/ walked recursively
 *   · a fixed list of root build configs
 *   · EXCLUDED: the 96 MB public/stc-backup-*.zip archive (a DB-era snapshot
 *     that would bloat every release zip ~30x), node_modules/.next/.git and
 *     anything outside the include list (scripts, docs, worklogs, .env …)
 * Built with archiver (pure JS) so it also works on Vercel serverless.
 * Cached in the OS temp dir keyed by APP_VERSION — one build per version
 * per process.
 */

const ROOT_FILES = [
  ".env.example",
  ".gitignore",
  "bun.lock",
  "drizzle.config.json",
  "eslint.config.mjs",
  "next-env.d.ts",
  "next.config.ts",
  "package.json",
  "postcss.config.mjs",
  "tsconfig.json",
  "vercel.json",
];

const ROOT_DIRS = ["src", "public", "drizzle"];

const SKIP_NAMES = new Set(["node_modules", ".next", ".git", ".data", ".turbo"]);
const SKIP_PUBLIC = /^stc-backup-\d+(\.\d+)*\.zip$/;

async function walk(
  dir: string,
  base: string,
  out: string[],
  publicBase: string | null,
): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_NAMES.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(abs, base, out, publicBase);
    } else if (entry.isFile()) {
      if (publicBase && SKIP_PUBLIC.test(entry.name)) continue;
      out.push(path.relative(base, abs));
    }
  }
}

async function buildZip(target: string, base: string): Promise<void> {
  const files: string[] = [];
  for (const dir of ROOT_DIRS) {
    await walk(
      path.join(base, dir),
      base,
      files,
      dir === "public" ? path.join(base, "public") : null,
    );
  }
  for (const file of ROOT_FILES) {
    try {
      const st = await fs.stat(path.join(base, file));
      if (st.isFile()) files.push(file);
    } catch {
      /* optional file absent — skip */
    }
  }

  const output = createWriteStream(target);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
  });
  archive.pipe(output);
  for (const rel of files.sort()) {
    archive.file(path.join(base, rel), { name: rel });
  }
  await archive.finalize();
  await done;
}

export async function GET() {
  const base = process.cwd();
  const target = path.join(os.tmpdir(), `stc-site-v${APP_VERSION}-vercel.zip`);

  try {
    const st = await fs.stat(target).catch(() => null);
    if (!st || st.size === 0) {
      await buildZip(target, base);
    }
    const fresh = await fs.stat(target);
    if (fresh.size === 0) throw new Error("empty archive");

    const fsSync = await import("node:fs");
    const stream = fsSync.createReadStream(target);
    return new NextResponse(stream as unknown as ReadableStream<Uint8Array>, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(fresh.size),
        "Content-Disposition": `attachment; filename="stc-site-v${APP_VERSION}-vercel.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Release zip could not be built on this host." },
      { status: 500 },
    );
  }
}
