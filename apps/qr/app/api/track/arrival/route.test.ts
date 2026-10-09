import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArrivalWrite } from "@/lib/arrival";
import { actionOutcome, pendingArrivalCleared, routeOutcome } from "@/lib/arrival-pending";

/**
 * PD3 (blind pass on #330) — the route's status mapping IS the keep/clear contract the next-visit
 * reconcile reads (`routeOutcome`): a 200 or a 400 retires the pending arrival, a 429 or a 5xx keeps
 * it for a retry. So the mapping is pinned END TO END: for every answer `stampArrival` can give, the
 * route's response read through the client's own `routeOutcome` must keep or clear the record
 * exactly as the in-page action's answer does (`actionOutcome`) — the two delivery paths of one
 * arrival can never disagree about whether it was heard. verify:slice: track-arrival-route/*.
 */
vi.mock("server-only", () => ({}));
let answer: () => Promise<ArrivalWrite>;
vi.mock("@/lib/arrival", () => ({ stampArrival: () => answer() }));

const { POST } = await import("./route");
const req = (text: string) =>
  ({ text: () => Promise.resolve(text) }) as unknown as Parameters<typeof POST>[0];
const ORDER = JSON.stringify({ orderId: "0b6c1e58-0000-4000-8000-00000000abcd" });

beforeEach(() => {
  answer = () => Promise.resolve({ ok: true });
});

/** The route's status for EVERY answer `stampArrival` can give. `satisfies` makes the table
 *  exhaustive by type (the second blind pass on #330): a reason added to `ArrivalWrite` without a row
 *  here is a typecheck error, and so is a row for a reason that no longer exists — a hand-kept list
 *  went stale silently. */
type Answer = "ok" | Extract<ArrivalWrite, { ok: false }>["reason"];
const STATUS = {
  ok: 200,
  unauthorized: 200,
  not_today: 200,
  too_early: 200,
  collected: 200,
  closed: 200,
  rate: 429,
  failed: 500,
} satisfies Record<Answer, number>;
const answerOf = (k: Answer): ArrivalWrite =>
  k === "ok" ? { ok: true } : { ok: false, reason: k };
const EVERY = (Object.keys(STATUS) as Answer[]).map(answerOf);

describe("POST /api/track/arrival — the status IS the keep/clear contract", () => {
  it("maps rate → 429, failed → 500 and every decided answer → 200", async () => {
    // MUTATION: map `rate` / `failed` to 200 — the reconcile retires an arrival nobody heard.
    for (const k of Object.keys(STATUS) as Answer[]) {
      answer = () => Promise.resolve(answerOf(k));
      expect([k, (await POST(req(ORDER))).status]).toEqual([k, STATUS[k]]);
    }
  });

  it("for EVERY answer, the route's response keeps or clears the record exactly as the in-page answer does", async () => {
    for (const a of EVERY) {
      answer = () => Promise.resolve(a);
      const res = await POST(req(ORDER));
      const viaRoute = pendingArrivalCleared(routeOutcome(res.status, await res.json()));
      const viaAction = pendingArrivalCleared(actionOutcome(a));
      expect([a, viaRoute]).toEqual([a, viaAction]);
    }
  });

  it("a thrown read is no answer (500); a malformed body is a decided refusal (400)", async () => {
    answer = () => Promise.reject(new Error("db unreachable"));
    const thrown = await POST(req(ORDER));
    // MUTATION: answer a throw 200 — an outage would retire every pending arrival it touched.
    expect(thrown.status).toBe(500);
    expect(pendingArrivalCleared(routeOutcome(thrown.status, await thrown.json()))).toBe(false);
    const malformed = await POST(req("{not json"));
    expect(malformed.status).toBe(400);
    expect(pendingArrivalCleared(routeOutcome(malformed.status, await malformed.json()))).toBe(
      true,
    );
  });
});
