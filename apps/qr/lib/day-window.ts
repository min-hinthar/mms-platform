/**
 * A4·1 (K31) — the service DAY, in ONE place, for any IANA zone.
 *
 * "Today" already had two owners: `mms_kds_stats()` derives it in SQL from `pickup_config.tz`
 * (`date_trunc('day', now() at time zone tz) at time zone tz`), and the register derived it in TS
 * with a hardcoded `America/Los_Angeles` (`laDayStartIso`). The KDS "Avg today" cell reads the SQL
 * one; the served rail beside it needed a TS floor — and a THIRD derivation, or the LA constant, would
 * have put two different "today"s on one strip the day the owner sets a zone. So the TS rule is one
 * function taking the zone, and `laDayStartIso` is now that function applied to LA.
 *
 * DST-correct by VERIFICATION, never by a fixed-offset subtraction: the calendar date comes from a
 * zone-aware format, the candidate midnight is built from the offset in force at `now`, and the
 * candidate is formatted BACK into the zone and required to read 00:00 on that date. Where the
 * offset changed between midnight and now (a DST day), the first candidate is an hour off and the
 * check fails; the second pass rebuilds it from the offset in force AT THE CANDIDATE, which is the
 * offset midnight actually had. Two passes suffice because a zone changes offset at most once per
 * calendar day.
 */

const WALL = new Map<string, Intl.DateTimeFormat>();

/**
 * The zone the SQL side coalesces to when `pickup_config.tz` cannot be read — kept identical, and
 * ALSO the zone every TS caller falls back to when the stored value is one ICU refuses.
 */
export const DEFAULT_SERVICE_TZ = "America/Los_Angeles";

/**
 * Is this an IANA zone `Intl` accepts? `pickup_config.tz` is `text` with no CHECK and no validating
 * writer, and Postgres's `at time zone` accepts names ICU does not (`'PST'`, `'EST5EDT'`). The SQL
 * stats keep working on such a value while `new Intl.DateTimeFormat({ timeZone })` THROWS a
 * RangeError — and the first A4·1 draft evaluated it as an argument on the KDS's only read path, so a
 * bad config value would have taken the whole live board down with a healthy database (blind pass
 * on A4·1, CRITICAL 1). Validate once, fall back, and say so.
 */
export function isIntlZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The service zone a TS surface may USE: the stored value when ICU accepts it, else the default. */
export function resolveServiceTz(raw: string | null | undefined): string {
  if (raw && isIntlZone(raw)) return raw;
  if (raw)
    console.error("[day-window] pickup_config.tz is not a zone Intl accepts — using the default", {
      tz: raw,
      fallback: DEFAULT_SERVICE_TZ,
    });
  return DEFAULT_SERVICE_TZ;
}

function wallFormat(tz: string): Intl.DateTimeFormat {
  let f = WALL.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23", // never the "24:00" some engines emit for midnight under hour12:false
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    WALL.set(tz, f);
  }
  return f;
}

type Wall = { y: number; m: number; d: number; hh: number; mm: number; ss: number };

/** The wall clock the zone shows at `ms`. */
function wallAt(ms: number, tz: string): Wall {
  const parts = wallFormat(tz).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    hh: get("hour"),
    mm: get("minute"),
    ss: get("second"),
  };
}

/** The zone's UTC offset in force at `ms`, in milliseconds (positive east of UTC). */
function offsetAt(ms: number, tz: string): number {
  const w = wallAt(ms, tz);
  // The wall clock re-read as if it were UTC, minus the true instant, is the offset — to the second,
  // which is all a zone rule ever uses.
  return Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss) - Math.floor(ms / 1000) * 1000;
}

/**
 * The UTC instant of the current calendar day's midnight in `tz`, given the server's own clock.
 *
 * An unparseable clock falls back to the process clock — the same posture as `queueFloorIso`: a
 * floor skewed by seconds beats one at the epoch, which admits everything.
 */
export function dayStartIso(nowIso: string, tz: string): string {
  const parsed = Date.parse(nowIso);
  const now = Number.isFinite(parsed) ? parsed : Date.now();
  // Belt on the zone as well: a caller that skipped `resolveServiceTz` must not throw here.
  if (!isIntlZone(tz)) return dayStartIso(nowIso, resolveServiceTz(tz));
  const today = wallAt(now, tz);
  const midnightAsUtc = Date.UTC(today.y, today.m - 1, today.d);
  let candidate = midnightAsUtc - offsetAt(now, tz);
  for (let pass = 0; pass < 2; pass++) {
    const w = wallAt(candidate, tz);
    if (w.y === today.y && w.m === today.m && w.d === today.d && w.hh === 0 && w.mm === 0) {
      return new Date(candidate).toISOString();
    }
    candidate = midnightAsUtc - offsetAt(candidate, tz);
  }
  // Reached only by a zone whose DST jump lands ON midnight (America/Santiago, America/Havana): the
  // wall never reads 00:00 on that date, so the second candidate — built from the offset in force at
  // the first — is the instant the day actually began, the first minute after the gap. Not LA.
  return new Date(candidate).toISOString();
}
