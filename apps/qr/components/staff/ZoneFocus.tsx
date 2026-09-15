"use client";
import { useEffect } from "react";

/**
 * A folded route redirects onto a zone's fragment (`/staff/approvals` → `#appr-h`, `/staff/team`
 * → `/staff/login#team-h`, `/staff/feedback` → `/staff/tips#fb-h`); a fragment scrolls but does
 * not move focus (WCAG 2.4.3 — a screen-reader user would land at the top of the page). Take it on
 * arrival — and on a same-page jump (the bar's approvals circle, a tile on the same screen), which
 * changes the hash with NO mount (Codex round 1 on #283). Never without the fragment: a page opened
 * plainly keeps its focus where the browser put it.
 *
 * The A4·3 pattern, written ONCE. It was three identical copies by A4·4 (`ApprovalsBoard`,
 * `SettledToday`, `TeamManager`) and A4·5 needed a fourth for a zone whose heading is rendered on
 * the SERVER — so the hook finds the heading by id at the moment the hash says so (a ref cannot
 * reach across that boundary), and `<ZoneFocus>` is the hook as an element for that case. The
 * heading carries `tabIndex={-1}` and the id; nothing else is asked of it.
 */
export function useZoneFocus(id: string) {
  useEffect(() => {
    const take = () => {
      if (window.location.hash === `#${id}`)
        document.getElementById(id)?.focus({ preventScroll: true });
    };
    take();
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
  }, [id]);
}

/** The hook as an element, for a zone rendered by a Server Component. Renders nothing. */
export function ZoneFocus({ id }: { id: string }) {
  useZoneFocus(id);
  return null;
}
