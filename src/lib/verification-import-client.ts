/* ────────────────────────────────────────────────────────────────────────
   Verification-records — EDIT-MODE EXCEL AUTO-FILL matcher (task 3-b).

   The bulk importer (parseImportSheet) processes WHOLE sheets; the Edit
   dialog needs something narrower: read one sheet, auto-map the columns
   with the SAME synonym lists the bulk import uses, and pick THE row that
   belongs to the record being edited (by admission no / teacher ID, or
   the first non-empty data row when the record has no usable ID).

   v2.9.15.10 HARDENING (owner: "ekedi eka hariyata work wenne na"):
   the first cut hard-failed with "No row with that admission number was
   found on the sheet" for sheets the bulk import accepts happily. Four
   matched-failure shapes, all fixed here:
     1. the sheet's ID column header is NOT in the synonym list (Index No,
        Student ID, a typo…) → the mapped-column loop never ran; now every
        column is scanned for the exact ID instead of giving up;
     2. formatting divergence (ADM/19/23 vs 19/23, leading zeros lost by
        Excel numeric cells, trailing .0) → a digits-only + numeric-equal
        fallback runs, but ONLY when exactly one row matches (ambiguous
        sheets still refuse loudly — never fill the form from a stranger);
     3. the old error blamed the admission number even when no ID column
        could be mapped at all → the message now says what was actually
        tried (mapped column, every column, digits-only);
     4. matchedBy labels stay honest so the dialog's preview line shows
        HOW the row was picked.

   PURE TypeScript, client-safe: it imports only the pure helpers from
   src/lib/verification-import.ts (mapHeaderRow / detectHeaderRowIndex /
   normalizeImportValue) — no server-only modules, no database. The Edit
   dialog runs this in the browser after parsing the workbook with
   SheetJS (xlsx), so no file ever leaves the machine for a preview.
   ──────────────────────────────────────────────────────────────────── */

import {
  detectHeaderRowIndex,
  mapHeaderRow,
  normalizeImportValue,
  type ImportType,
} from "@/lib/verification-import";

/** Extra-detail caps — mirror the bulk importer's own limits exactly. */
const EXTRA_MAX_COLUMNS = 30;
const EXTRA_VALUE_MAX = 200;

const cellText = (cell: unknown): string => String(cell ?? "").trim();

/** IDs compare loosely: lowercase, strip every non-alphanumeric —
 *  "ADM/19/23" on the register == "adm1923" on the sheet. */
const normId = (raw: unknown): string =>
  String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Digits-only form — survives "ADM/19/23" → "1923". */
const digitsOf = (raw: unknown): string =>
  String(raw ?? "").replace(/[^0-9]/g, "");

/** Loose numeric equality so Excel's lost leading zeros ("0042" → 42) and
 *  trailing ".0" cells still match their register twin. */
const digitsMatch = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na > 0 && nb > 0 && na === nb;
};

type MatchedBy =
  | "admission number"
  | "teacher ID"
  | "first data row"
  | "admission number (digits)"
  | "teacher ID (digits)"
  | "ID found on an unmapped column";

export type EditRowMatch =
  | { ok: false; error: string }
  | {
      ok: true;
      /** 1-based Excel row number (title rows above the header counted). */
      rowNumber: number;
      /** how the row was picked — shown in the dialog's preview line */
      matchedBy: MatchedBy;
      /** the record's known fields, normalised like the bulk import */
      values: Record<string, string>;
      /** the columns no field claimed (header → value) */
      extra: Record<string, string>;
    };

/**
 * Read one workbook matrix and return the row that belongs to the record
 * being edited. Columns are auto-mapped with the same synonym lists the
 * bulk importer uses; unmapped columns ride along as `extra` details.
 */
