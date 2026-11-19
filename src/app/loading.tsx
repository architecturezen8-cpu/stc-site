/**
 * Route-level loading state — the SAME round loading preloader the user
 * specified for slow networks: pure black screen, ultra-thin golden ring,
 * a soft "loading" word beneath. No crest, no sliding bars, nothing else.
 */
export default function SiteLoading() {
  return (
    <div className="rtp-overlay" aria-busy="true" aria-label="Loading page">
      <div className="rtp-ring" />
      <span className="rtp-word">Loading</span>
    </div>
  );
}
