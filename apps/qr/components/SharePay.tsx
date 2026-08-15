"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Appearance, StripeElementsOptions } from "@stripe/stripe-js";
import { getStripePromise, stripeAppearance } from "@/lib/stripe-client";
import { useConnectionTruth } from "@/lib/useConnectionTruth";
import { confirmCopy } from "@/lib/confirm-copy";
import { ConfirmSwap } from "./ConfirmSwap";

/**
 * One payer's share-pay screen (M3·P3.3b, split-tender). The diner picks their OWN tip, then authorizes
 * their share on a Payment Element — `create-share-intent` mints a `capture_method: manual` PaymentIntent
 * (server-derived amount; the client never sends a price), and `confirmPayment({ redirect: "if_required" })`
 * AUTHORIZES (status → requires_capture) without leaving the board. No money moves yet: the webhook
 * captures every share together once the whole table has authorized. Changing the tip re-mints the PI
 * (the old one is canceled server-side). PAN lives only in Stripe's iframe (SAQ-A).
 */
/**
 * W10c — how long the form waits for the board to confirm an authorization that has ALREADY landed
 * at the card network before it stops spinning and says so. Sizing: the row is flipped by the
 * WEBHOOK (`amount_capturable_updated`), and the board's poll starts at 5s — so a healthy system has
 * ~5 chances inside this window, and a failing one (which backs off 5→10→20→30s) has two. Either
 * way, past this point the diner is staring at a spinner over a real hold on their card, which is
 * the one state the board's own honesty work can't cover.
 */
const BOARD_FLIP_GRACE_MS = 25_000;

const TIPS: [label: string, rate: number][] = [
  ["No tip", 0],
  ["15%", 0.15],
  ["18%", 0.18],
  ["20%", 0.2],
];

