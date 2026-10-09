/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem, CartTotals } from "@mms/db";
import type { getCartView } from "@/lib/cart";
import { freezeRecheckDelayMs } from "@/lib/lock-ttl";
import { t } from "@/lib/i18n";

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
  nudgeHost: vi.fn(),
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
// 3c-ii — the bind sheet is mounted for every dine-in host; its Server Action reaches the service
// client (server-only). Never called here: the ask only opens with `tables`, which this file omits.
vi.mock("@/lib/bind-table", () => ({ bindTable: vi.fn() }));
vi.mock("@/lib/counter-pay", () => ({
  counterPayOutcome: h.counterPayOutcome,
  requestCounterPay: h.requestCounterPay,
  withdrawCounterPay: h.withdrawCounterPay,
}));
vi.mock("@/lib/realtime", () => ({ useCartRealtime: () => {} }));
// PD1 — "Let {host} know" is a Server Action (`"use server"` → the service client, server-only).
vi.mock("@/lib/send-nudge", () => ({ nudgeHost: (...a: unknown[]) => h.nudgeHost(...a) }));
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
// PD2 (Codex round 1 on #331) — a MARKER, not null: the pass replaces the Bill, so whether the split
// chooser still renders beneath it is a question this suite asks; the marker carries no text.
vi.mock("./SplitSection", () => ({ SplitSection: () => <div data-testid="split-section" /> }));
// The blind pass on #331 (guard 6) — a MARKER carrying the board's subject, not null: whether a group
// table under the register's freeze flips to the split board is a question this suite asks.
vi.mock("./SettlementBoard", () => ({
  SettlementBoard: () => <div data-testid="settlement-board">Your table is splitting the bill</div>,
}));
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
/**
 * PD2 — `SURFACES.dineInPhonePay` is PARKED in production (pinned by lib/surfaces.test.ts), and the
 * parked Bill is the "PD2" describe at the end of this file. Every OTHER dine-in case here pins the
 * Bill that returns verbatim after C2's flip (the card hero, the tip ask, "Pay on your phone"), so
 * those run with the door OPEN: the code behind it stays alive and tested, exactly as lib/surfaces
 * promises. The other surfaces answer as shipped.
 */
const flags = vi.hoisted(() => ({ phonePayOpen: true }));
vi.mock("@/lib/surfaces", async (orig) => {
  const real = await orig<typeof import("@/lib/surfaces")>();
  return {
    ...real,
    surfaceOpen: (k: Parameters<typeof real.surfaceOpen>[0]) =>
      k === "dineInPhonePay" ? flags.phonePayOpen : real.surfaceOpen(k),
  };
});

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

/** A second and third line — the neighbours a removal's focus lands on (hoisted for Phase 1c). */
const LINE_B = "line-ohnno";
const ITEM_B: CartItem = {
  ...ITEM,
  id: LINE_B,
  menuItemId: "menu-ohnno",
  name: "Ohn No Khao Swè",
};
const LINE_C = "line-shan";
const ITEM_C: CartItem = {
  ...ITEM,
  id: LINE_C,
  menuItemId: "menu-shan",
  name: "Shan Noodles",
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
    sendNudge: null,
    serverNow: "2026-10-08T10:00:00.000Z",
    mode: "dinein",
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
  // PD2 — while phone pay is parked the ask renders the counter PASS (`[data-counter-ask]`, named by
  // its table and total); after the flip, today's card (`counter-h`). One landmark either way.
  return document.querySelectorAll('[aria-labelledby="counter-h"], [data-counter-ask]').length;
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

/** Phase 3c-i (D17) — open the ⋯ sheet for a dish (the one line's by default). */
async function openLineSheet(name = ITEM.name) {
  await press(`More for ${name}`);
  await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
}

/** Phase 3c-i (D16) — the sentence the Pay button is `aria-describedby`, or null when Pay is live. */
function payReason(): string | null {
  const pay = screen.getByRole("button", { name: /^Pay( the whole order)? · / });
  const id = pay.getAttribute("aria-describedby");
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
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
    await openLineSheet();
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
    await openLineSheet();
    await press("To go");
    await settle();
    expect(regionText()).not.toContain("didn’t go through");
    expect(regionText()).not.toContain("couldn’t confirm");
  });

  it('speaks when "Send to kitchen now" is refused BUSY', async () => {
    h.makeItNow.mockResolvedValueOnce({ ok: false, reason: "busy" });
    h.getCartView.mockResolvedValue(view({ settling: true }));
    mount({ splitContext: DINE_IN, initialItems: [{ ...ITEM, fulfillment: "togo" }] });
    await openLineSheet();
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

  it("a counter-settled cart retires the step rail with the review controls — no stale Order/Bill under the paid card (deep pass on #312)", async () => {
    // Codex round 1 on #312 made `settledClose` a settled surface for the rail; nothing pinned it,
    // so the clause could be deleted with every suite green. Before the settle the rail is drawn
    // (and is an explicit `role="list"` — WebKit drops the implicit role under `list-style: none`).
    h.setQty.mockRejectedValueOnce(new Error("Cart is no longer open"));
    h.getCartView.mockRejectedValue(new Error("cart_closed"));
    h.counterPayOutcome.mockResolvedValue({ kind: "paid", orderId: null, tender: "counter" });
    mount({ splitContext: DINE_IN });
    const rail = screen.getByRole("list", { name: "Checkout steps" });
    expect(rail.getAttribute("role")).toBe("list");
    await addOne();
    await settle();
    expect(h.counterPayOutcome).toHaveBeenCalledWith({ cartId: CART });
    await waitFor(() => expect(screen.queryByRole("list", { name: "Checkout steps" })).toBeNull());
    expect(h.push).not.toHaveBeenCalled();
  });

  it('an EMPTY market basket is still a basket — the heading does not flip to "Your order" when the last line goes (deep pass on #312)', () => {
    mount({ initialItems: [], splitContext: { ...PICKUP, mode: "scango" } as typeof PICKUP });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Your basket");
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toContain("Your order");
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
  // LINE_B / ITEM_B live at module scope (Phase 1c · cart-motion reads them too).
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
    await openLineSheet();
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
    await openLineSheet();
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
  const PICKUP = {
    mode: "pickup",
    mySeat: MY_SEAT,
    myRole: "host" as const,
    members: [],
    tableNumber: null,
    qrCode: null,
  };

  it("publishes the CONFIRMED count, and a server-emptied cart publishes zero", async () => {
    // MUTATION: drop Checkout's publish effect — the header keeps claiming the count /menu last saw
    // after every line was removed here; red.
    mount({
      splitContext: PICKUP,
      initialItems: [
        { ...ITEM, qty: 2 },
        { ...ITEM, id: "line-two", qty: 3 },
      ],
    });
    expect(h.publishCart).toHaveBeenLastCalledWith(CART, 5, "pickup");
    h.getCartView.mockResolvedValue(view({ items: [] }));
    await syncFromServer();
    await waitFor(() => expect(h.publishCart).toHaveBeenLastCalledWith(CART, 0, "pickup"));
  });

  it("publishes the SESSION's mode with the cart — /grocery's URL carries none", () => {
    // Codex round 3. MUTATION: drop the mode argument — a market basket reached from /grocery is
    // named "Your order" off whatever door the device last saw in a URL; red.
    mount({ splitContext: { ...PICKUP, mode: "scango" } });
    expect(h.publishCart).toHaveBeenLastCalledWith(CART, 1, "scango");
  });

  it("claims no count when the split read failed and the mode is unknown", () => {
    // Codex round 4. MUTATION: publish `confirmedCount` regardless — a number lands under a stale
    // door, withheld as a table's or badged as the wrong noun; red.
    mount({ splitContext: null });
    expect(h.publishCart).toHaveBeenLastCalledWith(CART, null, undefined);
  });
});

describe("Phase 1b — the browser's Back walks the checkout's own steps", () => {
  const DINEIN = {
    mode: "dinein",
    mySeat: MY_SEAT,
    myRole: "host" as const,
    members: [],
    tableNumber: 7,
    qrCode: null,
  };

  it("View bill pushes a #bill entry, and Back returns to the Order stage", async () => {
    // MUTATION: flip the stage without pushing — the entry never exists, Back leaves /cart; red.
    window.history.replaceState(null, "", "/cart?cart=cart-1");
    mount({ splitContext: DINEIN, initialItems: [{ ...ITEM, lineState: "fired" }] });
    // Every line is with the kitchen, so the page OPENS on the Bill (with an Order entry beneath it).
    // Step back to the Order stage first; that walk is itself the in-page control's history.back().
    fireEvent.click(screen.getByRole("button", { name: /Back to your order/i }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: /View bill/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /View bill/i }));
    expect(window.location.hash).toBe("#bill");
    expect(screen.getByRole("button", { name: /Back to your order/i })).toBeTruthy();
    // MUTATION: drop the popstate listener — Back changes the URL but the screen stays on the Bill; red.
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect(window.location.hash).toBe(""));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Back to your order/i })).toBeNull(),
    );
  });
});

describe("Phase 1b — a guest who is not the host is told who sends", () => {
  const TABLE = (role: "host" | "guest") => ({
    mode: "dinein",
    mySeat: MY_SEAT,
    myRole: role,
    members: [
      { seat: PEER_SEAT, name: "Aung", role: "host" as const },
      { seat: MY_SEAT, name: "Me", role: "guest" as const },
    ],
    tableNumber: 7,
    qrCode: null,
  });

  it("a guest with unsent dishes sees the host's name where Send would be", () => {
    // MUTATION: drop the note — the guest's Order moment has no verb and no word again; red.
    mount({
      splitContext: TABLE("guest"),
      initialItems: [{ ...ITEM, lineState: "draft", fulfillment: "dinein" }],
    });
    expect(document.body.textContent).toContain("Aung sends the table’s order to the kitchen");
  });

  it("the host sees Send, not the note", () => {
    mount({
      splitContext: {
        ...TABLE("host"),
        mySeat: PEER_SEAT,
        members: [{ seat: PEER_SEAT, name: "Aung", role: "host" as const }],
      },
      initialMySeat: PEER_SEAT,
      initialItems: [{ ...ITEM, lineState: "draft", fulfillment: "dinein" }],
    });
    // Same sendable draft as the guest case above — ROLE is the only difference, so "no note" here
    // cannot pass for the wrong reason. (SendToKitchenButton is stubbed in this suite.)
    expect(document.body.textContent).not.toContain("sends the table’s order");
  });
});

