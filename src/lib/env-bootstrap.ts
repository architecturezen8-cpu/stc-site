import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Environment self-healing (added after the 2026-10-17 workspace rollback).
 *
 * The sandbox init script rewrites `.env` on container restarts and drops the
 * Supabase block. Recovery files (.env.supabase-backup / legacy
 * .env.supabase-auth) carry the full block — this boot helper merges any
 * missing keys back into process.env so the site survives restarts even
 * before a human restores the file.
 *
 * Runs once per process, purely additive (never overrides existing values).
 */
const REQUIRED_KEYS = [
  "SITE_DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

let done = false;

export function ensureSiteEnv(): void {
  if (done) return;
  done = true;

  const missing = REQUIRED_KEYS.filter(
    (key) => !(process.env[key] || "").trim(),
  );
  if (missing.length === 0) return;

  const candidates = [
    path.join(process.cwd(), ".env.supabase-backup"),
    path.join(process.cwd(), ".env.supabase-auth"),
    path.join(process.cwd(), "backups", "env.backup-2026-10-17"),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (!match) continue;
      const [, key, raw] = match;
      const value = raw.trim().replace(/^["']|["']$/g, "");
      if (!value) continue;
      if (!(process.env[key] || "").trim()) {
        process.env[key] = value;
      }
    }
    const stillMissing = REQUIRED_KEYS.filter(
      (key) => !(process.env[key] || "").trim(),
    );
    if (stillMissing.length === 0) break;
  }
}
