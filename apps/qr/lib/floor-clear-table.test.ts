import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * PD7 · M182 — the SERVER half of clearing a table (`lib/floor.ts`):
 *
 *  - `getClearPreview` — the FRESH LOOK at the Clear tap (Codex correction 11): the open cart's lines
 *    on the DATABASE clock, shaped by `clearPreviewOf`; any failed read is `unknown` — never a no-loss
 *    clear over food nobody could see; a counter order and a closed table answer their own kinds;
 *  - `clearTable` on a TABLE — ONE call to `mms_clear_table` carrying the look the staff member was
 *    shown (never a client figure the server trusts: the RPC re-derives the set and refuses
 *    `changed`), its answer read defensively, every refusal said in the dictionary's English with
 *    this table's number, and no plain cancel or close beside it (the RPC is the whole write).
 *
 * The database clock is an hour AHEAD of the process clock: a line fired two minutes before it is
 * SENT there and still in the FUTURE on the app clock, so a look measured on the wrong clock
 * separates. Each case names the `clear-floor/*` mutant (scripts/verify-slice.mjs) it turns red.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./authz", () => ({ AuthzError: class AuthzError extends Error {} }));
const gate = vi.hoisted(() => ({ ok: true }));
vi.mock("./staff", () => ({
  getStaffAuth: () => Promise.resolve({ kind: "staff" }),
  requireStaff: () => Promise.resolve({}),
  staffGate: () =>
    Promise.resolve(
      gate.ok
        ? { ok: true, caller: { staffId: "st-dad", role: "server" } }
        : { ok: false, error: "Sign in again." },
    ),
  STAFF_WRITE_OUTAGE: "outage",
}));
vi.mock("./staff-lock", () => ({ isConsoleLocked: () => Promise.resolve(false) }));
// The money guard, CONTROLLABLE (the blind pass on #341): the RPC re-reads shares under its lock,
// but this read is the first refusal, and a mock that always passes proves nothing about it.
const pay = vi.hoisted(() => ({ reason: null as string | null }));
vi.mock("./pay-guard", () => ({
  isFresh: () => false,
  paymentInFlightReason: () => Promise.resolve(pay.reason),
}));
vi.mock("./line-names", () => ({
  loadLineNames: () =>
    Promise.resolve({
      nameMyByRef: new Map([["m-mohinga", "မုန့်ဟင်းခါး"]]),
      optionNameMy: new Map(),
    }),
}));

type Row = Record<string, unknown>;
const DB_NOW_MS = Date.now() + 60 * 60_000;
const DB_NOW = new Date(DB_NOW_MS).toISOString();
const dbAgo = (sec: number) => new Date(DB_NOW_MS - sec * 1000).toISOString();

const TABLE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const L1 = "11111111-1111-4111-8111-111111111111";

let sessions: Record<string, Row | null> = {};
let sessionError: { message: string } | null = null;
let carts: Record<string, Row | null> = {};
let cartError: { message: string } | null = null;
let items: Row[] = [];
let itemsError: { message: string } | null = null;
let clock: { data: unknown; error: { message: string } | null } = { data: DB_NOW, error: null };
let answer: { data: unknown; error: { message: string } | null } = {
  data: { status: "ok", dishes: 0, loss_cents: 0, clear_id: "c-1" },
  error: null,
};
let updates: string[] = [];
let rpcCalls: { fn: string; args?: Record<string, unknown> }[] = [];

