import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
const m = readFileSync(".env","utf8").match(/^SITE_DATABASE_URL=["']?([^"'\n]+)["']?/m);
const pool = new Pool({ connectionString: m[1], ssl: { rejectUnauthorized: false }, max: 1 });
await pool.query("DELETE FROM lms_portal_sessions WHERE user_agent='agent-browser-qa'");
const token = randomBytes(32).toString("hex");
const hash = createHash("sha256").update(token).digest("hex");
const exp = new Date(Date.now() + 2*3600*1000);
await pool.query(
  "INSERT INTO lms_portal_sessions (account_id, token_hash, expires_at, user_agent) VALUES ($1,$2,$3,$4)",
  [35, hash, exp, "agent-browser-qa"]
);
console.log("QA_TOKEN=" + token);
await pool.end();
