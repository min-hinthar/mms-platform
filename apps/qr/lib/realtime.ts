"use client";

// verify:slice-exempt — subscription wiring with no money derivation of its own: every field these
// channels carry is re-fetched server-authoritatively by the consumer (`getCartView` /
// `getSettlement`), which is where the mutants live. Same shape and same reason as
// `lib/useOrderStatus.ts`.
//
// ⚠️ WHAT THAT LEAVES UNGUARDED, said plainly: T10's rule — that `useCartRealtime` subscribes for
// EVERY mode — is enforced by the absence of an `enabled` parameter and by TypeScript, not by a
// mutant. Re-introducing a mode gate means re-adding a parameter and changing both call sites,
// which is a deliberate act rather than a one-word edit; but no test would go red for it. Filed as
// OPEN-ITEMS T17.
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
 * Live cart sync (M3·P3.2). Subscribes to Postgres Changes on the cart + its lines (filtered to
 * THIS cart) and calls `onChange` for each — the consumer re-fetches `getCartView` (server-authoritative
 * merge into keyed React state; never client math). Authorization is the existing member-gated SELECT
 * RLS on qr_carts/qr_cart_items, enforced per-subscriber by Realtime. Mirrors the /track pattern
 * (lib/useOrderStatus). `onChange` is held in a ref so a new closure each render never resubscribes.
 *
 * ⚠️ THERE IS NO `enabled` FLAG, AND THAT IS THE FIX FOR T10 RATHER THAN A SIMPLIFICATION. Both call
 * sites used to pass a MODE predicate — `isGroup` here, `canTab || isGroup` on the review step, and
 * both resolve to dine-in — so a `qr_carts` lock UPDATE never reached a pickup or scan-and-go tab.
 * The second tab on those modes kept showing live controls until something called `refresh()`, which
 * in practice was the diner's next mutation: refused server-side, snapped back, one wasted edit
 * before the freeze painted.
 *
 * T10's filed premise said widening this "changes channel scope and the RLS path on
 * `realtime.messages` (private channels, `is_member`)". MEASURED, and it is wrong for THIS hook: the
 * channel below is deliberately NON-private and carries no broadcast, so `realtime.messages` is not
 * in the path at all (that is `useGroupCart`'s). Delivery is gated by the ordinary SELECT RLS on
 * `qr_carts` (`is_member(session_id) or is_staff()`, no mode term) and both tables have been on the
 * `supabase_realtime` publication for every row since 20260620000600_cart_realtime.sql. So this
 * needed no migration and no policy — only the removal of a knob that could be narrowed again.
 *
 * The cost is a channel per cart on modes that did not open one. The SOCKET is unchanged: this hook
 * shares the one memoized `browserClient()` socket with `useGroupCart` and `useSettlementRealtime`,
 * so a solo pickup diner adds one channel to a connection /track already opens for every order.
 */
export function useCartRealtime(
  cartId: string,
  accessToken: string,
  onChange: (c: CartChange) => void,
) {
  const cbRef = useRef(onChange);
  useEffect(() => {
    cbRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!cartId || !accessToken) return;
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
    // NON-private channel by design: postgres_changes is RLS-gated per-subscriber on qr_carts/
    // qr_cart_items, so row delivery is authorized regardless of channel privacy. NOTE(S2): broadcast
    // is NOT covered by table RLS — if a future path (e.g. a KDS/staff push) adds `.send()` on this
    // channel, it must become `{ config: { private: true } }` + a `realtime.messages` policy for
    // `cart:*` (mirroring rt_member_read), or it ships unauthenticated to any subscriber. (Same guard
    // as lib/useOrderStatus.)
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
  }, [cartId, accessToken]);
}

/**
 * Live split-settlement board (M3·P3.3b). Subscribes to Postgres Changes on `qr_cart_shares` for THIS
 * cart and calls `onChange` for each — the consumer re-fetches `getSettlement` (server-authoritative;
 * never client math), so every phone sees shares flip pending → authorized → captured live. Auth is the
 * member-gated SELECT RLS on `qr_cart_shares`, enforced per-subscriber. Mirrors useCartRealtime; shares
 * the one memoized socket. `onChange` is held in a ref so a fresh closure each render never resubscribes.
 */
export function useSettlementRealtime(
  cartId: string,
  accessToken: string,
  enabled: boolean,
  onChange: () => void,
) {
  const cbRef = useRef(onChange);
  useEffect(() => {
    cbRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || !cartId || !accessToken) return;
    const supa = browserClient();
    supa.realtime.setAuth(accessToken);
    // NON-private channel by design (RLS-gated postgres_changes; see useCartRealtime). NOTE(S2): the
    // same broadcast caveat applies — adding `.send()` here requires `{ config: { private: true } }` +
    // a `realtime.messages` policy for `shares:*`, since table RLS doesn't cover broadcast.
    const channel = supa
      .channel(`shares:${cartId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "qr_cart_shares", filter: `cart_id=eq.${cartId}` },
        () => cbRef.current(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Self-heal: re-fetch on (re)subscribe so a change missed while the socket was down — or in
          // the gap before this subscription — is caught (parity with useCartRealtime).
          cbRef.current();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`[useSettlementRealtime] channel ${status} for cart ${cartId}`);
        }
      });
    return () => {
      supa.removeChannel(channel);
    };
  }, [cartId, accessToken, enabled]);
}
