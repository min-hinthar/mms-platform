/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableDetail, TableDetailResult } from "@/lib/floor-types";

/**
 * Phase 2c · pad — the add page is the ORDER PAD's app shell. It keeps the exits that read the table
 * (a CLOSED table goes to the floor BY NAME — a bare `/staff` resolves by the door cookie and can
 * land a counter tablet on the kitchen board; a settled one goes to the table page), and it hands the
 * pad the catalog honestly: an unreadable menu is an OUTAGE, never an empty list that reads as
 * "nothing matches". The interim "Review · N not sent →" bridge (2a) is gone — the pad carries the
 * Send itself.
 */
const h = vi.hoisted(() => ({
  detail: null as unknown as TableDetailResult,
  menu: { data: [] as unknown[] | null, error: null as unknown },
  padProps: null as null | Record<string, unknown>,
}));
class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock("@/lib/staff", () => ({
  requireStaffPage: () => Promise.resolve({ staffId: "st-1", role: "server" }),
}));
vi.mock("@/lib/floor", () => ({ getTableDetail: () => Promise.resolve(h.detail) }));
vi.mock("@/lib/staff-pin", () => ({ staffHasPin: () => Promise.resolve(false) }));
const menuQuery = {
  select: () => menuQuery,
  eq: () => menuQuery,
  order: () => Promise.resolve(h.menu),
};
vi.mock("@mms/db/server", () => ({
  publicClient: () => ({ from: () => menuQuery }),
  // Phase 2f — the page no longer reads the cart itself: a second read here would be a second
  // answer to "whose order is this". Any service-client use is now a failure.
  serviceClient: () => {
    throw new Error("the add page must not read the cart itself");
  },
}));
vi.mock("@/components/staff/OrderPad", () => ({
  OrderPad: (p: Record<string, unknown>) => {
    h.padProps = p;
    return <div data-testid="pad" />;
  },
}));
vi.mock("@/components/staff/StaffOutageShell", () => ({ StaffOutageShell: () => null }));

const { default: StaffAddItems } = await import("./page");
const { STAFF_DOOR_TARGET } = await import("@/lib/staff-door");

const ID = "11111111-1111-4111-8111-111111111111";

function table(over: Partial<TableDetail> = {}): TableDetailResult {
  return {
    kind: "detail",
    detail: {
      sessionId: ID,
      cartId: "cart-1",
      label: "t-7",
      hostPresent: false,
      send: { sendable: 5, staffAdded: 2, togoDraft: 0, inKitchen: false, foodDraft: true },
      counterOrder: false,
      customerName: null,
      ...over,
    } as TableDetail,
  };
}

const row = (over: Record<string, unknown>) => ({
  id: "m1",
  name_en: "Mohinga",
  name_my: "မုန့်ဟင်းခါး",
  base_price_cents: 1450,
  is_sold_out: false,
  menu_categories: { slug: "all-day-breakfast", name: "All-Day Breakfast", sort_order: 10 },
  item_modifier_groups: [],
  ...over,
});

async function mount(search?: { name?: string }) {
  render(
    await StaffAddItems({
      params: Promise.resolve({ id: ID }),
      ...(search ? { searchParams: Promise.resolve(search) } : {}),
    }),
  );
  return h.padProps!;
}

beforeEach(() => {
  h.padProps = null;
  h.menu = { data: [], error: null };
});
afterEach(cleanup);

describe("the add page — the exits that read the table", () => {
  it("a closed table goes to the floor BY NAME, never a bare /staff", async () => {
    h.detail = { kind: "closed" };
    const e = await StaffAddItems({ params: Promise.resolve({ id: ID }) }).catch((x: unknown) => x);
    // MUTATION: `redirect("/staff")` — resolved by the door cookie, a counter tablet can land on
    // the kitchen board; red.
    expect(e).toBeInstanceOf(Redirect);
    expect((e as Redirect).to).toBe(STAFF_DOOR_TARGET.counter);
  });

  it("PD6 — a CLOSED counter order goes to its own table page (the seal adopts this tab's stash there), whatever its card", async () => {
    for (const handoff of [
      {
        orderId: "o-1",
        totalCents: 1989,
        tipCents: 0,
        tenderedCents: null,
        isCounter: true,
        cartId: "c-1",
        sentEarly: false,
      },
      null,
    ]) {
      h.detail = { kind: "closed", handoff, refund: "none", orderId: "o-1" };
      const e = await StaffAddItems({ params: Promise.resolve({ id: ID }) }).catch(
        (x: unknown) => x,
      );
      // MUTATION pad-route/closed-counter-to-the-floor: a reload right after the walk-up landing
      // loses Cash received and Change (Codex correction 4); red.
      expect((e as Redirect).to).toBe(`/staff/table/${ID}`);
    }
  });

  it("a settled table (no open order) goes to the table page", async () => {
    h.detail = table({ cartId: null });
    const e = await StaffAddItems({ params: Promise.resolve({ id: ID }) }).catch((x: unknown) => x);
    expect((e as Redirect).to).toBe(`/staff/table/${ID}`);
  });
});