describe("Phase 1b — a dine-in bill is payable only once everything is sent", () => {
  const HOST = {
    mode: "dinein",
    mySeat: MY_SEAT,
    myRole: "host" as const,
    members: [{ seat: MY_SEAT, name: "Me", role: "host" as const }],
    tableNumber: 7,
    qrCode: null,
  };

  it("locks Pay while a dish is unsent, says why, and never starts a charge", async () => {
    // MUTATION: drop `sendBlocksPay` from the Pay handler — the tap reaches create-intent, which now
    // refuses it, and the diner learns the rule from a failure instead of the button; red.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    window.history.replaceState(null, "", "/cart?cart=cart-1");
    mount({ splitContext: HOST, initialItems: [{ ...ITEM, lineState: "draft" }] });
    fireEvent.click(screen.getByRole("button", { name: /View bill/i }));
    // Phase 3c-i (D16) — Pay KEEPS ITS NAME; the reason is the line it is described by.
    const pay = screen.getByRole("button", { name: /^Pay · \$12\.00/ });
    expect(pay.getAttribute("aria-disabled")).toBe("true");
    expect(pay.hasAttribute("disabled")).toBe(false);
    expect(payReason()).toBe(
      "Send everything to the kitchen first — then the bill is ready to pay.",
    );
    fireEvent.click(pay);
    expect(fetchSpy).not.toHaveBeenCalled();
    // The click's own answer in the region, not just the line that was there before it.
    expect(regionText()).toContain(
      "Send everything to the kitchen first — then the bill is ready to pay.",
    );
    expect(document.body.textContent).toContain("Send them to the kitchen, then pay the bill.");
    fetchSpy.mockRestore();
  });
});

// ── Phase 2c · gate ──
describe("the Bill's other door — Pay at the counter keeps the 'Everything sent' rule", () => {
  const HOST = {
    mode: "dinein",
    mySeat: MY_SEAT,
    myRole: "host" as const,
    members: [{ seat: MY_SEAT, name: "Me", role: "host" as const }],
    tableNumber: 7,
    qrCode: null,
  };

  it("while a dish is unsent the counter button is aria-disabled, the note above says WHY, and a tap asks nothing — it repeats the reason", async () => {
    mount({ splitContext: HOST, initialItems: [{ ...ITEM, lineState: "draft" }] });
    fireEvent.click(screen.getByRole("button", { name: /View bill/i }));
    const counter = screen.getByRole("button", { name: /Pay at the counter/i });
    // MUTATION (checkout/unsent-counter-door-open): gate the button on the freeze alone — the family
    // is sent to the register over dishes nobody is cooking, a door the Pay button keeps shut; red.
    expect(counter.getAttribute("aria-disabled")).toBe("true");
    expect(counter.hasAttribute("disabled")).toBe(false);
    // The diner sees why while this button is the visible action (the note renders on the same
    // Bill stage the button does).
    expect(document.body.textContent).toContain("Send them to the kitchen, then pay the bill.");
    await act(async () => {
      fireEvent.click(counter);
    });
    expect(h.requestCounterPay).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "Send everything to the kitchen first — then pay at the counter.",
    );
  });

  it("a GUEST's tap on the dimmed counter button says who sends — never tells them to send", async () => {
    // Critic finding: the refusal told a guest to "Send everything to the kitchen" — only the host
    // can; the note above already names the host.
    mount({
      splitContext: {
        ...HOST,
        myRole: "guest" as const,
        members: [
          { seat: "seat-host", name: "Aye", role: "host" as const },
          { seat: MY_SEAT, name: "Me", role: "guest" as const },
        ],
      },
      initialItems: [{ ...ITEM, lineState: "draft", fulfillment: "dinein" }],
    });
    fireEvent.click(screen.getByRole("button", { name: /View bill/i }));
    const counter = screen.getByRole("button", { name: /Pay at the counter/i });
    expect(counter.getAttribute("aria-disabled")).toBe("true");
    expect(document.body.textContent).toContain("Aye sends them — then the bill is ready to pay.");
    await act(async () => {
      fireEvent.click(counter);
    });
    expect(h.requestCounterPay).not.toHaveBeenCalled();
    // MUTATION (checkout/unsent-counter-guest-told-to-send): the host's sentence for every role —
    // a guest is told to send what only Aye can; red.
    expect(document.body.textContent).toContain(
      "Aye sends everything to the kitchen first — then pay at the counter.",
    );
    expect(document.body.textContent).not.toContain(
      "Send everything to the kitchen first — then pay at the counter.",
    );
  });

  it("a fully sent table may still ask for the counter", async () => {
    mount({ splitContext: HOST, initialItems: [{ ...ITEM, lineState: "fired" }] });
    const counter = screen.getByRole("button", { name: /Pay at the counter/i });
    expect(counter.getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(counter);
    });
    expect(h.requestCounterPay).toHaveBeenCalledTimes(1);
  });

  it("a table with NO host is never gated at the counter either — nobody there could send", () => {
    mount({
      splitContext: { ...HOST, myRole: "guest" as const, members: [] },
      initialItems: [{ ...ITEM, lineState: "draft", fulfillment: "dinein" }],
    });
    fireEvent.click(screen.getByRole("button", { name: /View bill/i }));
    expect(
      screen.getByRole("button", { name: /Pay at the counter/i }).getAttribute("aria-disabled"),
    ).toBeNull();
  });
});

describe("Phase 1b — the bill says which table it is", () => {
  it("wears the table number at a dine-in table", () => {
    // MUTATION: drop the eyebrow — a shared-table bill stops naming its table; red.
    // 3c-ii (D30): the prop SEEDS state (`initialTableNumber`, the `initialLocked` idiom) — the
    // number is live afterwards, written by every applied view and by the bind's confirmed answer.
    mount({
      initialTableNumber: 7,
      splitContext: {
        mode: "dinein",
        mySeat: MY_SEAT,
        myRole: "host",
        members: [],
        tableNumber: 7,
        qrCode: null,
      },
    });
    expect(screen.getByText("Table 7")).toBeTruthy();
  });
});

describe("Phase 1b — a stale history entry is replaced, never stacked (blind pass on #301)", () => {
  it("a Forward onto a stale #pay entry puts the URL back WITHOUT growing history", async () => {
    // MUTATION: `pushState` in the restore arm — every Back from here lands on #pay and pushes #bill
    // again, trapping the diner on the Bill; red (history grows).
    window.history.replaceState(null, "", "/cart?cart=cart-1");
    mount({
      splitContext: {
        mode: "dinein",
        mySeat: MY_SEAT,
        myRole: "host",
        members: [{ seat: MY_SEAT, name: "Me", role: "host" }],
        tableNumber: 7,
        qrCode: null,
      },
      initialItems: [{ ...ITEM, lineState: "fired" }],
    });
    // Opens on the Bill (every dish sent), which seeds #bill over the Order entry.
    expect(window.location.hash).toBe("#bill");
    // Simulate the browser landing on a stale #pay entry (a Forward after leaving Pay).
    window.history.pushState(null, "", "/cart?cart=cart-1#pay");
    const before = window.history.length;
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(window.location.hash).toBe("#bill");
    expect(window.history.length).toBe(before);
  });
});

describe("Phase 1b — the pay gate needs someone who can send", () => {
  it("a table with NO host is never locked — nobody there could send", () => {
    // MUTATION: ignore host presence — a staff-started table whose diners all came by invite link
    // could never pay; red.
    mount({
      splitContext: {
        mode: "dinein",
        mySeat: MY_SEAT,
        myRole: "guest",
        members: [],
        tableNumber: 7,
        qrCode: null,
      },
      initialItems: [{ ...ITEM, lineState: "draft", fulfillment: "dinein" }],
    });
    fireEvent.click(screen.getByRole("button", { name: /View bill/i }));
    const pay = screen.getByRole("button", { name: /^Pay · \$12\.00/ });
    expect(pay.getAttribute("aria-disabled")).toBeNull();
    expect(pay.getAttribute("aria-describedby")).toBeNull();
    expect(payReason()).toBeNull();
    expect(document.body.textContent).not.toContain("sends the table’s order");
  });
});

describe("Phase 1b — a bill the page OPENS on still has its Order step behind it (Codex round 1)", () => {
  it("seeds #bill over the entry it loaded on, so Back walks to the Order stage, not off /cart", async () => {
    // MUTATION: skip the seeding push — Back from an opening Bill leaves /cart (skipping the Order
    // stage the in-page "Back to your order" promises); red.
    window.history.replaceState(null, "", "/cart?cart=cart-1");
    const before = window.history.length;
    mount({
      splitContext: {
        mode: "dinein",
        mySeat: MY_SEAT,
        myRole: "host",
        members: [{ seat: MY_SEAT, name: "Me", role: "host" }],
        tableNumber: 7,
        qrCode: null,
      },
      initialItems: [{ ...ITEM, lineState: "fired" }],
    });
    expect(window.location.hash).toBe("#bill");
    expect(window.history.length).toBe(before + 1);
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect(window.location.hash).toBe(""));
    // The Order stage: the bill door is back, the Bill's own back control is gone.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Back to your order/i })).toBeNull(),
    );
    expect(screen.getByRole("button", { name: /View bill/i })).toBeTruthy();
  });

  it("an Order stage the page opens on pushes nothing", () => {
    window.history.replaceState(null, "", "/cart?cart=cart-1");
    const before = window.history.length;
    mount({
      splitContext: {
        mode: "dinein",
        mySeat: MY_SEAT,
        myRole: "host",
        members: [{ seat: MY_SEAT, name: "Me", role: "host" }],
        tableNumber: 7,
        qrCode: null,
      },
      initialItems: [{ ...ITEM, lineState: "draft" }],
    });
    expect(window.location.hash).toBe("");
    expect(window.history.length).toBe(before);
  });
});

