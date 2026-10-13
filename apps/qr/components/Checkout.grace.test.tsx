/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem, CartTotals } from "@mms/db";
import { SAME_GESTURE_MS } from "@mms/ui";
import type { getCartView } from "@/lib/cart";
import { t } from "@/lib/i18n";
import { COUNTER_ASK_CARRIES_UNSENT } from "@/lib/counter-pay-state";

/**
 * Phase 3c-i (D13 · D15 · D16) — the send's undo window, lifted into Checkout, with the REAL
 * `SendToKitchenButton` (the 2,000-line suite keeps its null stub). What this pins is the wiring
 * nothing else can see: the Bill is READABLE during the grace (the door is live, the rows render,
 * Pay is dimmed with the grace sentence and never mints); the undo survives the flip (Undo on the
 * Bill, targeting the exact batch); an undo keeps Pay held until its RE-SYNC lands, and the drafts
 * it put back hold Pay with their own reason; a double tap on a live Pay mints ONE intent; "Ready to
 * pay." is said on the elapse and never over a counter ask; the Undo's unmount hands lost focus to
 * the <h1>; the quiet door's name opens with its visible label; one `role=status` per view; and the
 * Order stage draws exactly one `.checkout-cta` per state and exactly one `.vt-cart-total` per view
 * — DOM queries, never file greps (LEARNINGS #60).
 *
 * Mocks: the same seams as `Checkout.test.tsx` (server-only blockers, the children that own Stripe /
 * a channel / an IntersectionObserver), plus `@/lib/diner-sound` for the send's chime.
 */
const h = vi.hoisted(() => ({
  publishCart: vi.fn(),
  getCartView: vi.fn(),
  sendToKitchen: vi.fn(),
  undoFire: vi.fn(),
  counterPayOutcome: vi.fn(),
  requestCounterPay: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/cart", () => ({
  applyPromo: vi.fn(),
  getCartView: h.getCartView,
  makeItNow: vi.fn(),
  releasePayLock: vi.fn(),
  setLineFulfillment: vi.fn(),
  setQty: vi.fn(),
  sendToKitchen: h.sendToKitchen,
  undoFire: h.undoFire,
}));
// 3c-ii — the bind sheet is mounted for every dine-in host; its Server Action reaches the service
// client (server-only). Never called here: the table is known (7), so the ask never opens.
vi.mock("@/lib/bind-table", () => ({ bindTable: vi.fn() }));
vi.mock("@/lib/counter-pay", () => ({
  counterPayOutcome: h.counterPayOutcome,
  requestCounterPay: h.requestCounterPay,
  withdrawCounterPay: vi.fn(),
}));
vi.mock("@/lib/diner-sound", () => ({ chime: () => {} }));
vi.mock("@/lib/realtime", () => ({ useCartRealtime: () => {} }));
// PD1 — "Let {host} know" is a Server Action (`"use server"` → the service client, server-only).
vi.mock("@/lib/send-nudge", () => ({
  nudgeHost: () => Promise.resolve({ ok: false, reason: "error", error: "unused" }),
}));
// PD1 (m1 decision 16) — the host's name ask saves through a Server Action (`"use server"` → the
// service client, server-only); never reached here.
vi.mock("@/lib/members", () => ({ setDisplayName: () => Promise.resolve({ ok: true }) }));
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
vi.mock("./PaymentSection", () => ({ PaymentSection: () => null }));
vi.mock("./SplitSection", () => ({ SplitSection: () => null }));
vi.mock("./SettlementBoard", () => ({ SettlementBoard: () => null }));
vi.mock("./TableTimeline", () => ({ TimelineStrip: () => null }));
vi.mock("./SecureTabButton", () => ({ SecureTabButton: () => null }));
vi.mock("./RewardField", () => ({ RewardField: () => null }));
vi.mock("./PickupWhenChoice", () => ({ PickupWhenChoice: () => null }));
vi.mock("./PaperAmbient", () => ({ PaperAmbient: () => null }));
vi.mock("./WalletChip", () => ({ WalletChip: () => null }));
vi.mock("./menu/BlurUpImage", () => ({ BlurUpImage: () => null }));
vi.mock("./menu/PhotoPlaceholder", () => ({ PhotoPlaceholder: () => null }));
vi.mock("./ActiveOrderProvider", () => ({ usePublishCart: () => h.publishCart }));
// PD2 — these cases pin the Bill after C2's flip (Pay · $X, docked and SERVED-GATED since PD10);
// the shipped PARKED Bill is Checkout.test.tsx's "PD2" describe. The door runs OPEN here unless a
// case parks it (`flags.phonePayOpen = false`) to pin the counter-only Bill's own grace edge.
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
const BATCH = "batch-7";