describe("the add page — the pad's app shell", () => {
  it("hands the pad the shaped catalog: category slug and sort, a required-choice dish gated", async () => {
    h.detail = table();
    h.menu = {
      data: [
        row({}),
        row({
          id: "m2",
          name_en: "Beef Curry",
          menu_categories: { slug: "curries-a-la-carte", name: "Curries", sort_order: 40 },
          item_modifier_groups: [
            {
              modifier_groups: {
                id: "g1",
                slug: "style",
                name: "Style",
                name_my: null,
                selection_type: "single",
                min_select: 1,
                max_select: 1,
                modifier_options: [
                  {
                    id: "o1",
                    slug: "dry",
                    name: "Dry",
                    name_my: null,
                    price_delta_cents: 0,
                    sort_order: 1,
                    is_active: false,
                    allergens: null,
                  },
                ],
              },
            },
          ],
        }),
      ],
      error: null,
    };
    const p = await mount();
    expect(p.catalog).toEqual({
      kind: "ok",
      items: [
        expect.objectContaining({
          id: "m1",
          nameEn: "Mohinga",
          nameMy: "မုန့်ဟင်းခါး",
          priceCents: 1450,
          category: "All-Day Breakfast",
          categorySlug: "all-day-breakfast",
          categorySort: 10,
          soldOut: false,
        }),
        // A required group whose every option is inactive cannot be completed: sold out, honestly.
        expect.objectContaining({ id: "m2", categorySlug: "curries-a-la-carte", soldOut: true }),
      ],
    });
    expect(p.counterOrder).toBe(false);
    expect(p.sessionId).toBe(ID);
    // The seed only — the pad owns the live detail after mount.
    expect((p.initialDetail as TableDetail).cartId).toBe("cart-1");
  });

  it("an unreadable menu is an OUTAGE — never an empty menu that reads as 'nothing matches'", async () => {
    h.detail = table();
    h.menu = { data: null, error: { message: "boom" } };
    // MUTATION: binding `{ data }` alone — the pad would get `{ kind: "ok", items: [] }`; red.
    expect((await mount()).catalog).toEqual({ kind: "outage" });
  });

  it("a counter order is flagged BY THE DETAIL and carries the detail's saved name", async () => {
    h.detail = table({ label: "reg-ab12", counterOrder: true, customerName: "Aye" });
    const p = await mount();
    expect(p.counterOrder).toBe(true);
    expect(p.initialName).toBe("Aye");
    expect(p.focusName).toBe(false);
  });

  it("Phase 2f — the flag is the server's predicate, never the label's prefix", async () => {
    // A `reg-`-looking label the server did NOT call a counter order (a diner pickup, say): a table.
    h.detail = table({ label: "reg-ab12", counterOrder: false, customerName: null });
    expect((await mount()).counterOrder).toBe(false);
  });

  it("Phase 2f — ?name=1 asks the pad to land on the name field (and only exactly that)", async () => {
    h.detail = table({ label: "reg-ab12", counterOrder: true, customerName: null });
    expect((await mount({ name: "1" })).focusName).toBe(true);
    cleanup();
    expect((await mount({ name: "yes" })).focusName).toBe(false);
  });

  it("the interim 'Review · N not sent' bridge is gone (the pad has its own Send)", async () => {
    h.detail = table({ hostPresent: false });
    await mount();
    expect(document.querySelector('a[href*="?send=1"]')).toBeNull();
    expect(document.querySelector("main.staff-main.pad-main")).not.toBeNull();
  });
});
