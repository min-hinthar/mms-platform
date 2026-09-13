/**
 * A4·3 (Codex round 1 on #283, P2) — the ONE service-day floor every "today" read on the counter
 * screen shares.
 *
 * `getDayCashSummary` floored on `laDayStartIso` (hardcoded Los Angeles) while `getSettledToday`
 * floored on `dayStartIso(now, pickup_config.tz)`, so "Today's takings" and "Settled today" — two
 * zones of one screen, one above the other, each presenting itself as the same day — could bucket
 * different service days the moment the owner's zone is not LA. The RULE (`dayStartIso`) is
 * mutation-tested in `day-window.ts`; this is the READ that applies it: the server's own clock
 * (`mms_now`, so two reads in one request agree about "now") and the configured zone, VALIDATED
 * (`resolveServiceTz` — `pickup_config.tz` is text with no CHECK and no validating writer), each
 * failure logged and coalesced, never thrown: a floor read must never take a money surface down.
 */
import type { serviceClient } from "@mms/db/server";
import { dayStartIso, resolveServiceTz } from "./day-window";

type Db = ReturnType<typeof serviceClient>;

export type ServiceDay = {
  /** The server's instant (`mms_now`); this server's clock only if the rpc failed (logged). */
  nowIso: string;
  /** The validated service zone — `pickup_config.tz`, or the default when unreadable or unknown. */
  tz: string;
  /** The UTC instant the CURRENT service day began in `tz` (`dayStartIso`). */
  sinceIso: string;
};

/** @param tag the caller's log prefix (`[refunds]`, `[register]`), so a coalesced failure names the surface. */
export async function readServiceDay(db: Db, tag: string): Promise<ServiceDay> {
  const [nowRes, tzRes] = await Promise.all([
    db.rpc("mms_now"),
    db.from("pickup_config").select("tz").maybeSingle(),
  ]);
  if (nowRes.error)
    console.error(`[${tag}] mms_now failed — the service day floors on this server's clock`, {
      message: nowRes.error.message,
    });
  const nowIso = nowRes.data ?? new Date().toISOString();
  if (tzRes.error)
    console.error(
      `[${tag}] pickup_config tz read failed — the service day floors on the default zone`,
      {
        message: tzRes.error.message,
      },
    );
  const tz = resolveServiceTz(tzRes.data?.tz);
  return { nowIso, tz, sinceIso: dayStartIso(nowIso, tz) };
}
