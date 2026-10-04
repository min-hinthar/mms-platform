/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem, CartTotals } from "@mms/db";
import type { DrainOutcome } from "@/lib/write-ledger";

/**
 * Phase 1c — the CartBar's once-per-visit spring is spent only by a CONFIRMED appearance.
 *
 * The flag is MODULE-scoped (it survives route remounts within the SPA session), so each case loads
 * a FRESH module (`vi.resetModules()` + a dynamic import) — otherwise the first case's spend would
 * leak into the next and the suite would depend on its own order. The mocks are registered once and
 * survive the reset: the context hook, the router, and the journey router (whose real module pulls
 * the whole navigation layer in).
 */

type Ctx = {
  count: number;
  totals: CartTotals | null;
  cartId: string | null;
  drain: () => Promise<DrainOutcome>;
  items: CartItem[];
};
const ctx = vi.hoisted(() => ({ current: {} as Ctx, push: vi.fn() }));
vi.mock("@/components/TableCartProvider", () => ({ useCart: () => ctx.current }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: () => {}, push: () => {} }) }));
vi.mock("./nav/TransitionNav", () => ({ useJourneyRouter: () => ({ push: ctx.push }) }));

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
const LINE: CartItem = {
  id: "line-1",
  menuItemId: "item-mohinga",
  name: "Mohinga",
  qty: 1,
  modifiers: [],
  unitPriceCents: 1200,
  taxCents: 0,
  lineState: "draft",
  fulfillment: "togo",
};

const drain = async (): Promise<DrainOutcome> => "settled";
const EMPTY: Ctx = { count: 0, totals: TOTALS, cartId: "cart-1", drain, items: [] };
/** An optimistic count beside no confirmed line and no confirmed total: an add in flight. */
const PENDING: Ctx = { count: 1, totals: null, cartId: "cart-1", drain, items: [] };
/** The server view has landed: the count equals the confirmed lines and a total exists. */
const CONFIRMED: Ctx = { count: 1, totals: TOTALS, cartId: "cart-1", drain, items: [LINE] };

/** A fresh copy of the module, with its own un-spent flag. */
async function freshCartBar() {
  vi.resetModules();
  return (await import("./CartBar")).CartBar;
}
const sprung = () => document.querySelector(".cartbar-in") !== null;

beforeEach(() => {
  ctx.current = EMPTY;
});
afterEach(cleanup);

describe("CartBar — the entrance belongs to the first CONFIRMED appearance", () => {
  it("an empty visit does not spend the entrance", async () => {
    const CartBar = await freshCartBar();
    ctx.current = EMPTY;
    const empty = render(<CartBar />);
    expect(empty.container.firstChild).toBeNull(); // the bar never showed
    empty.unmount();

    ctx.current = CONFIRMED;
    render(<CartBar />);
    expect(sprung()).toBe(true);
  });

  it("a pending-only appearance does not spend it; a confirmed one does, once", async () => {
    const CartBar = await freshCartBar();
    ctx.current = PENDING;
    const pending = render(<CartBar />);
    expect(sprung()).toBe(true);
    pending.unmount();

    ctx.current = CONFIRMED;
    const confirmed = render(<CartBar />);
    expect(sprung()).toBe(true);
    confirmed.unmount();

    render(<CartBar />);
    expect(sprung()).toBe(false);
  });
});

describe("CartBar — W21's drain, cancelled by an unmount (Codex round 1 on 3b)", () => {
  it("a tap whose drain is still pending when the bar unmounts (the diner left by another door) never pushes", async () => {
    let release!: () => void;
    const pending = new Promise<DrainOutcome>((r) => {
      release = () => r("settled");
    });
    ctx.push.mockReset();
    ctx.current = { ...CONFIRMED, drain: () => pending };
    const CartBar = await freshCartBar();
    const { unmount } = render(<CartBar />);
    document.querySelector("button")!.click();
    unmount(); // the Menu tab, the header brand, Back — any navigation away while the write drains
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(ctx.push).not.toHaveBeenCalled();
  });
  it("…and an ordinary tap still pushes once the drain resolves", async () => {
    ctx.push.mockReset();
    ctx.current = CONFIRMED;
    const CartBar = await freshCartBar();
    render(<CartBar />);
    document.querySelector("button")!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(ctx.push).toHaveBeenCalledWith("/cart?cart=cart-1");
  });
});

describe("CartBar — a navigation that merely STARTED during the drain cancels the push (Codex round 2 on 3b)", () => {
  it("drops the push when the epoch moved, even while the bar is still mounted", async () => {
    let release!: () => void;
    const pending = new Promise<DrainOutcome>((r) => {
      release = () => r("settled");
    });
    ctx.push.mockReset();
    ctx.current = { ...CONFIRMED, drain: () => pending };
    const CartBar = await freshCartBar();
    // AFTER the reset: `freshCartBar` wipes the module registry, so the bar's `nav-epoch` is a new
    // instance — the handle must come from the same registry or the bump lands on a stale counter.
    const { navEpoch } = await import("@/lib/nav-epoch");
    render(<CartBar />);
    document.querySelector("button")!.click();
    navEpoch.bump(); // another door of the grammar started a navigation; nothing has committed yet
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(ctx.push).not.toHaveBeenCalled();
  });
});

describe("CartBar — a drain past its deadline is a refusal to leave (Codex round 1 on #313, P1)", () => {
  it("does not push when the provider's drain ends `timed-out`, and the bar is live again for a retry", async () => {
    // The provider has spoken (its toast says the change is still saving); navigating anyway is the
    // W21 race by another name — /cart's first read or its create-intent lock misses or refuses the
    // add this bar is still counting.
    ctx.push.mockReset();
    const drain = vi.fn(async (): Promise<DrainOutcome> => "timed-out");
    ctx.current = { ...CONFIRMED, drain };
    const CartBar = await freshCartBar();
    render(<CartBar />);
    const bar = document.querySelector("button")!;
    bar.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(ctx.push).not.toHaveBeenCalled();
    expect(bar.getAttribute("aria-busy")).toBeNull();
    bar.click(); // the retry re-awaits — a second drain, never a swallowed tap
    expect(drain).toHaveBeenCalledTimes(2);
  });
});
