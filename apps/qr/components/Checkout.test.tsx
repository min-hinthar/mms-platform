/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem, CartTotals } from "@mms/db";
import type { getCartView } from "@/lib/cart";
import { freezeRecheckDelayMs } from "@/lib/lock-ttl";

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

/** A promise a case can hold open, so two reads are genuinely in flight at once. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const h = vi.hoisted(() => ({
  publishCart: vi.fn(),
  getCartView: vi.fn(),
  setQty: vi.fn(),
  setLineFulfillment: vi.fn(),
  makeItNow: vi.fn(),
  releasePayLock: vi.fn(),
  counterPayOutcome: vi.fn(),
  requestCounterPay: vi.fn(),
  withdrawCounterPay: vi.fn(),
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
  counterPayOutcome: h.counterPayOutcome,
  requestCounterPay: h.requestCounterPay,
  withdrawCounterPay: h.withdrawCounterPay,
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
// ⚠️ `./PayAtCounter` IS LEFT REAL, unlike the other children. `askCounter`/`withdrawCounter` are
// the two `confirmedWrite` call sites M227 named, and a stub would guard a button this screen might
// no longer be wiring. The module is pure presentation (two buttons and a card).
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
vi.mock("./ActiveOrderProvider", () => ({ usePublishCart: () => h.publishCart }));

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

/**
 * How many "pay at the counter" CARDS are on screen — the ask, rendered.
 *
 * ⚠️ A COUNT OF THE LANDMARK, not a text probe. `queryByText(/Settle up at the counter/i)` reported
 * the card present on a DOM whose `textContent` did not contain that string, so it could not tell
 * the barrier's two behaviours apart and the mutant SURVIVED against it. The card is the only
 * `aria-labelledby="counter-h"` region on this screen, so counting it answers exactly the question.
 */
