import { describe, expect, it } from "vitest";
import { CRON_SECRET_MIN_LENGTH, cronAuthVerdict } from "./cron-auth";

/**
 * M160(b) · owner ruling #13 — the cron's door. The case that matters most is the first: with the
 * secret UNSET the door is shut, not open. A route that sweeps Stripe and writes orders must never
 * treat "nobody configured a secret" as "no secret required".
 */
const SECRET = "s3cr3t-cron-token-0123456789";

describe("cronAuthVerdict", () => {
  it("fails CLOSED with the secret unset — every caller refused, a bare header included", () => {
    for (const secret of [undefined, null, ""]) {
      expect(cronAuthVerdict("Bearer ", secret)).toBe("unconfigured");
      expect(cronAuthVerdict("Bearer undefined", secret)).toBe("unconfigured");
      expect(cronAuthVerdict(null, secret)).toBe("unconfigured");
    }
  });

  it("a secret shorter than the floor counts as unset (a guessable token is the same open door)", () => {
    const short = "x".repeat(CRON_SECRET_MIN_LENGTH - 1);
    expect(cronAuthVerdict(`Bearer ${short}`, short)).toBe("unconfigured");
    const floor = "x".repeat(CRON_SECRET_MIN_LENGTH);
    expect(cronAuthVerdict(`Bearer ${floor}`, floor)).toBe("ok");
  });

  it("the exact bearer header passes", () => {
    expect(cronAuthVerdict(`Bearer ${SECRET}`, SECRET)).toBe("ok");
  });

  it.each([
    ["no header", null],
    ["the bare secret, no scheme", SECRET],
    ["another scheme", `Basic ${SECRET}`],
    ["a lowercase scheme", `bearer ${SECRET}`],
    ["a prefix of the secret", `Bearer ${SECRET.slice(0, -1)}`],
    ["the secret plus a tail", `Bearer ${SECRET}x`],
    ["a wrong token", "Bearer nope-nope-nope-nope-nope"],
  ])("refuses %s", (_label, header) => {
    expect(cronAuthVerdict(header, SECRET)).toBe("denied");
  });
});
