import { REG_PREFIX } from "./register-queue";

/**
 * Server-issued join code for the dine-in group cart (M3·P3.1). When a host starts a dine-in
 * session with no physical sticker token, the SERVER (this generator, called only from the
 * /api/session route — never the client) mints the code other phones use to join. QA §C bar:
 * the table session must be server-issued and "not guessable" — the code IS the qr_code, so it
 * doubles as both the shareable invite code and the realtime/RLS session key.
 *
 * Alphabet: Crockford-style base32 minus 0/1/O/I/L/U → no look-alikes (so a typed code can't be
 * misread) and no accidental words. 8 chars over a 30-symbol alphabet ≈ 30^8 ≈ 6.5e11 — ample for
 * a session that expires in 4h and (pre-pay) holds no payment instrument; the realtime channel +
 * cart still require anon-auth membership on top, so the code is one factor, not the only gate.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"; // 30 symbols, no 0/1/O/I/L/U

export function generateJoinCode(len = 8): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  // charAt (not []) returns string, never undefined — clean under noUncheckedIndexedAccess. The
  // modulo bias toward the first 16 symbols is negligible here (this is an invite code, not a key).
  for (const b of bytes) out += ALPHABET.charAt(b % ALPHABET.length);
  return out;
}

/**
 * Reserved session-code prefixes (W6a/W6b): `reg-` marks staff-minted counter orders, `kiosk-`
 * marks kiosk-device-minted orders. Both are SERVER-ISSUED identities that downstream surfaces
 * trust (the register queue keys on them; the floor board excludes them; the kiosk reset's scope
 * predicate matches them) — so /api/session must never let a CLIENT mint one. Creating is refused
 * for both; joining an existing active one is refused for `reg-` (`reservedCodeRefusal`, below).
 */
export const RESERVED_SESSION_PREFIXES = [REG_PREFIX, "kiosk-"] as const;

export function isReservedSessionCode(code: string): boolean {
  return RESERVED_SESSION_PREFIXES.some((p) => code.startsWith(p));
}

/**
 * Phase 2f · P2v (D10) — may `/api/session` sweep an EXPIRED-but-active squatter off this code before
 * minting? Only a provided STICKER code on a create-capable request that found no active session. A
 * reserved (`reg-` / `kiosk-`) code is never swept: the create is refused for it anyway, and a forged
 * `?t=reg-…` after a counter order's 12h expiry would otherwise close a sent-unpaid counter session —
 * the strand the sweeper's own exemption exists to prevent.
 */
export function sweepsExpiredSquatter(i: {
  found: boolean;
  code: string | null | undefined;
  joinOnly: boolean;
}): boolean {
  return !i.found && !!i.code && !i.joinOnly && !isReservedSessionCode(i.code);
}

/**
 * Phase 2f · P2v (Codex r3 on #308) — the ONE reserved-code gate `/api/session` runs before it
 * attaches a diner to a code. `create` = no active session and the code is reserved (W6b: a client
 * never mints a server-issued identity). `join` = an ACTIVE staff-minted (`reg-`) counter order.
 *
 * A `reg-` session is minted by the register with NO member row and is built by staff through
 * service-role actions (`lib/register.ts` — never this route). A diner who joined one by its code
 * became a member — and, on its null `host_seat`, its HOST — and could add a to-go draft after staff
 * reviewed the order but before Send; the counter fire (`mms_fire_counter_cart`) sends every draft,
 * so an item nobody at the counter saw reached the kitchen before anyone paid. So that join is
 * refused, for any `reg-` code whatever its mode (fail closed — no diner flow joins one).
 *
 * A `kiosk-` session stays JOINABLE, exactly as before: its order is pay-first (never fired unpaid,
 * `isCounterOrder` is false for it), so a member there adds nothing that cooks before payment.
 */
export function reservedCodeRefusal(i: {
  found: boolean;
  code: string | null | undefined;
}): "create" | "join" | null {
  if (!i.code || !isReservedSessionCode(i.code)) return null;
  if (!i.found) return "create";
  return i.code.startsWith(REG_PREFIX) ? "join" : null;
}
