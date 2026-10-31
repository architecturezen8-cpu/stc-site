"use client";

import { Printer } from "lucide-react";
import type { ReportCardView } from "@/lib/portal-report-card";

/* ────────────────────────────────────────────────────────────────────────
   v2.8.62.0 — THE OFFICIAL SHEET.

   A faithful digital copy of the school's paper report card: crest +
   heading, the meta lines, the Subjects × (First Test / Mid Year Test /
   Year End Test) grid, the six per-column summary rows exactly as the
   paper prints them, and the three term blocks with Special Remarks and
   the three signature lines.

   PURELY presentational — every surface (teacher editor preview, student
   page, parent page) renders the same sheet. The palette is the fixed
   academic cream/gold of the paper itself (never the dark portal theme)
   so the sheet looks — and prints — like the original; the print CSS
   forces white and hides the screen-only chrome.
   ──────────────────────────────────────────────────────────────────────── */

const COLUMN_HEADERS = ["First Test", "Mid Year Test", "Year End Test"] as const;
const TERM_HEADINGS = ["FIRST TERM", "SECOND TERM", "THIRD TERM"] as const;

function fmtMark(value: number | null): string {
  return value == null ? "" : String(value);
}

function fmtAvg(value: number | null): string {
  return value == null ? "" : (Number.isInteger(value) ? `${value}` : value.toFixed(1));
}

function fmtInt(value: number | null): string {
  return value == null ? "" : String(value);
}

