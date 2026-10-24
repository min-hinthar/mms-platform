/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { startTransition } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableLineView } from "@/lib/floor-types";
import type { VoidLineResult } from "@/lib/voids";
import { STAFF } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import { STAFF_HANG_MS, track } from "@/lib/bounded-write";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";

/**
 * manager-6 / P2t + manager-7 — the void/comp sheet's WIRING: its title and every refusal are the
 * dictionary's (marked under `my`), its segment and reason rows wear the console's one chip class
 * with `aria-pressed` and NO inline fill (the shared lit-cap rule must be able to reach them), and
 * its buttons are §17 (aria-disabled, never native).
 */
const voidLine = vi.fn(
  (): Promise<VoidLineResult> => Promise.resolve({ ok: true, action: "void" }),
);
vi.mock("@/lib/voids", () => ({
  voidLine: (...a: unknown[]) => voidLine(...(a as [])),
}));
const requestApproval = vi.fn(
  (): Promise<unknown> => Promise.resolve({ ok: false, reason: "already_pending" }),
);
vi.mock("@/lib/approvals", () => ({
  requestApproval: (...a: unknown[]) => requestApproval(...(a as [])),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { LossActionSheet } = await import("./LossActionSheet");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const line = {
  id: "l1",
  name: "Mohinga",
  qty: 1,
  unitPriceCents: 1200,
  bySeatName: null,
  soldOut: false,
  state: "draft",
  comped: false,
  pendingApproval: false,
  notes: null,
  modifiers: [],
  refundedCents: 0,
} as unknown as TableLineView;

function mount(lang: "en" | "my" = "en") {
  return render(
    <StaffLangProvider lang={lang}>
      <LossActionSheet open onOpenChange={() => {}} sessionId="s1" line={line} onDone={() => {}} />
    </StaffLangProvider>,
  );
}
const region = () => document.getElementById("loss-msg")!;
/** Integration c critic F1 — whether the region's CONTENT was replaced or rewritten (what a screen
 *  reader announces) between this call and the returned check; equal text rendered in place records
 *  nothing, which is exactly the silent re-tap this pins. */
function watchRegion(node: Element) {
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
// Under `my` the row's name is the pair (Burmese · English echo), so the English is matched as a part.
const reason = () =>
  screen.getByRole("button", { name: new RegExp(STAFF["table.loss.reason.mistake"].en) });
const confirmVoid = () =>
  screen.getByRole("button", { name: new RegExp(STAFF["table.loss.confirm.void"].en) });
/** PD8 — one chip says what AND why. "Quality / guest unhappy" sits in BOTH columns (each under its
 *  own kind mark), so the comp's is found inside its group. */
const compChip = () =>
  within(screen.getByRole("group", { name: STAFF["table.loss.seg.comp"].en })).getByRole("button", {
    name: new RegExp(STAFF["table.loss.reason.quality"].en),
  });

describe("LossActionSheet — the sheet in the console's tongue", () => {
  it("under my the title is the dictionary's, marked, with the dish name a Latin run inside it", async () => {
    mount("my");
    // PD8 — before a chip is lit the title is the dish itself; the sentence needs the what.
    await act(async () => {
      fireEvent.click(reason());
    });
    const title = document.querySelector('[role="dialog"] h2');
    // The title itself, never a fallback to the first Burmese run in the body (uniqueness ≠ liveness).
    expect(title).not.toBeNull();
    const my = title!.querySelector('[lang="my"]');
    // MUTATION: `title={`Void “${line.name}”`}` — no marked run, this reddens.
    expect(my).not.toBeNull();
    expect(my!.textContent).toBe(tf("my", "table.loss.title.void", { x: "Mohinga" }));
    expect(my!.querySelector('[lang="en"]')?.textContent).toBe("Mohinga");
  });

  it("a refusal lands in the ONE region as the dictionary's sentence — marked under my", async () => {
    voidLine.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    mount("my");
    await act(async () => {
      fireEvent.click(reason());
    });
    await act(async () => {
      fireEvent.submit(confirmVoid().closest("form")!);
    });
    expect(voidLine).toHaveBeenCalledTimes(1);
    const my = region().querySelector('[lang="my"]');
    // MUTATION: `setMsg("That item isn’t on this table anymore.")` — unmarked English, red.
    expect(my?.textContent).toBe(STAFF["table.loss.msg.notFound"].my);
  });

  it("submitting with no reason says so through the dictionary and sends nothing", async () => {
    mount();
    await act(async () => {
      fireEvent.submit(confirmVoid().closest("form")!);
    });
    expect(voidLine).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["table.loss.reasonRequired"].en);
  });

  it("manager-7 · PD8 — ONE chip picks what AND why: two columns under their kind marks, every chip `.staff-chip` with aria-pressed, at most one lit, no inline fill", async () => {
    mount();
    await act(async () => {});
    const voidCol = screen.getByRole("group", { name: STAFF["table.loss.seg.void"].en });
    const compCol = screen.getByRole("group", { name: STAFF["table.loss.seg.comp"].en });
    const chips = [
      ...within(voidCol).getAllByRole("button"),
      ...within(compCol).getAllByRole("button"),
    ];
    expect(chips.length).toBeGreaterThan(0);
    for (const c of chips) {
      expect(c.classList.contains("staff-chip")).toBe(true);
      expect(c.getAttribute("aria-pressed")).toBe("false");
    }
    // No segment: nothing is pre-lit, and the title is the dish until a chip says what.
    expect(document.querySelectorAll('.loss-chip[aria-pressed="true"]').length).toBe(0);
    expect(document.getElementById("loss-pin")).toBeNull();
    await act(async () => {
      fireEvent.click(reason());
    });
    const row = reason();
    expect(row.getAttribute("aria-pressed")).toBe("true");
    // MUTATION: an inline fill on the lit chip — it beats the shared cap rule, and this reddens.
    expect((row as HTMLElement).style.background).toBe("");
    expect(document.querySelectorAll('.loss-chip[aria-pressed="true"]').length).toBe(1);
    // A comp chip: the what moves with the why and the void chip goes out — and No-PIN: no slip,
    // no PIN field, the one confirm button (the server decides who may approve).
    await act(async () => {
      fireEvent.click(compChip());
    });
    expect(reason().getAttribute("aria-pressed")).toBe("false");
    expect(compChip().getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll('.loss-chip[aria-pressed="true"]').length).toBe(1);
    expect(document.getElementById("loss-pin")).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("§17 — the confirm is aria-disabled + busy while the void runs, never native", async () => {
    let release: ((r: VoidLineResult) => void) | null = null;
    voidLine.mockReturnValueOnce(
      new Promise<VoidLineResult>((r) => {
        release = r;
      }),
    );
    mount();
    await act(async () => {
      fireEvent.click(reason());
    });
    const btn = confirmVoid() as HTMLButtonElement;
    // The form's own submit (what the tap and Enter both dispatch): jsdom's click→implicit-submit
    // path lands the action but commits the transition's pending render outside `act`.
    await act(async () => {
      fireEvent.submit(btn.closest("form")!);
    });
    expect(voidLine).toHaveBeenCalledTimes(1);
    // MUTATION: `disabled={!canSubmit}` — `disabled` reads true and this reddens.
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.textContent).toContain(STAFF["table.loss.working"].en);
    // A second submit mid-flight is refused on the same predicate.
    await act(async () => {
      fireEvent.submit(btn.closest("form")!);
    });
    expect(voidLine).toHaveBeenCalledTimes(1);
    await act(async () => {
      release!({ ok: true, action: "void" });
    });
  });
});

/** A write still in the air when the case ends — settled in `afterEach`, after the tree is gone, so
 *  a pre-fix transition left pending by a red-first run can never entangle the next case. */
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
function hang<T>(end: T) {
  const d = deferred<T>();
  hanging.push(() => d.resolve(end));
  return d;
}

describe("LossActionSheet — a hung write never traps the sheet (Phase 2h · 9a · 9d · 9e)", () => {
  afterEach(async () => {
    vi.useRealTimers();
    cleanup();
    await act(async () => {
      for (const end of hanging.splice(0)) end();
    });
  });
  const reloadBtn = () => screen.queryByRole("button", { name: STAFF["out.reload"].en });
  /** The confirm, by ROLE in the form — its name swaps to "Working…" while the void runs. */
  const submitBtn = () =>
    document.querySelector<HTMLButtonElement>('[role="dialog"] form button[type="submit"]')!;
  const closeX = () =>
    screen.getByRole("button", {
      name: (n) => n === STAFF["shell.close"].en || n === STAFF["shell.closeBusy"].en,
    });
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  function mountSpied() {
    const onDone = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <StaffLangProvider lang="en">
        <LossActionSheet
          open
          onOpenChange={onOpenChange}
          sessionId="s1"
          line={line}
          onDone={onDone}
        />
      </StaffLangProvider>,
    );
    return { onDone, onOpenChange };
  }
  async function tapVoid() {
    await act(async () => {
      fireEvent.click(reason());
    });
    await act(async () => {
      fireEvent.submit(submitBtn().closest("form")!);
    });
  }
  /** No-PIN — the request is offered once the server says a manager must decide (`needs_manager`). */
  async function toRequest() {
    voidLine.mockResolvedValueOnce({ ok: false, reason: "needs_manager" });
    await act(async () => {
      fireEvent.click(compChip());
    });
    await act(async () => {
      fireEvent.submit(submitBtn().closest("form")!);
    });
  }

  it("no answer at STAFF_HANG_MS: the sheet frees (✕ live, confirm not busy), the region says 'no answer yet' and the reload sits beside it", async () => {
    vi.useFakeTimers();
    const d = hang<VoidLineResult>({ ok: false, reason: "not_found" });
    voidLine.mockReturnValueOnce(d.promise);
    const { onOpenChange } = mountSpied();
    await tapVoid();
    expect(submitBtn().getAttribute("aria-busy")).toBe("true");
    expect(closeX().getAttribute("aria-disabled")).toBe("true");
    await advance(STAFF_HANG_MS - 1);
    expect(submitBtn().getAttribute("aria-busy")).toBe("true");
    await advance(1);
    // MUTATION (p2h-sheets/loss/busy-never-clears): the ✕, Escape, the scrim and the drag stay
    // refused forever behind a trapped focus scope; red.
    expect(submitBtn().getAttribute("aria-busy")).toBeNull();
    expect(closeX().getAttribute("aria-disabled")).toBeNull();
    // MUTATION (p2h-sheets/loss/waiting-said-as-unknown): "couldn't confirm" over an answer that is
    // merely late; red.
    expect(region().textContent).toBe(STAFF["table.loss.msg.waiting"].en);
    // MUTATION (p2h-sheets/loss/no-reload): the sentence names a reload the console cannot give; red.
    expect(reloadBtn()).not.toBeNull();
    await act(async () => {
      fireEvent.click(closeX());
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("the entanglement proxy: an UNRELATED async transition left hanging — the sheet still frees at the bound", async () => {
    vi.useFakeTimers();
    const other = hang<void>(undefined);
    act(() => {
      startTransition(async () => {
        await other.promise;
      });
    });
    voidLine.mockReturnValueOnce(hang<VoidLineResult>({ ok: false, reason: "not_found" }).promise);
    mountSpied();
    await tapVoid();
    await advance(STAFF_HANG_MS);
    expect(submitBtn().getAttribute("aria-busy")).toBeNull();
    expect(closeX().getAttribute("aria-disabled")).toBeNull();
  });

  it("a LATE ok lands through the parent; a LATE refusal is said in the region", async () => {
    vi.useFakeTimers();
    const first = deferred<VoidLineResult>();
    voidLine.mockReturnValueOnce(first.promise);
    const { onDone, onOpenChange } = mountSpied();
    await tapVoid();
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.loss.msg.waiting"].en);
    await act(async () => {
      first.resolve({ ok: true, action: "void" });
    });
    // MUTATION (p2h-sheets/loss/late-answer-dropped): the void landed and the sheet keeps saying
    // "no answer yet" over a line that is gone; red.
    expect(onDone).toHaveBeenCalledWith("void");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    cleanup();
    const second = deferred<VoidLineResult>();
    voidLine.mockReturnValueOnce(second.promise);
    mountSpied();
    await tapVoid();
    await advance(STAFF_HANG_MS);
    await act(async () => {
      second.resolve({ ok: false, reason: "not_found" });
    });
    expect(region().textContent).toBe(STAFF["table.loss.msg.notFound"].en);
    expect(reloadBtn()).toBeNull();
  });

  it("a THROWN action may have landed: 'couldn't confirm', never the write-outage 'wasn't saved' — on time or late", async () => {
    vi.useFakeTimers();
    voidLine.mockRejectedValueOnce(new Error("fetch failed"));
    mountSpied();
    await tapVoid();
    // MUTATION (p2h-sheets/loss/threw-said-as-outage): the old catch's sentence — it claims nothing
    // was voided, and the manager re-voids a dish (and spends another PIN attempt); red.
    expect(region().textContent).toBe(STAFF["table.loss.msg.unknown"].en);
    expect(region().textContent).not.toContain(STAFF_WRITE_OUTAGE);
    expect(submitBtn().getAttribute("aria-busy")).toBeNull();
    cleanup();
    const late = deferred<VoidLineResult>();
    voidLine.mockReturnValueOnce(late.promise);
    mountSpied();
    await tapVoid();
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.loss.msg.waiting"].en);
    await act(async () => {
      late.reject(new Error("fetch failed"));
    });
    // MUTATION (p2h-sheets/loss/late-throw-unsaid): the region keeps "no answer yet" forever; red.
    expect(region().textContent).toBe(STAFF["table.loss.msg.unknown"].en);
  });

  it("a re-tap while the void is still out is REFUSED, never sent — re-saying the void's OWN waiting sentence ('don't do it again'), with the reload (owner decision)", async () => {
    vi.useFakeTimers();
    voidLine.mockReturnValueOnce(hang<VoidLineResult>({ ok: false, reason: "not_found" }).promise);
    mountSpied();
    await tapVoid();
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.loss.msg.waiting"].en);
    const said = watchRegion(region());
    await act(async () => {
      fireEvent.submit(submitBtn().closest("form")!);
    });
    // Never sent: a second void queued behind the first spends another PIN attempt whenever the
    // queue moves.
    expect(voidLine).toHaveBeenCalledTimes(1);
    // Critic F1 — RE-SAID, not left standing: the line already stood in the region, and equal text
    // re-rendered in place is no DOM change — nothing announced, nothing seen, a dead tap.
    // MUTATION (p2h-int-c/loss/resay-unkeyed · p2h-int-c/loss/void-refusal-unsaid): red.
    expect(said()).toBe(true);
    // MUTATION (p2h-int-c/loss/own-wait-said-as-stalled · p2h-sheets/loss/own-wait-forgotten): its
    // own void IS the stall, but "this did nothing" drops "Don't do it again"; red.
    expect(region().textContent).toBe(STAFF["table.loss.msg.waiting"].en);
    expect(reloadBtn()).not.toBeNull();
  });

  it("a tablet stalled on ANOTHER action refuses the void AND the approval request at the tap", async () => {
    vi.useFakeTimers();
    mountSpied();
    await toRequest(); // the server said a manager must decide: the one button is the request
    track(new Promise(() => {}));
    await advance(STAFF_HANG_MS);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(STAFF["table.loss.requestApproval.comp"].en),
        }),
      );
    });
    // MUTATION (p2h-sheets/loss/request-stalled-dispatches): the request queued behind the hang; red.
    expect(requestApproval).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["out.stalled"].en);
    cleanup();
    mountSpied();
    await tapVoid();
    expect(voidLine).toHaveBeenCalledTimes(1); // only toRequest's — the stalled tap sent nothing
    expect(region().textContent).toBe(STAFF["out.stalled"].en);
  });
  it("the approval request: no answer at the bound says so with the reload; a late ok closes through the parent; a throw is 'couldn't confirm'", async () => {
    vi.useFakeTimers();
    const late = deferred<unknown>();
    requestApproval.mockReturnValueOnce(late.promise);
    const { onDone } = mountSpied();
    await toRequest();
    const request = () =>
      screen.getByRole("button", {
        name: (n) =>
          n.includes(STAFF["table.loss.requestApproval.comp"].en) ||
          n.includes(STAFF["table.loss.sending"].en),
      });
    await act(async () => {
      fireEvent.click(request());
    });
    expect(request().getAttribute("aria-busy")).toBe("true");
    await advance(STAFF_HANG_MS);
    expect(request().getAttribute("aria-busy")).toBeNull();
    // MUTATION (p2h-sheets/loss/request-waiting-unsaid): the request's own "no answer yet"; red.
    expect(region().textContent).toBe(STAFF["table.loss.msg.requestWaiting"].en);
    expect(reloadBtn()).not.toBeNull();
    await act(async () => {
      late.resolve({ ok: true });
    });
    expect(onDone).toHaveBeenCalledWith("comp");
    cleanup();
    requestApproval.mockRejectedValueOnce(new Error("fetch failed"));
    mountSpied();
    await toRequest();
    await act(async () => {
      fireEvent.click(request());
    });
    // MUTATION (p2h-sheets/loss/request-threw-said-as-outage): "wasn't saved" over a request that
    // may have reached the queue; red.
    expect(region().textContent).toBe(STAFF["table.loss.msg.requestUnknown"].en);
  });

  it("a sheet RE-OPENED for the same line while its void is still out remembers it: the re-tap says the void's OWN line, never 'this did nothing' (review a, A4 · decision 9i)", async () => {
    vi.useFakeTimers();
    const late = deferred<VoidLineResult>();
    voidLine.mockReturnValueOnce(late.promise);
    mountSpied();
    await tapVoid();
    await advance(STAFF_HANG_MS);
    cleanup(); // put away — the line editor keys the next open as a fresh mount
    mountSpied();
    await tapVoid();
    expect(voidLine).toHaveBeenCalledTimes(1);
    // MUTATION (p2h-rev-a/loss/subject-unkeyed): the remount forgot the void and says the tablet's
    // "this did nothing" — dropping "don't do it again"; red.
    expect(region().textContent).toBe(STAFF["table.loss.msg.waiting"].en);
    await act(async () => {
      late.resolve({ ok: false, reason: "not_found" });
    });
    voidLine.mockReturnValueOnce(hang<VoidLineResult>({ ok: false, reason: "not_found" }).promise);
    await tapVoid();
    expect(voidLine).toHaveBeenCalledTimes(2);
  });

  it("a re-tap of THIS sheet's own waiting void is refused even with the wall clock set back mid-hang — and sent again once it answers (critic F12)", async () => {
    vi.useFakeTimers();
    const late = deferred<VoidLineResult>();
    voidLine.mockReturnValueOnce(late.promise);
    mountSpied();
    await tapVoid();
    await advance(STAFF_HANG_MS);
    vi.setSystemTime(Date.now() - 60_000); // a wall clock set back: the own wait refuses regardless
    await act(async () => {
      fireEvent.submit(submitBtn().closest("form")!);
    });
    // MUTATION (p2h-sheets/loss/own-wait-forgotten): a second void queued behind the first; red.
    expect(voidLine).toHaveBeenCalledTimes(1);
    expect(region().textContent).toBe(STAFF["table.loss.msg.waiting"].en);
    await act(async () => {
      late.resolve({ ok: false, reason: "not_found" });
    });
    voidLine.mockReturnValueOnce(hang<VoidLineResult>({ ok: false, reason: "not_found" }).promise);
    await act(async () => {
      fireEvent.submit(submitBtn().closest("form")!);
    });
    // MUTATION (p2h-sheets/loss/own-wait-never-cleared): an answered void still refuses the retry; red.
    expect(voidLine).toHaveBeenCalledTimes(2);
  });

  it("the approval request's own wait refuses a re-tap with the clock set back, too — and sends again once it answers (critic F12)", async () => {
    vi.useFakeTimers();
    const late = deferred<unknown>();
    requestApproval.mockReturnValueOnce(late.promise);
    mountSpied();
    await toRequest();
    const request = () =>
      screen.getByRole("button", {
        name: (n) =>
          n.includes(STAFF["table.loss.requestApproval.comp"].en) ||
          n.includes(STAFF["table.loss.sending"].en),
      });
    await act(async () => {
      fireEvent.click(request());
    });
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.loss.msg.requestWaiting"].en);
    vi.setSystemTime(Date.now() - 60_000); // a wall clock set back: the own wait refuses regardless
    const said = watchRegion(region());
    await act(async () => {
      fireEvent.click(request());
    });
    // MUTATION (p2h-sheets/loss/request-own-wait-forgotten): a second request queued behind the
    // first; red.
    expect(requestApproval).toHaveBeenCalledTimes(1);
    // Critic F1 — the request's refusal re-SAYS its line (a new node in the region), never leaves
    // the standing one silent. MUTATION (p2h-int-c/loss/request-refusal-unsaid): red.
    expect(said()).toBe(true);
    // MUTATION (p2h-int-c/loss/request-own-wait-said-as-stalled): "this did nothing" in place of
    // "Don't send it again"; red.
    expect(region().textContent).toBe(STAFF["table.loss.msg.requestWaiting"].en);
    await act(async () => {
      late.resolve({ ok: false, reason: "not_found" });
    });
    requestApproval.mockReturnValueOnce(hang<unknown>({ ok: false, reason: "not_found" }).promise);
    await act(async () => {
      fireEvent.click(request());
    });
    // MUTATION (p2h-sheets/loss/request-own-wait-never-cleared): red.
    expect(requestApproval).toHaveBeenCalledTimes(2);
  });

  it("the approval request's LATE throw ends the wait unanswered: 'couldn't confirm' the request, never 'no answer yet' for good (critic F9)", async () => {
    vi.useFakeTimers();
    const late = deferred<unknown>();
    requestApproval.mockReturnValueOnce(late.promise);
    mountSpied();
    await toRequest();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(STAFF["table.loss.requestApproval.comp"].en),
        }),
      );
    });
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.loss.msg.requestWaiting"].en);
    await act(async () => {
      late.reject(new Error("fetch failed"));
    });
    // MUTATION (p2h-sheets/loss/request-late-throw-unsaid): "no answer yet" stands for good over a
    // request that may have reached the queue; red.
    expect(region().textContent).toBe(STAFF["table.loss.msg.requestUnknown"].en);
    expect(reloadBtn()).toBeNull();
  });
});

