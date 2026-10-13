"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAnonSession } from "./useAnonSession";
import { useCartRealtime } from "./realtime";
import { useCoalescedRefresh } from "./echo-refresh";
import { getOrderKitchen } from "./order-kitchen-read";
import {
  kitchenPending,
  kitchenRereadDelayMs,
  kitchenRows,
  type KitchenLine,
} from "./order-kitchen";

// verify:slice-exempt — read and subscription wiring with no money derivation of its own: what
// the lines MEAN is decided in lib/order-kitchen.ts and lib/kitchen-track.ts (their mutants), and
// who may read them is the diner's own RLS inside lib/order-kitchen-read.ts (its mutants). This file
// only says WHEN to ask again; its wake is pinned by lib/useOrderKitchen.test.tsx.

/** What /track knows about the kitchen's work on a paid order, right now. */
export type OrderKitchenView =
  /** Not asked: the arm on screen has no kitchen line to draw. */
  | { status: "off" }
  /** The first read is out. */
  | { status: "loading" }
  /** The paid cart's lines, and the DB clock they were read against. */
  | { status: "ready"; lines: KitchenLine[]; nowIso: string }
  /** Not this device's to read (no longer a member of an OPEN session): say nothing about the kitchen. */
  | { status: "unreadable" }
  /** The first read failed: the next wake asks again. A failure after a good read keeps that read. */
  | { status: "error" };

/** A held pickup's Send can be hours away; one timer never waits longer than this before re-reading. */
const MAX_WAIT_MS = 6 * 60 * 60 * 1000;
/** A tab return fires `visibilitychange` AND `focus`: one read for both, after the host's own. */
const WAKE_COALESCE_MS = 300;

/**
 * Lifecycle audit (2026-10-13) — the post-order kitchen read, kept fresh (A, B, G): ONE read
 * (`getOrderKitchen`, the diner's own RLS), refreshed by
 *   • the cart's Realtime channel (`useCartRealtime` — the lines are on the publication, gated by the
 *     same `is_member` RLS; its SUBSCRIBED self-heal catches up after a dropped socket);
 *   • ONE scheduled re-read when the clock alone moves a stage (a Send leaving its grace, a bump
 *     leaving Mom's undo window — the Bill's rule, on the read's DB clock);
 *   • a return to the page (`visibilitychange→visible` / `focus`, coalesced) while a dish is still
 *     with the kitchen, or while the first read had failed.
 * Overlapping asks coalesce: one read in flight, at most one queued behind it.
 */
export function useOrderKitchen(orderId: string | null): OrderKitchenView {
  const anon = useAnonSession();
  const [view, setView] = useState<OrderKitchenView>(() =>
    orderId ? { status: "loading" } : { status: "off" },
  );
  const [cartId, setCartId] = useState<string | null>(null);
  // Reset on a key change, on the SAME render (the useOrderStatus pattern; lint bans the effect form).
  const [prevKey, setPrevKey] = useState(orderId);
  if (orderId !== prevKey) {
    setPrevKey(orderId);
    setView(orderId ? { status: "loading" } : { status: "off" });
    setCartId(null);
  }

  // The key an answer must still belong to, and the in-flight / queued pair. Refs, written in
  // effects and callbacks only — never during render.
  const keyRef = useRef(orderId);
  useEffect(() => {
    keyRef.current = orderId;
  }, [orderId]);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const loadRef = useRef<() => void>(() => {});

  const load = useCallback(() => {
    if (!orderId) return;
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    const key = orderId;
    getOrderKitchen({ orderId: key })
      .then((r) => {
        if (keyRef.current !== key) return;
        if (r.ok) {
          setView({ status: "ready", lines: r.lines, nowIso: r.dbNow });
          setCartId(r.cartId);
        } else if (r.reason === "unreadable") {
          // Decided: the session closed or lapsed. The last stages would now be a claim about a
          // kitchen this device can no longer see, so they go — the arm's own words stay true.
          setView({ status: "unreadable" });
          setCartId(null);
        } else {
          setView((v) => (v.status === "ready" ? v : { status: "error" }));
        }
      })
      .catch(() => {
        // Deliberate: a thrown action is a failed read — keep a good view, else say error (the wake
        // retries). Never an empty kitchen.
        if (keyRef.current === key)
          setView((v) => (v.status === "ready" ? v : { status: "error" }));
      })
      .finally(() => {
        inFlight.current = false;
        if (queued.current) {
          queued.current = false;
          loadRef.current();
        }
      });
  }, [orderId]);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // The first read, a frame after mount (a deferred setState, the codebase's lint-safe form).
  useEffect(() => {
    if (!orderId) return;
    const raf = requestAnimationFrame(() => load());
    return () => cancelAnimationFrame(raf);
  }, [orderId, load]);

  // Every change to the paid cart's lines (and the channel's (re)subscribe) asks again — through the
  // ONE echo window (M193): a Send or a ticket bump writes several rows at once, and one re-read
  // answers them all.
  const scheduleEchoRefresh = useCoalescedRefresh(load);
  useCartRealtime(cartId ?? "", anon?.accessToken ?? "", scheduleEchoRefresh);

  // The clock's own re-read: when a Send leaves its grace or a bump leaves Mom's undo window.
  useEffect(() => {
    if (view.status !== "ready") return;
    const ms = kitchenRereadDelayMs(view.lines, Date.parse(view.nowIso));
    if (ms === null) return;
    const t = window.setTimeout(load, Math.min(ms, MAX_WAIT_MS));
    return () => window.clearTimeout(t);
  }, [view, load]);

  // The wake: back on the page while a dish is still cooking (or the first read failed) → ask again.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    if (!orderId) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onWake = () => {
      if (document.visibilityState !== "visible" || t) return;
      t = setTimeout(() => {
        t = undefined;
        const v = viewRef.current;
        if (
          v.status === "error" ||
          (v.status === "ready" && kitchenPending(kitchenRows(v.lines, v.nowIso)))
        )
          load();
      }, WAKE_COALESCE_MS);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      if (t) clearTimeout(t);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [orderId, load]);

  return orderId ? view : { status: "off" };
}
