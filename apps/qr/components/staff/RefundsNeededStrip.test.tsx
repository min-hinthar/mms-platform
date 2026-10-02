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
    // The strip's lock frees ("Marking…" goes) — but THIS row stays HELD while its own mark is still
    // out (Codex r2 on #310, B3: a re-tap re-says its line, never sends again; cases below).
    expect(screen.queryByRole("button", { name: "Marking…" })).toBeNull();
    expect(mark().getAttribute("aria-busy")).toBeNull();
    expect(mark().getAttribute("aria-disabled")).toBe("true");
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

  it("review c (C7) — opening ANOTHER row's confirm leaves this row's 'no answer yet' standing, and its late throw is still said", async () => {
    const h = hungMark();
    const R2: RefundNeeded = { ...ROW, id: "r2", paymentIntent: "pi_second" };
    render(
      <StaffLangProvider lang="en">
        <RefundsNeededStrip lang="en" refunds={[ROW, R2]} />
      </StaffLangProvider>,
    );
    await commit();
    await flush(STAFF_HANG_MS);
    const lineOf = (id: string) =>
      document.querySelector(`#refund-mark-${id}`)?.closest("li")?.querySelector('[role="status"]');
    expect(lineOf("r1")?.textContent).toContain(STAFF["table.appr.refunds.markWaiting"].en);
    await act(async () => {
      fireEvent.click(document.querySelector<HTMLButtonElement>("#refund-mark-r2")!);
    });
    // MUTATION (p2h-rev-c/refund-open-wipes-other-row): opening row 2 wipes row 1's waiting line
    // (and its reload) while its mark may still land; red.
    expect(lineOf("r1")?.textContent).toContain(STAFF["table.appr.refunds.markWaiting"].en);
    await act(async () => h.fail(new Error("fetch failed")));
    // …and its late throw, dropped against the wiped slot before, is said on its own row.
    expect(lineOf("r1")?.textContent).toContain(STAFF["table.appr.refunds.markUnknown"].en);
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

/**
 * Codex round 2 on #310 (B3) — a row whose mark is still unanswered at the bound keeps its OWN hold
 * until the late answer settles. The strip's one lock frees at the bound (fact 3), and it was the
 * only guard: staff could reopen that row's confirm and send another mark behind the unresolved one
 * on every attempt. The hold is per ROW (other rows stay free), kept in the tab's own-wait register
 * (`refundmark:<row>`) so a remounted strip still holds it, and a tap on the held row RE-SAYS its
 * waiting line as a new node instead of sending.
 */
describe("Mark refunded — the row whose mark is still out is held (Codex r2 on #310, B3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    resolveRefundNeeded.mockReset();
    resolveRefundNeeded.mockImplementation(() => Promise.resolve());
  });
  const R2: RefundNeeded = { ...ROW, id: "r2", paymentIntent: "pi_second" };
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
  function strip(onResolved = vi.fn()) {
    return render(
      <StaffLangProvider lang="en">
        <RefundsNeededStrip lang="en" refunds={[ROW, R2]} onResolved={onResolved} />
      </StaffLangProvider>,
    );
  }
  const markOf = (id: string) => document.querySelector<HTMLButtonElement>(`#refund-mark-${id}`)!;
  const lineOf = (id: string) => markOf(id).closest("li")!.querySelector('[role="status"]');
  const confirmOf = (id: string) => document.getElementById(`refund-confirm-${id}`);
  async function commit(id: string) {
    await act(async () => {
      fireEvent.click(markOf(id));
    });
    await act(async () => {
      fireEvent.click(
        confirmOf(id)!.querySelector<HTMLButtonElement>("button:last-of-type") as HTMLElement,
      );
    });
  }
  /** Whether the line's CONTENT was replaced (what a screen reader announces) since this call. */
  function watchLine(node: Element) {
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
  }

  it("a tap on the held row RE-SAYS its waiting line and sends nothing — its confirm never reopens; the other row stays free", async () => {
    hungMark();
    strip();
    await commit("r1");
    await flush(STAFF_HANG_MS);
    expect(lineOf("r1")?.textContent).toContain(STAFF["table.appr.refunds.markWaiting"].en);
    // MUTATION (p2h-cx2b/refund-mark/held-looks-live): the held row reads as a live "Mark refunded"
    // over a mark that may still land; red.
    expect(markOf("r1").getAttribute("aria-disabled")).toBe("true");
    expect(markOf("r1").getAttribute("aria-describedby")).toBe(lineOf("r1")!.id);
    for (let tap = 0; tap < 2; tap += 1) {
      const said = watchLine(lineOf("r1")!);
      await act(async () => {
        fireEvent.click(markOf("r1"));
      });
      // MUTATION (p2h-cx2b/refund-mark/held-row-reopens): the hold ended with the strip's lock at the
      // bound — the confirm reopens and a second mark queues behind the unresolved one; red.
      expect(confirmOf("r1")).toBeNull();
      expect(resolveRefundNeeded).toHaveBeenCalledTimes(1);
      // MUTATION (p2h-cx2b/refund-mark/held-tap-silent · p2h-cx2b/refund-mark/resay-unkeyed): the
      // refused tap is dead — equal text re-rendered in place is no DOM change, nothing announced;
      // red.
      expect(said()).toBe(true);
      expect(lineOf("r1")?.textContent).toContain(STAFF["table.appr.refunds.markWaiting"].en);
    }
    // Another row is not held by this row's wait: its confirm opens, and its mark is sent.
    // MUTATION (p2h-cx2b/refund-mark/hold-unkeyed): one hold for every row — the wait on one
    // stranded charge freezes every other row; red.
    expect(markOf("r2").getAttribute("aria-disabled")).toBeNull();
    await commit("r2");
    expect(resolveRefundNeeded).toHaveBeenCalledTimes(2);
    expect(resolveRefundNeeded).toHaveBeenLastCalledWith("r2");
  });

  it("the LATE answer ends the hold: a late throw says 'couldn't confirm' and the row may be marked again", async () => {
    const h = hungMark();
    strip();
    await commit("r1");
    await flush(STAFF_HANG_MS);
    await act(async () => h.fail(new Error("fetch failed")));
    expect(lineOf("r1")?.textContent).toContain(STAFF["table.appr.refunds.markUnknown"].en);
    // MUTATION (p2h-cx2b/refund-mark/hold-never-cleared): the answer came and the row stays held —
    // a live-looking line with a control that only re-says; red.
    expect(markOf("r1").getAttribute("aria-disabled")).toBeNull();
    await commit("r1");
    expect(resolveRefundNeeded).toHaveBeenCalledTimes(2);
  });

  it("the strip that SENT the mark hands its late answer up ONCE — its own hold is never heard a second time", async () => {
    const h = hungMark();
    const resolved = vi.fn();
    strip(resolved);
    await commit("r1");
    await flush(STAFF_HANG_MS);
    await act(async () => h.answer());
    // MUTATION (p2h-cx2b/refund-mark/own-late-heard-twice): the strip attaches to its OWN hold as if
    // a strip that is gone had sent it — the board is told twice and re-polls twice; red.
    expect(resolved).toHaveBeenCalledTimes(1);
    expect(resolved).toHaveBeenCalledWith("r1");
  });

  it("a strip mounted again while a row's mark is still out holds that row, says its line with the reload, and a tap sends nothing", async () => {
    const h = hungMark();
    const first = strip();
    await commit("r1");
    await flush(STAFF_HANG_MS);
    first.unmount();
    const resolved = vi.fn();
    strip(resolved);
    // MUTATION (p2h-cx2b/refund-mark/hold-per-mount): the hold is the strip instance's — the
    // remounted strip offers a live "Mark refunded" and its confirm sends a second mark; red.
    expect(markOf("r1").getAttribute("aria-disabled")).toBe("true");
    expect(lineOf("r1")?.textContent).toContain(STAFF["table.appr.refunds.markWaiting"].en);
    expect(screen.queryByRole("button", { name: STAFF["out.reload"].en })).not.toBeNull();
    await act(async () => {
      fireEvent.click(markOf("r1"));
    });
    expect(confirmOf("r1")).toBeNull();
    expect(resolveRefundNeeded).toHaveBeenCalledTimes(1);
    // The answer lands on THIS strip — the one that sent it is gone: the row is handed up as
    // resolved, and its hold and line go.
    // MUTATION (p2h-cx2b/refund-mark/remount-late-unheard): the remounted strip never hears the late
    // answer — the board is never told the row is done, and it reads as a free row until a poll; red.
    await act(async () => h.answer());
    expect(resolved).toHaveBeenCalledWith("r1");
    expect(markOf("r1").getAttribute("aria-disabled")).toBeNull();
    expect(lineOf("r1")).toBeNull();
  });

  it("a strip mounted again INSIDE the bound holds the row from the tap — busy, nothing sent; at the bound it says 'no answer yet', and the late answer lands there (Codex r2 follow-up, R3)", async () => {
    const h = hungMark();
    const first = strip();
    await commit("r1");
    await flush(5_000);
    first.unmount();
    await flush(3_000);
    const resolved = vi.fn();
    strip(resolved);
    // MUTATION (p2h-cx2b/refund-mark/pre-bound-reads-live): the remounted strip reads the row free
    // while its mark is in flight; red.
    expect(markOf("r1").getAttribute("aria-disabled")).toBe("true");
    // MUTATION (p2h-cx2b/refund-mark/pre-bound-not-busy): the held row is not said to be busy — a
    // dimmed control with no reason before the bound; red.
    expect(markOf("r1").getAttribute("aria-busy")).toBe("true");
    expect(lineOf("r1")).toBeNull();
    // MUTATION (p2h-cx2b/refund-mark/hold-at-bound-only): the row is held only from the bound — the
    // remounted strip reopens its confirm and a second mark queues behind the first; red.
    await act(async () => {
      fireEvent.click(markOf("r1"));
    });
    expect(confirmOf("r1")).toBeNull();
    expect(resolveRefundNeeded).toHaveBeenCalledTimes(1);
    expect(markOf("r2").getAttribute("aria-disabled")).toBeNull();
    await flush(STAFF_HANG_MS - 8_000);
    expect(lineOf("r1")?.textContent).toContain(STAFF["table.appr.refunds.markWaiting"].en);
    expect(markOf("r1").getAttribute("aria-busy")).toBeNull();
    expect(markOf("r1").getAttribute("aria-disabled")).toBe("true");
    expect(markOf("r1").getAttribute("aria-describedby")).toBe(lineOf("r1")!.id);
    await act(async () => h.answer());
    expect(resolved).toHaveBeenCalledWith("r1");
    expect(markOf("r1").getAttribute("aria-disabled")).toBeNull();
    expect(lineOf("r1")).toBeNull();
  });

  it("an ON-TIME answer reaching a strip mounted before the bound lands there; a lost one says 'couldn't confirm' on its row (Codex r2 follow-up, R3)", async () => {
    const h = hungMark();
    const first = strip();
    await commit("r1");
    await flush(5_000);
    first.unmount();
    const resolved = vi.fn();
    strip(resolved);
    // MUTATION (p2h-cx2b/refund-mark/attach-past-only): the strip attaches only to marks past the
    // bound — an answer before it never reaches the remounted strip, and the board is not told; red.
    await act(async () => h.answer());
    expect(resolved).toHaveBeenCalledWith("r1");
    expect(markOf("r1").getAttribute("aria-disabled")).toBeNull();
    cleanup();
    const t = hungMark();
    const again = strip();
    await commit("r1");
    again.unmount();
    strip();
    await act(async () => t.fail(new Error("fetch failed")));
    expect(lineOf("r1")?.textContent).toContain(STAFF["table.appr.refunds.markUnknown"].en);
    expect(markOf("r1").getAttribute("aria-disabled")).toBeNull();
  });

  it("two strips at once: the one that did not send holds the row from the tap and hears its answer (Codex r2 follow-up, R3)", async () => {
    const h = hungMark();
    const sentFrom = vi.fn();
    const other = vi.fn();
    const a = strip(sentFrom);
    const b = render(
      <StaffLangProvider lang="en">
        <RefundsNeededStrip lang="en" refunds={[ROW, R2]} onResolved={other} />
      </StaffLangProvider>,
    );
    const markIn = (c: HTMLElement, id: string) =>
      c.querySelector<HTMLButtonElement>(`#refund-mark-${id}`)!;
    await act(async () => {
      fireEvent.click(markIn(a.container, "r1"));
    });
    await act(async () => {
      fireEvent.click(
        a.container
          .querySelector(`#refund-confirm-r1`)!
          .querySelector<HTMLButtonElement>("button:last-of-type")!,
      );
    });
    expect(markIn(b.container, "r1").getAttribute("aria-busy")).toBe("true");
    // MUTATION (p2h-cx2b/refund-mark/attach-mount-only): a strip attaches only to marks it finds at
    // mount — the one mounted before the tap never hears the answer; red.
    await act(async () => h.answer());
    expect(sentFrom).toHaveBeenCalledWith("r1");
    expect(other).toHaveBeenCalledWith("r1");
    expect(markIn(b.container, "r1").getAttribute("aria-disabled")).toBeNull();
  });

  it("a LATE throw reaching a strip mounted since says 'couldn't confirm' on its row — never a silent free row", async () => {
    const h = hungMark();
    const first = strip();
    await commit("r1");
    await flush(STAFF_HANG_MS);
    first.unmount();
    strip();
    await act(async () => h.fail(new Error("fetch failed")));
    // MUTATION (p2h-cx2b/refund-mark/remount-late-throw-unsaid): the lost answer frees the row in
    // silence — a mark that may have landed reads as never tried; red.
    expect(lineOf("r1")?.textContent).toContain(STAFF["table.appr.refunds.markUnknown"].en);
    expect(markOf("r1").getAttribute("aria-disabled")).toBeNull();
  });
});
