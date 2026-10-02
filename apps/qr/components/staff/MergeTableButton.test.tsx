/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_HANG_MS } from "@/lib/bounded-write";
import type { MergeCandidate } from "@/lib/floor-types";

/**
 * Phase 2h (P2fc) — the merge door, bounded. Two server calls live here: the candidate READ (a
 * picker that sat on "Loading tables…" forever behind a stuck action queue) and the merge WRITE
 * (Back and Merge natively disabled for as long as the action hung). What only a render can show:
 * the read gives up at the bound and says so; the write frees its controls at the bound and says
 * "no answer yet" with the reload; a late merge still lands on the target table; a lost answer says
 * "couldn't confirm"; and nothing is ever natively disabled.
 */
const getMergeCandidates = vi.fn();
const mergeTables = vi.fn();
vi.mock("@/lib/floor", () => ({
  getMergeCandidates: (...a: unknown[]) => getMergeCandidates(...a),
  mergeTables: (...a: unknown[]) => mergeTables(...a),
}));
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { MergeTableButton } = await import("./MergeTableButton");
const { ts } = await import("@/lib/i18n/staff");

const T9: MergeCandidate = {
  sessionId: "s9",
  label: "nine",
  tableNumber: 9,
  mode: "dinein",
  itemCount: 2,
  partySize: 3,
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  getMergeCandidates.mockReset();
  mergeTables.mockReset();
  replace.mockReset();
  refresh.mockReset();
});

const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
function mount(lang: "en" | "my" = "en") {
  return render(
    <StaffLangProvider lang={lang}>
      <MergeTableButton sourceSessionId="s1" sourceLabel="4" sourceItemCount={3} />
    </StaffLangProvider>,
  );
}
function hung(fn: ReturnType<typeof vi.fn>) {
  let answer!: (v: unknown) => void;
  let fail!: (e: Error) => void;
  fn.mockReturnValueOnce(
    new Promise((res, rej) => {
      answer = res;
      fail = rej;
    }),
  );
  return { answer: (v: unknown) => answer(v), fail: (e: Error) => fail(e) };
}
const reload = () => screen.queryByRole("button", { name: ts("en", "out.reload") });
/** Open the picker, pick Table 9, and tap Merge. */
async function toMerge() {
  getMergeCandidates.mockResolvedValueOnce([T9]);
  fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.merge.btn") }));
  await flush();
  fireEvent.click(screen.getByRole("button", { name: /^Table 9/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Merge into Table 9" }));
  });
}

describe("MergeTableButton — the candidate read is bounded", () => {
  it("a read with no answer says it could not load at the bound — never 'Loading tables…' forever", async () => {
    hung(getMergeCandidates);
    mount();
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.merge.btn") }));
    await flush(STAFF_HANG_MS - 1);
    expect(screen.getByText(ts("en", "settle.merge.loading"))).toBeTruthy();
    // MUTATION (p2h-doors/merge-candidates-unbounded): the read is awaited raw — behind a stuck
    // queue the picker says "Loading tables…" for good, with nothing saying why; red.
    await flush(1);
    expect(screen.queryByText(ts("en", "settle.merge.loading"))).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.merge.loadFailed"));
  });

  it("a read still out at the bound never claims 'no other open tables', offers the reload, and its LATE list still lands (S2 critic D10)", async () => {
    const h = hung(getMergeCandidates);
    mount();
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.merge.btn") }));
    await flush(STAFF_HANG_MS);
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.merge.loadFailed"));
    // MUTATION (p2h-doors/merge-read-failed-says-empty): an unknown read renders "No other open
    // tables" beside "Couldn't load tables" — an empty list claimed from a read that never came; red.
    expect(screen.queryByText(ts("en", "settle.merge.noCandidates"))).toBeNull();
    // MUTATION (p2h-doors/merge-read-waiting-no-reload): "try again" would queue behind the stuck
    // action — the reload is the way out; red.
    expect(reload()).not.toBeNull();
    // MUTATION (p2h-doors/merge-read-late-dropped): the late list is dropped — the picker stays on
    // "couldn't load" with the tables in hand; red.
    await act(async () => h.answer([T9]));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /^Table 9/ })).toBeTruthy();
    expect(reload()).toBeNull();
  });

  it("only the LATEST open writes: a Cancelled open's bound never lands over a newer one (S2 critic D10)", async () => {
    const h = hung(getMergeCandidates); // read 1 — out until the end
    mount();
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.merge.btn") }));
    await flush(5000);
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.cancel") }));
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.merge.btn") }));
    await flush(1);
    // The first open's bound passes (10s into the second open): it was retired by the Cancel.
    // MUTATION (p2h-doors/merge-read-older-overwrites): the Cancelled open writes "Couldn't load
    // tables" (and hides the list) over the open still loading; red.
    await flush(STAFF_HANG_MS - 5000);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(ts("en", "settle.merge.loading"))).toBeTruthy();
    await act(async () => h.answer([T9]));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /^Table 9/ })).toBeTruthy();
  });

  // ── Codex round 3 on #310 — the bound frees the panel, never the action: a hung read stays in the
  // tab's queue, so it is ONE read per table in the air, whatever is opened, cancelled or remounted.
  it("a reopen — after a Cancel, or in a REMOUNTED control — attaches to the read still out, never sends another; its answer lands there", async () => {
    const h = hung(getMergeCandidates);
    const first = mount();
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.merge.btn") }));
    await flush(STAFF_HANG_MS);
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.merge.loadFailed"));
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.cancel") }));
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.merge.btn") }));
    await flush(1);
    // MUTATION (p2h-cx3/merge-read-sent-again): every reopen dispatches a fresh read behind the hung
    // one — one more per reopen, each ahead of every action tapped after; red.
    expect(getMergeCandidates).toHaveBeenCalledTimes(1);
    expect(screen.getByText(ts("en", "settle.merge.loading"))).toBeTruthy();
    // Staff switch tables and back: a NEW mount, the same table, the read still out.
    first.unmount();
    mount();
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.merge.btn") }));
    await flush(1);
    expect(getMergeCandidates).toHaveBeenCalledTimes(1);
    await act(async () => h.answer([T9]));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /^Table 9/ })).toBeTruthy();
  });

  it("once the read has ANSWERED (or failed) the next open reads afresh — a settled list is never served twice", async () => {
    getMergeCandidates.mockResolvedValueOnce([T9]);
    mount();
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.merge.btn") }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.cancel") }));
    getMergeCandidates.mockRejectedValueOnce(new Error("fetch failed"));
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.merge.btn") }));
    await flush();
    // MUTATION (p2h-cx3/merge-read-never-released): the register keeps the answered read — every
    // later open serves that first list, a table opened since never appears; red.
    expect(getMergeCandidates).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.merge.loadFailed"));
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.cancel") }));
    getMergeCandidates.mockResolvedValueOnce([T9]);
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.merge.btn") }));
    await flush();
    // A failed read is released too: the next open asks again and gets the list.
    expect(getMergeCandidates).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: /^Table 9/ })).toBeTruthy();
  });

  it("the register is per TABLE: another table's merge never attaches to this table's read", async () => {
    hung(getMergeCandidates);
    mount();
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.merge.btn") }));
    await flush(1);
    cleanup();
    getMergeCandidates.mockResolvedValueOnce([T9]);
    render(
      <StaffLangProvider lang="en">
        <MergeTableButton sourceSessionId="s2" sourceLabel="5" sourceItemCount={1} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.merge.btn") }));
    await flush();
    // MUTATION (p2h-cx3/merge-read-one-key): one register entry for every table — table 5's merge
    // waits on (and would list) table 4's candidates; red.
    expect(getMergeCandidates).toHaveBeenLastCalledWith("s2");
    expect(screen.getByRole("button", { name: /^Table 9/ })).toBeTruthy();
  });
});

