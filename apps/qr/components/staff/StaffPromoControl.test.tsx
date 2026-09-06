/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P3 — the register's promo control, and specifically the three things about it that are NOT
 * decisions of `lib/staff-promo.ts`.
 *
 * ⚠️ THE FIRST ONE IS A DEFECT THIS REPO HAS ALREADY SHIPPED ONCE. `StaffLangSwitch` disabled the
 * button it had just been tapped, which drops focus to `<body>` in a real browser — and jsdom does
 * NOT reproduce that, so its suite's "keeps focus on the tapped button" assertion was green over a
 * live keyboard bug for a whole PR. So this file does not assert FOCUS BEHAVIOUR under `disabled`
 * (jsdom cannot answer that question honestly); it asserts the STRUCTURE that decides it — no
 * control here ever carries the native attribute — plus the re-entry guard that has to exist because
 * `aria-disabled` does not block a click. Testing the thing jsdom can actually see is the point.
 */

const applyPromoForTable = vi.fn();
const clearPromoForTable = vi.fn();
vi.mock("@/lib/staff-promo", () => ({
  applyPromoForTable: (v: unknown) => applyPromoForTable(v),
  clearPromoForTable: (v: unknown) => clearPromoForTable(v),
}));

const { StaffPromoControl } = await import("./StaffPromoControl");

const SESSION = "11111111-1111-4111-8111-111111111111";
const props = {
  sessionId: SESSION,
  lang: "en" as const,
  promoCode: null as string | null,
  promoCents: null as number | null,
  canWrite: true,
  onError: vi.fn(),
  onChanged: vi.fn(),
};

afterEach(cleanup);
beforeEach(() => {
  applyPromoForTable.mockReset();
  clearPromoForTable.mockReset();
  props.onError.mockReset();
  props.onChanged.mockReset();
  applyPromoForTable.mockResolvedValue({ ok: true });
  clearPromoForTable.mockResolvedValue({ ok: true });
});

/** Role-based, label-agnostic: the visible label changes with `lang` AND with `busy`, and a query
 *  that keys off either would break for a reason the test is not about. */
const field = () => screen.getByRole("textbox");
const submit = () => screen.getByRole("button");

