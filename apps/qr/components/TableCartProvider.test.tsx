/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import type { CartItem, CartTotals } from "@mms/db";
import type { getCartView } from "@/lib/cart";
import { classifyRefusedWrite, refusedWriteClause, refusedWriteNotice } from "@/lib/cart-freeze";
import { mayClaimLanding, mayRetry, threadableView } from "@/lib/write-outcome";
import type { WriteResult } from "@/lib/write-outcome";

/**
 * T18 — the WIRING of the /menu refusal recovery, which until now nothing could see.
 *
 * `classifyRefusedWrite` / `refusalNeedsRemint` / `refusedWriteNotice` / `recoveredWrite` are each
 * pinned in `lib/`. What was unpinned is the code that CALLS them: `explainCaught`, the two catch
 * arms that route through it, and the fork that decides whether a diner is told a refusal, told
 * nothing was confirmed, or told nothing at all. Every one of those lives here, in a `.tsx` that
 * `check-child-freeze` skips (this file imports the cart actions from `lib/`, but its CONSUMERS
 * import them from the context, so the guard's `localToExported` map is empty for them) and that
 * `check-money-coverage` skipped by suffix. Deleting `explainCaught` and restoring the
 * unconditional `revalidate()` — the M116/T14 fabricated diagnosis, verbatim — would have left the
 * whole gate green.
 *
 * ## The mocks, and why each is unavoidable
 *
 * THREE are hard import-time blockers: `server-only` throws from its main entry, and this module
 * reaches it three separate ways — `@/lib/cart` → `@mms/db/server`, `@/lib/members`, and
 * `./PickupSlotSheet` → `@/lib/pickup`. (42 existing node suites already stub `server-only` the
 * same way; here the whole modules are replaced, because the test drives them.)
 *
 * TWO are the seams the fixtures steer: `@/lib/useTableSession` supplies the session and the
 * `revalidate` whose call count proposition 4 asserts, and `@/lib/realtime` would otherwise open a
 * Supabase channel. `@mms/ui` is left REAL — the only thing imported from it here is `Icon`, which
 * is pure SVG.
 *
 * Everything is observed through the ONE live region (`role="status"`) and through the values the
 * context hands out. No internal is reached into.
 */

const h = vi.hoisted(() => ({
  addItem: vi.fn(),
  setQty: vi.fn(),
  getCartView: vi.fn(),
  revalidate: vi.fn(),
  session: {
    current: null as null | {
      cartId: string;
      seat: string;
      sessionId: string;
      accessToken: string;
      role: "host" | "guest";
      joinCode: string | null;
      tableNumber: number | null;
      created: boolean;
    },
  },
}));

vi.mock("@/lib/cart", () => ({
  addItem: h.addItem,
  setQty: h.setQty,
  getCartView: h.getCartView,
}));
vi.mock("@/lib/members", () => ({ setDisplayName: vi.fn(async () => {}) }));
vi.mock("./PickupSlotSheet", () => ({ PickupSlotSheet: () => null }));
vi.mock("@/lib/useTableSession", () => ({
  useTableSession: () => ({
    session: h.session.current,
    loading: false,
    error: null,
    revalidate: h.revalidate,
  }),
}));
vi.mock("@/lib/realtime", () => ({
  useCartRealtime: () => {},
  useGroupCart: () => ({ members: [] }),
}));

const { TableCartProvider, useCart } = await import("./TableCartProvider");

const CART = "cart-1";
const MY_SEAT = "seat-me";
const PEER_SEAT = "seat-peer";
const ITEM = "item-mohinga";

/**
 * ⚠️ BUILT AS A REAL `CartItem`, WITH NO CAST — and the first draft proves why. It was written
 * `{ menu_item_id: ITEM, … } as unknown as CartItem`, which type-checks and is WRONG: the field is
 * `menuItemId`, so `classifyAddLanding` saw no line of this dish, reported no growth, and the
 * landing test failed for a reason that had nothing to do with the code under test. A cast over a
 * fixture silences the one check that would have caught it.
 */
/** A line for a DIFFERENT dish — proof the mount read landed, without touching the delta under test. */
const OTHER_DISH: CartItem = {
  id: "line-other",
  menuItemId: "item-salad",
  name: "Tea Leaf Salad",
  qty: 1,
  modifiers: [],
  unitPriceCents: 900,
  taxCents: 0,
  lineState: "draft",
  fulfillment: "togo",
};

