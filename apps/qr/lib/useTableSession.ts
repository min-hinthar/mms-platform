"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sessionMintOutput } from "@mms/db/schemas";
import { useAnonSession } from "./useAnonSession";
import { sessionRefusal, type SessionRefusal } from "./session-refusal";
import { dineinMintEntry, type AcceptedMint } from "./session-truth";

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
   *  tell the diner their old table had ended instead of silently landing in an empty cart. Also
   *  true when the route answered `fresh` (session truth): a claim that took a table a server had
   *  started is a fresh start for THIS diner though the row already existed. */
  created: boolean;
  /** Session truth (finding 4) — the mint was sent a PERSISTED dine-in code (this phone's last
   *  table, or the code a previous mint accepted) and the server CREATED a session instead: that
   *  table had ended. The provider says so on a cold mount — reload, a new tab, home → Dine-in used
   *  to land silently in a new, unnumbered "Just you". */
  replacedStored: boolean;
};

/** J16 — a refused mint: the server's sentence (for people) and its machine word (for the client's
 *  recovery, `joinFailureArm`), kept together so the two can never describe different refusals. */
class MintRefused extends Error {
  constructor(
    message: string,
    readonly reason: SessionRefusal | null,
  ) {
    super(message);
  }
}

/** This device's stored session key for a mode — the dine-in join code, or a solo mode's own key. */
const sessionKey = (mode: string) => `mms.qr.${mode}`;
const DINEIN_KEY = sessionKey("dinein");
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
 * - **dine-in (group, M3·P3.1):** `dineinMintEntry` (lib/session-truth) — the shared key comes from
 *   the deep link (`?t=`/`?j=` → `code`) or a prior join persisted in localStorage, so every phone at
 *   the table converges on ONE session; with neither, no key → the server mints an unguessable code
 *   and returns it (persisted below so a reload rejoins the same session). W9a — a dine-in code is
 *   never persisted BEFORE the mint: a mistyped `?j=` used to be written to localStorage even when
 *   the server 404'd it, and every later bare `/menu?mode=dinein` then provisioned a brand-new table
 *   keyed to the typo with this diner as host. Only a code the server ACCEPTED is persisted.
 * - **solo (scan-&-go / pickup):** a stable per-device id — each device is its own session. This
 *   function resolves it.
 */
