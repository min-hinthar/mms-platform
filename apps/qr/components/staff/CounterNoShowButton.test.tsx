/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableLineView } from "@/lib/floor-types";
import type { RecordCounterNoShowResult } from "@/lib/voids";
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
const record = vi.fn<(raw: unknown) => Promise<RecordCounterNoShowResult>>();
vi.mock("@/lib/voids", () => ({
  listApprovers: () =>
    Promise.resolve([{ staffId: "m1", displayName: "Daw Mya", role: "manager" }]),
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
const { CounterNoShowButton } = await import("./CounterNoShowButton");

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
    // The unsent to-go draft is said separately, as dropped (grocery excluded).
    expect(dialog().textContent).toContain(
      STAFF["table.noshow.body.drafts.many"].en.replace("{n}", "2"),
    );
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
    expect(record).toHaveBeenCalledWith({ sessionId: "s-1" });
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
    expect(record).toHaveBeenLastCalledWith({ sessionId: "s-1" });
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
  const REFUSALS: Exclude<RecordCounterNoShowResult, { ok: true }>[] = [
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
    { ok: false, reason: "outage" },
    { ok: false, reason: "error" },
  ];
  // Every member of the union is listed above: a new server reason is a compile error in the sheet's
  // switch AND a missing row here.
  type Listed = (typeof REFUSALS)[number]["reason"];
  const exhaustive: Record<Exclude<RecordCounterNoShowResult, { ok: true }>["reason"], true> = {
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
