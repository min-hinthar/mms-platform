"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { readMyLiveOrders } from "./orders";
import { liveOrdersMoving, type LiveOrder } from "./live-order";

/** J — the opt-in re-poll's tick (`opts.poll`, /account "Today" alone). Each tick reads the server
 *  only while the page is visible and a fired bag is not yet Ready (`liveOrdersMoving`). Modest: a
 *  status word, not a ticker (the pickup page's own tick is 30 s too). */
export const LIVE_ORDERS_POLL_MS = 30_000;

/**
 * K4 — the client freshness layer over `getMyLiveOrders`. The plan's "one realtime-ish freshness rule":
 * refetch on mount, on `visibilitychange`→visible, and on window focus (the J3 pattern) — NO new realtime
 * channels (the single collapsed pill keeps its one existing channel via useActiveOrderStatus; the tray
 * refreshes on those events, never on a timer). The ONE timer is the opt-in `opts.poll` (J, below) that
 * only /account "Today" passes. `pokeKey` lets a caller nudge a refetch when a NEW order is placed (its key changes) so the
 * count/tray catch up shortly after the webhook stamps earned_by; the visibility/focus refetch is the
 * backstop for the redirect→stamp race.
 *
 * `enabled` gates the whole thing (the header only needs live orders where the pill can show — not on
 * `/`/`/track`). A stale-response guard (a monotonic request id) drops out-of-order responses; a transient
 * failure keeps the last good list rather than flashing empty (the badge shouldn't blink on a blip) —
 * a REJECTION and, since Phase 1c's blind review, a read that RESOLVED as failed (`readMyLiveOrders`
 * `ok: false`: `getMyLiveOrders` answers every read error with [], which used to be applied).
 *
 * Phase 1c · account-star — `initial`, a SERVER SNAPSHOT to start from (/account "Today", whose page has
 * just read the same `getMyLiveOrders`). Given one: the list starts there with `loading` false, the first
 * mount load is SKIPPED (the server read it a moment ago — refetching would only flash the same rows),
 * and a NEW snapshot (a `router.refresh()` after a sign-in or a merge re-renders the server page)
 * replaces the list via the render-time previous-prop compare, the sanctioned pattern AppHeader uses for
 * its pathname. The wake/focus refetch is unchanged, and it is the point: the email-code round trip
 * (switch to Mail, come back) is exactly a hidden→visible wake. Without `initial` — the AppHeader call —
 * nothing here changes: an empty start, `loading === enabled`, and a load on every mount.
 */
export function useLiveOrders(
  enabled: boolean,
  pokeKey?: string | null,
  initial?: LiveOrder[],
  /** J — re-poll while an order is still moving (`liveOrdersMoving`). OPT-IN: only /account "Today"
   *  (`AccountLiveOrders`) passes it — the one surface with no Realtime status of its own. The header
   *  (on /menu, /cart and the rest) relies on its realtime pill and its wake refetch, and never polls. */
  opts?: { poll?: boolean },
): { orders: LiveOrder[]; loading: boolean; refetch: () => void } {
  const [orders, setOrders] = useState<LiveOrder[]>(() => initial ?? []);
  const [loading, setLoading] = useState(enabled && initial === undefined);
  const reqRef = useRef(0);
  // The first mount load is skipped ONLY for a seeded caller. A ref, read and cleared inside the effect
  // (never during render), so a later `pokeKey` change still reloads as it always did. (React's dev-only
  // StrictMode effect re-run does load once — the second run finds the ref cleared; production does not.)
  const skipFirstLoad = useRef(initial !== undefined);
  const [seed, setSeed] = useState(initial);
  if (initial !== seed) {
    setSeed(initial);
    if (initial !== undefined) setOrders(initial);
  }
  // A NEW server snapshot supersedes every read already in flight (M225's rule, blind review): an
  // older response landing after it would overwrite the fresh snapshot — after a sign-in's
  // `router.refresh()`, possibly the previous uid's orders. A ref write is not render-legal, so the
  // bump rides a layout effect, which runs in the same commit that applies the snapshot.
  useLayoutEffect(() => {
    reqRef.current += 1;
  }, [seed]);

  const load = useCallback(() => {
    if (!enabled) return;
    const req = ++reqRef.current;
    readMyLiveOrders()
      .then((r) => {
        if (req === reqRef.current) {
          // A failed read keeps the last good list (see the docblock).
          if (r.ok) setOrders(r.orders);
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
    let raf: number | undefined;
    if (skipFirstLoad.current) skipFirstLoad.current = false;
    else raf = requestAnimationFrame(load);
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
      if (raf !== undefined) cancelAnimationFrame(raf);
      if (wake) clearTimeout(wake);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [enabled, load, pokeKey]); // pokeKey change = a new order / navigation → refetch

  // J (lifecycle audit, 2026-10-13) — /account "Today" has no Realtime, and the header pill is off on
  // /account on purpose (one claim per order per screen), so a guest who paid and stayed on the page
  // to save their Stars watched "Preparing" through the expo's Ready tap until they switched apps and
  // back. For a caller that OPTS IN (`poll` — /account alone, the blind pass on #359), a local tick
  // every LIVE_ORDERS_POLL_MS asks `liveOrdersMoving` on its own clock, and reads the server only while
  // the page is visible and a FIRED bag is not yet Ready: a held pickup, a dine-in row or a grocery row
  // costs no round trip, and a held pickup starts the reads by itself once its `fire_at` passes.
  const poll = enabled && !!opts?.poll && orders.length > 0;
  const ordersRef = useRef(orders);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);
  useEffect(() => {
    if (!poll) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible" && liveOrdersMoving(ordersRef.current, Date.now()))
        load();
    }, LIVE_ORDERS_POLL_MS);
    return () => window.clearInterval(t);
  }, [poll, load]);

  return {
    orders: enabled ? orders : [],
    loading: enabled ? loading : false,
    refetch: load,
  };
}
