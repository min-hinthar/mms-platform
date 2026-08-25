// verify:slice-exempt — W19: the tip-amount ceiling this route enforces is the pure predicate,
// mutated in `lib/tip.ts` where it lives. M70 (2026-08-25) added a second money-relevant line
// here — the `mms_pin_promo_grant` call — and this exemption did NOT cover it: the reason
// above is about the tip ceiling, so the guard was waving through a rule nobody had guarded.
// `scripts/check-promo-grant-pin.mjs` now asserts the pin is taken AND taken before the
// amount is derived. An exemption is a claim about what is covered elsewhere; when the file
// grows a rule the claim does not cover, the exemption is stale, not the rule.
// `tipWithinAmountCap` in lib/tip.ts, where its mutant (tip/amount-cap-dropped) lives and its suite
// reddens; this route only wires the refusal (routes have no test runner to own a mutant here).
import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@mms/db/server";
import { createIntentInput } from "@mms/db/schemas";
import { getStripe } from "@/lib/stripe";
import { getCartTotals } from "@/lib/totals";
import { unavailableLineNames } from "@/lib/availability-read";
import { manualCaptureMode } from "@/lib/manual-capture";
import { tipWithinAmountCap } from "@/lib/tip";
import { pickupContactMissing } from "@/lib/pickup-contact";
import { assertCartMember, AuthzError } from "@/lib/authz";
import { withinMutationRate } from "@/lib/rate";
import { acquireCartLock, releaseCartLock } from "@/lib/lock";
import { getPostHogClient } from "@/lib/posthog-server";

