import { describe, expect, it } from "vitest";
import { PICKED_UNDO_MS } from "./expo-rules";
import {
  ARRIVAL_UNDO_MS,
  arrivalCommitDue,
  arrivalTapHeld,
  isFired,
  LATE_AFTER_MIN,
  pickupCountdownMin,
  pickupDayBounds,
  pickupGuide,
  pickupIsToday,
  type PickupGuideInput,
} from "./pickup-promise";

/**
 * PD3 — the pickup promise's ONE derivation, falsified by VALUE. Every fixture is chosen so the
 * discriminating arm and the catch-all answer DIFFERENTLY: a held order that would read "with the
 * kitchen" without the `fired` gate, a slot exactly at the late boundary, a tap exactly at the
 * same-gesture arm. verify:slice mutants: pickup-promise/*.
 */

// A real evening: 6:20 PM in Covina is 01:20 UTC the next day (PDT, UTC−7).
const SLOT = "2026-10-09T01:20:00.000Z"; // 6:20 PM PDT, Oct 8
const PAID = "2026-10-09T00:58:00.000Z"; // 5:58 PM
const min = (n: number) => n * 60_000;
const at = (iso: string, offsetMin = 0) => Date.parse(iso) + min(offsetMin);

const base: PickupGuideInput = {
  status: "paid",
  pickupSlot: SLOT,
  fireAt: null, // as-soon-as-possible: the kitchen got it at payment
  togoStatus: "preparing",
  arrivedAt: null,
  createdAt: PAID,
};

describe("isFired — has the kitchen got this ticket?", () => {
  it("null fire_at is an as-soon-as-possible order: fired at payment", () => {
    expect(isFired(null, at(PAID))).toBe(true);
  });
  it("a scheduled order is held until its fire_at, and fired AT it", () => {
    const fireAt = "2026-10-09T01:08:00.000Z"; // slot − 12 min
    expect(isFired(fireAt, at(fireAt, -1))).toBe(false);
    // MUTATION: `<=` → `<` — the tick at fire_at still reads held.
    expect(isFired(fireAt, at(fireAt))).toBe(true);
  });
  it("an unparseable stamp is NOT fired — the safe direction", () => {
    expect(isFired("not-a-date", at(PAID))).toBe(false);
  });
});

describe("pickupGuide — never 'with the kitchen' while the ticket is held (M65)", () => {
  it("a held order reads booked: Order placed current, no kitchen word, the start sub", () => {
    // A noon-paid 6:20 PM pickup at 2 PM: fire_at = slot − 12 min is hours away.
    const g = pickupGuide(
      { ...base, fireAt: "2026-10-09T01:08:00.000Z", createdAt: "2026-10-08T19:00:00.000Z" },
      at("2026-10-08T21:00:00.000Z"),
    );
    expect(g.stage).toBe("booked");
    expect(g.step).toBe(0);
    expect(g.now.en).toBe("You’re booked for 6:20 PM.");
    expect(g.now.my).toBe("6:20 PM အတွက် မှာထားပြီးပါပြီ");
    expect(g.sub?.en).toBe("The kitchen starts it closer to your time.");
    expect(g.now.en).not.toMatch(/kitchen/);
  });
  it("an as-soon-as-possible order is with the kitchen from payment (the shipped pair)", () => {
    const g = pickupGuide(base, at(PAID, 3));
    expect(g.stage).toBe("cooking");
    expect(g.step).toBe(1);
    expect(g.now.en).toBe("Your order’s with the kitchen.");
    expect(g.now.my).toBe("သင့်အော်ဒါ မီးဖိုချောင်ထဲ ရောက်နေပါပြီနော်");
    expect(g.sub).toBeNull();
  });
  it("never 'starts it closer' when fire_at is null (B6)", () => {
    const g = pickupGuide(base, at(PAID));
    expect(g.sub?.en ?? "").not.toMatch(/starts it closer/);
    expect(g.stage).not.toBe("booked");
  });
  it("a fired scheduled order reads with the kitchen once fire_at has passed", () => {
    const fireAt = "2026-10-09T01:08:00.000Z";
    expect(pickupGuide({ ...base, fireAt }, at(fireAt, 1)).stage).toBe("cooking");
  });
});

