/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem, CartTotals } from "@mms/db";
import type { getCartView } from "@/lib/cart";
import { BIND_COPY } from "@/lib/bind-copy";
import type { BindTableResult } from "@/lib/bind-table";
import { t } from "@/lib/i18n";
import type { DineInTable } from "@/lib/tables";

/**
 * Phase 3c-ii (D27 · D28 · D30) — the table bound at SEND, end to end on the REAL `SendToKitchenButton`
 * and the REAL `TableBindSheet` (the `Checkout.grace.test.tsx` harness, with `initialTableNumber`
 * null and a registry). What this pins is the wiring nothing else can see: an unbound dine-in Send
 * opens the ask and NOTHING reaches the server; a chip's bind is AWAITED — nothing while it pends —
 * and THEN the same send runs (one shared order on two spies); the number lands on the eyebrow only
 * from the confirmed answer; `seated` reveals the join and stashes its sentence until the sheet has
 * unmounted (one region per view, said after the modal); a dismissal calls nothing and keeps the
 * draft; "Send anyway" sends unbound once per mount; a freeze refuses before any sheet; a bound
 * table, an empty registry and a tablemate's bind carried by a refresh never ask.
 */
const h = vi.hoisted(() => ({
  publishCart: vi.fn(),
  getCartView: vi.fn(),
  sendToKitchen: vi.fn(),
  undoFire: vi.fn(),
  bindTable: vi.fn(),
  counterPayOutcome: vi.fn(),
  capture: vi.fn(),
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
vi.mock("@/lib/bind-table", () => ({ bindTable: h.bindTable }));
vi.mock("@/lib/counter-pay", () => ({
  counterPayOutcome: h.counterPayOutcome,
  requestCounterPay: vi.fn(),
  withdrawCounterPay: vi.fn(),
}));
vi.mock("@/lib/diner-sound", () => ({ chime: () => {} }));
vi.mock("@/lib/realtime", () => ({ useCartRealtime: () => {} }));
vi.mock("@/lib/useSessionPeek", () => ({ useSessionPeek: () => [] }));
vi.mock("posthog-js", () => ({ default: { capture: (...a: unknown[]) => h.capture(...a) } }));
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

const { Checkout } = await import("./Checkout");
const { FROZEN_NOTE, reasonCopy } = await import("./useUndoGrace");

const CART = "cart-1";
const MY_SEAT = "seat-me";
const PEER_SEAT = "seat-peer";
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

const TABLES: DineInTable[] = [
  { tableNumber: 3, occupied: true },
  { tableNumber: 5, occupied: false },
];

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
    tableNumber: null,
    ...over,
  } satisfies View;
}

/** An UNBOUND dine-in host — today's bare host-start. */
const HOST = {
  mode: "dinein",
  mySeat: MY_SEAT,
  myRole: "host" as const,
  members: [{ seat: MY_SEAT, name: "Me", role: "host" as const }],
  tableNumber: null,
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

/** The view's one region — read `hidden` too: while the modal is up Radix marks the page
 *  `aria-hidden`, which is exactly why a sentence written then is stashed until the close. */
function regionText(): string {
  return screen
    .getAllByRole("status", { hidden: true })
    .map((r) => r.textContent ?? "")
    .join(" | ");
}

/**
 * Every text the region held from the call until `heard()` — a sentence said and then replaced is
 * still a sentence the reader heard. Reading the region at MOMENTS raced the close edge: the sheet's
 * `onClosed` rides Radix FocusScope's unmount autofocus, which fires on a `setTimeout`
 * (`@radix-ui/react-focus-scope`), so a stale sentence could be said AFTER the "not said" read and
 * replaced by the send's line BEFORE the next one. `checkout-bind/stale-refusal-said` SURVIVED that
 * way on main's push run of d9614ae (2026-10-08) after being CAUGHT on two PR runs of the same tree.
 */
function recordRegion(): () => string {
  const heard: string[] = [regionText()];
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target instanceof Element ? r.target : r.target.parentElement;
      if (r.type === "characterData" && r.oldValue && el?.closest('[role="status"]'))
        heard.push(r.oldValue);
    }
    heard.push(regionText());
  });
  mo.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    characterDataOldValue: true,
  });
  return () => {
    heard.push(regionText());
    mo.disconnect();
    return heard.join(" ‖ ");
  };
}