const line = (qty: number, id = "line-1"): CartItem => ({
  id,
  menuItemId: ITEM,
  name: "Mohinga",
  qty,
  modifiers: [],
  unitPriceCents: 1200,
  taxCents: 0,
  lineState: "draft",
  fulfillment: "togo",
});

const NO_TOTALS: CartTotals = {
  subtotalCents: 0,
  discountCents: 0,
  rewardCents: 0,
  rewardFaceCents: 0,
  promoCents: 0,
  serviceChargeCents: 0,
  taxCents: 0,
  tipCents: 0,
  totalCents: 0,
};

/** A `getCartView` payload, typed by the action's own return so a drifted field cannot pass. The
 *  freeze axes (`locked`/`lockedBy`/`settling`/`mySeat`) are what the refusal fork reads. */
type CartView = Awaited<ReturnType<typeof getCartView>>;
const view = (over: Partial<CartView> = {}): CartView => ({
  items: [],
  totals: NO_TOTALS,
  pickupSlot: null,
  fireAt: null,
  locked: false,
  lockedBy: null,
  mySeat: MY_SEAT,
  settling: false,
  settleBy: null,
  tabType: "none",
  ...over,
});

/** The cart as a peer sees it while THEY are checking out — the T14 case that used to say
 *  "Reconnecting to your table…" and re-mint a session that was perfectly alive. */
const LOCKED_BY_PEER = view({ locked: true, lockedBy: PEER_SEAT });

/**
 * The sentences the provider can ACTUALLY publish, DERIVED from the module that produces them.
 *
 * ⚠️ NEVER TRANSCRIBED (blind adversarial pass on #252, CRITICAL). The first draft asserted
 * `/checking out/i` against the live region — and no producible refusal contains that phrase; the
 * lock clause reads "…while someone CHECKS out". What satisfied the regex was an unrelated effect:
 * the recovery view flips `locked` false→true, and the lock-transition announcement writes
 * "Someone is checking out — the order's locked" into the SAME single slot. So the assertion was
 * green with `publishRefusal` deleted. Deriving the expectation from `refusedWriteNotice` makes that
 * class of mistake impossible, and is the repo's "never transcribe a value into an assertion" rule
 * applied to copy.
 *
 * ⚠️ AND THE "UNRELATED EFFECT" ABOVE WAS THE DEFECT, NOT JUST A TESTING HAZARD (T33). That the
 * banner could satisfy an assertion meant for the refusal is the same fact as: the banner OVERWRITES
 * the refusal, in the region the diner reads. #252 recorded it as a reason to assert elsewhere; this
 * slice reads it as a bug and fixes the arbitration, so the region is now a legitimate subject —
 * see the T33 block below, which asserts on it directly.
 */
const REFUSAL = {
  peerLock: classifyRefusedWrite({
    ok: true,
    freeze: { locked: true, lockedBy: PEER_SEAT, mySeat: MY_SEAT },
    settling: false,
  }),
  settling: classifyRefusedWrite({
    ok: true,
    freeze: { locked: false, lockedBy: null, mySeat: MY_SEAT },
    settling: true,
  }),
} as const;

/** What the LATCH holds — a fragment, since T32. */
const CLAUSE = {
  peerLock: refusedWriteClause(REFUSAL.peerLock),
  settling: refusedWriteClause(REFUSAL.settling),
};
/** What the TOAST says — the same classification, rendered as a whole sentence. */
const NOTICE = { peerLock: refusedWriteNotice(REFUSAL.peerLock) };

/**
 * Exposes the context to the test without pulling in AddButton or ItemSheet.
 *
 * The capture happens in an EFFECT, not during render: the React Compiler lint (which this repo
 * runs with the compiler enabled) rejects reassigning a binding declared outside the component from
 * the render body, and it is right on the merits — a render-phase write to module state is exactly
 * the impurity the compiler's memoization is allowed to reorder. `render()` flushes effects, so
 * `ctl` is populated by the time `mount()` returns, and re-populated on every context change.
 */
let ctl: ReturnType<typeof useCart>;
function Probe() {
  const c = useCart();
  useEffect(() => {
    ctl = c;
  }, [c]);
  return (
    <button type="button" onClick={() => void c.add(ITEM)}>
      probe-add
    </button>
  );
}

const mount = () =>
  render(
    <TableCartProvider mode="scango">
      <Probe />
    </TableCartProvider>,
  );

/** Everything the provider says, in the order it said it. One region, single slot. */
const spoken = () => screen.getByRole("status").textContent ?? "";

