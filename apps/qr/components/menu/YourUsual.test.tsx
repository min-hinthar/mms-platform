/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { WriteResult } from "@/lib/write-outcome";
import type { CartItem } from "@mms/db";
import { classifyRefusedWrite, refusedWriteNotice } from "@/lib/cart-freeze";
import type { UsualCandidate, UsualOutcome } from "@/lib/menu/your-usual";

/**
 * T18 — the /menu resume loop, which is where a committed write becomes a second line on a bill.
 *
 * ## Why this file exists at all
 *
 * Every rule below lived ONLY in `YourUsual.tsx` until now. `mayRetry` and the three `WriteResult`
 * states are pinned by `lib/write-outcome.test.ts`, but the LOOP that consults them was invisible:
 * no vitest config matched `.test.tsx`, `check-money-coverage` skipped the suffix outright, and
 * `check-child-freeze` never even opened this file (it imports `add` from the React CONTEXT, so the
 * guard's `localToExported` map is empty and it `continue`s before any rule runs). Deleting the
 * `mayRetry` call and re-adding every non-applied write would have left the whole gate green.
 *
 * ## The mock is ONE module, on purpose
 *
 * `vi.mock("@/components/TableCartProvider")` replaces the context hook with a mutable fixture, so
 * the real provider — and its three separate `server-only` import chains — is never loaded. Nothing
 * else needs stubbing: this component's entire import surface is React, that context, `write-outcome`,
 * `haptics` and `menu/your-usual`, and the last three are pure (`haptic` additionally self-guards
 * inside a `try`, which is what absorbs jsdom's missing `matchMedia`).
 */

const ctx = vi.hoisted(() => ({
  current: {} as {
    add: (id: string) => Promise<WriteResult<CartItem[]>>;
    announce: (msg: string, ms?: number) => void;
    cartId: string | null;
    lastRefusalNotice: () => string | null;
    loading: boolean;
  },
}));

vi.mock("@/components/TableCartProvider", () => ({ useCart: () => ctx.current }));

const { YourUsual } = await import("./YourUsual");

const dish = (id: string, name: string): UsualCandidate => ({
  id,
  name,
  soldOut: false,
  needsChoice: false,
});
const MOHINGA = dish("item-mohinga", "Mohinga");
const SALAD = dish("item-salad", "Tea Leaf Salad");

const SINGLE: UsualOutcome = { state: "single", items: [MOHINGA] };
const PAIR: UsualOutcome = { state: "pair", items: [MOHINGA, SALAD] };

const APPLIED: WriteResult<CartItem[]> = { state: "applied", view: [] };
const UNCONFIRMED: WriteResult<CartItem[]> = { state: "unconfirmed" };
const REFUSED: WriteResult<CartItem[]> = { state: "refused", view: [] };

/**
 * The sentence the provider publishes for a peer lock — DERIVED from the module that produces it.
 *
 * ⚠️ THE FIRST DRAFT INVENTED THIS STRING, and the blind adversarial pass on #252 called it CRITICAL
 * for the right reason: `refusedWriteNotice` can produce exactly four sentences, and
 * "Nour is checking out — your order is locked for a moment." is not among them. Asserting a
 * composition around a string no producer emits proves nothing about the composition — and it hid
 * what the real one reads like.
 *
 * ⚠️ IT STUTTERS, AND THAT IS A REAL SHIPPED DEFECT — filed as T32, NOT fixed here. `YourUsual`
 * composes `${dish} didn’t go through. ${cause}`, and every freeze cause already opens with
 * "That didn’t go through — ", so the live region says it twice in one breath. The `unknown` cause
 * is worse: a refusal followed by "We couldn’t confirm that". The fix is a clause export from
 * `cart-freeze.ts` (the "name it ONCE" rule applied to a sentence fragment) plus a mutant, which is
 * a copy change and does not belong in a test-infrastructure PR. It is pinned AS IT STANDS so the
 * fix starts from a failing assertion rather than from a blank page.
 */
const LOCK_NOTICE = refusedWriteNotice(
  classifyRefusedWrite({
    ok: true,
    freeze: { locked: true, lockedBy: "seat-peer", mySeat: "seat-me" },
    settling: false,
  }),
  false,
);

