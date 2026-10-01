/** @vitest-environment jsdom */
import { startTransition } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefundNeeded } from "@/lib/approvals";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_HANG_MS } from "@/lib/bounded-write";

/**
 * P2e review (A5) — the refunds strip's "Mark refunded" NAME says what the button SHOWS, in the
 * device's mode. Every row shows the same two words, so the name carries the payment intent too
 * (`al()`'s `verb` arm: the visible label, then the subject). Before this, the label half was
 * derived with its echo always on, so a Burmese-only device announced "Mark refunded" beside a
 * button that no longer printed it — a name holding a word the screen does not.
 *
 * Read off the RENDER, never off `al()`: the parts are the Burmese span and the English echo when
 * `<Chrome>` draws the pair, and the name must be exactly those parts, then the intent.
 */
const resolveRefundNeeded = vi.fn((_id: string) => Promise.resolve());
vi.mock("@/lib/approvals", () => ({
  resolveRefundNeeded: (id: string) => resolveRefundNeeded(id),
}));

const { RefundsNeededStrip } = await import("./RefundsNeededStrip");
const { StaffLangProvider } = await import("./StaffLangProvider");

afterEach(cleanup);

const ROW: RefundNeeded = {
  id: "r1",
  paymentIntent: "pi_r1",
  cartId: null,
  amountCents: 1200,
  reason: "orphaned_charge",
  createdAt: "2026-09-09T01:00:00.000Z",
};

const MODES = [
  ["English", "en", true],
  ["Both", "my", true],
  ["Burmese only", "my", false],
] as const;

describe("Mark refunded — the name is the button's own label, then the intent", () => {
  for (const [what, lang, echoes] of MODES) {
    it(`${what}: the label half of the name is exactly what the button shows`, () => {
      const { container } = render(
        <StaffLangProvider lang={lang} echoes={echoes}>
          <RefundsNeededStrip lang={lang} refunds={[ROW]} />
        </StaffLangProvider>,
      );
      const btn = container.querySelector<HTMLButtonElement>("#refund-mark-r1")!;
      const name = btn.getAttribute("aria-label") ?? "";
      const spans = btn.querySelectorAll('[lang="my"], .chrome-en');
      const parts = spans.length ? [...spans].map((e) => e.textContent ?? "") : [btn.textContent];
      expect(name).toBe(`${parts.join(" ")} — ${ROW.paymentIntent}`);
    });
  }

  it("Burmese only: no English in the name, because none is on the button", () => {
    const { container } = render(
      <StaffLangProvider lang="my" echoes={false}>
        <RefundsNeededStrip lang="my" refunds={[ROW]} />
      </StaffLangProvider>,
    );
    const btn = container.querySelector<HTMLButtonElement>("#refund-mark-r1")!;
    const en = STAFF["table.appr.verb.markRefunded"].en;
    expect(btn.textContent).not.toContain(en);
    expect(btn.getAttribute("aria-label")).not.toContain(en);
    expect(btn.getAttribute("aria-label")).toContain(STAFF["table.appr.verb.markRefunded"].my);
  });
});

