import { describe, expect, it } from "vitest";
import {
  compareExpoTickets,
  EXPO_TONE_MIN,
  expoAge,
  isScanGoBasket,
  kitchenStateOf,
  laneRows,
  paidBagCompLine,
  PICKED_UNDO_ARM_MS,
  PICKED_UNDO_MS,
  pickedUndoArmed,
  pickedUndoOpen,
  reloadForgetsAPick,
  toastPick,
  type ExpoOrderKey,
} from "./expo-rules";
import type { ExpoTicket, ExpoUnpaidBag } from "./expo-types";

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
  it("Undo is inert for the arm — a double-tap's second tap is the same gesture, not a change of mind", () => {
    // MUTATION: `return true` — the second tap of a double-tap lands on Undo and cancels the pick.
    expect(pickedUndoArmed(1_000, 1_000 + PICKED_UNDO_ARM_MS - 1)).toBe(false);
    expect(pickedUndoArmed(1_000, 1_000 + PICKED_UNDO_ARM_MS)).toBe(true);
    expect(pickedUndoArmed(0, 50, 100)).toBe(false);
  });
});

// ── Phase 2b · feedback ──
describe("toastPick — the pill shows ONLY the pick that opened it (the thumb-zone Undo)", () => {
  const pick = (committing: boolean) => ({ committing });
  it("shows the pick that opened it while its window is open", () => {
    expect(toastPick(new Map([["a", pick(false)]]), "a")).toBe("a");
  });
  it("never falls back to an older pick once its own has left — a double-tapped Undo undoes ONE bag", () => {
    // MUTATION `the-toast-falls-back-to-an-older-pick`: the pill re-labels itself with the older
    // bag still in its window, and the second tap of the Undo that just took Table 7 back takes
    // Table 3 back too.
    const older = new Map([["older", pick(false)]]);
    expect(toastPick(older, "newest")).toBeNull();
    expect(toastPick(older, null)).toBeNull();
  });
  it("a committing pick never keeps the pill — the write is in flight and Undo can do nothing", () => {
    // MUTATION `a-committing-pick-keeps-the-toast`: a write held in flight (or an outage) leaves a
    // 64px strip whose Undo refuses every tap.
    expect(toastPick(new Map([["a", pick(true)]]), "a")).toBeNull();
  });
});

describe("isScanGoBasket — the card's scan-and-go predicate, named once", () => {
  const line = (fulfillment: "togo" | "grocery") => ({ fulfillment });
  it("every line grocery is a scan-and-go basket; any food line makes it a bag", () => {
    expect(isScanGoBasket([line("grocery"), line("grocery")])).toBe(true);
    // MUTATION `scan-go-by-any-line`: a mixed bag with one grocery line reads as a basket — "Handed
    // over" on a bag of food the counter still has to hand OUT, and no kitchen badge.
    expect(isScanGoBasket([line("togo"), line("grocery")])).toBe(false);
    expect(isScanGoBasket([line("togo")])).toBe(false);
  });
});

// ── M250 ──
describe("paidBagCompLine — a comped line rides its PAID bag (the snapshot's filter, comp clause inverted)", () => {
  const row = (comped: boolean, state: string, fulfillment: string) => ({
    comped,
    state,
    fulfillment,
  });
  it("a comped to-go dish the kitchen has is on the bag", () => {
    expect(paidBagCompLine(row(true, "in_progress", "togo"))).toBe(true);
    expect(paidBagCompLine(row(true, "fired", "togo"))).toBe(true);
    expect(paidBagCompLine(row(true, "served", "togo"))).toBe(true);
  });
  it("in ANY state, and grocery too — the bag is the order, not what the kitchen has yet", () => {
    // MUTATION `comp-kitchen-only` (the row's literal `counterKitchenLine && comped`): a comp still
    // draft at payment (fire_pending_food has not run) and a comped grocery item read false — a
    // paid bag missing a dish the guest was promised, the M250 omission in a smaller form.
    expect(paidBagCompLine(row(true, "draft", "togo"))).toBe(true);
    expect(paidBagCompLine(row(true, "draft", "grocery"))).toBe(true);
    expect(paidBagCompLine(row(true, "served", "grocery"))).toBe(true);
  });
  it("an UNCOMPED line is never drawn again — it is already in the snapshot, charged", () => {
    // MUTATION `comp-admits-uncomped`: every chargeable line twice, once tagged "No charge".
    expect(paidBagCompLine(row(false, "served", "togo"))).toBe(false);
    expect(paidBagCompLine(row(false, "in_progress", "grocery"))).toBe(false);
  });
  it("a VOIDED comp is off the order, and off the bag", () => {
    // MUTATION `comp-admits-voided`: a dish taken off the order packed anyway.
    expect(paidBagCompLine(row(true, "voided", "togo"))).toBe(false);
    expect(paidBagCompLine(row(true, "voided", "grocery"))).toBe(false);
  });
  it("a DINE-IN comp stays on the table — the bag is to-go and grocery only", () => {
    // MUTATION `comp-admits-dinein`: a comped dine-in dish bagged for the counter.
    expect(paidBagCompLine(row(true, "served", "dinein"))).toBe(false);
    expect(paidBagCompLine(row(true, "draft", "dinein"))).toBe(false);
  });
});