/** The close edge has RUN: `onBindClosed` says the stash and THEN lands focus on the Send (still
 *  "Sending…" while the send is out), so focus there means the stash was already said; the empty
 *  `act` then commits what it said. Read the region only after this. */
async function closeEdgeDone() {
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Sending…/ })),
  );
  await act(async () => {});
}

function mount(props: Partial<Parameters<typeof Checkout>[0]> = {}) {
  window.history.replaceState(null, "", "/cart?cart=cart-1");
  return render(
    <Checkout
      cartId={CART}
      initialItems={[DRAFT]}
      initialTotals={TOTALS}
      initialMySeat={MY_SEAT}
      splitContext={HOST}
      initialTableNumber={null}
      tables={TABLES}
      {...props}
    />,
  );
}

const sendButton = () => screen.getByRole("button", { name: /^Send to kitchen · 1 item/ });
async function press(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}
/** Press Send, and the ask opens. */
async function askTable() {
  await press(/^Send to kitchen · 1 item/);
  return screen.getByRole("dialog");
}
const chip = (n: number) => screen.getByRole("button", { name: new RegExp(`^Table ${n},`) });
async function dismiss(dialog: HTMLElement) {
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}
/** The screen re-reads the server (the J3 visibility backstop — no mount-time read here). */
async function syncFromServer() {
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getCartView.mockResolvedValue(view());
  h.counterPayOutcome.mockResolvedValue({ kind: "open" });
  h.sendToKitchen.mockResolvedValue(SENT);
});
afterEach(() => cleanup());

