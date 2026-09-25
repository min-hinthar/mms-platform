import { describe, expect, it } from "vitest";
import { kitchenDraftUnitsFromRows } from "./checkout-stage";
import { STAFF_WRITE_OUTAGE } from "./staff-outage";
import {
  fireNotice,
  sendHoldFrom,
  sendHoldMsg,
  sendRefusalMsg,
  settleBlockedTarget,
  settleBlockedMsg,
  settleGateAfterCommit,
  settleGateUnits,
  staffOwedSendUnits,
  staffSendCounts,
  staffSendView,
  undoNotice,
  sendNoteAfterCommit,
  sendViewFact,
  type SendRow,
  type StaffSendCounts,
  type StaffSendViewInput,
} from "./staff-send-view";

/**
 * Phase 2a · send — the staff Send's rules as values. Every case below is the one a named mutant in
 * `scripts/verify-slice.mjs` (`staff-send-view/*`) turns red; the fixtures are chosen so the two code
 * paths each mutant confuses give DIFFERENT numbers.
 */

// 2×A staff-added dine-in draft · 1×B a diner's dine-in draft · 1×C a staff-added to-go draft ·
// 3×D already fired.
const MIXED: SendRow[] = [
  { state: "draft", fulfillment: "dinein", qty: 2, by_seat: null },
  { state: "draft", fulfillment: "dinein", qty: 1, by_seat: "s1" },
  { state: "draft", fulfillment: "togo", qty: 1, by_seat: null },
  { state: "fired", fulfillment: "dinein", qty: 3, by_seat: "s1" },
];

describe("staffSendCounts — one count, the one mms_fire_cart fires", () => {
  it("counts only dine-in drafts as sendable, and only staff-added ones as staff's", () => {
    const c = staffSendCounts("dinein", MIXED);
    expect(c).toEqual({
      sendable: 3,
      staffAdded: 2,
      togoDraft: 1,
      inKitchen: true,
      foodDraft: true,
    });
  });

  it("the staff Send clears EXACTLY what the diner's Pay gate counts", () => {
    expect(staffSendCounts("dinein", MIXED).sendable).toBe(kitchenDraftUnitsFromRows(MIXED));
  });

  it("off a dine-in session nothing is sendable, but the food draft is still seen", () => {
    const c = staffSendCounts("pickup", MIXED);
    expect(c.sendable).toBe(0);
    expect(c.staffAdded).toBe(0);
    expect(c.togoDraft).toBe(0);
    expect(c.foodDraft).toBe(true);
  });

  it("a grocery-only draft is not food", () => {
    const c = staffSendCounts("scango", [
      { state: "draft", fulfillment: "grocery", qty: 2, by_seat: null },
    ]);
    expect(c.foodDraft).toBe(false);
  });

  it("a voided line is not in the kitchen", () => {
    const c = staffSendCounts("dinein", [
      { state: "voided", fulfillment: "dinein", qty: 1, by_seat: null },
    ]);
    expect(c.inKitchen).toBe(false);
  });
});

const counts = (over: Partial<StaffSendCounts> = {}): StaffSendCounts => ({
  sendable: 3,
  staffAdded: 0,
  togoDraft: 0,
  inKitchen: false,
  foodDraft: true,
  ...over,
});
const input = (over: Partial<StaffSendViewInput> = {}): StaffSendViewInput => ({
  mode: "dinein",
  counterOrder: false,
  cartOpen: true,
  paymentInFlight: false,
  hostPresent: true,
  counterAsk: false,
  counts: counts(),
  ...over,
});

