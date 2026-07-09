"use client";
import { useEffect, useState } from "react";
import { useActiveOrder, type ActiveOrder } from "./ActiveOrderProvider";
import { useOrderStatus, type TrackedOrder } from "@/lib/useOrderStatus";
import { resolveSplitOrderId } from "@/lib/order-actions";

export type ActiveOrderStatus = {
  order: ActiveOrder | null;
  tracked: TrackedOrder | null;
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

  // Resolve a split order id (no PI) so split orders can be tracked. Server action → setState in the .then is
  // async (lint-safe). Only when tracking + it's a split order carrying a cart id.
  const [splitOrderId, setSplitOrderId] = useState<string | null>(null);
  const cartId = order?.cartId ?? null;
  const needSplit = track && !!order && !order.paymentIntent && !!cartId;
  useEffect(() => {
    if (!needSplit || !cartId) return;
    let active = true;
    resolveSplitOrderId(cartId)
      .then((id) => {
        if (active) setSplitOrderId(id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [needSplit, cartId]);

  const pi = track ? (order?.paymentIntent ?? null) : null;
  const oid = track ? splitOrderId : null;
  const { order: tracked } = useOrderStatus(pi, oid);

  const ready = tracked?.togoStatus === "ready";
  const isDone =
    !!tracked &&
    (tracked.togoStatus === "picked_up" ||
      tracked.status === "refunded" ||
      tracked.status === "failed");

  // Retire the resumable order on a terminal state. clearOrder defers its setState (rAF) → lint-safe.
  useEffect(() => {
    if (order && isDone) clearOrder();
  }, [order, isDone, clearOrder]);

  const statusWord = !order
    ? null
    : tracked
      ? ready
        ? "Ready"
        : tracked.togoStatus === "preparing"
          ? "Preparing"
          : "Placed"
      : "Confirming";

  return { order, tracked, statusWord, ready, isDone };
}
