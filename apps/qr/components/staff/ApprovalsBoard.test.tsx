/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
// Phase 2h — the decision's own action, each case's to hang, throw or answer.
type ResolveResult =
  | { ok: true; decision: "approve" | "deny" | "close" }
  | { ok: false; reason: string };
const resolveApproval = vi.fn(
  (): Promise<ResolveResult> => Promise.resolve({ ok: false, reason: "error" }),
);
const resolved: string[] = [];
vi.mock("@/lib/approvals", () => ({
  pollPendingApprovals: () => pollAnswer(),
  listRefundsNeeded: () => refundsAnswer(),
  resolveApproval: (...a: unknown[]) => resolveApproval(...(a as [])),
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
  resolveApproval.mockReset();
  resolveApproval.mockImplementation(() => Promise.resolve({ ok: false, reason: "error" }));
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
  tableNumber: 4,
  nameMy: null,
  initiatorName: "Aye",
  initiatorStaffId: "aye",
  cartStatus: "open",
  lineNow: { qty: 1, unitPriceCents: 1200 },
  lineId: "l1",
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
    // Phase 2h (9e) — a THROWN mark is a lost answer: "couldn't confirm it was marked done", never
    // "nothing was recorded" (the update may have run before the response was lost).
    await screen.findByText(STAFF["table.appr.refunds.markUnknown"].en);
    expect(screen.getByText(/pi_r-1/)).toBeTruthy(); // the row stays until a read says otherwise
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

  it("manager-4 · PD8 — Decide moves focus to the PIN (the one eligible signer arrives lit); Cancel hands it back to Decide; Enter in the PIN never decides", async () => {
    const approver: Approver = {
      staffId: "m1",
      displayName: "Daw Aye",
      role: "manager",
      active: true,
      hasPin: true,
      self: false,
    };
    mount([pending("r1")], [approver]);
    const decide = screen.getByRole("button", { name: /^Decide/ });
    await act(async () => {
      decide.click();
    });
    // MUTATION: drop the effect — focus stays on <body> after the button unmounts.
    const pin = document.getElementById("appr-r1-pin") as HTMLInputElement;
    expect(document.activeElement).toBe(pin);
    expect(pin.closest("form")?.getAttribute("aria-labelledby")).toBe("appr-q-r1");
    // Exactly one eligible arrives lit, and the PIN field is labelled with the person.
    expect(screen.getByRole("button", { name: /Daw Aye/, pressed: true })).toBeTruthy();
    expect(screen.getByLabelText(tf("en", "pin.yourPin", { x: "Daw Aye" }))).toBe(pin);
    // Two keys share the field: Enter asks for one, it never approves on its own.
    await act(async () => {
      fireEvent.change(pin, { target: { value: "1234" } });
    });
    await act(async () => {
      fireEvent.submit(pin.closest("form")!);
    });
    expect(resolveApproval).not.toHaveBeenCalled();
    expect(document.getElementById("appr-msg-r1")!.textContent).toBe(
      STAFF["table.appr.chooseKey"].en,
    );
    await act(async () => {
      screen.getByRole("button", { name: STAFF["table.appr.verb.cancel"].en }).click();
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Decide/ }));
  });

  it("a same-page jump to the zone's fragment moves focus to its heading, not only the scroll", async () => {
    mount([], []);
    expect(document.activeElement?.id).not.toBe("appr-h");
    window.location.hash = "#appr-h";
    await waitFor(() => expect(document.activeElement?.id).toBe("appr-h"));
    window.location.hash = "";
  });
});

// ── Phase 2h — a hung tablet never traps the approvals zone (P2cz · P2fc) ─────────────────────────
const { STAFF_HANG_MS, outstanding, stalledSince, youngWrite } =
  await import("@/lib/bounded-write");

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

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}

