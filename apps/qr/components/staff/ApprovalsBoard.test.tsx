/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PendingApproval, RefundNeeded } from "@/lib/approvals";
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
let rosterAnswer: () => Promise<Approver[]> = () => Promise.resolve([]);
let refundsAnswer: () => Promise<RefundNeeded[]> = () => Promise.resolve([]);
const resolved: string[] = [];
vi.mock("@/lib/approvals", () => ({
  listPendingApprovals: () => approvalsAnswer(),
  listRefundsNeeded: () => refundsAnswer(),
  resolveApproval: () => Promise.resolve({ ok: false, reason: "error" }),
  resolveRefundNeeded: (id: string) => {
    resolved.push(id);
    return Promise.resolve();
  },
}));
vi.mock("@/lib/voids", () => ({ listApprovers: () => rosterAnswer() }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { ApprovalsBoard } = await import("./ApprovalsBoard");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  approvalsAnswer = () => Promise.resolve([]);
  rosterAnswer = () => Promise.resolve([]);
  refundsAnswer = () => Promise.resolve([]);
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
    await act(async () => {
      screen.getByRole("button", { name: /pi_r-1/ }).click();
    });
    await act(async () => {});
    expect(resolved).toEqual(["r-1"]);
    expect(screen.queryByText(/pi_r-1/)).toBeNull();
    // The OLDER read lands, still listing the row the server has since confirmed resolved.
    await act(async () => release!([refundNeeded("r-1")]));
    expect(screen.queryByText(/pi_r-1/)).toBeNull();
  });

  it("marking a row refunded removes it once the server has confirmed — never before", async () => {
    mount([], [], [refundNeeded("r-1")]);
    const btn = screen.getByRole("button", { name: /pi_r-1/ });
    btn.click();
    await waitFor(() => expect(resolved).toEqual(["r-1"]));
    await waitFor(() => expect(screen.queryByText(/pi_r-1/)).toBeNull());
  });

  it("a same-page jump to the zone's fragment moves focus to its heading, not only the scroll", async () => {
    mount([], []);
    expect(document.activeElement?.id).not.toBe("appr-h");
    window.location.hash = "#appr-h";
    await waitFor(() => expect(document.activeElement?.id).toBe("appr-h"));
    window.location.hash = "";
  });
});
