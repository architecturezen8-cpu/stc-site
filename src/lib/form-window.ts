/**
 * v2.8.85.0 — CLIENT-SAFE form window check.
 *
 * src/lib/form-builder.ts (the server contract) is `server-only`, so the
 * client surfaces — the public renderer and the admin builder list — use
 * this mirror of isFormWindowOpen. Keep the two in sync: same inputs, same
 * answers, same reasons.
 */

export type FormWindowState = { open: boolean; reason: string };

export function isFormWindowOpenClient(
  openAt: Date | string | null,
  closeAt: Date | string | null,
  now: Date = new Date(),
): FormWindowState {
  const open = openAt ? new Date(openAt) : null;
  const close = closeAt ? new Date(closeAt) : null;
  if (open && Number.isNaN(open.getTime()) === false && now < open) {
    return { open: false, reason: `This form opens on ${open.toISOString().slice(0, 10)}.` };
  }
  if (close && Number.isNaN(close.getTime()) === false && now > close) {
    return { open: false, reason: `This form closed on ${close.toISOString().slice(0, 10)}.` };
  }
  return { open: true, reason: "" };
}
