import { describe, expect, it } from "vitest";
import {
  compareExpoTickets,
  EXPO_TONE_MIN,
  expoAge,
  kitchenStateOf,
  PICKED_UNDO_MS,
  pickedUndoOpen,
  type ExpoOrderKey,
} from "./expo-rules";

/**
 * A4·2 · K30 (B) — both rules falsified by VALUE: a fixture where the discriminating line and the
 * catch-all produce different answers, never a fixture they agree on.
 */
const togo = (state: string) => ({ state, fulfillment: "togo" });
const grocery = (state: string) => ({ state, fulfillment: "grocery" });
const dinein = (state: string) => ({ state, fulfillment: "dinein" });

describe("kitchenStateOf — the bag's kitchen state, off its cart's own lines", () => {
  it("is done once every to-go food line is served", () => {
    expect(kitchenStateOf([togo("served"), togo("served")])).toBe("done");
  });
  it("is cooking while any to-go food line is still draft, fired or in progress", () => {
    expect(kitchenStateOf([togo("served"), togo("fired")])).toBe("cooking");
    expect(kitchenStateOf([togo("in_progress")])).toBe("cooking");
    expect(kitchenStateOf([togo("draft")])).toBe("cooking");
  });
  it("a VOIDED line is off the ticket and cannot keep a bag cooking forever", () => {
    // MUTATION: drop the `state !== "voided"` filter → a voided fired line reads as cooking.
    expect(kitchenStateOf([togo("served"), togo("voided")])).toBe("done");
  });
  it("grocery lines are never kitchen work — a grocery-only bag is done the moment it is paid", () => {
    // MUTATION: drop the `fulfillment === "togo"` filter → a grocery line (never fired, so never
    // served) reads as cooking, and every scan-and-go basket sinks below the food bags for good.
    expect(kitchenStateOf([grocery("draft"), grocery("draft")])).toBe("done");
    expect(kitchenStateOf([togo("served"), grocery("draft")])).toBe("done");
  });
  it("a dine-in line on a mixed order stays on the table — it is not in the bag", () => {
    expect(kitchenStateOf([togo("served"), dinein("fired")])).toBe("done");
  });
  it("no lines readable is unknown, never a verdict either way", () => {
    expect(kitchenStateOf(undefined)).toBe("unknown");
    expect(kitchenStateOf([])).toBe("unknown");
  });
  it("a bag whose every dish was voided after payment says nothing — not 'done' on a refund", () => {
    expect(kitchenStateOf([togo("voided"), togo("voided")])).toBe("unknown");
    expect(kitchenStateOf([togo("voided"), grocery("draft")])).toBe("unknown");
  });
});

const key = (over: Partial<ExpoOrderKey> & Pick<ExpoOrderKey, "orderId">): ExpoOrderKey => ({
  arrivedAt: null,
  kitchen: "done",
  pickupSlot: null,
  createdAt: "2026-09-13T18:00:00Z",
  ...over,
});
const ids = (rows: ExpoOrderKey[]) => [...rows].sort(compareExpoTickets).map((r) => r.orderId);

