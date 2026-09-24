/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { CartItem } from "@mms/db";
import type { WriteResult } from "@/lib/write-outcome";
import { pillAddClaim, stepClaim, type CartClaim } from "@/lib/add-feedback";
import { inertReason } from "@/lib/inert-reason";

/**
 * Phase 1c — the add moment's WIRING in the row control: what fires at the tap, what the write
 * carries, and where focus lands when the create settles.
 *
 * The copy and the reversal verdict are pure (`lib/add-feedback.ts`, pinned as values there); this
 * suite asserts only that the component CALLS them at the right moment with the right inputs, and
 * the two things no module can hold — the one-shot focus landing and the burst's lifetime.
 *
 * The mock is the context hook alone (as `menu/YourUsual.test.tsx` does), so the real provider and
 * its `server-only` import chains are never loaded. `posthog-js` is stubbed (the landing capture),
 * and `matchMedia` answers "no reduced-motion preference", so the motion branches render.
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
  setItemQty: Mock<
    (id: string, qty: number, announce?: string) => Promise<WriteResult<CartItem[]>>
  >;
  refresh: Mock<() => Promise<CartItem[] | null>>;
  announce: Mock<
    (msg: string, ms?: number, my?: string, opts?: { quiet?: boolean; kind?: string }) => void
  >;
  items: CartItem[];
  cartId: string | null;
  loading: boolean;
  locked: boolean;
  lockedByYou: boolean;
  settling: boolean;
  isGroup: boolean;
  me: { seat: string; name: string } | null;
};

const ctx = vi.hoisted(() => ({ current: {} as Ctx }));
vi.mock("@/components/TableCartProvider", () => ({ useCart: () => ctx.current }));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

const { AddButton } = await import("./AddButton");

const ITEM = "item-mohinga";
const NAME = "Mohinga";
const MY_SEAT = "seat-me";

/** The viewer's own quick-add line — the exact keys `matchOwnLines` requires (solo mode → to-go). */
const ownLine = (qty: number): CartItem => ({
  id: "line-1",
  menuItemId: ITEM,
  name: NAME,
  qty,
  modifiers: [],
  unitPriceCents: 1200,
  taxCents: 0,
  lineState: "draft",
  fulfillment: "togo",
  bySeat: MY_SEAT,
});

/** A promise the test resolves by hand — the write is "in flight" until it does. */
function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

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
  ctx.current = {
    add: vi.fn(async () => ({ state: "applied", view: [] }) as WriteResult<CartItem[]>),
    setItemQty: vi.fn(async () => ({ state: "applied", view: [] }) as WriteResult<CartItem[]>),
    refresh: vi.fn(async () => null),
    announce: vi.fn(),
    items: [],
    cartId: "cart-1",
    loading: false,
    locked: false,
    lockedByYou: false,
    settling: false,
    isGroup: false,
    me: { seat: MY_SEAT, name: "Me" },
  };
});

afterEach(cleanup);