describe("MergeTableButton — the merge is bounded, its controls aria-disabled", () => {
  it("while the merge is out Back and Merge are aria-disabled (never native); at the bound they free and the line says 'no answer yet' with the reload", async () => {
    hung(mergeTables);
    mount();
    await toMerge();
    const back = screen.getByRole("button", { name: ts("en", "settle.back") });
    // MUTATION (p2h-doors/merge-back-native-disabled): Back natively disabled while the merge is
    // out — focus drops to <body> under the tap; red.
    expect(back.getAttribute("aria-disabled")).toBe("true");
    expect(document.querySelectorAll("[disabled]")).toHaveLength(0);
    fireEvent.click(back); // refused in the handler while busy
    expect(screen.getByRole("group", { name: /merge/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Merging…" }).getAttribute("aria-busy")).toBe("true");
    await flush(STAFF_HANG_MS - 1);
    expect(screen.getByRole("button", { name: "Merging…" })).toBeTruthy();
    // MUTATION (p2h-doors/merge-unbounded): the bound never fires — "Merging…" holds with Back
    // refused for as long as the queue is stuck; red.
    await flush(1);
    expect(back.getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByRole("button", { name: "Merge into Table 9" })).toBeTruthy();
    // MUTATION (p2h-doors/merge-waiting-unsaid): the bound passes in silence; red.
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.merge.waiting"));
    // MUTATION (p2h-doors/merge-reload-missing): "reload the page" with no reload; red.
    expect(reload()).not.toBeNull();
    expect(screen.getByRole("alert").contains(reload())).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("while the merge waits no merge goes: Merge and the trigger are held, and Back / Cancel keep the waiting line (S2 critic D3)", async () => {
    const h = hung(mergeTables);
    mount();
    await toMerge();
    await flush(STAFF_HANG_MS);
    const merge = screen.getByRole("button", { name: "Merge into Table 9" });
    // MUTATION (p2h-doors/merge-waiting-merge-live): Merge looks ready under "don't merge again";
    // red.
    expect(merge.getAttribute("aria-disabled")).toBe("true");
    // MUTATION (p2h-doors/merge-waiting-retap-dispatches): the guard frees at the bound — a second
    // merge queues behind the stuck one; red.
    await act(async () => {
      fireEvent.click(merge);
    });
    expect(mergeTables).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.back") }));
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.cancel") }));
    // MUTATION (p2h-doors/merge-cancel-drops-waiting): Cancel wipes the one true sentence — the
    // merge may still land, and nothing on screen says so; red.
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.merge.waiting"));
    const trigger = screen.getByRole("button", { name: ts("en", "settle.merge.btn") });
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(trigger.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
    fireEvent.click(trigger);
    expect(screen.queryByRole("group")).toBeNull();
    // A late refusal frees it: the trigger is the way forward again.
    await act(async () => h.answer({ ok: false, error: "That table is mid-payment." }));
    // MUTATION (p2h-doors/merge-waiting-never-clears): the guard outlives its answer; red.
    expect(trigger.getAttribute("aria-disabled")).toBeNull();
    getMergeCandidates.mockResolvedValueOnce([T9]);
    fireEvent.click(trigger);
    await flush();
    expect(screen.getByRole("group")).toBeTruthy();
  });

  it("a LATE merge lands: the page goes to the table that received the order", async () => {
    const h = hung(mergeTables);
    mount();
    await toMerge();
    await flush(STAFF_HANG_MS);
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.merge.waiting"));
    // MUTATION (p2h-doors/merge-late-ok-dropped): the late answer is dropped — this table WAS
    // closed into Table 9 and its defunct detail stays up under "no answer yet"; red.
    await act(async () => h.answer({ ok: true, targetSessionId: "s9", movedCount: 3 }));
    expect(replace).toHaveBeenCalledWith("/staff/table/s9");
  });

  it("a LATE merge from a detail that is GONE navigates nowhere", async () => {
    const h = hung(mergeTables);
    const r = mount();
    await toMerge();
    await flush(STAFF_HANG_MS);
    r.unmount();
    // MUTATION (p2h-doors/merge-late-lands-after-unmount): the late merge replaces the route from a
    // detail nobody is looking at; red.
    await act(async () => h.answer({ ok: true, targetSessionId: "s9", movedCount: 3 }));
    expect(replace).not.toHaveBeenCalled();
  });

  it("a LATE throw says 'couldn't confirm' over the waiting line", async () => {
    const h = hung(mergeTables);
    mount();
    await toMerge();
    await flush(STAFF_HANG_MS);
    // MUTATION (p2h-doors/merge-late-throw-unsaid): "no answer yet" stands for good; red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.merge.unknown"));
    expect(reload()).toBeNull();
  });

  it("a THROWN merge says 'couldn't confirm' — the tables may already be merged — and frees the controls", async () => {
    const h = hung(mergeTables);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    await toMerge();
    // MUTATION (p2h-doors/merge-threw-unsaid): the lost answer is said as nothing (before: the
    // rejection reached the error boundary over the whole detail); red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.merge.unknown"));
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("an answer inside the bound: a refusal reads the server's sentence (OutageText), offers no reload, and nothing was ever natively disabled", async () => {
    const h = hung(mergeTables);
    mount();
    await toMerge();
    expect(document.querySelectorAll("[disabled]")).toHaveLength(0);
    await flush(STAFF_HANG_MS - 1);
    await act(async () => h.answer({ ok: false, error: "That table is mid-payment." }));
    expect(screen.getByRole("alert").textContent).toBe("That table is mid-payment.");
    expect(reload()).toBeNull();
    // The bound's timer is cleared by the answer: nothing turns into "no answer yet" later.
    await flush(1);
    expect(screen.getByRole("alert").textContent).toBe("That table is mid-payment.");
  });

  it("speaks Burmese on a Burmese tablet — the waiting line is the dictionary's, never English", async () => {
    hung(mergeTables);
    mount("my");
    getMergeCandidates.mockResolvedValueOnce([T9]);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /9/ }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button").at(-1)!);
    });
    await flush(STAFF_HANG_MS);
    const alert = screen.getByRole("alert");
    expect(alert.querySelector('[lang="my"]')?.textContent).toBe(ts("my", "settle.merge.waiting"));
    expect(alert.textContent).not.toContain(ts("en", "settle.merge.waiting"));
  });
});
