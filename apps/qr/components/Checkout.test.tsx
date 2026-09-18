/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem, CartTotals } from "@mms/db";
import type { getCartView } from "@/lib/cart";

/**
 * M227 — the WIRING of /cart's refusal explanation, which until this file nothing could see.
 *
 * `classifyRefusedWrite` / `refusedWriteNotice` / `explanationHolds` / `freezeBannerSuppressed` are
 * each pinned in `lib/`, and `readTicketed` is pinned in `view-seq.test.ts`. What was unpinned is
 * every line that CALLS them — `explainRefusal`, `latchExplained`, the catch arm in `changeQty` that
 * routes through them, and the two suppression/clear sites on the lock edge. All of it lives in
 * `Checkout.tsx`, a 3,000-line component that until M224 had no suite at all and sat outside
 * `check-money-coverage`'s `MONEY_PATHS` by suffix. Restoring the comment-only `catch { }` — the
 * exact defect M224 filed — would have left the whole gate green.
 *
 * ## The mocks, and why each is unavoidable
 *
 * TWO are hard import-time blockers: `server-only` throws from its main entry and this module
 * reaches it through `@/lib/cart` and `@/lib/counter-pay` (both `"use server"` → `@mms/db/server`).
 * The rest are CHILD components stubbed to `null` so a cart page can mount in jsdom at all — they
 * own Stripe Elements, a Supabase channel, an `IntersectionObserver` and an unguarded
 * `window.matchMedia` between them, and none of them is what this file is about.
 *
 * THREE are the seams the fixtures steer: `@/lib/cart` supplies `setQty`'s refusal and the
 * `getCartView` the diagnosis reads, `@/lib/realtime` would otherwise open a channel, and
 * `@/lib/useAnonSession` would fetch a session token.
 *
 * `@mms/ui` is left REAL: the diner reaches `changeQty` by pressing the shared `Stepper`'s "+", and
 * a stub of it would guard a call this screen might no longer be making. Everything is observed
 * through the review step's ONE live region (`role="status"`) — never by reaching into an internal.
 */

const h = vi.hoisted(() => ({
  getCartView: vi.fn(),
  setQty: vi.fn(),
  setLineFulfillment: vi.fn(),
  makeItNow: vi.fn(),
  releasePayLock: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/cart", () => ({
  applyPromo: vi.fn(),
  getCartView: h.getCartView,
  makeItNow: h.makeItNow,
  releasePayLock: h.releasePayLock,
  setLineFulfillment: h.setLineFulfillment,
  setQty: h.setQty,
}));
vi.mock("@/lib/counter-pay", () => ({
  counterPayOutcome: vi.fn(async () => ({ kind: "open" })),
  requestCounterPay: vi.fn(),
  withdrawCounterPay: vi.fn(),
}));
vi.mock("@/lib/realtime", () => ({ useCartRealtime: () => {} }));
// `@mms/ui` stays REAL except for ONE export: `NumberFlow` re-exports `@number-flow/react`, which
// drives a custom element jsdom does not register (`this.el?.willUpdate is not a function` at
// commit). The animated digits are not what this file guards, and `Stepper` — which IS — keeps its
// real implementation, so the "+" this suite presses is the button production renders.
vi.mock("@mms/ui", async (orig) => ({
  ...(await orig<typeof import("@mms/ui")>()),
  NumberFlow: ({ value }: { value: number }) => <span>{value}</span>,
}));
vi.mock("@/lib/useAnonSession", () => ({
  useAnonSession: () => ({ anon: null, loading: false }),
}));
vi.mock("@/lib/useRewardsBadge", () => ({ useRewardsBadge: () => null }));
vi.mock("./nav/TransitionNav", () => ({
  TransitionLink: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  useJourneyRouter: () => ({ push: h.push, replace: h.push, back: h.push }),
}));
vi.mock("./PayAtCounter", () => ({
  CounterSettledCard: () => null,
  PayAtCounterButton: () => null,
  PayAtCounterCard: () => null,
}));
vi.mock("./PaymentSection", () => ({ PaymentSection: () => null }));
vi.mock("./SplitSection", () => ({ SplitSection: () => null }));
vi.mock("./SettlementBoard", () => ({ SettlementBoard: () => null }));
vi.mock("./TableTimeline", () => ({ TimelineStrip: () => null }));
vi.mock("./SendToKitchenButton", () => ({ SendToKitchenButton: () => null }));
vi.mock("./SecureTabButton", () => ({ SecureTabButton: () => null }));
vi.mock("./RewardField", () => ({ RewardField: () => null }));
vi.mock("./PickupWhenChoice", () => ({ PickupWhenChoice: () => null }));
vi.mock("./PaperAmbient", () => ({ PaperAmbient: () => null }));
vi.mock("./WalletChip", () => ({ WalletChip: () => null }));
vi.mock("./menu/BlurUpImage", () => ({ BlurUpImage: () => null }));
vi.mock("./menu/PhotoPlaceholder", () => ({ PhotoPlaceholder: () => null }));

