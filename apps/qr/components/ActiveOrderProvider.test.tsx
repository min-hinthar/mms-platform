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
// One URLSearchParams per URL, as Next hands it out: a fresh object per render would re-run the
// provider's route effect on every render, which is not production's shape — and it masked a
// mutant (a since-removed back-fill re-stamping a door the publisher had failed to record).
const paramsCache = new Map<string, URLSearchParams>();
const paramsFor = (s: string) => {
  let p = paramsCache.get(s);
  if (!p) {
    p = new URLSearchParams(s);
    paramsCache.set(s, p);
  }
  return p;
};
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => paramsFor(search),
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
  it("a pre-3b pointer is NOT guessed a door from the remembered mode — it stays unbound, offered as before, until its own cart publishes (Codex round 1 on #313)", async () => {
    // The old store rewrote the mode on every `/menu?mode=` visit but kept the cart pointer until
    // another cart published, so `activeMode=pickup` beside a DINE-IN cart is an ordinary legacy
    // state (a door changed while the new mint failed). The deep pass on #312 back-filled the pair
    // from that mode; binding "A" to pickup would have offered the table's cart on the to-go menu
    // and suppressed it at the table — for good. No provenance, no pair.
    localStorage.setItem("mms.qr.activeMode", "pickup");
    localStorage.setItem("mms.qr.activeCart", "A");
    localStorage.setItem("mms.qr.activeCartCount", "A:2");
    pathname = "/dine-in";
    render(
      <ActiveOrderProvider>
        <Eye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(localStorage.getItem("mms.qr.activeCartMode")).toBeNull();
    expect(eye()).toBe("A|2|dinein"); // the pre-3b behaviour, until its publish binds it
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
    // The diner's remembered door DIFFERS from the cart's, and the cart is EMPTY (so the live-cart
    // rule does not rescue it): only the URL's say-so keeps it offered.
    localStorage.setItem("mms.qr.activeMode", "dinein");
    localStorage.setItem("mms.qr.activeCartMode", "A:scango");
    localStorage.setItem("mms.qr.activeCartCount", "A:0");
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

describe("ActiveOrderProvider — the order pointer (lifecycle audit, 2026-10-13)", () => {
  function OrderEye() {
    const { order, cartId } = useActiveOrder();
    return (
      <p
        data-order
      >{`${order ? `${order.paymentIntent ?? order.cartId}@${order.createdAt}` : "-"}|cart:${cartId ?? "-"}`}</p>
    );
  }
  const orderEye = () => document.querySelector("[data-order]")?.textContent;
  const stored = () => JSON.parse(localStorage.getItem("mms.qr.activeOrder") ?? "null");

  it("I — a RESUME of the held order keeps it as stored: no re-capture, no TTL slide", async () => {
    const capturedAt = Date.now() - 60 * 60 * 1000; // an hour ago
    localStorage.setItem(
      "mms.qr.activeOrder",
      JSON.stringify({ paymentIntent: null, cartId: "K", mode: "dinein", createdAt: capturedAt }),
    );
    pathname = "/track";
    search = "cart=K&paid=1&resume=1";
    render(
      <ActiveOrderProvider>
        <OrderEye />
      </ActiveOrderProvider>,
    );
    await frames();
    // RED when the resume re-captures: createdAt jumps to now and the 4 h TTL slides on every check.
    expect(stored().createdAt).toBe(capturedAt);
    expect(orderEye()).toBe(`K@${capturedAt}|cart:-`);
  });

  it("I — a resume never clears (or replaces) the diner's NEW open cart — of this order or another", async () => {
    // The tray can link to an order this device does not hold (another one of the diner's): the pill
    // follows it, but a placed order's cart is never the "back to your cart" pointer.
    for (const held of ["pi_1", "pi_0"]) {
      cleanup();
      localStorage.clear();
      localStorage.setItem(
        "mms.qr.activeOrder",
        JSON.stringify({ paymentIntent: held, cartId: "K", mode: "pickup", createdAt: Date.now() }),
      );
      localStorage.setItem("mms.qr.activeCart", "NEW");
      localStorage.setItem("mms.qr.activeCartCount", "NEW:2");
      pathname = "/track";
      search = "payment_intent=pi_1&redirect_status=succeeded&resume=1&cart=K";
      render(
        <ActiveOrderProvider>
          <OrderEye />
        </ActiveOrderProvider>,
      );
      await frames();
      expect(localStorage.getItem("mms.qr.activeCart")).toBe("NEW");
      expect(localStorage.getItem("mms.qr.activeCartCount")).toBe("NEW:2");
      expect(stored().paymentIntent).toBe("pi_1");
    }
  });

  it("an ARRIVAL still captures the order and retires the cart it became", async () => {
    localStorage.setItem("mms.qr.activeCart", "K");
    pathname = "/track";
    search = "cart=K&paid=1";
    render(
      <ActiveOrderProvider>
        <OrderEye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(stored().cartId).toBe("K");
    expect(localStorage.getItem("mms.qr.activeCart")).toBeNull();
  });

  it("E — a pickup's pointer outlives the 4 h capture TTL once its slot is noted", async () => {
    const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
    const slot = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    // Expired by the capture rule alone…
    localStorage.setItem(
      "mms.qr.activeOrder",
      JSON.stringify({
        paymentIntent: "pi_1",
        cartId: null,
        mode: "pickup",
        createdAt: fiveHoursAgo,
      }),
    );
    pathname = "/";
    render(
      <ActiveOrderProvider>
        <OrderEye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(orderEye()).toMatch(/^-\|/);
    cleanup();
    // …but kept when the slot is on it. RED when hydration ignores the slot.
    localStorage.setItem(
      "mms.qr.activeOrder",
      JSON.stringify({
        paymentIntent: "pi_1",
        cartId: null,
        mode: "pickup",
        createdAt: fiveHoursAgo,
        pickupSlot: slot,
      }),
    );
    render(
      <ActiveOrderProvider>
        <OrderEye />
      </ActiveOrderProvider>,
    );
    await frames();
    expect(orderEye()).toMatch(/^pi_1@/);
  });

  it("E/F — noteTrackedOrder stamps the slot (and that it landed) on the order the /track URL names, and on no other", async () => {
    localStorage.setItem(
      "mms.qr.activeOrder",
      JSON.stringify({
        paymentIntent: "pi_1",
        cartId: null,
        mode: "pickup",
        createdAt: Date.now(),
      }),
    );
    pathname = "/track";
    search = "payment_intent=pi_1&redirect_status=succeeded&resume=1";
    window.history.replaceState(null, "", `/track?${search}`);
    function Noter({ slot }: { slot: string }) {
      const { noteTrackedOrder } = useActiveOrder();
      return (
        <button type="button" onClick={() => noteTrackedOrder({ pickupSlot: slot })}>
          note
        </button>
      );
    }
    render(
      <ActiveOrderProvider>
        <Noter slot="2026-10-14T01:20:00.000Z" />
      </ActiveOrderProvider>,
    );
    await frames();
    act(() => screen.getByRole("button").click());
    expect(stored().pickupSlot).toBe("2026-10-14T01:20:00.000Z");
    // F — and the pointer now knows the order exists. RED when `landed` is not stamped.
    expect(stored().landed).toBe(true);
    // A tray link to ANOTHER order never stretches this one.
    window.history.replaceState(null, "", "/track?payment_intent=pi_2&redirect_status=succeeded");
    cleanup();
    render(
      <ActiveOrderProvider>
        <Noter slot="2026-10-20T01:20:00.000Z" />
      </ActiveOrderProvider>,
    );
    await frames();
    act(() => screen.getByRole("button").click());
    expect(stored().pickupSlot).toBe("2026-10-14T01:20:00.000Z");
    window.history.replaceState(null, "", "/");
  });
});
