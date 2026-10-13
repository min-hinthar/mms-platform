import { isScanGoBasket } from "./expo-rules";

/**
 * The lifecycle audit (2026-10-13) — WHICH orders the TV wall's code column may publish, decided once
 * and pure (`/api/board` reads, this decides). The SQL filters on the read only NARROW the rows; this
 * is the rule (the M250 pattern — `paidBagCompLine`).
 *
 * Four defects, one predicate:
 *  · a READY bag was hidden until its scheduled fire time: the read gated every order on
 *    `qr_orders.fire_at <= now`, and the KDS's Cook now moves only the CART lines' fire time — so a
 *    bag cooked early and bagged sat off the wall, uncalled, while the guest stood at the counter. The
 *    fire-time gate is for a bag still PREPARING (a held scheduled order is not being made yet); a
 *    ready bag is on the wall whatever the schedule said;
 *  · the window was `created_at >= floor`, so a pickup booked more than a day ahead never reached the
 *    wall on the day it came up — the expo windows by DUE time since #275, and the wall now does too;
 *  · a REFUNDED order kept its code (the read had no status filter);
 *  · a pure scan-and-go basket was published as Preparing and called Ready — the room's one call for
 *    food — though the shopper already holds the goods (`isScanGoBasket`, the expo's own rule).
 */

/** The `qr_orders` columns the rule reads. */
export type BoardOrderRow = {
  status: string;
  togo_status: string | null;
  fire_at: string | null;
  pickup_slot: string | null;
  created_at: string;
};

/** Is this order live for the wall at `nowIso`, inside the service window that starts at `floorIso`? */
export function boardOrderLive(o: BoardOrderRow, nowIso: string, floorIso: string): boolean {
  if (o.status !== "paid") return false;
  if (o.togo_status !== "preparing" && o.togo_status !== "ready") return false;
  // The window is on the DUE time (the expo's rule): a slotted order by its slot, an ASAP one by
  // when it was placed.
  const due = Date.parse(o.pickup_slot ?? o.created_at);
  if (!(due >= Date.parse(floorIso))) return false;
  // A held order is not being prepared yet — but a READY bag is ready whatever the schedule said.
  if (o.togo_status === "ready" || o.fire_at === null) return true;
  return Date.parse(o.fire_at) <= Date.parse(nowIso);
}

/**
 * Is the order a BAG — at least one food line among its takeaway lines? `undefined` is "the lines
 * could not be read": the code publishes (the wall's shipped behaviour), because a hidden real bag is a
 * guest never called, which is worse than a basket called Ready. An empty list is no bag at all.
 */
export function boardOrderIsBag(lines: readonly { fulfillment: string }[] | undefined): boolean {
  if (lines === undefined) return true;
  return lines.length > 0 && !isScanGoBasket(lines);
}

/** The read's NARROWING filters (PostgREST `or` expressions), the rule's superset: the due window,
 *  and the fire-time gate that only a preparing bag answers to. */
export function boardOrderWindowOr(floorIso: string): string {
  return `pickup_slot.gte.${floorIso},and(pickup_slot.is.null,created_at.gte.${floorIso})`;
}
export function boardOrderFireOr(nowIso: string): string {
  return `togo_status.eq.ready,fire_at.is.null,fire_at.lte.${nowIso}`;
}

/**
 * The two narrowing filters as ONE PostgREST expression, `and(or(window),or(fire))` (#360, question
 * a). Chained `.or()`s send two `or=` params (`postgrest-js` APPENDS each); that two top-level logic
 * params AND together is PostgREST's behaviour but nothing in this repo PROVES it, so the read sends
 * one parameter whose conjunction is explicit. Still only a NARROWING (the TS rule decides).
 */
export function boardOrderReadOr(floorIso: string, nowIso: string): string {
  return `and(or(${boardOrderWindowOr(floorIso)}),or(${boardOrderFireOr(nowIso)}))`;
}