/**
 * Phase 1c · cart-motion — a removed line leaves IN PLACE, and focus lands on the user's own place.
 *
 * Every removal case mocks the POST-removal truth: `setQty` and `getCartView` resolve the view
 * WITHOUT the removed line. The file's default (`view()`, i.e. Mohinga back in the list) would make
 * an accepted removal's refresh put the line straight back — a degenerate fixture on which "the
 * ghost dropped" and "the line returned" look the same.
 *
 * jsdom has no layout (every rect is 0), no `Element.animate`, no `inert` behaviour and no
 * `matchMedia`, so the hook takes its no-motion path here — which is also the reduced-motion path.
 * The cases that need a measured layout install `stubLayout()`: each element's top is its
 * in-flow sibling index × 100px plus its parent's, so taking a row out of flow moves exactly the rows
 * after it, the way the real list does. Timing cases hold the clock (`vi.useFakeTimers`, the file's
 * pattern) and advance it by frames.
 */
const truth = (items: CartItem[]) => {
  h.setQty.mockResolvedValue(view({ items }));
  h.getCartView.mockResolvedValue(view({ items }));
};
const lineLi = (id: string) =>
  Array.from(document.querySelectorAll<HTMLLIElement>(`li[data-line-id="${id}"]`));
const ghosts = () => Array.from(document.querySelectorAll<HTMLLIElement>("li.mms-remove"));
const nameOf = (id: string) =>
  document.querySelector<HTMLElement>(`li[data-line-id="${id}"]:not(.mms-remove) [data-line-name]`);
async function frames(ms = 32) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
/** A one-dimensional layout: each element sits at (in-flow siblings before it) × 100px below its
 *  parent's top, and an element written `position: absolute` inline leaves the flow. */
