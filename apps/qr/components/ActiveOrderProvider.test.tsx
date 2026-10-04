/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Codex round 2 on 3b (#312) — the wayfinding store binds the remembered cart to its DOOR. After a
 * door switch the store still held the previous door's pointer until the new door published its own
 * cart, so the Order tab on /dine-in (relabelled "Order" by the route) opened the grocery basket —
 * and a failed session mint left that wrong link indefinitely. A cart reached by URL is explicit and
 * is never suppressed; a pointer written before 3b (no door) behaves as before.
 */
let pathname = "/";
let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

const { ActiveOrderProvider, useActiveOrder } = await import("./ActiveOrderProvider");

function Eye() {
  const { cartId, cartCount, mode } = useActiveOrder();
  return <p data-eye>{`${cartId ?? "-"}|${cartCount ?? "-"}|${mode ?? "-"}`}</p>;
}
const frames = () =>
  act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 0));
  });
const eye = () => screen.getByText(/\|/).textContent;

beforeEach(() => {
  localStorage.clear();
  pathname = "/";
  search = "";
});
afterEach(cleanup);

describe("ActiveOrderProvider — the cart pointer and its door", () => {
  it("offers the stored cart on its own door", async () => {
    localStorage.setItem("mms.qr.activeMode", "scango");
    localStorage.setItem("mms.qr.activeCart", "A");
    localStorage.setItem("mms.qr.activeCartMode", "A:scango");
    localStorage.setItem("mms.qr.activeCartCount", "A:2");
    pathname = "/grocery";
    render(
      <ActiveOrderProvider>
        <Eye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(eye()).toBe("A|2|scango");
  });
  it("does NOT offer the grocery basket on the dine-in threshold or the to-go menu", async () => {
    localStorage.setItem("mms.qr.activeMode", "scango");
    localStorage.setItem("mms.qr.activeCart", "A");
    localStorage.setItem("mms.qr.activeCartMode", "A:scango");
    localStorage.setItem("mms.qr.activeCartCount", "A:2");
    pathname = "/dine-in";
    const r = render(
      <ActiveOrderProvider>
        <Eye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(eye()).toMatch(/^-\|-\|/);
    cleanup();
    pathname = "/menu";
    search = "mode=pickup";
    render(
      <ActiveOrderProvider>
        <Eye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(eye()).toBe("-|-|pickup");
    void r;
  });
  it("the route's own door is REMEMBERED, so a neutral route after it keeps the choice (Codex round 3 on 3b)", async () => {
    // A device that remembers the market but holds NO live basket opens /dine-in (the diner chose
    // Dine-in) and taps Account before picking a table. The route implied `dinein` only while the
    // diner stood on it; on /account the stale stored `scango` won and the Menu tab read Market.
    localStorage.setItem("mms.qr.activeMode", "scango");
    pathname = "/dine-in";
    render(
      <ActiveOrderProvider>
        <Eye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(eye()).toBe("-|-|dinein");
    expect(localStorage.getItem("mms.qr.activeMode")).toBe("dinein");
    cleanup();
    pathname = "/account"; // implies no door — the remembered one must be the diner's choice
    render(
      <ActiveOrderProvider>
        <Eye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(eye()).toBe("-|-|dinein");
  });
  it("a LIVE cart's door wins on a NEUTRAL route — a glance at the table picker never orphans a basket (deep pass on #312)", async () => {
    // Three items in a pickup cart; the diner taps Dine-in by mistake and backs out via Account.
    // /dine-in is a door and withholds the cart; /account implies nothing, and there the thing the
    // diner can still change — the cart with something in it — names the door.
    localStorage.setItem("mms.qr.activeMode", "pickup");
    localStorage.setItem("mms.qr.activeCart", "A");
    localStorage.setItem("mms.qr.activeCartMode", "A:pickup");
    localStorage.setItem("mms.qr.activeCartCount", "A:3");
    pathname = "/dine-in";
    render(
      <ActiveOrderProvider>
        <Eye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(eye()).toBe("-|-|dinein");
    cleanup();
    pathname = "/account";
    render(
      <ActiveOrderProvider>
        <Eye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(eye()).toBe("A|3|pickup");
    cleanup();
    // An EMPTY remembered cart is not an order: the door the diner chose last stands.
    localStorage.setItem("mms.qr.activeCartCount", "A:0");
    render(
      <ActiveOrderProvider>
        <Eye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(eye()).toBe("-|-|dinein");
  });
  it("a pre-3b pointer learns its door from the mode the device remembered — the deployed devices get the fix too (deep pass on #312)", async () => {
    // Written before 3b: a cart id and a mode, no `<cartId>:<mode>` pair. Judged by the remembered
    // mode once, before this run overwrites it, so the grocery basket is withheld on /dine-in.
    localStorage.setItem("mms.qr.activeMode", "scango");
    localStorage.setItem("mms.qr.activeCart", "A");
    localStorage.setItem("mms.qr.activeCartCount", "A:2");
    pathname = "/dine-in";
    render(
      <ActiveOrderProvider>
        <Eye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(localStorage.getItem("mms.qr.activeCartMode")).toBe("A:scango");
    expect(eye()).toBe("-|-|dinein");
  });
  it("a cart reached by URL is explicit and never suppressed; a pre-3b pointer with no door AND no remembered mode is offered as before", async () => {
    localStorage.setItem("mms.qr.activeCart", "A");
    pathname = "/dine-in";
    render(
      <ActiveOrderProvider>
        <Eye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(eye()).toMatch(/^A\|/); // no door recorded → the old behaviour
    cleanup();
    // The diner's remembered door DIFFERS from the cart's: only the URL's say-so keeps it offered.
    localStorage.setItem("mms.qr.activeMode", "dinein");
    localStorage.setItem("mms.qr.activeCartMode", "A:scango");
    pathname = "/cart";
    search = "cart=A";
    render(
      <ActiveOrderProvider>
        <Eye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(eye()).toMatch(/^A\|/); // the URL said so
  });
  it("publishCart records the door beside the id, so the next visit can judge it", async () => {
    pathname = "/grocery";
    function Publisher() {
      const { publishCart } = useActiveOrder();
      return (
        <button type="button" onClick={() => publishCart("B", 1, "scango")}>
          publish
        </button>
      );
    }
    render(
      <ActiveOrderProvider>
        <Publisher />
      </ActiveOrderProvider>,
    );
    act(() => screen.getByRole("button").click());
    await frames();
    expect(localStorage.getItem("mms.qr.activeCartMode")).toBe("B:scango");
    expect(localStorage.getItem("mms.qr.activeCart")).toBe("B");
  });
});