const DRAFT: CartItem = {
  id: "line-mohinga",
  menuItemId: "menu-mohinga",
  name: "Mohinga",
  qty: 1,
  modifiers: [],
  unitPriceCents: 1200,
  taxCents: 0,
  lineState: "draft",
  fulfillment: "dinein",
};
const FIRED: CartItem = { ...DRAFT, lineState: "fired" };
/** PD10 — the views' DB clock, and the dish SERVED past Mom's undo window on it (D5's open door). */
const DB_NOW = "2026-10-08T10:00:00.000Z";
const SERVED: CartItem = {
  ...DRAFT,
  lineState: "served",
  fireAt: "2026-10-08T09:40:00.000Z",
  bumpedAt: "2026-10-08T09:50:00.000Z",
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
function view(over: Partial<View> = {}): View {
  return {
    items: [DRAFT],
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
    nudgeReady: true,
    serverNow: "2026-10-08T10:00:00.000Z",
    dbNow: "2026-10-08T10:00:00.000Z",
    mode: "dinein",
    ...over,
  } satisfies View;
}

const HOST = {
  mode: "dinein",
  mySeat: MY_SEAT,
  myRole: "host" as const,
  members: [{ seat: MY_SEAT, name: "Me", role: "host" as const }],
  tableNumber: 7,
} as unknown as Parameters<typeof Checkout>[0]["splitContext"];

/** A send receipt with a long measured grace, so no case races the real clock. */
const SENT = {
  ok: true as const,
  fired: 1,
  undoUntil: "2026-10-04T12:01:00.000Z",
  serverNow: "2026-10-04T12:00:00.000Z",
  undoBatch: BATCH,
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function regionText(): string {
  return screen
    .getAllByRole("status")
    .map((r) => r.textContent ?? "")
    .join(" | ");
}

function mount(items: CartItem[] = [DRAFT]) {
  window.history.replaceState(null, "", "/cart?cart=cart-1");
  return render(
    <Checkout
      cartId={CART}
      initialItems={items}
      initialTotals={TOTALS}
      initialMySeat={MY_SEAT}
      initialDbNow={DB_NOW}
      splitContext={HOST}
    />,
  );
}

/** PD2 · PD1 (P2y) — the Send→Undo relabel holds taps for `SAME_GESTURE_MS` (the double-tap's
 *  second half); a test that presses the new Undo waits that gesture out first, in real time. */
async function afterGesture() {
  await new Promise((r) => setTimeout(r, SAME_GESTURE_MS + 20));
}
async function press(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

/** The same receipt with a ONE-second measured grace, for the cases that watch it elapse. */
const SHORT_GRACE = { ...SENT, undoUntil: "2026-10-04T12:00:01.000Z" };

/** A fresh create-intent answer (a Response body reads once). */
const okIntent = () =>
  new Response(JSON.stringify({ clientSecret: "pi_x_secret", totals: TOTALS, attempt: "a1" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

/** Everything SERVED past Mom's undo window: opens on the Bill with a LIVE Pay (PD10 · D5 — a dish
 *  only sent, or still cooking, holds it). */
function mountAllSent() {
  h.getCartView.mockResolvedValue(view({ items: [SERVED] }));
  window.history.replaceState(null, "", "/cart?cart=cart-1");
  return render(
    <Checkout
      cartId={CART}
      initialItems={[SERVED]}
      initialTotals={TOTALS}
      initialMySeat={MY_SEAT}
      initialDbNow={DB_NOW}
      splitContext={HOST}
    />,
  );
}

/** Send the one draft: the server fires it and hands back the grace; the re-sync shows it fired. */
async function sendAndOpenGrace(receipt: typeof SENT = SENT) {
  h.sendToKitchen.mockResolvedValue(receipt);
  h.getCartView.mockResolvedValue(view({ items: [FIRED] }));
  await press(/^Send to kitchen(?! now)/);
  await waitFor(() => expect(screen.getByRole("button", { name: /^Undo/ })).toBeTruthy());
}

const payReason = () => {
  const pay = screen.getByRole("button", { name: /^Pay · \$12\.00/ });
  const id = pay.getAttribute("aria-describedby");
  return { pay, reason: id ? document.getElementById(id)?.textContent : null };
};

beforeEach(() => {
  vi.clearAllMocks();
  flags.phonePayOpen = true;
  h.getCartView.mockResolvedValue(view());
  h.counterPayOutcome.mockResolvedValue({ kind: "open" });
});
afterEach(() => cleanup());

describe("Phase 3c-i (D15) — the Bill is readable during the send's undo window; only Pay waits", () => {
  it("the Total door is live during the grace, the receipt renders, and Pay is dimmed with the grace sentence — never minted", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mount();
    await sendAndOpenGrace();
    expect(regionText()).toContain("Sent to the kitchen — 1 item on the way.");
    // The door: no refusal, no "Hold on" — reading a bill is not a write.
    // Label in name (WCAG 2.5.3): the quiet door SHOWS "Total · $12.00" and its name opens with it.
    // MUTATION (checkout/door-name-drops-its-visible-label): named "View bill · $12.00" alone —
    // a voice user saying the visible words misses the door; red.
    const door = screen.getByRole("button", { name: "Total · $12.00 — View bill" });
    expect(door.getAttribute("aria-disabled")).toBeNull();
    expect(door.textContent).toContain("Total");
    // ONE polite region on the Order stage (the Send button lost its private one — QA §A:25).
    expect(screen.getAllByRole("status")).toHaveLength(1);
    await press("Total · $12.00 — View bill");
    // …and ONE on the Bill.
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(document.body.textContent).not.toContain("Hold on");
    // The receipt rows render on the Bill.
    expect(screen.getByRole("list", { name: "Your bill" })).toBeTruthy();
    // Pay is held — and since PD10 (D5) by the KITCHEN, which outranks the grace: the line inside
    // its undo window is "sending", and the window closes onto food that is only sent, not served,
    // so "Pay opens when the undo window closes" would be a promise the next instant breaks. (The
    // grace arm itself is pinned in lib: `checkout-verb/grace-does-not-wait-pay`.)
    const { pay, reason } = payReason();
    expect(pay.getAttribute("aria-disabled")).toBe("true");
    expect(pay.hasAttribute("disabled")).toBe(false);
    expect(reason).toContain("Pay opens once everything’s served.");
    // The counter is held too, but by the UNDO WINDOW, never the kitchen (D5) — so it says its own
    // reason, tied to it, and Pay's kitchen line never stands alone as the counter's (the capped
    // blind pass on #346, C3).
    const counter = screen.getByRole("button", { name: /^Pay at the counter/ });
    // MUTATION (pdrem/checkout-counter-grace-not-held): the counter's reason drawn for a tablemate's
    // lock only — inside the window an Undo can still pull the dish back, the counter is asked
    // anyway (PD2's lift left the undo window as one of the counter's two holds); red.
    expect(counter.getAttribute("aria-disabled")).toBe("true");
    const counterLineId = counter.getAttribute("aria-describedby");
    // MUTATION (pay-dock/counter-reason-not-drawn): the counter's own line never drawn — its
    // description points at nothing, and Pay's served line reads as the counter's; red.
    expect(counterLineId).toBe("pay-counter-line");
    expect(document.getElementById(counterLineId!)?.textContent).toBe(
      "Pay at the counter once the undo window closes.",
    );
    await act(async () => {
      fireEvent.click(pay);
    });
    expect(regionText()).toContain("Pay opens once everything’s served.");
    // Each blocked tap re-says ITS control's reason.
    await act(async () => {
      fireEvent.click(counter);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50)); // the refusal's frame
    });
    expect(regionText()).toContain("Pay at the counter once the undo window closes.");
    expect(h.requestCounterPay).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("the undo survives the flip: Undo is on the Bill and targets the exact batch", async () => {
    h.undoFire.mockResolvedValue({ ok: true });
    mount();
    await sendAndOpenGrace();
    await press("Total · $12.00 — View bill");
    // ONE Undo on screen, above the receipt.
    const undos = screen.getAllByRole("button", { name: /^Undo/ });
    expect(undos).toHaveLength(1);
    h.getCartView.mockResolvedValue(view({ items: [DRAFT] }));
    await act(async () => {
      fireEvent.click(undos[0]!);
    });
    // MUTATION: target anything but the batch this send minted — a guest's make-it-now line sharing
    // the grace is clawed back; red.
    expect(h.undoFire).toHaveBeenCalledWith(CART, BATCH);
    await waitFor(() => expect(regionText()).toContain("Brought back to your order"));
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
  });

  it("an undo whose re-sync is still out keeps Pay HELD with the grace sentence; when the read lands, the drafts it put back hold Pay with theirs — never a mint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(okIntent());
    mount();
    await sendAndOpenGrace();
    await press("Total · $12.00 — View bill");
    // The undo LANDS at once, but its re-sync (the read that brings the drafts back) is held open.
    h.undoFire.mockResolvedValue({ ok: true });
    const slowSync = deferred<View>();
    h.getCartView.mockReturnValueOnce(slowSync.promise);
    await afterGesture();
    await press(/^Undo/);
    await waitFor(() => expect(regionText()).toContain("Brought back to your order"));
    // MUTATION (undo-grace/window-closes-before-the-re-sync): the window shuts on the ANSWER — the
    // Undo is gone, Pay reads live over a line the view still shows `fired`, and a tap mints; red.
    expect(screen.getByRole("button", { name: /^Bringing it back…/ })).toBeTruthy();
    const { pay, reason } = payReason();
    expect(pay.getAttribute("aria-disabled")).toBe("true");
    // PD10 · D5 — the view still shows the line `fired`: the kitchen holds Pay (it outranks the
    // grace), so a tap can never mint over a line the undo may bring back.
    expect(reason).toContain("Pay opens once everything’s served.");
    await act(async () => {
      fireEvent.click(pay);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    // The read lands: the window is over, and the drafts it returned are the reason now.
    h.getCartView.mockResolvedValue(view({ items: [DRAFT] }));
    await act(async () => {
      slowSync.resolve(view({ items: [DRAFT] }));
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Bringing it back/ })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
    const after = payReason();
    expect(after.reason).toContain(
      "Send everything to the kitchen first — Pay opens once everything’s served.",
    );
    await act(async () => {
      fireEvent.click(after.pay);
    });
    expect(regionText()).toContain(
      "Send everything to the kitchen first — Pay opens once everything’s served.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("a double tap on a live Pay mints ONE intent — the door closes at the first tap, before the drain", async () => {
    const minted = deferred<Response>();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(minted.promise);
    mountAllSent();
    const { pay } = payReason();
    expect(pay.getAttribute("aria-disabled")).toBeNull();
    expect(pay.hasAttribute("disabled")).toBe(false);
    fireEvent.click(pay);
    // MUTATION (checkout/pay-re-entered-during-the-drain): the door lights only with `loadingPay`,
    // AFTER the drain's await — the second tap runs its own drain, decision and mint; red here (the
    // button is not yet disabled) and below (two create-intents).
    expect(pay.hasAttribute("disabled")).toBe(true);
    expect(pay.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(pay);
    await act(async () => {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      minted.resolve(okIntent());
    });
    await waitFor(() => expect(h.getCartView).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it("the grace's close edge hands LOST focus to the <h1> — the Order's Undo (parked on by the hook) and the Bill's", async () => {
    mount();
    await sendAndOpenGrace(SHORT_GRACE);
    // The hook parked focus on the Undo when the window opened (B4).
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Undo/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull(), {
      timeout: 3000,
    });
    // MUTATION: drop the `focusWasLost()` landing — the Undo unmounted under the reader and focus
    // sits on <body>; red. The landing is a passive effect that FOLLOWS the commit removing the Undo,
    // so it is awaited on its own: a DOM-only wait resolved between the two on CI (1c128cf).
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 })),
    );
    cleanup();

    h.getCartView.mockResolvedValue(view());
    mount();
    await sendAndOpenGrace();
    await press("Total · $12.00 — View bill");
    const undo = screen.getByRole("button", { name: /^Undo/ });
    undo.focus();
    expect(document.activeElement).toBe(undo);
    h.undoFire.mockResolvedValue({ ok: true });
    h.getCartView.mockResolvedValue(view({ items: [DRAFT] }));
    await afterGesture();
    await press(/^Undo/);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Bringing it back|^Undo/ })).toBeNull(),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 })),
    );
  });

  it("the shipped (PARKED) Bill's one door is HELD inside the undo window — the bilingual undo line in its slot, every tap re-says it, nothing is asked", async () => {
    // PD2's lift left the counter two holds: a tablemate's lock and this window. On the parked Bill
    // the counter is the ONLY door, so this is the hold that stops a family asking the register for
    // dishes an Undo can still pull back (the blind pass on #356, guard integrity).
    flags.phonePayOpen = false;
    mount();
    await sendAndOpenGrace();
    await press("Total · $12.00 — View bill");
    const door = screen.getByRole("button", { name: /^Pay at the counter/ });
    // MUTATION (pdrem/checkout-parked-grace-not-held): the parked dock's grace arm drawn as no
    // reason — the door is live inside the window; red.
    expect(door.getAttribute("aria-disabled")).toBe("true");
    expect(door.getAttribute("aria-describedby")).toBe("counter-door-line");
    const line = document.getElementById("counter-door-line")!;
    expect(line.firstChild?.textContent).toBe(t("en", "payOpensAfterUndo"));
    expect(line.querySelector('[lang="my"]')?.textContent).toBe(t("my", "payOpensAfterUndo"));
    await act(async () => {
      fireEvent.click(door);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50)); // the refusal's frame
    });
    expect(regionText()).toContain(t("en", "payOpensAfterUndo"));
    expect(h.requestCounterPay).not.toHaveBeenCalled();
  });

  it('"Ready to pay." is said once when the window ELAPSES on the counter-only Bill with nothing else holding its door', async () => {
    // The shipped (PARKED) Bill: its one door is the counter, which the grace holds and the kitchen
    // never does — so the elapse is the moment its door comes alive.
    flags.phonePayOpen = false;
    mount();
    await sendAndOpenGrace(SHORT_GRACE);
    await press("Total · $12.00 — View bill");
    await waitFor(() => expect(regionText()).toContain("Ready to pay."), { timeout: 3000 });
    expect(
      screen.getByRole("button", { name: /^Pay at the counter/ }).getAttribute("aria-disabled"),
    ).toBeNull();
  });

  it("a tablemate's dish landing inside the window: the PARKED door still comes alive at the elapse, and says so in the slot's own words — never silently, never 'Ready to pay.'", async () => {
    // PD2's lift: unsent dishes hold Pay but never the counter, so on the counter-only Bill the
    // door that lights at the elapse is the counter's, whatever Pay's block says (the blind pass on
    // #356, open question 2).
    flags.phonePayOpen = false;
    const GUEST_DRAFT: CartItem = { ...DRAFT, id: "line-guest", bySeat: "seat-peer" };
    mount();
    h.sendToKitchen.mockResolvedValue(SHORT_GRACE);
    // The send's re-sync shows the host's dish fired and a tablemate's new draft beside it.
    h.getCartView.mockResolvedValue(view({ items: [FIRED, GUEST_DRAFT] }));
    await press(/^Send to kitchen(?! now)/);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Undo/ })).toBeTruthy());
    await press("Total · $12.00 — View bill");
    const door = () => screen.getByRole("button", { name: /^Pay at the counter/ });
    expect(door().getAttribute("aria-disabled")).toBe("true");
    // Every text the region takes from here on, so the "never 'Ready to pay.'" check below reads the
    // whole window, not the one moment after the sentence check (the blind pass over #356's fix
    // commits: read after that wait, it could not fail on its own).
    const said: string[] = [];
    const status = () =>
      Array.from(document.querySelectorAll('[role="status"]'), (n) => n.textContent ?? "").join(
        " | ",
      );
    const mo = new MutationObserver(() => said.push(status()));
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    try {
      // The elapse, read off the door itself.
      await waitFor(() => expect(door().getAttribute("aria-disabled")).toBeNull(), {
        timeout: 3000,
      });
      // MUTATION (pdrem/checkout-parked-edge-reads-pays-block): the edge keyed on Pay's block,
      // which the tablemate's draft holds — the door lights with nothing said; red.
      await waitFor(() => expect(regionText()).toContain(COUNTER_ASK_CARRIES_UNSENT));
    } finally {
      mo.disconnect();
    }
    // MUTATION (pdrem/checkout-parked-edge-says-ready-over-unsent): "Ready to pay." over dishes the
    // counter must still check with the table; red.
    expect(said.filter((t) => t.includes("Ready to pay."))).toEqual([]);
  });

  it("PD10 · D5 — after the flip the elapse opens NOTHING: the sent dish still holds Pay, and 'Ready to pay.' waits for the food", async () => {
    mount();
    await sendAndOpenGrace(SHORT_GRACE);
    await press("Total · $12.00 — View bill");
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull(), {
      timeout: 3000,
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50)); // the edge's frame
    });
    expect(regionText()).not.toContain("Ready to pay.");
    const { pay, reason } = payReason();
    expect(pay.getAttribute("aria-disabled")).toBe("true");
    expect(reason).toBe("Pay opens once everything’s served.");
    // The counter is never gated by served (D5): live the moment the grace has gone.
    expect(
      screen.getByRole("button", { name: /^Pay at the counter/ }).getAttribute("aria-disabled"),
    ).toBeNull();
  });

  it("…and never over a standing counter ask — the counter pass is the Bill and Pay is not on screen", async () => {
    // Parked, where the grace edge can still say "Ready to pay." (after the flip the kitchen holds
    // Pay through the elapse, so the guard below could not be seen to matter there).
    flags.phonePayOpen = false;
    const asked = "2026-10-04T11:59:00.000Z";
    h.getCartView.mockResolvedValue(view({ counterRequestedAt: asked }));
    window.history.replaceState(null, "", "/cart?cart=cart-1");
    render(
      <Checkout
        cartId={CART}
        initialItems={[DRAFT]}
        initialTotals={TOTALS}
        initialMySeat={MY_SEAT}
        initialCounterRequestedAt={asked}
        splitContext={HOST}
        initialDbNow={DB_NOW}
      />,
    );
    h.sendToKitchen.mockResolvedValue(SHORT_GRACE);
    h.getCartView.mockResolvedValue(view({ items: [FIRED], counterRequestedAt: asked }));
    await press(/^Send to kitchen(?! now)/);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Undo/ })).toBeTruthy());
    await press("Total · $12.00 — View bill");
    expect(screen.queryByRole("button", { name: /^Pay · / })).toBeNull();
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull(), {
      timeout: 3000,
    });
    // MUTATION (checkout/ready-to-pay-over-a-counter-ask): drop the `counterAt` guard — "Ready to
    // pay." announced over a Bill whose Pay is not there; red.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50)); // the announcement rides a frame
    });
    expect(regionText()).not.toContain("Ready to pay.");
  });
});

