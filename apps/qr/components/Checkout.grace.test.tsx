/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem, CartTotals } from "@mms/db";
import type { getCartView } from "@/lib/cart";

/**
 * Phase 3c-i (D13 · D15 · D16) — the send's undo window, lifted into Checkout, with the REAL
 * `SendToKitchenButton` (the 2,000-line suite keeps its null stub). What this pins is the wiring
 * nothing else can see: the Bill is READABLE during the grace (the door is live, the rows render,
 * Pay is dimmed with the grace sentence and never mints); the undo survives the flip (Undo on the
 * Bill, targeting the exact batch); Pay DRAINS the undo chain before it mints and is then refused by
 * the drafts the undo put back; and the Order stage draws exactly one `.checkout-cta` per state and
 * exactly one `.vt-cart-total` per view — DOM queries, never file greps (LEARNINGS #60).
 *
 * Mocks: the same seams as `Checkout.test.tsx` (server-only blockers, the children that own Stripe /
 * a channel / an IntersectionObserver), plus `@/lib/diner-sound` for the send's chime.
 */
const h = vi.hoisted(() => ({
  publishCart: vi.fn(),
  getCartView: vi.fn(),
  sendToKitchen: vi.fn(),
  undoFire: vi.fn(),
  counterPayOutcome: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/cart", () => ({
  applyPromo: vi.fn(),
  getCartView: h.getCartView,
  makeItNow: vi.fn(),
  releasePayLock: vi.fn(),
  setLineFulfillment: vi.fn(),
  setQty: vi.fn(),
  sendToKitchen: h.sendToKitchen,
  undoFire: h.undoFire,
}));
vi.mock("@/lib/counter-pay", () => ({
  counterPayOutcome: h.counterPayOutcome,
  requestCounterPay: vi.fn(),
  withdrawCounterPay: vi.fn(),
}));
vi.mock("@/lib/diner-sound", () => ({ chime: () => {} }));
vi.mock("@/lib/realtime", () => ({ useCartRealtime: () => {} }));
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
vi.mock("./PaymentSection", () => ({ PaymentSection: () => null }));
vi.mock("./SplitSection", () => ({ SplitSection: () => null }));
vi.mock("./SettlementBoard", () => ({ SettlementBoard: () => null }));
vi.mock("./TableTimeline", () => ({ TimelineStrip: () => null }));
vi.mock("./SecureTabButton", () => ({ SecureTabButton: () => null }));
vi.mock("./RewardField", () => ({ RewardField: () => null }));
vi.mock("./PickupWhenChoice", () => ({ PickupWhenChoice: () => null }));
vi.mock("./PaperAmbient", () => ({ PaperAmbient: () => null }));
vi.mock("./WalletChip", () => ({ WalletChip: () => null }));
vi.mock("./menu/BlurUpImage", () => ({ BlurUpImage: () => null }));
vi.mock("./menu/PhotoPlaceholder", () => ({ PhotoPlaceholder: () => null }));
vi.mock("./ActiveOrderProvider", () => ({ usePublishCart: () => h.publishCart }));

const { Checkout } = await import("./Checkout");

const CART = "cart-1";
const MY_SEAT = "seat-me";
const BATCH = "batch-7";

const DRAFT: CartItem = {
  id: "line-mohinga",
  menuItemId: "menu-mohinga",
  name: "Mohinga",
  qty: 1,
  modifiers: [],
  unitPriceCents: 1200,
  taxCents: 0,
  lineState: "draft",
  fulfillment: "dinein",
};
const FIRED: CartItem = { ...DRAFT, lineState: "fired" };

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
function view(over: Partial<View> = {}): View {
  return {
    items: [DRAFT],
    totals: TOTALS,
    pickupSlot: null,
    fireAt: null,
    settling: false,
    settleBy: null,
    locked: false,
    lockedBy: null,
    mySeat: MY_SEAT,
    tabType: "none",
    counterRequestedAt: null,
    tableNumber: 7,
    ...over,
  } satisfies View;
}

