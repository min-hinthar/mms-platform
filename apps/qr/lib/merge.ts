"use server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { serverClient, serviceClient } from "@mms/db/server";
import { mergeTokenInput } from "@mms/db/schemas";

/**
 * K3b — moving an anonymous device's Stars onto the account a diner signs INTO. The upgrade-in-place paths
 * (updateUser email_change / linkIdentity Google) keep the SAME uid, so past orders + Stars carry over with
 * no merge. But signing into a PRE-EXISTING account (the email_exists / identity_already_exists recovery
 * paths) switches to a DIFFERENT uid — abandoning this device's orders + earned Stars + coupons. This pair
 * of actions carries them across:
 *   • mintMergeToken()  — called WHILE STILL ANONYMOUS, just before such a sign-in. Binds a single-use,
 *     ≥256-bit token to this anon uid; the client persists it in localStorage.
 *   • redeemMergeToken() — called AFTER sign-in (from /account). Resolves the token → the anon uid, then
 *     calls mms_merge_anon_rewards to move everything onto the now-signed-in account.
 *
 * The heavy lifting (guards, coupon re-index, boundary milestone, the durable identity redirect for a late
 * webhook) lives in the DB function (migration 20260714000000) — design-critiqued + proven with a
 * BEGIN/ROLLBACK invariant test before shipping. These actions own only the auth proof + its single-use.
 */

export type MergeSummary = { orders: number; stars: number; coupons: number };

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h — long enough for an email round-trip / a distracted diner (P1)

/**
 * Mint the single-use merge proof — WHILE STILL ANONYMOUS. Returns the token (the client stores it under
 * `mms.merge_token` before kicking off the sign-in) or null. Only an anonymous session has device-bound
 * Stars to carry, so a non-anon caller gets null (nothing to merge). Best-effort: a failed mint just means
 * this device's Stars stay put — the sign-in still proceeds; nothing is ever lost, only not-yet-moved.
 */
export async function mintMergeToken(): Promise<string | null> {
  try {
    const supa = serverClient(await cookies());
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (!user || user.is_anonymous !== true) return null;
    const db = serviceClient();
    const token = randomBytes(32).toString("base64url"); // 256-bit, URL-safe
    // INSERT FIRST, prune AFTER (never delete-before-insert): if the insert fails / its response is lost, the
    // diner's PRIOR token (which localStorage still holds) must stay redeemable — deleting it first would
    // strand this device's Stars on a failed retry (the mint returns null, the caller skips the stash, and
    // localStorage points at a now-deleted token). So secure the replacement first.
    const { error } = await db.from("mms_merge_tokens").insert({
      token,
      anon_uid: user.id,
      expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    });
    if (error) return null;
    // Now prune this anon's OLDER rows (bounds table growth: tokens are per-DEVICE, and this fresh token — the
    // one about to be stashed — fully supersedes any prior one). `.neq(token)` guards the just-inserted row;
    // best-effort (a failed prune just leaves a dead row, never affects the live token).
    await db.from("mms_merge_tokens").delete().eq("anon_uid", user.id).neq("token", token);
    return token;
  } catch {
    // Best-effort — the sign-in proceeds regardless; this device's Stars simply aren't moved this time.
    return null;
  }
}

/**
 * Redeem the token AFTER sign-in — move the anon device's orders/Stars/coupons onto the now-signed-in
 * account. SSR-verifies the caller is a REAL (non-anonymous) account: the merge target must never be a guest.
 *
 * Return contract (so the client knows whether to KEEP the token for a retry or CLEAR it):
 *   • null   → TRANSIENT / not-yet: still anonymous (sign-in hasn't landed), or a read/RPC error. The token
 *              stays live server-side; the client keeps it and retries on the next SIGNED_IN / /account load.
 *   • object → TERMINAL: a definitive outcome. counts>0 means Stars actually moved (celebrate); all-zeros
 *              means nothing to move (unknown/expired/already-redeemed token, or a self-merge). Either way
 *              the client clears the token — there's nothing left to retry.
 *
 * Ordering (merge FIRST, mark-redeemed AFTER — deliberately NOT a claim-first atomic burn): the DB
 * function is idempotent via the mms_identity_merges PK, so EXACTLY ONE caller ever gets counts>0 no
 * matter how many times this runs (double-fire on mount+SIGNED_IN, a strict-mode re-invoke, a retry).
 * Marking the token redeemed only once the value is safely moved means a transient RPC failure leaves the
 * token live for the next load to retry — where claim-first would burn the token yet strand the Stars.
 */
export async function redeemMergeToken(rawToken: string): Promise<MergeSummary | null> {
  const parsed = mergeTokenInput.safeParse({ token: rawToken });
  if (!parsed.success) return { orders: 0, stars: 0, coupons: 0 }; // junk value → terminal (clear it)
  const token = parsed.data.token;
  try {
    const supa = serverClient(await cookies());
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (!user || user.is_anonymous !== false) return null; // still anon → retry once sign-in lands

    const db = serviceClient();
    // Resolve the token → its bound anon uid (unredeemed + unexpired). A plain read, not a claim: the merge
    // itself is the single-use authority (below), so we never burn the token before the Stars are moved.
    const { data: row, error: readErr } = await db
      .from("mms_merge_tokens")
      .select("anon_uid")
      .eq("token", token)
      .is("redeemed_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (readErr) return null; // transient read failure → keep the token, retry later
    if (!row) return { orders: 0, stars: 0, coupons: 0 }; // unknown / expired / already redeemed → terminal
    const anonUid = row.anon_uid;
    if (anonUid === user.id) return { orders: 0, stars: 0, coupons: 0 }; // self-merge (upgraded in place) → no-op

    // The merge: guarded (source still anon, target real, one-merge-per-anon) + idempotent in the DB.
    const { data: res, error: mergeErr } = await db.rpc("mms_merge_anon_rewards", {
      p_anon: anonUid,
      p_target: user.id,
    });
    if (mergeErr || res == null) return null; // transient → leave the token live for a retry on the next load

    // Value is now safely moved — mark the token redeemed (hygiene: stop re-attempts / replay noise). Best-
    // effort: even if this write fails, the RPC's PK makes a re-run return zeros (no double-merge), and the
    // 24h TTL bounds it. Conditional so a concurrent double-fire only ever marks it once.
    await db
      .from("mms_merge_tokens")
      .update({ redeemed_at: new Date().toISOString() })
      .eq("token", token)
      .is("redeemed_at", null);

    const r = res as { orders?: number; stars?: number; coupons?: number };
    return {
      orders: Number(r.orders ?? 0),
      stars: Number(r.stars ?? 0),
      coupons: Number(r.coupons ?? 0),
    };
  } catch {
    return null; // caller shows nothing; the token stays live for a later retry
  }
}
