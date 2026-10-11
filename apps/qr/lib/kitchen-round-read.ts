import "server-only";
import type { serviceClient } from "@mms/db/server";
import { queueEmptiness } from "./queue-window";
import type { KitchenRound } from "./kitchen-types";
import { roundOrdinals, type RoundLine } from "./kitchen-rounds";

/**
 * PD5 / PD9 — THE round read, shared by the two screens that draw a table's rounds: Mom's KDS
 * (`lib/kitchen.ts`) and the dining room's TV board (`app/api/board/route.ts`). One read and one
 * rank (`roundOrdinals`, `lib/kitchen-rounds.ts`), so the wall and Mom's board give one card one
 * number ("name it ONCE"): a second copy of this read — the settlement rule, the caps, the exact
 * count — would drift the day one of them is fixed. Server-only, and NOT a `"use server"` module:
 * nothing here may become a public Server Action. Moved out of `lib/kitchen.ts` unchanged, and since
 * PD5b (#340, m5 §H.4) it reads no orders: settlement food is told apart by its batch's own mark.
 */

/** PD5 — the round read's bounds: the non-cancelled carts of the board's DINE-IN sessions (a table
 *  visit is one open cart plus its paid ones), then every batched line on them. Past either cap
 *  the read did not answer, and every round is `unknown` — ADVISORY, never `outage` (m5 decision 9).
 *  The lines cap is 1 000 — PostgREST's `max_rows` (`supabase/config.toml`), which truncates
 *  SILENTLY: a cap above it never saturates, and the rank is read off a partial history (Codex
 *  round 2 on #328). At the cap the read cannot say, and every round reads `unknown`; and because
 *  the deployed ceiling is a dashboard setting this repo cannot read, the read also asks for its
 *  exact count and refuses any answer shorter than it (the expo comp read's posture). The ordinal
 *  ranks EVERY batched line of each live dine-in visit, served and voided included (a void keeps its
 *  batch; a served round is still round 1), so the read cannot be scoped by state. */
export const ROUND_CART_CAP = 200;
export const ROUND_LINE_CAP = 1_000;

/** PD5 — per dine-in session on the board: its batches' ordinals, and every batch the read SAW
 *  (numbered or not); `null` when the advisory read did not answer. */
export type RoundsRead = ReadonlyMap<
  string,
  { ordinals: ReadonlyMap<string, number>; seen: ReadonlySet<string> }
> | null;

/**
 * PD5 — a dine-in card's round from the read. The read answering nothing is `unknown` (never a
 * guessed "1"), and so is a batch the read did not SEE under the card's session: a merge moved it
 * between the board's read and this one (re-parented to another table, or folded into a line
 * there), and a definite `none` would freeze an unnumbered face on a real round — `unknown` is
 * provisional, so the next poll decides it (the blind pass on #328). A batch the read saw and did
 * not number carried no dine-in line, or is settlement food: a `none` card with its channel tag.
 */
export function roundFor(
  rounds: RoundsRead,
  sessionId: string,
  batch: string | null,
): KitchenRound {
  if (rounds === null || batch === null) return { kind: "unknown" };
  const read = rounds.get(sessionId);
  if (read === undefined || !read.seen.has(batch)) return { kind: "unknown" };
  const n = read.ordinals.get(batch);
  return n === undefined ? { kind: "none" } : { kind: "n", n };
}

/**
 * PD5 — the round read (m5 decision 9, risk 5), over the board's DINE-IN sessions only (the caller
 * filters them; none → no read at all). ADVISORY all the way down: any failure or saturation answers
 * `null` (every dine-in card then reads `unknown` and the board keeps rendering — a round is never
 * worth a frozen kitchen), and so does a THROWN read, so the caller can start it early and abandon
 * it on an outage with nothing left unhandled.
 */
export async function readRounds(
  db: ReturnType<typeof serviceClient>,
  sessionIds: readonly string[],
  nowIso: string,
): Promise<RoundsRead> {
  if (sessionIds.length === 0) return new Map();
  return readRoundLegs(db, sessionIds, nowIso).catch((e: unknown) => {
    console.error("[kitchen] round read threw — rounds unknown this poll", {
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  });
}

/**
 * The legs: the sessions' non-cancelled carts (a table visit is one open cart plus its paid ones),
 * then every batched line on them (any state — a void keeps its batch). Settlement food is told
 * apart by its batch's own mark (`isSettlementBatch`, PD5b), so no order is read: the paid moment
 * this read once ranked by is gone with the guess it fed.
 */
async function readRoundLegs(
  db: ReturnType<typeof serviceClient>,
  sessionIds: readonly string[],
  nowIso: string,
): Promise<RoundsRead> {
  const { data: carts, error: cartsError } = await db
    .from("qr_carts")
    .select("id,session_id,status")
    .in("session_id", [...sessionIds])
    .neq("status", "cancelled")
    .limit(ROUND_CART_CAP);
  if (cartsError || !carts) {
    console.error("[kitchen] round read (carts) failed — rounds unknown this poll", {
      message: cartsError?.message,
    });
    return null;
  }
  if (queueEmptiness(carts.length, ROUND_CART_CAP) === "cannot-say") {
    console.error("[kitchen] round read (carts) saturated — rounds unknown this poll", {
      cap: ROUND_CART_CAP,
    });
    return null;
  }
  if (carts.length === 0) return new Map();
  const sessionByCart = new Map(carts.map((c) => [c.id, c.session_id]));
  const cartIds = [...sessionByCart.keys()];
  const {
    data: batched,
    error: linesError,
    count: linesCount,
  } = await db
    .from("qr_cart_items")
    .select("cart_id,fire_batch,fire_at,fulfillment", { count: "exact" })
    .in("cart_id", cartIds)
    .not("fire_batch", "is", null)
    .limit(ROUND_LINE_CAP);
  if (linesError || !batched) {
    console.error("[kitchen] round read (lines) failed — rounds unknown this poll", {
      message: linesError?.message,
    });
    return null;
  }
  if (queueEmptiness(batched.length, ROUND_LINE_CAP) === "cannot-say") {
    console.error("[kitchen] round read (lines) saturated — rounds unknown this poll", {
      cap: ROUND_LINE_CAP,
    });
    return null;
  }
  // Shorter than its own count: the API's row ceiling cut it below our cap. A rank read off part of
  // a session's Sends is a guessed number, so it is no answer at all.
  if (linesCount === null || linesCount > batched.length) {
    console.error(
      "[kitchen] round read (lines) truncated below its count — rounds unknown this poll",
      {
        count: linesCount,
        rows: batched.length,
      },
    );
    return null;
  }
  const bySession = new Map<string, RoundLine[]>();
  for (const r of batched) {
    const sid = sessionByCart.get(r.cart_id);
    if (sid === undefined) continue;
    const ls = bySession.get(sid);
    if (ls === undefined) bySession.set(sid, [r]);
    else ls.push(r);
  }
  return new Map(
    [...bySession].map(([sid, ls]) => [
      sid,
      {
        ordinals: roundOrdinals(ls, nowIso),
        seen: new Set(ls.flatMap((l) => (l.fire_batch === null ? [] : [l.fire_batch]))),
      },
    ]),
  );
}
