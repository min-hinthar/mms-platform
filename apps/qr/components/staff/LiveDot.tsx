"use client";
import { useState } from "react";
import { Icon } from "@mms/ui";
import { counterFold, liveDot, type LiveBoardState } from "@/lib/live-connection";
import { useDeviceOffline } from "@/lib/useConnectionTruth";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { useLiveBoardStates } from "./LiveConnection";

/**
 * Phase 2b · feedback — the staff bar's STATUS SLOT, on pages with a feed only. It sits beside the
 * title and OUTSIDE the h1, so the heading's name (and the KDS main region that is labelled by it)
 * never changes with it.
 *
 * ONE TRUTH with the board's own banner: the KDS and the table page pass their own `degraded`
 * state (`'not_updating'` / `'live'`), the counter passes `'counter'` and reads the PURE fold of
 * its two boards (`counterFold` — floor + bags, never the manager's approvals rail). A sustained
 * device offline outranks both (`liveDot`).
 *
 * Three states, three SHAPES, never colour alone: a filled dot (live), a hollow ring (stale), the
 * offline glyph (offline). The word 'Live' is sr-only at every width — only the bad states need to
 * be read at arm's length — and the slot is plain text, not a live region: the boards' own regions
 * already speak their freeze. The 14px mark box renders at SSR whenever the slot does, so nothing
 * shifts at hydration; before the counter's boards report it is EMPTY (`data-state="none"`), never
 * a guessed 'Live'.
 */
export function LiveDot({ lang, feed }: { lang: StaffLang; feed: "counter" | LiveBoardState }) {
  const states = useLiveBoardStates();
  const offline = useDeviceOffline();
  const state = liveDot(offline, feed === "counter" ? counterFold(states ?? {}) : feed);
  // A CHANGE between two drawn states pops the mark once (the kit's `.mms-pop`, reduced-motion
  // gated there). Tracked as state — adjusted during render, React's "information from previous
  // renders" pattern — so there is no pop on first paint, none on the empty mark filling in, and
  // no ref read during render.
  const [seen, setSeen] = useState(state);
  const [pops, setPops] = useState(0);
  if (seen !== state) {
    setSeen(state);
    if (seen !== null && state !== null) setPops((n) => n + 1);
  }
  return (
    <span className="staff-live" data-state={state ?? "none"}>
      <span
        // Keyed on the pop count so each change REPLAYS the one-shot animation.
        key={pops}
        className={pops > 0 ? "staff-live-mark mms-pop" : "staff-live-mark"}
        aria-hidden="true"
      >
        {state === "offline" && <Icon name="offline" size={14} />}
      </span>
      {state !== null && (
        <span className="staff-live-word">
          {state === "live" ? (
            <Chrome lang={lang} k="shell.live.live" />
          ) : state === "stale" ? (
            <Chrome lang={lang} k="shell.live.stale" />
          ) : (
            <Chrome lang={lang} k="shell.live.offline" />
          )}
        </span>
      )}
    </span>
  );
}