export function ReportCardSheet({
  card,
  crestSrc,
}: {
  card: ReportCardView;
  /** Server-resolved school crest (the portal brand logo), optional. */
  crestSrc?: string | null;
}) {
  const { summary } = card;
  const classSize = card.classSize;

  /* v2.8.63.0 — the owner: "download option eka one na physical report eka
     thiyanawa ne oka nikan digital preview ekak witharane" — the PDF export
     is GONE (the school prints the physical report from the office register
     anyway); this screen stays a preview with Print for convenience. */

  const statusLabel =
    card.status === "certified"
      ? "Certified — visible to the student & parents"
      : card.status === "submitted"
        ? "With the Principal — awaiting certification"
        : "Draft — visible to the class teacher only";

  return (
    <div className="rcs-wrap">
      {/* Screen-only print bar */}
      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-[var(--pt-muted)]">Official sheet · {statusLabel}</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] px-4 py-2 text-[12px] font-semibold text-[var(--pt-heading)] transition-colors hover:border-[var(--pt-border-strong)]"
        >
          <Printer size={14} aria-hidden="true" />
          Print
        </button>
      </div>

      <style>{`
        .rcs-wrap { color: #241d0c; }
        .rcs-sheet {
          background: #fbf7ec;
          border: 1px solid #c3a54d;
          border-radius: 4px;
          padding: 28px 22px 34px;
          box-shadow: 0 18px 44px -28px rgb(0 0 0 / 0.45);
          max-width: 860px;
          margin: 0 auto;
        }
        .rcs-table { width: 100%; border-collapse: collapse; }
        .rcs-table th, .rcs-table td {
          border: 1px solid #b49a4e;
          padding: 6px 8px;
          font-size: 12px;
          line-height: 1.35;
        }
        .rcs-table th { background: #f3ead2; font-weight: 700; }
        .rcs-table td { background: #fffdf6; }
        .rcs-table .rcs-num { text-align: center; width: 34px; }
        .rcs-table .rcs-mark { text-align: center; width: 88px; }
        .rcs-label { font-weight: 700; }
        .rcs-sign {
          border-top: 1.5px dotted #6d5a23;
          /* v2.8.76.1 — width-tracked, not width-forced: the old hard
             min-width 180px refused to shrink inside the phone's ~130px
             signature columns, so the two sign blocks OVERLAPPED each
             other (the owner's "sign karana tān eka uda gihin"). Full
             column width below sm; the paper's 180px rule from sm up. */
          width: 100%;
          min-width: 0;
          padding-top: 4px;
          text-align: center;
          font-size: 11px;
          color: #5d4c1e;
        }
        @media (min-width: 640px) {
          .rcs-sign { width: auto; min-width: 180px; }
        }
        /* v2.8.76.1 — phone breathing room: slimmer sheet padding and a
           denser marks grid so the table fits (or scrolls in its own
           lane) instead of dragging the whole sheet sideways. */
        @media (max-width: 639px) {
          .rcs-sheet { padding: 20px 14px 28px; }
          .rcs-table th, .rcs-table td { padding: 5px 6px; font-size: 11px; }
          .rcs-table .rcs-mark { width: 64px; }
          .rcs-table .rcs-num { width: 24px; }
        }
        .rcs-dotted {
          border-bottom: 1.5px dotted #8a7434;
          min-height: 20px;
          flex: 1;
        }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #ffffff !important; }
          .portal-scope { background: #ffffff !important; }
          /* The portal chrome never belongs on the printed sheet. */
          .portal-scope > header,
          .portal-scope > footer { display: none !important; }
          .rcs-sheet {
            box-shadow: none !important;
            max-width: none !important;
            border-color: #9a8438 !important;
            background: #ffffff !important;
            padding: 10mm 8mm;
          }
          .rcs-table td { background: #ffffff !important; }
        }
      `}</style>

      <div className="rcs-sheet" role="document" aria-label={`School report ${card.year} — ${card.student.fullName}`}>
        {/* ── Heading ── */}
        <div className="text-center">
          {crestSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={crestSrc}
              alt="St. Thomas' College crest"
              width={64}
              height={64}
              className="mx-auto h-16 w-16 rounded-full object-contain"
            />
          ) : (
            <span
              aria-hidden="true"
              className="mx-auto grid h-16 w-16 place-items-center rounded-full border-2 border-[#b49a4e] bg-[#f3ead2] font-display text-[15px] font-bold tracking-wide text-[#5d4c1e]"
            >
              STC
            </span>
          )}
          <p className="mt-2 font-display text-[20px] font-bold uppercase tracking-[0.14em] text-[#241d0c] sm:text-[24px]">
            St. Thomas&apos; College
          </p>
          <p className="mt-0.5 text-[12px] font-semibold uppercase tracking-[0.5em] text-[#8a7434]">
            Matale
          </p>
          <p className="mt-3 font-display text-[17px] font-bold uppercase tracking-[0.22em] sm:text-[19px]">
            School Report
          </p>
          <p className="mt-1 text-[12.5px] font-medium italic text-[#5d4c1e]">
            Terminal Examination {card.year}
          </p>
          {card.status !== "certified" ? (
            <p className="no-print mx-auto mt-2 inline-block rounded-full border border-[#b49a4e] bg-[#f3ead2] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7434]">
              {card.status === "submitted"
                ? "With the Principal — students & parents see it after certification"
                : "Draft — not yet visible to students & parents"}
            </p>
          ) : null}
        </div>

        {/* ── Meta rows ── */}
        <dl className="mx-auto mt-5 grid max-w-[620px] grid-cols-1 gap-x-8 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
          {[
            ["Year", card.year],
            ["Grade", card.grade],
            ["Name", card.student.fullName],
            ["Admission No", card.student.admissionNo],
            ["Class", card.cls.name],
            ["Number in class", String(classSize)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-end gap-2">
              <dt className="rcs-label shrink-0">{label}</dt>
              <span aria-hidden="true" className="rcs-dotted flex-1" />
              <dd className="shrink-0 font-semibold">{value || "—"}</dd>
            </div>
          ))}
        </dl>

        {/* ── Marks grid — v2.8.76.1: the horizontal scroll lives on the
            TABLE's own lane now (the old overflow sat on the whole sheet,
            dragging every signature line sideways on phones). */}
        <div className="mt-5 overflow-x-auto">
        <table className="rcs-table">
          <thead>
            <tr>
              <th rowSpan={2} className="rcs-num">
                <span className="sr-only">Line number</span>
                #
              </th>
              <th rowSpan={2} className="w-[38%] text-left align-middle">
                Subjects
              </th>
              <th colSpan={3} className="text-center">
                Marks obtained
              </th>
            </tr>
            <tr>
              {COLUMN_HEADERS.map((h) => (
                <th key={h} className="rcs-mark">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center italic text-[#8a7434]">
                  No subject lines on this sheet yet.
                </td>
              </tr>
            ) : (
              card.rows.map((row, i) => (
                <tr key={`${row.subject}-${i}`}>
                  <td className="rcs-num">{i + 1}</td>
                  <td>{row.subject}</td>
                  <td className="rcs-mark">{fmtMark(row.m1)}</td>
                  <td className="rcs-mark">{fmtMark(row.m2)}</td>
                  <td className="rcs-mark">{fmtMark(row.m3)}</td>
                </tr>
              ))
            )}

            {/* ── Per-column summary rows, exactly as the paper ── */}
            <tr>
              <td colSpan={2} className="rcs-label">
                Total Marks obtained
              </td>
              {summary.map((s, i) => (
                <td key={i} className="rcs-mark">
                  {fmtInt(s.count > 0 ? s.total : null)}
                </td>
              ))}
            </tr>
            <tr>
              <td colSpan={2} className="rcs-label">
                Average Marks
              </td>
              {summary.map((s, i) => (
                <td key={i} className="rcs-mark">
                  {fmtAvg(s.average)}
                </td>
              ))}
            </tr>
            <tr>
              <td colSpan={2} className="rcs-label">
                Average Marks of the First in Class
              </td>
              {summary.map((s, i) => (
                <td key={i} className="rcs-mark">
                  {fmtAvg(s.firstInClass)}
                </td>
              ))}
            </tr>
            <tr>
              <td colSpan={2} className="rcs-label">
                Number of Students in the Class
              </td>
              <td colSpan={3} className="rcs-mark text-center">
                {String(classSize)}
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="rcs-label">
                Position of Student
              </td>
              {summary.map((s, i) => (
                <td key={i} className="rcs-mark">
                  {fmtInt(s.position)}
                </td>
              ))}
            </tr>
            <tr>
              <td colSpan={2} className="rcs-label">
                Attendance
              </td>
              {[1, 2, 3].map((term) => (
                <td key={term} className="rcs-mark">
                  {card.terms.find((t) => t.term === term)?.attendance ?? ""}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        </div>

        {/* ── Term blocks ── */}
        <div className="mt-6 space-y-5">
          {TERM_HEADINGS.map((heading, idx) => {
            const term = card.terms[idx] ?? { term: idx + 1, studies: "", conduct: "", attendance: "" };
            return (
              <section key={term.term}>
                <h3 className="text-center font-display text-[13px] font-bold uppercase tracking-[0.3em] text-[#241d0c] underline decoration-[#b49a4e] decoration-2 underline-offset-4">
                  {heading}
                </h3>
                <div className="mx-auto mt-3 max-w-[680px] text-[12.5px] leading-relaxed">
                  <p className="rcs-label">Special Remarks</p>
                  <div className="mt-1.5 flex items-end gap-2">
                    <span className="rcs-label shrink-0">(a) Studies:</span>
                    {term.studies ? (
                      <p className="min-w-0 flex-1">{term.studies}</p>
                    ) : (
                      <span aria-hidden="true" className="rcs-dotted" />
                    )}
                  </div>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="rcs-label shrink-0">(b) General Conduct:</span>
                    {term.conduct ? (
                      <p className="min-w-0 flex-1">{term.conduct}</p>
                    ) : (
                      <span aria-hidden="true" className="rcs-dotted" />
                    )}
                  </div>
                </div>

                {/* Signature lines — Principal left, Class Teacher right,
                    Parent/Guardian centred below, dotted rules with the
                    labels beneath (the paper's arrangement).
                    v2.8.63.0 — a CERTIFIED sheet carries the real stamps:
                    the principal's signature (+ seal) and the class
                    teacher's signature are placed by the SERVER at certify
                    time and served ONLY through the session-gated
                    signature route — no public URL ever exists.
                    v2.8.76.1 — the two columns STACK below sm (two 130px
                    phone columns squeezed the sign blocks into each
                    other) and every stamp is width-capped to its own
                    column so no image ever crosses the divider. */}
                <div className="mx-auto mt-6 flex max-w-[680px] flex-col gap-5 px-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                  <div className="min-w-0 flex-1">
                    {card.status === "certified" && card.signatures.hasPrincipalSign ? (
                      <span className="flex flex-wrap items-end justify-center gap-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/portal/report-card-signature?cardId=${card.cardId}&kind=principal-sign`}
                          alt="Signature of the Principal"
                          className="h-10 w-auto max-w-[min(170px,100%)] object-contain"
                        />
                        {card.signatures.hasPrincipalSeal ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={`/api/portal/report-card-signature?cardId=${card.cardId}&kind=principal-seal`}
                            alt="College seal"
                            className="h-14 w-auto max-w-[min(130px,100%)] object-contain opacity-90"
                          />
                        ) : null}
                      </span>
                    ) : null}
                    <div className="rcs-sign">
                      <span className="block truncate font-semibold italic text-[#241d0c]">
                        {card.signatures.principal || "\u00A0"}
                      </span>
                      Signature of Principal
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    {card.status === "certified" && card.signatures.hasTeacherSign ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/portal/report-card-signature?cardId=${card.cardId}&kind=teacher-sign`}
                        alt="Signature of the Class Teacher"
                        className="mx-auto h-10 w-auto max-w-[min(170px,100%)] object-contain"
                      />
                    ) : null}
                    <div className="rcs-sign">
                      <span className="block truncate font-semibold italic text-[#241d0c]">
                        {card.signatures.classTeacher || "\u00A0"}
                      </span>
                      Signature of the Class Teacher
                    </div>
                  </div>
                </div>
                <div className="mx-auto mt-5 flex max-w-[680px] justify-center px-1">
                  <div className="rcs-sign">
                    <span className="block">&nbsp;</span>
                    Signature of Parent/Guardian
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <p className="mt-7 text-center text-[10px] uppercase tracking-[0.28em] text-[#8a7434]">
          St. Thomas&apos; College · Matale · Est. 1873
        </p>
      </div>
    </div>
  );
}
