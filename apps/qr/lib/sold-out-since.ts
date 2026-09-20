import { sameServiceDay, staffClock, staffDateTime } from "./staff-clock";

/**
 * menu-4 — the 86 stamp's ONE job is to expose a flag that outlived its shift, and a bare clock
 * cannot do it: `sold out since 6:40 PM` reads the same for a dish taken off this evening and one
 * forgotten yesterday. Same service day → the clock alone; any other day → the day rides with it
 * (`Sep 15, 6:40 PM`) and the caller tints the tag so an overdue flag is pre-attentive.
 *
 * `nowIso` is passed in, never read here: the page renders it at request time so the server and
 * the hydrating client agree, and a pure rule is falsified by a VALUE across the Los Angeles
 * midnight (`sold-out-since.test.ts`).
 */
export type SoldOutSince = { sameDay: boolean; t: string };

export function soldOutSinceParts(soldOutAt: string, nowIso: string): SoldOutSince {
  const sameDay = sameServiceDay(soldOutAt, nowIso);
  return { sameDay, t: sameDay ? staffClock(soldOutAt) : staffDateTime(soldOutAt) };
}