function counterCards(): number {
  return document.querySelectorAll('[aria-labelledby="counter-h"]').length;
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

/**
 * Let the round trip AND the frame the refusal is published on both land.
 *
 * ⚠️ THE FRAME IS NOT CEREMONY. `announceRefusal` parks the refusal and an effect publishes it from
 * a `requestAnimationFrame`, so that the region the view change mounts is on screen and EMPTY before
 * its text changes — a polite region announces a change to an existing node, not content that was
 * there when the node appeared. `act()` flushes effects but not the frame, so a test that stops at
 * `act` sees the parked state, which is exactly what the mounted-then-filled case below asserts.
 */
async function settle() {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
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

/** A pickup session: no staging, so the line cards and the pay furniture are on screen together. */
const PICKUP = {
  mode: "pickup",
  myRole: "host",
  mySeat: MY_SEAT,
  members: [{ seat: MY_SEAT, name: "Me" }],
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
  h.counterPayOutcome.mockResolvedValue({ kind: "open" });
  h.requestCounterPay.mockResolvedValue({
    ok: true,
    counterRequestedAt: "2026-09-18T06:00:00.000Z",
  });
  h.withdrawCounterPay.mockResolvedValue({ ok: true });
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
    await settle();
    expect(regionText()).not.toContain("didn’t go through");
    expect(regionText()).not.toContain("couldn’t confirm");
  });

  it("waits for the region to be on screen and EMPTY before it speaks", async () => {
    // The deferral, made falsifiable. A polite region announces a CHANGE to a node that already
    // exists; content present when the node mounts is not announced. The view that diagnoses the
    // refusal can REPLACE the region's subtree — a refused removal of the last unit renders the
    // empty-cart return, and a settling refusal swaps the review region for the settlement one — so
    // publishing in that same commit puts the text on screen and says nothing to a screen reader.
    // Collapse the frame into the effect body and this first assertion goes red while every
    // final-text assertion in the file stays green, which is exactly the blind spot.
    //
    // ⚠️ FAKE TIMERS, because the intermediate state is a RACE against a real frame. The first draft
    // used the real clock and passed alone, then failed inside `turbo lint typecheck build test`
    // where the concurrent build slows the loop enough for the frame to fire inside `act`. A guard
    // whose verdict depends on machine load is not a guard.
    vi.useFakeTimers();
    try {
      h.setQty.mockRejectedValueOnce(new Error("locked"));
      h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
      mount();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
      });
      expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
      expect(regionText()).not.toContain("That didn’t go through");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32);
      });
      expect(regionText()).toContain("That didn’t go through");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays silent when the write is ACCEPTED", async () => {
    mount();
    await addOne();
    await settle();
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
    await settle();
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
    await settle();
    expect(regionText()).toContain(
      "That didn’t go through — the order’s locked while you check out",
    );
  });

  it("names the lock that OUTLIVES a settlement the refusal explained", async () => {
    // `classifyRefusedWrite` tests settling first, so a cart under BOTH freezes gets the settle
    // explanation — which outranks and silences the lock banner. Call the split off with the pay
    // lock still held and `announced` never changes (the lock notice existed throughout), so an
    // edge test that asks only `prev === announced` leaves the region asserting the table is still
    // paying. A suppression LIFTING is an edge too; the freeze that ended and the freeze that
    // remains are different facts.
    h.setQty.mockRejectedValueOnce(new Error("frozen"));
    h.getCartView.mockResolvedValue(view({ settling: true, locked: true, lockedBy: PEER_SEAT }));
    mount();
    await addOne();
    await settle();
    expect(regionText()).toContain("the order’s locked while your table pays");

    h.getCartView.mockResolvedValue(view({ settling: false, locked: true, lockedBy: PEER_SEAT }));
    await syncFromServer();
    await waitFor(() => expect(regionText()).toContain("checking out"));
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
    await settle();
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
    await settle();
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

describe("what a REFUSAL still owes beyond the sentence", () => {
  it("runs the settle probe when the diagnosis read cannot see the cart either", async () => {
    // The CRITICAL both reviewers found independently. A cart the register has settled makes the
    // write AND the re-read throw — `assertCartMember` answers `cart_closed` forever after — so the
    // first draft's refusal path returned null and did nothing, stranding the diner on an editable
    // bill for an order that is already paid. Every one of these taps used to end in `refresh()`,
    // whose failed arm asks the one question that separates a settled cart from a blip.
    h.setQty.mockRejectedValueOnce(new Error("Cart is no longer open"));
    h.getCartView.mockRejectedValue(new Error("cart_closed"));
    h.counterPayOutcome.mockResolvedValue({ kind: "paid", orderId: "order-1", tender: "counter" });
    mount({ splitContext: DINE_IN });
    await addOne();
    await settle();
    expect(h.counterPayOutcome).toHaveBeenCalledWith({ cartId: CART });
    await waitFor(() =>
      expect(h.push).toHaveBeenCalledWith(`/track?cart=${encodeURIComponent(CART)}&paid=1`),
    );
  });

  it("says nothing when the re-read shows the write actually LANDED", async () => {
    // A rejected Server Action never proved the mutation failed: `setQty`'s `if (!affected) throw`
    // sits after the RPC and discards its `{ error }`, and a response can be lost after the
    // statement committed. Announcing "That didn't go through" over a change the diner can see in
    // the list is the one direction they cannot recover from, so the re-read decides and silence
    // wins the tie — even though this view also carries a lock that would otherwise be named.
    h.setQty.mockRejectedValueOnce(new Error("lost response"));
    h.getCartView.mockResolvedValue(
      view({ items: [{ ...ITEM, qty: 2 }], locked: true, lockedBy: PEER_SEAT }),
    );
    mount();
    await addOne();
    await settle();
    expect(regionText()).not.toContain("didn’t go through");
    expect(regionText()).not.toContain("couldn’t confirm");
  });

  it("does not publish a freeze the screen has already moved past", async () => {
    // A ticketed read can come back, diagnose perfectly, and still LOSE the screen. /menu publishes
    // the observed classification anyway and is right to — its sentence is a 2600 ms toast. Here it
    // is persistent text beside live controls, so an overtaken "someone is checking out" would sit
    // under an unlocked cart with no release edge left to retire it. The refused read is held open
    // while a later visibility read applies an unlocked view and wins.
    const held = deferred<View>();
    h.setQty.mockRejectedValueOnce(new Error("locked"));
    h.getCartView.mockReturnValueOnce(held.promise);
    mount();
    // ⚠️ FIRED OUTSIDE `act`, deliberately: `addOne` awaits its own act, and the diagnosis read is
    // pinned open here, so wrapping it would leave a dangling act that corrupts the NEXT case.
    fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
    await act(async () => {}); // the write rejects; the diagnosis read is now in flight and held
    h.getCartView.mockResolvedValue(view()); // the newer read: unlocked
    await syncFromServer(); // it is issued later, so it wins the ticket and takes the screen
    await act(async () => {
      held.resolve(view({ locked: true, lockedBy: PEER_SEAT })); // the older one lands last
    });
    await settle();
    expect(regionText()).not.toContain("locked while someone checks out");
  });

  it("retires a shown refusal once a later edit of the diner's is accepted", async () => {
    h.setQty.mockRejectedValueOnce(new Error("rate limited"));
    mount();
    await addOne();
    await settle();
    expect(regionText()).toContain("We couldn’t confirm that");
    await addOne();
    await settle();
    expect(regionText()).not.toContain("couldn’t confirm");
  });

  it("re-reads the cart after an ACCEPTED write", async () => {
    // The re-sync that replaces the optimistic number with server truth. Nothing else pinned it, so
    // deleting `await refresh()` from the accepted branch was a silent regression.
    mount();
    await addOne();
    await settle();
    expect(h.getCartView).toHaveBeenCalledWith(CART);
  });

  it("leaves a live pay error standing rather than swapping it for a hedge", async () => {
    // `payError` wins the slot by design (`payError ?? status`). Clearing it unconditionally traded
    // "Couldn't start checkout" — actionable, about money — for "We couldn't confirm that — the
    // order below is up to date", on a screen whose checkout is broken. A FREEZE supersedes it (the
    // diner cannot retry the payment while frozen); an `unknown` hedge has no such claim.
    //
    // A PICKUP session is what makes both surfaces coexist: dine-in STAGES the cart, so its steppers
    // and its Pay CTA live in different moments and never see each other's state.
    mount({ splitContext: PICKUP });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Pay/ }));
    });
    await waitFor(() => expect(regionText()).toContain("Add a first name for pickup"));

    h.setQty.mockRejectedValueOnce(new Error("rate limited"));
    await addOne();
    await settle();
    expect(regionText()).toContain("Add a first name for pickup");
    expect(regionText()).not.toContain("couldn’t confirm");
  });
});

