/**
 * v2.8.53.0 — chat limits shared by the SERVER validators and the CLIENT
 * composers. Kept in a client-safe module because portal-questions.ts is
 * `server-only` and the islands need the same numbers for instant,
 * pre-upload feedback (file size guard, counter).
 */

/** The message text — the caption when a file rides along. */
export const MAX_CHAT_TEXT_LENGTH = 1000;

/** ONE file per message, 5 MB — sized so chat can never threaten the free tier. */
export const MAX_CHAT_FILE_BYTES = 5 * 1024 * 1024;