/**
 * Wait until the live region STOPS CHANGING, then read it (T33).
 *
 * ⚠️ A BARE `await waitFor(...)` IS NOT ENOUGH, and neither is a fixed number of turns — the first
 * draft of this helper was two `setTimeout(0)`s and it FAILED IN CI on a test that passed locally,
 * then failed locally on a DIFFERENT test when the suite was re-run. Both halves matter:
 *
 *  • `waitFor` is wrong for these assertions because it succeeds on the FIRST tick that satisfies
 *    them. The refusal sentence is published synchronously and the banner overwrites it a microtask
 *    later, so a `waitFor` for the refusal passes on a build where the banner still wins.
 *  • A fixed drain is wrong because the arrival it waits for is React's passive-effect flush
 *    (scheduler-driven) plus the microtask that effect queues. How many macrotask turns that takes
 *    is not a constant — it moved between one-file and whole-suite runs, which is exactly the
 *    difference between local and CI.
 *
 * So this waits for QUIESCENCE instead of guessing a duration: turns pass until the region's text is
 * unchanged three times running. That is correct for both directions — a banner that has not arrived
 * yet is still pending (the text is still moving), and a banner that would overwrite the refusal has
 * already done so by the time it settles. The blind pass raised the fixed drain as an open question
 * and I answered it from "the tests pass", which is how a timing dependence hides.
 */
const drainDeferredAnnounces = async () => {
  let previous: string | null = null;
  let unchangedTurns = 0;
  for (let turn = 0; turn < 50 && unchangedTurns < 3; turn += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const now = spoken();
    unchangedTurns = now === previous ? unchangedTurns + 1 : 0;
    previous = now;
  }
};

beforeEach(() => {
  h.addItem.mockReset();
  h.setQty.mockReset();
  h.getCartView.mockReset();
  h.revalidate.mockReset();
  h.session.current = {
    cartId: CART,
    seat: MY_SEAT,
    sessionId: "sess-1",
    accessToken: "tok",
    role: "host",
    joinCode: null,
    tableNumber: null,
    created: false,
  };
  h.getCartView.mockResolvedValue(view());
});

afterEach(cleanup);

/**
 * T33 — the single live region is ARBITRATED, so the sentence that names the dish survives the
 * banner that names nothing.
 *
 * ⚠️ THESE ASSERT THE REGION'S FINAL TEXT, deliberately — the one thing the rest of this file
 * refuses to assert on. Every other test here reads `lastRefusalClause()` precisely BECAUSE the
 * region was unreliable: its own comment says "a test reading only the region would pass with
 * `publishRefusal` deleted entirely". That was true, and T33 is that sentence read as a defect
 * rather than as a testing note. Now the region is the subject.
 */
