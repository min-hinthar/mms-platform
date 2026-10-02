/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
const approvers = vi.fn((): Promise<unknown[]> => Promise.resolve([]));
vi.mock("@/lib/voids", () => ({
  listApprovers: () => approvers(),
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

describe("LossActionSheet — the sheet in the console's tongue", () => {
  it("under my the title is the dictionary's, marked, with the dish name a Latin run inside it", () => {
    mount("my");
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

  it("manager-7 — the segment halves and the reason rows wear `.staff-chip` with aria-pressed and no inline fill", async () => {
    mount();
    const voidHalf = screen.getByRole("button", { name: STAFF["table.loss.seg.void"].en });
    const compHalf = screen.getByRole("button", { name: STAFF["table.loss.seg.comp"].en });
    expect(voidHalf.classList.contains("staff-chip")).toBe(true);
    expect(voidHalf.getAttribute("aria-pressed")).toBe("true");
    expect(compHalf.getAttribute("aria-pressed")).toBe("false");
    // MUTATION: restore `style={{ ...segBtn, ...(on ? segBtnOn : null) }}` — an inline fill beats
    // the shared rule, and this reddens.
    expect((voidHalf as HTMLElement).style.background).toBe("");
    await act(async () => {
      fireEvent.click(reason());
    });
    const row = reason();
    expect(row.classList.contains("staff-chip")).toBe(true);
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect((row as HTMLElement).style.background).toBe("");
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

describe("LossActionSheet — a roster that could not be read (Codex round 2 on #308)", () => {
  // A cooked line gates the step-up up-front, so the manager fields render on mount.
  const cooked = { ...line, state: "served" } as unknown as TableLineView;
  function mountCooked() {
    return render(
      <StaffLangProvider lang="en">
        <LossActionSheet
          open
          onOpenChange={() => {}}
          sessionId="s1"
          line={cooked}
          onDone={() => {}}
        />
      </StaffLangProvider>,
    );
  }

  it("says the list couldn't be loaded, not that nobody is on shift — and Try again recovers", async () => {
    approvers.mockRejectedValueOnce(new Error("503"));
    mountCooked();
    await act(async () => {});
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(STAFF["pin.manager.loadFailed"].en);
    expect(dialog.textContent).not.toContain(STAFF["pin.manager.noneNote"].en);
    approvers.mockResolvedValueOnce([{ staffId: "m1", displayName: "Daw Mya", role: "manager" }]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["out.shell.retry"].en }));
    });
    expect(approvers).toHaveBeenCalledTimes(2);
    const select = dialog.querySelector("select")!;
    expect(select.disabled).toBe(false);
    expect(document.activeElement).toBe(select);
    expect(dialog.textContent).not.toContain(STAFF["pin.manager.loadFailed"].en);
  });

  it("a recovery after a failed Try again puts back “a manager needs to approve” while the step-up is pending", async () => {
    // An uncooked void the server escalates (`needs_pin`), with the roster read failing on mount.
    approvers.mockRejectedValueOnce(new Error("503"));
    voidLine.mockResolvedValueOnce({ ok: false, reason: "needs_pin" });
    mount();
    await act(async () => {});
    await act(async () => {
      fireEvent.click(reason());
    });
    await act(async () => {
      fireEvent.submit(confirmVoid().closest("form")!);
    });
    expect(region().textContent).toBe(STAFF["pin.needsManager"].en);
    // Try again fails: the failure takes the region.
    approvers.mockRejectedValueOnce(new Error("503"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["out.shell.retry"].en }));
    });
    expect(region().textContent).toBe(STAFF["pin.manager.loadFailed"].en);
    // Try again recovers: the step-up is still pending, so its sentence comes back — never silence.
    approvers.mockResolvedValueOnce([{ staffId: "m1", displayName: "Daw Mya", role: "manager" }]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["out.shell.retry"].en }));
    });
    // MUTATION (p2f-sr-sheet/roster/recovery-drops-needs-manager): the region reads "" — red.
    expect(region().textContent).toBe(STAFF["pin.needsManager"].en);
  });
});

