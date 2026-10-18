import { tf } from "./i18n/fill";
import type { StaffLang } from "./staff-lang";
import { serviceDayOffset, staffClock, staffWeekday } from "./staff-clock";

/**
 * The lifecycle audit (2026-10-13) — WHEN a held card is due, said with its DAY.
 *
 * The KDS printed a held pickup's fire time and slot as a bare clock ("5:40 PM"). The scheduling
 * horizon allows a slot days out (`pickup_config.horizon_days`, default 2), and settlement fires the
 * food with tomorrow's `fire_at`, so a card for TOMORROW stood on today's board reading "Pickup 6:00
 * PM — starts cooking on its own"; at 6:05 PM today it looked overdue, and its Cook now (no undo, no
 * reverse RPC) cooked the order a day early.
 *
 * Today reads as before, byte for byte ("5:40 PM"); tomorrow says so ("Tomorrow 5:40 PM"); a later
 * day names its weekday ("Sat 5:40 PM" — Latin, like every staff date). The day is the restaurant's
 * service day (`serviceDayOffset`), on the board's DB clock — never the tablet's.
 */
export function kdsWhen(lang: StaffLang, iso: string, nowIso: string): string {
  const clock = staffClock(iso);
  const offset = serviceDayOffset(iso, nowIso);
  if (offset === 1) return tf(lang, "kds.when.tomorrow", { t: clock });
  if (offset > 1) return `${staffWeekday(iso)} ${clock}`;
  return clock;
}
