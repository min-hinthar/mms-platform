"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getMyLiveOrders } from "./orders";
import type { LiveOrder } from "./live-order";

/**
 * K4 — the client freshness layer over `getMyLiveOrders`. The plan's "one realtime-ish freshness rule":
 * refetch on mount, on `visibilitychange`→visible, and on window focus (the J3 pattern) — NO new realtime
 * channels (the single collapsed pill keeps its one existing channel via useActiveOrderStatus; the tray is
 * a poll). `pokeKey` lets a caller nudge a refetch when a NEW order is placed (its key changes) so the
 * count/tray catch up shortly after the webhook stamps earned_by; the visibility/focus refetch is the
 * backstop for the redirect→stamp race.
 *
 * `enabled` gates the whole thing (the header only needs live orders where the pill can show — not on
 * `/`/`/track`). A stale-response guard (a monotonic request id) drops out-of-order responses; a transient
 * failure keeps the last good list rather than flashing empty (the badge shouldn't blink on a blip).
 */
export function useLiveOrders(
  enabled: boolean,
  pokeKey?: string | null,
): { orders: LiveOrder[]; loading: boolean; refetch: () => void } {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [loading, setLoading] = useState(enabled);
  const reqRef = useRef(0);

  const load = useCallback(() => {
    if (!enabled) return;
    const req = ++reqRef.current;
    getMyLiveOrders()
      .then((o) => {
        if (req === reqRef.current) {
          setOrders(o);
          setLoading(false);
        }
      })
      .catch(() => {
        // Keep the last good list on a transient failure; just clear the loading state.
        if (req === reqRef.current) setLoading(false);
      });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    // Defer the initial load a frame so the setState it reaches isn't a synchronous setState-in-effect
    // (lint-safe, matching TierUpCelebration / MergeRedeemer). The listeners below call load() from event
    // callbacks, where setState is allowed.
    const raf = requestAnimationFrame(load);
    // A tab return fires visibilitychange AND focus near-simultaneously — coalesce them into ONE load via a
    // short timer (the two would otherwise be two round-trips). Only wakes when actually visible. The poke
    // (deps below) + manual refetch still call load() directly, un-coalesced.
    let wake: ReturnType<typeof setTimeout> | undefined;
    const onWake = () => {
      if (document.visibilityState !== "visible" || wake) return;
      wake = setTimeout(() => {
        wake = undefined;
        load();
      }, 50);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      cancelAnimationFrame(raf);
      if (wake) clearTimeout(wake);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [enabled, load, pokeKey]); // pokeKey change = a new order / navigation → refetch

  return {
    orders: enabled ? orders : [],
    loading: enabled ? loading : false,
    refetch: load,
  };
}
