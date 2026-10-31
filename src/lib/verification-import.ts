/* ────────────────────────────────────────────────────────────────────────
   Verification-Records EXCEL IMPORT — pure parsing helpers (Task 25-c).

   The owner: "excel sheet import option ekak danna... headers scan karala
   auto headers genarate wela sampurna full verification record eka auto
   hadenna hadanna puluwan ne" — so the office can drop ANY reasonably
   shaped register sheet and the importer finds the header row by itself,
   maps every recognised column automatically, and reports what it did.

   v2.8.70.4 — FIELD MAPPING (the owner: "sheet eke thiyana fields anuwa
   ape record eka edit karanna"; records can carry MORE columns than our
   fields): the preview now returns every sheet header + a suggested
   mapping, and the office can RE-MAP any column (or skip it) before the
   commit. Columns mapped to no field are not thrown away — they ride
   along per row as `extra` details and land in the record's extra_data
   JSON so the register keeps the school's full detail.

   PURE TypeScript, no server-only imports: the API route imports this and
   one-off parser sanity tests can too. The route stays the only place
   that touches the database.
   ──────────────────────────────────────────────────────────────────── */

export type ImportType = "student" | "teacher";

/** field → the sheet column index it reads (-1 = not imported). */
export type ImportMapping = Record<string, number>;

/** One parsed data row for the preview table (rowNumber = 1-based EXCEL row,
 *  so title rows above the header are still counted and the office can find
 *  the exact line in their file). `extra` holds the columns mapped to no
 *  field (header → value) — saved on the record as extra_data. */
export type ImportPreviewRow = {
  rowNumber: number;
  values: Record<string, string>;
  extra: Record<string, string>;
  status: "valid" | "invalid";
  error?: string;
};

export type ImportParseResult =
  | { ok: false; error: string }
  | {
      ok: true;
      /** field → the ORIGINAL header text it was mapped from */
      mapped: Record<string, string>;
      /** field → column index (the mapping the UI editor edits) */
      mapping: ImportMapping;
      /** the sheet's header row texts, in order */
      headers: string[];
      /** original header texts that matched no field (kept as extra details) */
      unmapped: string[];
      rows: ImportPreviewRow[];
      validCount: number;
      invalidCount: number;
    };

/** Runaway-workbook guard — the import stops at 2000 data rows. */
export const IMPORT_MAX_ROWS = 2000;

const STUDENT_FIELDS = [
  "admissionNo",
  "fullName",
  "className",
  "registerNo",
  "fatherName",
  "motherName",
  "phone",
  "email",
] as const;
const TEACHER_FIELDS = ["teacherId", "fullName", "email", "phone", "designation"] as const;

/** The fields the mapping editor offers, in order. */
export const IMPORT_FIELDS: Record<ImportType, readonly string[]> = {
  student: STUDENT_FIELDS,
  teacher: TEACHER_FIELDS,
};

export type StudentImportField = (typeof STUDENT_FIELDS)[number];
export type TeacherImportField = (typeof TEACHER_FIELDS)[number];

/** Field order IS match priority: the first field whose synonym list claims
 *  a header wins, and one header can never map to two fields. */
const STUDENT_SYNONYMS: Record<StudentImportField, string[]> = {
  admissionNo: ["admissionno", "admission", "admno", "admissionnumber", "adm", "admnumber", "no", "number"],
  fullName: ["fullname", "name", "studentname", "studentsname", "student"],
  className: ["class", "classname", "grade", "classsection", "section", "gradeclass"],
  registerNo: ["registerno", "register", "regno", "reg", "registernumber"],
  fatherName: ["fathername", "father", "fathersname"],
  motherName: ["mothername", "mother", "mothersname", "mothers"],
  phone: ["phone", "mobile", "phonenumber", "tel", "telephone", "contact", "contactno"],
  email: ["email", "emailaddress", "mail"],
};

const TEACHER_SYNONYMS: Record<TeacherImportField, string[]> = {
  teacherId: ["teacherid", "tid", "staffid", "staffno", "employeeno", "empno", "id", "staff"],
  fullName: ["fullname", "name", "teachername", "staffname"],
  email: ["email", "emailaddress", "mail"],
  phone: ["phone", "mobile", "phonenumber", "tel", "telephone", "contact", "contactno"],
  designation: ["designation", "post", "position", "role", "title", "subject"],
};

