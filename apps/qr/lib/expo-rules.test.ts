import { describe, expect, it } from "vitest";
import { compareExpoTickets, kitchenStateOf, type ExpoOrderKey } from "./expo-rules";

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