export function SharePay({ cartId, onAuthorized }: { cartId: string; onAuthorized: () => void }) {
  const [tipRate, setTipRate] = useState(0);
  const [retry, setRetry] = useState(0); // bump to re-mint after a transient failure
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // W10c — this payer has a LIVE HOLD on their card. Changing the tip re-mints the PaymentIntent and
  // the route cancels the old one, which is fine while nothing is authorized — but the form below now
  // tells a stalled diner "your card is authorized", and a tip control that would quietly cancel that
  // authorization is a button that falsifies the sentence beside it. The board's own row is the way
  // out from here (it flips to Authorized the moment we can read it), so the tip is settled.
  const [held, setHeld] = useState(false);
  const stripePromise = getStripePromise();

  // Shared with PaymentSection (was an inline duplicate — drift risk). Resolves the theme from the
  // live tokens at mount; .dark (R2) makes "night" reachable. Mount-time by design — see ThemeSync.
  const appearance = useMemo<Appearance>(() => stripeAppearance(), []);

  // (Re)mint this payer's PaymentIntent for the chosen tip. Re-runs on a tip change (the route cancels
  // the prior pending PI). setState lives in the async callbacks (the allowed "sync from an external
  // system" pattern), with a cancel guard against an unmounted/raced update.
  useEffect(() => {
    let active = true;
    fetch("/api/stripe/create-share-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId, tipRate }),
    })
      .then(async (r) => {
        const d = (await r.json()) as {
          clientSecret?: string;
          amountCents?: number;
          error?: string;
        };
        if (!active) return;
        if (!r.ok || !d.clientSecret) {
          // 4xx carries a safe server reason; 5xx stays generic (no raw SDK string → recon).
          setError(
            r.status < 500 && d.error ? d.error : "Couldn’t start your payment — please try again.",
          );
          return;
        }
        setClientSecret(d.clientSecret);
        setAmountCents(d.amountCents ?? 0);
      })
      .catch(() => {
        if (active) setError("Couldn’t start your payment — please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cartId, tipRate, retry]);

  // Reset → re-mint lives in these EVENT handlers (not the effect body — the React Compiler forbids a
  // synchronous setState there); the effect only fetches + sets results in its async callbacks.
  function selectTip(rate: number) {
    if (rate === tipRate || held) return; // the hold is placed — the tip is settled with it
    setClientSecret(null);
    setLoading(true);
    setError(null);
    setTipRate(rate);
  }
  function tryAgain() {
    setClientSecret(null);
    setLoading(true);
    setError(null);
    setRetry((n) => n + 1);
  }

  const options = useMemo<StripeElementsOptions | null>(
    () => (clientSecret ? { clientSecret, appearance } : null),
    [clientSecret, appearance],
  );

  return (
    <div style={{ marginTop: 12 }}>
      {/* Pre-PR review — a locked control has to SAY it is locked. The group's name changes with its
          state (it no longer advertises an action that has been withdrawn) and points at the visible
          reason below, so a screen-reader user hears why "20%" is dimmed instead of just that it is. */}
      <div
        role="group"
        aria-label={held ? "Tip — locked in with your authorization" : "Add a tip to your share"}
        aria-describedby={held ? "share-tip-locked" : undefined}
        style={{ display: "flex", gap: 8 }}
      >
        {TIPS.map(([label, rate]) => {
          const on = tipRate === rate;
          return (
            <button
              key={rate}
              type="button"
              aria-pressed={on}
              // `aria-disabled`, not `disabled`: the chosen tip stays readable + focusable (it is the
              // record of what was authorized), and `selectTip` refuses the change either way.
              aria-disabled={held || undefined}
              onClick={() => selectTip(rate)}
              className="checkout-tip"
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                border: `1.5px solid ${on ? "var(--ac)" : "var(--bd)"}`,
                background: on ? "color-mix(in oklab, var(--ac) 9%, var(--cd))" : "var(--cd)",
                color: on ? "var(--ac-strong)" : "var(--tx)",
                fontWeight: 800,
                fontSize: "var(--fs-sm)",
                cursor: held ? "default" : "pointer",
                opacity: held && !on ? 0.5 : 1,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {held && (
        <p
          id="share-tip-locked"
          style={{ fontSize: "var(--fs-xs)", color: "var(--t3)", margin: "8px 0 0" }}
        >
          Your card is authorized for this amount, so the tip is set.
        </p>
      )}

      {error ? (
        <p role="alert" style={{ fontSize: "var(--fs-sm)", color: "var(--warn)", marginTop: 10 }}>
          {error}{" "}
          <button
            type="button"
            onClick={tryAgain}
            style={{
              minHeight: 44,
              padding: "0 4px",
              background: "none",
              border: "none",
              color: "var(--warn)",
              fontWeight: 800,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </p>
      ) : !stripePromise ? (
        <p role="alert" style={{ fontSize: "var(--fs-sm)", color: "var(--warn)", marginTop: 10 }}>
          Card payment is temporarily unavailable. Please try again shortly.
        </p>
      ) : loading || !options ? (
        // Plain text (not a live region): the disabled flow + visible label convey loading, and the
        // settlement view already has its status region — no redundant aria-live (QA §A).
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--t2)", marginTop: 12 }}>
          Preparing your payment…
        </p>
      ) : (
        <Elements key={clientSecret} stripe={stripePromise} options={options}>
          <ShareForm
            amountCents={amountCents}
            onAuthorized={() => {
              setHeld(true); // freeze the tip group above — the money is committed
              onAuthorized();
            }}
          />
        </Elements>
      )}
    </div>
  );
}

function ShareForm({
  amountCents,
  onAuthorized,
}: {
  amountCents: number;
  onAuthorized: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // W16c — the confirm step before the hold (see onSubmit).
  const [confirming, setConfirming] = useState(false);
  const authorizeBtnRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (!confirming && wasConfirming.current) authorizeBtnRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  // The hold IS on this card — Stripe confirmed it. Distinct from `submitting` (which also covers the
  // in-flight confirm) because only this state licenses the "your card is authorized" claim.
  const [authorized, setAuthorized] = useState(false);
  const [boardStale, setBoardStale] = useState(false);
  const [rechecking, setRechecking] = useState(false); // the stalled notice's "Check again" busy flag
  // ⚠️ Pre-PR review — the stalled message must not BLAME anyone from a bare timer. The row is
  // flipped by the webhook, not by `confirmPayment`, and a delivery that takes >25s under normal
  // load is not an outage: asserting "we're having trouble on our end" there is exactly the
  // evidence-free copy the W10a truth layer exists to retire. So diagnose, then choose the sentence.
  const { truth, diagnose } = useConnectionTruth();

  // W10c — bound the post-authorize wait. `onAuthorized()` re-syncs the board and this form
  // deliberately keeps its spinner, because the row is about to flip to "Authorized" and unmount it.
  // During an outage that flip never comes: "Authorizing…" spun forever on top of money that had
  // really been held, and the diner could not tell a failed authorization from our backend being
  // down — so some re-tap, or hand the phone to the host. After the grace, say the true thing.
  // (setState lives in the timer callback, not the effect body — the React Compiler lint.)
  useEffect(() => {
    if (!authorized) return;
    // ⚠️ Pre-merge review — AWAIT the probe before revealing the notice. Firing it un-awaited is the
    // exact defect this same commit fixed in RewardField and Checkout: the region would mount with
    // `truth` still "unknown" (announcing the neutral sentence), then re-render with the outage
    // sentence and announce the WHOLE alert a second time — assertively, over a live card hold, and
    // only in the outage case the branch exists for.
    const t = window.setTimeout(() => {
      void diagnose().then(() => setBoardStale(true));
    }, BOARD_FLIP_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [authorized, diagnose]);

  // W16c — a share authorization is a real HOLD on the diner's card, so it gets the same confirm
  // step as the finalize charge (a consistent money-CTA policy; the alternative — exempting it —
  // would leave the one committing action on this screen unconfirmed).
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    setConfirming(true);
  }

  async function authorize() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    // Authorize only (manual capture) — stay on the board. A redirect-based method round-trips back to
    // /cart; a card/wallet resolves inline. `error.message` from Stripe is user-facing + safe to show.
    const { error: payErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/cart?cart=${encodeURIComponent(
          new URLSearchParams(window.location.search).get("cart") ?? "",
        )}`,
      },
      redirect: "if_required",
    });
    if (payErr) {
      setError(payErr.message ?? "Payment couldn’t be authorized. Please try another card.");
      setSubmitting(false);
      setConfirming(false); // back to a live button so a declined card can be retried
      return;
    }
    if (
      paymentIntent &&
      (paymentIntent.status === "requires_capture" || paymentIntent.status === "succeeded")
    ) {
      setAuthorized(true); // starts the grace timer above
      onAuthorized(); // re-sync the board; the webhook marks the share authorized
      return; // keep the form unsubmittable — the row flips to "Authorized" on the next board sync
    }
    // Rare non-terminal status (e.g. still processing) with no error — re-enable + tell the diner
    // honestly rather than leaving a dead button.
    setError("Your payment is still processing — watch the board for your status.");
    setSubmitting(false);
    setConfirming(false);
  }

  const dollars = `$${(amountCents / 100).toFixed(2)}`;
  // Mutually exclusive by construction: once `authorized` the form can't be submitted again, so no
  // new `error` can arrive — which is what lets both share ONE region (QA §A, one live region).
  const stalled = boardStale && !error;
  return (
    <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
      <PaymentElement options={{ layout: "tabs" }} />
      {/* Errors → role=alert (announces reliably; matches the mint-failure branches) — the settle
          view's polite status region belongs to the parent (one per view). The stalled-board notice
          rides the SAME region: it arrives ~25s after the diner's last action, about money already
          held on their card, so it has to interrupt rather than wait to be found. */}
      <p
        role="alert"
        style={{
          minHeight: 16,
          margin: "10px 0 0",
          fontSize: "var(--fs-sm)",
          lineHeight: 1.5,
          color: stalled ? "var(--t2)" : "var(--warn)",
          ...(stalled
            ? {
                background: "var(--sf)",
                border: "1px solid var(--bd)",
                borderRadius: 10,
                padding: "10px 12px",
              }
            : null),
        }}
      >
        {error ??
          (stalled ? (
            <>
              {/* The unconditional half is the part we can prove: Stripe told us the hold landed.
                  The second sentence is the part we had to ASK about — blaming ourselves needs the
                  probe's verdict, and "it'll catch up" was a promise the code can't keep during a
                  real outage. */}
              Your card is authorized — no charge yet; nothing is captured until the whole table is
              in.{" "}
              {truth === "we-down"
                ? "We’re having trouble on our end, so your row may still say Waiting."
                : truth === "you-offline"
                  ? "You look offline, so your row may still say Waiting — it’ll update when you reconnect."
                  : "Your row hasn’t updated yet — we’re waiting on the confirmation."}{" "}
              <span style={{ display: "block", marginTop: 4 }}>
                If it still says Waiting in a minute, show this to your server — nothing is lost.
              </span>
            </>
          ) : null)}
      </p>
      {/* ⚠️ Pre-merge review — the control lives OUTSIDE the alert. `role="alert"` carries an implicit
          `aria-atomic`, so a label toggling to "Checking…" inside it re-announced the whole ~45-word
          money statement assertively on every tap — the same over-announcement this slice removed
          elsewhere. It also has to survive its own tap (`SettlementBoard` wrote that lesson down):
          the busy window is held for a beat because `onAuthorized` is fire-and-forget and the health
          probe answers from cache within a microtask, so tying the flag to the probe alone flipped it
          back before the browser painted once. */}
      {stalled && (
        <button
          type="button"
          aria-disabled={rechecking || undefined}
          onClick={() => {
            if (rechecking) return;
            setRechecking(true);
            onAuthorized(); // the board re-sync — fire-and-forget by contract
            void Promise.all([diagnose(), new Promise((r) => window.setTimeout(r, 600))]).finally(
              () => setRechecking(false),
            );
          }}
          style={{
            minHeight: 44,
            marginTop: 8,
            padding: "0 4px",
            background: "none",
            border: "none",
            color: "var(--ac-strong)",
            fontWeight: 800,
            textDecoration: "underline",
            cursor: rechecking ? "default" : "pointer",
          }}
        >
          {rechecking ? "Checking…" : "Check again"}
        </button>
      )}
      {/* The confirm never replaces the boardStale "Card authorized" branch — that is a money
          STATEMENT about a hold that already landed, not a live control to gate. */}
      {confirming && !boardStale ? (
        <ConfirmSwap
          copy={confirmCopy({ kind: "authorizeShare", amountCents })}
          busy={submitting}
          busyLabel="Authorizing…"
          onCancel={() => setConfirming(false)}
          onProceed={() => void authorize()}
        />
      ) : (
        <button
          ref={authorizeBtnRef}
          type="submit"
          disabled={!stripe || submitting}
          aria-busy={submitting && !boardStale}
          style={{
            width: "100%",
            marginTop: 12,
            minHeight: 50,
            borderRadius: 12,
            border: "none",
            background: "var(--ac)",
            color: "var(--oa)",
            fontWeight: 800,
            fontSize: "var(--fs-body)",
            cursor: !stripe || submitting ? "default" : "pointer",
            // Pre-PR review — the dimmed-disabled treatment is for a control you're waiting on. Once
            // this reads "Card authorized" it is a money STATEMENT, and rendering a load-bearing one
            // below AA on the disabled-control exemption is not a trade this screen gets to make.
            opacity: boardStale ? 1 : !stripe || submitting ? 0.7 : 1,
          }}
        >
          {boardStale ? "Card authorized" : submitting ? "Authorizing…" : `Authorize ${dollars}`}
        </button>
      )}
      <p style={{ fontSize: "var(--fs-xs)", color: "var(--t3)", marginTop: 8, lineHeight: 1.5 }}>
        You’re only authorized now — your card is charged when everyone at the table has paid their
        share.
      </p>
    </form>
  );
}
