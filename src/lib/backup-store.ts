import "server-only";

/**
 * v2.8.74.0 — the GitHub side of the DAILY DATABASE BACKUPS, controlled from
 * the Admin Studio → Backup section (/admin/backup). The owner's ask:
 * "backup setting okkoma admin studio eke backup section eken controll
 * karanna puluwan wenna ona" — so every knob lives in the dedicated private
 * store repo (novaartstorelk-alt/school-site-db-backups) as repo VARIABLES,
 * written here through the API with the token kept server-side in .env
 * (DB_BACKUP_GH_TOKEN). Nothing but this module ever touches that token.
 *
 * v2.8.74.0 adds:
 *   - FREQUENCY (daily / weekly / monthly / quarterly / yearly): the studio
 *     rewrites the workflow's cron day-part together with the hour, so the
 *     schedule in the GitHub UI always tells the truth.
 *   - the GOOGLE DRIVE mirror: folder variable + per-run step results
 *     (GH push / Drive upload) pulled from the Actions Jobs API.
 *
 * Store repo layout:  dumps/stc-db-YYYY-MM-DD.dump (+ its own workflow + scripts).
 */

const API = "https://api.github.com";

export const BACKUP_FREQUENCIES = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];

function isFrequency(v: string): v is BackupFrequency {
  return (BACKUP_FREQUENCIES as readonly string[]).includes(v);
}

/** v2.8.75.0 — WHERE the backup lands (owner: "dekatama backup eka run
 * wenna onada kiyala choose karanna option ekak"). Repo variable
 * DB_BACKUP_DESTINATION gates the workflow's two destination steps. */
export const BACKUP_DESTINATIONS = ["github", "drive", "both"] as const;
export type BackupDestination = (typeof BACKUP_DESTINATIONS)[number];

export function isDestination(v: string): v is BackupDestination {
  return (BACKUP_DESTINATIONS as readonly string[]).includes(v);
}

export type BackupSettings = {
  enabled: boolean;
  frequency: BackupFrequency;
  destination: BackupDestination;
  keepDaily: number;
  keepMonthly: number;
  scheduleHour: number | null; // Asia/Colombo hour (0–23); null = unreadable
  scheduleMinute: number;
};

export type BackupDump = { name: string; size: number; date: string };

export type BackupRun = {
  id: number;
  runNumber: number;
  status: string;
  conclusion: string | null;
  createdAt: string;
  /** step conclusions for the two destinations ("success"/"failure"/"skipped") */
  steps: { github: string | null; drive: string | null };
};
// v2.8.75.0 — the run's html_url is NO LONGER part of this type: the studio
// must never hand the store repo's address to the browser (owner ask).

export type BackupStatus = {
  configured: boolean;
  branch: string;
  /** Drive mirror target when GOOGLE_DRIVE_FOLDER_ID is set on the store */
  drive: { folderId: string; url: string } | null;
  // v2.8.75.0 — `repo` was REMOVED from the client-facing status: the store
  // card now shows just "GitHub" (owner: "repo name eka danna epa").
  settings: BackupSettings;
  dumps: BackupDump[];
  runs: BackupRun[];
  lastSuccessAt: string | null;
  error: string | null;
};

const WORKFLOW_PATH = ".github/workflows/db-backup.yml";
const DUMP_NAME = /^stc-db-\d{4}-\d{2}-\d{2}\.dump$/;
const CRON_RE = /cron:\s*"(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)"/;

/* ── frequency ↔ cron day-part ─────────────────────────────────────── */
/* cron: "minute hour dom month dow" — hour/minute come from the hour  */
/* control; the day-part is what the frequency changes.                */

function dayPartFor(f: BackupFrequency): string {
  switch (f) {
    case "weekly":
      return "* * 0"; // Sundays
    case "monthly":
      return "1 * *"; // 1st of the month
    case "quarterly":
      return "1 1,4,7,10 *"; // Jan / Apr / Jul / Oct 1st
    case "yearly":
      return "1 1 *"; // Jan 1st
    default:
      return "* * *"; // every day
  }
}

function frequencyFromCron(dom: string, mon: string, dow: string): BackupFrequency {
  if (dom === "1" && mon === "1" && dow === "*") return "yearly";
  if (dom === "1" && mon === "1,4,7,10" && dow === "*") return "quarterly";
  if (dom === "1" && mon === "*" && dow === "*") return "monthly";
  if (dom === "*" && mon === "*" && dow === "0") return "weekly";
  return "daily";
}

function envs() {
  const repo = (process.env.DB_BACKUP_REPO || "").trim() || null;
  const token = (process.env.DB_BACKUP_GH_TOKEN || "").trim() || null;
  const branch = (process.env.DB_BACKUP_BRANCH || "main").trim() || "main";
  return { repo, token, branch };
}