describe("StaffPromoControl", () => {
  it("never uses the native `disabled` attribute on any control", () => {
    // The whole rule in one assertion, swept over EVERY control rather than the two this file
    // happens to render today — a fourth control added later is covered without editing this test.
    const { container } = render(<StaffPromoControl {...props} />);
    // The label association is real, and asserted here rather than assumed by the role queries below.
    expect(screen.getByLabelText("Code")).toBe(field());
    fireEvent.change(field(), { target: { value: "PILOT15" } });
    expect(container.querySelectorAll("[disabled]")).toHaveLength(0);
    // …and the state IS conveyed: an empty field must still say the Apply button is unavailable.
    fireEvent.change(field(), { target: { value: "" } });
    expect(submit().getAttribute("aria-disabled")).toBe("true");
  });

  it("refuses a second REMOVE while one is in flight, and stays out of the native disabled trap", async () => {
    // The remove, not the apply: the apply is a `<form onSubmit>` whose handler already refuses a
    // re-entry, so mutating the ref guard there changes nothing and a test written on it would be
    // green for the wrong reason (measured — it was). The Remove button is a bare `onClick` with
    // `aria-disabled`, which does NOT block a click, so the guard inside `run` is the only thing
    // between a double tap and two removes. This is the control that proves it.
    let release!: (v: { ok: true }) => void;
    clearPromoForTable.mockReturnValue(
      new Promise<{ ok: true }>((r) => {
        release = r;
      }),
    );
    const { container } = render(<StaffPromoControl {...props} promoCode="PILOT15" />);
    const btn = submit();
    fireEvent.click(btn);
    // The node is HELD between clicks: the label flips to "Removing…", so re-querying by name would
    // fail here for the wrong reason and hide whether the second tap actually got through.
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(clearPromoForTable).toHaveBeenCalledTimes(1);
    // …and the busy state is announced WITHOUT the native attribute — asserted here rather than at
    // rest, because `disabled={false}` renders nothing at all and would pass a resting sweep.
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelectorAll("[disabled]")).toHaveLength(0);
    await act(async () => {
      release({ ok: true });
    });
  });

  it("keeps the FIELD out of the native disabled trap while an apply is in flight", () => {
    let release!: (v: { ok: true }) => void;
    applyPromoForTable.mockReturnValue(
      new Promise<{ ok: true }>((r) => {
        release = r;
      }),
    );
    const { container } = render(<StaffPromoControl {...props} />);
    fireEvent.change(field(), { target: { value: "PILOT15" } });
    fireEvent.click(submit());
    // `readOnly`, not `disabled`: same focus rule as the buttons, and it additionally stops the
    // value drifting under a request that already read it.
    expect(field().hasAttribute("readonly")).toBe(true);
    expect(container.querySelectorAll("[disabled]")).toHaveLength(0);
    release({ ok: true });
  });

  it("sends the TRIMMED code and the session it was mounted for", async () => {
    render(<StaffPromoControl {...props} />);
    fireEvent.change(field(), { target: { value: "  pilot15  " } });
    fireEvent.click(submit());
    await waitFor(() =>
      expect(applyPromoForTable).toHaveBeenCalledWith({ sessionId: SESSION, code: "pilot15" }),
    );
  });

  it("routes a refusal to the ONE live region, in the reader's language, and does not re-read", async () => {
    applyPromoForTable.mockResolvedValue({ ok: false, reason: "code_applied" });
    render(<StaffPromoControl {...props} lang="my" />);
    fireEvent.change(field(), { target: { value: "PILOT15" } });
    fireEvent.click(submit());
    await waitFor(() => expect(props.onError).toHaveBeenCalledTimes(2));
    // Cleared first (null), then the message — a stale refusal must never read as this one's answer.
    expect(props.onError.mock.calls[0]?.[0]).toBeNull();
    expect(props.onChanged).not.toHaveBeenCalled();
    const { container } = render(<>{props.onError.mock.calls[1]?.[0]}</>);
    expect(container.querySelector('[lang="my"]')).not.toBeNull();
  });

  it("renders EVERY refusal the action can return — no reason lands on an empty message", async () => {
    // The `Record<StaffPromoReason, StaffKey>` is compile-time exhaustive, but seven of those values
    // arrive as DATA from `mms_promo_check` and are cast, so this walks the union as VALUES.
    const reasons = [
      "invalid",
      "inactive",
      "not_started",
      "expired",
      "min_not_met",
      "exhausted",
      "session_limit",
      "outage",
      "signin",
      "rate_limited",
      "table_closed",
      "no_order",
      "cart_closed",
      "code_applied",
      "locked",
      "error",
      // …and one that is NOT in the union: a `reason` string added in SQL reaches this table with no
      // TypeScript error, and an unguarded lookup renders `<Chrome k={undefined}>`, which THROWS
      // inside render and takes the drill-down to app/staff/error.tsx on a mere refusal.
      "a_reason_sql_added_later",
    ];
    for (const reason of reasons) {
      cleanup();
      props.onError.mockReset();
      applyPromoForTable.mockResolvedValue({ ok: false, reason });
      render(<StaffPromoControl {...props} />);
      fireEvent.change(field(), { target: { value: "PILOT15" } });
      fireEvent.click(submit());
      await waitFor(() => expect(props.onError).toHaveBeenCalledTimes(2));
      const { container } = render(<>{props.onError.mock.calls[1]?.[0]}</>);
      expect(container.textContent?.trim(), `reason ${reason}`).not.toBe("");
    }
  });

  it("shows the DELIVERED amount, and says so honestly when it is nothing", () => {
    const { rerender } = render(
      <StaffPromoControl {...props} promoCode="PILOT15" promoCents={600} />,
    );
    expect(screen.getByText("$6.00 off this order")).toBeTruthy();
    rerender(<StaffPromoControl {...props} promoCode="PILOT15" promoCents={0} />);
    // No promise of a saving the receipt will not show, and no "right now" — a switched-off or
    // expired code is worth nothing PERMANENTLY, and that sentence would tell a cashier to wait.
    expect(screen.getByText("On the order, but it isn’t taking anything off.")).toBeTruthy();
    rerender(<StaffPromoControl {...props} promoCode="PILOT15" promoCents={null} />);
    expect(screen.getByText("On the order — nothing to price yet.")).toBeTruthy();
  });

  it("spends the focus latch on the FIRST refresh, MATCHED OR NOT", async () => {
    // Removing arms the latch for "the code is gone". The refresh that comes back does NOT say that
    // — a peer applied a different code first — so the latch is spent unmatched and nothing moves.
    // Held open (consumed only on a match) it survives its own action and fires on the NEXT change,
    // which can be minutes later and caused by someone else: focus jumps out from under whatever the
    // cashier is doing. The intermediate `promoCode="OTHER"` is the whole fixture; without a change
    // that fails to match, both versions behave identically.
    const { rerender } = render(<StaffPromoControl {...props} promoCode="PILOT15" />);
    fireEvent.click(submit());
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());

    rerender(<StaffPromoControl {...props} promoCode="OTHER" />);
    expect(document.activeElement).toBe(document.body);
    rerender(<StaffPromoControl {...props} promoCode={null} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("offers only the honest state when the cart cannot be written", () => {
    render(<StaffPromoControl {...props} canWrite={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("No code on this order.")).toBeTruthy();
  });
});