describe("LossActionSheet — No-PIN (owner, 2026-10-24): one button, the server decides", () => {
  it("a tap sends the line, the action and the reason ONLY — never an approver or a PIN (`loss-sheet/sends-a-pin`)", async () => {
    mount();
    await act(async () => {
      fireEvent.click(compChip());
    });
    await act(async () => {
      fireEvent.submit(document.querySelector('[role="dialog"] form')!);
    });
    expect(voidLine).toHaveBeenCalledWith({
      sessionId: "s1",
      cartItemId: "l1",
      action: "comp",
      reason: "quality",
    });
  });

  it("needs_manager turns the one button into the request, says why, and the request carries the chip (`loss-sheet/needs-manager-dead-end`)", async () => {
    voidLine.mockResolvedValueOnce({ ok: false, reason: "needs_manager" });
    requestApproval.mockResolvedValueOnce({ ok: true });
    const onDone = vi.fn();
    render(
      <StaffLangProvider lang="en">
        <LossActionSheet open onOpenChange={() => {}} sessionId="s1" line={line} onDone={onDone} />
      </StaffLangProvider>,
    );
    await act(async () => {
      fireEvent.click(compChip());
    });
    await act(async () => {
      fireEvent.submit(document.querySelector('[role="dialog"] form')!);
    });
    expect(region().textContent).toBe(STAFF["table.loss.msg.needsManager"].en);
    expect(document.querySelector('[role="dialog"] form button[type="submit"]')).toBeNull();
    const request = screen.getByRole("button", {
      name: new RegExp(STAFF["table.loss.requestApproval.comp"].en),
    });
    await act(async () => {
      fireEvent.click(request);
    });
    expect(requestApproval).toHaveBeenCalledWith({
      sessionId: "s1",
      cartItemId: "l1",
      action: "comp",
      reason: "quality",
    });
    expect(onDone).toHaveBeenCalledWith("comp");
  });
});

