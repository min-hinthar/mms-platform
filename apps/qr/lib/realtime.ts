"use client";
import { useEffect, useRef, useState } from "react";
import { browserClient } from "@mms/db";

/**
 * Multi-device group cart. Diners join the PRIVATE channel `table:{sessionId}`.
 * Authorization is enforced by RLS on realtime.messages (see migration) — only members
 * of an active session, proven by their table-session JWT, can read/send. No client-
 * asserted identity is trusted. Presence = who's at the table; broadcast = cart changes.
 */
export function useGroupCart(
  sessionId: string,
  accessToken: string,
  me: { seat: string; name: string },
) {
  const { seat, name } = me; // stable primitives from the session JWT — see the deps array below
  const [members, setMembers] = useState<{ seat: string; name: string }[]>([]);
  const chanRef = useRef<ReturnType<ReturnType<typeof browserClient>["channel"]> | null>(null);

  useEffect(() => {
    if (!sessionId || !accessToken) return;
    const supa = browserClient();
    supa.realtime.setAuth(accessToken); // the scoped table-session JWT
    const channel = supa.channel(`table:${sessionId}`, {
      config: { private: true, presence: { key: sessionId } },
    });
    chanRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ seat: string; name: string }>();
        setMembers(
          Object.values(state)
            .flat()
            .map((p) => ({ seat: p.seat, name: p.name })),
        );
      })
      .on("broadcast", { event: "cart_changed" }, () => {
        // re-fetch the server-authoritative cart (server is the source of truth)
        window.dispatchEvent(new CustomEvent("mms:cart-refresh"));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ seat, name }); // stable seat/name from the JWT — no per-subscribe presence churn
        }
      });

    return () => {
      supa.removeChannel(channel);
    };
  }, [sessionId, accessToken, seat, name]);

  const announceChange = () =>
    chanRef.current?.send({ type: "broadcast", event: "cart_changed", payload: {} });

  return { members, announceChange };
}
