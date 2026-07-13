"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sessionMintOutput } from "@mms/db/schemas";
import { useAnonSession } from "./useAnonSession";

export type TableSession = {
  cartId: string;
  sessionId: string;
  seat: string;
  accessToken: string;
  role: "host" | "guest";
  /** The code other phones scan/enter to join this dine-in session (== the session's qr_code). */
  joinCode: string;
};

const DINEIN_KEY = "mms.qr.dinein";
const NAME_KEY = "mms.name";

/**
 * Resolve the session key (== qr_code == join code) for this device + mode.
 *
 * - **dine-in (group, M3·P3.1):** the shared key comes from the deep link (`?t=`/`?j=` → `code`) or
 *   a prior join persisted in localStorage, so every phone at the table converges on ONE session.
 *   When a host starts fresh with neither, we return `undefined` → the server mints an unguessable
 *   code and returns it (persisted below so a reload rejoins the same session).
 * - **solo (scan-&-go / pickup):** a stable per-device id — each device is its own session.
 */
function resolveQrCode(mode: string, code: string | undefined): string | undefined {
  if (mode === "dinein") {
    if (code) {
      window.localStorage.setItem(DINEIN_KEY, code);
      return code;
    }
    return window.localStorage.getItem(DINEIN_KEY) ?? undefined; // undefined → server mints one
  }
  const key = `mms.qr.${mode}`;
  let v = window.localStorage.getItem(key);
  if (!v) {
    v = `${mode}-${crypto.randomUUID()}`;
    window.localStorage.setItem(key, v);
  }
  return v;
}

/**
 * Establishes the diner's table session + open cart for `mode` and returns it. Waits for the
 * anonymous-auth session (AnonAuthGate), then POSTs `/api/session` with the Bearer anon token; the
 * server verifies it, records membership, and find-or-creates the open cart (server-authoritative —
 * the client never invents a cart id). Idempotent: re-POSTing returns the same active session/cart.
 *
 * `opts.code` is the dine-in join key from the entry deep link (a scanned sticker token or the
 * host's invite code). Group-cart presence/split build on the returned `role` + `joinCode`.
 */
export function useTableSession(
  mode: string,
  opts?: { code?: string; joinOnly?: boolean; door?: "dinein" | "pickup" | "togo" | "grocery" },
) {
  const anon = useAnonSession();
  const code = opts?.code;
  const joinOnly = opts?.joinOnly ?? false;
  const door = opts?.door;
  const [session, setSession] = useState<TableSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const minting = useRef(false);
  const [nonce, setNonce] = useState(0);

  // Force a re-mint (client recovery from a silently-expired session): clear the cached session so the
  // effect re-POSTs /api/session. With the expiry fix that re-mint either RENEWS the same session
  // (transient blip → same cartId) or, if it had truly expired, sweeps it + mints a FRESH session+cart
  // — so a stranded diner recovers without a manual reload. The nonce re-arms the effect even if the
  // session was already null; failed re-mints set `error` (no session change) so there's no retry loop.
  const revalidate = useCallback(() => {
    minting.current = false;
    setSession(null);
    setError(null); // clear a prior failure so a successful retry dismisses the recovery banner
    setNonce((n) => n + 1);
  }, []);

  // Strip the join code (`?t=`/`?j=`) from the address bar once mounted — it's already captured as the
  // `code` prop and persisted to localStorage by resolveQrCode, so a reload still rejoins. Keeps the
  // live session credential out of browser history + the Referer header on the next navigation
  // (defense-in-depth alongside the PostHog before_send scrub).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("t") && !url.searchParams.has("j")) return;
    url.searchParams.delete("t");
    url.searchParams.delete("j");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    // `mode` is fixed for a mounted page (each route passes a constant). A re-mint is driven by
    // `revalidate()` (clears session + bumps nonce); a *runtime* mode change still no-ops — remount
    // the route to switch modes.
    if (!anon || session || minting.current) return;
    minting.current = true;
    const qrCode = resolveQrCode(mode, code); // may be undefined for a dine-in host-start
    const storedName = window.localStorage.getItem(NAME_KEY);
    fetch("/api/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anon.accessToken}`,
      },
      body: JSON.stringify({
        ...(qrCode ? { qrCode } : {}),
        ...(door ? { door } : {}), // K0: analytics-only door tag (validated server-side)
        mode,
        ...(storedName ? { name: storedName } : {}),
        // Only the invite-code path (a present `code` we didn't generate) is join-only; a host-start
        // (no code → server mints one) must be allowed to create.
        ...(joinOnly && qrCode ? { joinOnly: true } : {}),
      }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        // Parse the response shape (not just trust the cast) — a missing/blank cartId from a deploy
        // skew throws here instead of silently driving a cart-less UI.
        return sessionMintOutput.parse(await r.json());
      })
      .then((d) => {
        // Persist the resolved dine-in code so a reload (or a tab without the deep-link param)
        // rejoins the SAME session instead of the host minting a second one.
        if (mode === "dinein") window.localStorage.setItem(DINEIN_KEY, d.joinCode);
        setSession({
          cartId: d.cartId,
          sessionId: d.sessionId,
          seat: d.seat,
          accessToken: anon.accessToken,
          role: d.role,
          joinCode: d.joinCode,
        });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not start session"))
      .finally(() => {
        minting.current = false;
      });
  }, [anon, mode, session, code, joinOnly, door, nonce]);

  return { session, loading: !session && !error, error, revalidate };
}
