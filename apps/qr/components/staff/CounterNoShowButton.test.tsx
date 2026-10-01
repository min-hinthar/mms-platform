/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { startTransition } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableLineView } from "@/lib/floor-types";
import type { RecordCounterNoShowResult } from "@/lib/voids";
import type { NoShowRefusal } from "./CounterNoShowButton";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import { STAFF_HANG_MS, track } from "@/lib/bounded-write";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";

/**
 * Phase 2f · pay at pickup — "They didn't come". The sheet's WIRING: what it claims is written off
 * (the server's SENT set, never the drafts), the loss sheet's two-pass step-up, one sentence per
 * refusal in its ONE region, the tap-time double-tap guard, and the cleared exit.
 *
 * `recordCounterNoShow` (Area B, plan §5.3) is mocked with the planned union — a Server Action has
 * no business running in a component suite.
 */
// `| NoShowRefusal` — the `changed` refusal the lib union gains (resolves at integration; a no-op then).
const record = vi.fn<(raw: unknown) => Promise<RecordCounterNoShowResult | NoShowRefusal>>();
const ROSTER = [{ staffId: "m1", displayName: "Daw Mya", role: "manager" as const }];
const approvers = vi.fn<() => Promise<typeof ROSTER>>();
vi.mock("@/lib/voids", () => ({
  listApprovers: () => approvers(),
  recordCounterNoShow: (raw: unknown) => record(raw),
}));
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
const drop = vi.fn();
vi.mock("@/lib/floor-pane", async (orig) => ({
  ...(await orig<typeof import("@/lib/floor-pane")>()),
  dropHandoffStash: (id: string) => drop(id),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { CounterNoShowButton, noShowDroppedUnits, noShowQtyMoved, noShowSetsMoved, sameIdSet } =
  await import("./CounterNoShowButton");

const line = (over: Partial<TableLineView>): TableLineView =>
  ({
    id: "x",
    name: "Dish",
    qty: 1,
    unitPriceCents: 800,
    bySeatName: null,
    soldOut: false,
    state: "fired",
    sendable: false,
    comped: false,
    pendingApproval: false,
    notes: null,
    modifiers: [],
    refundedCents: 0,
    menuItemId: "m",
    fulfillment: "togo",
    nameMy: null,
    modifiersMy: [],
    ...over,
  }) as TableLineView;

// Two SENT lines (3 units), one in-grace fired line the server did not count, a comped line the
// kitchen already had (past grace), a comped dish still in the Send's grace, two unsent to-go drafts
// (2 units) and a grocery draft — only the first set is the write-off. The two id sets are the
// SERVER's (`getTableDetail`, `counterSentLine` / `counterNoShowDropped` on the DB clock): the
// `fire_at` a TableLineView does not carry is why the sheet can never tell the two comps apart itself.
const LINES: TableLineView[] = [
  line({ id: "s1", name: "Mohinga", qty: 2, state: "served" }),
  line({ id: "s2", name: "Tea leaf salad", qty: 1, state: "fired" }),
  line({ id: "g1", name: "Samosa", qty: 4, state: "fired" }), // in grace: dropped, not sent
  line({ id: "c1", name: "Tea", qty: 1, state: "fired", comped: true }), // past grace: neither
  line({ id: "c2", name: "Shan noodles", qty: 3, state: "fired", comped: true }), // in grace: dropped
  line({ id: "d1", name: "Noodles", qty: 2, state: "draft" }),
  line({ id: "gr", name: "Rice bag", qty: 5, state: "draft", fulfillment: "grocery" }),
];
const SENT = ["s1", "s2"];
const DROPPED = ["g1", "c2", "d1", "gr"];
// The comp the kitchen already has (`counterKitchenLine && comped` on the DB clock): neither the loss
// nor dropped, but off the kitchen screen with the cancelled order.
const COMPED = ["c1"];

function mount(lang: "en" | "my" = "en", name: string | null = "Aye") {
  return render(
    <StaffLangProvider lang={lang}>
      <CounterNoShowButton
        sessionId="s-1"
        customerName={name}
        lines={LINES}
        sentLineIds={SENT}
        droppedLineIds={DROPPED}
        compedKitchenLineIds={COMPED}
        lang={lang}
      />
    </StaffLangProvider>,
  );
}
const open = () =>
  fireEvent.click(screen.getByRole("button", { name: STAFF["table.noshow.btn"].en }));
const dialog = () => document.querySelector('[role="dialog"]')!;
const region = () => dialog().querySelector('[role="status"]')!;
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
const confirmBtn = () => dialog().querySelector<HTMLButtonElement>('button[type="submit"]')!;
const submit = () =>
  act(async () => {
    fireEvent.submit(confirmBtn().closest("form")!);
  });

// Braces: a beforeEach that RETURNS a function registers it as a teardown (the mock would be called).
beforeEach(() => {
  record.mockResolvedValue({ ok: true });
  approvers.mockResolvedValue(ROSTER);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CounterNoShowButton — what it claims", () => {
  it("counts the SENT units only — drafts, grocery, in-grace and comped lines are not the loss", async () => {
    mount();
    open();
    await act(async () => {});
    expect(dialog().textContent).toContain(STAFF["table.noshow.body.many"].en.replace("{n}", "3"));
    // The read-only list is the sent lines, named by the body sentence.
    const list = dialog().querySelector("ul")!;
    expect(list.getAttribute("role")).toBe("list");
    expect(document.getElementById(list.getAttribute("aria-labelledby")!)).not.toBeNull();
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "2× Mohinga",
      "1× Tea leaf salad",
    ]);
    // What the server DROPS is said separately, not counted as a loss — the units of ITS dropped
    // set: the in-grace fired line (4), the comped dish still in the Send's grace (3 — Codex r2 on
    // #308: `mms_counter_no_show` reverts it with no comped filter), the to-go draft (2) and the
    // grocery draft (5), all gone with the cancelled cart. The comp the kitchen had (c1) is neither.
    expect(dialog().textContent).toContain(
      STAFF["table.noshow.body.drafts.many"].en.replace("{n}", "14"),
    );
    // …but it is said: the kitchen screen loses it too (Phase 2f review) — its own clause, no amount.
    const comped = dialog().querySelector("[data-noshow-comped]");
    // MUTATION (p2f-sr-sheet/comped/clause-unsaid): no clause — red.
    expect(comped?.textContent).toBe(STAFF["table.noshow.body.comped.one"].en.replace("{n}", "1"));
    expect(comped?.textContent).not.toMatch(/\$/);
  });

  it("the dropped count is the SERVER's dropped set — no client filter re-decides it", () => {
    const L = (id: string, state: string, qty: number, over: Partial<TableLineView> = {}) =>
      line({ id, state: state as TableLineView["state"], qty, ...over });
    // A comped fired line the server dropped counts — the sheet has no fire_at to second-guess it.
    expect(noShowDroppedUnits([L("c", "fired", 3, { comped: true })], ["c"])).toBe(3);
    // A grocery draft the server dropped counts.
    expect(noShowDroppedUnits([L("g", "draft", 5, { fulfillment: "grocery" })], ["g"])).toBe(5);
    // A line outside the set never counts, whatever its state (a sent line is the LOSS).
    expect(noShowDroppedUnits([L("a", "fired", 3), L("b", "draft", 1)], ["b"])).toBe(1);
    expect(noShowDroppedUnits([L("d", "draft", 2)], [])).toBe(0);
    // An id the lines do not carry adds nothing; units are qty, not rows.
    expect(noShowDroppedUnits([L("a", "draft", 2), L("b", "draft", 3)], ["a", "b", "zz"])).toBe(5);
  });

  it("no dropped units → no dropped sentence", async () => {
    render(
      <StaffLangProvider lang="en">
        <CounterNoShowButton
          sessionId="s-1"
          customerName="Aye"
          lines={LINES}
          sentLineIds={SENT}
          droppedLineIds={[]}
          compedKitchenLineIds={[]}
          lang="en"
        />
      </StaffLangProvider>,
    );
    open();
    await act(async () => {});
    expect(dialog().textContent).not.toContain("more not sent");
    // …and no comped kitchen line → no kitchen-screen clause (never "0 no-charge items").
    expect(dialog().querySelector("[data-noshow-comped]")).toBeNull();
  });

  it("titles the order by its name, or anonymously", async () => {
    mount();
    open();
    await act(async () => {});
    expect(dialog().textContent).toContain(STAFF["table.noshow.title"].en.replace("{x}", "Aye"));
    cleanup();
    mount("en", "  ");
    open();
    await act(async () => {});
    expect(dialog().textContent).toContain(STAFF["table.noshow.title.anon"].en);
  });

  it("no [disabled] anywhere; the confirm is the loss sheet's danger primary", async () => {
    mount();
    open();
    await act(async () => {});
    expect(document.querySelector("[disabled]")).toBeNull();
    expect(confirmBtn().textContent).toBe(STAFF["table.noshow.confirm"].en);
  });
});

describe("CounterNoShowButton — the write", () => {
  it("first tap goes solo; ok drops the paid-card stash and leaves for the floor", async () => {
    mount();
    open();
    await act(async () => {});
    await submit();
    expect(record).toHaveBeenCalledTimes(1);
    // The sent set the sheet SHOWED rides the write: the RPC refuses ('changed') when its own
    // derived set differs, so an approval can never cover lines nobody saw.
    expect(record).toHaveBeenCalledWith({ sessionId: "s-1", expectedLineIds: SENT });
    expect(drop).toHaveBeenCalledWith("s-1");
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
  });

  it("two taps in one frame write once (the guard is a ref, not a render)", async () => {
    record.mockReturnValue(new Promise(() => {}));
    mount();
    open();
    await act(async () => {});
    const form = confirmBtn().closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("needs_pin reveals the manager fields, relabels the confirm, and the PIN rides only then", async () => {
    record.mockResolvedValueOnce({ ok: false, reason: "needs_pin" });
    mount();
    open();
    await act(async () => {});
    await submit();
    expect(record).toHaveBeenLastCalledWith({ sessionId: "s-1", expectedLineIds: SENT });
    expect(region().textContent).toBe(STAFF["pin.needsManager"].en);
    expect(confirmBtn().textContent).toBe(STAFF["table.loss.confirmApproval.void"].en);
    expect(replace).not.toHaveBeenCalled();
    // Incomplete step-up: aria-disabled, and a tap sends nothing.
    expect(confirmBtn().getAttribute("aria-disabled")).toBe("true");
    await submit();
    expect(record).toHaveBeenCalledTimes(1);
    fireEvent.change(dialog().querySelector("select")!, { target: { value: "m1" } });
    fireEvent.change(dialog().querySelector('input[type="password"], input[inputmode]')!, {
      target: { value: "1234" },
    });
    await submit();
    expect(record).toHaveBeenLastCalledWith({
      sessionId: "s-1",
      expectedLineIds: SENT,
      approverStaffId: "m1",
      pin: "1234",
    });
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
  });

  it("a thrown transport may have cancelled the order: 'couldn't confirm' — never the write-outage 'wasn't saved', never a crash", async () => {
    record.mockRejectedValueOnce(new Error("offline"));
    mount();
    open();
    await act(async () => {});
    await submit();
    // Phase 2h (9e) — MUTATION (p2h-sheets/noshow/threw-said-as-outage): the old reading, which
    // claims nothing was written off over a response that may have been lost after the RPC; red.
    expect(region().textContent).toBe(STAFF["table.noshow.err.unknown"].en);
    expect(region().textContent).not.toContain(STAFF_WRITE_OUTAGE);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("CounterNoShowButton — every refusal speaks, in the ONE region", () => {
  const REFUSALS: NoShowRefusal[] = [
    { ok: false, reason: "needs_pin" },
    { ok: false, reason: "pin_wrong", attemptsRemaining: 2 },
    { ok: false, reason: "pin_locked", lockedUntil: new Date(Date.now() + 60_000).toISOString() },
    { ok: false, reason: "pin_no_pin" },
    { ok: false, reason: "bad_approver" },
    { ok: false, reason: "step_up_rate_limited" },
    { ok: false, reason: "not_open" },
    { ok: false, reason: "not_counter" },
    { ok: false, reason: "in_flight" },
    { ok: false, reason: "nothing_sent" },
    { ok: false, reason: "changed" },
    { ok: false, reason: "outage" },
    { ok: false, reason: "error" },
  ];
  // Every member of the union is listed above: a new server reason is a compile error in the sheet's
  // switch AND a missing row here.
  type Listed = (typeof REFUSALS)[number]["reason"];
  const exhaustive: Record<NoShowRefusal["reason"], true> = {
    needs_pin: true,
    pin_wrong: true,
    pin_locked: true,
    pin_no_pin: true,
    bad_approver: true,
    step_up_rate_limited: true,
    not_open: true,
    not_counter: true,
    in_flight: true,
    nothing_sent: true,
    changed: true,
    outage: true,
    error: true,
  } satisfies Record<Listed, true>;

  it.each(REFUSALS)("$reason → a sentence in the one region, no navigation", async (res) => {
    expect(exhaustive[res.reason]).toBe(true);
    record.mockResolvedValueOnce(res);
    mount();
    open();
    await act(async () => {});
    await submit();
    expect(dialog().querySelectorAll('[role="status"],[role="alert"],[aria-live]')).toHaveLength(1);
    expect(region().textContent?.trim().length).toBeGreaterThan(0);
    expect(replace).not.toHaveBeenCalled();
  });

  it("the not-sent / not-open / in-flight / failed refusals say the dictionary's own words", async () => {
    const cases = [
      ["nothing_sent", "table.noshow.err.nothingSent"],
      ["not_open", "table.noshow.err.notOpen"],
      ["in_flight", "table.noshow.err.inFlight"],
      ["not_counter", "table.noshow.err.notCounter"],
      ["changed", "table.noshow.err.changed"],
      ["error", "table.noshow.err.failed"],
    ] as const;
    for (const [reason, k] of cases) {
      record.mockResolvedValueOnce({ ok: false, reason });
      mount();
      open();
      await act(async () => {});
      await submit();
      expect(region().textContent).toBe(STAFF[k].en);
      cleanup();
    }
  });
});

describe("CounterNoShowButton — a roster that could not be read (Codex round 2 on #308)", () => {
  // The manager step-up after a `needs_pin`, with the roster read REJECTED on mount.
  async function stepUpWithFailedRoster() {
    approvers.mockRejectedValueOnce(new Error("503"));
    record.mockResolvedValueOnce({ ok: false, reason: "needs_pin" });
    mount();
    open();
    await act(async () => {});
    await submit();
  }
  const select = () => dialog().querySelector("select")!;
  const retryBtn = () =>
    [...dialog().querySelectorAll("button")].find(
      (b) => b.textContent === STAFF["out.shell.retry"].en,
    );

  it("says the list couldn't be loaded — never that no manager is on shift", async () => {
    await stepUpWithFailedRoster();
    const text = dialog().textContent!;
    expect(text).toContain(STAFF["pin.manager.loadFailed"].en);
    expect(select().options[0]!.textContent).toBe(STAFF["pin.manager.unavailable"].en);
    expect(text).not.toContain(STAFF["pin.manager.noneNote"].en);
    expect(text).not.toContain(STAFF["pin.manager.none"].en);
    // The manager step stays blocked while there is no list: nothing to pick, the confirm refuses.
    expect(select().disabled).toBe(true);
    expect(confirmBtn().getAttribute("aria-disabled")).toBe("true");
    // Still ONE region; the static note is not a second live region.
    expect(dialog().querySelectorAll('[role="status"],[role="alert"],[aria-live]')).toHaveLength(1);
    expect(retryBtn()).toBeDefined();
  });

  it("Try again re-reads the roster and recovers: picker enabled, focused, note gone", async () => {
    await stepUpWithFailedRoster();
    expect(approvers).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(retryBtn()!);
    });
    expect(approvers).toHaveBeenCalledTimes(2);
    expect(select().disabled).toBe(false);
    expect([...select().options].map((o) => o.textContent)).toEqual([
      STAFF["pin.manager.pick"].en,
      "Daw Mya",
    ]);
    expect(dialog().textContent).not.toContain(STAFF["pin.manager.loadFailed"].en);
    expect(retryBtn()).toBeUndefined();
    expect(document.activeElement).toBe(select());
    // The pending "a manager needs to approve" sentence is untouched by the recovery.
    expect(region().textContent).toBe(STAFF["pin.needsManager"].en);
  });

  it("a second failure is said in the ONE region, and the Try again stays", async () => {
    await stepUpWithFailedRoster();
    approvers.mockRejectedValueOnce(new Error("503"));
    await act(async () => {
      fireEvent.click(retryBtn()!);
    });
    expect(approvers).toHaveBeenCalledTimes(2);
    expect(region().textContent).toBe(STAFF["pin.manager.loadFailed"].en);
    expect(select().disabled).toBe(true);
    expect(retryBtn()).toBeDefined();
    // …and a later recovery clears exactly that sentence — and, with the step-up still pending,
    // puts "a manager needs to approve" back (Phase 2f review: never a blank region under the fields).
    await act(async () => {
      fireEvent.click(retryBtn()!);
    });
    // MUTATION (p2f-sr-sheet/roster/recovery-drops-needs-manager): the region reads "" — red.
    expect(region().textContent).toBe(STAFF["pin.needsManager"].en);
    expect(select().disabled).toBe(false);
  });

  it("a genuinely EMPTY roster still says nobody is on shift (the outage copy is not a blanket)", async () => {
    approvers.mockResolvedValueOnce([]);
    record.mockResolvedValueOnce({ ok: false, reason: "needs_pin" });
    mount();
    open();
    await act(async () => {});
    await submit();
    expect(dialog().textContent).toContain(STAFF["pin.manager.noneNote"].en);
    expect(dialog().textContent).not.toContain(STAFF["pin.manager.loadFailed"].en);
    expect(retryBtn()).toBeUndefined();
  });
});

describe("CounterNoShowButton — what the manager READ is what is submitted (Phase 2f review, PT-3)", () => {
  function props(
    over: { sent?: string[]; dropped?: string[]; comped?: string[]; lines?: TableLineView[] } = {},
  ) {
    return (
      <StaffLangProvider lang="en">
        <CounterNoShowButton
          sessionId="s-1"
          customerName="Aye"
          lines={over.lines ?? LINES}
          sentLineIds={over.sent ?? SENT}
          droppedLineIds={over.dropped ?? DROPPED}
          compedKitchenLineIds={over.comped ?? COMPED}
          lang="en"
        />
      </StaffLangProvider>
    );
  }
  const items = () => [...dialog().querySelectorAll("ul li")].map((li) => li.textContent);
  const rearmBtn = () =>
    [...dialog().querySelectorAll("button")].find(
      (b) => b.textContent === STAFF["table.noshow.rearm"].en,
    );

  it("a poll that moves the sent set under the open sheet: the list holds, the write refuses, the region says so", async () => {
    const view = render(props());
    open();
    await act(async () => {});
    expect(rearmBtn()).toBeUndefined();
    // The table page's poll lands: s2 was removed on another device — the sent set is now [s1].
    view.rerender(props({ sent: ["s1"] }));
    // What the sheet SHOWS is still the snapshot the manager read…
    expect(items()).toEqual(["2× Mohinga", "1× Tea leaf salad"]);
    // …the one region says the order changed, and the confirm refuses.
    // MUTATION (p2f-sr-sheet/snapshot/moved-unsaid): the region stays empty — red.
    expect(region().textContent).toBe(STAFF["table.noshow.err.changed"].en);
    expect(dialog().querySelectorAll('[role="status"],[role="alert"],[aria-live]')).toHaveLength(1);
    expect(confirmBtn().getAttribute("aria-disabled")).toBe("true");
    await submit();
    // MUTATION (p2f-sr-sheet/snapshot/moved-submits): the old or new set goes out unseen — red.
    expect(record).not.toHaveBeenCalled();
    expect(rearmBtn()).toBeDefined();
  });

  it("the explicit re-arm adopts the new order: new list, region cleared, focus on the count, the NEW ids ride", async () => {
    const view = render(props());
    open();
    await act(async () => {});
    view.rerender(props({ sent: ["s1"] }));
    await act(async () => {
      fireEvent.click(rearmBtn()!);
    });
    expect(items()).toEqual(["2× Mohinga"]);
    expect(dialog().textContent).toContain(STAFF["table.noshow.body.many"].en.replace("{n}", "2"));
    expect(region().textContent).toBe("");
    expect(rearmBtn()).toBeUndefined();
    // Focus lands on the new count (the re-arm button that held it is gone).
    expect(document.activeElement?.id).toBe(
      dialog().querySelector("ul")!.getAttribute("aria-labelledby"),
    );
    await submit();
    expect(record).toHaveBeenCalledWith({ sessionId: "s-1", expectedLineIds: ["s1"] });
  });

  it("the write carries the SNAPSHOT's ids, not the live props, until a re-arm", async () => {
    // A live set with the same members in another order is not a move: the write goes, as the
    // snapshot said it.
    const view = render(props());
    open();
    await act(async () => {});
    view.rerender(props({ sent: ["s2", "s1"], dropped: [...DROPPED].reverse() }));
    expect(region().textContent).toBe("");
    await submit();
    // MUTATION (p2f-rev-ui/no-show/expected-lines-unsent · p2f-sr-sheet/snapshot/submits-live-props):
    // red on a missing key, or on the live order.
    expect(record).toHaveBeenCalledWith({ sessionId: "s-1", expectedLineIds: SENT });
  });

  it("a moved dropped or comped set also stops the write — each changes a sentence on screen", async () => {
    for (const over of [{ dropped: ["g1"] }, { comped: [] as string[] }]) {
      const view = render(props());
      open();
      await act(async () => {});
      view.rerender(props(over));
      expect(region().textContent).toBe(STAFF["table.noshow.err.changed"].en);
      await submit();
      expect(record).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("the needs_pin step-up keeps the snapshot: the approval rides the ids the manager read", async () => {
    record.mockResolvedValueOnce({ ok: false, reason: "needs_pin" });
    const view = render(props());
    open();
    await act(async () => {});
    await submit();
    expect(region().textContent).toBe(STAFF["pin.needsManager"].en);
    // The set moves while the manager is typing their PIN.
    view.rerender(props({ sent: ["s1"] }));
    fireEvent.change(dialog().querySelector("select")!, { target: { value: "m1" } });
    fireEvent.change(dialog().querySelector('input[type="password"]')!, {
      target: { value: "1234" },
    });
    expect(region().textContent).toBe(STAFF["table.noshow.err.changed"].en);
    await submit();
    expect(record).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(rearmBtn()!);
    });
    // The pending step-up's sentence comes back with the re-arm; the approval now covers [s1].
    expect(region().textContent).toBe(STAFF["pin.needsManager"].en);
    await submit();
    expect(record).toHaveBeenLastCalledWith({
      sessionId: "s-1",
      expectedLineIds: ["s1"],
      approverStaffId: "m1",
      pin: "1234",
    });
  });

  // Codex round 4 on #308 — the same ids with a different unit count is a move too.
  const withQty = (id: string, qty: number) => LINES.map((l) => (l.id === id ? { ...l, qty } : l));
  const draftsSaid = (n: number) =>
    STAFF["table.noshow.body.drafts.many"].en.replace("{n}", `${n}`);

  it("Codex r4 — another tablet changes a DRAFT's qty (same ids): the counts hold, the write refuses, the region says so", async () => {
    const view = render(props());
    open();
    await act(async () => {});
    // 4 + 3 + 2 + 5 = 14 units dropped.
    expect(dialog().textContent).toContain(draftsSaid(14));
    view.rerender(props({ lines: withQty("d1", 3) }));
    // MUTATION (p2f-cx4/no-show/qty-move-unseen): ids equal → not moved, the confirm goes — red.
    expect(region().textContent).toBe(STAFF["table.noshow.err.changed"].en);
    expect(confirmBtn().getAttribute("aria-disabled")).toBe("true");
    expect(dialog().textContent).toContain(draftsSaid(14));
    await submit();
    expect(record).not.toHaveBeenCalled();
    // The re-arm adopts the new counts, and the write goes.
    await act(async () => {
      fireEvent.click(rearmBtn()!);
    });
    expect(dialog().textContent).toContain(draftsSaid(15));
    expect(region().textContent).toBe("");
    await submit();
    expect(record).toHaveBeenCalledWith({ sessionId: "s-1", expectedLineIds: SENT });
  });

  it("Codex r4 — a SENT line's qty changes (same ids): the list holds until the re-arm shows the new count", async () => {
    const view = render(props());
    open();
    await act(async () => {});
    view.rerender(props({ lines: withQty("s1", 3) }));
    expect(items()).toEqual(["2× Mohinga", "1× Tea leaf salad"]);
    expect(region().textContent).toBe(STAFF["table.noshow.err.changed"].en);
    await submit();
    expect(record).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(rearmBtn()!);
    });
    expect(items()).toEqual(["3× Mohinga", "1× Tea leaf salad"]);
    expect(dialog().textContent).toContain(STAFF["table.noshow.body.many"].en.replace("{n}", "4"));
  });

  it("noShowQtyMoved — a count on any counted line (sent, dropped, comped) moves; others do not", () => {
    const sets = { sent: ["s1"], dropped: ["d1"], comped: ["c1"] };
    const before = [
      { id: "s1", qty: 1 },
      { id: "d1", qty: 2 },
      { id: "c1", qty: 1 },
      { id: "x", qty: 1 },
    ];
    const bump = (id: string) => before.map((l) => (l.id === id ? { ...l, qty: l.qty + 1 } : l));
    expect(noShowQtyMoved(before, before, sets)).toBe(false);
    expect(noShowQtyMoved(before, bump("s1"), sets)).toBe(true);
    expect(noShowQtyMoved(before, bump("d1"), sets)).toBe(true);
    expect(noShowQtyMoved(before, bump("c1"), sets)).toBe(true);
    // A line in no set is not on the sheet: its count is nothing the sheet said.
    expect(noShowQtyMoved(before, bump("x"), sets)).toBe(false);
    // A counted line gone from the live lines is a move (re-arm adopts what is there).
    expect(noShowQtyMoved(before, before.slice(1), sets)).toBe(true);
  });

  it("sameIdSet / noShowSetsMoved — order-free set equality over all three sets", () => {
    expect(sameIdSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameIdSet(["a", "b"], ["a"])).toBe(false);
    expect(sameIdSet(["a"], ["a", "b"])).toBe(false);
    expect(sameIdSet(["a", "b"], ["a", "c"])).toBe(false);
    expect(sameIdSet([], [])).toBe(true);
    const base = { sent: ["s"], dropped: ["d"], comped: ["c"] };
    expect(noShowSetsMoved(base, { sent: ["s"], dropped: ["d"], comped: ["c"] })).toBe(false);
    expect(noShowSetsMoved(base, { ...base, sent: [] })).toBe(true);
    expect(noShowSetsMoved(base, { ...base, dropped: [] })).toBe(true);
    expect(noShowSetsMoved(base, { ...base, comped: [] })).toBe(true);
  });
});

// ── Phase 2h · p2h-sheets ──
type NoShowAnswer = RecordCounterNoShowResult | NoShowRefusal;
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
/** Settled in `afterEach` once the tree is gone (a pre-fix transition must not entangle the next). */
function hang() {
  const d = deferred<NoShowAnswer>();
  hanging.push(() => d.resolve({ ok: false, reason: "not_open" }));
  return d;
}

describe("CounterNoShowButton — a hung write-off never traps the sheet (Phase 2h · 9a · 9d · 9e)", () => {
  afterEach(async () => {
    vi.useRealTimers();
    cleanup();
    await act(async () => {
      for (const end of hanging.splice(0)) end();
    });
  });
  const reloadBtn = () => screen.queryByRole("button", { name: STAFF["out.reload"].en });
  const closeX = () =>
    screen.getByRole("button", {
      name: (n) => n === STAFF["shell.close"].en || n === STAFF["shell.closeBusy"].en,
    });
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  async function openSheet() {
    mount();
    open();
    await act(async () => {});
  }

  it("no answer at STAFF_HANG_MS: the sheet frees (✕ live, confirm not busy), says the order may still be removed, offers the reload", async () => {
    vi.useFakeTimers();
    record.mockReturnValueOnce(hang().promise);
    await openSheet();
    await submit();
    expect(confirmBtn().getAttribute("aria-busy")).toBe("true");
    expect(closeX().getAttribute("aria-disabled")).toBe("true");
    await advance(STAFF_HANG_MS - 1);
    expect(confirmBtn().getAttribute("aria-busy")).toBe("true");
    await advance(1);
    // MUTATION (p2h-sheets/noshow/busy-never-clears): every exit refused forever; red.
    expect(confirmBtn().getAttribute("aria-busy")).toBeNull();
    expect(closeX().getAttribute("aria-disabled")).toBeNull();
    // MUTATION (p2h-sheets/noshow/waiting-said-as-unknown): red.
    expect(region().textContent).toBe(STAFF["table.noshow.waiting"].en);
    // MUTATION (p2h-sheets/noshow/no-reload): red.
    expect(reloadBtn()).not.toBeNull();
    await act(async () => {
      fireEvent.click(closeX());
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("the entanglement proxy: an UNRELATED async transition left hanging — the sheet still frees at the bound", async () => {
    vi.useFakeTimers();
    const other = deferred<void>();
    hanging.push(() => other.resolve());
    act(() => {
      startTransition(async () => {
        await other.promise;
      });
    });
    record.mockReturnValueOnce(hang().promise);
    await openSheet();
    await submit();
    await advance(STAFF_HANG_MS);
    expect(confirmBtn().getAttribute("aria-busy")).toBeNull();
    expect(closeX().getAttribute("aria-disabled")).toBeNull();
  });

  it("a LATE ok while the sheet is open leaves for the floor; a LATE refusal is said in the region", async () => {
    vi.useFakeTimers();
    const late = deferred<NoShowAnswer>();
    record.mockReturnValueOnce(late.promise);
    await openSheet();
    await submit();
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.noshow.waiting"].en);
    await act(async () => {
      late.resolve({ ok: true });
    });
    // MUTATION (p2h-sheets/noshow/late-answer-dropped): the order was cancelled and the sheet keeps
    // saying "no answer yet" over a defunct detail; red.
    expect(drop).toHaveBeenCalledWith("s-1");
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
    cleanup();
    const refused = deferred<NoShowAnswer>();
    record.mockReturnValueOnce(refused.promise);
    await openSheet();
    await submit();
    await advance(STAFF_HANG_MS);
    await act(async () => {
      refused.resolve({ ok: false, reason: "not_open" });
    });
    expect(region().textContent).toBe(STAFF["table.noshow.err.notOpen"].en);
    expect(reloadBtn()).toBeNull();
  });

  it("a LATE ok after the sheet was closed drops the stash but never navigates under the manager", async () => {
    vi.useFakeTimers();
    const late = deferred<NoShowAnswer>();
    record.mockReturnValueOnce(late.promise);
    await openSheet();
    await submit();
    await advance(STAFF_HANG_MS);
    await act(async () => {
      fireEvent.click(closeX());
    });
    await act(async () => {
      late.resolve({ ok: true });
    });
    expect(drop).toHaveBeenCalledWith("s-1");
    // MUTATION (p2h-sheets/noshow/late-ok-navigates-a-closed-sheet): the page is replaced under a
    // manager who has moved on (the page's own read finds the closed order); red.
    expect(replace).not.toHaveBeenCalled();
  });

  it("a LATE throw is 'couldn't confirm'", async () => {
    vi.useFakeTimers();
    const late = deferred<NoShowAnswer>();
    record.mockReturnValueOnce(late.promise);
    await openSheet();
    await submit();
    await advance(STAFF_HANG_MS);
    await act(async () => {
      late.reject(new Error("fetch failed"));
    });
    // MUTATION (p2h-sheets/noshow/late-throw-unsaid): "no answer yet" stands for good; red.
    expect(region().textContent).toBe(STAFF["table.noshow.err.unknown"].en);
  });

  it("a re-tap while the write-off is still out is REFUSED, never sent — in the write-off's OWN words ('don't remove it again'), with the reload (owner decision)", async () => {
    vi.useFakeTimers();
    record.mockReturnValueOnce(hang().promise);
    await openSheet();
    await submit();
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.noshow.waiting"].en);
    const said = watchRegion(region());
    await submit();
    // Never sent: a second write-off queued behind the first cancels the order whenever the queue
    // moves.
    expect(record).toHaveBeenCalledTimes(1);
    // Critic F1 — RE-SAID, not left standing: the line already stood in the region, and equal text
    // re-rendered in place is no DOM change — nothing announced, nothing seen, a dead tap.
    // MUTATION (p2h-int-c/noshow/resay-unkeyed · p2h-int-c/noshow/refusal-unsaid): red.
    expect(said()).toBe(true);
    // MUTATION (p2h-int-c/noshow/own-wait-said-as-stalled · p2h-sheets/noshow/own-wait-forgotten):
    // its own write-off IS the stall, but "this did nothing" drops "Don't remove it again"; red.
    expect(region().textContent).toBe(STAFF["table.noshow.waiting"].en);
    expect(reloadBtn()).not.toBeNull();
  });

  it("a step-up write-off with no answer keeps no PIN — it was sent, and must not be re-sent toward the lockout", async () => {
    vi.useFakeTimers();
    record.mockResolvedValueOnce({ ok: false, reason: "needs_pin" });
    await openSheet();
    await submit();
    fireEvent.change(dialog().querySelector("select")!, { target: { value: "m1" } });
    const pinField = () =>
      dialog().querySelector<HTMLInputElement>('input[type="password"], input[inputmode]')!;
    fireEvent.change(pinField(), { target: { value: "1234" } });
    record.mockReturnValueOnce(hang().promise);
    await submit();
    expect(record).toHaveBeenCalledTimes(2);
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.noshow.waiting"].en);
    // MUTATION (p2h-sheets/noshow/waiting-keeps-the-pin): the masked digits stay; red.
    expect(pinField().value).toBe("");
  });

  it("a tablet stalled on ANOTHER action refuses the write-off at the tap: nothing dispatched", async () => {
    vi.useFakeTimers();
    track(new Promise(() => {}));
    await advance(STAFF_HANG_MS);
    await openSheet();
    await submit();
    // MUTATION (p2h-sheets/noshow/stalled-tap-dispatches): the write-off queued behind the hung
    // action, cancelling the order whenever the queue moves; red.
    expect(record).not.toHaveBeenCalled();
    expect(confirmBtn().getAttribute("aria-busy")).toBeNull();
    expect(region().textContent).toBe(STAFF["out.stalled"].en);
    expect(reloadBtn()).not.toBeNull();
  });

  it("a re-tap of THIS sheet's own waiting write-off is refused even with the wall clock set back mid-hang — and sent again once it answers (critic F12)", async () => {
    vi.useFakeTimers();
    const late = deferred<NoShowAnswer>();
    record.mockReturnValueOnce(late.promise);
    await openSheet();
    await submit();
    await advance(STAFF_HANG_MS);
    vi.setSystemTime(Date.now() - 60_000); // the ledger's wall-clock age now reads "not stalled"
    await submit();
    // MUTATION (p2h-sheets/noshow/own-wait-forgotten): a second write-off queued behind the first; red.
    expect(record).toHaveBeenCalledTimes(1);
    expect(region().textContent).toBe(STAFF["table.noshow.waiting"].en);
    await act(async () => {
      late.resolve({ ok: false, reason: "not_open" });
    });
    record.mockReturnValueOnce(hang().promise);
    await submit();
    // MUTATION (p2h-sheets/noshow/own-wait-never-cleared): an answered write-off still refuses the retry; red.
    expect(record).toHaveBeenCalledTimes(2);
  });

  it("a write-off that may still land outranks 'the order changed': the waiting sentence and its reload stay when a poll moves the order (critic F11)", async () => {
    vi.useFakeTimers();
    const sheet = (sent: string[]) => (
      <StaffLangProvider lang="en">
        <CounterNoShowButton
          sessionId="s-1"
          customerName="Aye"
          lines={LINES}
          sentLineIds={sent}
          droppedLineIds={DROPPED}
          compedKitchenLineIds={COMPED}
          lang="en"
        />
      </StaffLangProvider>
    );
    const first = deferred<NoShowAnswer>();
    record.mockReturnValueOnce(first.promise);
    const view = render(sheet(SENT));
    open();
    await act(async () => {});
    await submit();
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.noshow.waiting"].en);
    // The page's poll lands mid-wait and the sent set moved — maybe BECAUSE the write-off landed.
    view.rerender(sheet(["s1"]));
    // MUTATION (p2h-sheets/noshow/moved-hides-the-waiting): "the order changed — confirm again"
    // replaces "no answer yet — don't do it again", and the reload goes with it; red.
    expect(region().textContent).toBe(STAFF["table.noshow.waiting"].en);
    expect(reloadBtn()).not.toBeNull();
    // The re-arm is still offered (it renders on `moved`, not on the region's sentence).
    expect(
      [...dialog().querySelectorAll("button")].some(
        (b) => b.textContent === STAFF["table.noshow.rearm"].en,
      ),
    ).toBe(true);
    // A THROWN write-off may have cancelled the order too: "couldn't confirm — check the order"
    // outranks the move the same way.
    cleanup();
    await act(async () => {
      first.resolve({ ok: false, reason: "not_open" }); // answered: the tablet is not stalled
    });
    record.mockRejectedValueOnce(new Error("fetch failed"));
    const again = render(sheet(SENT));
    open();
    await act(async () => {});
    await submit();
    expect(region().textContent).toBe(STAFF["table.noshow.err.unknown"].en);
    again.rerender(sheet(["s1"]));
    // MUTATION (p2h-sheets/noshow/moved-hides-the-unknown): red.
    expect(region().textContent).toBe(STAFF["table.noshow.err.unknown"].en);
  });
});
