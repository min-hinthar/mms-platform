import "server-only";
import { after } from "next/server";
import type Stripe from "stripe";
import { serviceClient } from "@mms/db/server";
import { getStripe } from "./stripe";
import { getPostHogClient } from "./posthog-server";
import { fulfillSucceededIntent, type FulfillVia } from "./fulfill-intent";
import { chunkIds } from "./kitchen-stop-read";
import {
  fulfillAnswer,
  isCartIdShape,
  isRecoverableKind,
  isUuidShape,
  RECOVERY_EXPAND,
  recoveryVerdict,
  refusalAnswer,
  sweepWindow,
  type RecoveryAnswer,
  type RecoveryCart,
  type RecoveryExpect,
} from "./payment-recovery-verdict";

/**
 * M160(b) — the stranded-paid-cart recovery: the sequence around `recoveryVerdict`.
 *
 * retrieve (Stripe's own answer, never the caller's) → read the cart the metadata names → verdict →
 * the webhook's own fulfillment (`fulfillSucceededIntent`). Three doors reach it:
 *
 *   • /track (`recoverMyPayment`, lib/payment-recovery-actions.ts) — a guest whose order has not
 *     appeared 12 s after paying, bound to the guest's own uid;
 *   • staff's "Check payment" (`checkTablePayment`, same file) on a table whose clear refused
 *     `card_live`, staff-authorized;
 *   • the cron (`app/api/cron/stranded-payments`) — the sweep below, for a payment nobody is
 *     watching (owner ruling #13: it runs once `CRON_SECRET` is set).
 *
 * Not a Server Action file: nothing here is callable from a browser. The actions module wraps it.
 */

/**
 * Read the cart a verdict needs. `undefined` is an unreadable row — never "no cart". The freeze
 * columns are what binds a secure-tab close (`secureTabBound`): one row, one snapshot, so the
 * owner, its time and the pay lock are judged against each other as stored.
 */
async function readRecoveryCart(cartId: string): Promise<RecoveryCart | undefined> {
  const { data, error } = await serviceClient()
    .from("qr_carts")
    .select("status,live_payment_intent_id,settle_by,settle_at,locked,locked_at")
    .eq("id", cartId)
    .maybeSingle();
  if (error) {
    console.error("[payment-recovery] cart read failed", { cartId, error: error.message });
    return undefined;
  }
  return data
    ? {
        status: data.status,
        linkedIntent: data.live_payment_intent_id,
        settleBy: data.settle_by,
        settleAt: data.settle_at,
        locked: data.locked,
        lockedAt: data.locked_at,
      }
    : null;
}

/**
 * The account an anonymous payer merged into (K3b, `mms_identity_merges`): the target uid, `null`
 * when no merge exists, `undefined` when the read failed — fail closed, never "no merge" (a guest
 * would read "we can't check this" for a payment that is theirs; the webhook and the cron still can).
 */
async function readMergedEarner(anonUid: string): Promise<string | null | undefined> {
  const { data, error } = await serviceClient()
    .from("mms_identity_merges")
    .select("target_uid")
    .eq("anon_uid", anonUid)
    .maybeSingle();
  if (error) {
    console.error("[payment-recovery] identity-merge read failed", { error: error.message });
    return undefined;
  }
  return data?.target_uid ?? null;
}

/**
 * Run the recovery for an intent Stripe has just handed back. `expect.cartId` is the cart the door
 * found the intent on; for the cron it is the intent's own metadata (the cron's binding is the
 * cart's link, which the verdict checks).
 */
