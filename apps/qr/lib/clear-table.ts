/**
 * PD7 · M182 · P2hf — clearing a table, the PURE half (ruling #6: Clear never waits; every SENT dish
 * goes on the owner's loss list as not approved). The authority is `mms_clear_table`
 * (supabase/migrations/20261009120400_m182_table_clear.sql): it derives the SENT set under its row
 * locks and refuses `changed` when it is not the set this module showed the staff member. So this
 * module decides only what the PANE shows before anyone commits — the slip's dishes and its one
 * figure — and how the RPC's answer reads. Pure, so a value falsifies every rule.
 */
import type { StaffKey } from "./i18n/staff";
import { counterNoShowDropped, counterSentLine } from "./counter-order";

/** One line as the clear's look reads it (`getClearPreview`, a fresh read at the Clear tap). */
export type ClearRow = {
  id: string;
  name: string;
  qty: number;
  unit_price_cents: number;
  state: string;
  fulfillment: string;
  comped: boolean;
  fire_at: string | null;
  menu_item_id: string;
};

/**
 * SENT — `mms_clear_table`'s predicate, which is `mms_counter_no_show`'s: fired, cooking or served;
 * never grocery (the kitchen never had it); never comped (a comp is already an audited loss); past
 * its send grace (`fire_at` null, or at or before the DATABASE clock — an in-grace line never
 * reached the KDS and goes back to draft, unrecorded). ONE rule: the no-show's `counterSentLine`
 * (lib/counter-order.ts, with its own mutants), never a second copy.
 */
export function clearSentLine(r: ClearRow, dbNowMs: number): boolean {
  return counterSentLine(r, dbNowMs);
}

/** A dish on the loss slip: its own snapshot words, its kitchen state, its menu price × qty. */
export type ClearSlipLine = {
  id: string;
  qty: number;
  name: string;
  nameMy: string | null;
  state: "fired" | "in_progress" | "served";
  amountCents: number;
};

/** What the staff member SEES before a clear, and what the clear then carries as its expectation. */
export type ClearPreview = {
  /** The DATABASE clock at the look (`mms_now`) — the RPC's `p_seen_at`, never a browser clock. */
  seenAt: string;
  /** The SENT dishes, in id order (the RPC's own order). */
  sent: ClearSlipLine[];
  /** Σ unit × qty over the SENT set — the ledger's own figure (menu price, pre-tax). */
  lossCents: number;
  /** Σ qty over the SENT set — the RPC answers with the same count. */
  units: number;
  /** Dishes the kitchen never got (drafts, in-grace fires — comped or not): dropped, never counted
   *  as a loss. The no-show's own rule (`counterNoShowDropped`), named once. */
  droppedUnits: number;
  /** Codex P1 on #341 — EVERY live line as the look read it (`clearLineKey`, sorted): the RPC's
   *  `p_seen_lines`, compared as a set under its line locks, so a draft re-counted, taken off, sent
   *  or turned to-go after the look refuses the clear instead of being cancelled unseen. */
  lines: string[];
};

/**
 * One live line as the look saw it — `<id>:<qty>:<fulfillment>:draft|sent`, the string
 * `mms_clear_table` builds for `p_seen_lines` (M182.17 pins it literally). The state is read only as
 * draft-or-sent, NEVER the kitchen's own state: a cook starting or serving a SENT dish moves neither
 * the figure nor what the clear drops, and a walkout's clear must not wait on the kitchen (ruling #6)
 * — the window's watch (`tillSlipDiverged`) ignores it too. A voided line is no line (the caller
 * leaves it out, as the RPC does).
 */
export function clearLineKey(r: Pick<ClearRow, "id" | "qty" | "fulfillment" | "state">): string {
  return `${r.id}:${r.qty}:${r.fulfillment}:${r.state === "draft" ? "draft" : "sent"}`;
}

/** The look, from a fresh read of the open cart's lines on the database clock. */
export function clearPreviewOf(
  rows: readonly ClearRow[],
  dbNowMs: number,
  seenAt: string,
  nameMyOf: (menuItemId: string) => string | null = () => null,
): ClearPreview {
  const sent = rows
    .filter((r) => clearSentLine(r, dbNowMs))
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(
      (r): ClearSlipLine => ({
        id: r.id,
        qty: r.qty,
        name: r.name,
        nameMy: nameMyOf(r.menu_item_id),
        state: r.state as ClearSlipLine["state"],
        amountCents: r.unit_price_cents * r.qty,
      }),
    );
  const dropped = rows.filter((r) => counterNoShowDropped(r, dbNowMs));
  return {
    seenAt,
    sent,
    lossCents: sent.reduce((s, l) => s + l.amountCents, 0),
    units: sent.reduce((s, l) => s + l.qty, 0),
    droppedUnits: dropped.reduce((s, r) => s + r.qty, 0),
    lines: rows
      .filter((r) => r.state !== "voided")
      .map(clearLineKey)
      .sort(),
  };
}

/** A PAID cart's line states the kitchen has not finished: a paid DRAFT (settlement fires it —
 *  `mms_fire_pending_food`, its reconciler), fired, or being cooked. */
const PAID_UNSERVED_STATES: ReadonlySet<string> = new Set(["draft", "fired", "in_progress"]);

/**
 * Codex P1 on #341 — does a PAID cart still have food the kitchen has not finished? A table that paid
 * has no open cart, yet its paid cart can still be cooking — and the kitchen board shows a dine-in
 * line only while its session is ACTIVE (`kdsLineGate`), so a clear would take those tickets off the
 * board, or keep a paid draft from ever reaching it. So the look answers `paidUnserved` and the pane
 * says to serve it or bag it first; `mms_clear_table` refuses the same (`paid_unserved`) under its
 * locks. Never a loss and never stopped: the guest paid for it. Grocery is never the kitchen's (the
 * stop set's own rule); a comp is still made, so it counts. The SQL twin is the RPC's own predicate,
 * pinned by M182.16.
 */