const { Checkout } = await import("./Checkout");

const CART = "cart-1";
const MY_SEAT = "seat-me";
const PEER_SEAT = "seat-peer";
const LINE = "line-mohinga";

const ITEM: CartItem = {
  id: LINE,
  menuItemId: "menu-mohinga",
  name: "Mohinga",
  qty: 1,
  modifiers: [],
  unitPriceCents: 1200,
  taxCents: 0,
  lineState: "draft",
  fulfillment: "dinein",
};

const TOTALS: CartTotals = {
  subtotalCents: 1200,
  discountCents: 0,
  rewardCents: 0,
  rewardFaceCents: 0,
  promoCents: 0,
  serviceChargeCents: 0,
  taxCents: 0,
  tipCents: 0,
  totalCents: 1200,
};

type View = Awaited<ReturnType<typeof getCartView>>;

/** A server view: everything unfrozen unless a case says otherwise. */
function view(over: Partial<View> = {}): View {
  return {
    items: [ITEM],
    totals: TOTALS,
    pickupSlot: null,
    fireAt: null,
    settling: false,
    locked: false,
    lockedBy: null,
    mySeat: MY_SEAT,
    tabType: "none",
    counterRequestedAt: null,
    ...over,
  } as View;
}

/** The review step's single live region, as a screen reader would read it. */
function regionText(): string {
  const regions = screen.getAllByRole("status");
  return regions.map((r) => r.textContent ?? "").join(" | ");
}

function mount(props: Partial<Parameters<typeof Checkout>[0]> = {}) {
  return render(
    <Checkout
      cartId={CART}
      initialItems={[ITEM]}
      initialTotals={TOTALS}
      initialMySeat={MY_SEAT}
      {...props}
    />,
  );
}

/**
 * Make the screen re-read the server, the way a backgrounded phone does on return.
 *
 * ⚠️ THERE IS NO MOUNT-TIME READ on this screen, and every fixture that needs a server-driven flip
 * goes through here because of it: `Checkout` seeds `locked` / `settling` / `mySeat` from PROPS and
 * calls `refresh()` only from a handler, the J3 visibility backstop, the T20 re-check timer, or a
 * realtime echo. Re-rendering with a different `initialLocked` changes nothing — the prop only seeds
 * `useState`. The visibility path is the one that needs no timer and no channel.
 */
async function syncFromServer() {
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/** Press the stepper's "+" for the one line, and let the chained write + diagnosis settle. */
async function addOne() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
  });
}

/**
 * A dine-in table of two, which is what makes the for-here/to-go pills and "Make it now" render at
 * all (`isDineIn && fulfillment !== "grocery" && lineState === "draft" && canEdit`).
 */