// Creates a PaymentIntent for the SERVER-COMPUTED total. The client sends only the
// cartId + tip choice — never an amount. (Fixes client-authoritative pricing.)
export async function POST(req: NextRequest) {
  let acquired: { cartId: string; uid: string } | null = null;
  try {
    const { cartId, tipRate, firstName, phone } = createIntentInput.parse(await req.json());

    // C3: only a verified member of this cart's session may mint its PaymentIntent.
    const { sessionId, uid, settling } = await assertCartMember(cartId);

    // Per-device flood guard (P3.4): bound PaymentIntent minting per seat so a hostile client can't spam
    // intent creation (distinct tip amounts dodge the idempotency key). Fail-open. Before any Stripe call.
    if (!(await withinMutationRate(uid)))
      return NextResponse.json(
        { error: "Too many attempts — wait a moment and try again." },
        { status: 429 },
      );

    // Split-tender in flight (M3·P3.3b): single-pay and split are mutually exclusive (acquireCartLock
    // also rejects a fresh settlement). Catch it here FIRST so the diner gets an honest, actionable
    // message — pay your share on the split board — not the generic "someone's checking out" lock copy.
    if (settling)
      return NextResponse.json(
        { error: "Your table is splitting the bill — pay your share on the split screen." },
        { status: 409 },
      );

    // Lock the cart for the pay window (P3.2-lock) BEFORE deriving the amount, so a peer can't mutate
    // it mid-checkout → the webhook reconcile 409s / charges with no order. Atomic; the SAME payer
    // re-acquiring (refresh / retry) succeeds, a stale lock is taken over, a fresh lock by ANOTHER
    // member is rejected. Released on decline (webhook), "Edit order" (releasePayLock), or the TTL.
    const lock = await acquireCartLock(cartId, uid);
    // M119 (b) — an unreadable status read is not a verdict about the order. Mapped before `closed`
    // so an outage can never be reported as "no longer open", which is what it used to say.
    if (lock === "unavailable")
      return NextResponse.json(
        { error: "We’re having trouble on our end — try again in a moment." },
        { status: 503 },
      );
    if (lock === "closed")
      return NextResponse.json({ error: "This order is no longer open." }, { status: 400 });
    if (lock === "held_by_other")
      return NextResponse.json(
        { error: "Someone at your table is checking out — try again in a moment." },
        { status: 409 },
      );
    acquired = { cartId, uid }; // release on any post-acquire failure (below) so nothing strands

    // Pickup honesty (P2.2 · W5e): a pickup order is EITHER scheduled (a slot the diner picked) OR ASAP
    // (no slot yet — "make it now"). Both are gated HERE, at the charge boundary, so a client can't dodge
    // the kitchen's open-hours + per-slot capacity limits by forging state.
    //   • Scheduled → re-validate the held slot still has room (it can fill between pick and pay).
    //   • ASAP (null slot) → mms_pickup_asap atomically SNAPS the earliest bookable slot (consuming its
    //     capacity, only within open hours / while capacity remains) and fires now (fire_at=null). If the
    //     kitchen is closed or fully booked, ASAP is refused — never take a paid order we can't fulfill.
    const db = serviceClient();
    // W21 (Codex P1 on #192) — the mode read FAILS CLOSED: every mode-keyed gate below (the W5e
    // pickup slot/ASAP honesty checks AND the W21 contact requirement) hangs off `sess`, so a
    // dropped read error used to let a pickup order charge as if it were scango — no slot
    // validated, no contact stored. An unreadable session refuses the payment instead.
    const { data: sess, error: sessErr } = await db
      .from("table_sessions")
      .select("mode")
      .eq("id", sessionId)
      .single();
    if (sessErr || !sess) {
      if (sessErr) console.error("[create-intent] session mode read failed:", sessErr.message);
      await releaseCartLock(cartId, uid);
      return NextResponse.json(
        { error: "Couldn’t start checkout — please try again." },
        { status: 500 },
      );
    }
    // W23a — THE AVAILABILITY GATE. Asked before ANY state is consumed on this order's behalf.
    //
    // `priceItem` already refuses a sold-out dish at ADD time, and that is the better guest moment —
    // but it cannot cover this one: a cart sits open while the diner reads, chats and decides, and the
    // 86 can land in that window. Every line was available when it was added and the basket is now
    // unsellable. Only a re-check against the LIVE catalog, here, can see that.
    //
    // This is deliberately the same shape as the pickup-capacity and open-hours refusals below:
    // read, refuse with guest-readable copy, release the lock, 409 — all BEFORE
    // `paymentIntents.create`, so a refused order never becomes a charge that needs refunding. One
    // batched read of the cart's distinct menu ids; no per-line round trip.
    //
    // It refuses rather than silently dropping the line. Dropping would re-price the basket at the
    // last tap, and an amount that changes under the diner's finger is exactly the surprise the money
    // doctrine forbids — worse here than elsewhere, because the diner is looking at the Pay button.
    // Naming the dish lets them remove it themselves and keep the rest of their order.
    //
    // NOTE this refuses where the pickup soft-cap over-accepts, and the difference is deliberate: an
    // over-sold pickup slot means a dish made slightly late, while an over-sold 86 means a dish that
    // does not exist. Only one of those can be fixed by cooking faster.
    //
    // It sits ABOVE the pickup block for the reason that block states about its own contact gate: an
    // ASAP snap (`mms_pickup_asap`) atomically CONSUMES a slot's capacity, and spending a slot on an
    // order this same response is about to refuse would deny that slot to a diner who can actually
    // be served.
    const soldOutNames = await unavailableLineNames(cartId);
    if (soldOutNames.length > 0) {
      await releaseCartLock(cartId, uid);
      return NextResponse.json(
        {
          error:
            soldOutNames.length === 1
              ? `${soldOutNames[0]} just sold out — remove it to keep going.`
              : `${soldOutNames.join(" and ")} just sold out — remove them to keep going.`,
        },
        { status: 409 },
      );
    }

    // W5g: the timing the diner actually committed to at the pay boundary — 'scheduled' (a slot they
    // picked) or 'asap' (server-snapped now). Emitted as ONE event below that BOTH paths hit, so the
    // pickup funnel isn't blind to the default-ASAP path (which fires no client-side timing event).
    let pickupWhen: "asap" | "scheduled" | undefined;
    if (sess?.mode === "pickup") {
      // W21 (owner: "pickup should need name and phone number") — the contact gate, HERE at the
      // charge boundary so a raw POST can't skip it (the client runs the same pure predicate for
      // instant feedback). Refused BEFORE any slot state is consumed: an ASAP snap must not spend
      // capacity for a payment this response is about to refuse.
      const contactMissing = pickupContactMissing(firstName ?? "", phone ?? "");
      if (contactMissing) {
        await releaseCartLock(cartId, uid);
        return NextResponse.json(
          {
            error:
              contactMissing === "name"
                ? "Add a first name for pickup — we need someone to call."
                : "Add a phone number for pickup — we’ll only use it about this order.",
          },
          { status: 400 },
        );
      }
      const { data: cart } = await db
        .from("qr_carts")
        .select("pickup_slot,fire_at")
        .eq("id", cartId)
        .single();
      // Discriminate on fire_at, NOT pickup_slot: a SCHEDULED cart always carries fire_at = slot - prep
      // (non-null); an ASAP cart carries fire_at = null WHETHER OR NOT it already holds a snapped
      // pickup_slot from an earlier pay attempt. Keying on pickup_slot would route a retry of a
      // snapped-then-declined ASAP order into the scheduled validator and 409 it on a slot the diner
      // never chose (and could no longer clear); keying on fire_at re-snaps the current earliest instead.
      if (cart?.fire_at) {
        // Scheduled: re-validate the held slot still has room. Exclude THIS cart's own hold so we're
        // asking "is there still room for me", not double-counting.
        // NOTE(soft-cap): this is a plain read, not advisory-locked like mms_set_pickup_slot — under a
        // last-seat race two carts can both pass here and both pay. That's the deliberate accepted soft-cap
        // (a hard cap at fulfillment would strand an already-charged diner; see migration 0100's note); the
        // lead time makes the overlap window small. We over-accept by design rather than reject a paid order.
        const { data: slots } = await db.rpc("mms_pickup_slots", { p_exclude_cart: cartId });
        const slotMs = cart.pickup_slot ? new Date(cart.pickup_slot).getTime() : NaN;
        const open = (slots ?? []).some((s) => new Date(s.slot_time).getTime() === slotMs);
        if (!open) {
          await releaseCartLock(cartId, uid);
          return NextResponse.json(
            { error: "That pickup time just filled — please pick another." },
            { status: 409 },
          );
        }
        pickupWhen = "scheduled";
      } else {
        // ASAP (fire_at null, snapped-or-not): snap the CURRENT earliest bookable slot atomically
        // (open-hours + capacity gate, today-bounded) and fire now. mms_pickup_asap excludes this cart's
        // own hold, so a re-snap safely overwrites a stale earlier snap with the fresh earliest.
        const { data: asap, error: asapErr } = await db.rpc("mms_pickup_asap", {
          p_cart_id: cartId,
        });
        const row = asap?.[0];
        if (asapErr || !row?.ok) {
          await releaseCartLock(cartId, uid);
          const msg =
            row?.reason === "closed"
              ? "The kitchen’s closed right now — please order during open hours."
              : row?.reason === "full"
                ? "Pickup’s fully booked for today — please check back tomorrow."
                : "We couldn’t start a pickup order just now — please try again.";
          // 409 for a genuine capacity/hours refusal (retryable state), 400 for a config/cart-state miss.
          const status = row?.reason === "closed" || row?.reason === "full" ? 409 : 400;
          return NextResponse.json({ error: msg }, { status });
        }
        pickupWhen = "asap";
      }
      // One timing-confirmation event both paths reach (the default-ASAP path fires no client-side
      // pickup event). distinctId=uid mirrors pickup_slot_set so the pickup funnel stays connected.
      if (pickupWhen) {
        getPostHogClient().capture({
          distinctId: uid,
          event: "pickup_when_confirmed",
          properties: { cart_id: cartId, when: pickupWhen },
        });
      }
    }

    // W3e: persist the takeout call-out name on the CART (member+lock already asserted; the
    // open-status guard rides in the statement). Fulfillment snapshots it onto the order for expo/the
    // order-ready board; never analytics (PII). Mode is an ALLOWLIST (pickup/scango) — a missed
    // session read must fail to no-name, never fail-open onto a table order. An empty string CLEARS
    // (the diner deleted the field on a retry — a stale name must not keep getting called out).
    // Non-fatal: a name write must never block a payment.
    if (sess?.mode === "pickup") {
      // W21 (Codex P2 on #192) — the pickup contact write is LOAD-BEARING, not best-effort: the
      // contact is required precisely so staff can reach the diner, so a charge without it stored
      // defeats the requirement. `.select("id")` verifies a row actually changed (the repo's
      // `.update()` returns no row count rule) — a transient failure, a CHECK refusal (belt vs
      // predicate drift), or a no-longer-open cart all refuse the payment honestly here instead
      // of minting a PI for an uncontactable order.
      const { data: contactRows, error: contactErr } = await db
        .from("qr_carts")
        .update({
          customer_name: firstName || null,
          customer_phone: (phone ?? "").trim() || null,
        })
        .eq("id", cartId)
        .eq("status", "open")
        .select("id");
      if (contactErr || !contactRows?.length) {
        if (contactErr)
          console.error("[create-intent] pickup contact write failed:", contactErr.message);
        await releaseCartLock(cartId, uid);
        return NextResponse.json(
          { error: "Couldn’t save your pickup contact — please try again." },
          { status: 400 },
        );
      }
    } else if (firstName !== undefined && sess?.mode === "scango") {
      // W3e — scango's OPTIONAL call-out name keeps the original non-fatal stance (an empty string
      // clears a stale name; a name write must never block a walk-out payment).
      const { error: nameErr } = await db
        .from("qr_carts")
        .update({ customer_name: firstName || null })
        .eq("id", cartId)
        .eq("status", "open");
      if (nameErr) console.error("[create-intent] customer_name write failed:", nameErr.message);
    }

    // M70 — freeze the promo's contribution BEFORE the amount is derived, so the hold and every
    // later read of this cart agree on one number. `mms_promo_discount` returns the pin from here
    // on, which is what stops a promo lapsing between authorize and capture (a sold-out void
    // dropping the subtotal under `min_subtotal_cents`, a `valid_until` passing, an admin flipping
    // `active`) from RAISING the live total above the hold and sending `planCapture` to
    // `over_authorized` — cancelling the whole order over one missing dish.
    //
    // Ordering is load-bearing: pin first, THEN derive. Deriving first would mint an amount from the
    // live value and pin a possibly different one a moment later. The RPC is idempotent (pins only
    // when null), so a create-intent retry re-uses the first grant and therefore the same Stripe
    // idempotency key rather than minting a second PaymentIntent.
    //
    // A failure here is NOT fatal: the pin is an improvement on the settlement outcome, not an
    // authority over the amount. Without it the cart simply behaves as it did before M70 — the
    // amount is still server-derived from the same authority, and `planCapture` still refuses to
    // charge more than was authorized. Failing the mint would trade a rare cancelled settlement for
    // a certain refused checkout.
    const { error: pinErr } = await db.rpc("mms_pin_promo_grant", { p_cart_id: cartId });
    if (pinErr)
      console.error("[create-intent] promo grant not pinned", { cartId, error: pinErr.message });

    // M70 (Codex round 1, P1) — every exit BETWEEN the pin and a live PaymentIntent must release the
    // grant, because a grant with no hold behind it authorizes nothing. The lock alone is not enough:
    // the diner edits the now-unlocked cart, re-checks-out, and `mms_pin_promo_grant` is a no-op
    // (the pin is not null) — so the abandoned attempt's grant prices the NEW basket. Both directions
    // are wrong: a $10 grant survives onto a basket that no longer clears the minimum, and a 0 grant
    // survives onto one that has become eligible. Cancellation cannot cover this — that records the
    // end of a hold that EXISTED, and here none ever did.
    const abandonAttempt = async (id: string, u: string) => {
      const { error } = await db.rpc("mms_release_promo_grant", { p_cart_id: id });
      // Logged, never thrown: this runs on paths that are already returning an error to the diner,
      // and the pin's own `status = 'open'` gate plus the next attempt's re-derivation bound the
      // damage. Failing here would replace a stale discount with a stranded lock.
      if (error) console.error("[create-intent] promo grant not released", { cartId: id, error: error.message });
      await releaseCartLock(id, u);
    };

    const totals = await getCartTotals(cartId, tipRate);
    const amount = totals.totalCents; // already cents, server-derived
    if (amount <= 0) {
      await abandonAttempt(cartId, uid);
      return NextResponse.json({ error: "Empty cart" }, { status: 400 });
    }
    // W19 — the tip ceiling is a DOLLAR amount ($1,000, the cash tip's own bound), enforced here on
    // the DERIVED cents because a rate cannot express a dollar cap. The client clamps to the same
    // constant, so an in-app diner never sees this; it exists for the hostile/raw POST.
    if (!tipWithinAmountCap(totals.tipCents)) {
      await abandonAttempt(cartId, uid);
      return NextResponse.json({ error: "Tip exceeds the $1,000.00 maximum" }, { status: 400 });
    }

    // W23c — MANUAL capture for pickup (registry M69), behind an env flag so it can be turned off in
    // Vercel without a deploy revert. Absent or not "1" is today's behaviour byte-for-byte.
    //
    // The availability gate above runs before this mint, but the diner then spends a minute entering
    // a card, and an 86 landing in THAT window still produced a real charge for food nobody could
    // make. Authorizing instead of charging gives the app one more look at the catalog before any
    // money moves: `lib/manual-capture-run.ts` captures the reduced total, or cancels the hold
    // outright — and a cancelled hold leaves NO refund on the guest's statement, which is the whole
    // point. Pickup only; see `manualCaptureMode` for why dine-in and scan-and-go are excluded.
    const manualCapture =
      process.env.PICKUP_MANUAL_CAPTURE === "1" && manualCaptureMode(sess.mode ?? "");

    // W23c (Codex round 2) — the ATTEMPT discriminator for the idempotency key below. A manual
    // intent can end CANCELLED (nothing left to sell, or a total that outgrew its hold), and Stripe
    // replays a cached response for a reused key — so a diner who rebuilt the same basket to the
    // same amount would get the dead intent's client secret back and be unable to pay until the key
    // aged out. `locked_at` is refreshed on every lock acquisition, so it changes per checkout
    // ATTEMPT while staying identical across duplicate requests inside one attempt, which is exactly
    // the distinction the key needs to draw. Read after the lock so it reflects OUR acquisition.
    let attemptStamp = "";
    if (manualCapture) {
      const { data: lockRow } = await db
        .from("qr_carts")
        .select("locked_at")
        .eq("id", cartId)
        .maybeSingle();
      attemptStamp = lockRow?.locked_at ?? "";
    }

    // tipRate rides in metadata so the webhook can recompute the identical breakdown to reconcile.
    const intent = await getStripe().paymentIntents.create(
      {
        amount,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        ...(manualCapture && { capture_method: "manual" as const }),
        // tipRate rides in metadata so the webhook recomputes the identical breakdown to reconcile.
        // earnerUid (M4) = the authenticated payer; the webhook stamps qr_orders.earned_by + awards Stars.
        metadata: {
          cartId,
          tipRate: String(tipRate),
          earnerUid: uid,
          // The discriminant the webhook's amount_capturable_updated arm keys on. Split shares use
          // the same event with kind='split_share', so this must be present and distinct — without
          // it an authorized pickup would fall through that arm and its hold would simply expire.
          ...(manualCapture && {
            kind: "pickup_manual" as const,
            // The ERA this authorization belongs to. `acquireCartLock` lets the SAME diner reacquire,
            // so a re-checkout (a different tip, say) produces a second hold over one cart and the
            // FIRST one's webhook still names them as lock holder. The settle path compares this
            // against the cart's live `locked_at` and refuses a superseded era.
            attempt: attemptStamp,
          }),
        },
      },
      // Include tipRate in the key so two different tip choices that happen to land on the same
      // total (after a cart edit) can't collide onto one intent — Stripe would otherwise return the
      // first PI (with the OLD tipRate in metadata), and the webhook would fulfill the wrong breakdown.
      // uid is in the key (Q9) so a SECOND payer minting the same cart/amount/tip gets their OWN PI —
      // otherwise they'd inherit the first payer's intent and its earnerUid (Stars/feedback attribution).
      // W23c — `m` rides in the key: flipping PICKUP_MANUAL_CAPTURE must not return a PREVIOUS
      // intent minted under the other capture method. Stripe replays the first request's response
      // for a reused key, so without this a diner retrying across a flag flip would get an
      // automatic-capture intent back and be charged on the spot.
      {
        idempotencyKey: `pi_${cartId}_${amount}_t${tipRate}_${uid}${manualCapture ? `_m${attemptStamp}` : ""}`,
      },
    );

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: cartId,
      event: "payment_intent_created",
      properties: {
        cart_id: cartId,
        amount_cents: amount,
        tip_rate: tipRate,
        subtotal_cents: totals.subtotalCents,
        total_cents: totals.totalCents,
      },
    });

    return NextResponse.json({ clientSecret: intent.client_secret, totals });
  } catch (e) {
    // A post-acquire failure (totals / Stripe / etc.) must not strand the lock — release now so the
    // table isn't frozen on a transient error (the TTL is the backstop). Best-effort; never mask `e`.
    //
    // M70 — and it must not strand the promo GRANT either. This is the path that reaches here after
    // `mms_pin_promo_grant` succeeded and `getCartTotals` or `paymentIntents.create` then threw: a
    // pin with no PaymentIntent behind it. Released inline rather than via `abandonAttempt`, which
    // is scoped to the try block; same two writes, same best-effort posture.
    if (acquired) {
      const { cartId: abandonedCart, uid: abandonedUid } = acquired;
      try {
        const { error: relErr } = await serviceClient().rpc("mms_release_promo_grant", {
          p_cart_id: abandonedCart,
        });
        if (relErr)
          console.error("[create-intent] promo grant not released", {
            cartId: abandonedCart,
            error: relErr.message,
          });
      } catch {
        /* best-effort, exactly like the lock release below — never mask `e` */
      }
      await releaseCartLock(abandonedCart, abandonedUid).catch(() => {});
    }
    if (e instanceof AuthzError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    const err = e as Error;
    // ZodError (bad input shape) → 400 with a HUMAN sentence, never err.message — a ZodError's
    // message is a JSON issue array, and Checkout renders `data.error` verbatim (W19 review LOW:
    // a promo-crushed sub-25¢ net can push a legal $1,000 tip past the rate rail and land here).
    // (Avoid importing zod so knip doesn't flag an unused dep; the schema lives in @mms/db.)
    if (err.name === "ZodError")
      return NextResponse.json(
        { error: "That request didn’t look right — refresh and try again." },
        { status: 400 },
      );
    // Don't leak a raw SDK string (e.g. a Stripe config/PM message) in the response body — it aids
    // recon. The client already shows a generic UX message; log the real one server-side only.
    console.error("[create-intent] unexpected failure:", err);
    return NextResponse.json({ error: "Payment service error" }, { status: 500 });
  }
}