export function matchImportRowForEdit(
  matrix: unknown[][],
  type: ImportType,
  identity: { admissionNo?: string; teacherId?: string },
): EditRowMatch {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return { ok: false, error: "The first sheet is empty — nothing to match." };
  }

  const headerRowIndex = detectHeaderRowIndex(matrix);
  if (headerRowIndex === -1) {
    return {
      ok: false,
      error:
        "No header row was found in the first 10 rows — the sheet looks empty.",
    };
  }

  const headerRow = matrix[headerRowIndex] ?? [];
  const auto = mapHeaderRow(headerRow, type);

  /* field → column index (mapHeaderRow gives column → field). */
  const colByField = new Map<string, number>();
  auto.fieldByColumn.forEach((field, col) => colByField.set(field, col));

  /* The columns NO field claimed stay extras — same rule as the bulk
     import, capped so a wild sheet cannot balloon a record. */
  const claimed = new Set<number>();
  auto.fieldByColumn.forEach((_f, col) => claimed.add(col));
  const extraColumns: { index: number; header: string }[] = [];
  headerRow.forEach((cell, idx) => {
    const header = cellText(cell);
    if (header && !claimed.has(idx) && extraColumns.length < EXTRA_MAX_COLUMNS) {
      extraColumns.push({ index: idx, header });
    }
  });

  const idField = type === "student" ? "admissionNo" : "teacherId";
  const idLabel = type === "student" ? "admission number" : "teacher ID";
  const wantedRaw =
    type === "student" ? identity.admissionNo : identity.teacherId;
  const wantedId = normId(wantedRaw);
  const wantedDigits = digitsOf(wantedRaw);
  const idCol = colByField.get(idField);

  const rowHasData = (i: number): boolean =>
    (matrix[i] ?? []).some((c) => cellText(c).length > 0);

  /* 1 — exact ID on the mapped ID column (the classic path). */
  if (wantedId && idCol !== undefined) {
    for (let i = headerRowIndex + 1; i < matrix.length; i++) {
      if (!rowHasData(i)) continue;
      if (normId((matrix[i] ?? [])[idCol]) === wantedId) {
        return finish(i, type === "student" ? "admission number" : "teacher ID");
      }
    }
  }

  /* 2 — exact ID on ANY column: the sheet's ID header wasn't in the
     synonym list (Index No / Student ID / a typo) but the VALUE is there. */
  if (wantedId) {
    for (let c = 0; c < headerRow.length; c++) {
      if (c === idCol) continue;
      for (let i = headerRowIndex + 1; i < matrix.length; i++) {
        if (!rowHasData(i)) continue;
        if (normId((matrix[i] ?? [])[c]) === wantedId) {
          return finish(i, "ID found on an unmapped column");
        }
      }
    }
  }

  /* 3 — digits-only on the mapped ID column, ONLY when exactly one row
     matches (ambiguous sheets refuse instead of guessing). Handles
     ADM/19/23 vs 19/23 and Excel's eaten leading zeros. */
  if (wantedDigits) {
    const idDigitHits: number[] = [];
    if (idCol !== undefined) {
      for (let i = headerRowIndex + 1; i < matrix.length; i++) {
        if (!rowHasData(i)) continue;
        if (digitsMatch(digitsOf((matrix[i] ?? [])[idCol]), wantedDigits)) {
          idDigitHits.push(i);
        }
      }
      if (idDigitHits.length === 1) {
        return finish(
          idDigitHits[0],
          type === "student" ? "admission number (digits)" : "teacher ID (digits)",
        );
      }
    }

    /* 4 — digits-only on ANY column (same uniqueness guard). */
    if (idDigitHits.length !== 1) {
      const anyHits: number[] = [];
      for (let c = 0; c < headerRow.length; c++) {
        if (c === idCol) continue;
        for (let i = headerRowIndex + 1; i < matrix.length; i++) {
          if (!rowHasData(i)) continue;
          if (anyHits.includes(i)) continue;
          if (digitsMatch(digitsOf((matrix[i] ?? [])[c]), wantedDigits)) {
            anyHits.push(i);
          }
        }
      }
      if (anyHits.length === 1) {
        return finish(anyHits[0], "ID found on an unmapped column");
      }
      if (idDigitHits.length > 1 || anyHits.length > 1) {
        return {
          ok: false,
          error: `More than one row matched ${idLabel} "${wantedRaw || wantedId}" by digits alone — check the file so the wrong row is never filled in.`,
        };
      }
    }
  }

  /* Still nothing with an ID → refuse loudly, but SAY what was tried
     (v2.9.15.10: the old message blamed the admission number even when
     the sheet had no recognisable ID column at all). */
  if (wantedId || wantedDigits) {
    return {
      ok: false,
      error: idCol === undefined
        ? `No ${idLabel} column was recognised on the sheet and no cell matched "${wantedRaw || wantedId}" either — rename the ID column to something like "${type === "student" ? "Admission No" : "Teacher ID"}" or check the file.`
        : `No row with that ${idLabel} was found on the sheet (looked for "${wantedRaw || wantedId}" exactly, then digits-only) — check the file.`,
    };
  }

  /* No usable ID at all → the first non-empty data row. */
  const firstIdx = (() => {
    for (let i = headerRowIndex + 1; i < matrix.length; i++) {
      if (rowHasData(i)) return i;
    }
    return -1;
  })();
  if (firstIdx === -1) {
    return {
      ok: false,
      error: "No data rows were found under the header — the sheet looks empty.",
    };
  }
  return finish(firstIdx, "first data row");

  /** Shared tail: build values + extras from the chosen row. */
  function finish(index: number, matchedBy: MatchedBy): EditRowMatch {
    const rawRow = matrix[index] ?? [];
    const values: Record<string, string> = {};
    auto.fieldByColumn.forEach((field, col) => {
      const v = normalizeImportValue(rawRow[col], field);
      if (v) values[field] = v;
    });

    const extra: Record<string, string> = {};
    for (const col of extraColumns) {
      const v = cellText(rawRow[col.index]).slice(0, EXTRA_VALUE_MAX);
      if (v) extra[col.header] = v;
    }

    return {
      ok: true,
      rowNumber: index + 1,
      matchedBy,
      values,
      extra,
    };
  }
}
