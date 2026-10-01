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