// Typed mocks, not `ReturnType<typeof vi.fn>` — an untyped mock assigned into the fixture is an
// `any` in disguise, and this file's whole job is to notice when the component's contract drifts.
let add: Mock<(id: string) => Promise<WriteResult<CartItem[]>>>;
let announce: Mock<(msg: string, ms?: number) => void>;
let lastRefusalNotice: Mock<() => string | null>;

beforeEach(() => {
  add = vi.fn(async () => APPLIED);
  announce = vi.fn();
  lastRefusalNotice = vi.fn(() => null);
  ctx.current = { add, announce, cartId: "cart-1", lastRefusalNotice, loading: false };
});

// RTL's auto-cleanup only registers when vitest `globals` is on, and this repo leaves it off.
afterEach(cleanup);

const cta = () => screen.getByRole("button");
/** The click plus the microtasks the async handler needs; the loop awaits one `add` per dish. */
const press = async (times = 1) => {
  fireEvent.click(cta());
  await waitFor(() => expect(add).toHaveBeenCalledTimes(times));
};

describe("YourUsual — a write that MIGHT have landed is never re-sent", () => {
  it("does not re-add an unconfirmed dish, and never claims it landed", async () => {
    // The T26 defect in its original form: `add` answered `null` for BOTH "refused" and
    // "committed, view unreadable", so this loop resumed AT the committed dish and the diner's
    // retry put a second line on a real bill. `mayRetry` is true for `refused` alone.
    add.mockResolvedValue(UNCONFIRMED);
    render(<YourUsual outcome={SINGLE} />);

    await press();
    // The loop ran to the end — nothing is re-sendable — so there is nothing left to press.
    await waitFor(() => expect(cta().textContent).toBe("Sent"));
    fireEvent.click(cta());
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));

    // ...and "Sent" is the whole claim. `Added ✓` would assert a landing nobody observed.
    expect(cta().textContent).not.toMatch(/Added/);
    expect(announce).toHaveBeenCalledWith(
      "Mohinga sent — we couldn’t confirm all of them. Check your order below.",
    );
    // The accessible name must agree with the visible one (WCAG 2.5.3) and be equally careful.
    expect(cta().getAttribute("aria-label")).toBe("Mohinga sent — check your order below");
  });

  it("DOES re-send a refusal — the one state where the cart was read and the dish was not in it", async () => {
    add.mockResolvedValueOnce(REFUSED).mockResolvedValueOnce(APPLIED);
    render(<YourUsual outcome={SINGLE} />);

    await press();
    // Refused ⇒ the resume point stays AT this dish, so the control is still live.
    await waitFor(() => expect(cta().getAttribute("aria-disabled")).toBe("false"));
    await press(2);
    await waitFor(() => expect(cta().textContent).toBe("Added ✓"));
  });
});

describe("YourUsual — a partial add names only what it saw land", () => {
  it("carries the provider's sentence and credits NO dish when the earlier one was unconfirmed", async () => {
    // Codex round 2 on #251 (P2): the prefix used to fire on `i > 0` alone, so it credited the
    // first dish even when that dish was the unconfirmed one — a false claim about a real order.
    add.mockResolvedValueOnce(UNCONFIRMED).mockResolvedValueOnce(REFUSED);
    lastRefusalNotice.mockReturnValue(LOCK_NOTICE);
    render(<YourUsual outcome={PAIR} />);

    await press(2);
    await waitFor(() => expect(announce).toHaveBeenCalled());
    expect(announce).toHaveBeenLastCalledWith(`Tea Leaf Salad didn’t go through. ${LOCK_NOTICE}`);
    // The established cause is carried verbatim; this component must never author its own.
    expect(announce.mock.lastCall?.[0]).not.toMatch(/Added Mohinga/);
    expect(announce.mock.lastCall?.[0]).not.toMatch(/from the menu below/);
  });

  it("credits the first dish when it DID land", async () => {
    // The separating fixture for the assertion above: same shape, one state changed. Without this
    // pair the prefix rule is degenerate — an implementation that never credits anything passes.
    add.mockResolvedValueOnce(APPLIED).mockResolvedValueOnce(REFUSED);
    lastRefusalNotice.mockReturnValue(LOCK_NOTICE);
    render(<YourUsual outcome={PAIR} />);

    await press(2);
    await waitFor(() => expect(announce).toHaveBeenCalled());
    expect(announce).toHaveBeenLastCalledWith(
      `Added Mohinga — Tea Leaf Salad didn’t go through. ${LOCK_NOTICE}`,
    );
  });

  it("speaks plainly when the provider published no cause", async () => {
    add.mockResolvedValueOnce(APPLIED).mockResolvedValueOnce(REFUSED);
    render(<YourUsual outcome={PAIR} />);

    await press(2);
    await waitFor(() => expect(announce).toHaveBeenCalled());
    expect(announce).toHaveBeenLastCalledWith(
      "Added Mohinga — we couldn’t add Tea Leaf Salad just now.",
    );
  });
});

