import { useCallback, useEffect, useRef, useState } from "react";
import { claimGuideFirstRun, type GuideStore } from "../guide-seen";

/** The default store: this device's `localStorage`, read through a getter (touching it can throw). */
const localStore = (): GuideStore => window.localStorage;

/**
 * PD12 · PD11 — the ONE React seam over `lib/guide-seen.ts`: offer a guide once, on the first quiet
 * open, marked the moment it shows. Every guide mounts through this (the counter's idle pane, the
 * kitchen's empty board, and the diner's guide once PD11 builds it), so the at-open read, the mark
 * and the refusal are written once.
 *
 *  - `key` — the guide's seen key (`guideSeenKey`), or null when this host may not offer it at all
 *    (a station whose guide has not shipped, no signed-in person to key it to).
 *  - `quietAtMount` — read ONCE, in the claim: the screen's quiet is decided at MOUNT only (m12 WHEN
 *    rule 2), so a board that empties mid-shift never conjures a guide. A function, so a host can
 *    read the instant's facts (a media query, the URL hash) at the claim rather than at render.
 *
 * The read runs in a microtask after mount (the shipped Help door's pattern), so the server render
 * and the first client render agree and no state is set in an effect body; the claim is made by the
 * pass that is still LIVE, so StrictMode's discarded first pass can never mark a guide seen for the
 * live one — a mark written there would be read as "seen" and the first morning would show nothing.
 *
 * `dismiss` hides it for the rest of this mount (Close, the last step, work pushing it away); it is
 * already marked, so it never comes back by itself.
 *
 * `store` (PD11) — where the mark is read and written; `localStorage` by default (the staff guides).
 * The diner's guide hands a store that ALSO reads its server-set cookie (`dinerGuideStore`), so a
 * phone whose script storage Safari cleared still reads its mark. Read once, like the quiet.
 */
export function useGuideFirstRun(
  key: string | null,
  quietAtMount: () => boolean,
  store: () => GuideStore = localStore,
): { shown: boolean; dismiss: () => void } {
  const [shown, setShown] = useState(false);
  const quiet = useRef(quietAtMount);
  const read = useRef(store);
  useEffect(() => {
    if (key === null) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      if (claimGuideFirstRun(read.current, key, quiet.current())) setShown(true);
    });
    return () => {
      active = false;
    };
  }, [key]);
  const dismiss = useCallback(() => setShown(false), []);
  return { shown, dismiss };
}
