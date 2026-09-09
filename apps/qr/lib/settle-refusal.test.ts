import { describe, expect, it } from "vitest";
import { settleRefusal } from "./settle-refusal";
import type { SettleTakeover } from "./supersede";

const ARMS = [
  "closed",
  "locked",
  "paying",
  "settling_other",
  "unavailable",
] as const satisfies readonly Exclude<SettleTakeover, "acquired">[];

describe("settleRefusal — one vocabulary for five different refusals (M197)", () => {
  it("says something different for every arm", () => {
    // The reason this is a module. Three staff surfaces had TWO sentences between five reasons, and
    // the two they had were already drifted for one identical fact ("wait for that to finish" vs
    // "wait a moment and try again"). A collapsed arm is a screen that cannot tell staff what to do.
    const said = ARMS.map((a) => settleRefusal(a));
    expect(new Set(said).size).toBe(ARMS.length);
    for (const s of said) expect(s.length).toBeGreaterThan(0);
  });

  it("never tells staff a live table is closed when we simply could not read it", () => {
    // The shipped defect this copy exists to end: `acquireSettlement` discarded its read error, so
    // an outage answered `closed` — a dead end — where the truth was a retry.
    const outage = settleRefusal("unavailable").toLowerCase();
    expect(outage).not.toContain("no longer open");
    expect(outage).toContain("try again");
    // And the genuinely-closed arm must still say so, or the fix has only moved the lie.
    expect(settleRefusal("closed").toLowerCase()).toContain("no longer open");
  });

  it("tells staff to STOP when a card on this table is already charging", () => {
    // `paying` is the one arm that must never be softened into "wait a moment": a second tender here
    // is the guest collected twice, waiting on a manual refund. The instruction has to be negative.
    const paying = settleRefusal("paying").toLowerCase();
    expect(paying).toContain("already going through");
    expect(paying).toMatch(/don’t|do not|never/);
  });

  it("does not blame a diner for a refusal that is not theirs", () => {
    // `settling_other` is another STAFF settlement, and `unavailable` is us. Saying "someone's
    // paying on their phone" for either sends staff to a guest who is doing nothing.
    expect(settleRefusal("settling_other").toLowerCase()).not.toContain("their phone");
    expect(settleRefusal("unavailable").toLowerCase()).not.toContain("their phone");
    // The one arm that IS a diner on their phone still says so.
    expect(settleRefusal("locked").toLowerCase()).toContain("their phone");
  });
});
