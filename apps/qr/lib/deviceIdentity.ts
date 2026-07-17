// K7 shared-device — the client-side localStorage store for the account switcher. Two stores, both
// display-HINTS only, NEVER tokens/credentials: a forged or edited value grants nothing (the actual sign-in is
// still a real OTP/OAuth round trip, and every rewards/orders read stays uid-scoped + RLS-gated server-side).
// The hints only save typing on a fast re-auth. All wrapped in try/catch: private-mode / storage-disabled just
// means no remembered chips + no lend banner — the app still works, you just re-type your email.
//
// See docs/SHARED_DEVICE.md for the flows + the merge-suppression safety rule.

import { clearMergeToken } from "./mergeTokenStore";

const IDENTITIES_KEY = "mms.identities";
const LEND_KEY = "mms.lend";
const MAX_IDENTITIES = 3; // most-recent LRU; a shared phone shouldn't hoard a long roster of prior sign-ins
const LEND_TTL_MS = 12 * 60 * 60 * 1000; // a days-later session must never show a stale "ordering for a friend"

/** Same-tab notification for the global LendModeBanner (the `storage` event only fires cross-tab). */
export const LEND_CHANGE_EVENT = "mms:lend-change";
function notifyLendChange(): void {
  try {
    window.dispatchEvent(new Event(LEND_CHANGE_EVENT));
  } catch {
    /* SSR / no window — the banner re-reads on its next mount/navigation anyway */
  }
}

/** A remembered prior sign-in on THIS device — display hints only, no token/credential ever. */
export type DeviceIdentity = {
  email: string;
  firstName: string | null;
  tierId: string;
  method: "email" | "google";
  lastSeen: number; // epoch ms — LRU ordering
};

/** The owner's greeting hint while the phone is lent to a friend (so we can offer a one-tap return). */
export type LendState = {
  ownerEmail: string;
  ownerFirstName: string | null;
  since: number; // epoch ms — TTL anchor
};

function readRaw<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // storage unavailable OR malformed JSON — treat as empty, never throw into render
  }
}

function isIdentity(v: unknown): v is DeviceIdentity {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.email === "string" &&
    (o.method === "email" || o.method === "google") &&
    typeof o.lastSeen === "number"
  );
}

/** Recent sign-ins on this device, most-recent first. Filters out anything malformed (forward-compat). */
export function readIdentities(): DeviceIdentity[] {
  const list = readRaw<unknown[]>(IDENTITIES_KEY);
  if (!Array.isArray(list)) return [];
  return list
    .filter(isIdentity)
    .map((i) => ({
      email: i.email,
      firstName: typeof i.firstName === "string" ? i.firstName : null,
      tierId: typeof i.tierId === "string" ? i.tierId : "new",
      method: i.method,
      lastSeen: i.lastSeen,
    }))
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, MAX_IDENTITIES);
}

/**
 * Upsert a remembered identity (dedup by email, case-insensitive), stamp lastSeen, cap to the most-recent
 * MAX_IDENTITIES. Called when a signed-in diner is on /account (RememberIdentity) — so next time the switcher
 * can offer them a one-tap return. Best-effort: a storage failure just means no chip next time.
 */
export function rememberIdentity(entry: Omit<DeviceIdentity, "lastSeen">): void {
  const email = entry.email.trim();
  if (!email) return;
  try {
    const now = Date.now();
    const others = readIdentities().filter((i) => i.email.toLowerCase() !== email.toLowerCase());
    const next: DeviceIdentity[] = [{ ...entry, email, lastSeen: now }, ...others].slice(
      0,
      MAX_IDENTITIES,
    );
    window.localStorage.setItem(IDENTITIES_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — no remembered chip; harmless */
  }
}

/** Drop one remembered identity (the per-chip "×"). */
export function forgetIdentity(email: string): void {
  try {
    const next = readIdentities().filter(
      (i) => i.email.toLowerCase() !== email.trim().toLowerCase(),
    );
    if (next.length) window.localStorage.setItem(IDENTITIES_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(IDENTITIES_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * A COMPLETE device wipe ("Not you? Forget this device") — the remembered roster AND the lend flag (which
 * holds the owner's email/name) AND any stashed merge token. Anything less would leave PII the copy promises
 * to remove (and a lingering lend flag would keep greeting the prior owner by name).
 */
export function forgetAllIdentities(): void {
  try {
    window.localStorage.removeItem(IDENTITIES_KEY);
  } catch {
    /* ignore */
  }
  clearLend(); // also drop the owner hint (email PII) + fire the banner-change event
  clearMergeToken(); // and any stale merge proof, so it can never redeem onto a later sign-in
}

/** The active lend session, or null. Auto-expires past the TTL so a stale flag never shows a wrong banner. */
export function readLend(): LendState | null {
  const v = readRaw<LendState>(LEND_KEY);
  if (!v || typeof v.ownerEmail !== "string" || typeof v.since !== "number") return null;
  if (Date.now() - v.since > LEND_TTL_MS) {
    clearLend();
    return null;
  }
  return v;
}

/** Enter lend mode ("Order for a friend") — remembers the owner so we can offer a one-tap return. */
export function setLend(owner: { ownerEmail: string; ownerFirstName: string | null }): void {
  const email = owner.ownerEmail.trim();
  if (!email) return;
  try {
    const state: LendState = {
      ownerEmail: email,
      ownerFirstName: owner.ownerFirstName,
      since: Date.now(),
    };
    window.localStorage.setItem(LEND_KEY, JSON.stringify(state));
    notifyLendChange();
  } catch {
    /* storage unavailable — lend mode just won't show the banner; the guest session is still clean */
  }
}

/** Leave lend mode — owner resumed, or a friend signed into their own account. */
export function clearLend(): void {
  try {
    window.localStorage.removeItem(LEND_KEY);
    notifyLendChange();
  } catch {
    /* ignore */
  }
}

/** First name from a display name (greeting only) — the leading token, else null. */
export function firstNameOf(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || null;
}

/** Mask an email for a shared-device chip: keep the first char + domain (`m•••@gmail.com`). */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  const head = user.slice(0, 1);
  return `${head}${"•".repeat(Math.max(1, Math.min(3, user.length - 1)))}@${domain}`;
}
