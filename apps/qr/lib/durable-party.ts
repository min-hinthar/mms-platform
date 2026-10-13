"use client";
// The read is `getSplitContext` (member-gated, lib/split) and the decision it feeds is
// `leaveTakesTheSend` (lib/session-truth); both this hook's read and that rule carry `lcs/` mutants.
import { useEffect, useState } from "react";
import { getSplitContext } from "./split";

/**
 * Session truth (finding 5, Codex round 1 on #361) — the table's DURABLE party, for the host's
 * "Leave this table" warning: the seats with a `session_members` row, read through the member-gated
 * `getSplitContext` the Bill already uses. Presence is not the party — it is empty before the first
 * sync, and a phone face down in a pocket drops out of it while its owner is still at the table.
 *
 * Read only when the answer can matter (`enabled`: this phone is the host at a dine-in table), per
 * cart, and again whenever `epoch` moves (the menu passes the presence count — a join is the only
 * event that grows the durable party, and it shows in presence first). Membership never shrinks
 * (a leave is device-only, W20), so a stale answer can only under-warn, never over-warn. `null`
 * while unknown or after a failed read: the caller claims nothing then.
 */
export function useDurableParty(
  cartId: string | null,
  enabled: boolean,
  epoch: number,
): readonly string[] | null {
  const [party, setParty] = useState<{ cartId: string; seats: string[] } | null>(null);
  useEffect(() => {
    if (!enabled || !cartId) return;
    let active = true;
    void getSplitContext(cartId)
      .then((ctx) => {
        if (active) setParty({ cartId, seats: ctx.members.map((m) => m.seat) });
      })
      .catch(() => {
        /* deliberate: an unreadable party claims nothing (`null` below) — the warning is advisory */
      });
    return () => {
      active = false;
    };
  }, [cartId, enabled, epoch]);
  return enabled && party && party.cartId === cartId ? party.seats : null;
}
