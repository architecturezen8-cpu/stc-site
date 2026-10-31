/**
 * v2.8.59.1 — dev-server OOM guard.
 *
 * The Node-only GC governor lives in instrumentation-node.ts and is
 * imported here ONLY for the nodejs runtime, so the Edge runtime (which
 * statically analyses this file) never sees Node APIs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerNodeGcGovernor } = await import("./instrumentation-node");
  await registerNodeGcGovernor();
}