describe("YourUsual — the unconfirmed tally outlives the invocation that produced it", () => {
  it("still refuses to claim a landing on the retry that clears the refusal", async () => {
    // TWO invocations, deliberately: a single pass cannot separate "this pass had an unconfirmed
    // write" from "any pass did", so a one-press fixture is degenerate for this rule. Dish 1 is
    // unconfirmed and dish 2 refused; the retry resumes at dish 2 with a FRESH per-pass tally, and
    // an implementation that consults only that tally announces that everything landed.
    add.mockResolvedValueOnce(UNCONFIRMED).mockResolvedValueOnce(REFUSED);
    lastRefusalNotice.mockReturnValue(LOCK_NOTICE);
    render(<YourUsual outcome={PAIR} />);

    await press(2);
    add.mockResolvedValue(APPLIED);
    await press(3);

    await waitFor(() => expect(cta().textContent).toBe("Sent"));
    expect(announce).toHaveBeenLastCalledWith(
      "Mohinga + Tea Leaf Salad sent — we couldn’t confirm all of them. Check your order below.",
    );
    expect(announce.mock.lastCall?.[0]).not.toMatch(/^Added /);
  });

  it("says everything landed when everything did", async () => {
    render(<YourUsual outcome={PAIR} />);
    await press(2);
    await waitFor(() => expect(cta().textContent).toBe("Added ✓"));
    expect(announce).toHaveBeenLastCalledWith("Added Mohinga + Tea Leaf Salad to your order.");
  });
});

describe("YourUsual — suppression never outlives the cart it was reasoning about", () => {
  it("re-offers the dishes when the session re-mints into a different cart", async () => {
    // Codex round 5 on #251 (P2). `explainCaught`'s unreachable arm calls `revalidate()`, which can
    // return a FRESH cart id — one containing none of these dishes. The counters used to survive
    // that, so the CTA sat disabled reading "Added ✓" over an empty cart with no way back.
    const { rerender } = render(<YourUsual outcome={PAIR} />);
    await press(2);
    await waitFor(() => expect(cta().textContent).toBe("Added ✓"));
    expect(cta().getAttribute("aria-disabled")).toBe("true");

    ctx.current = { ...ctx.current, cartId: "cart-2" };
    rerender(<YourUsual outcome={PAIR} />);

    expect(cta().textContent).toBe("Add both");
    expect(cta().getAttribute("aria-disabled")).toBe("false");
  });
});

describe("YourUsual — the control stays reachable, and says nothing it cannot support", () => {
  it("is never natively `disabled`, so a keyboard press cannot drop focus to <body>", async () => {
    // WCAG 2.4.3: browsers blur a disabled element. The gate is an early return plus
    // `aria-disabled`, which keeps the control focusable and announced.
    render(<YourUsual outcome={SINGLE} />);
    const button = cta();
    button.focus();
    await press();
    await waitFor(() => expect(button.getAttribute("aria-disabled")).toBe("true"));
    expect(button).not.toHaveProperty("disabled", true);
    expect(document.activeElement).toBe(button);
  });

  it("renders nothing at all when there is no honest claim to make", () => {
    const { container } = render(<YourUsual outcome={{ state: "none" }} />);
    expect(container.innerHTML).toBe("");
  });

  it("refuses to fire while the session is still minting", async () => {
    ctx.current = { ...ctx.current, loading: true };
    render(<YourUsual outcome={SINGLE} />);
    expect(cta().textContent).toBe("One moment…");
    fireEvent.click(cta());
    // ⚠️ SYNCHRONOUS. A `waitFor` over a NEGATIVE assertion resolves on its first check, so it could
    // only ever fail by the accident that `addAll` reaches `add` inside the click dispatch — one
    // `await` added before the loop would make it permanently vacuous (blind pass on #252). The gate
    // is an early return, so the correct assertion is that nothing happened at all, right now.
    expect(add).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(add).not.toHaveBeenCalled();
  });
});
