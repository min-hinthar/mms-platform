"use client";
import { useEffect, useRef } from "react";
import { browserClient } from "@mms/db";

/**
 * Live staff floor view (S1.2). Subscribes a STAFF socket to Postgres Changes across the floor tables
 * and fires `onChange` for each — the consumer re-fetches the server-authoritative snapshot
 * (getFloorView / getTableDetail), never client math (mirrors useCartRealtime). Authorization is the
 * EXISTING is_staff() branch S1.1a folded into each table's SELECT policy; Realtime enforces RLS
 * per-subscriber, so a staff socket receives every active table's events. NON-private channel by design
 * (postgres_changes is RLS-gated). NOTE(S2): a staff BROADCAST push (KDS → floor) would need
 * `{ config: { private: true } }` + a `realtime.messages` is_staff() policy — out of scope for this
 * read-only view (same caveat as lib/realtime.ts cart/shares).
 *
 * Unlike the diner hooks, the access token isn't passed in — staff auth lives in the @supabase/ssr
 * cookie session, so the hook reads it via getSession() and feeds it to realtime.setAuth before
 * subscribing. `onChange` is held in a ref so a fresh closure each render never resubscribes.
 */
export function useFloorRealtime(
  enabled: boolean,
  onChange: () => void,
  // Scope to ONE session's tables (the detail page) by passing its id; omit for the whole-floor view.
  sessionId?: string,
  // On the detail page, the session's open cart id — so line changes (no session_id column) are watched
  // by cart_id. Omit on the whole-floor view (which listens to ALL line changes as a subtotal signal).
  cartId?: string | null,
) {
  const cbRef = useRef(onChange);
  useEffect(() => {
    cbRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled) return;
    const supa = browserClient();
    let channel: ReturnType<typeof supa.channel> | null = null;
    let cancelled = false;

    const filter = sessionId ? { filter: `session_id=eq.${sessionId}` } : {};
    const sessFilter = sessionId ? { filter: `id=eq.${sessionId}` } : {};

    (async () => {
      // Feed the staff JWT to Realtime so the per-subscriber RLS (is_staff) authorizes delivery.
      const { data } = await supa.auth.getSession();
      const token = data.session?.access_token;
      if (cancelled || !token) return;
      supa.realtime.setAuth(token);

      const fire = () => cbRef.current();
      channel = supa
        .channel(sessionId ? `floor:${sessionId}` : "floor")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "table_sessions", ...sessFilter },
          fire,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "session_members", ...filter },
          fire,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "qr_carts", ...filter },
          fire,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "qr_orders", ...filter },
          fire,
        )
        // qr_cart_items has no session_id, so it can't be session-filtered. Whole-floor: watch ALL line
        // changes (running-subtotal signal). Detail: filter by the open cart's id — line add/remove/qty
        // all emit a qr_cart_items change, so this is what keeps the drill-down live (nothing bumps
        // qr_carts.updated_at). No open cart yet → skip (the qr_carts INSERT, session-filtered above,
        // fires when a cart is created → re-fetch picks up the new cartId → this resubscribes).
        .on(
          "postgres_changes",
          cartId
            ? {
                event: "*",
                schema: "public",
                table: "qr_cart_items",
                filter: `cart_id=eq.${cartId}`,
              }
            : { event: "*", schema: "public", table: "qr_cart_items" },
          sessionId && !cartId ? () => {} : fire,
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // Self-heal: re-fetch on every (re)subscribe so a change missed while the socket was down,
            // or between the server render and this subscription, is caught (parity with useCartRealtime).
            cbRef.current();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            // Don't let the floor go silently stale — surface for triage; the 5s poll backstop + the
            // SUBSCRIBED self-heal recover missed changes once the socket reconnects.
            console.error(`[useFloorRealtime] channel ${status}`);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supa.removeChannel(channel);
    };
  }, [enabled, sessionId, cartId]);
}