function tableApi(name: string) {
  const eqs: Record<string, unknown> = {};
  let patch = false;
  // The columns a read ASKED for: a row answers only those (a fixture that ignored the select would
  // let a dropped column report clean).
  let cols: string[] | null = null;
  const only = (r: Row | null): Row | null =>
    r === null || cols === null
      ? r
      : Object.fromEntries(Object.entries(r).filter(([k]) => cols!.includes(k)));
  const api: Record<string, unknown> = {
    select(c?: string) {
      cols = typeof c === "string" ? c.split(",").map((x) => x.trim()) : null;
      return api;
    },
    update() {
      patch = true;
      return api;
    },
    eq(col: string, val: unknown) {
      eqs[col] = val;
      return api;
    },
    neq: () => api,
    in: () => api,
    maybeSingle() {
      if (name === "table_sessions")
        return Promise.resolve(
          sessionError
            ? { data: null, error: sessionError }
            : { data: sessions[eqs.id as string] ?? null, error: null },
        );
      if (name === "qr_carts")
        return Promise.resolve(
          cartError
            ? { data: null, error: cartError }
            : { data: only(carts[eqs.session_id as string] ?? null), error: null },
        );
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve: (r: unknown) => void) {
      if (patch) {
        updates.push(name);
        return resolve({ data: null, error: null });
      }
      if (name === "qr_cart_items")
        return resolve(
          itemsError ? { data: null, error: itemsError } : { data: items, error: null },
        );
      resolve({ data: [], count: items.length, error: null });
    },
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (name: string) => tableApi(name),
    rpc: (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "mms_now") return Promise.resolve(clock);
      if (fn === "mms_clear_table") return Promise.resolve(answer);
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

const { getClearPreview, clearTable } = await import("./floor");
const { STAFF } = await import("./i18n/staff");

const session = (id: string, qr: string, mode: string, status = "seated"): Row => ({
  id,
  status,
  mode,
  qr_code: qr,
  table_number: mode === "dinein" ? 7 : null,
});
const line = (over: Row): Row => ({
  id: L1,
  name: "Mohinga",
  qty: 1,
  unit_price_cents: 1400,
  state: "fired",
  fulfillment: "dinein",
  comped: false,
  fire_at: dbAgo(120),
  menu_item_id: "m-mohinga",
  ...over,
});
const LOOK = { lineIds: [L1], lossCents: 1400, seenAt: DB_NOW };

beforeEach(() => {
  gate.ok = true;
  sessions = {
    [TABLE]: session(TABLE, "t-7", "dinein"),
    [REG]: session(REG, "reg-ab12", "pickup"),
  };
  sessionError = null;
  carts = {
    [TABLE]: { id: "cart-t", locked: false, locked_at: null, settle_at: null, tab_type: "none" },
  };
  pay.reason = null;
  cartError = null;
  items = [line({})];
  itemsError = null;
  clock = { data: DB_NOW, error: null };
  answer = { data: { status: "ok", dishes: 0, loss_cents: 0, clear_id: "c-1" }, error: null };
  updates = [];
  rpcCalls = [];
});

describe("getClearPreview — the fresh look, on the database clock; unknown is never 'nothing sent'", () => {
  it("a SENT dish two minutes before the DB clock (an hour ahead of the app's) is on the slip, named in both scripts", async () => {
    const r = await getClearPreview({ sessionId: TABLE });
    if (r.kind !== "preview") throw new Error(`expected a preview, got ${r.kind}`);
    // MUTATION clear-floor/preview-app-clock (the look on the process clock): the fire is still in
    // the future there, so the table reads as a free clear over food the kitchen has; red.
    expect(r.preview.sent.map((l) => l.id)).toEqual([L1]);
    expect(r.preview.lossCents).toBe(1400);
    expect(r.preview.seenAt).toBe(DB_NOW);
    expect(r.preview.sent[0]!.nameMy).toBe("မုန့်ဟင်းခါး");
  });

  it("no open cart: an empty look (a free clear), still on the DB clock", async () => {
    carts = {};
    const r = await getClearPreview({ sessionId: TABLE });
    expect(r).toEqual({
      kind: "preview",
      preview: { seenAt: DB_NOW, sent: [], lossCents: 0, units: 0, droppedUnits: 0 },
    });
  });

  it("every failed read is UNKNOWN — the pane clears nothing (Codex correction 11)", async () => {
    // MUTATION clear-floor/preview-read-error-is-empty → the failed line read reads as an empty
    // table, and Clear goes straight to a no-loss window over food nobody saw; red.
    itemsError = { message: "boom" };
    expect(await getClearPreview({ sessionId: TABLE })).toEqual({ kind: "unknown" });
    itemsError = null;
    // MUTATION clear-floor/preview-cart-error-is-empty → red.
    cartError = { message: "boom" };
    expect(await getClearPreview({ sessionId: TABLE })).toEqual({ kind: "unknown" });
    cartError = null;
    sessionError = { message: "boom" };
    expect(await getClearPreview({ sessionId: TABLE })).toEqual({ kind: "unknown" });
    sessionError = null;
    clock = { data: null, error: { message: "boom" } };
    expect(await getClearPreview({ sessionId: TABLE })).toEqual({ kind: "unknown" });
    // MUTATION clear-floor/preview-clock-unchecked → an unparseable clock shapes a look on NaN; red.
    clock = { data: "not a time", error: null };
    expect(await getClearPreview({ sessionId: TABLE })).toEqual({ kind: "unknown" });
    expect(await getClearPreview({ sessionId: "nope" })).toEqual({ kind: "unknown" });
  });

  it("a staff gate that refuses reads nothing", async () => {
    gate.ok = false;
    // MUTATION clear-floor/preview-ungated → the open cart's lines answer an unauthenticated
    // caller; red.
    expect(await getClearPreview({ sessionId: TABLE })).toEqual({ kind: "unknown" });
    expect(rpcCalls).toEqual([]);
  });

  it("a SECURED tab with a dish sent answers `secure` — its card pays, no slip; nothing sent is free", async () => {
    carts[TABLE] = { ...carts[TABLE]!, tab_type: "secure" };
    // MUTATION clear-floor/preview-secure-slipped → the loss slip and its walkout over a card that
    // can still be charged (the blind pass on #341); red.
    // MUTATION clear-floor/preview-secure-unread → the tab never read, the same slip; red.
    expect(await getClearPreview({ sessionId: TABLE })).toEqual({ kind: "secure" });
    // Nothing sent, nothing to charge: the free look, like any table.
    items = [line({ state: "draft", fire_at: null })];
    const free = await getClearPreview({ sessionId: TABLE });
    expect(free.kind).toBe("preview");
    // A trust tab holds no card: its loss look is the slip.
    items = [line({})];
    carts[TABLE] = { ...carts[TABLE]!, tab_type: "trust" };
    expect((await getClearPreview({ sessionId: TABLE })).kind).toBe("preview");
  });

  it("a counter order answers `counter`; a closed or missing table `closed`", async () => {
    // MUTATION clear-floor/preview-counter-previewed → a counter order gets the table's slip; red.
    expect(await getClearPreview({ sessionId: REG })).toEqual({ kind: "counter" });
    sessions[TABLE] = session(TABLE, "t-7", "dinein", "closed");
    // MUTATION clear-floor/preview-closed-previewed → red.
    expect(await getClearPreview({ sessionId: TABLE })).toEqual({ kind: "closed" });
    sessions[TABLE] = null;
    expect(await getClearPreview({ sessionId: TABLE })).toEqual({ kind: "closed" });
  });
});

describe("clearTable on a TABLE — ONE call to mms_clear_table, carrying the look it was shown", () => {
  it("the look and the CALLER go to the RPC verbatim; nothing else is written", async () => {
    answer = { data: { status: "ok", dishes: 1, loss_cents: 1400, clear_id: "c-1" }, error: null };
    expect(await clearTable({ sessionId: TABLE, expect: LOOK })).toEqual({
      ok: true,
      dishes: 1,
      lossCents: 1400,
    });
    // MUTATIONS clear-floor/initiator-from-the-wire · seen-at-server-now · loss-not-the-look ·
    // line-ids-not-the-look → red.
    expect(rpcCalls.filter((c) => c.fn === "mms_clear_table")).toEqual([
      {
        fn: "mms_clear_table",
        args: {
          p_session: TABLE,
          p_initiator: "st-dad",
          p_seen_at: DB_NOW,
          p_expected_line_ids: [L1],
          p_loss_cents: 1400,
        },
      },
    ]);
    expect(updates).toEqual([]);
  });

  it("a free clear answers plain ok — no loss figure to say", async () => {
    // MUTATION clear-floor/free-clear-reads-a-loss → "0 dishes on the loss list"; red.
    expect(
      await clearTable({ sessionId: TABLE, expect: { lineIds: [], lossCents: 0, seenAt: DB_NOW } }),
    ).toEqual({ ok: true });
  });

  it("no look: refused as `changed`, and the RPC is never called", async () => {
    // MUTATION clear-floor/no-look-clears → a clear nobody looked at; red.
    expect(await clearTable({ sessionId: TABLE })).toMatchObject({ ok: false, code: "changed" });
    expect(rpcCalls.some((c) => c.fn === "mms_clear_table")).toBe(false);
    expect(updates).toEqual([]);
  });

  it("every refusal keeps its code and says the dictionary's English with THIS table's number", async () => {
    answer = { data: { status: "joined" }, error: null };
    // MUTATION clear-floor/refusal-reads-cleared → a refused clear reads as cleared; red.
    // MUTATION clear-floor/refusal-unnamed → "Table {id}" reaches the screen; red.
    expect(await clearTable({ sessionId: TABLE, expect: LOOK })).toEqual({
      ok: false,
      error: STAFF["settle.clear.joined"].en.replace("{id}", "7"),
      code: "joined",
    });
    // The secured tab's refusal names the card door, with this table's number.
    answer = { data: { status: "secure_tab" }, error: null };
    expect(await clearTable({ sessionId: TABLE, expect: LOOK })).toEqual({
      ok: false,
      error: STAFF["settle.clear.secureTab"].en.replace("{id}", "7"),
      code: "secure_tab",
    });
    for (const status of ["changed", "in_flight", "card_live", "closed", "needs_approval"]) {
      answer = { data: { status }, error: null };
      expect(await clearTable({ sessionId: TABLE, expect: LOOK })).toMatchObject({
        ok: false,
        code: status,
      });
    }
    expect(updates).toEqual([]);
  });

  it("money moving refuses BEFORE the RPC: a fresh pay, a split, an unreadable share read", async () => {
    pay.reason = "mid_payment";
    // MUTATION clear-floor/pay-guard-skipped → the clear reaches mms_clear_table over a payment
    // the TS read saw (the RPC re-reads shares, but this is the first refusal); red.
    // MUTATION clear-floor/mid-payment-says-split → a guest paying on their phone is told a split
    // is in progress; red.
    expect(await clearTable({ sessionId: TABLE, expect: LOOK })).toEqual({
      ok: false,
      error: "This table is mid-payment — clear it once they’ve finished.",
    });
    for (const reason of ["split_in_progress", "split_unreadable"]) {
      pay.reason = reason;
      expect(await clearTable({ sessionId: TABLE, expect: LOOK })).toEqual({
        ok: false,
        error: "This table has a split payment in progress — settle it first.",
      });
    }
    expect(rpcCalls.some((c) => c.fn === "mms_clear_table")).toBe(false);
    expect(updates).toEqual([]);
    // The legitimate half: no money moving, the clear goes through.
    pay.reason = null;
    expect((await clearTable({ sessionId: TABLE, expect: LOOK })).ok).toBe(true);
  });

  it("an unreadable answer is never 'cleared'; an RPC error is the outage line", async () => {
    answer = { data: { status: "ok", dishes: "1", loss_cents: 1400 }, error: null };
    // MUTATION clear-floor/unreadable-reads-cleared → red.
    expect(await clearTable({ sessionId: TABLE, expect: LOOK })).toEqual({
      ok: false,
      error: "outage",
      code: "unreadable",
    });
    answer = { data: null, error: { message: "boom" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await clearTable({ sessionId: TABLE, expect: LOOK })).toEqual({
      ok: false,
      error: "outage",
    });
    vi.restoreAllMocks();
  });

  it("the look's rails: a malformed look is refused before any read (Zod, bounded)", async () => {
    expect(
      await clearTable({ sessionId: TABLE, expect: { ...LOOK, lossCents: -1 } }),
    ).toMatchObject({ ok: false });
    expect(
      await clearTable({ sessionId: TABLE, expect: { ...LOOK, seenAt: "yesterday" } }),
    ).toMatchObject({ ok: false });
    expect(
      await clearTable({ sessionId: TABLE, expect: { ...LOOK, lineIds: ["x"] } }),
    ).toMatchObject({ ok: false });
    expect(rpcCalls).toEqual([]);
  });
});