describe("the escalation is the refused action's alone", () => {
  it("a refused comp offers the request; picking a void brings back the void's own button (`loss-sheet/escalation-sticks`)", async () => {
    voidLine.mockResolvedValueOnce({ ok: false, reason: "needs_manager" });
    render(
      <StaffLangProvider lang="en">
        <LossActionSheet open onOpenChange={() => {}} sessionId="s1" line={line} onDone={vi.fn()} />
      </StaffLangProvider>,
    );
    await act(async () => {
      fireEvent.click(compChip());
    });
    await act(async () => {
      fireEvent.submit(document.querySelector('[role="dialog"] form')!);
    });
    expect(document.querySelector('[role="dialog"] form button[type="submit"]')).toBeNull();
    await act(async () => {
      fireEvent.click(reason());
    });
    expect(confirmVoid()).toBeTruthy();
  });
});

describe("the lifecycle audit — the sheet says WHICH bowl", () => {
  it("shows the line's options and its kitchen note under the summary", async () => {
    // lck/loss-sheet/which-bowl-unsaid — two "1× Mohinga" rows, one with "no peanuts — allergy":
    // the sheet repeated only the name and the price, and the wrong bowl was voided.
    render(
      <StaffLangProvider lang="en">
        <LossActionSheet
          open
          onOpenChange={() => {}}
          sessionId="s1"
          line={{ ...line, modifiers: ["No egg", "Extra spicy"], notes: "no peanuts — allergy" }}
          onDone={() => {}}
        />
      </StaffLangProvider>,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("No egg · Extra spicy");
    expect(dialog.querySelector(".loss-note")?.textContent).toContain("no peanuts — allergy");
  });
});
