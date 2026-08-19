"use client";
import { useEffect, useState } from "react";
import { useActiveOrder, type ActiveOrder } from "./ActiveOrderProvider";
import { useOrderStatus, type TrackedOrder } from "@/lib/useOrderStatus";
import { resolveSplitOrderId } from "@/lib/order-actions";
import {
  kindFromTrackedOrder,
  liveOrderStatusWord,
  type LiveOrderKind,
} from "@/lib/live-order";

export type ActiveOrderStatus = {
  order: ActiveOrder | null;
  tracked: TrackedOrder | null;
  /** The order's mode, off the SAME ladder the server read uses. null until the row lands. */
  kind: LiveOrderKind | null;
  /** Short live-status word for the pill/card: null (no order), "Confirming" (loading), else the state. */
  statusWord: string | null;
  ready: boolean;
  isDone: boolean;
};

/**
 * Shared live-status for the wayfinding pill + homepage resume card (M-nav follow-up). Reads the wayfinding
 * store, resolves the split-tender order id (server action) when there's no PaymentIntent — so SPLIT orders
 * get live status too, not just single-pay — tracks the order via `useOrderStatus`, and retires it when
 * terminal.
 *
 * `track` gates the subscription so exactly ONE consumer subscribes per route: the header pill is hidden on
 * `/` and `/track` (where the homepage card / OrderTracker already track), so it passes `track=false` there
 * and the hook opens no channel — collapsing what would otherwise be a duplicate realtime subscription.
 */
export function useActiveOrderStatus(track: boolean): ActiveOrderStatus {
  const { order, clearOrder } = useActiveOrder();

  // Resolve a split order id (no PI) so split orders can be tracked. The resolved id is stored WITH its cart
  // id and used only when it matches the CURRENT order's cart (below) — so a stale id from a prior split
  // order can't leak into the next order via useOrderStatus's orderId-precedence and wrongly retire it.
  const [resolved, setResolved] = useState<{ cartId: string; id: string | null } | null>(null);
  const cartId = order?.cartId ?? null;
  const needSplit = track && !!order && !order.paymentIntent && !!cartId;
  useEffect(() => {
    if (!needSplit || !cartId) return;
    let active = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Server action → setState in the .then is async (lint-safe). Bounded retry (~4×2s) covers the brief
    // post-capture race where the order id isn't stamped yet (resolve returns null); it stops once found.
    const attempt = () => {
      tries += 1;
      resolveSplitOrderId(cartId)
        .then((id) => {
          if (!active) return;
          setResolved({ cartId, id });
          if (id == null && tries < 4) timer = setTimeout(attempt, 2000);
        })
        .catch(() => {
          if (active && tries < 4) timer = setTimeout(attempt, 2000);
        });
    };
    attempt();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [needSplit, cartId]);

  const pi = track ? (order?.paymentIntent ?? null) : null;
  // Use the split id ONLY for the current split order (matching cart) — never let a stale id leak to a
  // single-pay or a different order (orderId takes precedence over the PI in useOrderStatus).
  const oid =
    track && order && !order.paymentIntent && resolved?.cartId === cartId ? resolved.id : null;
  const { order: tracked, timedOut } = useOrderStatus(pi, oid);

  // W22b — ONE derivation. The kind comes from the same ladder the server read uses
  // (`kindFromTrackedOrder`), and the word from the same function the tray and /account "Today" speak
  // (`liveOrderStatusWord`). Before this the hook re-derived its own ladder off the raw `togo_status`
  // column and told two lies the server never told: a pure GROCERY basket read "Preparing" (the DB
  // stamps 'preparing' on grocery lines at PAYMENT — mms_init_togo_status fires on
  // `fulfillment in ('togo','grocery')` — but nobody is cooking a basket the shopper already carries),
  // and it read "Ready" when the expo had merely verified that basket's exit pass. /track refused both;
  // the header pill did not, and the pill MORPHS into /track's chip on the tap (`.vt-order-status`), so
  // the J1 cut cross-faded two different claims about one order.
  const kind = tracked ? kindFromTrackedOrder(tracked) : null;
  // "Ready" as a STATE (the lit chip) — not merely the raw column. A grocery basket is never "ready"
  // in the sense the chip lights for: there was no wait to end.
  const ready = !!tracked && kind !== "grocery" && tracked.togoStatus === "ready";
  const isDone =
    !!tracked &&
    (tracked.togoStatus === "picked_up" ||
      tracked.status === "refunded" ||
      tracked.status === "failed");

  // Retire the resumable order on a terminal state. clearOrder defers its setState (rAF) → lint-safe.
  useEffect(() => {
    if (order && isDone) clearOrder();
  }, [order, isDone, clearOrder]);

  // W9c — the pill used to fall back to "Confirming" for as long as `tracked` was null, which is
  // FOREVER once the live read gives up: the poll exhausts at ~30s and, on a cleared table, the
  // `is_member` RLS never lets the row through again. A diner who has paid, eaten and left carried a
  // header pill still claiming their payment was being confirmed.
  //
  // `timedOut` is the honest boundary. We hold a client record of a placed order, so "Placed" is the
  // floor we can actually stand on; what we no longer know is the KITCHEN state, and "Confirming" was
  // never about the kitchen anyway.
  //
  // ⚠️ Label only. Deliberately NOT `clearOrder()` here: `useOrderStatus` gives up POLLING at ~30s but
  // deliberately keeps its Realtime subscription open, so a merely-slow webhook still resolves — and
  // retiring the order would destroy a just-paid SPLIT order's only route back to /track (it has no
  // `payment_intent` in any URL). The pill must go quiet, not disappear.
  const statusWord = !order
    ? null
    : tracked && kind
      ? liveOrderStatusWord({ kind, togoStatus: tracked.togoStatus })
      : timedOut
        ? "Placed"
        : "Confirming";

  return { order, tracked, kind, statusWord, ready, isDone };
}