describe("M227 — the READ-ORDERING wiring M225 closed, which nothing could see before", () => {
  /** A dine-in table whose only line has already gone to the kitchen: the Bill moment, no steppers. */
  const FIRED = [{ ...ITEM, lineState: "fired" as const }];
  const billView = (over: Partial<View> = {}) => view({ items: FIRED, ...over });

  it("keeps a confirmed counter-ask when an OLDER read lands after it", async () => {
    // `confirmedWrite` is the barrier. `askCounter` writes a server-CONFIRMED `counterRequestedAt`
    // outside any read, so a read ISSUED BEFORE the tap and resolving after it re-asserts null and
    // the counter card vanishes under the diner while the register is expecting them. Delete the
    // barrier and this case goes red; nothing else in the repo could see it.
    // ⚠️ THE ASK'S OWN `refresh()` IS HELD OPEN TOO, and that is what makes this fixture
    // discriminating. Let it land first and ordinary ticket ordering already rejects the older read,
    // so the barrier would be redundant and its mutant would SURVIVE — which is exactly what the
    // first draft of this case measured.
    const stale = deferred<View>();
    const afterAsk = deferred<View>();
    h.getCartView.mockReturnValueOnce(stale.promise).mockReturnValueOnce(afterAsk.promise);
    mount({ splitContext: DINE_IN, initialItems: FIRED });
    await syncFromServer(); // issues the read that will land LATE, still carrying no counter ask
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Pay at the counter/i }));
    });
    await waitFor(() => expect(counterCards()).toBe(1));
    await act(async () => {
      stale.resolve(billView({ counterRequestedAt: null })); // the pre-ask read, alone in flight
    });
    await settle();
    expect(counterCards()).toBe(1);
    await act(async () => {
      afterAsk.resolve(billView({ counterRequestedAt: "2026-09-18T06:00:00.000Z" }));
    });
  });

  it("withdrawing the ask is barriered the same way", async () => {
    const stale = deferred<View>();
    const afterWithdraw = deferred<View>();
    mount({
      splitContext: DINE_IN,
      initialItems: FIRED,
      initialCounterRequestedAt: "2026-09-18T06:00:00.000Z",
    });
    h.getCartView.mockReturnValueOnce(stale.promise).mockReturnValueOnce(afterWithdraw.promise);
    await syncFromServer();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Pay on your phone/i }));
    });
    await waitFor(() => expect(counterCards()).toBe(0));
    await act(async () => {
      stale.resolve(billView({ counterRequestedAt: "2026-09-18T06:00:00.000Z" }));
    });
    await settle();
    expect(counterCards()).toBe(0);
    await act(async () => {
      afterWithdraw.resolve(billView());
    });
  });

  it('"Check again" does not claim a failure when its read was merely OVERTAKEN', async () => {
    // `readReachedServer`, not `=== "applied"`. An overtaken read REACHED the server, so collapsing
    // the two lights "Couldn't check just now" over a read that did check — the fabricated diagnosis
    // of the M116/T14 class. `recheckLock` also re-issues once on an overtake, so the fixture holds
    // the first read open, lets a visibility read win, and then resolves it.
    // ⚠️ THE RE-ISSUE MUST ALSO FAIL TO LAND, or the outcome is rescued to `applied` and BOTH the
    // real predicate and its mutant stay quiet — a degenerate fixture, which is what the first draft
    // of this case was. `recheckLock` re-issues once on an overtake and refuses to let a FAILED
    // retry downgrade what the first read established, so the outcome that reaches the report is
    // still `overtaken`: reached the server, did not win the screen.
    const held = deferred<View>();
    h.getCartView.mockReturnValueOnce(held.promise);
    mount({ initialLocked: true, initialLockedBy: PEER_SEAT });
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => {});
    h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
    await syncFromServer(); // issued later, so it wins the ticket
    h.getCartView.mockRejectedValue(new Error("the re-issue never comes back"));
    await act(async () => {
      held.resolve(view({ locked: true, lockedBy: PEER_SEAT }));
    });
    await settle();
    expect(regionText()).not.toContain("Couldn’t check just now");
  });

  it('"Check again" DOES say so when the read never reached the server', async () => {
    h.getCartView.mockRejectedValue(new Error("offline"));
    mount({ initialLocked: true, initialLockedBy: PEER_SEAT });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    });
    await waitFor(() => expect(regionText()).toContain("Couldn’t check just now"));
  });

  it("re-reads on a schedule while the cart is frozen, and keeps re-arming", async () => {
    // T20's scheduled freeze re-check, ported to /cart with the ticket because a lock EXPIRES by the
    // passage of time with no row write — no realtime event, and the visibility backstop never fires
    // for a tab that stays open, which is the /cart case. Without it the ticket's own T24 cost has
    // nothing to heal it.
    vi.useFakeTimers();
    try {
      h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
      mount({ initialLocked: true, initialLockedBy: PEER_SEAT });
      expect(h.getCartView).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(freezeRecheckDelayMs({ locked: true, settling: false })!);
      });
      expect(h.getCartView).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(freezeRecheckDelayMs({ locked: true, settling: false })!);
      });
      expect(h.getCartView).toHaveBeenCalledTimes(2); // re-armed, because the read came back
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Codex round 2 — a refusal that is no longer true of anything on screen", () => {
  it("drops a diagnosis a LATER accepted edit has already superseded", async () => {
    // `qtyChain` orders the WRITES for one line; it does not order the refused tap's DIAGNOSIS —
    // a separate round trip — against the next tap's success. So the first tap can still be
    // diagnosing while the second commits, and clearing only an already-DISPLAYED refusal reaches
    // nothing: at that moment the older diagnosis has published nothing yet.
    const slowDiagnosis = deferred<View>();
    h.setQty.mockRejectedValueOnce(new Error("locked"));
    h.getCartView.mockReturnValueOnce(slowDiagnosis.promise);
    mount();
    fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
    await act(async () => {}); // tap A refused; its diagnosis is in flight and held
    await addOne(); // tap B lands — the server accepted it
    await act(async () => {
      slowDiagnosis.resolve(view({ locked: true, lockedBy: PEER_SEAT })); // A's diagnosis, too late
    });
    await settle();
    expect(regionText()).not.toContain("didn’t go through");
    expect(regionText()).not.toContain("couldn’t confirm");
  });

  it("drops a refusal already PARKED when an accepted edit lands before its frame", async () => {
    // The other half, and it needs the clock held to reach. The generation check runs BEFORE
    // `announceRefusal`, so it cannot help once the refusal is parked: the diagnosis won its
    // generation fairly, and only THEN did the next tap succeed. Between the park and the frame,
    // `clearShownRefusal` has nothing displayed to clear — so it must drop the parked publish too,
    // or the frame fires and speaks about a write two taps old.
    vi.useFakeTimers();
    try {
      // ⚠️ AN `unknown` REFUSAL, deliberately: a FROZEN one applies a locked view, which natively
      // disables the stepper, and the second tap this case depends on would never fire.
      h.setQty.mockRejectedValueOnce(new Error("rate limited"));
      mount();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
      });
      expect(regionText()).not.toContain("couldn’t confirm"); // parked, frame not yet fired
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32);
      });
      expect(regionText()).not.toContain("didn’t go through");
      expect(regionText()).not.toContain("couldn’t confirm");
    } finally {
      vi.useRealTimers();
    }
  });

  it("speaks into the EMPTY-cart view, which had no live region at all", async () => {
    // A tablemate removes the only line while this diner increments it. The write is refused, the
    // diagnosis applies a zero-item view, and the landing check cannot suppress the sentence — the
    // requested quantity is positive and the line is gone. The publish then lands in the empty-cart
    // `<main>`, a different branch from the review step's, where `status` was rendered nowhere.
    h.setQty.mockRejectedValueOnce(new Error("gone"));
    h.getCartView.mockResolvedValue(view({ items: [] }));
    mount();
    await addOne();
    await settle();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect(regionText()).toContain("We couldn’t confirm that");
  });

  it("retires a SETTLING refusal when the split is called off and no lock remains", async () => {
    // The mirror of the round-1 fix. That one handled settling ending with the pay lock still held,
    // where the lock banner takes over. Here nothing outlives it: `announced` is false before and
    // after, so the lock-edge effect never fires and the sentence "the order's locked while your
    // table pays" was left standing on a review view the diner can now edit.
    h.setQty.mockRejectedValueOnce(new Error("settling"));
    h.getCartView.mockResolvedValue(view({ settling: true }));
    mount();
    await addOne();
    await settle();
    expect(regionText()).toContain("the order’s locked while your table pays");

    h.getCartView.mockResolvedValue(view()); // split called off; no lock
    await syncFromServer();
    await settle();
    expect(regionText()).not.toContain("your table pays");
  });
});

