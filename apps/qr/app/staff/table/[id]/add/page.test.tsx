/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableDetail, TableDetailResult } from "@/lib/floor-types";

/**
 * Phase 2a (blind review) — the add page's two exits that read the table: a CLOSED table goes to
 * the floor BY NAME (a bare `/staff` resolves by the door cookie and can land a counter tablet on the
 * kitchen board — the tablet fix, applied here too), and the "Review · N not sent →" bridge counts
 * only what STAFF own (`staffOwedSendUnits`): at a host table the diners' own round in progress is
 * theirs to send, and a count there teaches staff to fire it.
 */
const h = vi.hoisted(() => ({ detail: null as unknown as TableDetailResult }));
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
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/staff", () => ({
  requireStaffPage: () => Promise.resolve({ staffId: "st-1", role: "server" }),
}));
vi.mock("@/lib/floor", () => ({ getTableDetail: () => Promise.resolve(h.detail) }));
vi.mock("@/lib/staff-pin", () => ({ staffHasPin: () => Promise.resolve(false) }));
vi.mock("@/lib/staff-lang-server", () => ({ readStaffLang: () => Promise.resolve("en") }));
const menuQuery = {
  select: () => menuQuery,
  eq: () => menuQuery,
  order: () => Promise.resolve({ data: [], error: null }),
};
vi.mock("@mms/db/server", () => ({
  publicClient: () => ({ from: () => menuQuery }),
  serviceClient: () => ({}),
}));
vi.mock("@/components/staff/StaffMenuBrowser", () => ({ StaffMenuBrowser: () => null }));
vi.mock("@/components/staff/StaffOutageShell", () => ({ StaffOutageShell: () => null }));
vi.mock("@/components/staff/Chrome", () => ({
  Chrome: ({ k, vars }: { k: string; vars?: Record<string, number> }) => (
    <span data-k={k}>{vars?.n ?? ""}</span>
  ),
}));
vi.mock("@/components/staff/StaffBar", () => ({
  StaffBar: ({ trailing }: { trailing?: ReactNode }) => <header>{trailing}</header>,
}));

const { default: StaffAddItems } = await import("./page");
const { STAFF_DOOR_TARGET } = await import("@/lib/staff-door");

const ID = "11111111-1111-4111-8111-111111111111";

function table(over: Partial<TableDetail>): TableDetailResult {
  return {
    kind: "detail",
    detail: {
      sessionId: ID,
      cartId: "cart-1",
      label: "t-7",
      hostPresent: false,
      send: { sendable: 5, staffAdded: 2, togoDraft: 0, inKitchen: false, foodDraft: true },
      ...over,
    } as TableDetail,
  };
}

async function mount() {
  render(await StaffAddItems({ params: Promise.resolve({ id: ID }) }));
  return document.querySelector<HTMLElement>('[data-k="browse.reviewUnsent"]');
}

afterEach(cleanup);

describe("the add page — a closed table", () => {
  it("goes to the floor BY NAME, never a bare /staff", async () => {
    h.detail = { kind: "closed" };
    const e = await StaffAddItems({ params: Promise.resolve({ id: ID }) }).catch((x: unknown) => x);
    // MUTATION: `redirect("/staff")` — resolved by the door cookie, a counter tablet can land on
    // the kitchen board; red.
    expect(e).toBeInstanceOf(Redirect);
    expect((e as Redirect).to).toBe(STAFF_DOOR_TARGET.counter);
  });
});

describe("the add page — the 'Review · N not sent' bridge counts what staff own", () => {
  it("at a HOST table, N is what staff added — never the diners' round", async () => {
    h.detail = table({ hostPresent: true });
    const bridge = await mount();
    // MUTATION: count `detail.send.sendable` — "5 not sent" over three dishes the host is still
    // choosing; red.
    expect(bridge?.textContent).toBe("2");
  });

  it("at a host table where staff added nothing, there is no bridge at all", async () => {
    h.detail = table({
      hostPresent: true,
      send: { sendable: 3, staffAdded: 0, togoDraft: 0, inKitchen: false, foodDraft: true },
    });
    expect(await mount()).toBeNull();
  });

  it("at a hostless table, N is every sendable dish", async () => {
    h.detail = table({ hostPresent: false });
    expect((await mount())?.textContent).toBe("5");
  });
});
