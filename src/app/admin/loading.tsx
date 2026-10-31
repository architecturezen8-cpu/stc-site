/**
 * Admin panel route loading state — the SAME round loading preloader used
 * everywhere: pure black screen, ultra-thin golden ring, soft "loading"
 * word beneath. No crest, no sliding bars, nothing else.
 */
export default function AdminLoading() {
  return (
    <div className="rtp-overlay" aria-busy="true" aria-label="Loading admin panel">
      <div className="rtp-ring" />
      <span className="rtp-word">Loading</span>
    </div>
  );
}