describe("staffSendView — the owner's decision #3, as recommended", () => {
  it("a hostless table: primary, no note (nobody else can send)", () => {
    const v = staffSendView(input({ hostPresent: false }));
    expect(v).toMatchObject({ kind: "send", units: 3, emphasis: "primary", note: null });
  });

  it("a host table whose unsent dishes are ALL the diners': secondary, with the host hint", () => {
    const v = staffSendView(input({ counts: counts({ staffAdded: 0 }) }));
    expect(v).toMatchObject({ kind: "send", emphasis: "secondary", note: "host", dinerUnits: 3 });
  });

  it("a host table where staff added 2 of 3: primary, and it says Send fires the diners' too", () => {
    const v = staffSendView(input({ counts: counts({ staffAdded: 2 }) }));
    expect(v).toMatchObject({
      kind: "send",
      emphasis: "primary",
      note: "mixed",
      staffAdded: 2,
      dinerUnits: 1,
    });
  });

  it("a host table where staff added everything unsent: primary, no note", () => {
    const v = staffSendView(input({ counts: counts({ staffAdded: 3 }) }));
    expect(v).toMatchObject({ kind: "send", emphasis: "primary", note: null });
  });

  it("the table asked to pay: primary even on a diner's round, with the check-first note", () => {
    const v = staffSendView(input({ counterAsk: true, counts: counts({ staffAdded: 0 }) }));
    expect(v).toMatchObject({ kind: "send", emphasis: "primary", note: "counterAsk" });
  });

  it("a payment in flight: the Send stays, blocked with the paying reason", () => {
    const v = staffSendView(input({ paymentInFlight: true }));
    expect(v).toMatchObject({ kind: "send", blocked: "paying" });
    expect(staffSendView(input())).toMatchObject({ kind: "send", blocked: null });
  });

  it("only to-go drafts: a to-go-at-pay status, counted", () => {
    const v = staffSendView(input({ counts: counts({ sendable: 0, togoDraft: 1 }) }));
    expect(v).toEqual({ kind: "togoAtPay", units: 1 });
  });

  it("everything fired: all sent", () => {
    const v = staffSendView(input({ counts: counts({ sendable: 0, inKitchen: true }) }));
    expect(v).toEqual({ kind: "allSent" });
  });

  it("a register counter order with a food draft: the kitchen starts it at pay — never a Send", () => {
    // Counts that WOULD offer a Send if the view trusted them over the session mode.
    const v = staffSendView(input({ mode: "pickup", counterOrder: true, counts: counts() }));
    expect(v).toEqual({ kind: "counterAtPay" });
  });

  it("a NON-counter pickup cart with a draft (a slotted diner pickup): no line at all", () => {
    const v = staffSendView(input({ mode: "pickup", counterOrder: false, counts: counts() }));
    expect(v).toEqual({ kind: "none" });
  });

  it("a closed cart: nothing", () => {
    expect(staffSendView(input({ cartOpen: false }))).toEqual({ kind: "none" });
  });

  it("an empty dine-in cart: nothing", () => {
    const v = staffSendView(
      input({ counts: counts({ sendable: 0, foodDraft: false, inKitchen: false }) }),
    );
    expect(v).toEqual({ kind: "none" });
  });
});

describe("staffOwedSendUnits — what the floor may call 'not sent'", () => {
  const c = staffSendCounts("dinein", MIXED); // sendable 3, staffAdded 2
  it("a host table counts only the staff-added dishes; a hostless one counts all", () => {
    expect(staffOwedSendUnits(true, c)).toBe(2);
    expect(staffOwedSendUnits(false, c)).toBe(3);
  });
});

describe("sendHoldFrom — drain before fire", () => {
  const edit = {
    lineId: "l1",
    name: "Mohinga",
    noteDirty: false,
    writing: false,
    sendable: true,
  };
  it("a sendable line with an unsaved note holds the Send, naming the dish", () => {
    expect(sendHoldFrom([{ ...edit, noteDirty: true }])).toEqual({
      kind: "note",
      lineId: "l1",
      name: "Mohinga",
    });
  });
  it("a dirty note on a line the Send does not fire (to-go) holds nothing", () => {
    expect(sendHoldFrom([{ ...edit, noteDirty: true, sendable: false }])).toBeNull();
  });
  it("a write in flight holds with the writing reason; the note hold outranks it", () => {
    expect(sendHoldFrom([{ ...edit, writing: true }])).toEqual({ kind: "writing" });
    expect(
      sendHoldFrom([
        { ...edit, lineId: "l0", writing: true },
        { ...edit, noteDirty: true },
      ]),
    ).toMatchObject({ kind: "note", lineId: "l1" });
  });
  it("nothing pending: no hold", () => {
    expect(sendHoldFrom([edit])).toBeNull();
    expect(sendHoldFrom([])).toBeNull();
  });
});

