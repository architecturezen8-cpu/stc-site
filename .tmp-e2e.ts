import { db } from "./src/db";
import { sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

// find an active lms_admin account
const admins = await db.execute(sql`
  select id, email, full_name from lms_portal_accounts
  where role = 'lms_admin' and active = true limit 1
`);
const rows = (admins.rows ?? admins) as Array<{ id: number; email: string; full_name: string }>;
if (rows.length === 0) { console.log("NO_ADMIN_ACCOUNT"); process.exit(0); }
const admin = rows[0];
const token = randomBytes(32).toString("hex");
const tokenHash = createHash("sha256").update(token).digest("hex");
await db.execute(sql`
  insert into lms_portal_sessions (account_id, token_hash, expires_at, user_agent)
  values (${admin.id}, ${tokenHash}, now() + interval '1 hour', 'agent-e2e-test')
`);
console.log(JSON.stringify({ adminId: admin.id, email: admin.email, token }));
process.exit(0);
