/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PendingApproval } from "@/lib/approvals";
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
vi.mock("@/lib/approvals", () => ({
  listPendingApprovals: () => approvalsAnswer(),
  resolveApproval: () => Promise.resolve({ ok: false, reason: "error" }),
}));
vi.mock("@/lib/voids", () => ({ listApprovers: () => rosterAnswer() }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { ApprovalsBoard } = await import("./ApprovalsBoard");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  approvalsAnswer = () => Promise.resolve([]);
  rosterAnswer = () => Promise.resolve([]);
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

function mount(initial: PendingApproval[], approvers: Approver[] | null) {
  return render(
    <StaffLangProvider lang="en">
      <ApprovalsBoard initial={initial} approvers={approvers} />
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

  it("a same-page jump to the zone's fragment moves focus to its heading, not only the scroll", async () => {
    mount([], []);
    expect(document.activeElement?.id).not.toBe("appr-h");
    window.location.hash = "#appr-h";
    await waitFor(() => expect(document.activeElement?.id).toBe("appr-h"));
    window.location.hash = "";
  });
});