// ── Phase 2c · pad ──
describe("sendHoldMsg / sendRefusalMsg — one sentence per hold, wherever it is said", () => {
  const SEND = {
    kind: "send" as const,
    units: 2,
    emphasis: "primary" as const,
    note: null,
    blocked: null,
    staffAdded: 2,
    dinerUnits: 0,
  };
  it("each hold names its fix; a LOST add is never worded as a wait", () => {
    expect(sendHoldMsg({ kind: "note", lineId: "l1", name: "Tea" })).toEqual({
      k: "table.send.hold.note",
      vars: { x: "Tea" },
    });
    expect(sendHoldMsg({ kind: "writing" })).toEqual({ k: "table.send.hold.writing" });
    expect(sendHoldMsg({ kind: "add", name: "Tea", state: "unconfirmed" })).toEqual({
      k: "table.send.hold.add",
      vars: { x: "Tea" },
    });
    // MUTATION: a lost add read as "Waiting to hear back" — nothing is coming; red.
    expect(sendHoldMsg({ kind: "add", name: "Tea", state: "lost" })).toEqual({
      k: "table.send.hold.lost",
      vars: { x: "Tea" },
    });
  });
  it("a payment holding the cart outranks a hold; a Send that would go says nothing", () => {
    expect(
      sendRefusalMsg({ ...SEND, blocked: "paying" }, { kind: "note", lineId: "l1", name: "Tea" }),
    ).toEqual({ k: "table.send.paying" });
    expect(sendRefusalMsg(SEND, { kind: "writing" })).toEqual({ k: "table.send.hold.writing" });
    expect(sendRefusalMsg(SEND, null)).toBeNull();
    expect(sendRefusalMsg({ kind: "allSent" }, { kind: "writing" })).toBeNull();
  });
});

describe("settleBlockedTarget", () => {
  it("a tab close goes to the LINES (remove first); cash and the reader go to the Send", () => {
    expect(settleBlockedTarget("tab")).toBe("lines");
    expect(settleBlockedTarget("cash")).toBe("send");
    expect(settleBlockedTarget("reader")).toBe("send");
  });
});

describe("the region lines — decided by reason, never by text", () => {
  it("a send names its count, singular and plural", () => {
    const ok = (fired: number) =>
      fireNotice({ ok: true, fired, undoUntil: null, serverNow: "", undoBatch: null });
    expect(ok(1)).toEqual({ tone: "ok", msg: { k: "table.send.sent.one", vars: { n: 1 } } });
    expect(ok(3)).toEqual({ tone: "ok", msg: { k: "table.send.sent.many", vars: { n: 3 } } });
  });
  it("each refusal speaks its own sentence", () => {
    expect(fireNotice({ ok: false, reason: "signin" })).toBe("signin");
    expect(fireNotice({ ok: false, reason: "outage" })).toEqual({
      tone: "warn",
      msg: STAFF_WRITE_OUTAGE,
    });
    expect(fireNotice({ ok: false, reason: "paying" })).toMatchObject({
      msg: { k: "table.send.paying" },
    });
    expect(fireNotice({ ok: false, reason: "counter" })).toMatchObject({
      tone: "warn",
      msg: { k: "table.send.err.counter" },
    });
    expect(fireNotice({ ok: false, reason: "closed" })).toMatchObject({
      msg: { k: "table.send.err.closed" },
    });
    // Neutral on purpose — the refreshed slot says why.
    expect(fireNotice({ ok: false, reason: "nothing" })).toEqual({
      tone: "ok",
      msg: { k: "table.send.err.nothing" },
    });
    expect(fireNotice({ ok: false, reason: "failed" })).toMatchObject({
      tone: "warn",
      msg: { k: "table.send.err.failed" },
    });
  });
  it("an undo that came too late says so and steers to Void / Comp — never 'try again'", () => {
    expect(undoNotice({ ok: false, reason: "expired" })).toEqual({
      tone: "warn",
      msg: { k: "table.send.err.expired" },
    });
    expect(undoNotice({ ok: false, reason: "failed" })).toEqual({
      tone: "warn",
      msg: { k: "table.send.err.undoFailed" },
    });
    expect(undoNotice({ ok: true, unfired: 2 })).toEqual({
      tone: "ok",
      msg: { k: "table.send.undone" },
    });
    expect(undoNotice({ ok: false, reason: "signin" })).toBe("signin");
  });
  it("an undo that finds the batch already brought back is OK-toned and points at the dishes", () => {
    // MUTATION: map `gone` to the expired steer — "too late, Void it" over a dish nobody is
    // cooking; red.
    expect(undoNotice({ ok: false, reason: "gone" })).toEqual({
      tone: "ok",
      msg: { k: "table.send.gone" },
    });
  });
});

