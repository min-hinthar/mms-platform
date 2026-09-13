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
 * zone-aware format, a candidate is built from every offset the zone shows around midnight, each
 * candidate is formatted BACK into the zone, and the one chosen is the one the SQL half chooses —
 * because "one definition" means agreeing with `mms_kds_stats`, whose `date_trunc('day', now() at
 * time zone tz) at time zone tz` is the fixed half. PostgreSQL, measured on this project's database
 * (17.6): an ambiguous local midnight (a fall-back that repeats the hour — Havana) resolves on the
 * STANDARD-time side, the LATER instant; a missing local midnight (a spring-forward AT midnight —
 * Santiago, Havana, Cairo) maps forward to the jump, the day's first instant, 01:00. So: the latest
 * candidate reading exactly 00:00 today, else the earliest candidate dated today. "Reads 00:00"
 * alone alternated back to 23:00 the day before on the jump (Codex round 1 on A4·1); "earliest
 * dated today" alone took the first 00:00 where Postgres takes the second (Codex's per-head round).
 */

const WALL = new Map<string, Intl.DateTimeFormat>();
/** The widest jump a zone makes at one transition — the probe radius around the first candidate. */
const HOUR_MS = 60 * 60 * 1000;

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
    // Said with its consequence (Codex round 1 on A4·1): `mms_kds_stats` keeps deriving ITS day from
    // the stored value in SQL (Postgres accepts 'PST' as a fixed −08:00), so until the value is an
    // IANA name the served rail and the Avg cell beside it can disagree by an hour in summer.
    // Storage-time validation is a trigger, i.e. a prod migration — OPEN-ITEMS K34.
    console.error(
      "[day-window] pickup_config.tz is not a zone Intl accepts — using the default; the SQL stats still derive their day from the stored value, so the served rail and Avg today may disagree until it is an IANA name (K34)",
      { tz: raw, fallback: DEFAULT_SERVICE_TZ },
    );
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
  // Local midnight is midnight-as-UTC minus the offset in force AT that instant — which the offset
  // at `now` need not be (a DST day). Build a candidate from the offset at `now`, then from every
  // offset the zone shows within an hour of it (a transition's far side, whichever side that is; an
  // hour is the widest jump a zone makes), format each back, and choose as PostgreSQL does: the
  // LATEST candidate that reads exactly 00:00 today (an ordinary day has one; a fall-back at
  // midnight has two and Postgres resolves the ambiguity on the standard-time side, the later), else
  // — a jump that lands ON midnight, where no instant reads 00:00 — the EARLIEST candidate dated
  // today, the first minute after the gap, which is where Postgres maps the missing midnight too.
  const first = midnightAsUtc - offsetAt(now, tz);
  const offsets = new Set([
    offsetAt(now, tz),
    offsetAt(first, tz),
    offsetAt(first - HOUR_MS, tz),
    offsetAt(first + HOUR_MS, tz),
  ]);
  let atMidnight: number | null = null; // the latest candidate reading 00:00 today
  let firstOfDay: number | null = null; // the earliest candidate dated today (the jump case)
  for (const off of offsets) {
    const candidate = midnightAsUtc - off;
    const w = wallAt(candidate, tz);
    if (w.y !== today.y || w.m !== today.m || w.d !== today.d) continue;
    if (firstOfDay === null || candidate < firstOfDay) firstOfDay = candidate;
    if (w.hh === 0 && w.mm === 0 && (atMidnight === null || candidate > atMidnight))
      atMidnight = candidate;
  }
  let start = atMidnight ?? firstOfDay;
  if (start === null) {
    // Unreachable by the argument above; said rather than silently floored somewhere else.
    console.error(
      "[day-window] no candidate read today's date — flooring from the current offset",
      {
        tz,
        nowIso,
      },
    );
    start = first;
  }
  return new Date(start).toISOString();
}
