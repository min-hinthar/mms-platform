/**
 * W14 (closes OPEN-ITEMS J19's hygiene half) — the DEVICE-session keys that must not survive an
 * account handover. K7's switch/lend flows swap the AUTH session to a fresh anonymous guest, but
 * they used to leave the device's *session pointers* behind: `mms.qr.dinein` (the join code that
 * re-enters the owner's live table), `mms.name` (the owner's typed guest-list/pickup name), the
 * solo-mode session ids (`mms.qr.scango` etc.) and the W5a resume pointers
 * (`mms.qr.activeMode/activeCart/activeOrder`). A friend handed the phone could rejoin the owner's
 * table UNDER THE OWNER'S NAME — a clean auth session attached to a dirty device session.
 *
 * The rule: everything under the `mms.qr.` prefix plus `mms.name` is DEVICE-session state and dies
 * with the handover. Deliberately NOT cleared here (each has its own owner + lifecycle):
 *  - `mms.identities` / `mms.lend` — deviceIdentity's re-auth chips + lend flag: the chips are the
 *    one-tap RETURN path (clearing them would defeat the switcher), and the lend flag is written
 *    AFTER the handover clear runs.
 *  - `mms.merge_token` — cleared by forgetAllIdentities/redeem, on its own 24h TTL.
 *  - `mms.scanQueue.v1` / `mms.groceryCatalog.v1` — cart-keyed + member-gated server-side (a
 *    replay from a non-member is refused), and price data is display-only.
 */

export const DEVICE_NAME_KEY = "mms.name";
export const DEVICE_SESSION_PREFIX = "mms.qr.";

/** Pure: which of these storage keys are device-session state? (Pinned red-first — the boundary
 *  between "dies with the handover" and "survives it" is the safety rule.) */
export function deviceSessionKeys(allKeys: readonly string[]): string[] {
  return allKeys.filter((k) => k === DEVICE_NAME_KEY || k.startsWith(DEVICE_SESSION_PREFIX));
}

type KeyEnumerableStorage = Pick<Storage, "length" | "key" | "removeItem">;

/** Clear every device-session key (injectable storage for tests; defaults to localStorage). */
export function clearDeviceSession(storage?: KeyEnumerableStorage): void {
  try {
    const s = storage ?? window.localStorage;
    const all: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k !== null) all.push(k);
    }
    for (const k of deviceSessionKeys(all)) s.removeItem(k);
  } catch {
    /* deliberate: storage unavailable → nothing was persisted, so there is nothing to clear */
  }
}
