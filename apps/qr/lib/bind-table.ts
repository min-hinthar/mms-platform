"use server";
import { serviceClient } from "@mms/db/server";
import { bindTableInput } from "@mms/db/schemas";
import { assertCartMember, AuthzError } from "./authz";
import { withinMutationRate } from "./rate";
import { touchCart } from "./order-lines";
import { getPostHogClient } from "./posthog-server";
import { bindSessionTable, bindVerdict, seatedSessionFor, sweepExpiredOnTable } from "./seated";

/**
 * Phase 3c-ii (D24) — `bindTable(cartId, n)`: the host seats an UNBOUND dine-in session at a registered
 * table, once, under the lock model, with refusals that name the recovery and never a merge.
 *
 * The order of refusals is `sendToKitchen`'s (lib/cart.ts): assertCartMember → withinMutationRate →
 * locked → settling → role !== host → mode !== dinein → the registry (`qr_tables`, `active = true`) →
 * `sweepExpiredOnTable` → the row-count CAS (`table_number` ONLY; `qr_code` is never rewritten).
 * Outcomes: 1 row → ok (then `touchCart` so every peer's `qr_carts` watch re-reads the view — D30);
 * 23505 → re-read BY NUMBER → `seated`; 23503 → `unavailable`; 0 rows → re-read the own row and
 * answer by the pure `bindVerdict` (the same number → ok/already; another number → `already_bound`;
 * closed/expired → `session_expired`).
 *
 * WHY THE LOCK REFUSES A BIND: the fulfill RPCs snapshot `table_sessions.table_number` at settlement
 * (k2 migration) — a bind under a peer's charge would re-table a paid order. `locked`/`settling` are
 * authz's EFFECTIVE flags (a stale lock lands — W17's rule), never re-derived here.
 *
 * WHY NEVER A MERGE: `mms_merge_table_orders` re-parents lines, cancels the source cart and closes
 * its session — a money-bearing, staff-gated write (M257). A seated number is REFUSED with the join
 * path (`BIND_COPY.seated`) and NOTHING on the other session is written: the only session writes
 * are the dead-row sweep (`expires_at <= now()`) and the own row's CAS. No `session_members` row,
 * no `expires_at` in the payload (`assertCartMember`'s renewal is the only slide).
 */
export type BindTableReason =
  | "not_host"
  | "locked"
  | "settling"
  | "not_dinein"
  | "unavailable"
  | "seated"
  | "already_bound"
  | "session_expired"
  | "rate_limited"
  | "error";

export type BindTableResult =
  | { ok: true; tableNumber: number; already: boolean }
  | { ok: false; reason: Exclude<BindTableReason, "already_bound"> }
  | { ok: false; reason: "already_bound"; tableNumber: number };

export async function bindTable(cartId: string, tableNumber: number): Promise<BindTableResult> {
  // Zod (1..99, the qr_tables CHECK) — a forged number is refused before any read.
  const parsed = bindTableInput.safeParse({ cartId, tableNumber });
  if (!parsed.success) return { ok: false, reason: "error" };
  const { cartId: id, tableNumber: n } = parsed.data;

  let authz: Awaited<ReturnType<typeof assertCartMember>>;
  try {
    authz = await assertCartMember(id);
  } catch (e) {
    // The session died under the diner (or expired a second ago): the provider's `revalidate()`
    // re-mints the persisted code. Anything else — unknowable, closed cart, not a member — is a
    // bind that did not happen, and `error`'s sentence is true for it.
    if (e instanceof AuthzError && e.code === "session_expired")
      return { ok: false, reason: "session_expired" };
    return { ok: false, reason: "error" };
  }
  const { uid, sessionId, role, locked, settling, mode } = authz;
  if (!(await withinMutationRate(uid))) return { ok: false, reason: "rate_limited" };
  if (locked) return { ok: false, reason: "locked" };
  if (settling) return { ok: false, reason: "settling" };
  if (role !== "host") return { ok: false, reason: "not_host" };
  if (mode !== "dinein") return { ok: false, reason: "not_dinein" };

  const db = serviceClient();
  // The registry: registered AND active, the mint's own check (`/api/session` requires `active =
  // true` on both arms). A failed read is `error`, never "pick another" — that sentence is a verdict.
  const { data: reg, error: regErr } = await db
    .from("qr_tables")
    .select("table_number")
    .eq("table_number", n)
    .eq("active", true)
    .maybeSingle();
  if (regErr) return { ok: false, reason: "error" };
  if (!reg) return { ok: false, reason: "unavailable" };

  // The index is partial on `status`, so an expired-but-active row holds N until the cron: close it
  // first (dead rows only), then the CAS.
  await sweepExpiredOnTable(db, n);
  const { count, error } = await bindSessionTable(db, sessionId, n);
  if (error) {
    if (error.code === "23505") {
      // The number is taken. Decided by the ONE predicate, never by the constraint name: a live
      // party at N → `seated` (the inline join form); a holder gone between the write and this read
      // is unexplained → `error`, which the diner can simply retry.
      const holder = await seatedSessionFor(db, n).catch(() => null);
      return { ok: false, reason: holder ? "seated" : "error" };
    }
    // 23503 — the registry FK: the table was retired between the read above and this write.
    if (error.code === "23503") return { ok: false, reason: "unavailable" };
    console.error("[bind-table] bind failed", {
      cartId: id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, reason: "error" };
  }

  if ((count ?? 0) > 0) {
    // D30 — every peer's `qr_carts` watch re-reads the view and the number flips without a remount.
    await touchCart(id, "bindTable");
    getPostHogClient().capture({
      distinctId: uid,
      event: "table_bound",
      properties: { cart_id: id, session_id: sessionId, table_number: n },
    });
    return { ok: true, tableNumber: n, already: false };
  }

  // Zero rows: the row moved under us (two tabs, a bound-meanwhile session, an expiry). Re-read the
  // OWN row and let the pure verdict name it — a blocked write is never reported as a landing.
  const { data: own, error: ownErr } = await db
    .from("table_sessions")
    .select("status,expires_at,table_number")
    .eq("id", sessionId)
    .maybeSingle();
  if (ownErr) return { ok: false, reason: "error" };
  return bindVerdict({ count: 0, reread: own ?? null, n, nowMs: Date.now() });
}
