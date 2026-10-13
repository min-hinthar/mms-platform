import { describe, expect, it } from "vitest";
import {
  boardOrderFireOr,
  boardOrderIsBag,
  boardOrderLive,
  boardOrderWindowOr,
  type BoardOrderRow,
} from "./board-orders";

/** The lifecycle audit — the wall's code column, decided as values. */
const NOW = "2026-10-13T19:00:00.000Z";
const FLOOR = "2026-10-12T19:00:00.000Z";
const at = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString();
const row = (over: Partial<BoardOrderRow> = {}): BoardOrderRow => ({
  status: "paid",
  togo_status: "preparing",
  fire_at: null,
  pickup_slot: null,
  created_at: at(-30),
  ...over,
});

describe("boardOrderLive", () => {
  it("a ready bag is live whatever its fire time; a preparing one only once it is due", () => {
    // lck/board-orders/ready-gated-on-fire-at
    expect(boardOrderLive(row({ togo_status: "ready", fire_at: at(20) }), NOW, FLOOR)).toBe(true);
    expect(boardOrderLive(row({ fire_at: at(20) }), NOW, FLOOR)).toBe(false);
    expect(boardOrderLive(row({ fire_at: at(-1) }), NOW, FLOOR)).toBe(true);
    expect(boardOrderLive(row({ fire_at: NOW }), NOW, FLOOR)).toBe(true);
  });
  it("windows by the slot when there is one, else by when it was placed", () => {
    // lck/board-orders/window-on-creation
    expect(
      boardOrderLive(row({ created_at: at(-48 * 60), pickup_slot: at(-60) }), NOW, FLOOR),
    ).toBe(true);
    expect(boardOrderLive(row({ created_at: at(-48 * 60) }), NOW, FLOOR)).toBe(false);
    expect(
      boardOrderLive(row({ created_at: at(-60), pickup_slot: at(-48 * 60) }), NOW, FLOOR),
    ).toBe(false);
  });
  it("only a PAID order, still preparing or ready", () => {
    // lck/board-orders/refunded-on-the-wall
    expect(boardOrderLive(row({ status: "refunded" }), NOW, FLOOR)).toBe(false);
    expect(boardOrderLive(row({ togo_status: "picked_up" }), NOW, FLOOR)).toBe(false);
    expect(boardOrderLive(row({ togo_status: null }), NOW, FLOOR)).toBe(false);
  });
});

describe("boardOrderIsBag", () => {
  it("one food line makes a bag; a pure basket is not; unknown lines publish", () => {
    // lck/board-orders/basket-on-the-wall · unknown-lines-hide-a-bag
    expect(boardOrderIsBag([{ fulfillment: "grocery" }])).toBe(false);
    expect(boardOrderIsBag([{ fulfillment: "grocery" }, { fulfillment: "togo" }])).toBe(true);
    expect(boardOrderIsBag([])).toBe(false);
    expect(boardOrderIsBag(undefined)).toBe(true);
  });
});

describe("the narrowing filters — a superset of the rule", () => {
  it("name the due window and the ready-or-due fire gate", () => {
    expect(boardOrderWindowOr(FLOOR)).toBe(
      `pickup_slot.gte.${FLOOR},and(pickup_slot.is.null,created_at.gte.${FLOOR})`,
    );
    expect(boardOrderFireOr(NOW)).toBe(`togo_status.eq.ready,fire_at.is.null,fire_at.lte.${NOW}`);
  });
});
