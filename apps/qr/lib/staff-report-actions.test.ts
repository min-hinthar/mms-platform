import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P7·4 — the gated writer and the reporter's list. Pinned: the three refusals are KEYED (the sheet
 * renders them in the device language); the reporter's identity is the SESSION's, never the
 * input's — a forged staff id is stripped; the row is written before any delivery and the
 * deliveries' outcomes are recorded as they were (a failed email leaves `emailed_at` null, an
 * unopened issue leaves `issue_url` null); the list is scoped to the caller.
 */
const getStaffAuth = vi.fn();
vi.mock("./staff", () => ({ getStaffAuth: () => getStaffAuth(), staffGate: vi.fn() }));
const sendStaffReportEmail = vi.fn();
vi.mock("./email", () => ({
  sendStaffReportEmail: (...a: unknown[]) => sendStaffReportEmail(...a),
}));
const createStaffReportIssue = vi.fn();
vi.mock("./github-issues", () => ({
  createStaffReportIssue: (...a: unknown[]) => createStaffReportIssue(...a),
}));
// `after()` runs post-response in Next; here the callbacks are QUEUED and run only when a test
// says so, so "nothing delivered at answer time" is a real measurement rather than a race.
const afters: (() => unknown)[] = [];
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    afters.push(fn);
  },
}));
const runAfters = () => Promise.all(afters.splice(0).map((fn) => fn()));

type Call = { table: string; op: string; args: unknown };
const calls: Call[] = [];
let insertResult: { data: unknown; error: { message: string } | null };
let updateResult: { data: unknown; error: { message: string } | null };
let listResult: { data: unknown; error: { message: string } | null };
let countResult: { count: number | null; error: { message: string } | null };
function from(table: string) {
  return {
    insert: (row: unknown) => {
      calls.push({ table, op: "insert", args: row });
      return { select: () => ({ single: async () => insertResult }) };
    },
    update: (patch: unknown) => {
      calls.push({ table, op: "update", args: patch });
      return {
        eq: (col: string, val: string) => {
          calls.push({ table, op: "update.eq", args: [col, val] });
          return { select: async () => updateResult };
        },
      };
    },
    select: (cols: string, opts?: { count?: string; head?: boolean }) => {
      calls.push({ table, op: opts?.head ? "count" : "select", args: cols });
      return {
        eq: (col: string, val: string) => {
          calls.push({ table, op: opts?.head ? "count.eq" : "select.eq", args: [col, val] });
          return {
            order: () => ({ limit: async () => listResult }),
            gte: async (gcol: string, gval: string) => {
              calls.push({ table, op: "count.gte", args: [gcol, gval] });
              return countResult;
            },
          };
        },
      };
    },
  };
}
vi.mock("@mms/db/server", () => ({ serviceClient: () => ({ from }) }));

const { submitStaffReport, listMyStaffReports } = await import("./staff-report-actions");

const ID = "9f1c2a3b-4d5e-4f60-8a7b-0c1d2e3f4a5b";
const staff = {
  kind: "staff",
  caller: { uid: "u-9", staffId: "s-1", role: "server", displayName: "Daw Aye", email: null },
};
const draft = {
  screen: "kitchen",
  message: "  Bump did nothing on T4  ",
  lang: "my",
  path: "/staff/kitchen",
  connection: "not_updating",
  appVersion: "7640e01",
  device: { ua: "Safari", online: true, posthogDistinctId: "d-1" },
};

