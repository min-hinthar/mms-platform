import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M119 (d) — an unreadable catalog read made the OFFLINE QUEUE throw the shopper's scan away.
 *
 * `scanAdd` looked the barcode up and, on no row, answered `unknown_barcode`:
 *
 *     const { data: item } = await db.from("grocery_items").select(…).eq("barcode", …).maybeSingle();
 *     if (!item) return { ok: false, reason: "unknown_barcode", barcode: input.barcode };
 *
 * The `{ error }` was DISCARDED, so a transport failure produced `item === null` and the same
 * verdict — the page flashes `Not found: <barcode> — try searching by name` at a shopper holding a
 * real product.
 *
 * ── Why this is a wrong OUTCOME, not just a wrong sentence ─────────────────────────────────────
 * `grocery-queue.ts` classifies replays, and `unknown_barcode` is in its REJECT_REASONS set:
 *
 *     const REJECT_REASONS = new Set(["unknown_barcode", "unavailable", "weighed_item"]);
 *     if (REJECT_REASONS.has(result.reason)) return "rejected";   // dequeue + tell the shopper
 *     …
 *     return "retry";                                            // locked / settling / unreadable
 *
 * So a blip during a reconnect drain does not merely mislabel the scan — it **permanently discards**
 * it. The queue's own fall-through comment names `unreadable` as the retry bucket; the catalog read
 * just never produced it. The sweep filed this as a fabricated diagnosis; it is worse than that.
 *
 * ── Why `unreadable` is the right answer and needs nothing else changed ────────────────────────
 * `ScanAddFailure` already includes `CartUnavailable`, whose `unreadable` variant is documented as
 * "a failed read… the caller must offer Retry and MUST NOT offer to start a fresh basket".
 * `isTerminal("unreadable")` is false, `classifyReplay` falls through to `retry`, and
 * `app/grocery/page.tsx`'s final `else` already renders honest transient copy for it. The right
 * answer was already in the codebase; this one read wasn't using it.
 */

vi.mock("server-only", () => ({}));

const CART = "00000000-0000-0000-0000-0000001190dd";
const BARCODE = "0123456789012";

let itemRow: Record<string, unknown> | null = null;
let itemError: { message: string } | null = null;

vi.mock("@mms/db/schemas", () => ({
  scanInput: { parse: (v: unknown) => v },
  grocerySearchInput: { parse: (v: unknown) => v },
  cartViewInput: { parse: (v: unknown) => v },
}));
vi.mock("./authz", () => ({
  assertCartMember: () =>
    Promise.resolve({ uid: "u1", sessionId: "s1", locked: false, settling: false, mode: "scango" }),
}));
vi.mock("./rate", () => ({ assertMutationRate: () => Promise.resolve() }));
vi.mock("./cart-failure", () => ({ whyCartUnavailable: () => Promise.resolve("unreadable") }));
vi.mock("./tax", () => ({ lineTax: () => 0 }));
vi.mock("./order-lines", () => ({
  insertOrIncLine: () => Promise.resolve({ ok: true }),
  touchCart: () => Promise.resolve(),
}));
vi.mock("./media-url", () => ({ safeImageUrl: (u: string) => u }));
vi.mock("@mms/db/server", () => ({
  publicClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
  }),
  serviceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        maybeSingle: () => Promise.resolve({ data: itemRow, error: itemError }),
        then: (r: (v: { data: unknown; error: unknown }) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(r),
      };
      return chain;
    },
  }),
}));

const { scanAdd } = await import("./grocery");

beforeEach(() => {
  itemRow = null;
  itemError = null;
});

describe("M119d — an unreadable catalog read must not read as 'no such barcode'", () => {
  it("THE DEFECT — a failed read must not answer unknown_barcode (the queue discards that)", async () => {
    itemRow = null;
    itemError = { message: "transport failure" };
    const res = await scanAdd(CART, BARCODE);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).not.toBe("unknown_barcode");
      // …and it must be a reason the offline queue RETRIES rather than rejects.
      expect(res.reason).toBe("unreadable");
    }
  });

  it("a genuinely absent barcode still answers unknown_barcode — the honest case is untouched", async () => {
    itemRow = null;
    itemError = null;
    const res = await scanAdd(CART, BARCODE);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unknown_barcode");
  });
});

describe("M119d — the queue's own classifier agrees, which is the point", async () => {
  const { classifyReplay } = await import("./grocery-queue");
  it("unknown_barcode is REJECTED (dequeued forever) — why the mislabel destroys a scan", () => {
    expect(classifyReplay({ ok: false, reason: "unknown_barcode" })).toBe("rejected");
  });
  it("unreadable is RETRIED — the bucket the failed read should have landed in", () => {
    expect(classifyReplay({ ok: false, reason: "unreadable" })).toBe("retry");
  });
});
