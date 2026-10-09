import "server-only";
import { createHash } from "node:crypto";

/**
 * PD3 follow-up (Codex P2 on #339) — the key a SOLO session is re-minted under, RETRY-STABLE.
 *
 * `/api/session` re-mints a solo session when a device sends its own stored key under a NEW
 * anonymous identity (`soloJoinVerdict` → `remint`, lib/session-code.ts): the old session belongs
 * to the identity that minted it and refuses a second member. A random fresh key made that re-mint
 * diverge — a lost response (the client learns the new key only from the response, so its retry
 * sends the old key again) or two tabs sending the old key at once each minted a separate session
 * and cart. Derived from (the stored key, this seat) instead, every retry and every tab computes
 * the SAME key: the second request finds the session the first one minted (or loses the insert race
 * on the active-code unique index and re-reads it), and the trigger's guarantees are untouched —
 * the key names a session only this seat's identity mints, and any other seat is still refused at
 * the write. Unguessable without the stored key, which is itself an unguessable per-device uuid.
 *
 * UUID v5 (RFC 9562 §5.5) under a fixed namespace, in the client's own `${mode}-<uuid>` shape.
 */

/** NEVER change it: a changed namespace re-keys every in-flight re-mint, and a retry mints twice. */
const SOLO_REMINT_NAMESPACE = "fe36c61f-4fbf-45e8-b2b8-052c066ba490";

/** UUID v5 of `name` under `namespace` (RFC 9562 §5.5): SHA-1, version 5, the RFC variant. */
export function uuidV5(namespace: string, name: string): string {
  const h = createHash("sha1")
    .update(Buffer.from(namespace.replace(/-/g, ""), "hex"))
    .update(name, "utf8")
    .digest();
  h.writeUInt8((h.readUInt8(6) & 0x0f) | 0x50, 6);
  h.writeUInt8((h.readUInt8(8) & 0x3f) | 0x80, 8);
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** The re-mint key for `seat` arriving with the stored solo key `storedKey`, for `mode`. */
export function soloRemintKey(mode: string, storedKey: string, seat: string): string {
  return `${mode}-${uuidV5(SOLO_REMINT_NAMESPACE, `${storedKey}\u0000${seat}`)}`;
}
