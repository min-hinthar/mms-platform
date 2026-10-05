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
 * `aria-current="location"` and the shared lit-gold cap; nothing else is a state. Deep pass on
 * #312: a hidden column is never read, the end of a scrollable page lights the last present zone,
 * a chip tap lights its zone at once, and the lit chip is kept inside the strip's own viewport.
 */
export type CounterZone = { id: string; k: StaffKey };

export function CounterZoneStrip({ lang, zones }: { lang: StaffLang; zones: CounterZone[] }) {
  const [current, setCurrent] = useState<string | null>(null);
  // The page hands a fresh array on every server re-render (each poll's `router.refresh()`); the
  // effect re-arms only when the SET of zones changes.
  const zoneKey = zones.map((z) => z.id).join(" ");

  useEffect(() => {
    const targets = zoneKey ? zoneKey.split(" ") : [];
    if (typeof window === "undefined") return;
    let ticking = false;
    const read = () => {
      ticking = false;
      // The strip's bottom edge is where a heading "arrives": the bar above it is sticky too.
      const strip = document.querySelector<HTMLElement>(".staff-zone-strip");
      const box = strip?.getBoundingClientRect();
      // Deep pass on #312 — below 48em with a table pane open the whole column is `display: none`,
      // and a hidden subtree measures every rect as 0: a naive read lit the LAST zone and the lie
      // outlived the pane's close. No layout box, no reading — the last honest one stands.
      if (box && box.width === 0 && box.height === 0) return;
      const edge = box ? box.bottom + 8 : 120;
      const tops = targets.map((id) => {
        const el = document.getElementById(id);
        return { id, top: el ? el.getBoundingClientRect().top : Number.POSITIVE_INFINITY };
      });
      // Scrollable AND scrolled to the end: the last present zone is where the reader is, even when
      // its heading cannot climb to the edge (deep pass on #312). An unscrollable page is not "at
      // the bottom" — there, the top is the top.
      const doc = document.documentElement;
      const atBottom =
        doc.scrollHeight > window.innerHeight + 2 &&
        window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
      setCurrent(currentZone(tops, edge, atBottom));
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(read);
    };
    // A chip tap is the reader saying where they are going: light it at once, and let the scroll
    // it causes agree (on a page too short to scroll it to the edge, nothing follows — the tap
    // stands; deep pass on #312).
    const onHash = () => {
      const id = window.location.hash.slice(1);
      if (targets.includes(id)) setCurrent(id);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("hashchange", onHash);
    // The column coming back (the pane closing) changes the strip's size, not the scroll offset.
    const strip = document.querySelector<HTMLElement>(".staff-zone-strip");
    const ro = typeof ResizeObserver !== "undefined" && strip ? new ResizeObserver(onScroll) : null;
    if (ro && strip) ro.observe(strip);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("hashchange", onHash);
      ro?.disconnect();
    };
  }, [zoneKey]);

  // Keep the lit chip inside the strip's own viewport (deep pass on #312): six chips overflow a
  // phone's width, and a current chip clipped off the right edge left the strip with no lit chip
  // at all — its one stated job invisible for exactly the zones that overflow. A scroll offset, not
  // `scrollIntoView` (which would also scroll the page), and instant: no motion to escort.
  useEffect(() => {
    if (!current) return;
    const strip = document.querySelector<HTMLElement>(".staff-zone-strip");
    const chip = strip?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!strip || !chip) return;
    const PAD = 20;
    const left = chip.offsetLeft - PAD;
    const right = chip.offsetLeft + chip.offsetWidth + PAD;
    if (left < strip.scrollLeft) strip.scrollLeft = Math.max(0, left);
    else if (right > strip.scrollLeft + strip.clientWidth)
      strip.scrollLeft = right - strip.clientWidth;
  }, [current]);

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