describe("Codex round 3 — an OLDER edit's success cannot retire a NEWER refusal", () => {
  /**
   * A second line, because the bug lives exactly where `qtyChain` does not reach.
   *
   * ⚠️ ONE LINE CANNOT EXPRESS IT. `qtyChain` chains a line's writes, so a second tap on the SAME
   * line resolves strictly after the first — an older success can never land after a newer refusal
   * there. Two lines have two chains, so the responses may answer in either order, which is the
   * whole of round 3's finding.
   */
  const LINE_B = "line-ohnno";
  const ITEM_B: CartItem = {
    ...ITEM,
    id: LINE_B,
    menuItemId: "menu-ohnno",
    name: "Ohn No Khao Swè",
  };
  const bothLines = (over: Partial<View> = {}) => view({ items: [ITEM, ITEM_B], ...over });

  // No freeze in any of these: the point is the ORDERING, and a lock would drag T33 in beside it.

  it("keeps a shown refusal when an edit tapped EARLIER answers late", async () => {
    h.getCartView.mockResolvedValue(bothLines());
    const slowA = deferred<View>();
    h.setQty.mockReturnValueOnce(slowA.promise); // tap A: accepted by the server, answered late
    mount({ initialItems: [ITEM, ITEM_B] });
    fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
    await act(async () => {}); // A is in flight

    h.setQty.mockRejectedValueOnce(new Error("rate limited")); // tap B, later and refused
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM_B.name}` }));
    });
    await settle();
    expect(regionText()).toContain("couldn’t confirm"); // B's refusal is on screen

    await act(async () => {
      slowA.resolve(bothLines());
    });
    await settle();
    // A was tapped BEFORE B. Its success says nothing about B's refusal, which is still true of the
    // cart the diner is looking at — and no edge exists that would ever put the sentence back.
    expect(regionText()).toContain("couldn’t confirm");
  });

  it("keeps a refusal still being DIAGNOSED when an earlier edit answers first", async () => {
    h.getCartView.mockResolvedValue(bothLines());
    const slowA = deferred<View>();
    const slowDiagnosis = deferred<View>();
    h.setQty.mockReturnValueOnce(slowA.promise);
    mount({ initialItems: [ITEM, ITEM_B] });
    fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
    await act(async () => {});

    h.setQty.mockRejectedValueOnce(new Error("rate limited"));
    h.getCartView.mockReturnValueOnce(slowDiagnosis.promise);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM_B.name}` }));
    });

    await act(async () => {
      slowA.resolve(bothLines()); // the EARLIER tap lands while the later one is still diagnosing
    });
    await act(async () => {
      slowDiagnosis.resolve(bothLines());
    });
    await settle();
    // The in-flight side of the same finding: sampling the watermark for ANY change drops this,
    // because something did land — it just landed from a tap older than this one.
    expect(regionText()).toContain("couldn’t confirm");
  });

  it("does not count a toggle the server REJECTED as an accepted edit", async () => {
    h.setQty.mockRejectedValueOnce(new Error("rate limited"));
    mount({ splitContext: DINE_IN });
    await addOne();
    await settle();
    expect(regionText()).toContain("couldn’t confirm");

    // `not_yours` is undiagnosable, so the toggle stays silent (M230) — but silent is not accepted.
    h.setLineFulfillment.mockResolvedValueOnce({ ok: false, reason: "not_yours" });
    await press("To go");
    await settle();
    expect(regionText()).toContain("couldn’t confirm");
  });

  it("does not count a make-now the server REJECTED as an accepted edit", async () => {
    // The pill's twin, and it needs its own case: `makeNow` carries the same two flags, and a
    // mutation that deletes only ITS guard leaves every toggle case green.
    const TOGO: CartItem = { ...ITEM, fulfillment: "togo" };
    h.getCartView.mockResolvedValue(view({ items: [TOGO] }));
    h.setQty.mockRejectedValueOnce(new Error("rate limited"));
    mount({ splitContext: DINE_IN, initialItems: [TOGO] });
    await addOne();
    await settle();
    expect(regionText()).toContain("couldn’t confirm");

    h.makeItNow.mockResolvedValueOnce({ ok: false, reason: "not_yours" });
    await press(/Send to kitchen now/i);
    await settle();
    expect(regionText()).toContain("couldn’t confirm");
  });
});

