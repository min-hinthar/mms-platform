/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { CartItem } from "@mms/db";
import type { WriteResult } from "@/lib/write-outcome";
import { pillAddClaim, sheetAddClaim, type CartClaim } from "@/lib/add-feedback";
import type { MenuItem } from "./MenuBrowser";

/**
 * Phase 1c — the sheet's "Add to order" hands the provider a VISIBLE, NAMED claim and the dish name.
 *
 * The sheet closes on the tap (W20) and never awaits the write, so these two arguments are the only
 * way its words reach the diner: the claim at t = 0 (the row it opened from may be scrolled away, so
 * only words can say which dish went in) and the name the provider's correction uses if the write
 * does not land. The copy is pinned in `lib/add-feedback.test.ts`; this pins the wiring.
 *
 * Mocked: the context hook (as `YourUsual.test.tsx` does) and the two photo components, which pull
 * `next/image`. The real `@mms/ui` Sheet renders (Radix Dialog, portalled into the document).
 */

type AddOpts = { claim?: CartClaim | null; name?: string };
type Ctx = {
  add: Mock<
    (
      id: string,
      mods?: string[],
      notes?: string,
      qty?: number,
      opts?: AddOpts,
    ) => Promise<WriteResult<CartItem[]>>
  >;
  cartId: string | null;
  loading: boolean;
  locked: boolean;
  lockedByYou: boolean;
  settling: boolean;
};
const ctx = vi.hoisted(() => ({ current: {} as Ctx }));
vi.mock("@/components/TableCartProvider", () => ({ useCart: () => ctx.current }));
vi.mock("./BlurUpImage", () => ({ BlurUpImage: () => null }));
vi.mock("./PhotoPlaceholder", () => ({ PhotoPlaceholder: () => null }));

const { ItemSheet } = await import("./ItemSheet");

const MOHINGA: MenuItem = {
  id: "item-mohinga",
  slug: "mohinga",
  name_en: "Mohinga",
  name_my: null,
  description_en: null,
  description_my: null,
  base_price_cents: 1200,
  image_url: null,
  is_sold_out: false,
  tags: [],
  allergens: [],
  category: "Noodles",
  modifierGroups: [],
};

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  // jsdom implements no element scrolling; the body resets the sheet's scroll on mount.
  Element.prototype.scrollTo = () => {};
  ctx.current = {
    add: vi.fn(async () => ({ state: "applied", view: [] }) as WriteResult<CartItem[]>),
    cartId: "cart-1",
    loading: false,
    locked: false,
    lockedByYou: false,
    settling: false,
  };
});

afterEach(cleanup);

describe("ItemSheet — the add names the dish, visibly, and hands the provider the name", () => {
  it("sends the VISIBLE named claim and the dish name, then closes without awaiting", () => {
    const onClose = vi.fn();
    render(
      <ItemSheet
        open
        item={MOHINGA}
        allItems={[MOHINGA]}
        diets={[]}
        onClose={onClose}
        onSelectItem={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Add Mohinga to your order/ }));

    const claim = sheetAddClaim("Mohinga", 1);
    expect(ctx.current.add).toHaveBeenCalledWith(MOHINGA.id, [], undefined, 1, {
      claim,
      name: "Mohinga",
    });
    const sent = ctx.current.add.mock.calls[0]?.[4]?.claim;
    // Visible: the sheet has closed, so a quiet claim would leave the diner with no words at all.
    expect(sent?.quiet).not.toBe(true);
    // Separating: the pill's claim is the quiet one, and must not be what the sheet sends.
    expect(sent).not.toEqual(pillAddClaim("Mohinga"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