describe("3c-ii (D27) — the first Send on an unbound session asks, and the hero stays Send", () => {
  it("opens a dialog named 'Pick your table' in both tongues; NOTHING reaches the server; one .checkout-cta, one region, no region in the sheet; mode_selected never fires", async () => {
    mount();
    expect(document.querySelectorAll(".checkout-cta")).toHaveLength(1);
    const dialog = await askTable();
    expect(h.sendToKitchen).not.toHaveBeenCalled();
    expect(h.bindTable).not.toHaveBeenCalled();
    const title = document.getElementById(dialog.getAttribute("aria-labelledby")!)!;
    expect(title.textContent).toContain(t("en", "pickYourTable"));
    expect(title.querySelector('[lang="my"]')?.textContent).toBe(t("my", "pickYourTable"));
    expect(dialog.textContent).toContain(BIND_COPY.sub);
    // MUTATION (checkout-bind/ask-is-a-second-hero): the sheet's escape wears `.checkout-cta` — two
    // filled verbs while the question is open; red (1 → 2).
    expect(document.querySelectorAll(".checkout-cta")).toHaveLength(1);
    // ONE region in the view (under the modal's aria-hidden while it is open), none in the sheet.
    expect(screen.getAllByRole("status", { hidden: true })).toHaveLength(1);
    expect(dialog.querySelector("[aria-live], [role='status'], [role='alert']")).toBeNull();
    expect(within(dialog).getByRole("button", { name: BIND_COPY.sendAnyway })).toBeTruthy();
    expect(h.capture).not.toHaveBeenCalledWith("mode_selected", expect.anything());
  });

  it("chip 5: the bind is AWAITED — nothing while it pends — THEN the same send runs; the eyebrow reads 'Table 5' only from the confirmed answer; the success line is said after the sheet unmounts and focus lands on the Undo", async () => {
    const pending = deferred<BindTableResult>();
    h.bindTable.mockReturnValue(pending.promise);
    mount();
    expect(screen.queryByText("Table 5")).toBeNull();
    const dialog = await askTable();
    await act(async () => {
      fireEvent.click(chip(5));
    });
    expect(h.bindTable).toHaveBeenCalledWith(CART, 5);
    expect(h.capture).toHaveBeenCalledWith("table_picked", {
      table_number: 5,
      occupied: false,
      resumed: false,
      source: "send",
    });
    // MUTATION (checkout-bind/send-runs-before-the-bind-lands): the sheet reports ok before the
    // server answers and the host sends at once; red (the server is reached while the bind pends).
    expect(h.sendToKitchen).not.toHaveBeenCalled();
    expect(screen.queryByText("Table 5")).toBeNull(); // never optimistic
    expect(dialog.getAttribute("aria-busy")).toBe("true");
    // The send is HELD OPEN past the bind, so the number on screen can only have come from the
    // bind's confirmed answer — the re-sync that would also carry it has not landed (the fixture
    // that lets `bind-not-recorded` hide behind `bill-keeps-the-stale-null` is a degenerate one).
    const sending = deferred<typeof SENT>();
    h.sendToKitchen.mockReturnValue(sending.promise);
    h.getCartView.mockResolvedValue(view({ items: [FIRED], tableNumber: 5 }));
    await act(async () => {
      pending.resolve({ ok: true, tableNumber: 5, already: false });
    });
    expect(h.sendToKitchen).toHaveBeenCalledTimes(1);
    expect(h.sendToKitchen).toHaveBeenCalledWith(CART);
    expect(h.bindTable.mock.invocationCallOrder[0]!).toBeLessThan(
      h.sendToKitchen.mock.invocationCallOrder[0]!,
    );
    // MUTATION (checkout-bind/bind-not-recorded): the confirmed answer is not written — with the
    // send still out, no view has carried the number, so the eyebrow stays silent; red.
    expect(screen.getByText("Table 5")).toBeTruthy();
    expect(h.getCartView).not.toHaveBeenCalled();
    await act(async () => {
      sending.resolve(SENT);
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const undo = await screen.findByRole("button", { name: /^Undo — \d+s$/ });
    // Said through the view's ONE region, after the modal — never under its aria-hidden.
    await waitFor(() => expect(regionText()).toContain("Sent to the kitchen — 1 item on the way."));
    await waitFor(() => expect(document.activeElement).toBe(undo));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    // The NEXT send never asks: undo the batch (drafts back), press Send — straight to the server.
    h.undoFire.mockResolvedValue({ ok: true });
    h.getCartView.mockResolvedValue(view({ items: [DRAFT], tableNumber: 5 }));
    await press(/^Undo — \d+s$/);
    await waitFor(() => expect(sendButton()).toBeTruthy());
    await press(/^Send to kitchen · 1 item/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.sendToKitchen).toHaveBeenCalledTimes(2);
    expect(h.bindTable).toHaveBeenCalledTimes(1);
  });

  it("`seated`: the join form reveals with focus in its input and the drafts note; NO send; the sentence reaches the region only AFTER the sheet unmounts, and focus returns to Send", async () => {
    h.bindTable.mockResolvedValue({ ok: false, reason: "seated" });
    mount();
    const dialog = await askTable();
    await act(async () => {
      fireEvent.click(chip(5));
    });
    expect(h.sendToKitchen).not.toHaveBeenCalled();
    const form = dialog.querySelector("form")!;
    expect(form).not.toBeNull();
    expect(within(form).getByRole("heading", { name: "Join Table 5" })).toBeTruthy();
    expect(document.activeElement).toBe(within(form).getByLabelText("Table code"));
    expect(form.textContent).toContain(BIND_COPY.draftsNote);
    expect(chip(5).hasAttribute("disabled")).toBe(false);
    expect(chip(5).getAttribute("aria-expanded")).toBe("true");
    // MUTATION (send-button/refusal-said-under-the-scrim): the sentence is said at once — written
    // under the modal's aria-hidden, where no reader hears it; red.
    expect(regionText()).not.toContain(BIND_COPY.seated);
    expect(dialog.textContent).toContain(BIND_COPY.seated); // seen inside the sheet, not announced
    await dismiss(dialog);
    await waitFor(() => expect(regionText()).toContain(BIND_COPY.seated));
    expect(document.activeElement).toBe(sendButton());
    expect(screen.queryByText("Table 5")).toBeNull();
  });

  it("Esc calls NOTHING, keeps the draft and the hero, and focus returns to Send", async () => {
    mount();
    const dialog = await askTable();
    await dismiss(dialog);
    // MUTATION (checkout-bind/dismiss-sends): the close sends the order unbound — a diner backing
    // out of the question fires the kitchen; red.
    expect(h.sendToKitchen).not.toHaveBeenCalled();
    expect(h.bindTable).not.toHaveBeenCalled();
    expect(screen.getByText("Mohinga")).toBeTruthy();
    expect(sendButton().classList.contains("checkout-cta")).toBe(true);
    expect(document.activeElement).toBe(sendButton());
    // …and the question is asked again on the next Send (nothing was answered).
    await askTable();
    expect(h.sendToKitchen).not.toHaveBeenCalled();
  });

  it("'Send anyway' sends unbound (no bind) and never re-asks this mount", async () => {
    mount();
    h.getCartView.mockResolvedValue(view({ items: [FIRED] }));
    const dialog = await askTable();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: BIND_COPY.sendAnyway }));
    });
    expect(h.bindTable).not.toHaveBeenCalled();
    expect(h.sendToKitchen).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText(/^Table \d+$/)).toBeNull(); // still unbound, honestly
    await screen.findByRole("button", { name: /^Undo — \d+s$/ });
    h.undoFire.mockResolvedValue({ ok: true });
    h.getCartView.mockResolvedValue(view({ items: [DRAFT] }));
    await press(/^Undo — \d+s$/);
    await waitFor(() => expect(sendButton()).toBeTruthy());
    await press(/^Send to kitchen · 1 item/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.sendToKitchen).toHaveBeenCalledTimes(2);
  });

  it("a FROZEN cart is refused with FROZEN_NOTE — no sheet", async () => {
    mount({ initialLocked: true, initialLockedBy: PEER_SEAT });
    await press(/^Send to kitchen · 1 item/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(regionText()).toContain(FROZEN_NOTE);
    expect(h.sendToKitchen).not.toHaveBeenCalled();
    expect(h.bindTable).not.toHaveBeenCalled();
  });

  it("a freeze that lands WHILE the ask is up: the chip is refused with FROZEN_NOTE before any bind, the sheet stays open, and the sentence reaches the region after the close", async () => {
    mount();
    const dialog = await askTable();
    // A tablemate's checkout locks the cart while the sheet is open (the J3 re-read carries it).
    h.getCartView.mockResolvedValue(view({ locked: true, lockedBy: PEER_SEAT }));
    await syncFromServer();
    await act(async () => {
      fireEvent.click(chip(5));
    });
    expect(h.bindTable).not.toHaveBeenCalled();
    expect(h.sendToKitchen).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(within(dialog).getByText(FROZEN_NOTE)).toBeTruthy();
    expect(regionText()).not.toContain(FROZEN_NOTE); // stashed while the modal is up
    await dismiss(dialog);
    await waitFor(() => expect(regionText()).toContain(FROZEN_NOTE));
  });

  it("a BOUND table (7) and an EMPTY registry never ask — the send goes straight to the server", async () => {
    mount({ initialTableNumber: 7 });
    expect(screen.getByText("Table 7")).toBeTruthy();
    await press(/^Send to kitchen · 1 item/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.sendToKitchen).toHaveBeenCalledTimes(1);
    cleanup();
    vi.clearAllMocks();
    h.getCartView.mockResolvedValue(view());
    h.sendToKitchen.mockResolvedValue(SENT);
    mount({ tables: [] });
    await press(/^Send to kitchen · 1 item/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.sendToKitchen).toHaveBeenCalledTimes(1);
  });
});