describe("Mark refunded — Phase 2h: no transition, a bounded write, honest when unanswered", () => {
  // Every hung promise a case leaves is settled here (LEARNINGS #149: a pending async transition
  // entangles later cases).
  const settle: Array<() => void> = [];
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(async () => {
    await act(async () => {
      for (const s of settle.splice(0)) s();
    });
    vi.useRealTimers();
    resolveRefundNeeded.mockReset();
    resolveRefundNeeded.mockImplementation(() => Promise.resolve());
  });
  const flush = (ms = 0) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  function hungMark() {
    let answer!: () => void;
    let fail!: (e: Error) => void;
    resolveRefundNeeded.mockImplementationOnce(
      () =>
        new Promise<void>((res, rej) => {
          answer = res;
          fail = rej;
        }),
    );
    return { answer: () => answer(), fail: (e: Error) => fail(e) };
  }
  function strip() {
    const onResolved = vi.fn();
    render(
      <StaffLangProvider lang="en">
        <RefundsNeededStrip lang="en" refunds={[ROW]} onResolved={onResolved} />
      </StaffLangProvider>,
    );
    return onResolved;
  }
  const mark = () => document.querySelector<HTMLButtonElement>("#refund-mark-r1")!;
  const commit = async () => {
    fireEvent.click(mark());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Yes, mark it done|Marking…/ }));
    });
  };
  const line = () => document.querySelector('[role="status"]');
  const reload = () => screen.queryByRole("button", { name: STAFF["out.reload"].en });

  it("no answer at the bound: the lock frees even beside an unrelated hung transition, and the line says 'no answer yet' with the reload", async () => {
    // Another surface's async transition, never answered (the expo lane, the approvals queue): under
    // the old `useTransition` lock this held every row's buttons dimmed (entangled `pending`).
    startTransition(async () => {
      await new Promise<void>((r) => settle.push(r));
    });
    hungMark();
    strip();
    await commit();
    expect(screen.getByRole("button", { name: "Marking…" }).getAttribute("aria-busy")).toBe("true");
    await flush(STAFF_HANG_MS - 1);
    expect(screen.getByRole("button", { name: "Marking…" })).toBeTruthy();
    // MUTATION (p2h-doors/refund-mark-unbounded): the bound never fires — "Marking…" holds and
    // every row is dimmed for as long as the queue is stuck; red.
    await flush(1);
    expect(mark().getAttribute("aria-disabled")).toBeNull();
    expect(document.activeElement).toBe(mark());
    // MUTATION (p2h-doors/refund-mark-waiting-unsaid): the bound passes in silence; red.
    expect(line()?.textContent).toContain(STAFF["table.appr.refunds.markWaiting"].en);
    // MUTATION (p2h-doors/refund-mark-reload-missing): "reload the page" with no reload on a
    // standalone console; red.
    expect(reload()).not.toBeNull();
    expect(line()!.contains(reload())).toBe(false);
    expect(document.querySelectorAll("[disabled]")).toHaveLength(0);
  });

  it("a LATE mark lands: the row is handed up as resolved, and its line goes", async () => {
    const h = hungMark();
    const onResolved = strip();
    await commit();
    await flush(STAFF_HANG_MS);
    expect(onResolved).not.toHaveBeenCalled();
    expect(line()?.textContent).toContain(STAFF["table.appr.refunds.markWaiting"].en);
    // MUTATION (p2h-doors/refund-mark-late-ok-dropped): the late answer is dropped — the row stays
    // under "no answer yet" though the server marked it done; red.
    await act(async () => h.answer());
    expect(onResolved).toHaveBeenCalledWith("r1");
    expect(line()).toBeNull();
  });

  it("a LATE throw turns the waiting line into 'couldn't confirm'", async () => {
    const h = hungMark();
    strip();
    await commit();
    await flush(STAFF_HANG_MS);
    expect(line()?.textContent).toContain(STAFF["table.appr.refunds.markWaiting"].en);
    // MUTATION (p2h-doors/refund-mark-late-throw-unsaid): "no answer yet" stands for good; red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(line()?.textContent).toContain(STAFF["table.appr.refunds.markUnknown"].en);
  });

  it("a THROWN mark says it may still be done — never 'nothing was recorded' — and offers the reload", async () => {
    const h = hungMark();
    vi.spyOn(console, "error").mockImplementation(() => {});
    strip();
    await commit();
    await act(async () => h.fail(new Error("fetch failed")));
    // MUTATION (p2h-doors/refund-mark-threw-says-failed): the old "Couldn't resolve that just now —
    // please try again", a claim a lost answer cannot make; red.
    expect(line()?.textContent).toContain(STAFF["table.appr.refunds.markUnknown"].en);
    expect(line()?.textContent).not.toContain(STAFF["table.appr.msg.failed"].en);
    expect(reload()).not.toBeNull();
    expect(mark().getAttribute("aria-disabled")).toBeNull();
  });
});
