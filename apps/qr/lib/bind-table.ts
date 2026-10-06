"use server";
import { serviceClient } from "@mms/db/server";
import { bindTableInput } from "@mms/db/schemas";
import { assertCartMember, AuthzError } from "./authz";
import { withinMutationRate } from "./rate";
import { touchCart } from "./order-lines";
import { getPostHogClient } from "./posthog-server";
import {
  bindSessionTable,
  bindVerdict,
  holderVerdict,
  rereadVerdict,
  seatedSessionFor,
  sweepExpiredOnTable,
  type SeatedSession,
} from "./seated";

/**
 * Phase 3c-ii (D24) — `bindTable(cartId, n)`: the host seats an UNBOUND dine-in session at a registered
 * table, once, under the lock model, with refusals that name the recovery and never a merge.
 *
 * The order of refusals is `sendToKitchen`'s (lib/cart.ts): assertCartMember → withinMutationRate →
 * locked → settling → role !== host → mode !== dinein → the registry (`qr_tables`, `active = true`) →
 * the occupancy PRE-READ (`seatedSessionFor` with the registry's token) decided by the pure
 * `holderVerdict` (a party at N → `seated`; a kiosk order → `kiosk`; the own row at N → ok/already;
 * a table a server started → handed to the RPC as the shell) → `sweepExpiredOnTable` → the ONE call,
 * `mms_bind_session_table` (M263, through `bindSessionTable`). Outcomes: `bound` / `adopted` → ok
 * (then `touchCart` so every peer's `qr_carts` watch re-reads the view — D30); `locked` / `settling`
 * → the same refusals authz's flags give, now decided under the cart's lock; `sticker` →
 * `sticker_table` naming the sticker's table (J41); `gone` / `held` → re-read BY NUMBER and answered
 * by the pure `rereadVerdict`; 23505 → the same re-read; 23503 → `unavailable`; `unmoved` → re-read
 * the own row and answer by the pure `bindVerdict` (the same number → ok/already; another number →
 * `already_bound`; closed/expired → `session_expired`); an unreadable answer → `error`.
 *
 * M263 — WHY ONE CALL (Codex r3 on #314). The freeze used to be authz's single read and the CAS a
 * separate statement, so a lock acquired between them let the number land under a live charge. The
 * fast path below still refuses on authz's EFFECTIVE flags (no write, no round trip); the RPC
 * re-reads the freeze under the binder's open cart `FOR SHARE` and CASes in the same transaction, so
 * a lock that committed after authz's read is either seen or waits for the bind.
 *
 * J41 — A STICKER SESSION BINDS ONLY TO ITS OWN TABLE. The bind never rewrites `qr_code`, and the
 * token index is unique among active rows, so a session minted on table T's sticker and bound to N
 * wedged T (its sticker scan, a claim and a staff Start all failed while the picker read T Open). The
 * RPC refuses `sticker` with T, and the sentence names T: if the diner is at T they pick it,
 * otherwise "Send anyway" fires numberless — the only honest options without a move-table tool (J38).
 *
 * J40 — A TABLE A SERVER STARTED YIELDS. The register's Start leaves a HOSTLESS row at N with an
 * empty cart, waiting for its first diner (route.ts, W6a). `holderVerdict` hands that row to the RPC,
 * which adopts it — cancels its empty cart and closes it, in the same subtransaction as the CAS —
 * only if NOTHING and NOBODY is on it, under its row locks; a shell with anything or anyone on it
 * answers `held` (`BIND_COPY.held`: ask that server to seat you, or pick another), and one that
 * changed under the call answers `gone` → the re-read names whoever is there now. Turning the adopt off is one line: hand the RPC no shell.
 *
 * WHY THE PRE-READ (the blind pass on 3c-ii, money lens): the index is the authority for the truly
 * simultaneous case; the pre-read decides the common one, as the mint, the register and the kiosk
 * already do. Without it a stale "Open" chip — the grid is the /cart page's one RSC read — landed a
 * second party on N for as long as the deploy-before-apply window the migration header names, and
 * two live rows at N make every number-keyed find arbitrary.
 *
 * WHY THE LOCK REFUSES A BIND: the lock model — no cart-adjacent write while a peer's charge is
 * live. The fulfill RPCs snapshot `table_sessions.table_number` at settlement (k2 migration), so a
 * bind landing under a charge stamps a number onto the order whose receipt the payer is already
 * reading. Nothing is RE-tabled (the CAS requires `table_number IS NULL`); the refusal keeps that
 * receipt unchanged until the charge settles. `locked`/`settling` are authz's EFFECTIVE flags (a
 * stale lock lands — W17's rule), never re-derived here; the RPC's own read is the DB-clocked
 * twin of the same rule. The mint's own claim-arm bind (`/api/session`, J33) is a JOIN-time write
 * on a phone that is not mid-Send, and goes through the SAME call.
 *
 * WHY NEVER A MERGE: `mms_merge_table_orders` re-parents lines, cancels the source cart and closes
 * its session — a money-bearing, staff-gated write (M257). A seated number is REFUSED with the join
 * path (`BIND_COPY.seated`) and NOTHING on a party's session is written: the only session writes
 * are the dead-row sweep (`expires_at <= now()`), the own row's CAS, and the RPC's adopt of an
 * UNTOUCHED staff shell under its row locks (no member, no line, no cart state — nothing to move).
 * No `session_members` row, no `expires_at` in the payload (`assertCartMember`'s renewal is the
 * only slide).
 */