describe("3c-ii (D28) — every refusal names its way out, said after the sheet", () => {
  it("`already_bound` (another tab bound 3): the eyebrow reads 'Table 3' from the re-read, the sheet closes, and the SAME send runs — the sentence 'this order goes there' is kept, said after the close", async () => {
    // The blind pass on 3c-ii (product truth): the sentence asserted the order was going while no
    // send had fired. A confirmed number — the CAS's, or the re-read's — sends.
    h.bindTable.mockResolvedValue({ ok: false, reason: "already_bound", tableNumber: 3 });
    const sending = deferred<typeof SENT>();
    h.sendToKitchen.mockReturnValue(sending.promise);
    h.getCartView.mockResolvedValue(view({ items: [FIRED], tableNumber: 3 }));
    mount();
    await askTable();
    await act(async () => {
      fireEvent.click(chip(5));
    });
    expect(h.sendToKitchen).toHaveBeenCalledTimes(1);
    expect(h.bindTable.mock.invocationCallOrder[0]!).toBeLessThan(
      h.sendToKitchen.mock.invocationCallOrder[0]!,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Table 3")).toBeTruthy();
    // Said after the close, while the send is out — true the moment it is said.
    await waitFor(() => expect(regionText()).toContain(BIND_COPY.alreadyBound(3)));
    expect(regionText()).toContain("You’re at Table 3 — this order goes there.");
    await act(async () => {
      sending.resolve(SENT);
    });
    await waitFor(() => expect(regionText()).toContain("Sent to the kitchen — 1 item on the way."));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Undo — \d+s$/ })).toBeTruthy());
  });

  it("`already_bound` whose send answers BEFORE the sheet has closed: the region says the destination AND the send's line — the stash composes, it never overwrites (Codex r1 on #314, P2)", async () => {
    h.bindTable.mockResolvedValue({ ok: false, reason: "already_bound", tableNumber: 3 });
    h.sendToKitchen.mockResolvedValue(SENT); // answers inside the same tick as the close
    h.getCartView.mockResolvedValue(view({ items: [FIRED], tableNumber: 3 }));
    mount();
    await askTable();
    await act(async () => {
      fireEvent.click(chip(5));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(regionText()).toContain("Sent to the kitchen — 1 item on the way."));
    expect(regionText()).toContain(BIND_COPY.alreadyBound(3));
  });

  it("a refusal followed by a SUCCESSFUL chip in one open: the stale refusal is never said — only the send's own line (the blind pass on 3c-ii, product truth)", async () => {
    h.bindTable
      .mockResolvedValueOnce({ ok: false, reason: "seated" })
      .mockResolvedValueOnce({ ok: true, tableNumber: 8, already: false });
    mount({ tables: [...TABLES, { tableNumber: 8, occupied: false }] });
    const heard = recordRegion();
    const dialog = await askTable();
    await act(async () => {
      fireEvent.click(chip(5));
    });
    expect(dialog.textContent).toContain(BIND_COPY.seated);
    // The close edge is awaited (closeEdgeDone) before the send answers, so the order is fixed.
    const sending = deferred<typeof SENT>();
    h.sendToKitchen.mockReturnValue(sending.promise);
    h.getCartView.mockResolvedValue(view({ items: [FIRED], tableNumber: 8 }));
    await act(async () => {
      fireEvent.click(chip(8)); // another open chip — the bind lands now (5 is a join disclosure)
    });
    await closeEdgeDone();
    expect(regionText()).not.toContain(BIND_COPY.seated);
    await act(async () => {
      sending.resolve(SENT);
    });
    await waitFor(() => expect(regionText()).toContain("Sent to the kitchen — 1 item on the way."));
    // MUTATION (checkout-bind/stale-refusal-said): the ok edge keeps the stash, so the close says the
    // `seated` refusal — at any moment, which is why the HISTORY is read, not one sample.
    expect(heard()).not.toContain(BIND_COPY.seated);
  });

  it("a refusal followed by 'Send anyway' in one open: the stale refusal is never said", async () => {
    h.bindTable.mockReset(); // a `mockResolvedValueOnce` queue survives clearAllMocks
    h.bindTable.mockResolvedValue({ ok: false, reason: "unavailable" });
    mount();
    const heard = recordRegion();
    const dialog = await askTable();
    await act(async () => {
      fireEvent.click(chip(5));
    });
    expect(dialog.textContent).toContain(BIND_COPY.unavailable);
    const sending = deferred<typeof SENT>();
    h.sendToKitchen.mockReturnValue(sending.promise);
    h.getCartView.mockResolvedValue(view({ items: [FIRED] }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: BIND_COPY.sendAnyway }));
    });
    await closeEdgeDone();
    expect(regionText()).not.toContain(BIND_COPY.unavailable);
    await act(async () => {
      sending.resolve(SENT);
    });
    await waitFor(() => expect(regionText()).toContain("Sent to the kitchen — 1 item on the way."));
    // MUTATION (checkout-bind/send-anyway-says-the-stale-refusal): the same race, the same history.
    expect(heard()).not.toContain(BIND_COPY.unavailable);
  });

  it("the SEND edge lands focus on the Send itself while the send is still out — and keeps it there when the send then FAILS", async () => {
    // The blind pass on 3c-ii (a11y): the Send was natively disabled while pending, so the landing
    // after the sheet's unmount was a no-op and a failed send left focus on <body>.
    h.bindTable.mockResolvedValue({ ok: true, tableNumber: 5, already: false });
    const sending = deferred<{ ok: false; reason: "locked" }>();
    h.sendToKitchen.mockReturnValue(sending.promise);
    mount();
    await askTable();
    await act(async () => {
      fireEvent.click(chip(5));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const pendingSend = () => screen.getByRole("button", { name: /^Sending…/ });
    await waitFor(() => expect(document.activeElement).toBe(pendingSend()));
    expect(pendingSend().getAttribute("aria-busy")).toBe("true");
    expect(pendingSend().hasAttribute("disabled")).toBe(false);
    await act(async () => {
      sending.resolve({ ok: false, reason: "locked" });
    });
    await waitFor(() => expect(regionText()).toContain(reasonCopy.locked));
    expect(document.activeElement).toBe(sendButton());
    expect(sendButton().getAttribute("aria-busy")).toBe("false");
  });

  it("`locked` (the raced path): the sheet stays open showing the send's own sentence; it reaches the region after the close — pasted from reasonCopy, never typed", async () => {
    h.bindTable.mockResolvedValue({ ok: false, reason: "locked" });
    mount();
    const dialog = await askTable();
    await act(async () => {
      fireEvent.click(chip(5));
    });
    expect(h.sendToKitchen).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(dialog.textContent).toContain(reasonCopy.locked);
    expect(regionText()).not.toContain(reasonCopy.locked);
    await dismiss(dialog);
    await waitFor(() => expect(regionText()).toContain(reasonCopy.locked));
  });

  it("`unavailable` reads the mint's own sentence", async () => {
    h.bindTable.mockResolvedValue({ ok: false, reason: "unavailable" });
    mount();
    const dialog = await askTable();
    await act(async () => {
      fireEvent.click(chip(5));
    });
    expect(dialog.textContent).toContain(BIND_COPY.unavailable);
    // Never "scan its sticker": a `?t=` from /cart drops the persisted key and mints a second
    // session over the drafts about to be sent (the sheet's own docblock; the blind pass on 3c-ii).
    expect(dialog.textContent).toContain("That table isn’t available — pick another.");
    expect(dialog.textContent).not.toContain("scan its sticker");
  });

  it("J40 `held` (5): the sheet stays open with BIND_COPY.held(5), NO join form, NO send; the sentence reaches the region only after the close", async () => {
    h.bindTable.mockResolvedValue({ ok: false, reason: "held", tableNumber: 5 });
    mount();
    const dialog = await askTable();
    await act(async () => {
      fireEvent.click(chip(5));
    });
    expect(h.sendToKitchen).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(dialog.querySelector("form")).toBeNull();
    expect(dialog.textContent).toContain(BIND_COPY.held(5));
    expect(regionText()).not.toContain(BIND_COPY.held(5));
    await dismiss(dialog);
    await waitFor(() => expect(regionText()).toContain(BIND_COPY.held(5)));
    expect(screen.queryByText("Table 5")).toBeNull();
  });

  it("J41 `sticker_table` (4) on a tap of 5: NO send, the eyebrow never reads a table, BIND_COPY.stickerTable(4) said after the close", async () => {
    h.bindTable.mockResolvedValue({ ok: false, reason: "sticker_table", tableNumber: 4 });
    mount();
    const dialog = await askTable();
    await act(async () => {
      fireEvent.click(chip(5));
    });
    expect(h.sendToKitchen).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain(BIND_COPY.stickerTable(4));
    await dismiss(dialog);
    await waitFor(() => expect(regionText()).toContain(BIND_COPY.stickerTable(4)));
    expect(screen.queryByText("Table 4")).toBeNull();
  });
});

describe("3c-ii (D30) — the table number is LIVE on /cart", () => {
  it("a refresh carrying a tablemate's bind updates the eyebrow, and the next Send does not ask", async () => {
    mount();
    expect(screen.queryByText("Table 5")).toBeNull();
    h.getCartView.mockResolvedValue(view({ tableNumber: 5 }));
    await syncFromServer();
    // MUTATION (checkout-bind/bill-keeps-the-stale-null): `applyCartView` never writes the number
    // — the bill keeps the page-load null, asks a table that is already bound, and the bind answers
    // `already`; red.
    await waitFor(() => expect(screen.getByText("Table 5")).toBeTruthy());
    await press(/^Send to kitchen · 1 item/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.sendToKitchen).toHaveBeenCalledTimes(1);
  });

  it("a later NULL view never un-names the table", async () => {
    mount({ initialTableNumber: 7 });
    h.getCartView.mockResolvedValue(view({ tableNumber: null }));
    await syncFromServer();
    expect(screen.getByText("Table 7")).toBeTruthy();
  });
});