describe("compareExpoTickets — a waiting guest, then a finished bag, then the due time", () => {
  it("a guest who tapped 'I'm here' outranks a finished bag due earlier", () => {
    // MUTATION: test the kitchen before the arrival → the finished bag jumps the waiting human.
    const waiting = key({
      orderId: "b",
      arrivedAt: "2026-09-13T18:20:00Z",
      kitchen: "cooking",
      createdAt: "2026-09-13T18:10:00Z",
    });
    const finished = key({ orderId: "a", kitchen: "done", createdAt: "2026-09-13T17:00:00Z" });
    expect(ids([finished, waiting])).toEqual(["b", "a"]);
  });
  it("a bag the kitchen has finished outranks one still cooking, whatever their due times", () => {
    // MUTATION: invert the rank → the cooking bag, which cannot be bagged yet, heads the lane.
    const cooking = key({ orderId: "a", kitchen: "cooking", createdAt: "2026-09-13T17:00:00Z" });
    const done = key({ orderId: "b", kitchen: "done", createdAt: "2026-09-13T18:00:00Z" });
    expect(ids([cooking, done])).toEqual(["b", "a"]);
  });
  it("unknown sits with done — not knowing is not a reason to sink a bag", () => {
    const unknown = key({ orderId: "a", kitchen: "unknown", createdAt: "2026-09-13T17:00:00Z" });
    const done = key({ orderId: "b", kitchen: "done", createdAt: "2026-09-13T18:00:00Z" });
    const cooking = key({ orderId: "c", kitchen: "cooking", createdAt: "2026-09-13T16:00:00Z" });
    expect(ids([cooking, done, unknown])).toEqual(["a", "b", "c"]);
  });
  it("then the effective due time — a slot when one exists, else payment time — then the code", () => {
    const slotted = key({
      orderId: "z",
      pickupSlot: "2026-09-13T19:00:00Z",
      createdAt: "2026-09-13T12:00:00Z",
    });
    const asap = key({ orderId: "y", createdAt: "2026-09-13T18:30:00Z" });
    const tie = key({ orderId: "x", createdAt: "2026-09-13T18:30:00Z" });
    expect(ids([slotted, asap, tie])).toEqual(["x", "y", "z"]);
  });
});

describe("expoAge — due-ness, not paid-age (counter-7)", () => {
  const T0 = Date.parse("2026-09-20T18:00:00.000Z");
  const iso = (offsetMin: number) => new Date(T0 + offsetMin * 60_000).toISOString();
  it("a bag whose slot is still ahead has nothing to count and is never late — a noon-paid 6 pm pickup", () => {
    // MUTATION: count from `createdAt` when a slot exists → 5 h and "late" on a bag nobody is waiting for.
    const a = expoAge({ arrivedAt: null, pickupSlot: iso(120), createdAt: iso(-300) }, T0);
    expect(a).toEqual({ sinceMs: 0, tone: "ok" });
  });
  it("counts from the slot once it has passed, and from payment when there is no slot", () => {
    expect(
      expoAge({ arrivedAt: null, pickupSlot: iso(-5), createdAt: iso(-300) }, T0).sinceMs,
    ).toBe(5 * 60_000);
    expect(expoAge({ arrivedAt: null, pickupSlot: null, createdAt: iso(-7) }, T0).sinceMs).toBe(
      7 * 60_000,
    );
  });
  it("a guest who has announced themselves is waiting NOW, whatever the slot says", () => {
    // MUTATION: `arrivedAt ?? pickupSlot` → `pickupSlot ?? arrivedAt` — the slot two hours ahead
    // hides a person twelve minutes into standing at the counter.
    const a = expoAge({ arrivedAt: iso(-12), pickupSlot: iso(120), createdAt: iso(-300) }, T0);
    expect(a).toEqual({ sinceMs: 12 * 60_000, tone: "warn" });
  });
  it("the tone flips AT the thresholds, not after them", () => {
    const at = (min: number) =>
      expoAge({ arrivedAt: null, pickupSlot: null, createdAt: iso(-min) }, T0).tone;
    expect(at(EXPO_TONE_MIN.warn - 1)).toBe("ok");
    expect(at(EXPO_TONE_MIN.warn)).toBe("warn");
    expect(at(EXPO_TONE_MIN.late - 1)).toBe("warn");
    // MUTATION: `>=` → `>` on the late threshold — a bag exactly twenty minutes due reads warn.
    expect(at(EXPO_TONE_MIN.late)).toBe("late");
  });
});

describe("pickedUndoOpen — the deferred picked-up write waits exactly the window (counter-1)", () => {
  it("is open until the window and closed AT it", () => {
    expect(pickedUndoOpen(1_000, 1_000 + PICKED_UNDO_MS - 1)).toBe(true);
    // MUTATION: `<` → `<=` — the tick at the boundary keeps the window open one more second.
    expect(pickedUndoOpen(1_000, 1_000 + PICKED_UNDO_MS)).toBe(false);
  });
  it("the window is a real parameter", () => {
    expect(pickedUndoOpen(0, 500, 1_000)).toBe(true);
    expect(pickedUndoOpen(0, 1_000, 1_000)).toBe(false);
  });
});