/** Value caps — mirror the route's own clean() limits exactly. */
export const IMPORT_FIELD_MAX: Record<StudentImportField | TeacherImportField, number> = {
  admissionNo: 40,
  fullName: 120,
  className: 40,
  registerNo: 40,
  fatherName: 120,
  motherName: 120,
  phone: 30,
  email: 180,
  teacherId: 40,
  designation: 120,
};

const FRIENDLY_FIELD: Record<string, string> = {
  admissionNo: "admission number",
  fullName: "full name",
  className: "class",
  registerNo: "register number",
  fatherName: "father's name",
  motherName: "mother's name",
  phone: "phone",
  email: "email",
  teacherId: "teacher ID",
  designation: "designation",
};

const REQUIRED: Record<ImportType, string[]> = {
  student: ["admissionNo", "fullName", "className"],
  teacher: ["teacherId", "fullName"],
};

/** Extra-detail caps: 30 columns × 200 chars each, so a wild sheet can't
 *  balloon a record row. */
const EXTRA_MAX_COLUMNS = 30;
const EXTRA_VALUE_MAX = 200;

/** Header-text normaliser: lowercase, strip every non-alphanumeric —
 *  "Admission No.", "admission_no" and "ADMISSION-NO " all collide. */
export const normalizeHeaderKey = (raw: unknown): string =>
  String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Every imported value goes through the same funnel as a hand-typed one. */
export const normalizeImportValue = (raw: unknown, field: string): string =>
  String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, IMPORT_FIELD_MAX[field as StudentImportField | TeacherImportField] ?? 120);

const cellText = (cell: unknown): string => String(cell ?? "").trim();
const rowHasData = (row: unknown[]): boolean => row.some((cell) => cellText(cell).length > 0);

/** The header row = the FIRST of the first 10 rows holding ≥ 2 non-empty
 *  string cells. Rows above it are titles/garbage and are skipped. */
export function detectHeaderRowIndex(matrix: unknown[][]): number {
  const limit = Math.min(matrix.length, 10);
  for (let i = 0; i < limit; i++) {
    if ((matrix[i] ?? []).filter((c) => cellText(c).length > 0).length >= 2) return i;
  }
  return -1;
}

/** Auto-map one header row. First matching header wins per field; a header
 *  already claimed (or matching nothing) lands in `unmapped`. */
export function mapHeaderRow(
  headerRow: unknown[],
  type: ImportType,
): {
  mapped: Record<string, string>;
  fieldByColumn: Map<number, StudentImportField | TeacherImportField>;
  unmapped: string[];
} {
  const synonyms: Record<string, string[]> =
    type === "student" ? STUDENT_SYNONYMS : TEACHER_SYNONYMS;
  const mapped: Record<string, string> = {};
  const fieldByColumn = new Map<number, StudentImportField | TeacherImportField>();
  const unmapped: string[] = [];

  headerRow.forEach((cell, colIndex) => {
    const header = cellText(cell);
    if (!header) return;
    const key = normalizeHeaderKey(header);
    const field = Object.keys(synonyms).find(
      (f) => !(f in mapped) && synonyms[f].includes(key),
    );
    if (field) {
      mapped[field] = header;
      fieldByColumn.set(colIndex, field as StudentImportField | TeacherImportField);
    } else {
      unmapped.push(header);
    }
  });

  return { mapped, fieldByColumn, unmapped };
}

/** Validate an office-supplied mapping (field → column index). Unknown
 *  fields, non-numbers and out-of-range columns are dropped; a column
 *  claimed twice keeps the FIRST field. */
export function sanitizeMapping(
  raw: unknown,
  type: ImportType,
  headerCount: number,
): ImportMapping {
  const allowed = IMPORT_FIELDS[type];
  const mapping: ImportMapping = {};
  const used = new Set<number>();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [field, col] of Object.entries(raw as Record<string, unknown>)) {
      if (!allowed.includes(field)) continue;
      const idx = Number(col);
      if (!Number.isInteger(idx) || idx < 0 || idx >= headerCount) continue;
      if (used.has(idx)) continue;
      used.add(idx);
      mapping[field] = idx;
    }
  }
  for (const field of allowed) {
    if (!(field in mapping)) mapping[field] = -1;
  }
  return mapping;
}