describe("T33 — a freeze banner never overwrites the refusal that explained it", () => {
  it("keeps the refusal sentence when the recovery read is what flipped the lock", async () => {
    // Measured against HEAD before the fix: the region held "Someone is checking out — the order's
    // locked". Same fact as the refusal, minus the verdict and minus the dish, spoken second
    // because the transition effect defers through a microtask while `publishRefusal` is sync.
    // ⚠️ MOUNTS UNLOCKED, then locks only on the RECOVERY read (blind pass, MEDIUM). The first
    // draft resolved `LOCKED_BY_PEER` before `mount()` too, so the mount read and the recovery read
    // carried the same locked view and collapsed into ONE lock edge whose position relative to
    // `publishRefusal` was decided by when React happened to flush passive effects. The mutant would
    // then have survived silently on a different flush order. Locking only on recovery makes the
    // edge land strictly after the refusal, which is the ordering the defect is actually about.
    h.getCartView.mockResolvedValue(view());
    mount();
    await waitFor(() => expect(ctl.lastRefusalClause()).toBeNull());

    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockResolvedValue(LOCKED_BY_PEER);
    await ctl.add(ITEM);

    await waitFor(() => expect(ctl.lastRefusalClause()).toBe(CLAUSE.peerLock));
    await drainDeferredAnnounces();
    expect(spoken()).toBe(NOTICE.peerLock);
  });

  it("does NOT latch a freeze from a recovery read that LOST THE SCREEN", async () => {
    // ⚠️ A REAL OVERTAKE, because the first draft of this test was degenerate and the mutant
    // `t33/latch-survives-an-overtaken-read` SURVIVED it. That draft refused a write against an
    // EDITABLE view — so the cause was `unknown`, `explainedByRefusal` returned null anyway, and the
    // `viewIsCurrent` gate was never the thing under test.
    //
    // The separating input needs a recovery read that sees a LOCKED cart and still loses: a
    // mutation's own view is UNTICKETED and sets `applied = issued` (`view-seq.ts`), invalidating
    // every read in flight. So a concurrent successful write lands an unlocked view while the
    // refused write's recovery read is still awaiting.
    h.getCartView.mockResolvedValue(view());
    mount();
    await waitFor(() => expect(ctl.lastRefusalClause()).toBeNull());

    let releaseRecoveryRead: () => void = () => {};
    h.getCartView.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRecoveryRead = () => resolve(LOCKED_BY_PEER);
        }),
    );
    h.addItem.mockRejectedValueOnce(new Error("redacted"));
    const refused = ctl.add(ITEM);

    // A concurrent write COMMITS and applies its own view — untickted, so it outranks the read above.
    h.addItem.mockResolvedValueOnce(view({ items: [line(1)] }));
    await ctl.add(ITEM);

    releaseRecoveryRead();
    await refused;
    await drainDeferredAnnounces();

    // The freeze that read saw is not on screen, so nothing may claim it was explained — otherwise
    // no release edge can ever retire it and the next real lock is announced to nobody.
    h.getCartView.mockResolvedValue(LOCKED_BY_PEER);
    await ctl.refresh();
    await drainDeferredAnnounces();
    expect(spoken()).toContain("is checking out");
  });

  it("does not invite editing while the table is still splitting", async () => {
    // ⚠️ Rule 1 pins the release as ALWAYS spoken, so its copy has to be true of BOTH axes — a
    // pay-lock can lift while the split runs, and `addItem`/`setQty` still refuse on `settling`.
    // Without this the slice would have guarded a false sentence in rather than left it standing.
    h.getCartView.mockResolvedValue(
      view({ locked: true, lockedBy: PEER_SEAT, settling: true, settleBy: PEER_SEAT }),
    );
    mount();
    await drainDeferredAnnounces();

    h.getCartView.mockResolvedValue(view({ settling: true, settleBy: PEER_SEAT }));
    await ctl.refresh();
    await drainDeferredAnnounces();
    expect(spoken()).not.toContain("you can edit again");
  });

  it("does NOT latch a freeze when the refusal names no freeze at all", async () => {
    // ⚠️ THE SEPARATING INPUT the deleted per-write clear needed, and the blind pass's CRITICAL.
    // `explainCaught` classifies from the read it made even when `applyView` rejects it — the
    // refusal is a fact about the moment it looked. But latching that freeze claims something about
    // what the diner can SEE. If the winning view is unlocked, the rendered state never carries the
    // freeze, so no release edge can fire for it, and the next genuine lock would be silenced.
    //
    // Modelled as: the write is refused while the view on screen shows an editable cart. The latch
    // must not survive that, so the later real lock still announces.
    h.getCartView.mockResolvedValue(view());
    mount();
    h.addItem.mockRejectedValue(new Error("redacted"));
    await ctl.add(ITEM);
    await drainDeferredAnnounces();

    h.getCartView.mockResolvedValue(LOCKED_BY_PEER);
    await ctl.refresh();
    await drainDeferredAnnounces();
    expect(spoken()).toContain("is checking out");
  });

  it("announces the WIDER freeze when both enter on one view, and never the narrower alone", async () => {
    // ⚠️ THE BOTH-AXES CELL (blind pass, HIGH). `locked_at` and `settle_at` are independent, so one
    // applied view can carry both. `classifyRefusedWrite` tests settling first, so the refusal
    // explains `settling` — and under an equality-only rule the LOCK banner was let through and,
    // because its effect is declared first, became the surviving sentence. The region would have
    // swapped from the wider banner to the narrower one with the refusal still erased.
    h.getCartView.mockResolvedValue(view());
    mount();
    await waitFor(() => expect(ctl.lastRefusalClause()).toBeNull());

    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockResolvedValue(
      view({ locked: true, lockedBy: PEER_SEAT, settling: true, settleBy: PEER_SEAT }),
    );
    await ctl.add(ITEM);
    await drainDeferredAnnounces();
    expect(spoken()).not.toContain("is checking out");
  });

  it("clears the settle axis on ITS release, not only the lock axis", async () => {
    // ⚠️ THE SETTLE TWIN of the staleness bound (blind pass, HIGH): it shipped with neither mutant
    // nor test, so `if (!settling) explainedFreezeRef.current = null` could be deleted with the
    // whole gate green — on the axis this module calls the more consequential of the two.
    h.getCartView.mockResolvedValue(view());
    mount();
    await waitFor(() => expect(ctl.lastRefusalClause()).toBeNull());

    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockResolvedValue(view({ settling: true, settleBy: PEER_SEAT }));
    await ctl.add(ITEM);
    await drainDeferredAnnounces();

    h.getCartView.mockResolvedValue(view());
    await ctl.refresh();
    await drainDeferredAnnounces();

    h.getCartView.mockResolvedValue(view({ settling: true, settleBy: PEER_SEAT }));
    await ctl.refresh();
    await drainDeferredAnnounces();
    expect(spoken()).toContain("splitting the bill");
  });

  it("STILL announces a freeze the diner was never told about — the banner's whole reason to exist", async () => {
    // ⚠️ THE OVER-BLOCK GUARD, and the half a suppression rule is most likely to get wrong. This
    // banner exists for the diner who did NOTHING: a peer takes the lock while they browse and
    // every Add goes inert (W9b filed exactly that for the settle freeze). Silencing it here would
    // delete the feature rather than arbitrate it — and the paired test above would still pass.
    mount();
    await waitFor(() => expect(ctl.lastRefusalClause()).toBeNull());
    // A peer takes the lock with no write of ours in flight: nothing has explained anything.
    h.getCartView.mockResolvedValue(LOCKED_BY_PEER);
    await ctl.refresh();
    await drainDeferredAnnounces();
    expect(spoken()).toContain("is checking out");
  });

  it("STILL announces the release, even right after a refusal explained the lock", async () => {
    // Rule 1 at the wiring level. "You can edit again" is new information no refusal carries — a
    // refusal asserts the opposite — so a diner who is not told keeps believing the cart is frozen.
    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockResolvedValue(LOCKED_BY_PEER);
    mount();
    await ctl.add(ITEM);
    await waitFor(() => expect(ctl.lastRefusalClause()).toBe(CLAUSE.peerLock));
    await drainDeferredAnnounces();

    h.getCartView.mockResolvedValue(view());
    await ctl.refresh();
    await drainDeferredAnnounces();
    expect(spoken()).toContain("unlocked");
  });

  it("re-announces a lock the diner was not told about, after a release cleared the explanation", async () => {
    // ⚠️ THE STALENESS BOUND. `forgetRefusal` clears per WRITE; without the release-edge clear too,
    // a peer releasing and re-locking leaves "locked" latched and silences a banner about a freeze
    // nobody explained. Reachable with no write at all in between, which is why the per-write clear
    // alone is not enough.
    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockResolvedValue(LOCKED_BY_PEER);
    mount();
    await ctl.add(ITEM);
    await waitFor(() => expect(ctl.lastRefusalClause()).toBe(CLAUSE.peerLock));
    await drainDeferredAnnounces();

    h.getCartView.mockResolvedValue(view());
    await ctl.refresh();
    await drainDeferredAnnounces();

    h.getCartView.mockResolvedValue(LOCKED_BY_PEER);
    await ctl.refresh();
    await drainDeferredAnnounces();
    expect(spoken()).toContain("is checking out");
  });

  it("a SETTLE banner is not silenced by a LOCK refusal — they are separate axes", async () => {
    // The separating case for the axis rule, at the wiring level. `inertReason` fixes settling as
    // the widest and longest-lived state; an axis-blind suppression would drop the banner for the
    // more consequential freeze because the lesser one had been explained.
    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockResolvedValue(LOCKED_BY_PEER);
    mount();
    await ctl.add(ITEM);
    await waitFor(() => expect(ctl.lastRefusalClause()).toBe(CLAUSE.peerLock));
    await drainDeferredAnnounces();

    // ⚠️ THE LOCK MUST STAY HELD, and the first draft of this test proves why: it settled a cart
    // with `locked:false`, so the lock RELEASE edge fired first and cleared `explained` — after
    // which both the correct code and an axis-blind one speak, and the test separated nothing. The
    // mutant `t33/settle-banner-reads-the-lock-axis` SURVIVED against it. Keeping the lock held is
    // the input that separates them, and it is also the real shape: a table starts splitting the
    // bill while a peer's pay-lock is still up.
    h.getCartView.mockResolvedValue(
      view({ locked: true, lockedBy: PEER_SEAT, settling: true, settleBy: PEER_SEAT }),
    );
    await ctl.refresh();
    await drainDeferredAnnounces();
    expect(spoken()).toContain("splitting the bill");
  });
});