describe("Codex round 4 — a refusal must not contradict the view that WON", () => {
  it("stays silent when the winning view shows the change its own read missed", async () => {
    // The landing check and the freeze check were reading DIFFERENT views. Round 1 moved the
    // classification onto `freezeFactsRef` so an overtaken read could not narrate a freeze the
    // screen had moved past — and left the landing check on the read's own, losing, view. A write
    // whose response was lost but which COMMITTED then gets "We couldn't confirm that" printed
    // beside the very quantity the winning view just put on screen.
    const slowDiagnosis = deferred<View>();
    h.setQty.mockRejectedValueOnce(new Error("response lost"));
    h.getCartView.mockReturnValueOnce(slowDiagnosis.promise); // the diagnosis read, held open
    mount();
    fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
    await act(async () => {}); // the write threw; its diagnosis is in flight

    h.getCartView.mockResolvedValue(view({ items: [{ ...ITEM, qty: 2 }] })); // it DID land
    await syncFromServer(); // a newer read overtakes the diagnosis and puts qty 2 on screen

    await act(async () => {
      slowDiagnosis.resolve(view()); // the loser, still showing qty 1
    });
    await settle();
    expect(regionText()).not.toContain("couldn’t confirm");
    expect(regionText()).not.toContain("didn’t go through");
  });

  it("drops a parked lock refusal when the lock lifts before its frame fires", async () => {
    // ⚠️ THE CLOCK IS HELD because the gap is the bug. Parking and publishing are two moments, and
    // a BACKGROUNDED tab throttles frames far apart — long enough for the peer to finish. The
    // release edge writes "you can edit again", and a callback still holding the old verdict
    // overwrites it with "the order's locked" beside controls that are live again.
    vi.useFakeTimers();
    try {
      h.setQty.mockRejectedValueOnce(new Error("locked"));
      h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
      mount();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
      });
      expect(regionText()).not.toContain("didn’t go through"); // parked; the frame has not fired

      h.getCartView.mockResolvedValue(view()); // the peer finished and the lock lifted
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32); // now the parked frame fires
      });

      expect(regionText()).toContain("you can edit again");
      expect(regionText()).not.toContain("didn’t go through");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Codex round 5 — the parked sentence is re-derived, not re-validated", () => {
  it("drops a SELF-lock refusal when the lock has become a PEER's before its frame", async () => {
    // Round 4 asked a boolean — "is something still locked?" — and then published the payload
    // parked at read time. A lock whose ATTRIBUTION moved inside the gap still satisfies that, so
    // the two-tab diner's "while you check out" printed beside a tablemate's lock.
    vi.useFakeTimers();
    try {
      h.setQty.mockRejectedValueOnce(new Error("locked"));
      h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: MY_SEAT }));
      mount();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
      });

      h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32);
      });

      expect(regionText()).not.toContain("while you check out");
      // AND THE BANNER THE DINER IS NOW OWED STILL SPEAKS — carried by T33's suppression-LIFT edge,
      // not by anything this round added. Worth pinning because a dropped publish leaves
      // `explainedFreezeRef` latched on the freeze it never spoke, and the only reason that does not
      // silence the peer banner is that the lift edge treats the attribution change as an edge.
      // MEASURED, not assumed: clearing the latch on the drop path was tried and its mutant
      // SURVIVED against this case, so the latch retirement is unfalsifiable here and was reverted.
      expect(regionText()).toContain("checking out");
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops an unknown hedge when a later view CONFIRMS the write before its frame", async () => {
    // The `unknown` arm published unconditionally, under a comment claiming no later view could
    // falsify a hedge. A view showing the requested value falsifies it exactly — "We couldn't
    // confirm that" beside the quantity the diner asked for, now on screen.
    vi.useFakeTimers();
    try {
      h.setQty.mockRejectedValueOnce(new Error("response lost"));
      mount();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
      });

      h.getCartView.mockResolvedValue(view({ items: [{ ...ITEM, qty: 2 }] })); // it DID land
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32);
      });

      expect(regionText()).not.toContain("couldn’t confirm");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Codex round 6 — a refusal that is never spoken must not silence the banner", () => {
  it("names the still-held lock when a later view CONFIRMS the edit", async () => {
    // ⚠️ THE SCENARIO THAT SEPARATES, and my own earlier attempt at this missed it. I tested
    // ATTRIBUTION DRIFT (self→peer), where T33's suppression-LIFT edge treats the change as an edge
    // and the banner speaks anyway — so clearing the latch was unfalsifiable and I reverted it.
    // Here the freeze NEVER CHANGES: the same peer lock is held throughout, so there is no edge of
    // any kind. The refusal is parked (and latches, suppressing the lock-entry banner), a later view
    // shows the write actually landed, and the publish is dropped — leaving the latch asserting this
    // diner was told about a lock nobody ever mentioned, beside dead controls.
    vi.useFakeTimers();
    try {
      h.setQty.mockRejectedValueOnce(new Error("response lost"));
      h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT })); // qty 1: not landed
      mount();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
      });

      // The write DID land; a later read shows it, with the SAME lock still held.
      h.getCartView.mockResolvedValue(
        view({ locked: true, lockedBy: PEER_SEAT, items: [{ ...ITEM, qty: 2 }] }),
      );
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32); // the parked frame fires and DROPS the refusal
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32); // ...and the republish rides the NEXT frame
      });

      expect(regionText()).toContain("checking out");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not invent a RELEASE when the drop happens on an unfrozen cart", async () => {
    // The republish must stay silent when nothing is frozen. Without the `freezeMessage === null`
    // guard it falls through to the edge effect's other branch and announces "The order's unlocked
    // — you can edit again" on a cart that was never locked: a release that never happened, which
    // is the same fabrication class M116/T14 covers.
    vi.useFakeTimers();
    try {
      h.setQty.mockRejectedValueOnce(new Error("response lost"));
      mount();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
      });

      h.getCartView.mockResolvedValue(view({ items: [{ ...ITEM, qty: 2 }] })); // landed, never frozen
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32); // the republish frame, if one were wrongly asked for
      });

      expect(regionText()).not.toContain("unlocked");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the read-time landing check earns its keep — a landed write never suppresses at all", () => {
  /**
   * ⚠️ THESE MEASURE THE FRAME, NOT THE FINAL TEXT, and that is the whole point.
   *
   * Round 6's republish speaks the banner on every dropped publication, so asserting the END state
   * cannot tell the two layers apart — which is exactly why three mutants here SURVIVED. The
   * difference the diner actually experiences is WHEN: with the read-time check a landed write
   * never parks, never latches and never suppresses, so the lock-edge effect speaks in that same
   * commit; without it the sentence is suppressed, dropped, and only republished two frames later.
   * `settle()` is deliberately NOT called before the assertion.
   */
  it("speaks the lock immediately when the diagnosis read shows the write LANDED", async () => {
    h.setQty.mockRejectedValueOnce(new Error("response lost"));
    h.getCartView.mockResolvedValue(
      view({ locked: true, lockedBy: PEER_SEAT, items: [{ ...ITEM, qty: 2 }] }),
    );
    mount();
    await addOne();
    expect(regionText()).toContain("checking out"); // no frame advanced
  });

  it("speaks it immediately when only the WINNING view shows the write landed", async () => {
    const slowDiagnosis = deferred<View>();
    h.setQty.mockRejectedValueOnce(new Error("response lost"));
    h.getCartView.mockReturnValueOnce(slowDiagnosis.promise);
    mount();
    fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
    await act(async () => {});

    h.getCartView.mockResolvedValue(
      view({ locked: true, lockedBy: PEER_SEAT, items: [{ ...ITEM, qty: 2 }] }),
    );
    await syncFromServer(); // overtakes the diagnosis and puts the landed qty on screen

    await act(async () => {
      slowDiagnosis.resolve(view()); // the loser: unfrozen, qty 1
    });
    await settle();
    // ⚠️ THE NEGATIVE IS THE LOAD-BEARING ONE. The banner is already on screen from when the
    // winning view applied, so asserting it alone passes either way. What the read-time union
    // prevents is the losing view's "not landed" reading PARKING a refusal that then overwrites
    // that banner — announcing a write the diner can see in the list as having failed.
    expect(regionText()).toContain("checking out");
    expect(regionText()).not.toContain("didn’t go through");
  });

  it("names the freeze the SCREEN shows, not the one its own read saw", async () => {
    // Not landed, so classification is reached. The losing view says SETTLING; the winning view
    // says LOCKED. Classifying from the loser parks a settle sentence the publish frame then
    // re-derives as a lock, mismatches, and DROPS — so the refusal is never spoken at all.
    const slowDiagnosis = deferred<View>();
    h.setQty.mockRejectedValueOnce(new Error("frozen"));
    h.getCartView.mockReturnValueOnce(slowDiagnosis.promise);
    mount();
    fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
    await act(async () => {});

    h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
    await syncFromServer();

    await act(async () => {
      slowDiagnosis.resolve(view({ settling: true })); // the loser named a DIFFERENT freeze
    });
    await settle();
    expect(regionText()).toContain("That didn’t go through");
  });
});