function resolveSoloKey(mode: string): string {
  const key = sessionKey(mode);
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
  // ONE state for the failure: its sentence and its J16 word are set and cleared together.
  const [failure, setFailure] = useState<{
    message: string;
    reason: SessionRefusal | null;
  } | null>(null);
  const minting = useRef(false);
  const [nonce, setNonce] = useState(0);
  // Session truth (M172) — the dine-in code the server last ACCEPTED, or null before the first
  // success. Once it is set the URL credential (`?t=` sticker, `?j=` invite, `?table=` claim) is
  // spent: every later mint — the recovery re-mint, "Start a new order" — re-joins by THIS code,
  // marked `persisted`, so the server re-joins it only for a member of a live session and otherwise
  // starts a bare one (J15). The sticker the page still holds in its props can no longer provision
  // a session at a table staff just cleared. A ref: it is written in the mint's own callback and
  // read only by the next mint, never by a render.
  const accepted = useRef<AcceptedMint | null>(null);

  // Force a re-mint (client recovery from a silently-expired session): clear the cached session so the
  // effect re-POSTs /api/session. With the expiry fix that re-mint either RENEWS the same session
  // (transient blip → same cartId) or, if it had truly expired, sweeps it + mints a FRESH session+cart
  // — so a stranded diner recovers without a manual reload. The nonce re-arms the effect even if the
  // session was already null; failed re-mints set `error` (no session change) so there's no retry loop.
  const revalidate = useCallback(() => {
    minting.current = false;
    setSession(null);
    setFailure(null); // clear a prior failure so a successful retry dismisses the recovery banner
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
    // K2 · Phase 3c-ii (D25): on a picker CLAIM (`?table=N`) the table number rides to the server,
    // which resolves it to the table's token and finds the party at N by NUMBER — the persisted
    // dine-in key is sent BESIDE it, never as the key the number resolves. The server reads that
    // code only as `priorCode`: this phone's own live session, verified by `host_seat === seat`, so
    // an UNBOUND session the diner hosts is BOUND to the table instead of a second session minting
    // over its drafts (J33's unbound half). A stale or foreign key still claims the table as before
    // (the server mints), so W9a holds: the code is read here, written only after the server accepts.
    // J15 (the blind pass on 3c-ii) — a dine-in code that came from STORAGE (or, since session
    // truth, one a previous mint accepted), not the URL and not beside a claim, is marked
    // `persisted`: the server re-joins only a session this seat belongs to, else a fresh host-start
    // (a persisted sticker token outlives its party). The rule is `dineinMintEntry`'s.
    const entry =
      mode === "dinein"
        ? dineinMintEntry({
            code,
            joinOnly,
            tableNumber,
            accepted: accepted.current,
            stored: window.localStorage.getItem(DINEIN_KEY) ?? undefined,
          })
        : { qrCode: resolveSoloKey(mode) };
    const qrCode = entry.qrCode;
    const persisted = "persisted" in entry && entry.persisted === true;
    const storedName = window.localStorage.getItem(NAME_KEY);
    fetch("/api/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anon.accessToken}`,
      },
      body: JSON.stringify({
        // K2 (the picker's claim), the invite's join-only flag (a host-start — no code — must be
        // allowed to create) and J15's `persisted` all come from `entry`, which spends them after
        // the first accepted mint.
        ...entry,
        ...(door ? { door } : {}), // K0: analytics-only door tag (validated server-side)
        mode,
        ...(storedName ? { name: storedName } : {}),
      }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string; reason?: unknown };
          // J16 — the word is parsed against the ONE list; an unknown word (deploy skew) is null,
          // which every reader treats as the generic, retryable failure.
          throw new MintRefused(j.error ?? `HTTP ${r.status}`, sessionRefusal(j.reason));
        }
        // Parse the response shape (not just trust the cast) — a missing/blank cartId from a deploy
        // skew throws here instead of silently driving a cart-less UI.
        return sessionMintOutput.parse(await r.json());
      })
      .then((d) => {
        // Persist the resolved dine-in code so a reload (or a tab without the deep-link param)
        // rejoins the SAME session instead of the host minting a second one — and hold it as the
        // ACCEPTED code every later mint of this hook re-joins by (M172, above).
        if (mode === "dinein") {
          accepted.current = {
            code: d.joinCode,
            forCode: code ?? null,
            forTable: tableNumber ?? null,
          };
          window.localStorage.setItem(DINEIN_KEY, d.joinCode);
        }
        // PD3 follow-up — a SOLO key comes back changed only when the server re-minted this device's
        // session under a fresh key (its stored key named a session another identity holds, which
        // refuses a second member). Adopt it, or every visit would re-mint and the basket would reset.
        else if (d.joinCode !== qrCode) window.localStorage.setItem(sessionKey(mode), d.joinCode);
        setSession({
          cartId: d.cartId,
          sessionId: d.sessionId,
          seat: d.seat,
          accessToken: anon.accessToken,
          role: d.role,
          joinCode: d.joinCode,
          tableNumber: d.tableNumber,
          created: d.created || d.fresh,
          replacedStored: persisted && d.created,
        });
      })
      .catch((e: unknown) =>
        setFailure({
          message: e instanceof Error ? e.message : "Couldn’t get you connected — try again",
          reason: e instanceof MintRefused ? e.reason : null,
        }),
      )
      .finally(() => {
        minting.current = false;
      });
  }, [anon, mode, session, code, joinOnly, door, tableNumber, nonce]);

  return {
    session,
    loading: !session && !failure,
    error: failure?.message ?? null,
    /** J16 — the refusal's machine word (`SESSION_REFUSALS`), or null: not refused by the route
     *  (a network failure, an unreadable body), or a word this build does not know. */
    errorReason: failure?.reason ?? null,
    revalidate,
  };
}
