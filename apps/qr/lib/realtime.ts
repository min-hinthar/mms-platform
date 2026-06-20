"use client";
import { useEffect, useRef, useState } from "react";
import { browserClient } from "@mms/db";

export type PresenceMember = { seat: string; name: string };

/** Sanitize a client-asserted presence string on ingest: drop control/format chars (zero-width,
 *  RTL-override, etc.), collapse whitespace, clamp length. Never trust a peer's payload verbatim. */
function cleanPresence(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Multi-device group cart presence (M3·P3.1). Diners join the PRIVATE channel `table:{sessionId}`.
 * Authorization is enforced by RLS on realtime.messages (see migration) — only members of an
 * active session, proven by their **anonymous-auth** access token (is_member joins session_members
 * on auth.uid(); see docs/BACKEND_ARCHITECTURE.md §3), can read/send. No client-asserted identity is
 * trusted. Presence = who's at the table (the guest list). Live CART changes ride a separate
 * Postgres-Changes subscription (useCartRealtime below), not this channel's broadcast.
 *
 * `accessToken` is the diner's Supabase anonymous-auth access token; `me.seat` == auth.uid() and is
 * STABLE (from the session) — it's the presence key, so re-renders don't churn presence into ghosts
 * (LEARNINGS #4). `me.name` can change (the diner renames their seat) and re-tracks WITHOUT
 * resubscribing the channel.
 */
export function useGroupCart(
  sessionId: string,
  accessToken: string,
  me: { seat: string; name: string },
) {
  const { seat, name } = me;
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const chanRef = useRef<ReturnType<ReturnType<typeof browserClient>["channel"]> | null>(null);
  const subscribed = useRef(false);
  const nameRef = useRef(name);

  // Keep the latest name in a ref (updated in an effect, never during render) so a (re)subscribe
  // tracks the current name without putting `name` in the subscribe deps (which would churn the
  // channel — presence ghosts, LEARNINGS #4). Live renames are handled by the rename effect below.
  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  useEffect(() => {
    if (!sessionId || !accessToken || !seat) return;
    const supa = browserClient();
    supa.realtime.setAuth(accessToken); // the diner's anon-auth JWT — RLS gates the private channel
    const channel = supa.channel(`table:${sessionId}`, {
      config: { private: true, presence: { key: seat } }, // key by SEAT → one entry per diner
    });
    chanRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceMember>();
        // Key by the presence KEY (the seat each client registered via `presence.key`), which is the
        // realtime identity — not the payload's `seat` (a peer could spoof that). The display NAME is
        // CLIENT-ASSERTED and does NOT pass the Zod/DB cap, so sanitize on ingest: strip control/
        // format chars (zero-width, RTL-override) + clamp length, so a hostile co-member can't garble
        // or break-layout everyone's guest list. One entry per key (take the first ref on a rejoin).
        const members: PresenceMember[] = [];
        for (const [key, entries] of Object.entries(state)) {
          const p = entries[0];
          if (p) members.push({ seat: key, name: cleanPresence(p.name, 40) });
        }
        setMembers(members);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          subscribed.current = true;
          await channel.track({ seat, name: nameRef.current });
        }
      });

    return () => {
      subscribed.current = false;
      supa.removeChannel(channel);
    };
  }, [sessionId, accessToken, seat]);

  // Rename in place: update this seat's presence payload without tearing down the channel.
  useEffect(() => {
    if (subscribed.current) void chanRef.current?.track({ seat, name });
  }, [seat, name]);

  return { members };
}

/** A cart-change event handed to the consumer: the kind + (for an INSERT) the new line's adder/name,
 *  so the UI can announce "[peer] added [item]" honestly. We don't expose the full row — only the
 *  fields the UI needs — and the consumer re-fetches the SERVER-authoritative view regardless. */
export type CartChange = {
  table: "qr_cart_items" | "qr_carts";
  eventType: "INSERT" | "UPDATE" | "DELETE";
  bySeat: string | null;
  itemName: string | null;
};

/**
 * Live group-cart sync (M3·P3.2). Subscribes to Postgres Changes on the cart + its lines (filtered to
 * THIS cart) and calls `onChange` for each — the consumer re-fetches `getCartView` (server-authoritative
 * merge into keyed React state; never client math). Authorization is the existing member-gated SELECT
 * RLS on qr_carts/qr_cart_items, enforced per-subscriber by Realtime. Mirrors the /track pattern
 * (lib/useOrderStatus). `onChange` is held in a ref so a new closure each render never resubscribes.
 */
export function useCartRealtime(
  cartId: string,
  accessToken: string,
  enabled: boolean,
  onChange: (c: CartChange) => void,
) {
  const cbRef = useRef(onChange);
  useEffect(() => {
    cbRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || !cartId || !accessToken) return;
    // `browserClient()` is the memoized @supabase/ssr client — this hook + useGroupCart share ONE
    // socket; setAuth(token) is idempotent with the same anon token (don't pass a different one).
    const supa = browserClient();
    supa.realtime.setAuth(accessToken); // RLS gates Postgres Changes per-subscriber
    const emit = (table: CartChange["table"]) => (payload: { eventType: string; new: unknown }) => {
      const row = (payload.new ?? {}) as { by_seat?: string | null; name?: string | null };
      cbRef.current({
        table,
        eventType: payload.eventType as CartChange["eventType"],
        bySeat: row.by_seat ?? null,
        itemName: row.name ?? null,
      });
    };
    const channel = supa
      .channel(`cart:${cartId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "qr_cart_items", filter: `cart_id=eq.${cartId}` },
        emit("qr_cart_items"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "qr_carts", filter: `id=eq.${cartId}` },
        emit("qr_carts"),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Self-heal: re-fetch on every (re)subscribe so a change missed while the socket was down —
          // or in the gap between the initial server render and this subscription — is caught. A
          // benign qr_carts UPDATE signal triggers the consumer's refresh without an announce.
          cbRef.current({ table: "qr_carts", eventType: "UPDATE", bySeat: null, itemName: null });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Don't let cross-device sync degrade silently (parity with useOrderStatus). The cart still
          // updates on the diner's OWN actions; this surfaces the dropped sync for triage, and the
          // SUBSCRIBED self-heal above recovers missed changes once the socket reconnects.
          console.error(`[useCartRealtime] channel ${status} for cart ${cartId}`);
        }
      });
    return () => {
      supa.removeChannel(channel);
    };
  }, [cartId, accessToken, enabled]);
}
