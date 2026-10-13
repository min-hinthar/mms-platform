"use client";
// The read is `getSplitContext` (member-gated, lib/split) and the decision it feeds is
// `leaveWarning` (lib/session-truth); both this hook's read and that rule carry `lcs/` mutants.
import { useEffect, useState } from "react";
import { getSplitContext } from "./split";

/**
 * Session truth (finding 5, Codex rounds 1–2 on #361) — the table's DURABLE party, for the host's
 * "Leave this table" warning: the seats with a `session_members` row, read through the member-gated
 * `getSplitContext` the Bill already uses. Presence is not the party — it is empty before the first
 * sync, and a phone face down in a pocket drops out of it while its owner is still at the table.
 *
 * Read only when the answer can matter (`enabled`: this phone is the host at a dine-in table), per
 * cart, and again whenever `epoch` moves. The menu's epoch moves on the LEAVE FLOW OPENING (the door
 * sheet's open edge — a join is not seen by presence when the joiner's phone is already face down,
 * so presence alone could leave a minutes-old "alone" standing) and, as an extra trigger, on the
 * presence count.
 *
 * Answers `{ seats, current }`, where `current` says the seats were read FOR THIS EPOCH: false while
 * the read the epoch asked for is still out, or failed — the caller then must not treat an older
 * "alone" as established (`leaveWarning`). `null` until any read has landed for this cart.
 */
export function useDurableParty(
  cartId: string | null,
  enabled: boolean,
  epoch: string,
): { seats: readonly string[]; current: boolean } | null {
  const [party, setParty] = useState<{ cartId: string; seats: string[]; epoch: string } | null>(
    null,
  );
  useEffect(() => {
    if (!enabled || !cartId) return;
    let active = true;
    void getSplitContext(cartId)
      .then((ctx) => {
        if (active) setParty({ cartId, seats: ctx.members.map((m) => m.seat), epoch });
      })
      .catch(() => {
        /* deliberate: an unreadable party leaves `current` false — the caller hedges (`leaveWarning`) */
      });
    return () => {
      active = false;
    };
  }, [cartId, enabled, epoch]);
  if (!enabled || !party || party.cartId !== cartId) return null;
  return { seats: party.seats, current: party.epoch === epoch };
}
