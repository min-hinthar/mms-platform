/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import type { TrackedOrder } from "@/lib/track-order";
import type { OrderKitchenView } from "@/lib/useOrderKitchen";

/**
 * Lifecycle audit (2026-10-13) — /track's WIRING for the post-order stream (the T18 rule: the rules
 * are pinned by value in lib/order-kitchen.test.ts, lib/track-settled.test.ts and lib/live-order.test.ts;
 * this pins that the tracker obeys them):
 *   A — the settled dine-in card draws the paid table's dishes on the kitchen track;
 *   C — a refunded order never reads "Paid in full", whatever `status` says;
 *   G — the rail's "In the kitchen" never claims Cooking before the kitchen started;
 *   H — the settled foot names where the receipt lives (a counter order is in no history);
 *   B — the pickup page is handed the bag's kitchen state.
 * Everything the tracker reaches over the network is a mock; the live read is the order under test.
 */
let live: TrackedOrder | null = null;
vi.mock("@/lib/useOrderStatus", () => ({
  useOrderStatus: () => ({ order: live, timedOut: false, refresh: () => {}, stale: false }),
}));
let kitchen: OrderKitchenView = { status: "off" };
const kitchenAsked: (string | null)[] = [];
vi.mock("@/lib/useOrderKitchen", () => ({
  useOrderKitchen: (orderId: string | null) => {
    kitchenAsked.push(orderId);
    return orderId ? kitchen : { status: "off" };
  },
}));
vi.mock("@/lib/orders", () => ({
  getMyOrderFallback: () => new Promise(() => {}),
  getSettleVerdict: () => new Promise(() => {}),
}));
vi.mock("@/lib/rewards", () => ({ getRewardsProgress: () => Promise.resolve(null) }));
vi.mock("@/lib/useConnectionTruth", () => ({
  useConnectionTruth: () => ({ truth: "unknown", diagnose: () => Promise.resolve() }),
}));
const noted: { pickupSlot: string | null }[] = [];
const noteTrackedOrder = (info: { pickupSlot: string | null }) => {
  noted.push(info);
};
vi.mock("./ActiveOrderProvider", () => ({
  useActiveOrder: () => ({ clearOrder: () => {}, noteTrackedOrder }),
}));
vi.mock("@mms/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@mms/ui")>()),
  useAnimationPreference: () => ({ shouldAnimate: false }),
  useInView: () => ({ ref: () => {}, inView: false }),
}));
vi.mock("./nav/TransitionNav", () => ({
  TransitionLink: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
let linkMinted = false;
vi.mock("./ReceiptActions", () => ({
  ReceiptActions: ({ onLinked }: { onLinked?: (l: boolean) => void }) => {
    useEffect(() => onLinked?.(linkMinted), [onLinked]);
    return null;
  },
}));
const pickupProps: { kitchen?: unknown }[] = [];
vi.mock("./PickupPromise", () => ({
  PickupPromise: (p: { kitchen?: unknown }) => {
    pickupProps.push(p);
    return <p data-pickup />;
  },
}));
vi.mock("./PaySuccess", () => ({ PaySuccess: () => null }));
vi.mock("./GoodbyeBeat", () => ({ GoodbyeBeat: () => null }));
vi.mock("./FeedbackPrompt", () => ({ FeedbackPrompt: () => null }));
vi.mock("./SaveStarsPrompt", () => ({ SaveStarsPrompt: () => null }));
vi.mock("./PaperAmbient", () => ({ PaperAmbient: () => null }));
vi.mock("./useSaveStarsAsk", () => ({
  useSaveStarsAsk: () => ({ asked: false, decline: () => {} }),
}));

const { OrderTracker } = await import("./OrderTracker");

const ORDER_ID = "0b6c1e58-0000-4000-8000-0000000a1b2c";
function dineIn(over: Partial<TrackedOrder> = {}): TrackedOrder {
  return {
    id: ORDER_ID,
    status: "paid",
    totalCents: 4200,
    itemCount: 3,
    pickupSlot: null,
    fireAt: null,
    togoStatus: null,
    hasTogoFood: false,
    hasDineInFood: true,
    arrivedAt: null,
    hasGrocery: false,
    tableNumber: 7,
    lines: [],
    breakdown: {
      subtotalCents: 3800,
      discountCents: 0,
      serviceChargeCents: 0,
      taxCents: 400,
      tipCents: 0,
    },
    refund: { state: "none", refundedCents: 0, netPaidCents: 4200 },
    dropped: { count: 0, lines: [] },
    tender: "cash",
    createdAt: "2026-10-13T18:00:00.000Z",
    customerName: null,
    togoReadyAt: null,
    togoPickedUpAt: null,
    ...over,
  };
}
const NOW = "2026-10-13T19:00:00.000Z";
const mount = () =>
  render(<OrderTracker paymentIntent={null} orderId={ORDER_ID} processing={false} counterPaid />);
const region = (c: HTMLElement) => c.querySelector('[role="status"]')?.textContent ?? "";

beforeEach(() => {
  live = null;
  kitchen = { status: "off" };
  kitchenAsked.length = 0;
  pickupProps.length = 0;
  noted.length = 0;
  linkMinted = false;
});
afterEach(cleanup);

describe("C — a refunded order never reads 'Paid in full'", () => {
  it("a CASH refund to the last cent (status still 'paid') takes the refund arm, in cash words", () => {
    live = dineIn({ refund: { state: "full", refundedCents: 4200, netPaidCents: 0 } });
    const { container } = mount();
    // RED when the arm is keyed on `status === 'refunded'`: the settled card says "Paid in full".
    expect(container.textContent).toContain("Your money was handed back.");
    expect(container.textContent).not.toMatch(/Paid in full/);
    expect(container.textContent).not.toMatch(/business days/);
    expect(region(container)).toContain("handed back to you in cash");
  });

  it("a PICKUP refunded in full while status still reads 'paid' gets the refund arm AND the region", () => {
    live = dineIn({
      hasDineInFood: false,
      hasTogoFood: true,
      tableNumber: null,
      togoStatus: "preparing",
      tender: "card",
      pickupSlot: "2026-10-13T19:20:00.000Z",
      refund: { state: "full", refundedCents: 4200, netPaidCents: 0 },
    });
    const { container } = mount();
    expect(container.textContent).toContain("Your money is on its way back.");
    // RED when the pickup page still claims the view: it suppresses the region and the heading, and
    // the refund arm renders mute — "refunded" never reaches a screen reader.
    expect(region(container)).toContain("This order was refunded");
    expect(container.querySelector("[data-pickup]")).toBeNull();
  });

  it("a PARTIAL refund keeps the settled card, which says so — card and region alike", () => {
    live = dineIn({ refund: { state: "partial", refundedCents: 1400, netPaidCents: 2800 } });
    const { container } = mount();
    expect(container.querySelector('[aria-label="Order paid"]')?.textContent).toContain(
      "Partly refunded · Cash",
    );
    expect(region(container)).toContain("Partly refunded · Cash");
    expect(container.textContent).not.toMatch(/Paid in full/);
  });
});

describe("A — the settled table's dishes on the kitchen track", () => {
  it("asks the kitchen for THIS order and draws each dish at its stage", () => {
    live = dineIn();
    kitchen = {
      status: "ready",
      nowIso: NOW,
      lines: [
        {
          id: "l1",
          name: "Mohinga",
          qty: 2,
          lineState: "in_progress",
          fireAt: "2026-10-13T18:40:00.000Z",
          bumpedAt: null,
          fulfillment: "dinein",
        },
        {
          id: "l2",
          name: "Milk Tea",
          qty: 1,
          lineState: "served",
          fireAt: "2026-10-13T18:40:00.000Z",
          bumpedAt: "2026-10-13T18:50:00.000Z",
          fulfillment: "dinein",
        },
      ],
    };
    const { container } = mount();
    expect(kitchenAsked.at(-1)).toBe(ORDER_ID);
    const list = container.querySelector("ul[aria-labelledby]");
    // RED without the list: "your server will take it from here" while the wall draws them Cooking.
    expect(list?.textContent).toContain("Mohinga");
    expect(list?.textContent).toContain("Cooking");
    expect(list?.textContent).toContain("Served");
    expect(list?.querySelectorAll("li")).toHaveLength(2);
  });

  it("says it is checking while the first read is out, and never invents a stage on failure", () => {
    live = dineIn();
    kitchen = { status: "loading" };
    const loading = mount();
    expect(loading.container.textContent).toContain("Checking with the kitchen…");
    cleanup();
    kitchen = { status: "unreadable" };
    const gone = mount();
    expect(gone.container.textContent).not.toMatch(/Cooking|Served|Checking/);
    expect(gone.container.textContent).toContain("your server will take it from here");
  });
});

describe("G — the rail's 'In the kitchen' claims Cooking only after the kitchen started", () => {
  const togo = (over: Partial<TrackedOrder> = {}) =>
    dineIn({
      hasDineInFood: false,
      hasTogoFood: true,
      tableNumber: null,
      togoStatus: "preparing",
      tender: "card",
      ...over,
    });
  const kitchenStep = (c: HTMLElement) =>
    [...c.querySelectorAll('ul[aria-label="Order status"] li')][1]?.textContent ?? "";

  it("reads 'Sent to kitchen' while nobody has tapped Start (and while the read is unknown)", () => {
    live = togo();
    const { container } = mount();
    // RED with the old constant: "Cooking" lit at payment, before the wok was touched.
    expect(kitchenStep(container)).toContain("Sent to kitchen");
    expect(kitchenStep(container)).not.toContain("Cooking");
    expect(kitchenAsked.at(-1)).toBe(ORDER_ID);
  });

  it("reads 'Cooking' once Mom's Start lands on a to-go line", () => {
    live = togo();
    kitchen = {
      status: "ready",
      nowIso: NOW,
      lines: [
        {
          id: "b",
          name: "Mohinga",
          qty: 1,
          lineState: "in_progress",
          fireAt: "2026-10-13T18:40:00.000Z",
          bumpedAt: null,
          fulfillment: "togo",
        },
      ],
    };
    const { container } = mount();
    expect(kitchenStep(container)).toContain("Cooking");
  });
});

describe("B — the pickup page is handed the bag's kitchen state", () => {
  it("passes `done` once every to-go dish is Served", () => {
    live = dineIn({
      hasDineInFood: false,
      hasTogoFood: true,
      tableNumber: null,
      togoStatus: "preparing",
      tender: "card",
      pickupSlot: "2026-10-13T19:20:00.000Z",
    });
    kitchen = {
      status: "ready",
      nowIso: NOW,
      lines: [
        {
          id: "b",
          name: "Mohinga",
          qty: 1,
          lineState: "served",
          fireAt: "2026-10-13T18:40:00.000Z",
          bumpedAt: "2026-10-13T18:50:00.000Z",
          fulfillment: "togo",
        },
      ],
    };
    mount();
    expect(pickupProps.at(-1)?.kitchen).toBe("done");
  });
});

describe("H — the settled foot names where the receipt lives", () => {
  it("a COUNTER order points at the receipt link once it rendered — never the order history", async () => {
    live = dineIn({ tender: "cash" });
    linkMinted = true;
    const { container, findByText } = mount();
    await findByText("Your table’s all settled — keep your receipt with the link above.");
    expect(container.textContent).not.toContain("lives in your order history");
  });

  it("a counter order whose link did not render says only what is true", async () => {
    live = dineIn({ tender: "terminal" });
    const { findByText } = mount();
    await findByText("Your table’s all settled.");
  });

  it("a CARD order's receipt lives in the order history, as before", async () => {
    live = dineIn({ tender: "card" });
    const { findByText } = mount();
    await findByText("Your table’s all settled — this receipt lives in your order history.");
  });
});

describe("F — the landed order is noted on the device's pointer (the blind pass on #359)", () => {
  it("notes a DINE-IN order (no slot) as landed once its row is on screen", () => {
    live = dineIn();
    mount();
    // RED when only a pickup slot is noted: the pill's later empty read after a clear then reads as
    // the webhook race, and the pointer lives out its TTL saying "Placed".
    expect(noted).toContainEqual({ pickupSlot: null });
  });

  it("notes nothing before the order lands", () => {
    live = null;
    mount();
    expect(noted).toEqual([]);
  });
});
