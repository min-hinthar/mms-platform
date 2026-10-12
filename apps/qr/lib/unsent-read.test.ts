import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PD10 · D5 — `readServedGateInput`, the ONE read behind create-intent's served gate.
 *
 * Two facts make it the gate it claims to be, and each is a case here:
 *  1. it FAILS CLOSED — a clock or a line read that does not answer is `null` (the decision turns
 *     that into a 503 refusal), never an empty list that would read as "nothing holds";
 *  2. the DB clock is read FIRST and AWAITED, before the lines are even asked for — a clock read
 *     after the lines could pass a bump's six seconds while the rows predate an Undo Mom sent inside
 *     them (Codex round 4). Asserted on the ORDER the scripted database sees: the line query must not
 *     START until the clock has ANSWERED.
 */

vi.mock("server-only", () => ({}));

type Res = { data: unknown; error: { message: string } | null };
let clockRes: Res;
let rowsRes: Res;
/** What the scripted database saw, in order. */
let events: string[];

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc: (name: string) => {
      events.push(`rpc:${name}:start`);
      return Promise.resolve().then(() => {
        events.push(`rpc:${name}:answered`);
        return clockRes;
      });
    },
    from: (table: string) => {
      events.push(`from:${table}`);
      const q = {
        select: () => q,
        eq: () => Promise.resolve(rowsRes),
      };
      return q;
    },
  }),
}));

const { readServedGateInput } = await import("./unsent-read");

const NOW = "2026-10-11T19:48:00.000+00:00";
const ROWS = [
  { state: "served", fulfillment: "dinein", fire_at: NOW, bumped_at: NOW },
  { state: "in_progress", fulfillment: "togo", fire_at: NOW, bumped_at: null },
];

beforeEach(() => {
  clockRes = { data: NOW, error: null };
  rowsRes = { data: ROWS, error: null };
  events = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readServedGateInput — the served gate's read (PD10 · D5)", () => {
  it("answers the cart's lines and the DB clock", async () => {
    expect(await readServedGateInput("c-1")).toEqual({ lines: ROWS, nowIso: NOW });
  });

  it("reads the DB clock FIRST — the lines are not even asked for until it has answered", async () => {
    // MUTATION (unsent-read/served-gate-clock-after-rows): the lines read first, the clock after —
    // `now` can then pass a bump's undo window that the rows predate; red.
    await readServedGateInput("c-1");
    expect(events).toEqual(["rpc:mms_now:start", "rpc:mms_now:answered", "from:qr_cart_items"]);
  });

  it("FAILS CLOSED when the lines cannot be read — null, never an empty list read as 'nothing holds'", async () => {
    // MUTATION (unsent-read/served-gate-rows-fail-open): a failed line read answered with no lines —
    // the gate sees an empty bill and opens the door on a read blip; red.
    rowsRes = { data: null, error: { message: "canceling statement due to statement timeout" } };
    expect(await readServedGateInput("c-1")).toBeNull();
  });

  it("FAILS CLOSED when the clock cannot be read — never this server's clock in its place", async () => {
    // MUTATION (unsent-read/served-gate-clock-fails-open): the app clock substituted — a gate about
    // the DB clock decided on another one (a skew decides whether Mom's undo has passed); red.
    clockRes = { data: null, error: { message: "connection reset" } };
    expect(await readServedGateInput("c-1")).toBeNull();
    expect(events).not.toContain("from:qr_cart_items");
    // A clock that answers something that is not a time is unreadable too.
    clockRes = { data: "soon", error: null };
    expect(await readServedGateInput("c-1")).toBeNull();
  });
});