beforeEach(() => {
  getStaffAuth.mockReset();
  sendStaffReportEmail.mockReset();
  createStaffReportIssue.mockReset();
  calls.length = 0;
  afters.length = 0;
  insertResult = { data: { id: ID, created_at: "2026-09-07T05:30:00.000Z" }, error: null };
  updateResult = { data: [{ id: ID }], error: null };
  listResult = { data: [], error: null };
  countResult = { count: 0, error: null };
  createStaffReportIssue.mockResolvedValue({
    ok: true,
    url: "https://github.com/min-hinthar/mms-platform/issues/300",
  });
  sendStaffReportEmail.mockResolvedValue({ ok: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submitStaffReport — the gate, keyed", () => {
  it("an unknowable answer is `outage`, never a sign-in ask, and nothing is written", async () => {
    getStaffAuth.mockResolvedValue({ kind: "unavailable" });
    await expect(submitStaffReport(draft)).resolves.toEqual({ ok: false, reason: "outage" });
    expect(calls).toEqual([]);
  });
  it("no staff session is `auth` — anon and a non-staff account alike", async () => {
    getStaffAuth.mockResolvedValue({ kind: "anon" });
    await expect(submitStaffReport(draft)).resolves.toEqual({ ok: false, reason: "auth" });
    getStaffAuth.mockResolvedValue({ kind: "not_staff" });
    await expect(submitStaffReport(draft)).resolves.toEqual({ ok: false, reason: "auth" });
    expect(calls).toEqual([]);
  });
  it("the rail refuses an empty message, an unknown screen and a smuggled device key", async () => {
    getStaffAuth.mockResolvedValue(staff);
    for (const bad of [
      { ...draft, message: "   " },
      { ...draft, screen: "board" },
      { ...draft, device: { ...draft.device, ip: "10.0.0.1" } },
      { ...draft, message: "x".repeat(2001) },
    ])
      await expect(submitStaffReport(bad)).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(calls).toEqual([]);
  });
});

describe("submitStaffReport — the ceiling", () => {
  it("refuses the SIXTH report in ten minutes with `rate`, counted per staff row, and never writes it", async () => {
    getStaffAuth.mockResolvedValue(staff);
    countResult = { count: 5, error: null };
    await expect(submitStaffReport(draft)).resolves.toEqual({ ok: false, reason: "rate" });
    expect(calls.find((c) => c.op === "count.eq")!.args).toEqual(["staff_id", "s-1"]);
    const gte = calls.find((c) => c.op === "count.gte")!.args as [string, string];
    expect(gte[0]).toBe("created_at");
    expect(Date.now() - new Date(gte[1]).getTime()).toBeGreaterThanOrEqual(10 * 60_000 - 1000);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
    // The fifth is still allowed.
    calls.length = 0;
    countResult = { count: 4, error: null };
    expect((await submitStaffReport(draft)).ok).toBe(true);
  });
  it("a failed COUNT never blocks a report — the row matters more than the ceiling", async () => {
    getStaffAuth.mockResolvedValue(staff);
    countResult = { count: null, error: { message: "boom" } };
    expect((await submitStaffReport(draft)).ok).toBe(true);
    expect(calls.some((c) => c.op === "insert")).toBe(true);
  });
});

describe("submitStaffReport — the row, then the deliveries", () => {
  it("writes the row under the SESSION's identity (a forged staff id is stripped), trimmed, and answers the short id", async () => {
    getStaffAuth.mockResolvedValue(staff);
    const res = await submitStaffReport({ ...draft, staff_id: "s-999", staffId: "s-999" });
    expect(res).toEqual({ ok: true, id: ID, shortId: "9F1C2A3B" });
    const insert = calls.find((c) => c.op === "insert")!;
    expect(insert.table).toBe("qr_staff_reports");
    expect(insert.args).toEqual({
      staff_id: "s-1",
      staff_name: "Daw Aye",
      screen: "kitchen",
      path: "/staff/kitchen",
      message: "Bump did nothing on T4",
      lang: "my",
      connection: "not_updating",
      app_version: "7640e01",
      device: { ua: "Safari", online: true, posthogDistinctId: "d-1" },
    });
  });
  it("delivers AFTER the answer — issue first so the email can link it — and records both outcomes", async () => {
    getStaffAuth.mockResolvedValue(staff);
    await submitStaffReport(draft);
    // Nothing delivered yet at answer time.
    expect(createStaffReportIssue).not.toHaveBeenCalled();
    await runAfters();
    expect(createStaffReportIssue).toHaveBeenCalledTimes(1);
    const issueArg = createStaffReportIssue.mock.calls[0]![0] as { title: string; body: string };
    expect(issueArg.title).toBe("[staff report] kitchen: Bump did nothing on T4");
    // The repository is public: the issue names the report, never the person.
    expect(issueArg.body).toContain("| Report | 9F1C2A3B |");
    expect(issueArg.body).not.toContain("Daw Aye");
    expect(issueArg.body).not.toContain("Safari");
    expect(sendStaffReportEmail).toHaveBeenCalledTimes(1);
    expect(sendStaffReportEmail.mock.calls[0]![0]).toMatchObject({
      id: ID,
      shortId: "9F1C2A3B",
      staffName: "Daw Aye",
      issueUrl: "https://github.com/min-hinthar/mms-platform/issues/300",
    });
    const update = calls.find((c) => c.op === "update")!;
    expect(update.args).toMatchObject({
      issue_url: "https://github.com/min-hinthar/mms-platform/issues/300",
    });
    expect(typeof (update.args as { emailed_at: unknown }).emailed_at).toBe("string");
    expect(calls.find((c) => c.op === "update.eq")!.args).toEqual(["id", ID]);
  });
  it("a failed email and an unopened issue are recorded as exactly that — the report still stands", async () => {
    getStaffAuth.mockResolvedValue(staff);
    createStaffReportIssue.mockResolvedValue({ ok: false, reason: "unconfigured" });
    sendStaffReportEmail.mockResolvedValue({ ok: false, error: "email-not-configured" });
    const res = await submitStaffReport(draft);
    expect(res.ok).toBe(true);
    await runAfters();
    expect(sendStaffReportEmail.mock.calls[0]![0]).toMatchObject({ issueUrl: null });
    const update = calls.find((c) => c.op === "update")!;
    expect(update.args).toEqual({ issue_url: null, emailed_at: null });
  });
  it("a blocked delivery record is logged, not hidden (an update reports no row count)", async () => {
    getStaffAuth.mockResolvedValue(staff);
    updateResult = { data: [], error: null };
    await submitStaffReport(draft);
    await runAfters();
    expect(console.error).toHaveBeenCalledWith(
      "[staff-report] could not record delivery",
      ID,
      "no row",
    );
  });
  it("an insert failure is `save`, and nothing is delivered for a row that does not exist", async () => {
    getStaffAuth.mockResolvedValue(staff);
    insertResult = { data: null, error: { message: "boom" } };
    await expect(submitStaffReport(draft)).resolves.toEqual({ ok: false, reason: "save" });
    expect(afters.length).toBe(0);
    expect(createStaffReportIssue).not.toHaveBeenCalled();
  });
});

describe("listMyStaffReports", () => {
  it("is scoped to the caller's staff row, newest first, with the short id", async () => {
    getStaffAuth.mockResolvedValue(staff);
    listResult = {
      data: [
        {
          id: ID,
          created_at: "2026-09-07T05:30:00.000Z",
          message: "Bump did nothing",
          status: "triaged",
          issue_url: "https://github.com/min-hinthar/mms-platform/issues/300",
        },
      ],
      error: null,
    };
    const res = await listMyStaffReports();
    expect(res).toEqual({
      ok: true,
      rows: [
        {
          id: ID,
          shortId: "9F1C2A3B",
          createdAt: "2026-09-07T05:30:00.000Z",
          message: "Bump did nothing",
          status: "triaged",
          issueUrl: "https://github.com/min-hinthar/mms-platform/issues/300",
        },
      ],
    });
    expect(calls.find((c) => c.op === "select.eq")!.args).toEqual(["staff_id", "s-1"]);
  });
  it("keeps the gate's three-way answer, and a failed read is `read`", async () => {
    getStaffAuth.mockResolvedValue({ kind: "unavailable" });
    await expect(listMyStaffReports()).resolves.toEqual({ ok: false, reason: "outage" });
    getStaffAuth.mockResolvedValue({ kind: "anon" });
    await expect(listMyStaffReports()).resolves.toEqual({ ok: false, reason: "auth" });
    getStaffAuth.mockResolvedValue(staff);
    listResult = { data: null, error: { message: "boom" } };
    await expect(listMyStaffReports()).resolves.toEqual({ ok: false, reason: "read" });
  });
});
