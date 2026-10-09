/**
 * PD7 · M182 · P2hf — clearing a table, the PURE half (ruling #6: Clear never waits; every SENT dish
 * goes on the owner's loss list as not approved). The authority is `mms_clear_table`
 * (supabase/migrations/20261009120000_m182_table_clear.sql): it derives the SENT set under its row
 * locks and refuses `changed` when it is not the set this module showed the staff member. So this
 * module decides only what the PANE shows before anyone commits — the slip's dishes and its one
 * figure — and how the RPC's answer reads. Pure, so a value falsifies every rule.
 */
import type { StaffKey } from "./i18n/staff";

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
 * SENT — `mms_clear_table`'s predicate exactly (and `mms_counter_no_show`'s): fired, cooking or
 * served; never grocery (the kitchen never had it); never comped (a comp is already an audited
 * loss); past its send grace (`fire_at` null, or at or before the DATABASE clock — an in-grace line
 * never reached the KDS and goes back to draft, unrecorded).
 */
export function clearSentLine(r: ClearRow, dbNowMs: number): boolean {
  return (
    (r.state === "fired" || r.state === "in_progress" || r.state === "served") &&
    r.fulfillment !== "grocery" &&
    !r.comped &&
    (r.fire_at === null || Date.parse(r.fire_at) <= dbNowMs)
  );
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
  /** Dishes the kitchen never got (drafts, in-grace fires): dropped, never counted as a loss. */
  droppedUnits: number;
};

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
  const dropped = rows.filter(
    (r) =>
      r.fulfillment !== "grocery" &&
      !r.comped &&
      (r.state === "draft" || (r.state === "fired" && !clearSentLine(r, dbNowMs))),
  );
  return {
    seenAt,
    sent,
    lossCents: sent.reduce((s, l) => s + l.amountCents, 0),
    units: sent.reduce((s, l) => s + l.qty, 0),
    droppedUnits: dropped.reduce((s, r) => s + r.qty, 0),
  };
}

/** Whether the clear is a LOSS (the slip and its "Did Table N pay?" fork), or free (straight into
 *  the Undo window — §22's undo over confirm). Only the server's SENT set decides it. */
export function clearIsLoss(p: ClearPreview): boolean {
  return p.sent.length > 0;
}

// ── the RPC's answer ──────────────────────────────────────────────────────────────────────────

/** `mms_clear_table`'s refusals, each before any write. */
export type ClearRefusal =
  | "not_found"
  | "closed"
  | "counter"
  | "in_flight"
  | "card_live"
  | "joined"
  | "changed"
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
  "in_flight",
  "card_live",
  "joined",
  "changed",
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
      return { k: "table.noshow.err.changed", relook: true };
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
    case "needs_approval":
    case "self_approve":
    case "bad_approver":
      // The PIN seam is off (ruling #6); switched on, the stamp becomes the required step — until
      // that UI ships, the pane says a manager is needed rather than pretending it cleared.
      return { k: "settle.clear.needsManager", relook: false };
  }
}
