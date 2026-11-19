/**
 * Deterministic student avatar mapping (v2.8.39.0) — the school does not
 * hold student photos, so every student gets a friendly flat-illustration
 * avatar from /avatars/ (8 variants, generated for the portals). The
 * mapping is a pure hash of the admission number: the SAME student always
 * sees the SAME avatar on every dashboard, with zero storage and zero
 * privacy concerns (no real photographs).
 */
const AVATAR_COUNT = 8;

export function studentAvatarFor(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `/avatars/student-${(h % AVATAR_COUNT) + 1}.png`;
}