describe("Codex round 7 — the republished banner must actually be visible", () => {
  it("clears a live pay error so the lock explanation is not masked", async () => {
    // ⚠️ THE PAY ERROR IS DRIVEN THROUGH A REAL PATH, not seeded — `askCounter`'s catch is the one
    // this suite can reach. The region renders `payError ?? status`, and the ordinary lock-edge
    // announcement clears the error before writing; the republish did not, so a failed counter ask
    // kept masking the lock explanation beside dead controls.
    vi.useFakeTimers();
    try {
      // The one `payError` this suite can drive from the REVIEW step, reused verbatim from the
      // "leaves a live pay error standing" case above: pickup's missing-name validation.
      mount({ splitContext: PICKUP });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^Pay/ }));
      });
      expect(regionText()).toContain("Add a first name for pickup");

      h.setQty.mockRejectedValueOnce(new Error("response lost"));
      h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
      });

      h.getCartView.mockResolvedValue(
        view({ locked: true, lockedBy: PEER_SEAT, items: [{ ...ITEM, qty: 2 }] }),
      );
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32); // the parked frame DROPS the refusal
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32); // the republish frame
      });

      expect(regionText()).toContain("checking out");
    } finally {
      vi.useRealTimers();
    }
  });

  it("speaks the freeze as it is at FIRE time, not as it was when scheduled", async () => {
    // The republish keys on the drop, not on the freeze — so nothing re-runs it when the sentence
    // changes, and a value closed over at schedule time survives the whole gap. Release the lock
    // between the drop frame and the republish frame and a stale "someone is checking out" lands
    // straight over the edge effect's correct "you can edit again", beside live controls.
    vi.useFakeTimers();
    try {
      h.setQty.mockRejectedValueOnce(new Error("response lost"));
      h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
      mount();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: `Add another ${ITEM.name}` }));
      });

      h.getCartView.mockResolvedValue(
        view({ locked: true, lockedBy: PEER_SEAT, items: [{ ...ITEM, qty: 2 }] }),
      );
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32); // drops the refusal and SCHEDULES the republish
      });

      h.getCartView.mockResolvedValue(view({ items: [{ ...ITEM, qty: 2 }] })); // the peer finished
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(32); // the republish frame fires on a cart that is FREE
      });

      expect(regionText()).toContain("you can edit again");
      expect(regionText()).not.toContain("checking out");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("§17 (K35) — the stepper under a peer's lock", () => {
  it("keeps its focus, is aria-disabled (never native), and its name says why instead of promising 'Add another'", () => {
    mount({ initialLocked: true, initialLockedBy: PEER_SEAT });
    const frozen = screen.getAllByRole("button", {
      name: "Mohinga can’t be changed right now",
    }) as HTMLButtonElement[];
    // Both controls of the one line carry the reason.
    expect(frozen).toHaveLength(2);
    for (const b of frozen) {
      // MUTATION: `disabled={disabled}` back on the primitive — `disabled` reads true, red.
      expect(b.disabled).toBe(false);
      expect(b.getAttribute("aria-disabled")).toBe("true");
    }
    // MUTATION: drop `disabledLabel` from the cart — "+" promises "Add another Mohinga" while it
    // refuses, and this reddens.
    expect(screen.queryByRole("button", { name: /Add another Mohinga/ })).toBeNull();
    frozen[1]!.focus();
    frozen[1]!.click();
    expect(document.activeElement).toBe(frozen[1]);
  });
});

describe("#300 — /cart keeps the header's count honest", () => {
  it("publishes the CONFIRMED count, and a server-emptied cart publishes zero", async () => {
    // MUTATION: drop Checkout's publish effect — the header keeps claiming the count /menu last saw
    // after every line was removed here; red.
    mount({
      initialItems: [
        { ...ITEM, qty: 2 },
        { ...ITEM, id: "line-two", qty: 3 },
      ],
    });
    expect(h.publishCart).toHaveBeenLastCalledWith(CART, 5, undefined);
    h.getCartView.mockResolvedValue(view({ items: [] }));
    await syncFromServer();
    await waitFor(() => expect(h.publishCart).toHaveBeenLastCalledWith(CART, 0, undefined));
  });

  it("publishes the SESSION's mode with the cart — /grocery's URL carries none", () => {
    // Codex round 3. MUTATION: drop the mode argument — a market basket reached from /grocery is
    // named "Your order" off whatever door the device last saw in a URL; red.
    mount({
      splitContext: {
        mode: "scango",
        mySeat: MY_SEAT,
        myRole: "host",
        members: [],
        tableNumber: null,
      },
    });
    expect(h.publishCart).toHaveBeenLastCalledWith(CART, 1, "scango");
  });
});