// ── Phase 2f · P2v ──
describe("laneRows — paid and unpaid bags in the lane's ONE order", () => {
  const paid = (orderId: string, over: Partial<ExpoTicket> = {}): ExpoTicket => ({
    orderId,
    cartId: `c-${orderId}`,
    label: "reg-x",
    tableNumber: null,
    mode: "pickup",
    customerName: null,
    customerPhone: null,
    shortCode: orderId.toUpperCase(),
    status: "preparing",
    kitchen: "cooking",
    pickupSlot: null,
    arrivedAt: null,
    lines: [],
    createdAt: "2026-09-13T17:00:00Z",
    ...over,
  });
  const bag = (cartId: string, over: Partial<ExpoUnpaidBag> = {}): ExpoUnpaidBag => ({
    cartId,
    sessionId: `s-${cartId}`,
    customerName: "Aye",
    lines: [],
    moreUnits: 0,
    owes: true,
    kitchen: "done",
    sentAt: "2026-09-13T18:00:00Z",
    ...over,
  });
  const order = (rows: ReturnType<typeof laneRows>) =>
    rows.map((r) => (r.kind === "paid" ? r.t.orderId : `unpaid:${r.b.cartId}`));

  it("a kitchen-done unpaid bag sorts above a cooking paid bag, below a waiting guest", () => {
    // unpaid-bags-sink
    const rows = laneRows(
      [paid("cooking"), paid("here", { arrivedAt: "2026-09-13T18:05:00Z" })],
      [bag("u")],
    );
    expect(order(rows)).toEqual(["here", "unpaid:u", "cooking"]);
  });

  it("an unpaid bag still cooking takes its due-time place by when it was sent", () => {
    const rows = laneRows(
      [paid("late", { createdAt: "2026-09-13T18:30:00Z" })],
      [bag("u", { kitchen: "cooking", sentAt: "2026-09-13T18:10:00Z" })],
    );
    // both cooking: the earlier (the bag, sent 18:10) first
    expect(order(rows)).toEqual(["unpaid:u", "late"]);
  });

  it("no unpaid bags: the paid order is unchanged", () => {
    expect(order(laneRows([paid("a"), paid("b", { kitchen: "done" })], []))).toEqual(["b", "a"]);
  });
});

describe("reloadForgetsAPick — the lane's Reload caveat is said only when a reload can forget a pick (review b · B3)", () => {
  it("no pick held in this tab: nothing to forget", () => {
    // MUTATION (p2h-rev-b/expo-rules/reload-always-forgets): the caveat stands over every waiting
    // line — a bag write hanging with no pick anywhere still warns about picks; red.
    expect(reloadForgetsAPick(new Map())).toBe(false);
  });
  it("a pick inside its window, or committing and unconfirmed: a reload can forget it", () => {
    // MUTATION (p2h-rev-b/expo-rules/reload-never-forgets): the caveat is never said; red.
    expect(reloadForgetsAPick(new Map([["order-1", { committing: false }]]))).toBe(true);
    expect(reloadForgetsAPick(new Map([["order-1", { committing: true }]]))).toBe(true);
  });
});
