/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableLineView } from "@/lib/floor-types";
import type { RecordCounterNoShowResult } from "@/lib/voids";
import type { NoShowRefusal } from "./CounterNoShowButton";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";

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
const { CounterNoShowButton, noShowDroppedUnits } = await import("./CounterNoShowButton");

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

// Two SENT lines (3 units), one in-grace fired line the server did not count, one comped line, two
// unsent to-go drafts (2 units) and a grocery draft — only the first set is the write-off.
const LINES: TableLineView[] = [
  line({ id: "s1", name: "Mohinga", qty: 2, state: "served" }),
  line({ id: "s2", name: "Tea leaf salad", qty: 1, state: "fired" }),
  line({ id: "g1", name: "Samosa", qty: 4, state: "fired" }), // in grace: not in sentLineIds
  line({ id: "c1", name: "Tea", qty: 1, state: "fired", comped: true }),
  line({ id: "d1", name: "Noodles", qty: 2, state: "draft" }),
  line({ id: "gr", name: "Rice bag", qty: 5, state: "draft", fulfillment: "grocery" }),
];
const SENT = ["s1", "s2"];

function mount(lang: "en" | "my" = "en", name: string | null = "Aye") {
  return render(
    <StaffLangProvider lang={lang}>
      <CounterNoShowButton
        sessionId="s-1"
        customerName={name}
        lines={LINES}
        sentLineIds={SENT}
        lang={lang}
      />
    </StaffLangProvider>,
  );
}
const open = () =>
  fireEvent.click(screen.getByRole("button", { name: STAFF["table.noshow.btn"].en }));
const dialog = () => document.querySelector('[role="dialog"]')!;
const region = () => dialog().querySelector('[role="status"]')!;
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
    // What the server DROPS is said separately, not counted as a loss: the unsent to-go draft (2)
    // AND the in-grace fired line (4) — `mms_counter_no_show` reverts an in-grace line to draft and
    // leaves it on the cancelled cart. Grocery never counts; a comped line past its grace was sent.
    expect(dialog().textContent).toContain(
      STAFF["table.noshow.body.drafts.many"].en.replace("{n}", "6"),
    );
  });

  it("the dropped count is every line the server drops — and nothing the kitchen kept", () => {
    const L = (id: string, state: string, qty: number, over: Partial<TableLineView> = {}) =>
      line({ id, state: state as TableLineView["state"], qty, ...over });
    // An in-grace fired line (not in the sent set) is dropped like a draft.
    expect(noShowDroppedUnits([L("a", "fired", 3)], [])).toBe(3);
    expect(noShowDroppedUnits([L("a", "draft", 2)], [])).toBe(2);
    // A sent line is the LOSS, never also "dropped".
    expect(noShowDroppedUnits([L("a", "fired", 3), L("b", "draft", 1)], ["a"])).toBe(1);
    // Grocery never counts; a comped fired line outside the sent set is past its grace (kept).
    expect(noShowDroppedUnits([L("g", "draft", 5, { fulfillment: "grocery" })], [])).toBe(0);
    expect(noShowDroppedUnits([L("c", "fired", 1, { comped: true })], [])).toBe(0);
    // Cooking / served / voided lines outside the sent set are not reverted by the RPC.
    expect(
      noShowDroppedUnits([L("p", "in_progress", 1), L("s", "served", 1), L("v", "voided", 1)], []),
    ).toBe(0);
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

  it("a thrown transport reads as the outage sentence, never a crash", async () => {
    record.mockRejectedValueOnce(new Error("offline"));
    mount();
    open();
    await act(async () => {});
    await submit();
    expect(region().textContent?.length).toBeGreaterThan(0);
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
    // …and a later recovery clears exactly that sentence.
    await act(async () => {
      fireEvent.click(retryBtn()!);
    });
    expect(region().textContent).toBe("");
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
