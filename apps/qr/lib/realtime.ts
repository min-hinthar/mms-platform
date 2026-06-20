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
 * Multi-device group cart (M3). Diners join the PRIVATE channel `table:{sessionId}`.
 * Authorization is enforced by RLS on realtime.messages (see migration) — only members of an
 * active session, proven by their **anonymous-auth** access token (is_member joins session_members
 * on auth.uid(); see docs/BACKEND_ARCHITECTURE.md §3), can read/send. No client-asserted identity is
 * trusted. Presence = who's at the table (P3.1 guest list); broadcast = cart changes (P3.2 seam).
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
      .on("broadcast", { event: "cart_changed" }, () => {
        // P3.2 seam: a peer mutated the cart → re-fetch the server-authoritative view.
        window.dispatchEvent(new CustomEvent("mms:cart-refresh"));
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

  const announceChange = () =>
    chanRef.current?.send({ type: "broadcast", event: "cart_changed", payload: {} });

  return { members, announceChange };
}
