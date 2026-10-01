"use client";
import { useEffect, useState } from "react";
import { relativeAge, type RelativeAge } from "@/lib/relative-time";
import type { StaffLang } from "@/lib/staff-lang";
import { useStaffLang } from "./StaffLangProvider";
import { Chrome } from "./Chrome";

/**
 * Relative "last activity" label for the floor (S1.2). Hydration-safe: the FIRST render computes from
 * the server-provided `serverNow` (a fixed prop → identical HTML on server and client, no mismatch),
 * then a client effect ticks it from the real clock. Clock skew between the staff tablet and the server
 * is absorbed by seeding the offset from `serverNow`; a still-negative diff (future) clamps to "just now".
 *
 * counter-8 — the words are the dictionary's (`time.*`; `lib/relative-time.ts` picks the key and
 * the count), rendered through `<Chrome>`: a Burmese console reads "၅ မိနစ်က" in its own marked run
 * with Burmese numerals, where every card used to carry an unmarked English tail. `<time dateTime>`
 * keeps the machine-readable stamp for assistive tech and hover. Every mount sits under
 * `StaffLangProvider` (app/staff/layout.tsx), so the tongue is read here, not threaded by callers.
 */
export function RelativeTime({ iso, serverNow }: { iso: string; serverNow: string }) {
  const lang = useStaffLang();
  return <RelativeAgeText iso={iso} age={useRelativeAge(iso, serverNow)} lang={lang} />;
}

/** The `<time>` itself, for an age already read (`useRelativeAge`) — `<RelativeTime>`'s render, and
 *  a card's that must name the same value it draws. */
export function RelativeAgeText({
  iso,
  age,
  lang,
}: {
  iso: string;
  age: RelativeAge;
  lang: StaffLang;
}) {
  return (
    <time dateTime={iso}>
      {age.n === undefined ? (
        <Chrome lang={lang} k={age.k} />
      ) : (
        <Chrome lang={lang} k={age.k} vars={{ n: age.n }} />
      )}
    </time>
  );
}

/**
 * Phase 2g — the age `<RelativeTime>` prints, as the hook it runs on: seeded from `serverNow`
 * (hydration-safe), then ticked from the device clock with the server skew taken out. Exported so a
 * card whose accessible name must CONTAIN the visible age (WCAG 2.5.3 — `CounterOrderCard`) reads
 * the very value the `<time>` beside it draws, on the same tick, never a second clock.
 */
export function useRelativeAge(iso: string, serverNow: string): RelativeAge {
  const [nowMs, setNowMs] = useState(() => Date.parse(serverNow));

  useEffect(() => {
    // Correct for device/server clock skew once, then tick from the real clock.
    const skew = Date.now() - Date.parse(serverNow);
    const update = () => setNowMs(Date.now() - skew);
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [serverNow]);

  return relativeAge(iso, nowMs);
}
