import { RESTAURANT_TZ } from "./pickupTime";

/**
 * Phase 0 — the home greeting, on the RESTAURANT's clock (the diner slots' rule: the shop's wall
 * clock, never the device's). The hero said "Good morning" at dinner; a greeting that is wrong half
 * the day is worse than none. Pure: the hero reads it after hydration and falls back to the
 * timeless "Mingalaba" on the server, which cannot know when the page will be read.
 */
const hourFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: RESTAURANT_TZ,
  hour: "numeric",
  hourCycle: "h23",
});

export function greetingFor(at: Date): "Good morning" | "Good afternoon" | "Good evening" {
  const hour = Number(hourFmt.format(at));
  if (hour >= 4 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