function stubLayout() {
  const ROW = 100;
  const top = (el: Element): number => {
    const parent = el.parentElement;
    if (!parent) return 0;
    let n = 0;
    for (let s = el.previousElementSibling; s; s = s.previousElementSibling)
      if ((s as HTMLElement).style?.position !== "absolute") n += 1;
    return top(parent) + n * ROW;
  };
  return vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
    this: Element,
  ) {
    const t = top(this);
    return {
      top: t,
      bottom: t + ROW,
      left: 0,
      right: 0,
      width: 0,
      height: ROW,
      x: 0,
      y: t,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

describe("Phase 1c — a removed line leaves in place", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("removing a dish leaves an inert, hidden ghost in its place", async () => {
    truth([ITEM_B]);
    mount({ initialItems: [ITEM, ITEM_B] });
    await press("Remove Mohinga");
    await frames();
    const ohn = lineLi(LINE_B)[0]!;
    // MUTATION: stop passing `r.leaving` — the ghost renders as a live row, 2 listitems, red.
    expect(within(ohn.closest("ul")!).getAllByRole("listitem")).toHaveLength(1);
    const g = document.querySelectorAll(
      `li.mms-remove[inert][aria-hidden="true"][data-line-id="${LINE}"]`,
    );
    // MUTATION: the <ul> maps `viewItems` — no ghost at all, red.
    expect(g).toHaveLength(1);
    // MUTATION: anchor the ghost after the FOLLOWING row — it trails Ohn No, red.
    expect(g[0]!.compareDocumentPosition(ohn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a ghost never writes, even where `inert` is not honoured", async () => {
    // jsdom does not honour `inert` (nor `pointer-events`), which makes it exactly the old engine
    // this guard exists for: Safari before 15.5 would let a keyboard reach the fading controls. A
    // dine-in to-go line carries the stepper and (3c-i) the ⋯ that opens the For here / To go ·
    // "Send to kitchen now" sheet — so pressing every button in its ghost exercises every guard.
    const A = { ...ITEM, fulfillment: "togo" as const };
    const B = { ...ITEM_B, fulfillment: "togo" as const };
    truth([B]);
    mount({ splitContext: DINE_IN, initialItems: [A, B] });
    await press("Remove Mohinga");
    h.setQty.mockClear();
    const inGhost = Array.from(ghosts()[0]!.querySelectorAll("button"));
    expect(inGhost.length).toBeGreaterThanOrEqual(3); // −, +, ⋯
    await act(async () => {
      inGhost.forEach((btn) => btn.click());
    });
    // MUTATION: drop any one `leaving` guard — a deleted line writes again (or opens a sheet over a
    // dish that is gone), red.
    expect(h.setQty).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.setLineFulfillment).not.toHaveBeenCalled();
    expect(h.makeItNow).not.toHaveBeenCalled();
  });

  it("the ghost ends on its OWN animationend, not a descendant's", async () => {
    truth([ITEM_B]);
    mount({ initialItems: [ITEM, ITEM_B] });
    await press("Remove Mohinga");
    const ghost = ghosts()[0]!;
    // The stepper's count digit carries `.mms-pop`; its animationend bubbles through the row.
    await act(async () => {
      ghost.querySelector("button")!.dispatchEvent(new Event("animationend", { bubbles: true }));
    });
    // MUTATION: drop `e.target === e.currentTarget` — a descendant's pop ends the exit, red.
    expect(ghosts()).toHaveLength(1);
    await act(async () => {
      ghost.dispatchEvent(new Event("animationend", { bubbles: true }));
    });
    expect(ghosts()).toHaveLength(0);
  });

  it("a ghost is gone by its bound — the gesture window without motion, a second with it", async () => {
    truth([ITEM_B]);
    mount({ initialItems: [ITEM, ITEM_B] });
    await press("Remove Mohinga");
    await frames(349);
    expect(ghosts()).toHaveLength(1);
    // MUTATION: delete the SAME_GESTURE_MS drop — the no-motion ghost waits for the full bound, red.
    await frames(1);
    expect(ghosts()).toHaveLength(0);
    cleanup();

    // With WAAPI present the hook takes the motion path, and only the bound backs up the fade.
    const animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }));
    Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true });
    try {
      mount({ initialItems: [ITEM, ITEM_B] });
      await press("Remove Mohinga");
      await frames(999);
      expect(ghosts()).toHaveLength(1);
      // MUTATION: delete LEAVE_BOUND_MS — a ghost whose animationend never comes stays forever, red.
      await frames(1);
      expect(ghosts()).toHaveLength(0);
    } finally {
      delete (Element.prototype as { animate?: unknown }).animate;
    }
  });

  it("rows BELOW a removal are held from taps; rows above are not", async () => {
    truth([ITEM, ITEM_C]);
    mount({ initialItems: [ITEM, ITEM_B, ITEM_C] });
    await press("Remove Ohn No Khao Swè");
    // MUTATION: skip the hold — a quick second tap lands on Shan Noodles as it slides up, red.
    expect(lineLi(LINE_C)[0]!.hasAttribute("data-settling")).toBe(true);
    // MUTATION: hold the whole list — Mohinga never moved and would eat a deliberate tap, red.
    expect(lineLi(LINE)[0]!.hasAttribute("data-settling")).toBe(false);
    await frames(350);
    // MUTATION: never release — the rest of the list stays dead to taps, red.
    expect(document.querySelectorAll("[data-settling]")).toHaveLength(0);
  });

  it("a refused removal comes back once, in place, and holds the rows below", async () => {
    stubLayout();
    let refuse!: (e: Error) => void;
    h.setQty.mockReturnValueOnce(
      new Promise((_, reject) => {
        refuse = reject;
      }),
    );
    h.getCartView.mockResolvedValue(view({ items: [ITEM, ITEM_B] }));
    mount({ initialItems: [ITEM, ITEM_B] });
    await press("Remove Mohinga");
    expect(ghosts()).toHaveLength(1);
    // The refusal lands 300ms in: the tap's own hold on Ohn No has 50ms left. Anything still holding
    // it at 400ms is the hold the RETURN put on it.
    await frames(300);
    await act(async () => {
      refuse(new Error("Order is locked while someone checks out"));
    });
    await frames(32);
    // MUTATION: drop BOTH live-wins filters (reconcileLines' and mergeLeaving's) — two Mohinga rows,
    // red. In the render either filter alone suffices, so each is pinned by itself in
    // line-motion.test.ts ("a returning id loses its ghost and is reported").
    expect(lineLi(LINE)).toHaveLength(1);
    expect(ghosts()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Remove Mohinga" })).toBeTruthy();
    expect(
      lineLi(LINE)[0]!.compareDocumentPosition(lineLi(LINE_B)[0]!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // No out-of-flow style survives on the returned row.
    expect(lineLi(LINE)[0]!.style.position).toBe("");
    await frames(68); // 400ms after the tap
    // MUTATION: skip the returned-id hold — Ohn No slides DOWN under a finger with no hold, red.
    expect(lineLi(LINE_B)[0]!.hasAttribute("data-settling")).toBe(true);
  });

  it("a refusal that lands after the ghost dropped: the row remounts in place and the rows below are held", async () => {
    stubLayout();
    let refuse!: (e: Error) => void;
    h.setQty.mockReturnValueOnce(
      new Promise((_, reject) => {
        refuse = reject;
      }),
    );
    h.getCartView.mockResolvedValue(view({ items: [ITEM, ITEM_B] }));
    mount({ initialItems: [ITEM, ITEM_B] });
    await press("Remove Mohinga");
    await frames(400); // the ghost dropped at 350, and every hold from the tap has released
    expect(lineLi(LINE)).toHaveLength(0);
    expect(lineLi(LINE_B)[0]!.hasAttribute("data-settling")).toBe(false);
    await act(async () => {
      refuse(new Error("Order is locked while someone checks out"));
    });
    await frames(32);
    expect(lineLi(LINE)).toHaveLength(1);
    expect(
      lineLi(LINE)[0]!.compareDocumentPosition(lineLi(LINE_B)[0]!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(lineLi(LINE)[0]!.style.position).toBe("");
    // MUTATION: measure a remounted row without first taking it out of flow — 'before' equals
    // 'after', nothing reads as moved, and Ohn No slides down under a finger unheld, red.
    expect(lineLi(LINE_B)[0]!.hasAttribute("data-settling")).toBe(true);
  });
});

describe("Phase 1c — focus lands on the user's own place", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("removing a dish lands focus on the NEXT dish's name, in place", async () => {
    truth([ITEM_B]);
    mount({ initialItems: [ITEM, ITEM_B] });
    screen.getByRole("button", { name: "Remove Mohinga" }).focus();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    await press("Remove Mohinga");
    await frames();
    const a = document.activeElement as HTMLElement;
    // MUTATION: land on the heading — an H1 at the top of the page, red.
    // MUTATION: land on the neighbour's stepper — a BUTTON whose "−" at qty 1 IS "Remove Ohn No", red.
    expect(a.hasAttribute("data-line-name")).toBe(true);
    expect(a.textContent).toBe(ITEM_B.name);
    expect(a.closest("li")!.getAttribute("data-line-id")).toBe(LINE_B);
    expect(focus).toHaveBeenCalled();
    // MUTATION: drop `preventScroll` — the page jumps to wherever the name is, red.
    for (const call of focus.mock.calls) expect(call[0]).toEqual({ preventScroll: true });
  });

  it("removing the last dish in the list lands on the PREVIOUS dish", async () => {
    truth([ITEM]);
    mount({ initialItems: [ITEM, ITEM_B] });
    screen.getByRole("button", { name: `Remove ${ITEM_B.name}` }).focus();
    await press(`Remove ${ITEM_B.name}`);
    await frames();
    // MUTATION: forward-only landing — nothing after it, focus stays in the inert ghost, red.
    expect(document.activeElement).toBe(nameOf(LINE));
  });

  it("removing the ONLY dish lands on the empty-cart heading", async () => {
    truth([]);
    mount({ initialItems: [ITEM] });
    screen.getByRole("button", { name: "Remove Mohinga" }).focus();
    await press("Remove Mohinga");
    await frames();
    expect(screen.getByText(t("en", "emptyCartTitle"))).toBeTruthy();
    // MUTATION: drop `ref={headingRef}` from the empty h1, or the swap effect — <body>, red.
    const a = document.activeElement as HTMLElement;
    expect(a.tagName).toBe("H1");
    expect(a.textContent).toContain("Your order");
  });

  it("a tablemate removes a row you are NOT on: focus does not move", async () => {
    mount({ initialItems: [ITEM, ITEM_B] });
    const mine = screen.getByRole("button", { name: `Add another ${ITEM.name}` });
    mine.focus();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    h.getCartView.mockResolvedValue(view({ items: [ITEM] }));
    await syncFromServer();
    await frames();
    // MUTATION: land whenever ANY row is removed — the diner is yanked off their own control, red.
    expect(document.activeElement).toBe(mine);
    expect(focus).not.toHaveBeenCalled();
  });

  it("on a phone where taps never take focus, a tablemate's removal of a DRAFT line moves nothing", async () => {
    mount({ initialItems: [ITEM, ITEM_B] });
    expect(document.activeElement).toBe(document.body);
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    h.getCartView.mockResolvedValue(view({ items: [ITEM] }));
    await syncFromServer();
    await frames();
    // MUTATION: revert S2.2 to `draftCount < prev` — a REMOVED draft reads as fired, heading, red.
    // MUTATION: treat <body> alone as "focus was in the removed row" — every iOS removal lands, red.
    expect(document.activeElement).toBe(document.body);
    expect(focus).not.toHaveBeenCalled();
  });

  it("a tablemate removes the row you ARE on: focus lands on its neighbour, in place", async () => {
    mount({ initialItems: [ITEM, ITEM_B] });
    screen.getByRole("button", { name: `Add another ${ITEM_B.name}` }).focus();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    h.getCartView.mockResolvedValue(view({ items: [ITEM] }));
    await syncFromServer();
    await frames();
    // MUTATION: no server-driven landing — focus stays inside the inert ghost, red.
    expect(document.activeElement).toBe(nameOf(LINE));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("same-length interleaving: one refresh removes your row and adds another", async () => {
    mount({ initialItems: [ITEM, ITEM_B] });
    screen.getByRole("button", { name: `Add another ${ITEM_B.name}` }).focus();
    h.getCartView.mockResolvedValue(view({ items: [ITEM, ITEM_C] }));
    await syncFromServer();
    await frames();
    // MUTATION: key the landing on a length DECREASE — two in, two out, nothing fires, red.
    expect(document.activeElement).toBe(nameOf(LINE));
  });

  it("a section that empties under you (no ghost) still lands", async () => {
    mount({ initialItems: [ITEM, { ...ITEM_B, fulfillment: "togo" }] });
    screen.getByRole("button", { name: `Add another ${ITEM_B.name}` }).focus();
    h.getCartView.mockResolvedValue(view({ items: [ITEM] }));
    await syncFromServer();
    await frames();
    // MUTATION: detect only by activeElement inside [inert] (drop the list's focus record) — the row
    // unmounted outright, focus is on <body>, and nothing can tell it was there, red.
    expect(document.activeElement).toBe(nameOf(LINE));
  });

  it("S2.2 kept: a line FIRED under a lost focus still parks focus on the heading", async () => {
    mount({ initialItems: [ITEM] });
    h.getCartView.mockResolvedValue(view({ items: [{ ...ITEM, lineState: "fired" }] }));
    await syncFromServer();
    await frames();
    // MUTATION: firedSince always false — a fired line's stepper unmounts and focus is left on
    // <body> with no cue, red.
    const a = document.activeElement as HTMLElement;
    expect(a.tagName).toBe("H1");
  });
});

describe("Phase 1c — a Remove that was a “−” a moment ago ignores the tap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("swallows the second half of a double-tap, and takes the next tap after the window", async () => {
    const ONE: CartItem = { ...ITEM, qty: 1 };
    h.setQty.mockResolvedValue(view({ items: [ONE] }));
    h.getCartView.mockResolvedValue(view({ items: [ONE] }));
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    mount({ initialItems: [{ ...ITEM, qty: 2 }] });
    await press(`Decrease ${ITEM.name} quantity`);
    now.mockReturnValue(1200);
    await press(`Remove ${ITEM.name}`);
    // MUTATION: delete the removeHeld check in stepper.tsx — the double-tap deletes the dish, red.
    expect(h.setQty).not.toHaveBeenCalledWith(LINE, 0);
    now.mockReturnValue(1350);
    await press(`Remove ${ITEM.name}`);
    expect(h.setQty).toHaveBeenCalledWith(LINE, 0);
  });

  it("a Remove that MOUNTED at the minimum is never held", async () => {
    truth([]);
    vi.spyOn(performance, "now").mockReturnValue(0);
    mount({ initialItems: [ITEM] });
    await press(`Remove ${ITEM.name}`);
    // MUTATION: arm on EVERY "−" (not just the morph) — the first Remove of a qty-1 line is eaten, red.
    expect(h.setQty).toHaveBeenCalledWith(LINE, 0);
  });
});

// ── Phase 2c · review fixes · reg2 ──
describe("a refused tap re-says its reason on every tap (review open question)", () => {
  const HOST = {
    mode: "dinein",
    mySeat: MY_SEAT,
    myRole: "host" as const,
    members: [{ seat: MY_SEAT, name: "Me", role: "host" as const }],
    tableNumber: 7,
    qrCode: null,
  };
  /** Mutations inside the Bill's one polite region, from the moment this is called. */
  function watchRegion(text: string) {
    const region = screen.getAllByRole("status").find((r) => r.textContent === text)!;
    expect(region).toBeTruthy();
    const records: MutationRecord[] = [];
    const obs = new MutationObserver((r) => records.push(...r));
    obs.observe(region, { childList: true, subtree: true, characterData: true });
    return {
      region,
      changes: () => {
        records.push(...obs.takeRecords());
        return records.length;
      },
      stop: () => obs.disconnect(),
    };
  }

  it("a SECOND tap on the dimmed 'Pay at the counter' changes the region again — the same sentence is said twice", async () => {
    mount({ splitContext: HOST, initialItems: [{ ...ITEM, lineState: "draft" }] });
    fireEvent.click(screen.getByRole("button", { name: /View bill/i }));
    const counter = screen.getByRole("button", { name: /Pay at the counter/i });
    const said = "Send everything to the kitchen first — then pay at the counter.";
    await act(async () => {
      fireEvent.click(counter);
    });
    const w = watchRegion(said);
    await act(async () => {
      fireEvent.click(counter);
    });
    // MUTATION (p2c-reg2/checkout-refused-tap-not-renumbered): set the same string again — React
    // skips a same-value state, nothing in the region changes, and a screen reader hears nothing
    // for the second tap; red.
    expect(w.changes()).toBeGreaterThan(0);
    expect(w.region.textContent).toBe(said);
    w.stop();
  });

  it("a refused tap is never masked by a standing pay error — it clears it, as every handler does", async () => {
    // A failed counter ask leaves a pay error in the region; then a guest's dish lands unsent.
    mount({ splitContext: HOST, initialItems: [{ ...ITEM, lineState: "fired" }] });
    h.requestCounterPay.mockRejectedValueOnce(new Error("fetch failed"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Pay at the counter/i }));
    });
    expect(regionText()).toContain("Couldn’t reach the counter just now");
    h.getCartView.mockResolvedValue(view({ items: [{ ...ITEM, lineState: "draft" }] }));
    await syncFromServer();
    const counter = screen.getByRole("button", { name: /Pay at the counter/i });
    expect(counter.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(counter);
    });
    // MUTATION (p2c-reg2/checkout-refusal-under-a-pay-error): keep the pay error — the region
    // renders `payError ?? status`, so the tap's reason is hidden behind a stale failure; red.
    expect(regionText()).toContain(
      "Send everything to the kitchen first — then pay at the counter.",
    );
    expect(regionText()).not.toContain("Couldn’t reach the counter just now");
  });

  it("the Pay button's own blocked tap re-says too — the same region, the same rule", async () => {
    mount({ splitContext: HOST, initialItems: [{ ...ITEM, lineState: "draft" }] });
    fireEvent.click(screen.getByRole("button", { name: /View bill/i }));
    const pay = screen.getByRole("button", { name: /^Pay · \$12\.00/ });
    const said = "Send everything to the kitchen first — then the bill is ready to pay.";
    await act(async () => {
      fireEvent.click(pay);
    });
    const w = watchRegion(said);
    await act(async () => {
      fireEvent.click(pay);
    });
    // MUTATION (p2c-reg2/checkout-region-not-keyed): the region's text is not keyed on the tap —
    // the second tap changes nothing; red.
    expect(w.changes()).toBeGreaterThan(0);
    expect(w.region.textContent).toBe(said);
    w.stop();
  });
});