// ── Phase 2h · p2h-sheets ──
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

  it("the void still out, the person turns to the approval REQUEST instead: refused, never sent — re-saying the VOID's sentence (the write that is out), not the request's nor the tablet's", async () => {
    vi.useFakeTimers();
    voidLine.mockReturnValueOnce(hang<VoidLineResult>({ ok: false, reason: "not_found" }).promise);
    mountSpied();
    await tapVoid();
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.loss.msg.waiting"].en);
    // Comp — the request shows (nobody on shift: it is the primary). The void's reason does not
    // apply to a comp, so the first tap asks for one and the region moves off the waiting line.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["table.loss.seg.comp"].en }));
    });
    const request = () =>
      screen.getByRole("button", {
        name: (n) => n.includes(STAFF["table.loss.requestApproval.comp"].en),
      });
    await act(async () => {
      fireEvent.click(request());
    });
    expect(region().textContent).toBe(STAFF["table.loss.reasonRequired"].en);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(STAFF["table.loss.reason.quality"].en) }),
      );
    });
    await act(async () => {
      fireEvent.click(request());
    });
    // Never sent: the request would queue behind the hung void.
    expect(requestApproval).not.toHaveBeenCalled();
    // MUTATION (p2h-int-c/loss/request-refusal-names-itself): "the request may still reach a
    // manager" — about a request never sent, while the void that may still land goes unsaid; red.
    // (p2h-sheets/loss/request-own-wait-forgotten reads the ledger alone: "this did nothing"; red.)
    expect(region().textContent).toBe(STAFF["table.loss.msg.waiting"].en);
    expect(reloadBtn()).not.toBeNull();
  });

  it("a tablet stalled on ANOTHER action refuses the void AND the approval request at the tap", async () => {
    vi.useFakeTimers();
    track(new Promise(() => {}));
    await advance(STAFF_HANG_MS);
    mountSpied();
    await tapVoid();
    expect(voidLine).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["out.stalled"].en);
    // The comp shows the step-up up-front, and with it the deferred request.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["table.loss.seg.comp"].en }));
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(STAFF["table.loss.reason.quality"].en) }),
      );
    });
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
  });

  it("a step-up void SENT with no answer, or thrown, keeps no PIN — voidLine spends the attempt before the RPC, so a re-send walks toward the lockout (critic F4)", async () => {
    vi.useFakeTimers();
    approvers.mockResolvedValue([{ staffId: "m1", name: "Aye" }]);
    const pinField = () => document.getElementById("loss-pin") as HTMLInputElement;
    async function tapComp() {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: STAFF["table.loss.seg.comp"].en }));
      });
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: new RegExp(STAFF["table.loss.reason.quality"].en) }),
        );
      });
      fireEvent.change(document.getElementById("loss-mgr") as HTMLSelectElement, {
        target: { value: "m1" },
      });
      fireEvent.change(pinField(), { target: { value: "1234" } });
      await act(async () => {
        fireEvent.submit(submitBtn().closest("form")!);
      });
    }
    const first = deferred<VoidLineResult>();
    voidLine.mockReturnValueOnce(first.promise);
    mountSpied();
    await tapComp();
    expect(voidLine).toHaveBeenCalledTimes(1);
    expect(voidLine.mock.calls[0]).toEqual([expect.objectContaining({ pin: "1234" })]);
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.loss.msg.waiting"].en);
    // MUTATION (p2h-sheets/loss/sent-keeps-the-pin): the masked digits stay, and the next tap
    // re-sends a wrong PIN whose verdict was lost; red.
    expect(pinField().value).toBe("");
    cleanup();
    await act(async () => {
      first.resolve({ ok: false, reason: "not_found" }); // the raw answers: the tablet is not stalled
    });
    voidLine.mockRejectedValueOnce(new Error("fetch failed"));
    mountSpied();
    await tapComp();
    expect(region().textContent).toBe(STAFF["table.loss.msg.unknown"].en);
    expect(pinField().value).toBe("");
    approvers.mockReset();
    approvers.mockImplementation(() => Promise.resolve([]));
  });

  it("the approval request: no answer at the bound says so with the reload; a late ok closes through the parent; a throw is 'couldn't confirm'", async () => {
    vi.useFakeTimers();
    approvers.mockResolvedValueOnce([]); // nobody on shift: the request is the primary
    const late = deferred<unknown>();
    requestApproval.mockReturnValueOnce(late.promise);
    const { onDone } = mountSpied();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["table.loss.seg.comp"].en }));
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(STAFF["table.loss.reason.quality"].en) }),
      );
    });
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
    approvers.mockResolvedValueOnce([]);
    requestApproval.mockRejectedValueOnce(new Error("fetch failed"));
    mountSpied();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["table.loss.seg.comp"].en }));
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(STAFF["table.loss.reason.quality"].en) }),
      );
    });
    await act(async () => {
      fireEvent.click(request());
    });
    // MUTATION (p2h-sheets/loss/request-threw-said-as-outage): "wasn't saved" over a request that
    // may have reached the queue; red.
    expect(region().textContent).toBe(STAFF["table.loss.msg.requestUnknown"].en);
  });

  it("a re-tap of THIS sheet's own waiting void is refused even with the wall clock set back mid-hang — and sent again once it answers (critic F12)", async () => {
    vi.useFakeTimers();
    const late = deferred<VoidLineResult>();
    voidLine.mockReturnValueOnce(late.promise);
    mountSpied();
    await tapVoid();
    await advance(STAFF_HANG_MS);
    vi.setSystemTime(Date.now() - 60_000); // the ledger's wall-clock age now reads "not stalled"
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
    approvers.mockResolvedValueOnce([]); // nobody on shift: the request is the primary
    const late = deferred<unknown>();
    requestApproval.mockReturnValueOnce(late.promise);
    mountSpied();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["table.loss.seg.comp"].en }));
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(STAFF["table.loss.reason.quality"].en) }),
      );
    });
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
    vi.setSystemTime(Date.now() - 60_000); // the ledger's wall-clock age now reads "not stalled"
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
    approvers.mockResolvedValueOnce([]); // nobody on shift: the request is the primary
    const late = deferred<unknown>();
    requestApproval.mockReturnValueOnce(late.promise);
    mountSpied();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["table.loss.seg.comp"].en }));
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(STAFF["table.loss.reason.quality"].en) }),
      );
    });
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