describe("Phase 2i — the zone's three reads are READs on the ledger", () => {
  it.each(["queue", "who", "ledger"] as const)(
    "the %s read in flight never reads as a young write — a reload for a new build is not refused for it",
    async (which) => {
      vi.useFakeTimers();
      if (which === "queue") pollAnswer = () => new Promise(() => {});
      if (which === "who") rosterAnswer = () => new Promise(() => {});
      if (which === "ledger") refundsAnswer = () => new Promise(() => {});
      mount([], null);
      await tick(5_000);
      expect(outstanding()).toBeGreaterThan(0);
      // MUTATION (p2i-kind/approvals-queue · approvals-who · approvals-ledger): that read's race
      // labels it a write — the approvals board refuses a reload as "still saving"; red.
      expect(youngWrite()).toBe(false);
    },
  );
});

describe("Phase 2h (9f) — the zone's poll never stacks reads behind a hung one", () => {
  it("a queue read hung for 60 s is ONE dispatch; the second miss arms the freeze; the answer kicks exactly one owed tick", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hung = deferred<ApprovalsPoll>();
    const polls = vi
      .fn<() => Promise<ApprovalsPoll>>()
      .mockReturnValueOnce(hung.promise)
      .mockImplementation(() => Promise.resolve({ ok: true, rows: [pending("r1")] }));
    pollAnswer = polls;
    mount([pending("r1")], []);
    await tick(5_000);
    expect(polls).toHaveBeenCalledTimes(1);
    const frozen = () => screen.queryByText(new RegExp(STAFF["out.head.notUpdating"].en));
    await tick(14_998);
    expect(frozen()).toBeNull();
    // MUTATION (p2h-boards/approvals/refused-tick-never-a-miss): only the race's one miss counts; red.
    await tick(5_001);
    expect(frozen()).not.toBeNull();
    // ONE tick's reads in the air the whole minute — never three more behind the hung one each tick.
    // MUTATION (p2h-boards/approvals/poll-stacks · approvals/gate-watches-nothing); red.
    await tick(38_000);
    expect(polls).toHaveBeenCalledTimes(1);
    // MUTATION (p2h-boards/approvals/owed-read-never-kicked): nothing reads until the next tick; red.
    await act(async () => {
      hung.resolve({ ok: true, rows: [pending("r1")] });
    });
    await tick(0);
    expect(polls).toHaveBeenCalledTimes(2);
    expect(frozen()).toBeNull();
    await tick(1_000);
    expect(polls).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
});

describe("Phase 2h (9b · 9d · 9e) — the decision is bounded, caught, and refused while the tablet is stuck", () => {
  const approver: Approver = {
    staffId: "m1",
    displayName: "Daw Aye",
    role: "manager",
    active: true,
    hasPin: true,
    self: false,
  };
  const region = () => document.getElementById("appr-msg-r1")!;
  const reload = () => screen.queryByRole("button", { name: STAFF["out.reload"].en });
  /** Decide, then type a PIN (the one eligible signer is already lit) — the Approve key, live. */
  async function ready() {
    await act(async () => {
      screen.getByRole("button", { name: /^Decide/ }).click();
    });
    await act(async () => {
      fireEvent.change(document.getElementById("appr-r1-pin")!, { target: { value: "1234" } });
    });
    return approveKey();
  }
  /** The Approve key, by its name — stable while it reads "Working…" (the name is the verb's). */
  const approveKey = () => screen.getByRole("button", { name: /^Approve/ }) as HTMLButtonElement;

  it("a decision with no answer frees its button AT the bound, says so with a Reload, and the late refusal is said", async () => {
    vi.useFakeTimers();
    pollAnswer = () => new Promise(() => {}); // the case is about the write
    const write = deferred<ResolveResult>();
    resolveApproval.mockImplementationOnce(() => write.promise);
    mount([pending("r1")], [approver]);
    const confirm = await ready();
    await act(async () => {
      confirm.click();
    });
    const submit = approveKey;
    expect(submit().getAttribute("aria-busy")).toBe("true");
    await tick(STAFF_HANG_MS - 1);
    expect(submit().getAttribute("aria-busy")).toBe("true");
    // MUTATION (p2h-boards/approvals/resolve-transition — the old startTransition): pending holds
    // until the action answers; red.
    await tick(1);
    expect(submit().getAttribute("aria-busy")).toBeNull();
    expect(region().textContent).toBe(STAFF["table.appr.msg.waiting"].en);
    // MUTATION (p2h-boards/approvals/waiting-offers-no-reload): no button beside the region; red.
    expect(reload()).not.toBeNull();
    expect(region().contains(reload())).toBe(false);
    // The PIN is cleared — a second decision is what the sentence says not to make.
    // MUTATION (p2h-boards/approvals/pin-kept-on-waiting): the PIN stays typed in; red.
    expect((document.getElementById("appr-r1-pin") as HTMLInputElement).value).toBe("");
    // The LATE refusal is said (9e). MUTATION (p2h-boards/approvals/late-answer-dropped): the waiting
    // line stands for good; red.
    await act(async () => {
      write.resolve({ ok: false, reason: "not_open" });
    });
    await tick(0);
    expect(region().textContent).toBe(STAFF["table.appr.msg.notOpen"].en);
    expect(reload()).toBeNull();
  });

  it("a decision whose action THROWS says 'couldn't confirm' — it no longer reaches an error boundary", async () => {
    vi.useFakeTimers();
    pollAnswer = () => new Promise(() => {});
    resolveApproval.mockImplementationOnce(() => Promise.reject(new Error("Failed to fetch")));
    mount([pending("r1")], [approver]);
    const confirm = await ready();
    // MUTATION (p2h-boards/approvals/threw-uncaught): the rejection escapes the handler; red.
    await act(async () => {
      confirm.click();
    });
    await tick(0);
    expect(region().textContent).toBe(STAFF["table.appr.msg.unknown"].en);
    expect(screen.getByText(/Mohinga/)).toBeTruthy(); // the zone is still up
  });

  it("while an earlier action has gone unanswered past the bound, the decision is REFUSED at the tap — never sent", async () => {
    vi.useFakeTimers();
    // A poll read hung on this tab (the stall ledger is per tab — any action counts).
    pollAnswer = () => new Promise(() => {});
    mount([pending("r1")], [approver]);
    await tick(5_000); // the poll goes out, and hangs
    await tick(STAFF_HANG_MS);
    expect(stalledSince()).not.toBeNull();
    const confirm = await ready();
    await act(async () => {
      confirm.click();
    });
    // MUTATION (p2h-boards/approvals/stalled-dispatches): the decision is sent into the stuck queue; red.
    expect(resolveApproval).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["out.stalled"].en);
    expect(reload()).not.toBeNull();
  });

  it("its OWN decision still out past the bound: the PIN typed again and the tap refused — never sent — in the card's own words ('don't decide again'), with the Reload (owner decision)", async () => {
    vi.useFakeTimers();
    pollAnswer = () => new Promise(() => {});
    resolveApproval.mockImplementationOnce(() => new Promise<ResolveResult>(() => {}));
    mount([pending("r1")], [approver]);
    const confirm = await ready();
    await act(async () => {
      confirm.click();
    });
    await tick(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.appr.msg.waiting"].en);
    // The PIN was cleared at the bound; typed again, the form is live and the tap reaches the guard.
    await act(async () => {
      fireEvent.change(document.getElementById("appr-r1-pin")!, { target: { value: "1234" } });
    });
    expect(region().textContent).toBe(STAFF["table.appr.msg.waiting"].en);
    const said = watchRegion(region());
    await act(async () => {
      approveKey().click();
    });
    expect(resolveApproval).toHaveBeenCalledTimes(1);
    // Critic F1 — RE-SAID, not left standing: the line already stood in the card's region (typing
    // the PIN does not clear it), and equal text re-rendered in place is no DOM change — nothing
    // announced, nothing seen, a dead tap.
    // MUTATION (p2h-int-c/approvals/resay-unkeyed · p2h-int-c/approvals/refusal-unsaid): red.
    expect(said()).toBe(true);
    // MUTATION (p2h-int-c/approvals/own-wait-said-as-stalled): its own decision IS the stall, but
    // "this did nothing" drops "Don't decide again" — a dish removed or given away twice; red.
    expect(region().textContent).toBe(STAFF["table.appr.msg.waiting"].en);
    expect(reload()).not.toBeNull();
  });
  it("a LATE ok retires 'no answer yet' — it never stands over a recorded decision without its Reload (critic B2)", async () => {
    vi.useFakeTimers();
    pollAnswer = () => new Promise(() => {}); // the queue's re-read hangs: the card stays up
    const write = deferred<ResolveResult>();
    resolveApproval.mockImplementationOnce(() => write.promise);
    mount([pending("r1")], [approver]);
    const confirm = await ready();
    await act(async () => {
      confirm.click();
    });
    await tick(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.appr.msg.waiting"].en);
    await act(async () => {
      write.resolve({ ok: true, decision: "approve" });
    });
    await tick(0);
    // MUTATION (p2h-boards/approvals/late-ok-keeps-waiting): the waiting line ("…reload the page to
    // see") stands with its Reload gone, for as long as the queue's re-read takes; red.
    expect(region().textContent).toBe("");
    expect(reload()).toBeNull();
  });

  it("while the decision's answer is still owed, Cancel refuses — the late refusal is said in the form that asked (critic B3)", async () => {
    vi.useFakeTimers();
    pollAnswer = () => new Promise(() => {});
    const write = deferred<ResolveResult>();
    resolveApproval.mockImplementationOnce(() => write.promise);
    mount([pending("r1")], [approver]);
    const confirm = await ready();
    await act(async () => {
      confirm.click();
    });
    await tick(STAFF_HANG_MS);
    const cancelBtn = screen.getByRole("button", { name: STAFF["table.appr.verb.cancel"].en });
    // MUTATION (p2h-boards/approvals/cancel-while-owed · approvals/cancel-owed-not-said): Cancel acts —
    // the form (the card's only region, and its Reload) unmounts, and the late refusal has nowhere
    // to be said (or, re-opened, reads as the answer to the new attempt); red.
    expect(cancelBtn.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      cancelBtn.click();
    });
    expect(document.getElementById("appr-msg-r1")).not.toBeNull();
    await act(async () => {
      write.resolve({ ok: false, reason: "pin_wrong" });
    });
    await tick(0);
    expect(region().textContent).not.toBe(STAFF["table.appr.msg.waiting"].en);
    expect(region().textContent).not.toBe("");
    // Answered: Cancel acts again (MUTATION p2h-boards/approvals/owed-never-cleared — it never does; red).
    expect(cancelBtn.getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      cancelBtn.click();
    });
    expect(document.getElementById("appr-msg-r1")).toBeNull();
  });

  it("a late answer on a zone that is GONE starts no read (critic B4)", async () => {
    vi.useFakeTimers();
    let polls = 0;
    pollAnswer = () => {
      polls += 1;
      return Promise.resolve({ ok: true, rows: [pending("r1")] });
    };
    const write = deferred<ResolveResult>();
    resolveApproval.mockImplementationOnce(() => write.promise);
    const q = mount([pending("r1")], [approver]);
    const confirm = await ready();
    await act(async () => {
      confirm.click();
    });
    await tick(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["table.appr.msg.waiting"].en);
    q.unmount();
    polls = 0;
    await act(async () => {
      write.resolve({ ok: true, decision: "approve" });
    });
    await tick(1_000);
    // MUTATION (p2h-boards/approvals/dead-zone-reads): the late ok re-reads the queue from a zone that
    // no longer exists — three reads queued on the tab for a screen nobody is looking at; red.
    expect(polls).toBe(0);
  });

  it("a poll already out when the zone goes, answering 'go sign in' after, sends nobody anywhere (review b · B1)", async () => {
    vi.useFakeTimers();
    const read = deferred<ApprovalsPoll>();
    let first = true;
    pollAnswer = () => {
      if (!first) return new Promise(() => {});
      first = false;
      return read.promise;
    };
    const q = mount([pending("r1")], [approver]);
    await tick(5_000); // the tick's reads go out and wait
    q.unmount();
    await act(async () => {
      read.resolve({ ok: false, reason: "signin" });
    });
    await tick(1_000);
    // MUTATION (p2h-rev-b/approvals/read-answer-after-unmount-acts): the dead zone's poll sends the
    // tablet to the login from the screen the manager moved to; red.
    expect(leaveForLogin).not.toHaveBeenCalled();
    leaveForLogin.mockClear();
  });
});