// ── Phase 3c-i — the bill as a receipt (D13 · D14 · D16 · D17) ──
describe("Phase 3c-i (D16) — Pay keeps its name and states its ONE reason", () => {
  const TABLE = (role: "host" | "guest") => ({
    mode: "dinein",
    mySeat: MY_SEAT,
    myRole: role,
    members: [
      { seat: PEER_SEAT, name: "Aung", role: "host" as const },
      { seat: MY_SEAT, name: "Me", role: "guest" as const },
    ],
    tableNumber: 7,
    qrCode: null,
  });

  it("a GUEST with unsent dishes is told WHO sends — the reason, never the label", () => {
    mount({ splitContext: TABLE("guest"), initialItems: [{ ...ITEM, lineState: "draft" }] });
    fireEvent.click(screen.getByRole("button", { name: /View bill/i }));
    // A table of two: the label is "Pay the whole order · $X" — and still never the refusal.
    const pay = screen.getByRole("button", { name: /^Pay the whole order · \$12\.00/ });
    expect(pay.getAttribute("aria-disabled")).toBe("true");
    // MUTATION (checkout-verb/guest-unsent-copy-orders-the-guest-to-send): the host's sentence for
    // every role — a guest is told to send what only Aung can; red.
    expect(payReason()).toBe("Aung sends them — then the bill is ready to pay.");
    fireEvent.click(pay);
    expect(regionText()).toContain("Aung sends them — then the bill is ready to pay.");
  });

  it("a tablemate's lock is the reason 'Waiting for {name} to finish' — the label is still 'Pay ·', and every tap re-says it", async () => {
    mount({
      splitContext: {
        ...TABLE("host"),
        myRole: "host",
        members: [
          { seat: MY_SEAT, name: "Me", role: "host" as const },
          { seat: PEER_SEAT, name: "Tin", role: "guest" as const },
        ],
      },
      initialItems: [{ ...ITEM, lineState: "fired" }],
      initialLocked: true,
      initialLockedBy: PEER_SEAT,
    });
    const pay = screen.getByRole("button", { name: /^Pay the whole order · \$12\.00/ });
    expect(pay.getAttribute("aria-disabled")).toBe("true");
    expect(pay.hasAttribute("disabled")).toBe(false);
    // MUTATION (checkout-verb/peer-lock-dropped-from-pay): the peer arm deleted — Pay reads live
    // under a lock create-intent refuses with 409; red.
    expect(payReason()).toBe("Waiting for Tin to finish");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await act(async () => {
      fireEvent.click(pay);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(regionText()).toContain("Waiting for Tin to finish");
    fetchSpy.mockRestore();
  });
});

describe("Phase 3c-i (D14) — the Total door and the Bill hero read ONE figure", () => {
  const HOST = {
    mode: "dinein",
    mySeat: MY_SEAT,
    myRole: "host" as const,
    members: [{ seat: MY_SEAT, name: "Me", role: "host" as const }],
    tableNumber: 7,
    qrCode: null,
  };

  it("with a tip previewed, the door's figure, its name and the Bill's hero total agree — a tip-less second sum separates", async () => {
    window.history.replaceState(null, "", "/cart?cart=cart-1");
    // One dish still a draft (the quiet door, the Send hero), one with the kitchen.
    mount({ splitContext: HOST, initialItems: [ITEM, { ...ITEM_B, lineState: "fired" }] });
    fireEvent.click(screen.getByRole("button", { name: "Total · $12.00 — View bill" }));
    await press(/20%/);
    const heroFigure = document.querySelector(".vt-cart-total")!.textContent;
    expect(heroFigure).toBe("14.4"); // $12.00 + 20% = $14.40 (NumberFlow is mocked to the raw value)
    expect(document.querySelectorAll(".vt-cart-total")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Back to your order/i }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    // The Order stage: the quiet door (Send is the hero), named with the SAME figure and labelled
    // as the preview it is.
    // …its NAME opens with that visible label (WCAG 2.5.3) and ends with the verb.
    const door = await screen.findByRole("button", {
      name: "Estimated total · $14.40 — View bill",
    });
    // MUTATION (checkout/total-door-drops-the-previewed-tip): the door reads `totals.totalCents` —
    // $12.00 beside a Bill that says $14.40, the price jumping between two adjacent taps; red.
    expect(door.textContent).toContain("Estimated total");
    expect(door.textContent).toContain("14.4");
    expect(door.classList.contains("checkout-cta")).toBe(false);
    expect(document.querySelectorAll(".vt-cart-total")).toHaveLength(1);
    expect(door.getAttribute("aria-disabled")).toBeNull();
  });

  it("the door reads 'Total' while no tip is previewed, and 'View bill' (not '& pay') while Pay is held", () => {
    mount({ splitContext: HOST, initialItems: [{ ...ITEM, lineState: "draft" }] });
    // MUTATION (checkout-verb/door-promises-pay-while-held): "View bill & pay" over a Bill whose
    // Pay is dimmed for the unsent dish; red.
    // MUTATION (checkout/door-name-drops-its-visible-label): named "View bill · $12.00" while it
    // SHOWS "Total · $12.00" — label not in name (WCAG 2.5.3); red.
    const door = screen.getByRole("button", { name: "Total · $12.00 — View bill" });
    expect(door.textContent).toContain("Total");
    expect(door.textContent).not.toContain("Estimated");
    expect(door.querySelector("dl")).toBeNull();
    expect(door.classList.contains("checkout-cta")).toBe(false);
    // PD1 (m1 decision 4; DESIGN-LANGUAGE §21) — W19's "N items not sent yet" door note is gone: a
    // table's cart is SHARED, so no count names it. RED if the note comes back.
    expect(document.body.textContent).not.toMatch(/\d+ items? not sent yet/);
  });
});

describe("Phase 3c-i (D17) — the line is a receipt row; its choices live behind ⋯", () => {
  const GROCERY: CartItem = { ...ITEM_B, fulfillment: "grocery" };

  it("⋯ renders only on a draft, editable dine-in food line", () => {
    // A GUEST at a table of two: Mohinga is THEIR line (editable), Ohn No is the host's draft (a
    // guest may not move another seat's dish), and the rest are with the kitchen or not food.
    mount({
      splitContext: { ...DINE_IN, myRole: "guest" } as typeof DINE_IN,
      initialItems: [
        { ...ITEM, bySeat: MY_SEAT },
        { ...ITEM_B, bySeat: PEER_SEAT },
        { ...ITEM_C, lineState: "served" },
        { ...ITEM_C, id: "line-fired", name: "Fired", lineState: "fired" },
        { ...ITEM_C, id: "line-comped", name: "Comped", lineState: "fired", comped: true },
        GROCERY,
      ],
    });
    // MUTATION (checkout/line-sheet-offered-on-a-fired-line): the gate drops `canEdit` — the
    // permission (`canMutateLine`: a diner edits DRAFT lines only, a guest only their own), so a ⋯
    // appears on a dish the kitchen already has, or on a tablemate's, opening a sheet whose every
    // write the server refuses; red.
    expect(screen.getAllByRole("button", { name: /^More for /i })).toHaveLength(1);
    const more = screen.getByRole("button", { name: "More for Mohinga" });
    expect(more.getAttribute("aria-haspopup")).toBe("dialog");
    expect(more.classList.contains("checkout-pill-on")).toBe(false);
    // Nothing of the old card controls remains on the card.
    expect(screen.queryByRole("group", { name: /Where .* goes/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Send to kitchen now/i })).toBeNull();
  });

  it("no ⋯ on a pickup cart — the sheet's choices are a table's", () => {
    mount({ splitContext: PICKUP });
    expect(screen.queryByRole("button", { name: /^More for /i })).toBeNull();
  });

  it("'To go' reaches setLineFulfillment, the sheet closes, and focus returns to that line's ⋯", async () => {
    mount({ splitContext: DINE_IN });
    await openLineSheet();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("group", { name: "Where Mohinga goes" })).toBeTruthy();
    await press("To go");
    expect(h.setLineFulfillment).toHaveBeenCalledWith(LINE, "togo");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "More for Mohinga" })),
    );
  });

  it("a line that stops being a draft closes its open sheet and lands focus on the line's name", async () => {
    mount({ splitContext: DINE_IN });
    await openLineSheet();
    // A tablemate's send fired it while the sheet was open: the subject is gone.
    h.getCartView.mockResolvedValue(view({ items: [{ ...ITEM, lineState: "fired" }] }));
    await syncFromServer();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: /^More for /i })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(nameOf(LINE)));
  });

  it("under a tablemate's lock the pills stay RENDERED and aria-disabled, and nothing reaches the server", async () => {
    mount({ splitContext: DINE_IN, initialLocked: true, initialLockedBy: PEER_SEAT });
    await openLineSheet();
    const dialog = screen.getByRole("dialog");
    const togo = within(dialog).getByRole("button", { name: "To go" });
    expect(togo.getAttribute("aria-disabled")).toBe("true");
    expect(togo.hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(togo);
    });
    expect(h.setLineFulfillment).not.toHaveBeenCalled();
    // The sheet carries its OWN single region (Radix hides the page's under an open dialog).
    expect(within(dialog).getAllByRole("status")).toHaveLength(1);
  });
});

