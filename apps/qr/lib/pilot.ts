import "server-only";
import { serviceClient } from "@mms/db/server";
import type { DaySummary } from "./register-math";
import { laDayStartIso } from "./register-math";
import { getDayCashSummary } from "./register";
import { bucketByChannel, type ChannelSplit, type PilotOrderRow } from "./pilot-night";
import { PILOT_PROMO_CODE } from "./pilot-tag";
import { staffGate, STAFF_WRITE_OUTAGE } from "./staff";

/**
 * P5 — the nightly pilot sheet's reads (`docs/PILOT_PLAN.md` §2 · §3 P5).
 *
 * The pilot's own measurement list is six lines long and five of them already exist somewhere in the
 * console; what did not exist was ONE screen someone can stand in front of at 9pm with the day's
 * answers on it. This is that read. It is READ-ONLY for the whole pilot (K13 stays open by
 * decision — two weeks does not justify a write path), manager-gated like the feedback triage it
 * renders beside, and it invents nothing.
 *
 * ⚠️ EVERY FIGURE HERE IS QUOTED, NOT RE-DERIVED, WHEREVER ONE ALREADY HAS AN AUTHORITY:
 *   • money — `getDayCashSummary()`, the register's Z-report, unchanged and un-recomputed. Deriving
 *     the day's takings a second time is exactly the class of defect the W17 money rules exist for,
 *     and this is a screen someone reads as a statement of what the restaurant took.
 *   • the day window — `laDayStartIso`, so "today" means the same instant on this screen, the
 *     register and the tip report. A second definition of midnight is a second answer to every
 *     question on the page.
 *   • discount use — `promo_redemptions`, the row fulfillment writes. Not `qr_carts.promo_code`,
 *     which says a code is ATTACHED; a code that delivered nothing (M22's reward-first clamp) leaves
 *     the cart carrying it and consumes no redemption, and counting attachments as participation
 *     would overstate the pilot on exactly the tables where the discount gave least.
 *
 * ⚠️ AND THE FIGURE IT DELIBERATELY DOES NOT PRODUCE: nothing here reconciles against Stripe. The
 * app cannot see the Stripe dashboard, so the "zero charged-without-order" check stays a hand-check
 * — the sheet says so in words rather than printing a number that would look like the check had
 * been done. The one thing it CAN show is the `qr_refunds_needed` ledger, which is the app's own
 * record of a charge no order accounts for.
 *
 * A FAILED READ IS NEVER A ZERO. Any read error collapses the whole result to `{ ok: false }` and
 * the sheet says it cannot read tonight's numbers — the same rule, and the same reason, as
 * `getDayCashSummary` and `getCartTotals`: a confident zero on this screen is a lie about the day.
 *
 * ⚠️ IT WALKS THE DAY'S ORDERS TWICE, and the bound that makes that acceptable is stated rather than
 * assumed. `getDayCashSummary` pages `qr_orders` for its tender columns, and the loop below pages the
 * same rows again for their session mode — so a page view costs 2·⌈N/1000⌉ + 5 sequential round
 * trips at N orders in the day. Reading both from one pass would mean either widening the register's
 * projection or re-deriving its arithmetic here, and the second is the drift the W17 rules forbid on
 * exactly this kind of screen. The bound: this is a family restaurant running a two-week pilot at
 * tens of orders a day, so both passes are one page each and milliseconds apart. Two consequences
 * follow if that ever stops being true — the round trips grow linearly, and the two passes are taken
 * at DIFFERENT INSTANTS, so an order landing between them is in the count and not in the money (or
 * the reverse). At pilot volume that window is invisible; past a few hundred orders a day, read the
 * orders once and hand the rows to both derivations.
 */

export type PilotNight = {
  /** The instant "tonight" starts — the LA calendar day's midnight, the register's own window. */
  sinceIso: string;
  /** `promo_redemptions` rows for the pilot code since `sinceIso`. Exact, not a page length. */
  pilotRedemptions: number;
  /** The pilot code these redemptions belong to, so the copy never hardcodes it twice. */
  promoCode: string;
  /**
   * Does an ACTIVE `promo_codes` row for that code exist at all?
   *
   * P5 landed ahead of P3, which is the slice that inserts the row — so on Day 0 the redemption
   * count is a structural zero. "0 discounts given" is true and reads as "nobody used it", which is
   * a different statement and the wrong one. The sheet says "not set up yet" instead, and this is
   * the fact that decides. `false` also covers a deactivated code (`active = false`), which is how
   * the pilot ENDS — the count freezes and the sheet should say why.
   */
  promoLive: boolean;
  /** The day's paid orders, bucketed by the door they came in — see `pilot-night.ts`. */
  split: ChannelSplit;
  /** The register's own day summary, quoted verbatim. */
  money: DaySummary;
  /** Feedback left since `sinceIso`, and how much of it needs following up. Both exact counts. */
  ratings: { total: number; low: number };
  /** UNRESOLVED `qr_refunds_needed` rows, all time — money taken with no order behind it. Not
   *  day-scoped: a charge from Tuesday is still owed back tonight. */
  unresolvedRecoveries: number;
};

