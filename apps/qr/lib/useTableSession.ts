"use client";
import { useEffect, useRef, useState } from "react";
import { useAnonSession } from "./useAnonSession";

export type TableSession = {
  cartId: string;
  sessionId: string;
  seat: string;
  accessToken: string;
};

/**
 * A stable per-device QR identity per mode, so reloads reuse the SAME table session + cart instead
 * of minting a fresh one on every navigation. For dine-in this is the scanned physical table code;
 * for solo scan-&-go / pickup a per-device id is the honest stand-in until QR provisioning (M3+).
 */
function deviceQrCode(mode: string): string {
  if (typeof window === "undefined") return `${mode}-ssr`;
  const key = `mms.qr.${mode}`;
  let v = window.localStorage.getItem(key);
  if (!v) {
    v = `${mode}-${crypto.randomUUID()}`;
    window.localStorage.setItem(key, v);
  }
  return v;
}

/**
 * Establishes the diner's table session + open cart for `mode` and returns the `cartId`. Waits for
 * the anonymous-auth session (AnonAuthGate), then POSTs `/api/session` with the Bearer anon token;
 * the server verifies it, records membership, and find-or-creates the open cart (server-authoritative
 * — the client never invents a cart id). Idempotent: re-POSTing returns the same active session/cart.
 */
export function useTableSession(mode: string) {
  const anon = useAnonSession();
  const [session, setSession] = useState<TableSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const minting = useRef(false);

  useEffect(() => {
    // `mode` is fixed for a mounted page (each route passes a constant). Once a session exists we
    // never re-mint, so a *runtime* mode change would no-op — remount the route to switch modes.
    if (!anon || session || minting.current) return;
    minting.current = true;
    const qrCode = deviceQrCode(mode);
    fetch("/api/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anon.accessToken}`,
      },
      body: JSON.stringify({ qrCode, mode }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<{ sessionId: string; seat: string; cartId: string }>;
      })
      .then((d) =>
        setSession({
          cartId: d.cartId,
          sessionId: d.sessionId,
          seat: d.seat,
          accessToken: anon.accessToken,
        }),
      )
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not start session"))
      .finally(() => {
        minting.current = false;
      });
  }, [anon, mode, session]);

  return { session, loading: !session && !error, error };
}