describe("PD2 — the counter-only Bill: one docked door, no card hero, and the pass after the ask", () => {
  const FIRED: CartItem = { ...ITEM, lineState: "fired" };
  const HOST = {
    mode: "dinein",
    mySeat: MY_SEAT,
    myRole: "host" as const,
    members: [{ seat: MY_SEAT, name: "Me", role: "host" as const }],
    tableNumber: 7,
    qrCode: null,
  };
  const GUEST = {
    mode: "dinein",
    mySeat: MY_SEAT,
    myRole: "guest" as const,
    members: [
      { seat: PEER_SEAT, name: "Aye", role: "host" as const },
      { seat: MY_SEAT, name: "Me", role: "guest" as const },
    ],
    tableNumber: 7,
    qrCode: null,
  };
  const dockLine = () => document.getElementById("counter-door-line")?.textContent ?? "";
  // The door as SHIPPED: parked.
  beforeEach(() => {
    flags.phonePayOpen = false;
  });
  afterEach(() => {
    flags.phonePayOpen = true;
  });

  it("everything sent: no Pay, no tip ask, no separate total — the slip's own foot carries the total and the docked door says the next step once", async () => {
    mount({ splitContext: HOST, initialItems: [FIRED] });
    // Land on the Bill (the stage picks it: everything is with the kitchen).
    expect(screen.queryByRole("button", { name: /^Pay( the whole order)? · / })).toBeNull();
    expect(screen.queryByRole("group", { name: /Add a little extra/ })).toBeNull();
    expect(screen.queryByText(/Estimated total/)).toBeNull();
    const door = screen.getByRole("button", { name: /^Pay at the counter/ });
    expect(door.classList.contains("checkout-cta")).toBe(true);
    expect(door.getAttribute("aria-disabled")).toBeNull();
    // The one line slot, at rest, directly above the door.
    expect(dockLine()).toContain("The counter takes cash.");
    expect(door.getAttribute("aria-describedby")).toBeNull();
    // No card words anywhere on the Bill.
    expect(document.body.textContent).not.toMatch(/card/i);
    // The slip's foot is the total — the server's figure, once.
    expect(screen.getByText("Total")).toBeTruthy();
  });

  it("a dish still to send HOLDS the door with the reason in the slot, never a count — and the host's tap re-says it", async () => {
    mount({ splitContext: HOST, initialItems: [{ ...ITEM, qty: 2 }, FIRED] });
    await press("Total · $12.00 — View bill");
    const door = screen.getByRole("button", { name: /^Pay at the counter/ });
    expect(door.getAttribute("aria-disabled")).toBe("true");
    expect(door.hasAttribute("disabled")).toBe(false);
    expect(door.getAttribute("aria-describedby")).toBe("counter-door-line");
    expect(dockLine()).toContain("Send everything to the kitchen first — then pay at the counter.");
    // The mark above the slip: the console's two words, no number (DESIGN-LANGUAGE §21).
    expect(screen.getByText("Not sent yet")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\d+ items? (haven’t|not sent)/);
    expect(screen.getByRole("button", { name: /Back to send them/ })).toBeTruthy();
    await press(/^Pay at the counter/);
    expect(h.requestCounterPay).not.toHaveBeenCalled();
    await settle();
    expect(regionText()).toContain(
      "Send everything to the kitchen first — then pay at the counter.",
    );
  });

  it("a GUEST's held door names who sends (checkout/unsent-counter-guest-told-to-send)", async () => {
    mount({ splitContext: GUEST, initialItems: [ITEM, FIRED] });
    // A guest with drafts WAITS (PD1 — "Show a server" is the hero): the Total door is the quiet one.
    await press("Total · $12.00 — View bill");
    // MUTATION (checkout/unsent-counter-guest-told-to-send): the host's sentence for every role —
    // a guest is told to send dishes only Aye can; red.
    expect(dockLine()).toContain(
      "Aye sends everything to the kitchen first — then pay at the counter.",
    );
    expect(screen.queryByRole("button", { name: /Back to send them/ })).toBeNull();
  });

  it("the Order stage's door reads 'View bill', never '& pay', while phone pay is parked (checkout/door-ignores-the-parked-door)", async () => {
    mount({ splitContext: HOST, initialItems: [FIRED] });
    // Back to the order: everything is sent, nothing blocks — the one arm that used to say "& pay".
    await press(/Back to your order/);
    // MUTATION (checkout/door-ignores-the-parked-door): the flag handed in as always-open — the
    // door promises a Pay the counter-only Bill does not have; red.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^View bill · \$12\.00$/ })).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: /View bill & pay/ })).toBeNull();
  });

  it("the ask: the phone becomes the pass — the heading, the rail's Pay, the figure, the total, the withdraw last; the dock is gone", async () => {
    mount({ splitContext: HOST, initialItems: [FIRED] });
    // The re-read after the ask carries the stamp the server confirmed.
    h.getCartView.mockResolvedValue(
      view({ items: [FIRED], counterRequestedAt: "2026-09-18T06:00:00.000Z" }),
    );
    await press(/^Pay at the counter/);
    await waitFor(() => expect(counterCards()).toBe(1));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Pay at the counter");
    // The pass is post-pay's CounterPass, named by its heading: the lead tongue's label + the
    // figure ONCE ("Table 7"), the figure printed once at the counter tier.
    expect(screen.getByRole("heading", { level: 2, name: "Table 7" })).toBeTruthy();
    expect(document.querySelector('.ui-pass[data-tier="counter"]')).toBeTruthy();
    expect(
      screen.queryByText("Show this to whoever’s at the register — they take cash."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Pay at the counter/ })).toBeNull();
    expect(document.getElementById("counter-door-line")).toBeNull();
    // The rail: Order done, Bill done, Pay current — the ask IS the paying step.
    const current = document.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain("Pay");
    // The withdraw, last, named by its visible words first.
    const withdraw = screen.getByRole("button", {
      name: "We’re not done yet — cancel paying at the counter",
    });
    expect(withdraw.textContent).toContain("We’re not done yet");
    // The receipt is folded into "View bill".
    const disclose = screen.getByRole("button", { name: /^View bill/ });
    expect(disclose.getAttribute("aria-expanded")).toBe("false");
    await press(/^View bill/);
    expect(disclose.getAttribute("aria-expanded")).toBe("true");
    // Focus went to the heading on THIS phone's own ask.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 })),
    );
  });

  it("the withdraw says 'No rush' — never the parked tip-and-Pay sentence", async () => {
    mount({
      splitContext: HOST,
      initialItems: [FIRED],
      initialCounterRequestedAt: "2026-10-08T06:00:00.000Z",
    });
    await press("We’re not done yet — cancel paying at the counter");
    await settle();
    expect(regionText()).toContain("No rush — your bill’s here when you’re ready.");
    expect(regionText()).not.toContain("pick a tip");
    await waitFor(() => expect(counterCards()).toBe(0));
  });

  it("a TABLEMATE's ask lands as a view flip and is said once; a standing ask at mount is not an event", async () => {
    h.getCartView.mockResolvedValue(view({ items: [FIRED] }));
    mount({ splitContext: HOST, initialItems: [FIRED] });
    expect(regionText()).not.toContain("Your table asked");
    h.getCartView.mockResolvedValue(
      view({ items: [FIRED], counterRequestedAt: "2026-10-08T06:00:00.000Z" }),
    );
    await syncFromServer();
    await waitFor(() => expect(counterCards()).toBe(1));
    await settle();
    expect(regionText()).toContain("Your table asked to pay at the counter.");
    expect(h.requestCounterPay).not.toHaveBeenCalled();
  });

  it("a GROUP table under the register's freeze keeps the Bill and its held door — never the split board (blind pass, guard 6)", () => {
    // While phone pay is parked no phone pays a share (the self-serve split is parked too, and its
    // shares are phone payments), so a group's freeze is the REGISTER's. RED before the fix: the
    // group flipped to the split board — "splitting the bill" — during the counter's cash settle.
    const GROUP_HOST = {
      ...HOST,
      members: [
        { seat: MY_SEAT, name: "Me", role: "host" as const },
        { seat: PEER_SEAT, name: "Tin", role: "guest" as const },
      ],
    };
    mount({ splitContext: GROUP_HOST, initialItems: [FIRED], initialSettling: true });
    // MUTATION (checkout/split-board-under-the-register): the board shown for any group freeze; red.
    expect(screen.queryByTestId("settlement-board")).toBeNull();
    expect(document.body.textContent).not.toContain("splitting the bill");
    const door = screen.getByRole("button", { name: /^Pay at the counter/ });
    expect(door.getAttribute("aria-disabled")).toBe("true");
    expect(dockLine()).toContain("The counter is taking your table’s payment right now");
  });

  it("the register mid-settle holds the door with its own sentence, never the split's", async () => {
    mount({ splitContext: HOST, initialItems: [FIRED], initialSettling: true });
    const door = screen.getByRole("button", { name: /^Pay at the counter/ });
    expect(door.getAttribute("aria-disabled")).toBe("true");
    expect(dockLine()).toContain("The counter is taking your table’s payment right now");
    expect(document.body.textContent).not.toContain("splitting the bill");
  });

  // ── The blind pass on #331 (head e90e4da): three criticals, each through the real interleaving ──

  const ASKED = "2026-10-08T06:00:00.000Z";
  for (const how of ["refused", "thrown"] as const) {
    it(`a ${how} withdraw on a phone that did NOT ask restores the ask SILENTLY and keeps the real error (blind pass, critical 1)`, async () => {
      // Phone B: the ask is a tablemate's (standing at mount, never this phone's tap).
      if (how === "refused")
        h.withdrawCounterPay.mockResolvedValue({
          ok: false,
          error: "This order’s already paid — there’s nothing to cancel.",
        });
      else h.withdrawCounterPay.mockRejectedValue(new Error("network"));
      mount({ splitContext: HOST, initialItems: [FIRED], initialCounterRequestedAt: ASKED });
      expect(counterCards()).toBe(1);
      await press("We’re not done yet — cancel paying at the counter");
      await settle();
      await settle();
      // RED before the fix: the optimistic null then the revert is a null→stamp edge, announced as
      // a NEW ask — and `sayOutcome` cleared the pay error it had just set.
      expect(regionText()).not.toContain("Your table asked");
      expect(regionText()).toContain(
        how === "refused"
          ? "This order’s already paid — there’s nothing to cancel."
          : "Couldn’t reach the counter just now — please try again.",
      );
      expect(counterCards()).toBe(1);
    });
  }

  it("a read landing DURING the withdraw that carries the same ask is not a new ask (blind pass, critical 1)", async () => {
    const answer = deferred<{ ok: true }>();
    h.withdrawCounterPay.mockReturnValue(answer.promise);
    h.getCartView.mockResolvedValue(view({ items: [FIRED], counterRequestedAt: ASKED }));
    mount({ splitContext: HOST, initialItems: [FIRED], initialCounterRequestedAt: ASKED });
    await press("We’re not done yet — cancel paying at the counter");
    // A realtime echo / visibility read lands while the withdraw is out: it still shows the ask.
    await syncFromServer();
    await settle();
    expect(regionText()).not.toContain("Your table asked");
    h.getCartView.mockResolvedValue(view({ items: [FIRED], counterRequestedAt: null }));
    await act(async () => {
      answer.resolve({ ok: true });
    });
    await settle();
    expect(regionText()).not.toContain("Your table asked");
  });

  it("an ask landing while the promo field has focus never strands the docked door hidden (blind pass, critical 2)", async () => {
    mount({ splitContext: HOST, initialItems: [FIRED] });
    const promo = screen.getByRole("textbox", { name: /promo/i });
    await act(async () => {
      promo.focus();
      fireEvent.focus(promo);
    });
    // The dock hides while the field has focus (it never rides the keyboard).
    expect(screen.queryByRole("button", { name: /^Pay at the counter/ })).toBeNull();
    // A tablemate's ask lands: the pass replaces the form — React removes the focused input in its
    // own commit, and fires no blur for it.
    h.getCartView.mockResolvedValue(view({ items: [FIRED], counterRequestedAt: ASKED }));
    await syncFromServer();
    await waitFor(() => expect(counterCards()).toBe(1));
    // …and is withdrawn: the Bill — and its ONE door — come back.
    h.getCartView.mockResolvedValue(view({ items: [FIRED], counterRequestedAt: null }));
    await syncFromServer();
    await waitFor(() => expect(counterCards()).toBe(0));
    expect(screen.getByRole("button", { name: /^Pay at the counter/ })).toBeTruthy();
  });

  it("a split-read miss draws the dock AND the padding that clears it — one binding (blind pass, critical 3)", () => {
    mount({ splitContext: null, initialViewMode: "dinein", initialItems: [FIRED] });
    expect(screen.getByRole("button", { name: /^Pay at the counter/ })).toBeTruthy();
    // MUTATION (checkout/dock-padding-reads-the-split-mode): the padding gated on the split's mode;
    // the promo form and RewardField sit under the dock and cannot scroll clear; red.
    expect(document.querySelector("main")!.style.paddingBottom).toContain("--cta-dock-h");
  });

  it("the amount the register reads is the SERVER's total — on the parked slip's foot and on the pass (blind pass, guard 5)", async () => {
    // Total ≠ subtotal (tax), so a binding that reads the wrong figure separates.
    const TAXED: CartTotals = { ...TOTALS, taxCents: 126, totalCents: 1326 };
    mount({ splitContext: HOST, initialItems: [FIRED], initialTotals: TAXED });
    // MUTATION (checkout/parked-foot-reads-the-subtotal): the slip's foot reads `subtotalCents`; red.
    const slip = document.querySelector(".checkout-receipt")!;
    expect(slip.textContent).toContain("13.26");
    cleanup();
    mount({
      splitContext: HOST,
      initialItems: [FIRED],
      initialTotals: TAXED,
      initialCounterRequestedAt: "2026-10-08T06:00:00.000Z",
    });
    expect(counterCards()).toBe(1);
    // MUTATION (checkout/pass-total-reads-the-subtotal): the pass reads `subtotalCents`; red.
    expect(document.querySelector(".counter-pass-amount")!.textContent).toBe("13.26");
  });

  // ── Codex round 2 on #331 (head 5c074e1) ──

  it("a missed split read cannot un-park the door: the cart view's mode answers it (comment 4226408727)", async () => {
    // `app/cart/page.tsx` passes `null` on any getSplitContext failure; the view's mode comes from
    // the fail-closed authorization read. RED before the fix: the door asked the split's mode, saw
    // null, and drew the card hero + tip ask at a table create-intent refuses (410).
    mount({ splitContext: null, initialViewMode: "dinein", initialItems: [FIRED] });
    expect(screen.queryByRole("button", { name: /^Pay( the whole order)? · / })).toBeNull();
    expect(screen.queryByRole("group", { name: /Add a little extra/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Pay at the counter/ })).toBeTruthy();
  });

  it("a TO-GO draft added after the ask keeps the pass's 'Not sent yet' — it reaches the kitchen only when the counter settles (comment 4226408743)", async () => {
    // RED before the fix: the pass read the dine-in-only `kitchenDraftQty`, so a to-go dish (which
    // fires only when payment lands) dropped the mark the pre-ask Bill showed for it.
    const TOGO: CartItem = { ...ITEM_B, fulfillment: "togo", lineState: "draft" };
    mount({
      splitContext: HOST,
      initialItems: [FIRED, TOGO],
      initialCounterRequestedAt: "2026-10-08T06:00:00.000Z",
    });
    // A to-go draft lands the page on the Order stage; the door leads to the Bill (and the pass).
    if (!counterCards()) await press(/View bill/);
    await waitFor(() => expect(counterCards()).toBe(1));
    // MUTATION (checkout/pass-drops-a-togo-draft): the pass reads `kitchenDraftQty`; red.
    const marks = screen.getAllByText("Not sent yet");
    expect(marks).toHaveLength(1);
    expect(marks[0]!.closest(".ui-track")).not.toBeNull();
  });

  // ── Codex round 1 on #331 (head c253013): three P2s, each pinned red-first ──

  it("a tablemate's withdrawal ends this phone's claim on the ask: the NEXT ask is said as theirs (comment 4222692016)", async () => {
    h.getCartView.mockResolvedValue(view({ items: [FIRED] }));
    mount({ splitContext: HOST, initialItems: [FIRED] });
    // This phone asks; the re-read confirms the stamp.
    h.getCartView.mockResolvedValue(
      view({ items: [FIRED], counterRequestedAt: "2026-10-08T06:00:00.000Z" }),
    );
    await press(/^Pay at the counter/);
    await waitFor(() => expect(counterCards()).toBe(1));
    await settle();
    expect(regionText()).not.toContain("Your table asked");
    // A tablemate withdraws it — the view says no ask.
    h.getCartView.mockResolvedValue(view({ items: [FIRED], counterRequestedAt: null }));
    await syncFromServer();
    await waitFor(() => expect(counterCards()).toBe(0));
    // …and asks again. RED before the fix: `ownAsk` still true from this phone's earlier tap, so
    // the edge was read as this phone's own — silent, focus moved unconditionally.
    h.getCartView.mockResolvedValue(
      view({ items: [FIRED], counterRequestedAt: "2026-10-08T06:05:00.000Z" }),
    );
    await syncFromServer();
    await waitFor(() => expect(counterCards()).toBe(1));
    await settle();
    expect(regionText()).toContain("Your table asked to pay at the counter.");
  });

  it("the pass replaces the Bill: the split chooser does not sit under its withdraw (comment 4222692029)", async () => {
    // A group table (two members) with everything sent: the Bill, with the split chooser.
    mount({ splitContext: GUEST, initialItems: [FIRED] });
    expect(screen.getByTestId("split-section")).toBeTruthy();
    cleanup();
    // The same table under a standing ask: the pass, and nothing after its withdraw.
    mount({
      splitContext: GUEST,
      initialItems: [FIRED],
      initialCounterRequestedAt: "2026-10-08T06:00:00.000Z",
    });
    expect(counterCards()).toBe(1);
    expect(screen.queryByTestId("split-section")).toBeNull();
    const withdraw = screen.getByRole("button", {
      name: "We’re not done yet — cancel paying at the counter",
    });
    // The withdraw is the LAST control on the screen (the dialogs' and the header's aside).
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>("main button, main a, main input"),
    );
    expect(controls[controls.length - 1]).toBe(withdraw);
  });

  it("the unsent state is said ONCE while the pass shows — the pass's head owns it (comment 4222692039)", async () => {
    // A draft added after the ask (a tablemate's late dish): the mark above the slip AND the pass's
    // head both drew "Not sent yet" — twice for every reader.
    mount({
      splitContext: HOST,
      initialItems: [ITEM, FIRED],
      initialCounterRequestedAt: "2026-10-08T06:00:00.000Z",
    });
    await press("Total · $12.00 — View bill");
    await waitFor(() => expect(counterCards()).toBe(1));
    const marks = screen.getAllByText("Not sent yet");
    expect(marks).toHaveLength(1);
    expect(marks[0]!.closest(".ui-track")).not.toBeNull();
    expect(document.querySelector(".checkout-unsent-mark")).toBeNull();
  });
});