describe("Phase 3c-i (D13 · D14) — one hero per state, one morph target per view", () => {
  it("drafts → the filled Send is the only .checkout-cta; the grace → none; everything sent → the door", async () => {
    mount();
    // Drafts, a host: Send is the hero.
    expect(document.querySelectorAll(".checkout-cta")).toHaveLength(1);
    expect(document.querySelector(".checkout-cta")!.textContent).toContain("Send to kitchen");
    expect(document.querySelectorAll(".vt-cart-total")).toHaveLength(1);
    await sendAndOpenGrace();
    // The grace: the outline Undo, no filled verb at all — reversing is never the hero.
    // MUTATION (checkout/two-heroes-on-the-order-stage): the door wears `.checkout-cta` while the
    // hero is Send or Undo — two filled verbs on one stage; red (count 1 → 2 above, 0 → 1 here).
    expect(document.querySelectorAll(".checkout-cta")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^Undo/ }).classList.contains("checkout-cta")).toBe(
      false,
    );
    expect(document.querySelectorAll(".vt-cart-total")).toHaveLength(1);
  });

  it("everything SERVED (no grace): the Total door is the filled hero, reading 'View bill & pay · $X'", async () => {
    window.history.replaceState(null, "", "/cart?cart=cart-1");
    h.getCartView.mockResolvedValue(view({ items: [SERVED] }));
    render(
      <Checkout
        cartId={CART}
        initialItems={[SERVED]}
        initialTotals={TOTALS}
        initialMySeat={MY_SEAT}
        initialDbNow={DB_NOW}
        splitContext={HOST}
      />,
    );
    // Opens on the Bill (everything sent) — exactly one morph target there.
    expect(document.querySelectorAll(".vt-cart-total")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Back to your order/i }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20)); // the in-page Back walks history.back()
    });
    const door = await screen.findByRole("button", { name: "View bill & pay · $12.00" });
    expect(door.classList.contains("checkout-cta")).toBe(true);
    expect(document.querySelectorAll(".checkout-cta")).toHaveLength(1);
    expect(document.querySelectorAll(".vt-cart-total")).toHaveLength(1);
    expect(document.body.textContent).toContain("Your order’s with the kitchen.");
  });

  it("PD10 · D5 — everything SENT but not served: the hero door reads 'View bill' — the Bill it opens holds Pay", async () => {
    window.history.replaceState(null, "", "/cart?cart=cart-1");
    h.getCartView.mockResolvedValue(view({ items: [FIRED] }));
    render(
      <Checkout
        cartId={CART}
        initialItems={[FIRED]}
        initialTotals={TOTALS}
        initialMySeat={MY_SEAT}
        initialDbNow={DB_NOW}
        splitContext={HOST}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Back to your order/i }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const door = await screen.findByRole("button", { name: "View bill · $12.00" });
    expect(door.classList.contains("checkout-cta")).toBe(true);
    expect(screen.queryByRole("button", { name: /View bill & pay/ })).toBeNull();
  });

  it("everything sent under a STANDING counter ask: the hero door reads 'View bill' — the Bill it opens has no Pay (Codex round 3 on #313)", async () => {
    const asked = "2026-10-04T11:59:00.000Z";
    // Everything SERVED (PD10 · D5): the one state in which nothing else holds Pay, so only the ask
    // can be what keeps the door from promising "& pay".
    h.getCartView.mockResolvedValue(view({ items: [SERVED], counterRequestedAt: asked }));
    window.history.replaceState(null, "", "/cart?cart=cart-1");
    render(
      <Checkout
        cartId={CART}
        initialItems={[SERVED]}
        initialTotals={TOTALS}
        initialMySeat={MY_SEAT}
        initialDbNow={DB_NOW}
        initialCounterRequestedAt={asked}
        splitContext={HOST}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Pay · / })).toBeNull();
    // The ask is the counter pass, whose only way back is its withdraw (PD2 decision 8) — so the
    // Order stage is reached the way a phone's Back button reaches it.
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 20));
    });
    // MUTATION (checkout/door-ignores-the-counter-ask): `billDoorLabel(block)` alone — "View bill &
    // pay · $12.00" promising a verb the next screen does not offer; red.
    const door = await screen.findByRole("button", { name: "View bill · $12.00" });
    expect(door.classList.contains("checkout-cta")).toBe(true);
    expect(screen.queryByRole("button", { name: /View bill & pay/ })).toBeNull();
  });
});