const HOST = {
  mode: "dinein",
  mySeat: MY_SEAT,
  myRole: "host" as const,
  members: [{ seat: MY_SEAT, name: "Me", role: "host" as const }],
  tableNumber: 7,
} as unknown as Parameters<typeof Checkout>[0]["splitContext"];

/** A send receipt with a long measured grace, so no case races the real clock. */
const SENT = {
  ok: true as const,
  fired: 1,
  undoUntil: "2026-10-04T12:01:00.000Z",
  serverNow: "2026-10-04T12:00:00.000Z",
  undoBatch: BATCH,
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function regionText(): string {
  return screen
    .getAllByRole("status")
    .map((r) => r.textContent ?? "")
    .join(" | ");
}

function mount(items: CartItem[] = [DRAFT]) {
  window.history.replaceState(null, "", "/cart?cart=cart-1");
  return render(
    <Checkout
      cartId={CART}
      initialItems={items}
      initialTotals={TOTALS}
      initialMySeat={MY_SEAT}
      splitContext={HOST}
    />,
  );
}

async function press(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

/** Send the one draft: the server fires it and hands back the grace; the re-sync shows it fired. */
async function sendAndOpenGrace() {
  h.sendToKitchen.mockResolvedValue(SENT);
  h.getCartView.mockResolvedValue(view({ items: [FIRED] }));
  await press(/^Send to kitchen · 1 item/);
  await waitFor(() => expect(screen.getByRole("button", { name: /^Undo — \d+s$/ })).toBeTruthy());
}

const payReason = () => {
  const pay = screen.getByRole("button", { name: /^Pay · \$12\.00/ });
  const id = pay.getAttribute("aria-describedby");
  return { pay, reason: id ? document.getElementById(id)?.textContent : null };
};

beforeEach(() => {
  vi.clearAllMocks();
  h.getCartView.mockResolvedValue(view());
  h.counterPayOutcome.mockResolvedValue({ kind: "open" });
});
afterEach(() => cleanup());

describe("Phase 3c-i (D15) — the Bill is readable during the send's undo window; only Pay waits", () => {
  it("the Total door is live during the grace, the receipt renders, and Pay is dimmed with the grace sentence — never minted", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mount();
    await sendAndOpenGrace();
    expect(regionText()).toContain("Sent to the kitchen — 1 item on the way.");
    // The door: no refusal, no "Hold on" — reading a bill is not a write.
    const door = screen.getByRole("button", { name: "View bill · $12.00" });
    expect(door.getAttribute("aria-disabled")).toBeNull();
    await press("View bill · $12.00");
    expect(document.body.textContent).not.toContain("Hold on");
    // The receipt rows render on the Bill.
    expect(screen.getByRole("list", { name: "Your bill" })).toBeTruthy();
    // MUTATION (checkout-verb/grace-does-not-wait-pay): Pay reads live during the grace and mints
    // over lines the diner can still pull back; red.
    const { pay, reason } = payReason();
    expect(pay.getAttribute("aria-disabled")).toBe("true");
    expect(pay.hasAttribute("disabled")).toBe(false);
    expect(reason).toContain("Pay opens when the undo window closes.");
    await act(async () => {
      fireEvent.click(pay);
    });
    expect(regionText()).toContain("Pay opens when the undo window closes.");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("the undo survives the flip: Undo is on the Bill and targets the exact batch", async () => {
    h.undoFire.mockResolvedValue({ ok: true });
    mount();
    await sendAndOpenGrace();
    await press("View bill · $12.00");
    // ONE Undo on screen, above the receipt.
    const undos = screen.getAllByRole("button", { name: /^Undo — \d+s$/ });
    expect(undos).toHaveLength(1);
    h.getCartView.mockResolvedValue(view({ items: [DRAFT] }));
    await act(async () => {
      fireEvent.click(undos[0]!);
    });
    // MUTATION: target anything but the batch this send minted — a guest's make-it-now line sharing
    // the grace is clawed back; red.
    expect(h.undoFire).toHaveBeenCalledWith(CART, BATCH);
    await waitFor(() => expect(regionText()).toContain("Brought back to your order"));
    expect(screen.queryByRole("button", { name: /^Undo — /i })).toBeNull();
  });

  it("Pay DRAINS a deferred undo before minting, then is refused by the drafts it put back", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ clientSecret: "pi_x_secret", totals: TOTALS, attempt: "a1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mount();
    await sendAndOpenGrace();
    await press("View bill · $12.00");
    // The undo LANDS at once, but its re-sync (the read that brings the drafts back) is held open —
    // so the window has closed and nothing is pending, while the chain is still out.
    h.undoFire.mockResolvedValue({ ok: true });
    const slowSync = deferred<View>();
    h.getCartView.mockReturnValueOnce(slowSync.promise);
    await press(/^Undo — \d+s$/);
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Undo — /i })).toBeNull());
    const { pay } = payReason();
    expect(pay.getAttribute("aria-disabled")).toBeNull(); // the view still shows the line fired
    fireEvent.click(pay);
    await act(async () => {}); // the tap is now awaiting the chain
    // MUTATION (checkout/pay-mints-over-an-in-flight-undo): drop `await grace.graceWrites.current`
    // — create-intent is called here, over a line the undo has already returned to draft; red.
    expect(fetchSpy).not.toHaveBeenCalled();
    h.getCartView.mockResolvedValue(view({ items: [DRAFT] }));
    await act(async () => {
      slowSync.resolve(view({ items: [DRAFT] }));
    });
    // MUTATION (checkout/pay-decides-before-the-drain): the block is re-asked BEFORE the await, on
    // the old view — null — and the mint proceeds over the drafts; red.
    await waitFor(() =>
      expect(regionText()).toContain(
        "Send everything to the kitchen first — then the bill is ready to pay.",
      ),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("Phase 3c-i (D13 · D14) — one hero per state, one morph target per view", () => {
  it("drafts → the filled Send is the only .checkout-cta; the grace → none; everything sent → the door", async () => {
    mount();
    // Drafts, a host: Send is the hero.
    expect(document.querySelectorAll(".checkout-cta")).toHaveLength(1);
    expect(document.querySelector(".checkout-cta")!.textContent).toContain("Send to kitchen");
    expect(document.querySelectorAll(".vt-cart-total")).toHaveLength(1);
    await sendAndOpenGrace();
    // The grace: the outline Undo, no filled verb at all — reversing is never the hero.
    // MUTATION (checkout/two-heroes-on-the-order-stage): the door wears `.checkout-cta` while the
    // hero is Send or Undo — two filled verbs on one stage; red (count 1 → 2 above, 0 → 1 here).
    expect(document.querySelectorAll(".checkout-cta")).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: /^Undo — /i }).classList.contains("checkout-cta"),
    ).toBe(false);
    expect(document.querySelectorAll(".vt-cart-total")).toHaveLength(1);
  });

  it("everything sent (no grace): the Total door is the filled hero, reading 'View bill & pay · $X'", async () => {
    window.history.replaceState(null, "", "/cart?cart=cart-1");
    render(
      <Checkout
        cartId={CART}
        initialItems={[FIRED]}
        initialTotals={TOTALS}
        initialMySeat={MY_SEAT}
        splitContext={HOST}
      />,
    );
    // Opens on the Bill (everything sent) — exactly one morph target there.
    expect(document.querySelectorAll(".vt-cart-total")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Back to your order/i }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20)); // the in-page Back walks history.back()
    });
    const door = await screen.findByRole("button", { name: "View bill & pay · $12.00" });
    expect(door.classList.contains("checkout-cta")).toBe(true);
    expect(document.querySelectorAll(".checkout-cta")).toHaveLength(1);
    expect(document.querySelectorAll(".vt-cart-total")).toHaveLength(1);
    expect(document.body.textContent).toContain("Your order’s with the kitchen.");
  });
});