describe("pickupGuide — the late state (15 minutes past the slot, not bagged)", () => {
  it("is late AT slot + LATE_AFTER_MIN, and not one minute before", () => {
    expect(LATE_AFTER_MIN).toBe(15);
    expect(pickupGuide(base, at(SLOT, LATE_AFTER_MIN) - 1).stage).toBe("cooking");
    // MUTATION: `>=` → `>` — the minute at the boundary still reads cooking.
    const g = pickupGuide(base, at(SLOT, LATE_AFTER_MIN));
    expect(g.stage).toBe("late");
    expect(g.step).toBe(1);
    expect(g.now.en).toBe("Your 6:20 PM order isn’t bagged yet.");
    expect(g.now.my).toBe("6:20 PM အော်ဒါကို မထုပ်ရသေးပါဘူး");
    expect(g.sub?.en).toBe("It shows here the moment it is.");
    expect(g.now.en).not.toMatch(/sorry|minute|soon/i);
  });
  it("late is keyed on the slot alone, never on fire_at (B6: fire_at ≤ slot by construction)", () => {
    // A row whose fire_at is somehow still ahead at slot + 20: the guest is overdue either way.
    const g = pickupGuide({ ...base, fireAt: new Date(at(SLOT, 30)).toISOString() }, at(SLOT, 20));
    expect(g.stage).toBe("late");
  });
  it("a bagged order is never late, and a collected one never anything but picked up", () => {
    expect(pickupGuide({ ...base, togoStatus: "ready" }, at(SLOT, 40)).stage).toBe("ready");
    expect(pickupGuide({ ...base, togoStatus: "picked_up" }, at(SLOT, 40)).stage).toBe("pickedUp");
  });
});

describe("pickupGuide — ready and picked up", () => {
  it("ready: the pass face, step 2, the family word once", () => {
    const g = pickupGuide({ ...base, togoStatus: "ready" }, at(SLOT, -6));
    expect(g.stage).toBe("ready");
    expect(g.step).toBe(2);
    expect(g.face).toBe("code");
    expect(g.now.en).toBe("Your order is ready.");
    expect(g.now.my).toBe("ယူလို့ရပြီ");
  });
  it("picked up: the rest face, step 3, no arrival offer", () => {
    const g = pickupGuide({ ...base, togoStatus: "picked_up" }, at(SLOT, 4));
    expect(g.stage).toBe("pickedUp");
    expect(g.step).toBe(3);
    expect(g.face).toBe("rest");
    expect(g.now.en).toBe("Picked up — enjoy!");
    expect(g.arrivalOffered).toBe(false);
  });
  it("the time face holds while booked, cooking and late", () => {
    expect(pickupGuide(base, at(PAID)).face).toBe("time");
    expect(pickupGuide(base, at(SLOT, 20)).face).toBe("time");
  });
});

describe("pickupGuide — 'I’m here' is offered on the pickup's own day, at every stage", () => {
  it("offered while booked, cooking, late and ready on the day", () => {
    const held = { ...base, fireAt: "2026-10-09T01:08:00.000Z" };
    expect(pickupGuide(held, at("2026-10-08T17:00:00.000Z")).arrivalOffered).toBe(true); // 10 AM
    expect(pickupGuide(base, at(PAID)).arrivalOffered).toBe(true);
    expect(pickupGuide(base, at(SLOT, 20)).arrivalOffered).toBe(true);
    expect(pickupGuide({ ...base, togoStatus: "ready" }, at(SLOT)).arrivalOffered).toBe(true);
  });
  it("never on another day — the day is the RESTAURANT's, not UTC's", () => {
    // 11 PM PDT on Oct 7 is 06:00 UTC Oct 8 — the UTC date already matches the slot's UTC date
    // (Oct 9 01:20 UTC is Oct 8 in Covina). A UTC-keyed rule would offer it a day early.
    // MUTATION: compare UTC dates → offered.
    expect(pickupGuide(base, at("2026-10-08T06:00:00.000Z")).arrivalOffered).toBe(false);
    // The morning of the pickup day, 1 AM PDT = 08:00 UTC: offered.
    expect(pickupGuide(base, at("2026-10-08T08:00:00.000Z")).arrivalOffered).toBe(true);
    // The day after, early: not offered.
    expect(pickupGuide(base, at("2026-10-09T08:00:00.000Z")).arrivalOffered).toBe(false);
  });
  it("never once the order is refunded", () => {
    expect(pickupGuide({ ...base, status: "refunded" }, at(PAID)).arrivalOffered).toBe(false);
  });
});

