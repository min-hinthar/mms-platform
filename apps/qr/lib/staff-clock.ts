import { RESTAURANT_TZ } from "./pickupTime";

/**
 * tips-1 — the restaurant's clock for the staff console, named ONCE.
 *
 * Three surfaces printed a time three ways: `tips/page.tsx` called `toLocaleString(undefined, …)`
 * from a Server Component — which on Vercel's Node runtime is UTC, so every feedback row on prod
 * read `Sep 18, 2:05 AM` for a 7:05 PM review — while `PilotNightSheet` and `MenuPriceEditor`
 * beside it each carried their own `America/Los_Angeles` formatter. The zone is `pickupTime.ts`'s
 * `RESTAURANT_TZ` (the diner slots' rule: the shop's wall clock, never the device's), and every
 * staff time goes through one of the three shapes here. `en-US` and Latin numerals throughout —
 * a clock is read against a wall clock and a printed ticket (`fill.ts`'s clock rule).
 *
 * Pure and isomorphic (no directive): the tips page renders it on the server, the price editor in
 * the browser, and both must agree to the minute.
 */
const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: RESTAURANT_TZ,
  hour: "numeric",
  minute: "2-digit",
});
const date = new Intl.DateTimeFormat("en-US", {
  timeZone: RESTAURANT_TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const dateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: RESTAURANT_TZ,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const dayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: RESTAURANT_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `6:40 PM` — the restaurant's wall clock. */
export function staffClock(iso: string): string {
  return clock.format(new Date(iso));
}

/** `Tue, Sep 15` — the service day. */
export function staffDate(iso: string): string {
  return date.format(new Date(iso));
}

/** `Sep 15, 6:40 PM` — a stamp that has to carry its day. */
export function staffDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** The service-day key, `YYYY-MM-DD` in the restaurant's zone — the ONLY honest "same day". */
export function serviceDayKey(iso: string): string {
  return dayKey.format(new Date(iso));
}

/** Two instants fall on the same service day. UTC dates lie for five to seven hours a night. */
export function sameServiceDay(a: string, b: string): boolean {
  return serviceDayKey(a) === serviceDayKey(b);
}
