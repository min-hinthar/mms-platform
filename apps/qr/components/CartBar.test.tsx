/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem, CartTotals } from "@mms/db";

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
  settled: () => Promise<void>;
  items: CartItem[];
};
const ctx = vi.hoisted(() => ({ current: {} as Ctx }));
vi.mock("@/components/TableCartProvider", () => ({ useCart: () => ctx.current }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: () => {}, push: () => {} }) }));
vi.mock("./nav/TransitionNav", () => ({ useJourneyRouter: () => ({ push: () => {} }) }));

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

const settled = async () => {};
const EMPTY: Ctx = { count: 0, totals: TOTALS, cartId: "cart-1", settled, items: [] };
/** An optimistic count beside no confirmed line and no confirmed total: an add in flight. */
const PENDING: Ctx = { count: 1, totals: null, cartId: "cart-1", settled, items: [] };
/** The server view has landed: the count equals the confirmed lines and a total exists. */
const CONFIRMED: Ctx = { count: 1, totals: TOTALS, cartId: "cart-1", settled, items: [LINE] };

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