/** The row control plus a sibling focus target, as on the real menu. */
const Row = () => (
  <>
    <AddButton menuItemId={ITEM} name={NAME} />
    <button type="button">elsewhere</button>
  </>
);
const renderRow = () => render(<Row />);
const pill = () => screen.getByRole("button", { name: new RegExp(`^(Add )?${NAME}`) });
const plus = () => screen.getByRole("button", { name: `Add another ${NAME}` });
const minus = () => screen.getByRole("button", { name: new RegExp(`^Remove (one )?${NAME}`) });
const elsewhere = () => screen.getByRole("button", { name: "elsewhere" });
const burst = () => document.querySelector(".mms-burst");
/** The "+" glyph inside the pill — where the reversal cue plays. */
const glyph = () => pill().querySelector("span[aria-hidden]:not(.mms-ripple)");
/** Let the write chain's microtasks run and React commit what they set. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
};

describe("the pill's tap — intent, spoken quietly, and the write carries no second claim", () => {
  it("bursts, speaks the named claim at the TAP, and hands add() claim:null + the name", async () => {
    const write = deferred<WriteResult<CartItem[]>>();
    ctx.current.add.mockImplementation(() => write.promise);
    renderRow();

    fireEvent.click(pill());
    // Synchronously, at the tap — before the chain's microtask has even started the write.
    const claim = pillAddClaim(NAME);
    expect(ctx.current.announce).toHaveBeenCalledWith(claim.text, claim.ms, claim.my, {
      quiet: claim.quiet,
      kind: "claim",
    });
    expect(burst()).not.toBeNull();

    await waitFor(() => expect(ctx.current.add).toHaveBeenCalledTimes(1));
    expect(ctx.current.add).toHaveBeenCalledWith(ITEM, [], undefined, 1, {
      claim: null,
      name: NAME,
    });

    ctx.current.items = [ownLine(1)];
    write.resolve({ state: "applied", view: [ownLine(1)] });
    await settle();
  });
});

describe("the stepper '+' — spoken at the tap, no gems", () => {
  it("queued taps each speak their own quantity, and none bursts", async () => {
    ctx.current.items = [ownLine(1)];
    const write = deferred<WriteResult<CartItem[]>>();
    ctx.current.add.mockImplementation(() => write.promise);
    renderRow();

    fireEvent.click(plus());
    fireEvent.click(plus());

    const said = ctx.current.announce.mock.calls.map((c) => c[0]);
    expect(said).toEqual([stepClaim(NAME, 2).text, stepClaim(NAME, 3).text]);
    // The second tap is QUEUED behind the first write — it was spoken anyway.
    await waitFor(() => expect(ctx.current.add).toHaveBeenCalledTimes(1));
    await settle();
    expect(ctx.current.add).toHaveBeenCalledTimes(1);
    expect(burst()).toBeNull();

    write.resolve({ state: "applied", view: [ownLine(2)] });
    await settle();
  });
});

describe("the burst's lifetime", () => {
  it("a reverted emptying '−' does not replay the last add's gems", async () => {
    const write = deferred<WriteResult<CartItem[]>>();
    ctx.current.add.mockImplementation(() => write.promise);
    renderRow();

    fireEvent.click(pill());
    expect(burst()).not.toBeNull(); // jsdom never fires animationend, so it is still mounted
    ctx.current.items = [ownLine(1)];
    write.resolve({ state: "applied", view: [ownLine(1)] });
    await settle();

    // The removal is REFUSED: the line survives and the stepper remounts.
    ctx.current.setItemQty.mockResolvedValue({ state: "refused", view: [ownLine(1)] });
    fireEvent.click(minus());
    await settle();

    expect(minus()).toBeTruthy(); // the stepper is back
    expect(burst()).toBeNull();
  });
});

describe("a create that does not land — the settle cue and ONE focus landing", () => {
  it("a lock refusal settles the pill and lands focus on it, focusable with its reason", async () => {
    ctx.current.add.mockImplementation(async () => {
      // As the applied LOCKED_BY_PEER recovery view does, before `add` returns.
      ctx.current.locked = true;
      return { state: "refused", view: [] };
    });
    renderRow();
    expect(document.activeElement).toBe(document.body);

    fireEvent.click(pill());
    await settle();

    expect(glyph()?.classList.contains("mms-settle")).toBe(true);
    expect(document.activeElement).toBe(pill());
    expect(pill().getAttribute("aria-disabled")).toBe("true");
    expect(pill().hasAttribute("disabled")).toBe(false);
    const reason = inertReason({
      minting: false,
      locked: true,
      lockedByYou: false,
      settling: false,
    });
    expect(pill().getAttribute("aria-label")).toBe(`${NAME} — ${reason}`);
  });

  it("the lock lifting later does NOT move focus back", async () => {
    ctx.current.add.mockImplementation(async () => {
      ctx.current.locked = true;
      return { state: "refused", view: [] };
    });
    const { rerender } = renderRow();
    fireEvent.click(pill());
    await settle();
    expect(document.activeElement).toBe(pill());

    // The diner moves on; the hold ends with the blur, so the frozen pill is natively inert again.
    act(() => elsewhere().focus());
    expect(pill().hasAttribute("disabled")).toBe(true);

    ctx.current.locked = false;
    rerender(<Row />);
    await settle();
    expect(document.activeElement).toBe(elsewhere());
  });

  it("a refusal while focus is ELSEWHERE holds nothing — the pill stays natively disabled", async () => {
    ctx.current.add.mockImplementation(async () => {
      ctx.current.locked = true;
      return { state: "refused", view: [] };
    });
    renderRow();
    fireEvent.click(pill());
    act(() => elsewhere().focus());
    await settle();

    expect(document.activeElement).toBe(elsewhere());
    expect(pill().hasAttribute("disabled")).toBe(true);
    expect(pill().hasAttribute("aria-disabled")).toBe(false);
  });

  it("unconfirmed: focus lands on the pill, and there is NO cue — it may be on the bill", async () => {
    ctx.current.add.mockResolvedValue({ state: "unconfirmed" });
    renderRow();

    fireEvent.click(pill());
    await settle();

    expect(glyph()?.classList.contains("mms-settle")).toBe(false);
    expect(document.activeElement).toBe(pill());
  });
});

describe("a create that lands never steals focus", () => {
  const landed = () =>
    ctx.current.add.mockImplementation(async () => {
      ctx.current.items = [ownLine(1)];
      return { state: "applied", view: [ownLine(1)] };
    });

  it("A — focus orphaned by the morph lands on the '+'", async () => {
    landed();
    renderRow();
    fireEvent.click(pill());
    await settle();
    expect(document.activeElement).toBe(plus());
  });

  it("B — focus the diner moved ELSEWHERE during the create stays there", async () => {
    const write = deferred<WriteResult<CartItem[]>>();
    ctx.current.add.mockImplementation(() => write.promise);
    renderRow();
    fireEvent.click(pill());
    act(() => elsewhere().focus());

    ctx.current.items = [ownLine(1)];
    write.resolve({ state: "applied", view: [ownLine(1)] });
    await settle();
    expect(document.activeElement).toBe(elsewhere());
  });

  it("C — focus already on this row's '−' is not moved to the '+'", async () => {
    const write = deferred<WriteResult<CartItem[]>>();
    ctx.current.add.mockImplementation(() => write.promise);
    renderRow();
    fireEvent.click(pill());
    act(() => minus().focus());

    ctx.current.items = [ownLine(1)];
    write.resolve({ state: "applied", view: [ownLine(1)] });
    await settle();
    expect(document.activeElement).toBe(minus());
  });
});

describe("the '−' revert-refocus cannot steal focus either", () => {
  it("a reverted emptying '−' under a freeze does not pull focus back when the freeze lifts", async () => {
    ctx.current.items = [ownLine(1)];
    ctx.current.setItemQty.mockImplementation(async () => {
      // The removal is refused by a lock that the recovery view applies before it returns.
      ctx.current.locked = true;
      return { state: "refused", view: [ownLine(1)] };
    });
    const { rerender } = renderRow();

    fireEvent.click(minus());
    await settle();
    // The stepper is back, frozen (its buttons natively disabled), so the revert-refocus waits.
    expect(minus().hasAttribute("disabled")).toBe(true);
    act(() => elsewhere().focus());

    ctx.current.locked = false;
    rerender(<Row />);
    await settle();
    expect(document.activeElement).toBe(elsewhere());
  });
});
