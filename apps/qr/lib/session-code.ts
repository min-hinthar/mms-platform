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
 * predicate matches them) — so /api/session must never let a CLIENT mint one. Joining an existing
 * active session by its (unguessable) code stays allowed; creating is refused.
 */
export const RESERVED_SESSION_PREFIXES = ["reg-", "kiosk-"] as const;

export function isReservedSessionCode(code: string): boolean {
  return RESERVED_SESSION_PREFIXES.some((p) => code.startsWith(p));
}