export function clearPaidUnserved(
  paidLines: readonly { state: string; fulfillment: string }[],
): boolean {
  return paidLines.some((l) => PAID_UNSERVED_STATES.has(l.state) && l.fulfillment !== "grocery");
}

/**
 * M270 (1) · PATH_DESIGN correction 12 — may the slip mention the kitchen at all? When the LOOK shows
 * a SENT dish still fired or cooking (never served): a subset of `mms_clear_table`'s own stop set
 * (fired · in progress, past the grace, never grocery — SENT is all three). ⚠️ It reads the look, not
 * the commit (#347, Codex P2): a dish served during the slip or the six-second window commits with
 * nothing left to stop, and no stop card is drawn. So the clause it unlocks promises no particular
 * stop — "tells the kitchen to stop anything still cooking" (`settle.clear.loss.bodyStop.*`), true
 * whatever the kitchen finishes in between — and this gate only keeps a table whose food the look saw
 * all served from hearing about the kitchen at all. It may under-say (a comped dish still cooking is
 * stopped too, and is never on the slip).
 */
export function clearStopsKitchen(p: ClearPreview): boolean {
  return p.sent.some((l) => l.state === "fired" || l.state === "in_progress");
}

/** Whether the clear is a LOSS (the slip and its "Did Table N pay?" fork), or free (straight into
 *  the Undo window — §22's undo over confirm). Only the server's SENT set decides it. */
export function clearIsLoss(p: ClearPreview): boolean {
  return p.sent.length > 0;
}

/**
 * A SECURED tab's loss look (the blind pass on #341): the saved card can still pay for the SENT
 * food (`closeSecureTab`), and a cleared cart takes that door away for good — so the pane offers no
 * walkout slip and says to close the bill on the card first. `mms_clear_table` refuses the same
 * (`secure_tab`) under its locks; this is the look's half, so the slip is never drawn over a card.
 * Nothing sent, nothing to charge: a secured tab with no loss clears like any free table.
 */
export function clearNeedsTheCard(tabType: string | null | undefined, p: ClearPreview): boolean {
  return tabType === "secure" && clearIsLoss(p);
}

// ── the RPC's answer ──────────────────────────────────────────────────────────────────────────

/** `mms_clear_table`'s refusals, each before any write. */
export type ClearRefusal =
  | "not_found"
  | "closed"
  | "counter"
  | "paid_unserved"
  | "in_flight"
  | "card_live"
  | "joined"
  | "changed"
  | "secure_tab"
  | "needs_approval"
  | "self_approve"
  | "bad_approver";

export type ClearAnswer =
  | { status: "ok"; dishes: number; lossCents: number }
  | { status: ClearRefusal }
  | { status: "unreadable" };

const REFUSALS: ReadonlySet<string> = new Set<ClearRefusal>([
  "not_found",
  "closed",
  "counter",
  "paid_unserved",
  "in_flight",
  "card_live",
  "joined",
  "changed",
  "secure_tab",
  "needs_approval",
  "self_approve",
  "bad_approver",
]);

/** The RPC's jsonb, read defensively: anything that is not a known shape is `unreadable` (the caller
 *  says it could not confirm — never "cleared", never "nothing happened"). */
export function clearAnswerOf(raw: unknown): ClearAnswer {
  if (typeof raw !== "object" || raw === null) return { status: "unreadable" };
  const o = raw as Record<string, unknown>;
  if (o.status === "ok") {
    const dishes = o.dishes;
    const loss = o.loss_cents;
    if (
      typeof dishes !== "number" ||
      typeof loss !== "number" ||
      !Number.isInteger(dishes) ||
      !Number.isInteger(loss) ||
      dishes < 0 ||
      loss < 0
    )
      return { status: "unreadable" };
    return { status: "ok", dishes, lossCents: loss };
  }
  if (typeof o.status === "string" && REFUSALS.has(o.status))
    return { status: o.status as ClearRefusal };
  return { status: "unreadable" };
}

/**
 * What a refused clear says — the dictionary's words, so a Burmese console reads them — and whether
 * the pane should LOOK AGAIN (a fresh preview) before another commit: the table moved under the look.
 */
export function clearRefusalSays(r: ClearRefusal): { k: StaffKey; relook: boolean } {
  switch (r) {
    case "changed":
      // The clear's own sentence (Codex P1 on #341): the order moved after the look — any line, not
      // only the SENT set — and nothing was cleared.
      return { k: "settle.clear.changed", relook: true };
    case "joined":
      return { k: "settle.clear.joined", relook: true };
    case "in_flight":
      return { k: "settle.clear.midPayment", relook: false };
    case "card_live":
      return { k: "settle.clear.cardLive", relook: false };
    case "closed":
    case "not_found":
      return { k: "settle.clear.gone", relook: false };
    case "counter":
      return { k: "settle.clear.counterSent", relook: false };
    case "paid_unserved":
      // Paid food the kitchen has not finished: the way out is the kitchen (serve it or bag it), and
      // a fresh look would say the same.
      return { k: "settle.clear.paidUnserved", relook: false };
    case "secure_tab":
      // A card on file can still pay for what was sent: the way out is that card, not a write-off.
      return { k: "settle.clear.secureTab", relook: false };
    case "needs_approval":
    case "self_approve":
    case "bad_approver":
      // The PIN seam is off (ruling #6); switched on, the stamp becomes the required step — until
      // that UI ships, the pane says a manager is needed rather than pretending it cleared.
      return { k: "settle.clear.needsManager", relook: false };
  }
}
