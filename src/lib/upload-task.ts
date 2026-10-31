/**
 * v2.8.68.1 — the shared shape every upload surface feeds into
 * UploadProgressRow. Kept in its own tiny module so both client components
 * and lib code can import the type without pulling in React.
 */
export type UploadTaskState = {
  id: string;
  name: string;
  size: number;
  loaded: number;
  /** 0–100. */
  pct: number;
  bytesPerSecond: number | null;
  etaSeconds: number | null;
  status: "uploading" | "done" | "cancelled" | "error";
  error?: string | null;
};
