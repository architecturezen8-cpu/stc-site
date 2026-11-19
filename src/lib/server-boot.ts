/**
 * v2.9.14.6 — one id per running server process.
 *
 * The sandbox preview can sit idle long enough that the dev server restarts
 * underneath an open tab; the tab then repaints the OLD UI whose JS chunks
 * no longer exist, and every button is dead. The stale-page reloader compares
 * the boot id baked into the page with the one /api/health reports — when
 * they differ, the page was rendered by a process that is no longer serving,
 * so the tab silently reloads itself onto the live UI.
 *
 * Kept on globalThis so Turbopack hot reloads cannot mint a new id mid-edit
 * (a new id is only minted when the process itself is new).
 */
const globalBoot = globalThis as typeof globalThis & {
  __STC_SERVER_BOOT_ID__?: string;
};

export function getServerBootId(): string {
  if (!globalBoot.__STC_SERVER_BOOT_ID__) {
    globalBoot.__STC_SERVER_BOOT_ID__ =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  return globalBoot.__STC_SERVER_BOOT_ID__;
}
