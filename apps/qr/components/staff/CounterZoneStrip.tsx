"use client";
import { useEffect, useState } from "react";
import type { StaffLang } from "@/lib/staff-lang";
import type { StaffKey } from "@/lib/i18n/staff";
import { sx } from "@/lib/staff-labels";
import { currentZone } from "@/lib/counter-zones";
import { Chrome } from "./Chrome";

/**
 * Phase 3a (D5, `docs/PHASE3_JOURNEYS.md`) — the counter home's MAP.
 *
 * A manager's `/staff` stacks eight zones on one scroll (4–6 screen heights); a server's four. The
 * zones stay one screen — the counter bell hears BOTH boards (owner decision 5c), the split pane
 * and the mint lock wrap them, and unmounting any of it is a Phase-2-sized change — and this strip
 * turns the scroll into one tap: a sticky row of chips under the staff bar, one per zone, each a
 * NATIVE anchor to the zone's own heading id (the approvals circle's idiom — a fragment the browser
 * scrolls to, with `useZoneFocus` taking focus where a zone asks for it). Each chip says exactly
 * what the zone's heading says (the dictionary key is the heading's own: one name per thing), so
 * nothing here adds a word to the K15 queue but the strip's accessible name.
 *
 * The lit chip is the zone the reader is IN: the last heading at or above the strip's own edge,
 * read on scroll (rAF-throttled, passive) — `lib/counter-zones.ts` decides, this measures. It wears
 * `aria-current="location"` and the shared lit-gold cap; nothing else is a state.
 */
export type CounterZone = { id: string; k: StaffKey };

export function CounterZoneStrip({ lang, zones }: { lang: StaffLang; zones: CounterZone[] }) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let ticking = false;
    const read = () => {
      ticking = false;
      // The strip's bottom edge is where a heading "arrives": the bar above it is sticky too.
      const strip = document.querySelector<HTMLElement>(".staff-zone-strip");
      const edge = strip ? strip.getBoundingClientRect().bottom + 8 : 120;
      const tops = zones.map((z) => {
        const el = document.getElementById(z.id);
        return { id: z.id, top: el ? el.getBoundingClientRect().top : Number.POSITIVE_INFINITY };
      });
      setCurrent(currentZone(tops, edge));
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [zones]);

  if (zones.length === 0) return null;
  return (
    <nav className="staff-zone-strip" aria-label={sx(lang, "floor.a11y.zones")}>
      {zones.map((z) => (
        <a
          key={z.id}
          href={`#${z.id}`}
          className="staff-chip staff-zone-chip staff-press"
          aria-current={current === z.id ? "location" : undefined}
        >
          <Chrome lang={lang} k={z.k} />
        </a>
      ))}
    </nav>
  );
}
