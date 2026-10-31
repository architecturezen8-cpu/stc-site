/**
 * v2.8.59.1 — dev-server OOM guard (the "memory leak" the owner kept
 * seeing: next-server RSS creeping to ~3 GB on a 4 GB sandbox until the
 * cgroup killer visits).
 *
 * The V8 side of that creep is slow accumulations that Node only collects
 * under pressure — long-lived dev module caches, memoization tables, the
 * request-layer bookkeeping behind ~100 API routes. When the `dev` script
 * starts the server with `--expose-gc`, this governor pokes the collector
 * BEFORE the process ever feels pressure: every 90 s, if the live heap is
 * above 700 MB, run a full GC. Nothing happens without the flag (production
 * builds never run it) and the timer is unref'd so it can never hold the
 * process open.
 *
 * Turbopack's NATIVE engine memory is governed separately — see the
 * `experimental.turbopackMemoryLimit` note in next.config.ts.
 *
 * This file is ONLY imported when NEXT_RUNTIME === "nodejs" (see
 * src/instrumentation.ts) — the Edge runtime never bundles it, so the
 * Node APIs below never trip the Edge static analysis.
 */
export async function registerNodeGcGovernor() {
  const globalWithGc = globalThis as typeof globalThis & { gc?: () => void };
  if (typeof globalWithGc.gc !== "function") return;
  const gc = globalWithGc.gc;

  const HEAP_GC_THRESHOLD = 700 * 1024 * 1024; // 700 MB live heap
  const INTERVAL_MS = 90_000;

  const timer = setInterval(() => {
    try {
      const { heapUsed } = process.memoryUsage();
      if (heapUsed > HEAP_GC_THRESHOLD) {
        const before = heapUsed;
        gc();
        const after = process.memoryUsage().heapUsed;
        console.log(
          `[gc-governor] heap ${Math.round(before / 1048576)} MB → ` +
            `${Math.round(after / 1048576)} MB`,
        );
      }
    } catch {
      /* a failed gc() is never worth crashing the server over */
    }
  }, INTERVAL_MS);
  timer.unref?.();
}