/** Full sheet → mapped/unmapped headers + validated preview rows.
 *  `override` (field → column index) re-maps the columns the office chose
 *  in the editor; without it the synonym auto-map runs as always. */
export function parseImportSheet(
  matrix: unknown[][],
  type: ImportType,
  override?: ImportMapping,
): ImportParseResult {
  if (matrix.length === 0) {
    return { ok: false, error: "The first sheet is empty — nothing to import." };
  }

  const headerRowIndex = detectHeaderRowIndex(matrix);
  if (headerRowIndex === -1) {
    return {
      ok: false,
      error: "No header row was found in the first 10 rows — the sheet looks empty.",
    };
  }

  /* Reject oversized files BEFORE doing any row work. */
  let dataRowCount = 0;
  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    if (rowHasData(matrix[i] ?? [])) dataRowCount++;
  }
  if (dataRowCount > IMPORT_MAX_ROWS) {
    return {
      ok: false,
      error: `The sheet holds ${dataRowCount} data rows — the import cap is ${IMPORT_MAX_ROWS}. Split the file and import in parts.`,
    };
  }

  const headerRow = matrix[headerRowIndex] ?? [];
  const headers = headerRow.map((c) => cellText(c));

  let mapped: Record<string, string>;
  let fieldByColumn: Map<number, StudentImportField | TeacherImportField>;
  let mapping: ImportMapping;
  if (override) {
    mapping = sanitizeMapping(override, type, headerRow.length);
    mapped = {};
    fieldByColumn = new Map();
    for (const [field, idx] of Object.entries(mapping)) {
      if (idx >= 0) {
        mapped[field] = headers[idx] || `column ${idx + 1}`;
        fieldByColumn.set(idx, field as StudentImportField | TeacherImportField);
      }
    }
  } else {
    const auto = mapHeaderRow(headerRow, type);
    mapped = auto.mapped;
    fieldByColumn = auto.fieldByColumn;
    mapping = sanitizeMapping(
      Object.fromEntries([...fieldByColumn.entries()].map(([col, field]) => [field, col])),
      type,
      headerRow.length,
    );
  }

  /* The columns NO field claimed keep their values as per-row extras. */
  const claimed = new Set<number>();
  fieldByColumn.forEach((_f, col) => claimed.add(col));
  const extraColumns: { index: number; header: string }[] = [];
  headers.forEach((header, idx) => {
    if (header && !claimed.has(idx) && extraColumns.length < EXTRA_MAX_COLUMNS) {
      extraColumns.push({ index: idx, header });
    }
  });
  const unmapped = extraColumns.map((c) => c.header);

  const rows: ImportPreviewRow[] = [];
  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const rawRow = matrix[i] ?? [];
    if (!rowHasData(rawRow)) continue; /* fully-empty row — skipped silently */

    const values: Record<string, string> = {};
    fieldByColumn.forEach((field, colIndex) => {
      const v = normalizeImportValue(rawRow[colIndex], field);
      if (v) values[field] = v;
    });

    const extra: Record<string, string> = {};
    for (const col of extraColumns) {
      const v = cellText(rawRow[col.index]).slice(0, EXTRA_VALUE_MAX);
      if (v) extra[col.header] = v;
    }

    const missing = REQUIRED[type].filter((f) => !values[f]);
    const rowNumber = i + 1; /* 1-based Excel row (title rows included) */
    rows.push(
      missing.length > 0
        ? {
            rowNumber,
            values,
            extra,
            status: "invalid",
            error: `Missing ${missing.map((f) => FRIENDLY_FIELD[f] ?? f).join(", ")}.`,
          }
        : { rowNumber, values, extra, status: "valid" },
    );
  }

  return {
    ok: true,
    mapped,
    mapping,
    headers,
    unmapped,
    rows,
    validCount: rows.filter((r) => r.status === "valid").length,
    invalidCount: rows.filter((r) => r.status === "invalid").length,
  };
}
