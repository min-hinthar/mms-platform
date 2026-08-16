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
  /** K2: the registered table number (1–10) this dine-in session is seated at, or null for a
   *  host-mint code / unregistered sticker / solo mode. Drives "Table 7" on the greeting + guest list. */
  tableNumber: number | null;
  /** W5a: true when the mint CREATED a fresh session (vs rejoined) — lets a resume-intent entry
   *  tell the diner their old table had ended instead of silently landing in an empty cart. */
  created: boolean;
};

const DINEIN_KEY = "mms.qr.dinein";
const NAME_KEY = "mms.name";

/**
 * W20 (owner: "customers should have option to leave tables") — leave the table ON THIS DEVICE.
 * Purely device-level: forgets the persisted join code so this phone stops auto-rejoining the
 * party's session. Deliberately NEVER a server mutation — the session stays open for everyone
 * else at the table (the 4h sliding TTL sweeps it), and a guest must not be able to end the
 * party's table from their pocket. Lives here so the key stays named once.
 */
export function forgetDineinOnThisDevice(): void {
  try {
    window.localStorage.removeItem(DINEIN_KEY);
  } catch {
    /* deliberate: storage unavailable (private mode) means nothing was persisted to forget */
  }
}

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
    // W9a — do NOT persist the code here. This runs BEFORE the mint, so a mistyped or stale `?j=`
    // code used to be written to localStorage even when the server rejected it with a 404 — and it
    // then drove every LATER bare `/menu?mode=dinein`, where `joinOnly` is false, so the server
    // provisioned a brand-new table keyed to the typo with this diner as host. The menu looked
    // completely normal (party of one, no error) while their order accumulated on a cart the real
    // party could never see. Only a code the server ACCEPTED is persisted (post-mint, below).
    if (code) return code;
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
  opts?: {
    code?: string;
    joinOnly?: boolean;
    door?: "dinein" | "pickup" | "togo" | "grocery";
    /** K2: the table number from the dine-in picker's claim path (`?table=N`). The server resolves
     *  it to that table's registered token — the token never travels through the client. */
    tableNumber?: number;
  },
) {
  const anon = useAnonSession();
  const code = opts?.code;
  const joinOnly = opts?.joinOnly ?? false;
  const door = opts?.door;
  const tableNumber = opts?.tableNumber;
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

  // Strip the join code (`?t=`/`?j=`) from the address bar — it keeps the live session credential out
  // of browser history + the Referer header on the next navigation (defense-in-depth alongside the
  // PostHog before_send scrub).
  //
  // ⚠️ This runs ONLY AFTER a successful mint (`session != null`), and that ordering is load-bearing.
  // It used to strip on MOUNT, which was safe only because `resolveQrCode` persisted the code to
  // localStorage before the fetch. W9a removed that pre-mint write (an unaccepted code must never
  // become the next mint's key) — and stripping on mount would then leave the code in a CLOSURE and
  // nowhere else while the mint is in flight. A hard reload in that window (the "Try again" the
  // failure arm offers, or a plain pull-to-refresh on slow wifi) would arrive with no `?t=` and no
  // stored key, so `/api/session` would fall through to the mint loop and provision a BRAND-NEW table
  // with this diner as host — the exact phantom-table orphaning W9a exists to prevent, re-created on
  // the primary sticker path. Deferring the strip keeps the code recoverable from the URL until the
  // server has accepted it and the durable post-mint write has landed; the credential leaves history
  // at the same moment it stops being the only copy. A mistyped `?j=` still never reaches
  // localStorage — its mint 404s, so this effect never runs for it.
  useEffect(() => {
    if (typeof window === "undefined" || !session) return;
    const url = new URL(window.location.href);
    // K2: also strip `?table=` (the picker's claim param). Once the mint has succeeded a reload must
    // NOT re-send it — the diner's own now-active session would 409 the claim; the code persisted by
    // the successful mint rejoins instead.
    if (!url.searchParams.has("t") && !url.searchParams.has("j") && !url.searchParams.has("table"))
      return;
    url.searchParams.delete("t");
    url.searchParams.delete("j");
    url.searchParams.delete("table");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [session]);

  useEffect(() => {
    // `mode` is fixed for a mounted page (each route passes a constant). A re-mint is driven by
    // `revalidate()` (clears session + bumps nonce); a *runtime* mode change still no-ops — remount
    // the route to switch modes.
    if (!anon || session || minting.current) return;
    minting.current = true;
    // K2: on a fresh picker CLAIM (`?table=N`), send the table number and DON'T reuse a stale persisted
    // token — the server resolves the number to the table's token and mints/claims it. Otherwise resolve
    // the code as before (sticker/invite param or the persisted dine-in key).
    const qrCode = tableNumber != null ? undefined : resolveQrCode(mode, code);
    const storedName = window.localStorage.getItem(NAME_KEY);
    fetch("/api/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anon.accessToken}`,
      },
      body: JSON.stringify({
        ...(qrCode ? { qrCode } : {}),
        ...(tableNumber != null ? { tableNumber } : {}), // K2: dine-in picker claim path
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
          tableNumber: d.tableNumber,
          created: d.created,
        });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not start session"))
      .finally(() => {
        minting.current = false;
      });
  }, [anon, mode, session, code, joinOnly, door, tableNumber, nonce]);

  return { session, loading: !session && !error, error, revalidate };
}
