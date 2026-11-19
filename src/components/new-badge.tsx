/** Gold "NEW" chip — flags freshly added news, events, teachers and Old Thomians. */
export function NewBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-gold px-2.5 py-1 font-sans text-[8.5px] font-bold uppercase leading-none tracking-[0.18em] text-ink shadow-sm ${className}`}
    >
      New
    </span>
  );
}