const DINE_IN = {
  mode: "dinein",
  myRole: "host",
  mySeat: MY_SEAT,
  members: [
    { seat: MY_SEAT, name: "Me" },
    { seat: PEER_SEAT, name: "Tin" },
  ],
} as unknown as Parameters<typeof Checkout>[0]["splitContext"];

async function press(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getCartView.mockResolvedValue(view());
  h.setQty.mockResolvedValue(view());
  h.setLineFulfillment.mockResolvedValue({ ok: true });
  h.makeItNow.mockResolvedValue({ ok: true });
});

afterEach(() => cleanup());

describe("M224 — a refused cart edit says why", () => {
  it("names the peer lock instead of snapping the number back in silence", async () => {
    // The window the defect lives in: the peer's lock has not reached this phone yet, so the
    // stepper is live and the write goes out. The server refuses on bare `locked`; the diagnosis
    // read is the first thing here that learns about the lock.
    h.setQty.mockRejectedValueOnce(new Error("Order is locked while someone checks out"));
    h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
    mount();
    await addOne();
    await waitFor(() =>
      expect(regionText()).toContain(
        "That didn’t go through — the order’s locked while someone checks out",
      ),
    );
  });

  it("names the SETTLE freeze when that is what the re-read found", async () => {
    h.setQty.mockRejectedValueOnce(new Error("The table is settling up"));
    h.getCartView.mockResolvedValue(view({ settling: true }));
    mount();
    await addOne();
    // The clause comes from `inertReason`, which is also what the Add pills on /menu render — so the
    // two surfaces cannot tell one cart two stories.
    await waitFor(() =>
      expect(regionText()).toContain(
        "That didn’t go through — the order’s locked while your table pays",
      ),
    );
  });

  it("hedges when the re-read finds no freeze at all — it never invents one", async () => {
    // `unknown`: the write was refused and the cart looks editable. The opener must not assert a
    // verdict the server never stated (the M116/T14 fabricated-diagnosis class).
    h.setQty.mockRejectedValueOnce(new Error("Cart is no longer open"));
    h.getCartView.mockResolvedValue(view());
    mount();
    await addOne();
    await waitFor(() => expect(regionText()).toContain("We couldn’t confirm that"));
  });

  it("says NOTHING when the diagnosis read never reached the server (T30)", async () => {
    // `unreachable` is not publishable: a read that failed establishes only that we cannot see the
    // cart. The optimistic number has already reverted, which is the honest floor.
    h.setQty.mockRejectedValueOnce(new Error("refused"));
    h.getCartView.mockRejectedValue(new Error("offline"));
    mount();
    await addOne();
    await act(async () => {});
    expect(regionText()).not.toContain("didn’t go through");
    expect(regionText()).not.toContain("couldn’t confirm");
  });

  it("stays silent when the write is ACCEPTED", async () => {
    mount();
    await addOne();
    await act(async () => {});
    expect(regionText()).not.toContain("didn’t go through");
    expect(regionText()).not.toContain("couldn’t confirm");
    expect(h.setQty).toHaveBeenCalledWith(LINE, 2);
  });
});

