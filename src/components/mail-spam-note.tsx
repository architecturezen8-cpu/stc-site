import { MailWarning } from "lucide-react";

/**
 * v2.8.84.0 — the ONE red "check your spam folder" note (owner: emails land
 * in spam "godak welawata", so every surface that tells a user an email is
 * on its way carries the same warning). ONE component, ONE sentence — the
 * red styling is supplied by each surface because the site, the portals and
 * the Admin Studio all speak different design tokens.
 */
export function MailSpamNote({ className }: { className: string }) {
  return (
    <p role="note" className={className}>
      <MailWarning size={15} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        School emails sometimes land in the <b>Spam / Junk</b> folder — please
        check there too.
      </span>
    </p>
  );
}