export type BindTableReason =
  | "not_host"
  | "locked"
  | "settling"
  | "not_dinein"
  | "unavailable"
  | "seated"
  | "kiosk"
  | "held"
  | "sticker_table"
  | "already_bound"
  | "session_expired"
  | "rate_limited"
  | "error";

/** The refusals that name a table: where the order goes (`already_bound`), whose table it is
 *  (`kiosk` · `held`), or which table the session's sticker belongs to (`sticker_table`). */
type NamedRefusal = "already_bound" | "kiosk" | "held" | "sticker_table";

export type BindTableResult =
  | { ok: true; tableNumber: number; already: boolean }
  | { ok: false; reason: Exclude<BindTableReason, NamedRefusal> }
  | { ok: false; reason: NamedRefusal; tableNumber: number };

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
    .select("table_number,qr_code")
    .eq("table_number", n)
    .eq("active", true)
    .maybeSingle();
  if (regErr) return { ok: false, reason: "error" };
  if (!reg) return { ok: false, reason: "unavailable" };

  // The occupancy pre-read (docblock): the ONE predicate, handed the table's sticker token so a
  // numberless live row on that sticker is a party too. A failed read is `error` — unknowable ≠ free.
  let holder: SeatedSession | null;
  try {
    holder = await seatedSessionFor(db, n, reg.qr_code);
  } catch {
    return { ok: false, reason: "error" };
  }
  // J40 — who holds N decides (`holderVerdict`, pure). The OWN row already AT n (two tabs of one
  // phone — the other landed it) is `already`; the own NUMBERLESS row on this table's sticker — the
  // stranded shape the predicate's token read exists for — is NOT: nothing is bound yet, so the call
  // below lands it (Codex r1 on #314, P1). A party or a kiosk order is refused before any write; a
  // table a server started goes to the RPC as the shell it may adopt.
  const holding = holderVerdict(holder, sessionId, n);
  if (holding.kind === "own") return { ok: true, tableNumber: n, already: true };
  if (holding.kind === "refuse") return holding.result;
  const shellId = holding.kind === "shell" ? holding.shellId : null;

  // The index is partial on `status`, so an expired-but-active row holds N until the cron: close it
  // first (dead rows only), then the ONE call.
  await sweepExpiredOnTable(db, n);
  const { outcome, error } = await bindSessionTable(db, sessionId, n, shellId);
  if (error) {
    if (error.code === "23505") {
      // The number was taken between the pre-read and the write. Decided by the ONE predicate,
      // never by the constraint name, and nothing on the holder's session is written.
      const taken = await seatedSessionFor(db, n, reg.qr_code).catch(() => null);
      return rereadVerdict(taken, sessionId, n);
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
  // M263 — an answer this build cannot read is never a landing.
  if (!outcome) return { ok: false, reason: "error" };
  // A freeze that committed after authz's read, seen by the RPC under the cart's lock.
  if (outcome.kind === "locked") return { ok: false, reason: "locked" };
  if (outcome.kind === "settling") return { ok: false, reason: "settling" };
  // J41 — the session's sticker belongs to another table; the refusal names THAT table.
  if (outcome.kind === "sticker")
    return { ok: false, reason: "sticker_table", tableNumber: outcome.stickerTable };
  // J40 (red-team #5) — the shell changed under the call (`gone`), or is no longer untouched
  // (`held`): re-read who is at N now and answer THAT — a party seated meanwhile is `seated`, this
  // phone's own other tab is `already`, a still-hostless shell the RPC called `held` is `held`,
  // nobody is a retry.
  if (outcome.kind === "gone" || outcome.kind === "held") {
    const now = await seatedSessionFor(db, n, reg.qr_code).catch(() => null);
    return rereadVerdict(now, sessionId, n, outcome.kind === "held");
  }
  if (outcome.kind === "bound" || outcome.kind === "adopted") {
    // D30 — every peer's `qr_carts` watch re-reads the view and the number flips without a remount.
    await touchCart(id, "bindTable");
    getPostHogClient().capture({
      distinctId: uid,
      event: "table_bound",
      properties: {
        cart_id: id,
        session_id: sessionId,
        table_number: n,
        adopted: outcome.kind === "adopted",
      },
    });
    return { ok: true, tableNumber: n, already: false };
  }

  // `unmoved` — zero rows: the row moved under us (two tabs, a bound-meanwhile session, an expiry).
  // Re-read the OWN row and let the pure verdict name it — a blocked write is never a landing.
  const { data: own, error: ownErr } = await db
    .from("table_sessions")
    .select("status,expires_at,table_number")
    .eq("id", sessionId)
    .maybeSingle();
  if (ownErr) return { ok: false, reason: "error" };
  return bindVerdict({ count: 0, reread: own ?? null, n, nowMs: Date.now() });
}