export function backupConfigured() {
  const { repo, token } = envs();
  return Boolean(repo && token);
}

async function gh<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; accept?: string } = {},
): Promise<{ status: number; json: T; headers: Headers }> {
  const { token } = envs();
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: init.accept ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json = {} as T;
  try {
    json = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    json = {} as T;
  }
  return { status: res.status, json, headers: res.headers };
}

/* ── settings ↔ repo variables ─────────────────────────────────────── */

async function readVariables(): Promise<Record<string, string>> {
  const { repo } = envs();
  try {
    const { status, json } = await gh<{ variables?: { name: string; value: string }[] }>(
      `/repos/${repo}/actions/variables`,
    );
    if (status !== 200) return {};
    return Object.fromEntries((json.variables ?? []).map((v) => [v.name, v.value]));
  } catch {
    return {};
  }
}

export async function setVariable(name: string, value: string): Promise<boolean> {
  const { repo } = envs();
  const patch = await gh(`/repos/${repo}/actions/variables/${name}`, {
    method: "PATCH",
    body: { value },
  });
  if (patch.status === 204) return true;
  const create = await gh(`/repos/${repo}/actions/variables`, {
    method: "POST",
    body: { name, value },
  });
  return create.status === 201 || create.status === 204;
}

/* ── schedule ↔ the workflow's cron line ───────────────────────────── */

type CronInfo = { utcHour: number; utcMinute: number; frequency: BackupFrequency };

function cronInfoFromText(text: string): CronInfo | null {
  const m = text.match(CRON_RE);
  if (!m) return null;
  return {
    utcMinute: Number(m[1]),
    utcHour: Number(m[2]),
    frequency: frequencyFromCron(m[3], m[4], m[5]),
  };
}

