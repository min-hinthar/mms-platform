import { kitchenDraftUnitsFromRows } from "./checkout-stage";
import { plural } from "./i18n/fill";
import type { StaffKey } from "./i18n/staff";
import { STAFF_WRITE_OUTAGE } from "./staff-outage";

/**
 * Phase 2a · send — what the staff console's "Send to kitchen" slot SAYS, decided as values.
 *
 * P2k (OPEN-ITEMS, high): a table started from the register ("Start a table") has no phone, so
 * nothing on it reached the kitchen until someone settled it — `staffFireCart` existed with no
 * caller. The table page now carries a Send, and every rule about when it is offered, how loud it
 * is, what it counts and when it must hold its fire lives HERE, pure, so `verify:slice` falsifies
 * each one with a value instead of a render and five mocks (CLAUDE.md, "Decision logic belongs in
 * `lib/`").
 *
 * ONE COUNT. `sendable` is `kitchenDraftUnitsFromRows` on a dine-in session — exactly what
 * `mms_fire_cart` fires, what `create-intent` refuses to charge over, and what the diner's Bill
 * reads before it lets the host pay. The staff Send therefore clears precisely the lines the diner's
 * "Everything sent" gate counts; a second derivation would be a second answer to one question.
 *
 * Plain module (no "server-only"): `lib/floor.ts` computes the counts server-side and the table
 * page's client components render the view from them.
 */

/** A `qr_cart_items` row as the send rules read it (`state`, not the view's `lineState`). */
export type SendRow = {
  state: string;
  fulfillment: string;
  qty: number;
  by_seat: string | null;
};

export type StaffSendCounts = {
  /** Dine-in drafts the kitchen send would fire (qty units) — 0 off a dine-in session. */
  sendable: number;
  /** Of those, the ones staff added and nobody reassigned (`by_seat` null — `assignLineInput.seatId`
   *  is a non-null uuid, so null means exactly "added by staff"). */
  staffAdded: number;
  /** To-go drafts at a dine-in table: they cook at checkout, never on the Send. */
  togoDraft: number;
  /** Something on the order has already gone to the kitchen (fired, cooking or served). */
  inKitchen: boolean;
  /** Any unsent draft that is FOOD (not grocery) — what a counter order cooks at payment. */
  foodDraft: boolean;
};

const IN_KITCHEN = new Set(["fired", "in_progress", "served"]);

export function staffSendCounts(mode: string, rows: ReadonlyArray<SendRow>): StaffSendCounts {
  const dinein = mode === "dinein";
  return {
    sendable: dinein ? kitchenDraftUnitsFromRows(rows) : 0,
    staffAdded: dinein ? kitchenDraftUnitsFromRows(rows.filter((r) => r.by_seat == null)) : 0,
    togoDraft: dinein
      ? rows
          .filter((r) => r.state === "draft" && r.fulfillment === "togo")
          .reduce((a, r) => a + r.qty, 0)
      : 0,
    inKitchen: rows.some((r) => IN_KITCHEN.has(r.state)),
    foodDraft: rows.some((r) => r.state === "draft" && r.fulfillment !== "grocery"),
  };
}

export type StaffSendView =
  | { kind: "none" }
  | {
      kind: "send";
      units: number;
      /** Primary when staff own the send; secondary (with the host hint) when a diner host runs the
       *  table and every unsent dish is theirs — the owner's decision #3, as recommended. */
      emphasis: "primary" | "secondary";
      note: null | "host" | "mixed" | "counterAsk";
      /** A payment holds the cart: the Send stays rendered but refuses, and says why. */
      blocked: null | "paying";
      staffAdded: number;
      dinerUnits: number;
    }
  | { kind: "allSent" }
  | { kind: "togoAtPay"; units: number }
  | { kind: "counterAtPay" };

export type StaffSendViewInput = {
  mode: string;
  /** A register (`reg-`) counter order — the only non-table order that cooks at payment. */
  counterOrder: boolean;
  cartOpen: boolean;
  paymentInFlight: boolean;
  /** The session has a diner host (`host_seat` set) — create-intent's binding for "someone can send". */
  hostPresent: boolean;
  /** The table asked to pay at the counter (a live ask). */
  counterAsk: boolean;
  counts: StaffSendCounts;
};

export function staffSendView(i: StaffSendViewInput): StaffSendView {
  if (!i.cartOpen) return { kind: "none" };
  // A counter order cooks when it is PAID (owner decision 1 files cook-before-pay as its own slice);
  // until then the screen says so rather than offering a Send the server refuses. A pickup cart with
  // a slot fires at slot − prep, so it gets no line at all.
  if (i.mode !== "dinein")
    return i.counterOrder && i.counts.foodDraft ? { kind: "counterAtPay" } : { kind: "none" };
  const c = i.counts;
  if (c.sendable > 0) {
    const blocked = i.paymentInFlight ? ("paying" as const) : null;
    const base = {
      kind: "send" as const,
      units: c.sendable,
      blocked,
      staffAdded: c.staffAdded,
      dinerUnits: c.sendable - c.staffAdded,
    };
    // The table has asked to pay: whatever is unsent is now the counter's to settle, so the Send is
    // the counter's to press — with the question to ask first.
    if (i.counterAsk) return { ...base, emphasis: "primary", note: "counterAsk" };
    // Nobody at the table can send (a staff-started session mints `host_seat: null`).
    if (!i.hostPresent) return { ...base, emphasis: "primary", note: null };
    // Staff added some: those are the counter's to send, and Send fires the table's too — say so.
    if (c.staffAdded > 0)
      return { ...base, emphasis: "primary", note: c.staffAdded < c.sendable ? "mixed" : null };
    // Every unsent dish is a diner's round still being chosen: the host sends it.
    return { ...base, emphasis: "secondary", note: "host" };
  }
  if (c.togoDraft > 0) return { kind: "togoAtPay", units: c.togoDraft };
  if (c.inKitchen) return { kind: "allSent" };
  return { kind: "none" };
}

