import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SERVICE_TZ, dayStartIso, isIntlZone, resolveServiceTz } from "./day-window";

/**
 * Every expected instant below was derived INDEPENDENTLY of the function under test: a brute-force
 * walk back minute by minute from `now` until the zone's wall clock read 00:00 on the same calendar
 * date (run in node with `Intl.DateTimeFormat.formatToParts` alone — no offset arithmetic, no
 * candidate probing). A value that agreed with the implementation because it was computed BY the
 * implementation would prove nothing.
 */
describe("dayStartIso — the service day, in any zone, DST-correct by verification", () => {
  it("Los Angeles in summer (PDT, −7)", () => {
    expect(dayStartIso("2026-07-15T19:30:00Z", "America/Los_Angeles")).toBe(
      "2026-07-15T07:00:00.000Z",
    );
  });
  it("Los Angeles in winter (PST, −8)", () => {
    expect(dayStartIso("2026-01-15T19:30:00Z", "America/Los_Angeles")).toBe(
      "2026-01-15T08:00:00.000Z",
    );
  });
  it("a UTC date that is still YESTERDAY in LA belongs to yesterday's service day", () => {
    // 03:00Z on the 16th is 20:00 PDT on the 15th — the day is the ZONE's calendar, not UTC's.
    expect(dayStartIso("2026-07-16T03:00:00Z", "America/Los_Angeles")).toBe(
      "2026-07-15T07:00:00.000Z",
    );
  });
  it("the fall-back day: midnight was PDT although noon is PST (offset changed in between)", () => {
    // 2026-11-01 20:00Z is 12:00 PST. The offset in force NOW is −8, but the day began under −7 —
    // a candidate built from the current offset lands at 08:00Z, one hour late, and the
    // format-back check is what rejects it. MUTATION: skip the verification → 08:00Z.
    expect(dayStartIso("2026-11-01T20:00:00Z", "America/Los_Angeles")).toBe(
      "2026-11-01T07:00:00.000Z",
    );
  });
  it("the spring-forward day: midnight was PST although the afternoon is PDT", () => {
    expect(dayStartIso("2026-03-08T20:00:00Z", "America/Los_Angeles")).toBe(
      "2026-03-08T08:00:00.000Z",
    );
  });
  it("both 01:30s of the fall-back day resolve to that day's midnight", () => {
    // PDT→PST happens at 09:00Z on 2026-11-01. 08:30Z is the FIRST 01:30 (PDT) and 09:30Z the
    // SECOND (PST) — the repeated hour, where the offset at `now` differs from midnight's. Both
    // instants were walked back by brute force to 07:00Z (the blind pass caught the first draft's
    // comment calling 08:30Z the second 01:30 and testing only it).
    expect(dayStartIso("2026-11-01T08:30:00Z", "America/Los_Angeles")).toBe(
      "2026-11-01T07:00:00.000Z",
    );
    expect(dayStartIso("2026-11-01T09:30:00Z", "America/Los_Angeles")).toBe(
      "2026-11-01T07:00:00.000Z",
    );
  });
  it("a zone whose spring-forward lands ON midnight begins its day at the jump, not the hour before (Codex round 1 on A4·1)", () => {
    // Santiago 2026-09-06: 00:00 (−4) → 01:00 (−3). No instant reads 00:00 on that date; the day's
    // first minute reads 01:00. The first draft's second pass rebuilt the candidate once more after
    // the check failed and alternated back to 03:00Z — 23:00 on the 5th — so the rail carried the
    // prior day's last hour. Havana and Cairo jump at midnight the same way. Walked back by brute
    // force, minute by minute, until the wall date changed — and the same three instants measured
    // from the SQL half on the project's database (PostgreSQL 17.6 maps the missing local midnight
    // forward to the jump): `2026-09-06 04:00:00+00`, `2026-03-08 05:00:00+00`, `2026-04-23 22:00:00+00`.
    expect(dayStartIso("2026-09-06T12:00:00Z", "America/Santiago")).toBe(
      "2026-09-06T04:00:00.000Z",
    );
    expect(dayStartIso("2026-03-08T12:00:00Z", "America/Havana")).toBe("2026-03-08T05:00:00.000Z");
    expect(dayStartIso("2026-04-24T12:00:00Z", "Africa/Cairo")).toBe("2026-04-23T22:00:00.000Z");
  });
  it("a zone whose fall-back lands ON midnight takes the SECOND 00:00 — PostgreSQL's side of the repeated hour", () => {
    // Havana 2026-11-01: 01:00 (−4) → 00:00 (−5), so 00:00 reads twice — at 04:00Z and again at
    // 05:00Z. The SQL half of "today" (`mms_kds_stats`: `date_trunc('day', now() at time zone tz) at
    // time zone tz`) resolves an ambiguous local midnight on the STANDARD-time side, the later
    // instant — measured on the project's database (PostgreSQL 17.6): `2026-11-01 05:00:00+00`.
    // One definition means the TS half mirrors that, not the calendar's first minute (Codex's
    // per-head round on A4·1 caught the round-1 rule taking the first). Santiago 2026-04-05 falls
    // back the night before (00:00 → 23:00 on the 4th), so its 00:00 is unique — Postgres: 04:00Z.
    expect(dayStartIso("2026-11-01T12:00:00Z", "America/Havana")).toBe("2026-11-01T05:00:00.000Z");
    expect(dayStartIso("2026-04-05T12:00:00Z", "America/Santiago")).toBe(
      "2026-04-05T04:00:00.000Z",
    );
  });
  it("a half-hour zone with no DST (Yangon, +6:30) — the zone the family reads the clock in", () => {
    // 19:30Z is 02:00 on the 16th in Yangon; its midnight is 17:30Z on the 15th.
    expect(dayStartIso("2026-07-15T19:30:00Z", "Asia/Yangon")).toBe("2026-07-15T17:30:00.000Z");
  });
  it("UTC is the identity on the date", () => {
    expect(dayStartIso("2026-07-15T19:30:00Z", "UTC")).toBe("2026-07-15T00:00:00.000Z");
  });
  it("is a day floor, NEVER a rolling 24 hours — two clocks on one service day agree", () => {
    // MUTATION: `now − 86_400_000` → 09:00 and 22:00 on the same LA day answer different floors,
    // and the register's takings disagree with the strip beside them every time service runs past
    // the hour they were opened. Both instants must resolve to the one midnight.
    const morning = dayStartIso("2026-07-15T16:00:00Z", "America/Los_Angeles"); // 09:00 PDT
    const night = dayStartIso("2026-07-16T05:00:00Z", "America/Los_Angeles"); // 22:00 PDT
    expect(morning).toBe("2026-07-15T07:00:00.000Z");
    expect(night).toBe(morning);
  });
  it("an unparseable clock falls back to the process clock rather than the epoch", () => {
    const iso = dayStartIso("not a date", "UTC");
    const floor = Date.parse(iso);
    expect(Number.isFinite(floor)).toBe(true);
    expect(Date.now() - floor).toBeLessThan(24 * 60 * 60 * 1000 + 60_000);
    expect(Date.now() - floor).toBeGreaterThanOrEqual(0);
  });
  it("the SQL fallback zone is the LA constant, spelled once", () => {
    expect(DEFAULT_SERVICE_TZ).toBe("America/Los_Angeles");
  });
  it("a zone ICU refuses NEVER throws — it falls back to the default (blind pass, CRITICAL 1)", () => {
    // Postgres accepts 'PST' for `at time zone`; Intl does not. The first draft threw a RangeError
    // here, evaluated as an argument on the KDS's only read path — a bad config value took the live
    // board down with a healthy database.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => dayStartIso("2026-07-15T19:30:00Z", "PST")).not.toThrow();
    expect(dayStartIso("2026-07-15T19:30:00Z", "PST")).toBe(
      dayStartIso("2026-07-15T19:30:00Z", DEFAULT_SERVICE_TZ),
    );
    spy.mockRestore();
  });
  it("resolveServiceTz keeps a real zone, and replaces (and reports) one Intl refuses", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(resolveServiceTz("Asia/Yangon")).toBe("Asia/Yangon");
    expect(resolveServiceTz("America/Los_Angelos")).toBe(DEFAULT_SERVICE_TZ);
    expect(resolveServiceTz(null)).toBe(DEFAULT_SERVICE_TZ);
    expect(spy).toHaveBeenCalledTimes(1); // null is an absence, not a bad value — no report
    expect(isIntlZone("UTC")).toBe(true);
    expect(isIntlZone("Not/AZone")).toBe(false);
    spy.mockRestore();
  });
});