describe("sendNoteAfterCommit — a send line lives until the fact it speaks to changes", () => {
  const note = { tone: "warn" as const, raisedAt: 4, against: null as string | null };

  it("ignores commits of reads that started before the line (a poll already in the air)", () => {
    expect(sendNoteAfterCommit(note, 4, "allSent")).toBe(note);
    expect(sendNoteAfterCommit(note, 3, "allSent")).toBe(note);
  });

  it("baselines on the first read that started after it, then keeps it while the fact holds", () => {
    const armed = sendNoteAfterCommit(note, 5, "send:3");
    expect(armed).toEqual({ ...note, against: "send:3" });
    expect(sendNoteAfterCommit(armed, 6, "send:3")).toBe(armed);
  });

  it("clears it when a later read's fact differs — a colleague sent, or the count moved", () => {
    const armed = { ...note, against: "send:3" };
    // MUTATION: never clear — "Couldn't send — try again" stands over "Everything's been sent"; red.
    expect(sendNoteAfterCommit(armed, 6, "allSent")).toBeNull();
    expect(sendNoteAfterCommit(armed, 6, "send:4")).toBeNull();
  });

  it("the fact is the slot's kind and, where it counts, its units", () => {
    expect(sendViewFact({ kind: "allSent" })).toBe("allSent");
    expect(sendViewFact({ kind: "togoAtPay", units: 2 })).toBe("togoAtPay:2");
    expect(
      sendViewFact({
        kind: "send",
        units: 3,
        emphasis: "primary",
        note: null,
        blocked: null,
        staffAdded: 3,
        dinerUnits: 0,
      }),
    ).toBe("send:3");
  });
});

// ── Phase 2c · gate ──
describe("settleBlockedMsg — the settle gate names the fix, counted", () => {
  it("a table says send them first; a running-bill close offers removing them too", () => {
    // MUTATION (staff-send-view/unsent-tab-close-never-offers-remove): ignore `running` — a
    // running-bill close (the guest may have left) is told only to send dishes nobody will eat; red.
    expect(settleBlockedMsg(2, false)).toEqual({
      k: "table.send.settleBlocked.many",
      vars: { n: 2 },
    });
    expect(settleBlockedMsg(2, true)).toEqual({
      k: "table.send.settleBlocked.tab.many",
      vars: { n: 2 },
    });
    expect(settleBlockedMsg(1, false).k).toBe("table.send.settleBlocked.one");
    expect(settleBlockedMsg(1, true).k).toBe("table.send.settleBlocked.tab.one");
  });
});

describe("settleGateAfterCommit — the gate's region line lives until a LATER read clears it", () => {
  const note = { trigger: "cash" as const, units: 3, raisedAt: 5 };
  it("stands while the detail still shows the table blocked", () => {
    expect(settleGateAfterCommit(note, 9, true)).toBe(note);
  });
  it("retires on a read that started after it and shows nothing unsent", () => {
    expect(settleGateAfterCommit(note, 6, false)).toBeNull();
  });
  it("never retires on a read already in the air when it was raised", () => {
    // MUTATION (staff-send-view/unsent-line-retired-by-an-older-read): drop the ticket check — a raced
    // refusal's line vanishes on the stale poll that could not see the drafts, and the cashier is
    // left at a focused Send with no sentence saying why; red.
    expect(settleGateAfterCommit(note, 5, false)).toBe(note);
    expect(settleGateAfterCommit(note, 4, false)).toBe(note);
  });
  it("no line, nothing to keep", () => {
    expect(settleGateAfterCommit(null, 9, true)).toBeNull();
  });
});

describe("settleGateUnits — the count the line names", () => {
  it("the live detail's once it shows the table blocked; the server's own reading before that", () => {
    // MUTATION (staff-send-view/unsent-line-counts-a-stale-reading): prefer the refusal's count —
    // a guest's third dish, landed and read, is said as two; red.
    expect(settleGateUnits({ trigger: "cash", units: 2, raisedAt: 1 }, true, 3)).toBe(3);
    expect(settleGateUnits({ trigger: "cash", units: 2, raisedAt: 1 }, false, 0)).toBe(2);
    expect(settleGateUnits({ trigger: "tab", units: null, raisedAt: 1 }, true, 4)).toBe(4);
  });
});