export async function recoverRetrievedIntent(
  intent: Stripe.PaymentIntent,
  expect: RecoveryExpect,
  via: Exclude<FulfillVia, "webhook">,
): Promise<RecoveryAnswer> {
  const metaCart = intent.metadata?.cartId;
  // An unshaped id never reaches the uuid column (the verdict refuses it as `unbound` below).
  const cart = isCartIdShape(metaCart) ? await readRecoveryCart(metaCart) : null;
  if (cart === undefined) return { kind: "error" };
  // Codex on #365 @ 1b760cb (P2) — the guest door's payer binding resolves the metadata uid through
  // the durable identity redirect, read HERE (never from the caller), and only when it could matter:
  // a guest door, and a metadata uid that is not already the caller's.
  const earner = intent.metadata?.earnerUid;
  let mergedEarner: string | null = null;
  if (expect.payerUid !== null && earner !== expect.payerUid && isUuidShape(earner)) {
    const merged = await readMergedEarner(earner);
    if (merged === undefined) return { kind: "error" };
    mergedEarner = merged;
  }
  const verdict = recoveryVerdict({ intent, expect, cart, mergedEarner });
  if (!verdict.ok) {
    // FAIL CLOSED, AND SAY SO. Every refusal is logged by name with the intent and the door, so an
    // operator can find a charge the recovery would not touch. `not_succeeded` is the ordinary case
    // (a guest who has not finished paying) and stays at warn.
    const log = verdict.refusal === "not_succeeded" ? console.warn : console.error;
    log("[payment-recovery] refused", {
      refusal: verdict.refusal,
      // A SUCCEEDED charge this door would not touch — an operator's to look at in Stripe AND in
      // `qr_orders`: the refusal says nothing about whether an order exists (a probe of someone
      // else's recorded order refuses `unbound`; a `refunded` charge already went back).
      succeeded: verdict.refusal !== "not_succeeded",
      paymentIntent: intent.id,
      status: intent.status,
      kind: intent.metadata?.kind ?? null,
      cartId: expect.cartId,
      via,
    });
    return refusalAnswer(verdict.refusal);
  }
  const outcome = await fulfillSucceededIntent(intent, via);
  if (outcome.kind === "fulfilled")
    console.error(
      "[payment-recovery] RECOVERED a stranded paid cart — the webhook never fulfilled it",
      {
        paymentIntent: intent.id,
        cartId: expect.cartId,
        orderId: outcome.orderId,
        via,
      },
    );
  // The shared path captures analytics; drain it after the answer (the webhook does the same at its
  // end). Best-effort by definition.
  after(async () => {
    try {
      await getPostHogClient().flush();
    } catch {
      // the outcome is already decided — never surface an analytics-drain failure
    }
  });
  return fulfillAnswer(outcome);
}

/** Retrieve, then recover. A failed retrieve is `error`: a transport failure is not a verdict. */
export async function recoverIntent(
  intentId: string,
  expect: RecoveryExpect,
  via: Exclude<FulfillVia, "webhook">,
): Promise<RecoveryAnswer> {
  let intent: Stripe.PaymentIntent;
  try {
    // The charge EXPANDED: the refund rule reads it, and a bare id refuses as `charge_unread`.
    intent = await getStripe().paymentIntents.retrieve(intentId, { expand: [...RECOVERY_EXPAND] });
  } catch (e) {
    console.error("[payment-recovery] retrieve failed", {
      paymentIntent: intentId,
      via,
      error: e instanceof Error ? e.message : String(e),
    });
    return { kind: "error" };
  }
  return recoverRetrievedIntent(intent, expect, via);
}

// ── The cron's sweep ──────────────────────────────────────────────────────────────────────────────

/** How old a charge must be before the sweep touches it: the webhook's own window first. */
export const SWEEP_MIN_AGE_MS = 3 * 60 * 1000;
/**
 * The LONGEST interval the cron may be scheduled at — daily, the tightest a Vercel plan allows
 * (ENV.md _The stranded-payment cron_). A more frequent schedule only overlaps more (the sweep is
 * idempotent: anything on record is skipped); a LESS frequent one leaves a gap between runs.
 */
export const SWEEP_SCHEDULE_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** How much two consecutive runs share, past the min-age — slack for a late or slow cron start. */
export const SWEEP_OVERLAP_MS = 60 * 60 * 1000;
/**
 * How far back the sweep looks: one schedule interval, plus the min-age the previous run left
 * unexamined at its own `now`, plus the overlap (Codex on #365 @ a2636db: a bare 24 h minus the
 * 3 min floor left every intent created in the 3 minutes before a daily run in NO run's window).
 * Stripe's own webhook retries run for 72 h, so the window never outlives a delivery Stripe owes.
 */