async function readWorkflowCron(): Promise<CronInfo | null> {
  const { repo, branch } = envs();
  try {
    const { status, json } = await gh<{ content?: string }>(
      `/repos/${repo}/contents/${WORKFLOW_PATH}?ref=${branch}`,
    );
    if (status !== 200 || !json.content) return null;
    return cronInfoFromText(Buffer.from(json.content, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/** UTC (h, m) → Asia/Colombo (UTC+5:30) hour/minute. */
function utcToColombo(utcHour: number, utcMinute: number) {
  const total = (((utcHour * 60 + utcMinute + 330) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

/** Colombo hour → cron minute/hour (whole hours land on :30 UTC). */
function colomboHourToCron(hour: number) {
  const utcHour = (((hour + 18) % 24) + 24) % 24; // hour - 5.5 → (hour - 6 + 24) % 24, minute 30
  return { utcHour, utcMinute: 30 };
}

/**
 * Rewrite the workflow's cron line. Whatever is omitted keeps its current
 * value — frequency changes the day-part, hour changes the time of day.
 */
export async function patchSchedule(
  opts: { hour?: number; frequency?: BackupFrequency } = {},
): Promise<boolean> {
  const { repo, branch } = envs();
  const { status, json } = await gh<{ content?: string; sha?: string }>(
    `/repos/${repo}/contents/${WORKFLOW_PATH}?ref=${branch}`,
  );
  if (status !== 200 || !json.content || !json.sha) return false;
  const text = Buffer.from(json.content, "base64").toString("utf8");
  const cur = cronInfoFromText(text);
  const colomboHour =
    opts.hour ?? (cur ? utcToColombo(cur.utcHour, cur.utcMinute).hour : 1);
  const frequency = opts.frequency ?? cur?.frequency ?? "daily";
  const { utcHour, utcMinute } = colomboHourToCron(colomboHour);
  const next = text.replace(
    CRON_RE,
    `cron: "${utcMinute} ${utcHour} ${dayPartFor(frequency)}"`,
  );
  if (next === text) return true; // nothing to change
  const put = await gh(`/repos/${repo}/contents/${WORKFLOW_PATH}`, {
    method: "PUT",
    body: {
      message: `schedule: ${frequency} at ${String(colomboHour).padStart(2, "0")}:00 Asia/Colombo (studio)`,
      content: Buffer.from(next, "utf8").toString("base64"),
      sha: json.sha,
      branch,
    },
  });
  return put.status === 200 || put.status === 201;
}

/* ── dumps + runs ──────────────────────────────────────────────────── */

async function listDumps(): Promise<BackupDump[]> {
  const { repo, branch } = envs();
  try {
    const { status, json } = await gh<{ name: string; size: number }[]>(
      `/repos/${repo}/contents/dumps?ref=${branch}`,
    );
    if (status !== 200 || !Array.isArray(json)) return [];
    return json
      .filter((f) => DUMP_NAME.test(f.name))
      .map((f) => ({
        name: f.name,
        size: f.size,
        date: (f.name.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? ""),
      }))
      .sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return [];
  }
}

/** Pull the two destination steps out of the run's job ("Commit + push" /
 *  "Upload to Google Drive") so the studio can show GH / Drive chips. */
async function runSteps(runId: number): Promise<BackupRun["steps"]> {
  const { repo } = envs();
  try {
    const { status, json } = await gh<{
      jobs?: { steps?: { name: string; conclusion: string | null }[] }[];
    }>(`/repos/${repo}/actions/runs/${runId}/jobs?per_page=1`);
    if (status !== 200) return { github: null, drive: null };
    const steps = json.jobs?.[0]?.steps ?? [];
    const find = (needle: string) =>
      steps.find((s) => s.name.toLowerCase().includes(needle))?.conclusion ?? null;
    return { github: find("commit + push"), drive: find("upload to google drive") };
  } catch {
    return { github: null, drive: null };
  }
}

async function listRuns(): Promise<BackupRun[]> {
  const { repo } = envs();
  try {
    const { status, json } = await gh<{
      workflow_runs?: {
        id: number;
        run_number: number;
        status: string;
        conclusion: string | null;
        created_at: string;
      }[];
    }>(`/repos/${repo}/actions/runs?per_page=10`);
    if (status !== 200) return [];
    // html_url is deliberately NOT taken across — it points at the store repo.
    const runs = (json.workflow_runs ?? []).map((r) => ({
      id: r.id,
      runNumber: r.run_number,
      status: r.status,
      conclusion: r.conclusion,
      createdAt: r.created_at,
    }));
    return await Promise.all(runs.map(async (r) => ({ ...r, steps: await runSteps(r.id) })));
  } catch {
    return [];
  }
}

/** Fetch one dump's raw bytes (owner-only download route). */
export async function getDumpBytes(name: string): Promise<Uint8Array | null> {
  if (!DUMP_NAME.test(name)) return null;
  const { repo, branch, token } = envs();
  if (!token || !repo) return null;
  try {
    const res = await fetch(
      `${API}/repos/${repo}/contents/dumps/${encodeURIComponent(name)}?ref=${branch}`,
      {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.raw",
        },
      },
    );
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function dispatchBackup(): Promise<boolean> {
  const { repo, branch } = envs();
  const { status } = await gh(`/repos/${repo}/actions/workflows/db-backup.yml/dispatches`, {
    method: "POST",
    body: { ref: branch },
  });
  return status === 204;
}

/* ── the combined status the studio renders ────────────────────────── */

export async function backupStatus(): Promise<BackupStatus> {
  const { branch } = envs();
  if (!backupConfigured()) {
    return {
      configured: false,
      branch,
      drive: null,
      settings: {
        enabled: false,
        frequency: "daily",
        destination: "both",
        keepDaily: 35,
        keepMonthly: 366,
        scheduleHour: null,
        scheduleMinute: 0,
      },
      dumps: [],
      runs: [],
      lastSuccessAt: null,
      error: null,
    };
  }

  const [vars, dumps, runs, cron] = await Promise.all([
    readVariables(),
    listDumps(),
    listRuns(),
    readWorkflowCron(),
  ]);

  const colombo = cron ? utcToColombo(cron.utcHour, cron.utcMinute) : null;
  const varFrequency = vars.DB_BACKUP_FREQUENCY ?? "";
  const frequency = cron
    ? cron.frequency
    : isFrequency(varFrequency)
      ? varFrequency
      : "daily";
  const driveFolder = (vars.GOOGLE_DRIVE_FOLDER_ID ?? "").trim();
  const varDestination = vars.DB_BACKUP_DESTINATION ?? "both";
  const lastSuccessAt =
    runs.find((r) => r.status === "completed" && r.conclusion === "success")?.createdAt ?? null;

  return {
    configured: true,
    branch,
    drive: driveFolder
      ? {
          folderId: driveFolder,
          url: `https://drive.google.com/drive/folders/${driveFolder}`,
        }
      : null,
    settings: {
      enabled: (vars.DB_BACKUP_ENABLED ?? "true") !== "false",
      frequency,
      destination: isDestination(varDestination) ? varDestination : "both",
      keepDaily: Number.parseInt(vars.DB_BACKUP_KEEP_DAILY ?? "", 10) || 35,
      keepMonthly: Number.parseInt(vars.DB_BACKUP_KEEP_MONTHLY ?? "", 10) || 366,
      scheduleHour: colombo ? colombo.hour : null,
      scheduleMinute: colombo ? colombo.minute : 0,
    },
    dumps,
    runs,
    lastSuccessAt,
    error: null,
  };
}
