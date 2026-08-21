import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getStaffAuth } from "./staff";

/**
 * Authorization for the two DEVICE surfaces — the lobby kiosk (`/kiosk`) and the order-ready board
 * (`/board`) — in ONE place, because they had two hand-copied constant-time token checks and are now
 * gaining a second way in.
 *
 * Two credentials, either sufficient:
 *
 *  1. **The device token** (`KIOSK_DEVICE_TOKEN` / `BOARD_DEVICE_TOKEN`) in the surface's URL. This is
 *     the original W3e/W6b mechanism and it stays FIRST, deliberately — see the ordering note below.
 *  2. **A staff session** (owner, 2026-08-21: sign the four staff surfaces in with the same email
 *     OTP/magic link and stay signed in until logout). Any active staff row will do; these surfaces
 *     have no per-role capability, so a role floor here would be theatre.
 *
 * ── Why the token is checked FIRST, and it is not about speed ────────────────────────────────────
 * A token match is a string compare against an env var: no database, no auth plane, no network. The
 * staff check is a `getUser()` round-trip plus a `staff` row read. Checking the token first means a
 * TV or kiosk that is already configured and running keeps working through an auth-plane outage —
 * the exact failure W10b hardened the staff boards against (a paused project must not blank a device
 * mid-service). The staff session is purely ADDITIVE: it opens a new door without making the
 * existing one depend on anything new.
 *
 * ── A wrong token still costs NOTHING, and that had to be defended ──────────────────────────────
 * The original gate's comment promised that an invalid token is refused "BEFORE any DB read (an
 * invalid token costs nothing)", and `kiosk.test.ts` asserts it by counting queries. Falling through
 * to `getStaffAuth()` on every token miss would have quietly retired that: an anonymous client
 * hammering `/kiosk?k=wrong` would each time buy a `getUser()` round-trip plus a `staff` row read.
 * The tests caught it. So the staff path is only consulted when the request actually CARRIES a
 * Supabase auth cookie — a caller with no session pays exactly what it paid before, and a real staff
 * member pays one read. The cookie is a routing hint, never a credential: `getStaffAuth()` still
 * verifies the session and the staff row, so forging the cookie NAME buys nothing but the read.
 *
 * ── `unavailable` is not `denied` ────────────────────────────────────────────────────────────────
 * If the token does not match and the auth read FAILS (transport, paused project), the honest answer
 * is that authorization is UNKNOWABLE — not that the caller is unauthorized. Callers surface the
 * outage instead of the device's "not linked" state, so a blip never looks like a revoked device.
 */

export type DeviceSurface = "kiosk" | "board";

const TOKEN_ENV: Record<DeviceSurface, string> = {
  kiosk: "KIOSK_DEVICE_TOKEN",
  board: "BOARD_DEVICE_TOKEN",
};

export type DeviceAuth =
  /** Authorized. `via` is for logging and for copy that tells a staff member how they got in. */
  | { ok: true; via: "token" | "staff" }
  /** No token configured AND no staff session — the surface is genuinely not set up. */
  | { ok: false; reason: "not_configured" }
  /** A credential was presented and is wrong (or absent) — and the auth read succeeded. */
  | { ok: false; reason: "denied" }
  /** W10b — the auth read failed, so we do not know. Never render this as "denied". */
  | { ok: false; reason: "unavailable" };

/**
 * Does this request carry a Supabase auth session cookie at all?
 *
 * `@supabase/ssr` writes `sb-<project-ref>-auth-token`, and CHUNKS it (`.0`, `.1`) once it outgrows
 * the 4KB cookie limit — which a real session with a JWT routinely does — so this matches on the
 * stable affix rather than an exact name, and never assumes the project ref.
 */
async function hasSessionCookie(): Promise<boolean> {
  try {
    return (await cookies())
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  } catch {
    return false; // no request scope (shouldn't happen on these paths) — treat as no session
  }
}

/** Constant-time compare that cannot throw on a length mismatch (Buffer lengths must match first). */
function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Authorize a device surface. `given` is the `?k=` value from the URL (pass `""` when there is none).
 *
 * Order: token (no dependencies) → staff session (additive). A caller that only ever had a token
 * behaves exactly as it did before this module existed.
 */
export async function authorizeDevice(surface: DeviceSurface, given: string): Promise<DeviceAuth> {
  const expected = process.env[TOKEN_ENV[surface]];
  if (expected && tokenMatches(given, expected)) return { ok: true, via: "token" };

  // No token match. A staff session is the other way in — and the ONLY way in when the surface has
  // no token configured at all, which is what makes a fresh device usable without editing env first.
  // Only pay for that lookup when a session cookie is actually present (see the header).
  if (!(await hasSessionCookie())) {
    return { ok: false, reason: expected ? "denied" : "not_configured" };
  }
  const auth = await getStaffAuth();
  if (auth.kind === "staff") return { ok: true, via: "staff" };
  if (auth.kind === "unavailable") return { ok: false, reason: "unavailable" };

  // Not staff, and the token did not match. Distinguish "this surface was never set up" from "your
  // credential is wrong": the first is a config answer for an owner, the second is a refusal.
  if (!expected) return { ok: false, reason: "not_configured" };
  return { ok: false, reason: "denied" };
}