describe("pickupIsToday / pickupDayBounds — the restaurant's calendar day", () => {
  it("the bounds of a PDT day are 07:00Z to 07:00Z, and a PST day 08:00Z to 08:00Z", () => {
    expect(pickupDayBounds(at("2026-10-08T20:00:00.000Z"))).toEqual({
      start: "2026-10-08T07:00:00.000Z",
      end: "2026-10-09T07:00:00.000Z",
    });
    expect(pickupDayBounds(at("2026-12-10T20:00:00.000Z"))).toEqual({
      start: "2026-12-10T08:00:00.000Z",
      end: "2026-12-11T08:00:00.000Z",
    });
  });
  it("the slot at the day's first instant is today; the one at its last instant too; the next day's first is not", () => {
    const now = at("2026-10-08T20:00:00.000Z");
    expect(pickupIsToday("2026-10-08T07:00:00.000Z", now)).toBe(true);
    expect(pickupIsToday("2026-10-09T06:59:59.999Z", now)).toBe(true);
    // MUTATION: `<` end → `<=` — the next day's midnight slot counts as today.
    expect(pickupIsToday("2026-10-09T07:00:00.000Z", now)).toBe(false);
    expect(pickupIsToday("2026-10-08T06:59:59.999Z", now)).toBe(false);
  });
});

describe("pickupCountdownMin — honest arithmetic on the booked slot, no 'any minute now'", () => {
  it("counts whole minutes from 1 to 90", () => {
    expect(pickupCountdownMin(SLOT, at(SLOT, -19))).toBe(19);
    expect(pickupCountdownMin(SLOT, at(SLOT, -90))).toBe(90);
    expect(pickupCountdownMin(SLOT, at(SLOT, -1))).toBe(1);
  });
  it("is empty beyond 90 minutes and from the slot onwards (the retired 'any minute now')", () => {
    expect(pickupCountdownMin(SLOT, at(SLOT, -91))).toBeNull();
    // MUTATION: `mins >= 1` → `mins >= 0` — zero would need a word, and that word was the ETA.
    expect(pickupCountdownMin(SLOT, at(SLOT))).toBeNull();
    expect(pickupCountdownMin(SLOT, at(SLOT, 5))).toBeNull();
  });
});

describe("the take-back window — the lane's 6 seconds, held time added, armed after the gesture", () => {
  it("ARRIVAL_UNDO_MS is the lane's own number", () => {
    expect(ARRIVAL_UNDO_MS).toBe(PICKED_UNDO_MS);
  });
  it("the commit is due at start + window, slid by the time held, never before", () => {
    expect(arrivalCommitDue(1_000, 0, 1_000 + ARRIVAL_UNDO_MS - 1)).toBe(false);
    expect(arrivalCommitDue(1_000, 0, 1_000 + ARRIVAL_UNDO_MS)).toBe(true);
    // MUTATION: ignore heldMs — a keyboard user's held window commits under them.
    expect(arrivalCommitDue(1_000, 4_000, 1_000 + ARRIVAL_UNDO_MS)).toBe(false);
    expect(arrivalCommitDue(1_000, 4_000, 1_000 + ARRIVAL_UNDO_MS + 4_000)).toBe(true);
  });
  it("a tap inside the same gesture as the swap is ignored, in both directions", () => {
    expect(arrivalTapHeld(10_000, 10_349)).toBe(true);
    expect(arrivalTapHeld(10_000, 10_350)).toBe(false);
    expect(arrivalTapHeld(null, 10_000)).toBe(false);
  });
});