export const SWEEP_LOOKBACK_MS = SWEEP_SCHEDULE_INTERVAL_MS + SWEEP_MIN_AGE_MS + SWEEP_OVERLAP_MS;
/**
 * Pages of 100 the sweep reads at most — the bound on one run's Stripe calls, and the one gap this
 * sweep cannot close by itself. The list is newest-first and every run starts over, so on a window
 * holding more than `SWEEP_MAX_PAGES × 100` intents (the account is shared with the delivery app)
 * the OLDEST part is never examined. Splitting the window into slices would not change that — each
 * run's capacity is the same — so the bound is set well above this account's volume, and a run that
 * hits it says so at error level, naming how far back it reached (OPEN-ITEMS M160: a persisted
 * cursor is the follow-up the day that line appears).
 */
export const SWEEP_MAX_PAGES = 10;
/**
 * Recoveries one run attempts at most — the ones that can make PROGRESS (reach the fulfillment: an
 * order, a refund-needed row, or an error worth retrying); the next run picks up the rest. A refusal
 * does not count (Codex on #365 @ 1b760cb, P2): a refunded or superseded charge never gets an order or
 * a ledger row, so it is a candidate on every run, and newest-first a handful of them used to spend
 * the whole cap before any older recoverable payment was reached. Refusals are bounded instead by
 * `SWEEP_MAX_EXAMINE`, and each is logged at error level by name (`recoverRetrievedIntent`).
 */
export const SWEEP_MAX_RECOVER = 25;
/** Candidates one run examines at most, refused or not: each costs a cart read, never a Stripe call
 *  (the listed object is the fresh read). */
export const SWEEP_MAX_EXAMINE = 200;
/**
 * Wall-clock budget for one run, from its start: checked before each page and each candidate, so the
 * worst case (10 expanded pages, then 25 serial fulfillments) stops early and SAYS what it did not
 * reach rather than being killed by the route's `maxDuration` (60 s) mid-fulfillment with nothing
 * logged. 45 s leaves one slow fulfillment's worth of room under that ceiling.
 */
export const SWEEP_TIME_BUDGET_MS = 45_000;
/** Ids per `.in()` read: up to 1000 ids in one GET is a ~30 KB URL, past what a gateway admits
 *  (blind pass + Codex on #365 @ 1b760cb) — the sweep would 500 exactly at volume. */
export const SWEEP_ID_CHUNK = 100;

/** Read one ledger in `SWEEP_ID_CHUNK`-id chunks; any chunk's error is the WHOLE read's (throws). */
async function readInChunks<T>(
  ids: readonly string[],
  read: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const results = await Promise.all(chunkIds(ids, SWEEP_ID_CHUNK).map((chunk) => read(chunk)));
  const out: T[] = [];
  for (const r of results) {
    if (r.error) throw new Error(`${what} unreadable: ${r.error.message}`);
    out.push(...(r.data ?? []));
  }
  return out;
}

export type SweepSummary = {
  listed: number;
  /** Succeeded, recoverable kind, cart-shaped metadata, no order and no refund row on record. */
  candidates: number;
  /** Candidates whose cart is not in this database — another app's PaymentIntent on the shared
   *  Stripe account. Skipped silently: not ours to log. */
  foreign: number;
  answers: Partial<Record<RecoveryAnswer["kind"], number>>;
  /** True when the page cap or the recovery cap stopped the run before the window was exhausted. */
  truncated: boolean;
};

/**
 * Sweep paid-but-unfulfilled carts in the bounded window: list succeeded intents, drop every one
 * already on record (an order, or a refund-needed row), and run each remaining one through the same
 * recovery the other doors use. Returns counts only — no ids leave this function except in logs.
 *
 * Throws on an unreadable order/refund ledger: the cron route answers 500 and the next run retries,
 * rather than recovering blind against a ledger it could not read.
 */