export type PilotNightResult =
  | { ok: true; night: PilotNight }
  | { ok: false; reason: "outage" | "forbidden" };

/** The rating at or below which a review needs follow-up — the same floor `/staff/feedback` uses. */
const LOW_RATING = 3;

/** A head-count read's answer, or `null` when PostgREST did not actually count one. */
function countOf(result: { count: number | null; error: unknown }): number | null {
  return result.error ? null : result.count;
}

export async function getPilotNight(): Promise<PilotNightResult> {
  // Manager floor, matching the surface this renders on and the Z-report it quotes. `staffGate`
  // rather than `requireStaff` so an OUTAGE stays distinguishable from a role refusal: one is worth
  // a "can't read tonight" sentence, the other means the zone simply is not this person's.
  const gate = await staffGate("manager");
  if (!gate.ok)
    return { ok: false, reason: gate.error === STAFF_WRITE_OUTAGE ? "outage" : "forbidden" };

  const sinceIso = laDayStartIso(new Date());
  const db = serviceClient();

  // The register's day summary — its own gate, its own read, its own arithmetic. Quoted, not redone.
  const cash = await getDayCashSummary();
  if (!cash.ok) return { ok: false, reason: cash.reason };

  // Exact counts, never a page length: `head: true` asks PostgREST for the count and no rows, so a
  // day with more than a page of ratings still reports the real number rather than the cap. (This is
  // the trap `getDayCashSummary` pages around for its own read — same failure, different shape.)
  const [redemptions, ratingsAll, ratingsLow, recoveries, promoRow] = await Promise.all([
    db
      .from("promo_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("code", PILOT_PROMO_CODE)
      .gte("redeemed_at", sinceIso),
    db
      .from("mms_feedback")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sinceIso),
    db
      .from("mms_feedback")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sinceIso)
      .lte("rating", LOW_RATING),
    // ⚠️ NOT day-scoped, deliberately: an orphan charge from Tuesday is still owed back on Friday.
    // The SHEET says so on the card (`pilot.night.recovery.scope`) — a card headed "since midnight"
    // must not let an all-time figure pass as tonight's, and a docblock is not where a reader looks.
    db.from("qr_refunds_needed").select("id", { count: "exact", head: true }).eq("resolved", false),
    // Does the code exist and is it live? `maybeSingle` so "no row" is data, not an error.
    db.from("promo_codes").select("active").eq("code", PILOT_PROMO_CODE).maybeSingle(),
  ]);
  // `{ data: null, error }` is how postgrest-js reports a transport failure — it RESOLVES rather than
  // rejecting — so an unchecked read here would answer a confident `null` count that `?? 0` would
  // turn into "nothing happened tonight". Each one is checked, and a null count is treated exactly
  // like an error: `count` is null whenever PostgREST did not actually count, and `?? 0` on that
  // path is the whole defect.
  const pilotRedemptions = countOf(redemptions);
  const ratingsTotal = countOf(ratingsAll);
  const ratingsLowCount = countOf(ratingsLow);
  const unresolvedRecoveries = countOf(recoveries);
  if (
    pilotRedemptions === null ||
    ratingsTotal === null ||
    ratingsLowCount === null ||
    unresolvedRecoveries === null ||
    // Same rule for the row read: a failed lookup must not report "not set up yet", which is a
    // claim about the campaign rather than about the read.
    promoRow.error
  )
    return { ok: false, reason: "outage" };

  // The day's orders with their session's mode. Paged explicitly for the reason `getDayCashSummary`
  // pages: PostgREST truncates at its max-rows (default 1000) with `error` still null, and a
  // silently-short order count on a screen headed "tonight" is exactly the lie this sheet must not
  // tell. The tie-break on `id` is W21d's — `created_at` alone can order tied rows differently
  // across two page requests, duplicating or dropping rows at the seam.
  //
  // `table_sessions(mode)` is a LEFT embed (no `!inner`): an order whose session row is gone must
  // still be counted, as unattributed, rather than disappearing from the day.
  const rows: PilotOrderRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("qr_orders")
      .select("status,table_sessions(mode)")
      .gte("created_at", sinceIso)
      .in("status", ["paid", "refunded"])
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { ok: false, reason: "outage" };
    const page = data ?? [];
    for (const r of page) {
      // PostgREST returns a to-one embed as an object, but the generated types model it as
      // `object | null` and older shapes as an array — normalize both rather than trusting one.
      const embedded = (r as { table_sessions?: { mode: string } | { mode: string }[] | null })
        .table_sessions;
      const session = Array.isArray(embedded) ? (embedded[0] ?? null) : (embedded ?? null);
      rows.push({ status: r.status, mode: session?.mode ?? null });
    }
    if (page.length < PAGE) break;
  }

  return {
    ok: true,
    night: {
      sinceIso,
      pilotRedemptions,
      promoCode: PILOT_PROMO_CODE,
      promoLive: promoRow.data?.active === true,
      split: bucketByChannel(rows),
      money: cash.summary,
      ratings: { total: ratingsTotal, low: ratingsLowCount },
      unresolvedRecoveries,
    },
  };
}
