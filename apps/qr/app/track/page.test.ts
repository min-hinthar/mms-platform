import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

/**
 * Lifecycle audit (2026-10-13), I — /track's cart branch (`?cart=…&paid=1`: the counter and the split
 * landing) passed `justPaid` UNCONDITIONALLY, so every resume through the pill, the tray, /account
 * Today or the home card replayed the arrival: "Paid — thank you!", the receipt's print-on, the
 * goodbye beat — and in a fresh tab the confetti, the haptic and the chime. A resume now carries
 * `resume=1` on both branches (lib/live-order `liveOrderTrackHref`) and this page honours it on both.
 * The page is rendered as the server component it is; the tracker is a stub whose props are read.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/components/OrderTracker", () => ({ OrderTracker: () => null }));
vi.mock("@/components/nav/TransitionNav", () => ({ TransitionLink: () => null }));
vi.mock("@/components/ReceiptCard", () => ({ ReceiptCard: () => null }));
vi.mock("@/components/PrintReceiptButton", () => ({ PrintReceiptButton: () => null }));
vi.mock("@/components/PaperAmbient", () => ({ PaperAmbient: () => null }));
let ref: { id: string; counter: boolean } | null = {
  id: "11111111-1111-4111-8111-111111111111",
  counter: true,
};
vi.mock("@/lib/order", () => ({ getCartOrderRef: () => Promise.resolve(ref) }));
vi.mock("@/lib/receipt-entry", () => ({ getReceiptEntry: () => Promise.resolve(null) }));
vi.mock("@/lib/receipt-token", () => ({ resolveReceiptOrder: () => Promise.resolve(null) }));
vi.mock("@/lib/manual-capture-mode", () => ({
  awaitingManualCapture: () => Promise.resolve(false),
}));

const { default: Track } = await import("./page");

type TrackerProps = { justPaid?: boolean; resume?: boolean; counterPaid?: boolean };
const tracker = async (params: Record<string, string>) =>
  (await Track({ searchParams: Promise.resolve(params) })) as ReactElement<TrackerProps>;

describe("/track — a resume is not an arrival, on the cart branch too", () => {
  beforeEach(() => {
    ref = { id: "11111111-1111-4111-8111-111111111111", counter: true };
  });

  it("the counter's own landing is an arrival", async () => {
    const el = await tracker({ cart: "c1", paid: "1" });
    expect(el.props.justPaid).toBe(true);
    expect(el.props.resume).toBe(false);
    expect(el.props.counterPaid).toBe(true);
  });

  it("a resume of the same URL is NOT — no thank-you, no confetti, no chime", async () => {
    const el = await tracker({ cart: "c1", paid: "1", resume: "1" });
    // RED with the unconditional `justPaid`.
    expect(el.props.justPaid).toBe(false);
    expect(el.props.resume).toBe(true);
  });

  it("the single-pay branch keeps its own rule, and tells the tracker it is a resume", async () => {
    const back = await tracker({ payment_intent: "pi_1", redirect_status: "succeeded" });
    expect(back.props.justPaid).toBe(true);
    const resumed = await tracker({
      payment_intent: "pi_1",
      redirect_status: "succeeded",
      resume: "1",
    });
    expect(resumed.props.justPaid).toBe(false);
    expect(resumed.props.resume).toBe(true);
  });
});

/** Every `href` in a server-rendered element tree (the links are stubs; their props are the record). */
function hrefs(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(hrefs);
  const props = (node as { props?: { href?: unknown; children?: unknown } }).props;
  if (!props) return [];
  return [...(typeof props.href === "string" ? [props.href] : []), ...hrefs(props.children)];
}

describe("/track — the interstitial's Refresh keeps the visit's kind (the blind pass on #359)", () => {
  it("a RESUME's Refresh stays a resume — one tap must not replay the arrival", async () => {
    ref = null; // the split's order is not stamped yet: the "Payment received" interstitial
    const el = await Track({
      searchParams: Promise.resolve({ cart: "c1", paid: "1", resume: "1" }),
    });
    // RED with the hand-built `/track?cart=…&paid=1`: the store re-captures and the confetti replays.
    expect(hrefs(el)).toContain("/track?cart=c1&paid=1&resume=1");
  });

  it("an ARRIVAL's Refresh stays an arrival", async () => {
    ref = null;
    const el = await Track({ searchParams: Promise.resolve({ cart: "c1", paid: "1" }) });
    expect(hrefs(el)).toContain("/track?cart=c1&paid=1");
    expect(hrefs(el)).not.toContain("/track?cart=c1&paid=1&resume=1");
  });
});
