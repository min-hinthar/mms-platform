/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { startTransition } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RefundResult, SettledLine, SettledOrder } from "@/lib/refunds";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_HANG_MS, track } from "@/lib/bounded-write";

/**
 * The refund sheet's tap discipline (§17 — never native `disabled`) and its bounded write (Phase 2h).
 * No-PIN (owner, 2026-10-24): there is no PIN field — the signed-in manager's tap is the authority.
 */
const refundLine = vi.fn(
  (): Promise<RefundResult> => Promise.resolve({ ok: false, reason: "not_paid" }),
);
vi.mock("@/lib/refunds", () => ({ refundLine: (...a: unknown[]) => refundLine(...(a as [])) }));
vi.mock("./TicketText", () => ({ ExpoLineMy: () => null }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { RefundActionSheet } = await import("./RefundActionSheet");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const line = {
  id: "li1",
  name: "Mohinga",
  nameMy: null,
  qty: 1,
  unitPriceCents: 1200,
  taxCents: 100,
  modifiers: [],
  modifiersMy: [],
  notes: null,
  fulfillment: "dinein",
  refundedCents: 0,
  refunded: false,
  offeredCents: 1300,
  offerClamped: false,
} as SettledLine;
const order = {
  id: "o1",
  code: "AB12",
  tableNumber: 4,
  refundPath: "app",
  lines: [line],
} as unknown as SettledOrder;

function mount() {
  render(
    <StaffLangProvider lang="en">
      <RefundActionSheet open order={order} line={line} onClose={() => {}} onDone={() => {}} />
    </StaffLangProvider>,
  );
  const refund = () =>
    screen.getByRole("button", { name: /Refund \$13\.00|Refunding/ }) as HTMLButtonElement;
  return { refund };
}

describe("RefundActionSheet — No-PIN (owner, 2026-10-24): the signed-in manager's tap is the authority", () => {
  it("there is no PIN field; a tap sends the line and the reason ONLY (`refund-sheet/sends-a-pin`)", async () => {
    const { refund } = mount();
    expect(document.getElementById("refund-pin")).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(refund().getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(refundLine).toHaveBeenCalledWith({ orderItemId: "li1", reason: "unhappy" });
  });

  it("a refusal keeps the sheet, says why, and hands focus to the reason", async () => {
    const { refund } = mount();
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(document.activeElement?.id).toBe("refund-reason");
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      STAFF["floor.refund.err.notPaid"].en,
    );
    expect(refund().disabled).toBe(false);
  });

  it("§17 — while the refund runs the button is aria-disabled + busy and says a stated word", async () => {
    let release: ((r: RefundResult) => void) | null = null;
    refundLine.mockReturnValueOnce(
      new Promise<RefundResult>((r) => {
        release = r;
      }),
    );
    const { refund } = mount();
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(refund().disabled).toBe(false);
    expect(refund().getAttribute("aria-busy")).toBe("true");
    expect(refund().textContent).toContain(STAFF["floor.refund.working"].en);
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(refundLine).toHaveBeenCalledTimes(1);
    await act(async () => {
      release!({ ok: true, amountCents: 1300 });
    });
  });
});

// ── Phase 2h · p2h-sheets ──
const hanging: Array<() => void> = [];
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
/** Settled in `afterEach` once the tree is gone: a pre-fix transition left pending by a red-first
 *  run must never entangle the next case. */
function hang<T>(end: T) {
  const d = deferred<T>();
  hanging.push(() => d.resolve(end));
  return d;
}

describe("RefundActionSheet — a hung refund never traps the sheet (Phase 2h · 9a · 9d · 9e)", () => {
  afterEach(async () => {
    vi.useRealTimers();
    cleanup();
    await act(async () => {
      for (const end of hanging.splice(0)) end();
    });
  });
  const region = () => document.querySelector('[role="dialog"] [role="status"]')!;
  /** Critic F1 — whether the region's CONTENT was replaced or rewritten (what a screen reader
   *  announces) between this call and the returned check; equal text rendered in place records none. */
  const watchRegion = (node: Element) => {
    const recs: MutationRecord[] = [];
    const obs = new MutationObserver((rs) => {
      recs.push(...rs);
    });
    obs.observe(node, { childList: true, subtree: true, characterData: true });
    return () => {
      recs.push(...obs.takeRecords());
      obs.disconnect();
      return recs.some(
        (r) => r.type === "characterData" || (r.type === "childList" && r.addedNodes.length > 0),
      );
    };
  };
  const reloadBtn = () => screen.queryByRole("button", { name: STAFF["out.reload"].en });
  const closeX = () =>
    screen.getByRole("button", {
      name: (n) => n === STAFF["shell.close"].en || n === STAFF["shell.closeBusy"].en,
    });
  const cancelBtn = () =>
    screen.getByRole("button", { name: new RegExp(STAFF["table.appr.verb.cancel"].en) });
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  function mountSpied() {
    const onDone = vi.fn();
    const onClose = vi.fn();
    render(
      <StaffLangProvider lang="en">
        <RefundActionSheet open order={order} line={line} onClose={onClose} onDone={onDone} />
      </StaffLangProvider>,
    );
    const refund = () =>
      screen.getByRole("button", { name: /Refund \$13\.00|Refunding/ }) as HTMLButtonElement;
    const tap = async () => {
      await act(async () => {
        fireEvent.click(refund());
      });
    };
    return { onDone, onClose, refund, tap };
  }

  it("no answer at STAFF_HANG_MS: the sheet frees (✕ and Cancel live), says the refund may still go through, offers the reload", async () => {
    vi.useFakeTimers();
    refundLine.mockReturnValueOnce(hang<RefundResult>({ ok: false, reason: "not_paid" }).promise);
    const { refund, tap, onClose } = mountSpied();
    await tap();
    expect(refund().getAttribute("aria-busy")).toBe("true");
    expect(closeX().getAttribute("aria-disabled")).toBe("true");
    await advance(STAFF_HANG_MS - 1);
    expect(refund().getAttribute("aria-busy")).toBe("true");
    await advance(1);
    // MUTATION (p2h-sheets/refund/busy-never-clears): every exit refused forever; red.
    expect(refund().getAttribute("aria-busy")).toBeNull();
    expect(closeX().getAttribute("aria-disabled")).toBeNull();
    expect(cancelBtn().getAttribute("aria-disabled")).toBeNull();
    // MUTATION (p2h-sheets/refund/waiting-said-as-unknown): "couldn't confirm" over a refund that is
    // merely late; red.
    expect(region().textContent).toBe(STAFF["floor.refund.waiting"].en);
    // MUTATION (p2h-sheets/refund/no-reload): red.
    expect(reloadBtn()).not.toBeNull();
    await act(async () => {
      fireEvent.click(cancelBtn());
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the entanglement proxy: an UNRELATED async transition left hanging — the sheet still frees at the bound", async () => {
    vi.useFakeTimers();
    const other = hang<void>(undefined);
    act(() => {
      startTransition(async () => {
        await other.promise;
      });
    });
    refundLine.mockReturnValueOnce(hang<RefundResult>({ ok: false, reason: "not_paid" }).promise);
    const { refund, tap } = mountSpied();
    await tap();
    await advance(STAFF_HANG_MS);
    expect(refund().getAttribute("aria-busy")).toBeNull();
    expect(closeX().getAttribute("aria-disabled")).toBeNull();
  });

  it("a LATE ok reaches the board even after the sheet was closed: onDone with the SERVER's figure", async () => {
    vi.useFakeTimers();
    const late = deferred<RefundResult>();
    refundLine.mockReturnValueOnce(late.promise);
    const { tap, onDone } = mountSpied();
    await tap();
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["floor.refund.waiting"].en);
    cleanup(); // the manager closed it; the board unmounted the sheet
    await act(async () => {
      late.resolve({ ok: true, amountCents: 1250 });
    });
    // MUTATION (p2h-sheets/refund/late-answer-dropped): money left the card and the board is never
    // told — no confirmation, no refresh; red.
    expect(onDone).toHaveBeenCalledWith(1250);
  });

  it("a LATE refusal is said while the sheet is open ; a late throw is 'couldn't confirm'", async () => {
    vi.useFakeTimers();
    const late = deferred<RefundResult>();
    refundLine.mockReturnValueOnce(late.promise);
    const { tap } = mountSpied();
    await tap();
    await advance(STAFF_HANG_MS);
    await act(async () => {
      late.resolve({ ok: false, reason: "not_paid" });
    });
    expect(region().textContent).toBe(STAFF["floor.refund.err.notPaid"].en);
    cleanup();
    const late2 = deferred<RefundResult>();
    refundLine.mockReturnValueOnce(late2.promise);
    const second = mountSpied();
    await second.tap();
    await advance(STAFF_HANG_MS);
    await act(async () => {
      late2.reject(new Error("fetch failed"));
    });
    // MUTATION (p2h-sheets/refund/late-throw-unsaid): "no answer yet" stands for good; red.
    expect(region().textContent).toBe(STAFF["floor.refund.err.unknown"].en);
  });

  it("a LATE refusal for a sheet that was closed never reaches into the refund sheet opened since", async () => {
    vi.useFakeTimers();
    const late = deferred<RefundResult>();
    refundLine.mockReturnValueOnce(late.promise);
    const first = mountSpied();
    await first.tap();
    await advance(STAFF_HANG_MS);
    cleanup(); // closed; the manager opens the next line's refund
    const next = mountSpied();
    // Focus somewhere other than the reason: a late refusal must not move it there.
    const held = next.refund();
    held.focus();
    await act(async () => {
      late.resolve({ ok: false, reason: "not_paid" });
    });
    // MUTATION (p2h-sheets/refund/late-refusal-reaches-the-next-sheet): the closed sheet's refusal
    // focuses the NEW sheet's reason (the id is shared) out from under the manager; red.
    expect(document.activeElement).toBe(held);
  });

  it("a THROWN refund may have moved money: 'couldn't confirm — check the order', never 'couldn't refund — try again'", async () => {
    vi.useFakeTimers();
    refundLine.mockRejectedValueOnce(new Error("fetch failed"));
    const { tap, refund } = mountSpied();
    await tap();
    // MUTATION (p2h-sheets/refund/threw-said-as-failed): the old catch's "Couldn't refund that line —
    // try again" — and the manager refunds a second time; red.
    expect(region().textContent).toBe(STAFF["floor.refund.err.unknown"].en);
    expect(refund().getAttribute("aria-busy")).toBeNull();
  });

  it("a re-tap while the refund is still out is REFUSED, never sent — in the refund's OWN words ('don't refund it again'), with the reload (owner decision)", async () => {
    vi.useFakeTimers();
    refundLine.mockReturnValueOnce(hang<RefundResult>({ ok: false, reason: "not_paid" }).promise);
    const { tap } = mountSpied();
    await tap();
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["floor.refund.waiting"].en);
    const said = watchRegion(region());
    await tap();
    // Never sent: a second refund queued behind the first.
    expect(refundLine).toHaveBeenCalledTimes(1);
    // Critic F1 — RE-SAID, not left standing: the waiting line was already in the region, and equal
    // text re-rendered in place is no DOM change — nothing announced, nothing seen, a dead tap.
    // MUTATION (p2h-int-c/refund/resay-unkeyed · p2h-int-c/refund/refusal-unsaid): red.
    expect(said()).toBe(true);
    // MUTATION (p2h-int-c/refund/own-wait-said-as-stalled · p2h-sheets/refund/own-wait-forgotten):
    // its own refund IS the stall, but "this did nothing" drops "Don't refund it again or hand
    // anything back" — the guest is refunded twice, once in cash; red.
    expect(region().textContent).toBe(STAFF["floor.refund.waiting"].en);
    expect(reloadBtn()).not.toBeNull();
  });

  it("a tablet stalled on ANOTHER action refuses the refund at the tap: nothing dispatched", async () => {
    vi.useFakeTimers();
    track(new Promise(() => {}));
    await advance(STAFF_HANG_MS);
    const { tap, refund } = mountSpied();
    await tap();
    // MUTATION (p2h-sheets/refund/stalled-tap-dispatches): the refund queued behind the hung action,
    // to be released whenever the queue moves; red.
    expect(refundLine).not.toHaveBeenCalled();
    expect(refund().getAttribute("aria-busy")).toBeNull();
    expect(region().textContent).toBe(STAFF["out.stalled"].en);
    expect(reloadBtn()).not.toBeNull();
  });

  it("a re-tap of THIS sheet's own waiting refund is refused even with the wall clock set back mid-hang — and sent again once it answers (critic F12)", async () => {
    vi.useFakeTimers();
    const late = deferred<RefundResult>();
    refundLine.mockReturnValueOnce(late.promise);
    const { tap } = mountSpied();
    await tap();
    await advance(STAFF_HANG_MS);
    vi.setSystemTime(Date.now() - 60_000); // a wall clock set back: the own wait refuses regardless
    await tap();
    // MUTATION (p2h-sheets/refund/own-wait-forgotten): a second refund queued behind the first —
    // money out twice if the stale board's refusal does not catch it; red.
    expect(refundLine).toHaveBeenCalledTimes(1);
    expect(region().textContent).toBe(STAFF["floor.refund.waiting"].en);
    await act(async () => {
      late.resolve({ ok: false, reason: "stripe_error" });
    });
    refundLine.mockReturnValueOnce(hang<RefundResult>({ ok: false, reason: "not_paid" }).promise);
    await tap();
    // MUTATION (p2h-sheets/refund/own-wait-never-cleared): an answered refund still refuses the retry; red.
    expect(refundLine).toHaveBeenCalledTimes(2);
  });

  it("a sheet RE-OPENED for the same line while its refund is still out remembers it: the re-tap says the refund's OWN line, never 'this did nothing' (review a, A4 · decision 9i)", async () => {
    vi.useFakeTimers();
    const late = deferred<RefundResult>();
    refundLine.mockReturnValueOnce(late.promise);
    const first = mountSpied();
    await first.tap();
    await advance(STAFF_HANG_MS);
    cleanup(); // put away — the board keys the next open as a fresh mount
    const again = mountSpied();
    await again.tap();
    expect(refundLine).toHaveBeenCalledTimes(1);
    // MUTATION (p2h-rev-a/refund/subject-unkeyed): a per-mount wait is forgotten by the remount,
    // and the re-tap says the tablet's "this did nothing" — dropping "don't refund it again"; red.
    expect(region().textContent).toBe(STAFF["floor.refund.waiting"].en);
    await act(async () => {
      late.resolve({ ok: false, reason: "stripe_error" });
    });
    refundLine.mockReturnValueOnce(hang<RefundResult>({ ok: false, reason: "not_paid" }).promise);
    await again.tap();
    // The late answer reached the subject through the CLOSED mount's closure: the re-opened sheet
    // may send again.
    expect(refundLine).toHaveBeenCalledTimes(2);
  });

  it("a CASH refund with no answer carries its own hand-back in the waiting line — the reload it asks for kills the answer that would have said it (review a, A2)", async () => {
    vi.useFakeTimers();
    refundLine.mockReturnValueOnce(hang<RefundResult>({ ok: false, reason: "not_paid" }).promise);
    const cash = { ...order, refundPath: "cash" } as SettledOrder;
    render(
      <StaffLangProvider lang="en">
        <RefundActionSheet open order={cash} line={line} onClose={() => {}} onDone={() => {}} />
      </StaffLangProvider>,
    );
    const tap = async () => {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Refund \$13\.00|Refunding/ }));
      });
    };
    await tap();
    await advance(STAFF_HANG_MS);
    const said = STAFF["floor.refund.waitingCash"].en.replace("{m}", "$13.00");
    // MUTATION (p2h-rev-a/refund/cash-waiting-said-as-card): the card line — "don't hand anything
    // back" — and after the reload nothing on the screen ever says to hand the $13.00 back; red.
    expect(region().textContent).toBe(said);
    // MUTATION (p2h-rev-a/refund/cash-waiting-no-reload): the sentence says reload, no button; red.
    expect(reloadBtn()).not.toBeNull();
    // The re-tap re-says the SAME cash line, figure included (decision 9i).
    await tap();
    expect(refundLine).toHaveBeenCalledTimes(1);
    // MUTATION (p2h-rev-a/refund/cash-refusal-loses-figure): the refusal drops {m}; red.
    expect(region().textContent).toBe(said);
  });

  it("a sheet for ANOTHER line is not refused in this line's words — another line's wait is the tablet's stall (review a, A4)", async () => {
    vi.useFakeTimers();
    refundLine.mockReturnValueOnce(hang<RefundResult>({ ok: false, reason: "not_paid" }).promise);
    const first = mountSpied();
    await first.tap();
    await advance(STAFF_HANG_MS);
    cleanup();
    const other = { ...line, id: "li2" } as SettledLine;
    render(
      <StaffLangProvider lang="en">
        <RefundActionSheet open order={order} line={other} onClose={() => {}} onDone={() => {}} />
      </StaffLangProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Refund \$13\.00/ }));
    });
    expect(refundLine).toHaveBeenCalledTimes(1);
    // MUTATION (p2h-rev-a/refund/subject-shared): one key for every line — the other line's sheet
    // claims a refund it never sent; red.
    expect(region().textContent).toBe(STAFF["out.stalled"].en);
  });
});