describe("PD1 — a tablemate's dish waits on the host's Send (m1 'Next Stop: Kitchen')", () => {
  const STAMP_AT = "2026-10-08T09:59:30.000Z";
  const GUEST = {
    mode: "dinein",
    mySeat: MY_SEAT,
    myRole: "guest" as const,
    members: [
      { seat: PEER_SEAT, name: "Aye", role: "host" as const },
      { seat: MY_SEAT, name: "Thiri", role: "guest" as const },
    ],
    tableNumber: 7,
    qrCode: null,
  };
  const HOST = {
    ...GUEST,
    mySeat: PEER_SEAT,
    myRole: "host" as const,
  };
  const DRAFT: CartItem = { ...ITEM, qty: 2 };
  beforeEach(() => {
    flags.phonePayOpen = false;
    h.nudgeHost.mockResolvedValue({ ok: true, nudgedAt: STAMP_AT });
  });
  afterEach(() => {
    flags.phonePayOpen = true;
  });
  const wait = () => screen.queryByRole("region", { name: /Not sent yet/ });
  const showServer = () => screen.queryByRole("button", { name: /^Show a server/ });

  it("the guest WAITS: the next step and who takes it, two ways forward, one filled verb, no count", () => {
    mount({ splitContext: GUEST, initialItems: [DRAFT] });
    const block = wait();
    expect(block).not.toBeNull();
    // Phase 1b's sentence, verbatim, named from the table's own names.
    expect(block!.textContent).toContain(
      "Aye sends the table’s order to the kitchen — your dishes go with it.",
    );
    expect(screen.getByRole("button", { name: /^Let Aye know/ })).toBeTruthy();
    expect(block!.textContent).toContain("If Aye is away, our staff can send it too.");
    // "Show a server" is the ONE filled verb; the Total door is quiet beside it.
    const verb = showServer()!;
    expect(verb.classList.contains("checkout-cta")).toBe(true);
    expect(verb.getAttribute("aria-haspopup")).toBe("dialog");
    expect(verb.getAttribute("aria-describedby")).toBe("wait-staff");
    expect(document.querySelectorAll(".checkout-cta")).toHaveLength(1);
    expect(
      screen
        .getByRole("button", { name: "Total · $12.00 — View bill" })
        .classList.contains("checkout-cta"),
    ).toBe(false);
    // No count anywhere on a shared cart before the Send.
    expect(document.body.textContent).not.toMatch(/\d+ items? not sent yet/);
  });

  it("'Let Aye know' writes once, settles in place, and says the confirmation through the one region", async () => {
    mount({ splitContext: GUEST, initialItems: [DRAFT] });
    await press(/^Let Aye know/);
    expect(h.nudgeHost).toHaveBeenCalledWith({ cartId: CART });
    await settle();
    const nudge = screen.getByRole("button", { name: /^Let Aye know/ });
    expect(nudge.getAttribute("aria-disabled")).toBe("true");
    expect(nudge.getAttribute("aria-describedby")).toBe("nudge-seen");
    expect(document.getElementById("nudge-seen")!.textContent).toContain(
      "Aye can see you’re waiting.",
    );
    expect(regionText()).toContain("Aye can see you’re waiting.");
    // The settled control writes nothing more.
    await press(/^Let Aye know/);
    expect(h.nudgeHost).toHaveBeenCalledTimes(1);
  });

  it("a refused nudge says the action's sentence and settles nothing", async () => {
    h.nudgeHost.mockResolvedValue({
      ok: false,
      reason: "error",
      error: "That didn’t go through — please try again.",
    });
    mount({ splitContext: GUEST, initialItems: [DRAFT] });
    await press(/^Let Aye know/);
    await settle();
    expect(regionText()).toContain("That didn’t go through — please try again.");
    expect(
      screen.getByRole("button", { name: /^Let Aye know/ }).getAttribute("aria-disabled"),
    ).toBeNull();
    expect(document.getElementById("nudge-seen")).toBeNull();
  });

  it("an unnamed host ('Guest') is never read as a person: the role sentence, and no nudge", () => {
    mount({
      splitContext: {
        ...GUEST,
        members: [
          { seat: PEER_SEAT, name: "Guest", role: "host" as const },
          { seat: MY_SEAT, name: "Thiri", role: "guest" as const },
        ],
      },
      initialItems: [DRAFT],
    });
    expect(wait()!.textContent).toContain(
      "One person at your table sends the order to the kitchen",
    );
    expect(document.body.textContent).not.toContain("Guest sends");
    expect(screen.queryByRole("button", { name: /^Let / })).toBeNull();
    expect(wait()!.textContent).toContain("If they’re away, our staff can send it too.");
    expect(showServer()).not.toBeNull();
  });

  it("under a tablemate's pay lock both ways forward hide — nobody, staff included, can send", () => {
    mount({
      splitContext: GUEST,
      initialItems: [DRAFT],
      initialLocked: true,
      initialLockedBy: PEER_SEAT,
    });
    expect(wait()).not.toBeNull();
    expect(showServer()).toBeNull();
    expect(screen.queryByRole("button", { name: /^Let Aye know/ })).toBeNull();
    expect(document.body.textContent).not.toContain("our staff can send it too");
  });

  it("a HOSTLESS table does not wait: nobody at the table sends, and the bill door stays the hero", () => {
    mount({
      splitContext: {
        ...GUEST,
        members: [{ seat: MY_SEAT, name: "Thiri", role: "guest" as const }],
      },
      initialItems: [DRAFT],
    });
    expect(wait()).toBeNull();
    expect(showServer()).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /^View bill · \$12\.00$/ })
        .classList.contains("checkout-cta"),
    ).toBe(true);
  });

  it("'Show a server' is the table's pass: the figure once, the dishes, 'Not sent yet' — and it flips only past the grace", async () => {
    mount({
      splitContext: GUEST,
      initialItems: [DRAFT],
      initialTableNumber: 7,
      initialServerNow: "2026-10-08T10:00:00.000Z",
    });
    await press(/^Show a server/);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { level: 2, name: "Table 7" })).toBeTruthy();
    expect(dialog.querySelector('.ui-pass[data-tier="counter"]')).not.toBeNull();
    const list = within(dialog).getByRole("list");
    expect(list.textContent).toContain("Mohinga");
    // The kitchen's qty token: a multiple is filled.
    expect(list.querySelector('.pass-dish-qty[data-many="true"]')!.textContent).toBe("2");
    const status = within(dialog).getByRole("status");
    expect(status.textContent).toContain("Not sent yet");
    // No prices, no total on the ticket.
    expect(dialog.textContent).not.toMatch(/\$/);
    // Dad sends: the view shows the line fired but INSIDE its grace — "Sending…", never the past tense.
    h.getCartView.mockResolvedValue(
      view({
        items: [{ ...DRAFT, lineState: "fired", fireAt: "2026-10-08T10:00:05.000Z" }],
        serverNow: "2026-10-08T10:00:00.000Z",
      }),
    );
    await syncFromServer();
    // MUTATION (checkout/pass-flips-on-the-device-clock): the status read against this phone's
    // clock instead of the view's server clock — "Sent to kitchen" inside the grace; red.
    await waitFor(() => expect(status.textContent).toContain("Sending…"));
    expect(status.textContent).not.toContain("Sent to kitchen");
    // The re-read past the grace: the first stamp.
    h.getCartView.mockResolvedValue(
      view({
        items: [{ ...DRAFT, lineState: "fired", fireAt: "2026-10-08T10:00:05.000Z" }],
        serverNow: "2026-10-08T10:00:05.400Z",
      }),
    );
    await syncFromServer();
    await waitFor(() => expect(status.textContent).toContain("Sent to kitchen"));
    expect(dialog.querySelector('.ui-track[data-stage="sent"]')).not.toBeNull();
    // The ticket keeps showing what was sent.
    expect(within(dialog).getByRole("list").textContent).toContain("Mohinga");
  });

  it("a table with no number yet (bound at Send) holds up its CODE at the holder tier, spelt", async () => {
    mount({
      splitContext: { ...GUEST, tableNumber: null, qrCode: "7C2E9A" },
      initialItems: [DRAFT],
    });
    await press(/^Show a server/);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector('.ui-pass[data-tier="holder"]')).not.toBeNull();
    expect(
      within(dialog).getByRole("heading", { level: 2, name: "Table 7 C 2 E 9 A" }),
    ).toBeTruthy();
  });

  it("every listed dish REMOVED closes the pass — a removal never reads as a send", async () => {
    mount({ splitContext: GUEST, initialItems: [DRAFT] });
    await press(/^Show a server/);
    await screen.findByRole("dialog");
    h.getCartView.mockResolvedValue(view({ items: [] }));
    await syncFromServer();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("the HOST finds the guest's wait above Send, with the caption; a guest's phone never draws it", () => {
    const stamp = { seat: MY_SEAT, at: STAMP_AT };
    mount({
      splitContext: HOST,
      initialMySeat: PEER_SEAT,
      initialItems: [DRAFT],
      initialSendNudge: stamp,
    });
    expect(document.getElementById("nudge-line")!.textContent).toContain(
      "Thiri is waiting on this send.",
    );
    expect(document.getElementById("send-caption")!.textContent).toContain(
      "The kitchen sees it when the countdown ends.",
    );
    // The host never waits on themselves.
    expect(wait()).toBeNull();
    cleanup();
    mount({ splitContext: GUEST, initialItems: [DRAFT], initialSendNudge: stamp });
    expect(document.getElementById("nudge-line")).toBeNull();
    // …but the nudger's own confirmation follows the stamp.
    expect(document.getElementById("nudge-seen")!.textContent).toContain(
      "Aye can see you’re waiting.",
    );
  });
});