describe("a refused write is explained from a READ, never guessed", () => {
  it("names the peer's lock and does NOT re-mint the session", async () => {
    // T14's defect, exactly: this catch used to flash "Reconnecting to your table…" and call
    // `revalidate()` for EVERY throw — so a diner whose tablemate was checking out was told their
    // connection had dropped. Next redacts Server Action messages in production, so the cause
    // cannot be read off the error; it is re-established with one `getCartView`.
    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockResolvedValue(LOCKED_BY_PEER);
    mount();

    const result = await ctl.add(ITEM);

    expect(result.state).toBe("refused");
    // ⚠️ ASSERTED ON `lastRefusalClause()`, NOT ON THE REGION'S FINAL TEXT. The applied view turns
    // `locked` true, and the freeze announcement then lands in the SAME single slot — so a test
    // reading only the region would pass with `publishRefusal` deleted entirely. This is the value
    // `publishRefusal` alone writes, and the value `YourUsual` carries into its own copy.
    await waitFor(() => expect(ctl.lastRefusalClause()).toBe(CLAUSE.peerLock));
    // ⚠️ T32's BOUNDARY GUARD. The latch must carry the FRAGMENT, never the finished sentence —
    // `YourUsual` composes it into a sentence of its own that already opens with the same verdict,
    // so handing over the whole notice is what made the diner hear it twice.
    //
    // Asserted as "does not carry the sentence's OPENER", not as `not.toBe(NOTICE)`: the latter is
    // already implied by the `toBe(CLAUSE)` above, since a notice is by construction the clause plus
    // a prefix and can never equal it — an assertion that cannot fail for any implementation (blind
    // pass on #254). The opener test DOES fail the moment the sentence is latched instead.
    expect(ctl.lastRefusalClause()?.startsWith("That didn’t go through")).toBe(false);
    expect(NOTICE.peerLock.startsWith("That didn’t go through")).toBe(true);
    // The two arms this must NOT be: the re-mint vocabulary, and the settle freeze's clause.
    expect(ctl.lastRefusalClause()).not.toMatch(/[Rr]econnect/);
    expect(ctl.lastRefusalClause()).not.toBe(CLAUSE.settling);
    // The one arm that may re-mint is the arm that could not read the cart at all.
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it("re-mints ONLY when the re-read itself failed, and says so without naming a cause", async () => {
    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockRejectedValue(new Error("unreachable"));
    mount();

    const result = await ctl.add(ITEM);

    // Nothing was read, so nothing was established: this is ignorance, not a refusal.
    expect(result.state).toBe("unconfirmed");
    expect(mayRetry(result)).toBe(false);
    await waitFor(() => expect(h.revalidate).toHaveBeenCalledTimes(1));
  });

  it("carries the settle freeze's own vocabulary rather than a lock's", async () => {
    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockResolvedValue(view({ settling: true, settleBy: PEER_SEAT }));
    mount();

    const result = await ctl.add(ITEM);
    expect(result.state).toBe("refused");
    // The settle freeze has its OWN clause, and `classifyRefusedWrite` tests it FIRST to match
    // `inertReason`'s precedence — one cart must never get two freezes with different words.
    await waitFor(() => expect(ctl.lastRefusalClause()).toBe(CLAUSE.settling));
    expect(ctl.lastRefusalClause()).not.toBe(NOTICE.peerLock);
  });
});

describe("the optimistic claim is retracted when it cannot be confirmed", () => {
  it("replaces 'Added to your order' rather than leaving it standing", async () => {
    // Codex round 1 on #251 (P2). `mayClaimLanding` is false for `unconfirmed`, but the provider
    // had ALREADY flashed the optimistic claim on tap — and `AddButton`/`ItemSheet` never speak
    // afterwards, so for them that claim was the only sentence the diner ever heard. A predicate
    // that bars a claim is worth nothing if the claim is on screen and nothing retracts it.
    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockRejectedValue(new Error("unreachable"));
    mount();

    fireEvent.click(screen.getByText("probe-add"));
    await waitFor(() => expect(spoken()).toMatch(/Added to your order/));
    await waitFor(() => expect(spoken()).toMatch(/couldn’t confirm/i));
    expect(spoken()).not.toMatch(/Added to your order/);
  });

  it("does not lend an unconfirmed write a refusal's sentence", async () => {
    // `publishUnconfirmed` deliberately does not touch `lastRefusalRef`: that ref means "a refusal
    // the caller decided is real" and `YourUsual` carries it into its own copy. Handing it an
    // unconfirmed write's cause is the fabricated-diagnosis class again.
    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockRejectedValue(new Error("unreachable"));
    mount();

    const result = await ctl.add(ITEM);
    expect(result.state).toBe("unconfirmed");
    expect(ctl.lastRefusalClause()).toBeNull();
  });

  it("DOES remember a real refusal, so a consumer can carry it instead of erasing it", async () => {
    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockResolvedValue(LOCKED_BY_PEER);
    mount();

    await ctl.add(ITEM);
    await waitFor(() => expect(ctl.lastRefusalClause()).toBe(CLAUSE.peerLock));
  });
});

describe("a committed write says so, even when its view is unreadable", () => {
  it("a null mutation view plus a failed re-read is APPLIED — the row landed", async () => {
    // `viewAfterWrite` returns null only AFTER the row committed, so the mutation response has
    // already settled the outcome. Downgrading this to `unconfirmed` retracted a true success
    // notice and made `YourUsual` tell the diner a dish it HAD added could not be confirmed
    // (Codex round 4 on #251, P2).
    h.addItem.mockResolvedValue(null);
    h.getCartView.mockRejectedValue(new Error("unreachable"));
    mount();

    const result = await ctl.add(ITEM);

    expect(result.state).toBe("applied");
    expect(mayClaimLanding(result)).toBe(true);
    // ...but there is no list to hand the next queued write. Threading the pre-write snapshot here
    // is what made two rapid decrements from 3 set 2 twice instead of 2 then 1.
    expect(threadableView(result)).toBeNull();
    await waitFor(() => expect(spoken()).toMatch(/Added to your order/));
  });

  it("a null mutation view with a GOOD re-read carries that read onward", async () => {
    h.addItem.mockResolvedValue(null);
    h.getCartView.mockResolvedValue(view({ items: [line(1)] }));
    mount();

    const result = await ctl.add(ITEM);
    expect(result.state).toBe("applied");
    expect(threadableView(result)).toEqual([line(1)]);
  });

  it("a rejected add whose dish GREW in the re-read is a landing, not a refusal", async () => {
    // `addItem` commits the line, calls `touchCart`, and only THEN reads the view — so its promise
    // can reject with the add already in the cart. Reporting failure there is a lie the diner acts
    // on: `YourUsual` announces "we couldn't add X" and the retry adds it twice.
    // ⚠️ SEEDED WITH A DIFFERENT DISH, not with nothing. The first draft mounted on an empty cart
    // and then awaited `ctl.items` having length 0 — which `items` satisfies before any read lands,
    // so the assertion could not fail and established nothing about the pre-add snapshot (blind
    // adversarial pass on #252). A non-empty seed proves the mount read actually applied, while
    // still leaving OUR dish absent, which is what makes "grew" separable from "did not grow".
    h.getCartView.mockResolvedValue(view({ items: [OTHER_DISH] }));
    mount();
    await waitFor(() => expect(ctl.items).toEqual([OTHER_DISH]));
    h.addItem.mockRejectedValue(new Error("trailing read failed"));
    h.getCartView.mockResolvedValue(view({ items: [OTHER_DISH, line(1)] }));

    const result = await ctl.add(ITEM);
    expect(result.state).toBe("applied");
    expect(mayRetry(result)).toBe(false);
  });

  it("a rejected add whose dish did NOT move in the re-read IS a refusal", async () => {
    // The separating fixture for the assertion above — identical but for the delta. Without it an
    // implementation that answers `applied` for every successful re-read passes.
    h.getCartView.mockResolvedValue(view({ items: [OTHER_DISH] }));
    mount();
    await waitFor(() => expect(ctl.items).toEqual([OTHER_DISH]));
    h.addItem.mockRejectedValue(new Error("redacted"));
    // ⚠️ ONE AXIS. The first draft also set `locked`/`lockedBy` here, so the pair differed in BOTH
    // the delta and the freeze — and an implementation deriving `landed` from `fresh.locked` instead
    // of `classifyAddLanding` passed both halves (blind adversarial pass on #252).
    h.getCartView.mockResolvedValue(view({ items: [OTHER_DISH] }));

    const result = await ctl.add(ITEM);
    expect(result.state).toBe("refused");
    expect(mayRetry(result)).toBe(true);
  });
});

describe("setItemQty takes the same fork — T18 names BOTH catches", () => {
  beforeEach(() => {
    // Seed a line so the stepper has something to move.
    h.getCartView.mockResolvedValue(view({ items: [line(3)] }));
  });

  it("publishes a refusal when the re-read shows the line did not move", async () => {
    mount();
    await waitFor(() => expect(ctl.items).toEqual([line(3)]));
    h.setQty.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockResolvedValue(view({ items: [line(3)], locked: true, lockedBy: PEER_SEAT }));

    const result = await ctl.setItemQty("line-1", 2);

    expect(result.state).toBe("refused");
    // The refusal carries the recovery read — the freshest cart anyone has. Withholding it sent the
    // caller back to a stale local snapshot, and `setQty` is ABSOLUTE, so a stale baseline writes a
    // WRONG NUMBER over a concurrent host edit rather than losing a tap (Codex round 2 on #251).
    expect(threadableView(result)).toEqual([line(3)]);
    // ⚠️ ON `lastRefusalClause`, NOT ON THE REGION. `publishRefusal` is this value's ONLY writer, so
    // this reddens if the stepper's refusal publication is deleted — which a region assertion does
    // not, because the lock-transition announcement lands in the same slot from another effect.
    await waitFor(() => expect(ctl.lastRefusalClause()).toBe(CLAUSE.peerLock));
  });

  it("reports UNCONFIRMED, not refused, when the re-read could not see the cart", async () => {
    mount();
    await waitFor(() => expect(ctl.items).toEqual([line(3)]));
    h.setQty.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockRejectedValue(new Error("unreachable"));

    const result = await ctl.setItemQty("line-1", 2);

    expect(result.state).toBe("unconfirmed");
    expect(threadableView(result)).toBeNull();
    await waitFor(() => expect(spoken()).toMatch(/couldn’t confirm/i));
  });

  it("reports APPLIED when the re-read shows the line AT the absolute target", async () => {
    mount();
    await waitFor(() => expect(ctl.items).toEqual([line(3)]));
    h.setQty.mockRejectedValue(new Error("trailing read failed"));
    h.getCartView.mockResolvedValue(view({ items: [line(2)] }));

    const result = await ctl.setItemQty("line-1", 2);
    expect(result.state).toBe("applied");
  });
});

describe("there is exactly ONE live region, and the last sentence wins", () => {
  it("never mounts a second status region", async () => {
    mount();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockResolvedValue(LOCKED_BY_PEER);
    await ctl.add(ITEM);
    // ⚠️ RE-ANCHORED BY T33, and the old anchor is worth recording. This waited on
    // `/checking out/i`, which matches only the BANNER — the refusal clause reads "…while someone
    // CHECKS out". So the wait was satisfied by the very announcement T33 identifies as the one
    // that should not be there, and suppressing it timed this out. The proposition here was never
    // about which sentence wins; it is the region COUNT, so it now waits on the sentence that
    // legitimately survives.
    await waitFor(() => expect(spoken()).toBe(NOTICE.peerLock));
    await drainDeferredAnnounces();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("the latch belongs to THIS write — T31", () => {
  it("does not hand a later write the previous refusal's cause", async () => {
    // ⚠️ RED AT HEAD, deliberately. `lastRefusalRef` has ONE writer and ZERO clears repo-wide, so a
    // cause established for an earlier, unrelated write survives indefinitely and is handed to
    // whatever reads it next. `YourUsual` reads it to name WHY a dish did not go through.
    //
    // ⚠️ This is NOT the sequence T31 filed. That row said the stale read is reachable through the
    // no-cart exit; it is not — `add` is a useCallback whose FIRST dependency is `cartId`, so a
    // running loop keeps a closure with the old non-null id, and a fresh tap is gated by
    // `notReady = loading || !cartId`. The latch defect is real; the route to it was wrong.
    h.addItem.mockRejectedValue(new Error("redacted"));
    h.getCartView.mockResolvedValue(LOCKED_BY_PEER);
    mount();

    await ctl.add(ITEM);
    await waitFor(() => expect(ctl.lastRefusalClause()).not.toBeNull());

    // A LATER write that succeeds establishes nothing about a refusal — so the cause must be gone.
    h.addItem.mockResolvedValue(view({ items: [line(1)] }));
    await ctl.add(ITEM);
    expect(ctl.lastRefusalClause()).toBeNull();
  });
});

describe("no cart at all is a refusal with nothing to thread", () => {
  it("refuses without speaking, so a retry is the honest offer", async () => {
    h.session.current = null;
    mount();
    const result: WriteResult<CartItem[]> = await ctl.add(ITEM);
    expect(result).toEqual({ state: "refused", view: null });
    expect(h.addItem).not.toHaveBeenCalled();
    // ⚠️ AND IT PUBLISHES NOTHING. Note what this does NOT prove: the fixture mounts with a null
    // session, so the latch was never written, and the assertion passes both before and after any
    // T31 fix. It is a shape check on this exit, not a failing start — the real staleness proof is
    // the SEQUENCING test above, which needs a write that actually establishes a cause first.
    expect(ctl.lastRefusalClause()).toBeNull();
  });
});