export async function sweepStrandedPayments(
  nowMs: number = Date.now(),
  clock: () => number = Date.now,
): Promise<SweepSummary> {
  const startedAt = clock();
  const overBudget = () => clock() - startedAt > SWEEP_TIME_BUDGET_MS;
  const stripe = getStripe();
  const db = serviceClient();
  const created = sweepWindow(nowMs, SWEEP_LOOKBACK_MS, SWEEP_MIN_AGE_MS);
  const summary: SweepSummary = {
    listed: 0,
    candidates: 0,
    foreign: 0,
    answers: {},
    truncated: false,
  };

  const succeeded: Stripe.PaymentIntent[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < SWEEP_MAX_PAGES; page++) {
    if (page > 0 && overBudget()) {
      summary.truncated = true;
      console.error(
        "[payment-recovery] sweep hit its time budget while listing — older intents NOT examined",
        {
          budgetMs: SWEEP_TIME_BUDGET_MS,
          pagesRead: page,
        },
      );
      break;
    }
    const res = await stripe.paymentIntents.list({
      created,
      limit: 100,
      // Each charge expanded, as `recoverIntent`'s retrieve does: the refund rule reads it.
      expand: RECOVERY_EXPAND.map((f) => `data.${f}`),
      ...(startingAfter && { starting_after: startingAfter }),
    });
    summary.listed += res.data.length;
    for (const pi of res.data) {
      if (
        pi.status === "succeeded" &&
        isRecoverableKind(pi.metadata?.kind) &&
        isCartIdShape(pi.metadata?.cartId)
      )
        succeeded.push(pi);
    }
    if (!res.has_more) break;
    startingAfter = res.data.at(-1)?.id;
    if (page === SWEEP_MAX_PAGES - 1) {
      summary.truncated = true;
      // LOUD: the intents older than this one were not examined by this run, and the next run's
      // window overlaps this one by only `SWEEP_OVERLAP_MS` — see `SWEEP_MAX_PAGES`.
      console.error("[payment-recovery] sweep hit the page cap — older intents NOT examined", {
        pages: SWEEP_MAX_PAGES,
        reachedCreated: res.data.at(-1)?.created ?? null,
        windowGte: created.gte,
      });
    }
  }
  if (succeeded.length === 0) return summary;

  const ids = succeeded.map((pi) => pi.id);
  const [orders, refunds] = await Promise.all([
    readInChunks(
      ids,
      (chunk) =>
        db
          .from("qr_orders")
          .select("stripe_payment_intent_id")
          .in("stripe_payment_intent_id", chunk),
      "order ledger",
    ),
    readInChunks(
      ids,
      (chunk) => db.from("qr_refunds_needed").select("payment_intent").in("payment_intent", chunk),
      "refund ledger",
    ),
  ]);
  const onRecord = new Set<string>([
    ...orders.map((o) => o.stripe_payment_intent_id ?? ""),
    ...refunds.map((r) => r.payment_intent),
  ]);
  const stranded = succeeded.filter((pi) => !onRecord.has(pi.id));
  summary.candidates = stranded.length;
  if (stranded.length === 0) return summary;

  const cartIds = [...new Set(stranded.map((pi) => pi.metadata.cartId as string))];
  const carts = await readInChunks(
    cartIds,
    (chunk) => db.from("qr_carts").select("id").in("id", chunk),
    "cart",
  );
  const ours = new Set(carts.map((c) => c.id));

  let attempted = 0;
  let examined = 0;
  for (const [i, pi] of stranded.entries()) {
    const cartId = pi.metadata.cartId as string;
    if (!ours.has(cartId)) {
      summary.foreign++;
      continue;
    }
    if (attempted >= SWEEP_MAX_RECOVER || examined >= SWEEP_MAX_EXAMINE) {
      summary.truncated = true;
      break;
    }
    if (overBudget()) {
      summary.truncated = true;
      // LOUD, and counted: what this run did not reach is the next run's — or, past the lookback,
      // nobody's (SWEEP_MAX_PAGES says why that bound stands).
      console.error("[payment-recovery] sweep hit its time budget — candidates NOT examined", {
        budgetMs: SWEEP_TIME_BUDGET_MS,
        examined,
        notReached: stranded.slice(i).filter((p) => ours.has(p.metadata.cartId as string)).length,
      });
      break;
    }
    examined++;
    // The listed object is a fresh read from Stripe (this request), so it is not re-retrieved.
    const answer = await recoverRetrievedIntent(pi, { cartId, payerUid: null }, "cron");
    summary.answers[answer.kind] = (summary.answers[answer.kind] ?? 0) + 1;
    // Only an attempt that can make progress spends the recovery cap (SWEEP_MAX_RECOVER).
    if (answer.kind !== "refused" && answer.kind !== "not_paid") attempted++;
  }
  return summary;
}