/**
 * What the FLOOR may count as "not sent" for a table (the 2d kitchen-row segment reads this): on a
 * hostless table every sendable dish; on a host table only what staff added — a diner's own round in
 * progress is theirs to send, and a count there would teach staff to fire it.
 */
export function staffOwedSendUnits(hostPresent: boolean, counts: StaffSendCounts): number {
  return hostPresent ? counts.staffAdded : counts.sendable;
}

/** One line editor's report up to the table page (`StaffLineEditor`'s `onEditState`). */
export type StaffLineEdit = {
  lineId: string;
  name: string;
  /** The note editor is open and its text differs from the saved note. */
  noteDirty: boolean;
  /** A qty or note write for this line is in flight. */
  writing: boolean;
  sendable: boolean;
};

export type StaffSendHold =
  | null
  | { kind: "note"; lineId: string; name: string }
  | { kind: "writing" };

/**
 * DRAIN BEFORE FIRE (DESIGN-LANGUAGE §4). `setLineNotes` is draft-guarded, so a note typed but not
 * yet saved when its line fires is LOST — and the note is where an allergy lives. A sendable line
 * with a dirty note holds the Send (naming the dish); any write still in flight holds it too.
 */
export function sendHoldFrom(edits: ReadonlyArray<StaffLineEdit>): StaffSendHold {
  const note = edits.find((e) => e.sendable && e.noteDirty);
  if (note) return { kind: "note", lineId: note.lineId, name: note.name };
  if (edits.some((e) => e.writing)) return { kind: "writing" };
  return null;
}

/**
 * Where a refused settle tap sends the cashier (commit B, 2c): to the Send for cash or the reader;
 * to the LINES for a secure-tab close, where the guest may already have left and removing comes
 * first.
 */
export function settleBlockedTarget(trigger: "cash" | "reader" | "tab"): "send" | "lines" {
  return trigger === "tab" ? "lines" : "send";
}

// ── the server's answers ──────────────────────────────────────────────────────────────────────────

/**
 * Every refusal the two actions can return, decided by WHERE it happened (never by message text):
 * the gate (signin · outage), the input (invalid), the reads (closed · outage), the session
 * (counter), the payment guard (paying), the write (nothing · expired · gone · failed).
 */
export type StaffSendReason =
  | "signin"
  | "outage"
  | "invalid"
  | "closed"
  | "counter"
  | "paying"
  | "nothing"
  | "expired"
  | "gone"
  | "failed";

/** The diner's `SendToKitchenResult` shape on success, so `graceDeadlineMs` reads both. */
export type StaffFireResult =
  | {
      ok: true;
      fired: number;
      undoUntil: string | null;
      serverNow: string;
      undoBatch: string | null;
    }
  | { ok: false; reason: Exclude<StaffSendReason, "expired" | "gone"> };

export type StaffUndoResult =
  | { ok: true; unfired: number }
  | { ok: false; reason: Exclude<StaffSendReason, "nothing"> };

/** A region line: a dictionary key (rendered through <MsgText>), or the outage sentence, whose
 *  Burmese twin `<OutageText>` supplies. Structurally the staff `StaffMsg`. */
export type SendMsg = { k: StaffKey; vars?: Record<string, number> } | string;

/** What the send slot hands the page's ONE region, or `signin` (the page goes to login). */
export type SendNotice = { tone: "ok" | "warn"; msg: SendMsg } | "signin";

const warn = (k: StaffKey, vars?: Record<string, number>): SendNotice => ({
  tone: "warn",
  msg: vars ? { k, vars } : { k },
});

/** The region line for a send's answer. `nothing` is neutral on purpose: the refreshed slot then
 *  says WHY (all sent, or to-go that cooks at pay). */
export function fireNotice(res: StaffFireResult): SendNotice {
  if (res.ok)
    return {
      tone: "ok",
      msg: {
        k: plural(res.fired, "table.send.sent.one", "table.send.sent.many"),
        vars: { n: res.fired },
      },
    };
  switch (res.reason) {
    case "signin":
      return "signin";
    case "outage":
      return { tone: "warn", msg: STAFF_WRITE_OUTAGE };
    case "paying":
      return warn("table.send.paying");
    case "closed":
      return warn("table.send.err.closed");
    case "counter":
      return warn("table.send.err.counter");
    case "nothing":
      return { tone: "ok", msg: { k: "table.send.err.nothing" } };
    case "invalid":
    case "failed":
      return warn("table.send.err.failed");
  }
}

/** The region line for an undo's answer. `expired` steers to Void / Comp — never a silent success;
 *  `gone` (an earlier undo already landed) is OK-toned and points at the dishes, which say where each
 *  one is — never "too late", which would send staff to Void a dish nobody is cooking. */
export function undoNotice(res: StaffUndoResult): SendNotice {
  if (res.ok) return { tone: "ok", msg: { k: "table.send.undone" } };
  switch (res.reason) {
    case "signin":
      return "signin";
    case "outage":
      return { tone: "warn", msg: STAFF_WRITE_OUTAGE };
    case "paying":
      return warn("table.send.paying");
    case "closed":
      return warn("table.send.err.closed");
    case "counter":
      return warn("table.send.err.counter");
    case "expired":
      return warn("table.send.err.expired");
    case "gone":
      return { tone: "ok", msg: { k: "table.send.gone" } };
    case "invalid":
    case "failed":
      return warn("table.send.err.undoFailed");
  }
}