describe("T33 on /cart — the banner must not overwrite the refusal", () => {
  it("keeps the refusal's sentence when the same read flips the lock on", async () => {
    // This is the collision, and it is the whole reason the arbitration was ported: the re-read that
    // DIAGNOSES the refusal is the read that flips `locked`, so the lock-edge effect fires in the
    // very commit the sentence lands in. Without `freezeBannerSuppressed` the region ends up holding
    // "Someone is checking out — the order's locked" — a strictly less informative sentence about
    // the same fact, and the diner never learns their tap was refused.
    h.setQty.mockRejectedValueOnce(new Error("locked"));
    h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
    mount();
    await addOne();
    await act(async () => {});
    expect(regionText()).toContain("That didn’t go through");
  });

  it("still announces a lock nobody explained", async () => {
    // The banner exists for the diner who did NOTHING — a peer takes the lock while they read the
    // bill and every control goes dead under them. Suppression is redundancy, not rank: with no
    // refusal latched it must speak, or porting T33 would have traded one silence for another.
    mount();
    await act(async () => {});
    h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
    await syncFromServer();
    await waitFor(() => expect(regionText()).toContain("checking out"));
  });

  it("keeps a SELF-held lock's refusal, which is the sentence the two-tab diner needs", async () => {
    // One device, two tabs (the M124 case `freezeNotice` names): this tab's write is refused by a
    // lock the OTHER tab holds. The refusal says "while YOU check out"; the banner would say the
    // same thing with less. The latch has to carry the ownership, because `explanationHolds`
    // compares it — hardcode `lockedByYou` at latch time and this case silently loses its sentence
    // while the peer twin above stays green, which is the shape of the finding on /menu.
    h.setQty.mockRejectedValueOnce(new Error("locked"));
    h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: MY_SEAT }));
    mount();
    await addOne();
    await act(async () => {});
    expect(regionText()).toContain(
      "That didn’t go through — the order’s locked while you check out",
    );
  });

  it("speaks again when the lock is RELEASED and re-taken with no write in between", async () => {
    // T33's staleness bound, and the only shape that reaches it. `explanationHolds` cannot catch
    // this one: at the publish moment and at each banner moment the lock is genuinely true, so
    // nothing but the release EDGE can retire the fact. Drop the axis-scoped clear and the re-lock
    // is silenced by an explanation for a freeze that had already ended — a banner about a fact
    // nobody explained, on a screen where every control has just gone dead again.
    h.setQty.mockRejectedValueOnce(new Error("locked"));
    h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
    mount();
    await addOne();
    await act(async () => {});
    expect(regionText()).toContain("That didn’t go through");

    h.getCartView.mockResolvedValue(view());
    await syncFromServer();
    await waitFor(() => expect(regionText()).toContain("you can edit again"));

    h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
    await syncFromServer();
    await waitFor(() => expect(regionText()).toContain("checking out"));
  });
});

describe("M230's half — the two pills beside the stepper share the same window", () => {
  it("speaks when the for-here/to-go toggle is refused BUSY", async () => {
    // Identical exposure to `changeQty`: the render gate reads `lineState` from the last view, so a
    // peer taking the pay lock leaves the pill live, the flip is optimistic, and the server answers
    // `busy`. Dropping that result — which is what shipped — re-groups the line and snaps it back
    // with nothing said.
    h.setLineFulfillment.mockResolvedValueOnce({ ok: false, reason: "busy" });
    h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
    mount({ splitContext: DINE_IN });
    await press("To go");
    await waitFor(() =>
      expect(regionText()).toContain(
        "That didn’t go through — the order’s locked while someone checks out",
      ),
    );
  });

  it("stays silent on a refusal the re-read cannot honestly diagnose", async () => {
    // `not_yours` is an OWNERSHIP fact — the kitchen fired the line between this phone's read and
    // the tap. A re-read establishes nothing about it, so naming a lock here would be the M116/T14
    // fabrication on the screen that just removed it. Silence until M230 gives it a real arm.
    h.setLineFulfillment.mockResolvedValueOnce({ ok: false, reason: "not_yours" });
    h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
    mount({ splitContext: DINE_IN });
    await press("To go");
    await act(async () => {});
    expect(regionText()).not.toContain("didn’t go through");
    expect(regionText()).not.toContain("couldn’t confirm");
  });

  it('speaks when "Send to kitchen now" is refused BUSY', async () => {
    h.makeItNow.mockResolvedValueOnce({ ok: false, reason: "busy" });
    h.getCartView.mockResolvedValue(view({ settling: true }));
    mount({ splitContext: DINE_IN, initialItems: [{ ...ITEM, fulfillment: "togo" }] });
    await press(/Send to kitchen now/i);
    await waitFor(() =>
      expect(regionText()).toContain(
        "That didn’t go through — the order’s locked while your table pays",
      ),
    );
  });
});
