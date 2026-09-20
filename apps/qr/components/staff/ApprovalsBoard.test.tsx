/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApprovalsPoll, PendingApproval, RefundNeeded } from "@/lib/approvals";
import type { Approver } from "@/lib/voids";
import { STAFF } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";

/**
 * A4·3 (Codex round 1 on #283) — the approvals zone's WIRING, which has nowhere else to live: the
 * 5 s poll must carry a readable queue even while the approver ROSTER keeps failing (P1 — coupled in
 * one `Promise.all`, a roster outage hid every new request behind the initial "all clear" for as
 * long as it lasted), and a same-page jump to `#appr-h` must move focus, not only the scroll (P2).
 */
let approvalsAnswer: () => Promise<PendingApproval[]> = () => Promise.resolve([]);
// M34 — the poll answers with a VERDICT. By default it wraps `approvalsAnswer` so a rejection there
// is still a CLIENT-side throw (the `unknown` miss the older cases pin); the new cases set it
// directly to the server's own `signin` / `outage` verdicts.
let pollAnswer: () => Promise<ApprovalsPoll> = () =>
  approvalsAnswer().then((rows) => ({ ok: true, rows }));
let rosterAnswer: () => Promise<Approver[]> = () => Promise.resolve([]);
let refundsAnswer: () => Promise<RefundNeeded[]> = () => Promise.resolve([]);
let resolveAnswer: () => Promise<void> = () => Promise.resolve();
const resolved: string[] = [];
vi.mock("@/lib/approvals", () => ({
  pollPendingApprovals: () => pollAnswer(),
  listRefundsNeeded: () => refundsAnswer(),
  resolveApproval: () => Promise.resolve({ ok: false, reason: "error" }),
  resolveRefundNeeded: (id: string) => {
    resolved.push(id);
    return resolveAnswer();
  },
}));
vi.mock("@/lib/voids", () => ({ listApprovers: () => rosterAnswer() }));
// M34 — the exit, pinned through its one module: jsdom cannot navigate, and its "not implemented"
// report goes to a console the test cannot spy on.
const leaveForLogin = vi.fn();
const leaveForHome = vi.fn();
vi.mock("@/lib/staff-leave", () => ({
  leaveForLogin: () => leaveForLogin(),
  leaveForHome: () => leaveForHome(),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { ApprovalsBoard } = await import("./ApprovalsBoard");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  approvalsAnswer = () => Promise.resolve([]);
  pollAnswer = () => approvalsAnswer().then((rows) => ({ ok: true, rows }));
  rosterAnswer = () => Promise.resolve([]);
  refundsAnswer = () => Promise.resolve([]);
  resolveAnswer = () => Promise.resolve();
  resolved.length = 0;
});

const refundNeeded = (id: string): RefundNeeded => ({
  id,
  paymentIntent: `pi_${id}`,
  cartId: null,
  amountCents: 1250,
  reason: "capture_after_destroy",
  createdAt: "2026-09-13T18:41:00Z",
});

const pending = (id: string): PendingApproval => ({
  id,
  kind: "void",
  lineName: "Mohinga",
  qty: 1,
  amountCents: 1200,
  reasonCode: "guest_request",
  cooked: false,
  sessionId: null,
  tableLabel: "T4",
  initiatorName: "Aye",
  createdAt: "2026-09-13T18:41:00Z",
});

function mount(
  initial: PendingApproval[],
  approvers: Approver[] | null,
  initialRefunds: RefundNeeded[] | null = [],
) {
  return render(
    <StaffLangProvider lang="en">
      <ApprovalsBoard initial={initial} approvers={approvers} initialRefunds={initialRefunds} />
    </StaffLangProvider>,
  );
}
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
/** manager-3 — marking is TWO taps: the row's trigger opens the confirm group, its yes-verb commits. */
const confirmName = STAFF["table.appr.verb.markRefunded.confirm"].en;
async function markRefunded(pi: RegExp) {
  await act(async () => {
    screen.getByRole("button", { name: pi }).click();
  });
  await act(async () => {
    screen.getByRole("button", { name: confirmName }).click();
  });
}

describe("ApprovalsBoard — the poll and the jump", () => {
  it("a roster that keeps failing does not hide the queue: the poll still lands new requests", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    rosterAnswer = () => Promise.reject(new Error("roster down"));
    approvalsAnswer = () => Promise.resolve([pending("r1")]);
    mount([], null);
    expect(screen.getByText(STAFF["table.appr.allclear"].en)).toBeTruthy();
    await tick(5_000);
    // The queue read succeeded: the request is on the board and the count says so — the roster's
    // failure is logged, not fatal.
    expect(screen.getByText(tf("en", "table.appr.waiting", { n: 1 }))).toBeTruthy();
    expect(screen.getByText(/Mohinga/)).toBeTruthy();
    expect(screen.queryByText(STAFF["table.appr.allclear"].en)).toBeNull();
    expect(console.error).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("the refunds-needed ledger rides the poll: a row the webhook writes after load reaches the tablet (Codex round 2 on #283, P1)", async () => {
    vi.useFakeTimers();
    mount([], []);
    expect(screen.queryByText(tf("en", "table.appr.refunds.one", { n: 1 }))).toBeNull();
    refundsAnswer = () => Promise.resolve([refundNeeded("r-1")]);
    await tick(5_000);
    expect(screen.getByText(tf("en", "table.appr.refunds.one", { n: 1 }))).toBeTruthy();
    expect(screen.getByText(/pi_r-1/)).toBeTruthy();
  });

  it("a ledger read that fails keeps the last good strip, and one that never loaded says so", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    refundsAnswer = () => Promise.reject(new Error("ledger down"));
    mount([], [], [refundNeeded("r-1")]);
    await tick(5_000);
    expect(screen.getByText(/pi_r-1/)).toBeTruthy(); // the last good rows stay
    expect(screen.queryByText(STAFF["table.appr.refunds.outage"].en)).toBeNull();
    cleanup();
    mount([], [], null);
    expect(screen.getByText(STAFF["table.appr.refunds.outage"].en)).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("an approvals-table outage does not discard a good ledger read beside it (Codex round 3 on #283, P1)", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    approvalsAnswer = () => Promise.reject(new Error("queue down"));
    refundsAnswer = () => Promise.resolve([refundNeeded("r-1")]);
    mount([], [], []);
    await tick(5_000);
    expect(screen.getByText(/pi_r-1/)).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("a ledger read that fails AFTER a good one says so — an empty strip never reads as all-clear over a feed it cannot hear (Codex round 3 on #283, P1)", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount([], [], []); // loaded once, empty
    expect(screen.queryByText(STAFF["table.appr.refunds.stale"].en)).toBeNull();
    refundsAnswer = () => Promise.reject(new Error("ledger down"));
    await tick(5_000);
    expect(screen.getByText(STAFF["table.appr.refunds.stale"].en)).toBeTruthy();
    // A good read clears it again.
    refundsAnswer = () => Promise.resolve([]);
    await tick(5_000);
    expect(screen.queryByText(STAFF["table.appr.refunds.stale"].en)).toBeNull();
    vi.restoreAllMocks();
  });

  it("a row resolved while a poll is in flight does not come back on that poll's older answer (Codex round 3 on #283, P1)", async () => {
    vi.useFakeTimers();
    let release: ((rows: RefundNeeded[]) => void) | null = null;
    refundsAnswer = () =>
      new Promise<RefundNeeded[]>((r) => {
        release = r;
      });
    mount([], [], [refundNeeded("r-1")]);
    await tick(5_000); // the poll is in flight; its ledger read has not answered
    expect(release).not.toBeNull();
    await markRefunded(/pi_r-1/);
    await act(async () => {});
    expect(resolved).toEqual(["r-1"]);
    expect(screen.queryByText(/pi_r-1/)).toBeNull();
    // The OLDER read lands, still listing the row the server has since confirmed resolved.
    await act(async () => release!([refundNeeded("r-1")]));
    expect(screen.queryByText(/pi_r-1/)).toBeNull();
  });

  it("a resolve the server refuses keeps the row and says so in place — the screen stays up (Codex round 4 on #283, P1)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    resolveAnswer = () => Promise.reject(new Error("We can’t reach the ordering system right now"));
    mount([], [], [refundNeeded("r-1")]);
    await markRefunded(/pi_r-1/);
    await waitFor(() => expect(resolved).toEqual(["r-1"]));
    await screen.findByText(STAFF["table.appr.msg.failed"].en);
    expect(screen.getByText(/pi_r-1/)).toBeTruthy(); // the row stays — nothing was recorded
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy(); // the zone is still mounted
    vi.restoreAllMocks();
  });

  it("marking a row refunded removes it once the server has confirmed — never before", async () => {
    mount([], [], [refundNeeded("r-1")]);
    await markRefunded(/pi_r-1/);
    await waitFor(() => expect(resolved).toEqual(["r-1"]));
    await waitFor(() => expect(screen.queryByText(/pi_r-1/)).toBeNull());
  });

  it("manager-3 — the FIRST tap resolves nothing: it opens a confirm naming the amount, with focus inside; Cancel hands focus back to the trigger", async () => {
    mount([], [], [refundNeeded("r-1")]);
    const trigger = screen.getByRole("button", { name: /pi_r-1/ });
    await act(async () => {
      trigger.click();
    });
    // MUTATION: resolve on the first tap (the old one-tap shape) — `resolved` is non-empty, red.
    expect(resolved).toEqual([]);
    const group = screen.getByRole("group", {
      name: tf("en", "table.appr.a11y.confirmRefunded", { x: "pi_r-1" }),
    });
    expect(group.textContent).toContain(
      tf("en", "table.appr.confirmRefunded.q", { m: "$12.50", x: STAFF["table.appr.stripe"].en }),
    );
    expect(document.activeElement).toBe(group);
    await act(async () => {
      screen.getByRole("button", { name: STAFF["settle.cancel"].en }).click();
    });
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /pi_r-1/ }));
    expect(resolved).toEqual([]);
  });

  it("manager-3 (§17) — the commit is aria-disabled + busy while it runs, never native, and says a stated word", async () => {
    let release: (() => void) | null = null;
    resolveAnswer = () =>
      new Promise<void>((r) => {
        release = r;
      });
    mount([], [], [refundNeeded("r-1")]);
    await act(async () => {
      screen.getByRole("button", { name: /pi_r-1/ }).click();
    });
    const yes = screen.getByRole("button", { name: confirmName }) as HTMLButtonElement;
    await act(async () => {
      yes.click();
    });
    expect(resolved).toEqual(["r-1"]);
    expect(yes.disabled).toBe(false);
    expect(yes.getAttribute("aria-disabled")).toBe("true");
    expect(yes.getAttribute("aria-busy")).toBe("true");
    expect(yes.textContent).toContain(STAFF["table.appr.marking"].en);
    // A second tap mid-flight resolves nothing more.
    await act(async () => {
      yes.click();
    });
    expect(resolved).toEqual(["r-1"]);
    await act(async () => {
      release!();
    });
    await waitFor(() => expect(screen.queryByText(/pi_r-1/)).toBeNull());
  });

  it("M34 — a `signin` verdict leaves for the login instead of freezing as 'not updating'", async () => {
    vi.useFakeTimers();
    pollAnswer = () => Promise.resolve({ ok: false, reason: "signin" });
    mount([pending("r1")], []);
    await tick(5_000);
    // MUTATION: treat `signin` as a miss — no exit, and after two misses the frozen copy instead.
    expect(leaveForLogin).toHaveBeenCalledTimes(1);
    await tick(5_000);
    expect(screen.queryByText(new RegExp(STAFF["out.head.notUpdating"].en))).toBeNull();
    expect(screen.queryByText(new RegExp(STAFF["out.head.cant"].en))).toBeNull();
    leaveForLogin.mockClear();
  });

  it("M34 — a `role` verdict (still signed in, no longer a manager) leaves for the counter, not the login", async () => {
    vi.useFakeTimers();
    pollAnswer = () => Promise.resolve({ ok: false, reason: "role" });
    mount([pending("r1")], []);
    await tick(5_000);
    // MUTATION: fold `role` into the signin arm — a demoted manager lands on their own profile.
    expect(leaveForHome).toHaveBeenCalledTimes(1);
    expect(leaveForLogin).not.toHaveBeenCalled();
    leaveForHome.mockClear();
  });

  it("manager-3 — opening a second row's confirm straight from an open one moves focus into the NEW group (the blind pass's interleaving)", async () => {
    mount([], [], [refundNeeded("r-1"), refundNeeded("r-2")]);
    await act(async () => {
      screen.getByRole("button", { name: /pi_r-1/ }).click();
    });
    expect(document.activeElement?.id).toBe("refund-confirm-r-1");
    await act(async () => {
      screen.getByRole("button", { name: /pi_r-2/ }).click();
    });
    // MUTATION: `confirming !== null && prev === null` — an id→id switch focuses nothing, red.
    expect(document.activeElement?.id).toBe("refund-confirm-r-2");
    expect(document.getElementById("refund-confirm-r-1")).toBeNull();
    expect(resolved).toEqual([]);
  });

  it("manager-3 — a poll that drops the row whose confirm is open lands focus on the strip, and the next open still takes focus", async () => {
    vi.useFakeTimers();
    let rows = [refundNeeded("r-1"), refundNeeded("r-2")];
    refundsAnswer = () => Promise.resolve(rows);
    mount([], [], rows);
    await act(async () => {
      screen.getByRole("button", { name: /pi_r-1/ }).click();
    });
    expect(document.activeElement?.id).toBe("refund-confirm-r-1");
    // The other tablet marked r-1: the next poll no longer lists it.
    rows = [refundNeeded("r-2")];
    await tick(5_000);
    expect(screen.queryByText(/pi_r-1/)).toBeNull();
    // MUTATION: read the raw `confirmingId` instead of the derived `confirming` — focus is <body>
    // here, and the open below never focuses its group.
    expect(document.activeElement).toBe(screen.getByRole("region", { name: /refund/i }));
    await act(async () => {
      screen.getByRole("button", { name: /pi_r-2/ }).click();
    });
    expect(document.activeElement?.id).toBe("refund-confirm-r-2");
  });

  it("M34 — an `outage` verdict freezes the queue as a KNOWN outage after two misses, not as 'not updating'", async () => {
    vi.useFakeTimers();
    pollAnswer = () => Promise.resolve({ ok: false, reason: "outage" });
    mount([pending("r1")], []);
    await tick(5_000);
    await tick(5_000);
    // MUTATION: `nextDegraded(d, "unknown", …)` on the outage arm — the copy says "not updating".
    expect(screen.getByText(new RegExp(STAFF["out.head.cant"].en))).toBeTruthy();
    expect(screen.queryByText(new RegExp(STAFF["out.head.notUpdating"].en))).toBeNull();
    // The last good queue stays on the board.
    expect(screen.getByText(/Mohinga/)).toBeTruthy();
  });

  it("manager-4 — Approve moves focus into the confirm form; Cancel hands it back to Approve", async () => {
    const approver: Approver = { staffId: "m1", displayName: "Daw Aye" } as Approver;
    mount([pending("r1")], [approver]);
    const approve = screen.getByRole("button", { name: /Approve/ });
    await act(async () => {
      approve.click();
    });
    // MUTATION: drop the effect — focus stays on <body> after the button unmounts.
    expect(document.activeElement?.tagName).toBe("FORM");
    expect(document.activeElement?.getAttribute("aria-labelledby")).toBe("appr-q-r1");
    await act(async () => {
      screen.getByRole("button", { name: STAFF["table.appr.verb.cancel"].en }).click();
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Approve/ }));
  });

  it("a same-page jump to the zone's fragment moves focus to its heading, not only the scroll", async () => {
    mount([], []);
    expect(document.activeElement?.id).not.toBe("appr-h");
    window.location.hash = "#appr-h";
    await waitFor(() => expect(document.activeElement?.id).toBe("appr-h"));
    window.location.hash = "";
  });
});
