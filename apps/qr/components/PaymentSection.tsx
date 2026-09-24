"use client";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type {
  Appearance,
  CustomFontSource,
  Stripe,
  StripeElements,
  StripeElementsOptions,
  StripeExpressCheckoutElementConfirmEvent,
} from "@stripe/stripe-js";
import type { CartTotals } from "@mms/db";
import { Button, EmptyState, Icon, Skeleton } from "@mms/ui";
import {
  getStripePromise,
  resetStripePromise,
  stripeAppearance,
  stripeFonts,
} from "@/lib/stripe-client";
import { expressButtonTheme } from "@/lib/stripe-appearance";
import { payProceedLabel, unsentPayNote } from "@/lib/confirm-copy";
import {
  canConfirm,
  hasWallet,
  initialPayElementState,
  payElementReducer,
  payElementReserve,
  payElementView,
  payFailureCopy,
  payNoteCopy,
  payReadyCopy,
  retryResetsLoader,
  shouldAutoRetry,
  PAY_ELEMENT_FALLBACK_PX,
  PAY_ELEMENT_STORAGE_KEY,
  PAY_ELEMENT_TIMING,
  type PayElementEvent,
  type PayElementState,
} from "@/lib/pay-element";
import { t } from "@/lib/i18n";
import { useConnectionTruth } from "@/lib/useConnectionTruth";

type PaymentSectionProps = {
  cartId: string;
  clientSecret: string;
  totals: CartTotals;
  /** W19 — qty units of still-draft food in this charge (lib/checkout-stage unsentFoodQty). A note
   *  above the Pay button names them (Phase 1b — it rode the retired charge confirm), so
   *  paying-with-unsent is an informed choice. */
  unsentCount?: number;
  onEdit: () => void;
  /** W9b — mirror the in-flight confirm up to Checkout, so the pay step's new top-of-view "Back to
   *  review" can disable itself while a PaymentIntent is being confirmed. Editing then would release
   *  the pay-window lock out from under a live authorization. */
  onPayingChange?: (paying: boolean) => void;
  /** Phase 1b — true while the parent is leaving the pay step (releasing the pay-window lock): no
   *  charge may start under a lock that is being released. */
  hold?: boolean;
  /** Phase 1c — dine-in: the review step holds a "Pay at the counter" door, so a failure card that
   *  sends the diner back to review NAMES it (a blocked js.stripe.com still has a real way out). */
  counterDoor?: boolean;
};

type Handles = { stripe: Stripe; elements: StripeElements };

/**
 * The pay step (P1.3). PAN never touches our code — it lives only inside the Payment Element iframe
 * Stripe.js mounts (SAQ-A). The amount is server-authoritative: `clientSecret` + `totals` come from
 * the member-gated `create-intent` route, which locked the cart for this window. `confirmPayment`
 * redirects to `/track`; the signature-verified webhook reconciles and fulfills.
 *
 * Phase 1c — ONE honest wait (our skeleton, in the form's final footprint; Stripe's loader is off),
 * ONE reveal, and a failure card whose one button is the way forward that can work. `lib/pay-element`
 * decides every state; this file renders it. Keyed on `clientSecret`: a raced create-intent that
 * lands a new secret remounts the reducer, the timers and Elements together — a dead element must
 * never sit on a new secret.
 */
export function PaymentSection(props: PaymentSectionProps) {
  return <PayStep key={props.clientSecret} {...props} />;
}

/** The first frame's reserve: this device's last measurement at about this width, else the constant. */
function readReserve(): { px: number; walletPx: number } {
  if (typeof window === "undefined") return { px: PAY_ELEMENT_FALLBACK_PX, walletPx: 0 };
  let stored: unknown = null;
  try {
    stored = JSON.parse(window.localStorage.getItem(PAY_ELEMENT_STORAGE_KEY) ?? "null");
  } catch {
    stored = null; // blocked / private / corrupt storage reads as a first visit — a convenience only
  }
  return payElementReserve(stored, document.documentElement.clientWidth, PAY_ELEMENT_FALLBACK_PX);
}

/** The reducer's first state. Offline at mount is seeded HERE (not by an effect): `navigator.onLine
 *  === false` is the only proof of offline useConnectionTruth permits, and it is true at t=0. */
function initState(configMissing: boolean): PayElementState {
  const s = initialPayElementState({ configMissing });
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? payElementReducer(s, { type: "connectivity", online: false })
    : s;
}

function PayStep({
  cartId,
  clientSecret,
  totals,
  unsentCount = 0,
  onEdit,
  onPayingChange,
  hold = false,
  counterDoor = false,
}: PaymentSectionProps) {
  // The RAW Stripe.js promise. It changes only when a retry re-creates the loader (after Stripe.js
  // itself rejected) — and that same retry bumps `attempt`, so Elements is re-keyed in the SAME
  // render and react-stripe-js never sees its `stripe` prop change under one instance.
  const [stripePromise, setStripePromise] = useState(getStripePromise);
  const [state, dispatch] = useReducer(payElementReducer, stripePromise === null, initState);
  const view = payElementView(state);
  const { attempt } = state;
  const { truth, diagnose } = useConnectionTruth();

  // react-stripe-js never sees a rejection, and gets ONE promise object per loader (not per render).
  const safePromise = useMemo(() => stripePromise?.catch(() => null) ?? null, [stripePromise]);
  // Appearance + fonts from the document's resolved tokens, once per mount (the theme stays
  // mount-time — ThemeSync's accepted caveat).
  const [appearance] = useState<Appearance>(stripeAppearance);
  const [fonts] = useState<CustomFontSource[]>(stripeFonts);
  const isDark = appearance.theme === "night";
  const options = useMemo<StripeElementsOptions>(
    () => ({ clientSecret, appearance, fonts, loader: "never" }),
    [clientSecret, appearance, fonts],
  );
  const [reserve] = useState(readReserve);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ en: string; my?: string } | null>(null);
  const noteId = useId();
  const failTitleId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const walletSlotRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef<Handles | null>(null);
  // LEARNINGS #126 — the double-confirm guard is a REF read at call time: two submits inside one
  // act/frame both see `submitting === false` from the same render.
  const inFlightRef = useRef(false);
  const focusHandoffRef = useRef(false);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state; // the online listener reads the latest committed state
  });

  const onBind = useCallback((h: Handles | null) => {
    handlesRef.current = h;
  }, []);

  /** Re-key Elements on the SAME clientSecret — no new intent, no amount change, no lock write. The
   *  loader is re-created only when Stripe.js itself was what failed. */
  const restart = useCallback((s: PayElementState, by: "diner" | "auto") => {
    if (retryResetsLoader(s)) {
      resetStripePromise();
      setStripePromise(getStripePromise());
    }
    dispatch({ type: "retry", by });
  }, []);

  // Stripe.js itself. The cancel flag is per effect run, so StrictMode's double setup re-arms it.
  useEffect(() => {
    if (!stripePromise) return;
    let live = true;
    stripePromise.then(
      (stripe) => {
        if (live)
          dispatch(
            stripe ? { type: "stripe-loaded", attempt } : { type: "stripe-failed", attempt },
          );
      },
      () => {
        if (live) dispatch({ type: "stripe-failed", attempt });
      },
    );
    return () => {
      live = false;
    };
  }, [stripePromise, attempt]);

  // Attribution for the failure copy: diagnosed on a network-shaped failure, never asserted.
  // `diagnose()` cannot reject (its probe catches), so the returned promise is safe to drop.
  const failure = view.failure;
  useEffect(() => {
    if (failure === "network" || failure === "timeout") void diagnose();
  }, [failure, attempt, diagnose]);

  // Slow + stall while the card is loading; both die with the attempt that armed them.
  const cardLoading = state.card === "loading";
  useEffect(() => {
    if (!cardLoading) return;
    const slow = window.setTimeout(
      () => dispatch({ type: "slow", attempt }),
      PAY_ELEMENT_TIMING.slowMs,
    );
    const stall = window.setTimeout(
      () => dispatch({ type: "stalled", attempt }),
      PAY_ELEMENT_TIMING.stallMs,
    );
    return () => {
      window.clearTimeout(slow);
      window.clearTimeout(stall);
    };
  }, [cardLoading, attempt]);

  // The wallet's grace, counted from the card's ready.
  const graceArmed = state.card === "ready" && state.wallet === "loading";
  useEffect(() => {
    if (!graceArmed) return;
    const id = window.setTimeout(
      () => dispatch({ type: "grace-elapsed", attempt }),
      PAY_ELEMENT_TIMING.walletGraceMs,
    );
    return () => window.clearTimeout(id);
  }, [graceArmed, attempt]);

  // The settle window: from the reveal, and again from any post-reveal wallet change (`wallet` is in
  // the deps so a change inside a running window RESTARTS it rather than inheriting its remainder).
  // Identical under reduced motion — it is meaning, not motion.
  const { revealed } = view;
  const { settled, wallet } = state;
  useEffect(() => {
    if (!revealed || settled) return;
    const id = window.setTimeout(
      () => dispatch({ type: "settled", attempt }),
      PAY_ELEMENT_TIMING.settleMs,
    );
    return () => window.clearTimeout(id);
  }, [revealed, settled, wallet, attempt]);

  // Remember this device's geometry — only once the wallet SETTLED (never on grace: a pending wallet
  // would store a height without it), one frame after that commit.
  const walletSettled = wallet !== "loading";
  useEffect(() => {
    if (!revealed || !walletSettled) return;
    const raf = window.requestAnimationFrame(() => {
      const live = liveRef.current;
      if (!live) return;
      try {
        window.localStorage.setItem(
          PAY_ELEMENT_STORAGE_KEY,
          JSON.stringify({
            w: document.documentElement.clientWidth,
            h: live.offsetHeight,
            walletH: walletSlotRef.current?.offsetHeight ?? 0,
          }),
        );
      } catch {
        // A per-viewer convenience only (private mode, quota, blocked storage): the fallback
        // reserve still holds the layout, so there is nothing to recover.
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [revealed, walletSettled, attempt]);

  // Connectivity. `online` auto-retries a load this attempt saw fail offline — the promise the
  // offline sentence makes ("we'll try again when you reconnect") is this code path.
  useEffect(() => {
    const onOffline = () => dispatch({ type: "connectivity", online: false });
    const onOnline = () => {
      const s = stateRef.current;
      dispatch({ type: "connectivity", online: true });
      if (shouldAutoRetry(s)) restart(s, "auto");
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [restart]);

  // ONE focus rule: whenever the failure card unmounts with focus inside it (a late ready after a
  // timeout, a successful retry, an auto-retry), focus lands on the stage — never inside the iframe,
  // which would pop the keyboard.
  const showCard = failure !== null;
  const markHandoff = useCallback(() => {
    focusHandoffRef.current = true;
  }, []);
  useLayoutEffect(() => {
    if (showCard || !focusHandoffRef.current) return;
    focusHandoffRef.current = false;
    stageRef.current?.focus({ preventScroll: true });
  }, [showCard]);

  // Shared confirm — the card form's submit AND the Express (wallet) onConfirm. The Elements is
  // clientSecret-initialized (server-authoritative amount), so we confirm directly (no
  // elements.submit — that's the deferred-intent flow). On success Stripe redirects to return_url and
  // nothing here is cleared; an inline `{ error }` (validation / a decline) returns the live button
  // with Stripe's user-facing message; a REJECTION (an IntegrationError, a stale handle) is caught so
  // `submitting`/`paying` can never latch — a latched pair would disable every exit and skip the
  // pagehide release, freezing the diner AND the table until the lock's TTL.
  async function confirm(
    source: "card" | "wallet",
    event?: StripeExpressCheckoutElementConfirmEvent,
  ) {
    const handles = handlesRef.current;
    if (!handles || !canConfirm(view, source) || hold || inFlightRef.current) {
      // A refused wallet sheet must be told, or it spins until Stripe's own timeout.
      event?.paymentFailed({ reason: "fail" });
      return;
    }
    inFlightRef.current = true;
    setSubmitting(true);
    onPayingChange?.(true); // W9b — freeze the pay step's back control for the confirm round-trip
    setError(null);
    const release = () => {
      inFlightRef.current = false;
      setSubmitting(false); // the live Pay button returns, so a declined card can be retried
      onPayingChange?.(false); // only an INLINE failure lands here; success redirects away
    };
    try {
      const { error: payErr } = await handles.stripe.confirmPayment({
        elements: handles.elements,
        confirmParams: {
          return_url: `${window.location.origin}/track?cart=${encodeURIComponent(cartId)}`,
        },
      });
      if (payErr) {
        setError({
          en: payErr.message ?? "Payment couldn’t be completed. Please try another card.",
        });
        release();
      }
    } catch {
      // A REJECTION never reached Stripe's own sheet flow, so a wallet sheet is still open and
      // waiting: tell it, or it spins until Stripe's timeout (the refusal path's rule, above).
      event?.paymentFailed({ reason: "fail" });
      setError({ en: t("en", "payConfirmFailed"), my: t("my", "payConfirmFailed") });
      release();
    }
  }

  // Phase 1b (owner, 2026-09-23: "Drop both") — the W16c charge confirm is RETIRED. The review
  // step's "Pay · $X" already asked, this button names the sum it charges (`payProceedLabel`), and
  // Stripe's own sheet or 3-D Secure step interposes where a bank wants one. What it carried beyond
  // the amount — the W19 unsent-dishes disclosure — now stands ABOVE this button.
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void confirm("card"); // confirm() refuses (and says nothing) unless the form is payable
  }

  const unsent = unsentPayNote(unsentCount);
  const note = view.note ? payNoteCopy(view.note) : null;
  const failCopy = failure
    ? payFailureCopy(failure, { truth, escalated: view.escalated, counterDoor })
    : null;
  const announced = view.announce === "ready" ? payReadyCopy() : null;
  const ctaRefuses = !view.payable || submitting || hold;
  const describedBy = failure ? failTitleId : view.payable ? undefined : noteId;

  return (
    <form onSubmit={onSubmit}>
      <div
        ref={stageRef}
        className="pay-stage"
        role="group"
        aria-label="Card details"
        tabIndex={-1}
        style={{ minBlockSize: view.skeleton ? reserve.px : undefined }}
      >
        {view.skeleton && <PaySkeleton walletPx={reserve.walletPx} />}
        {failCopy && (
          <FocusHandoff onLeaveWithFocus={markHandoff}>
            <EmptyState
              tone="error"
              titleAs="h2"
              icon={<Icon name={truth === "you-offline" ? "offline" : "card"} size={22} />}
              title={
                <span id={failTitleId}>
                  {failCopy.title.en}
                  <span lang="my" className="pay-fail-my">
                    {failCopy.title.my}
                  </span>
                </span>
              }
              subtitle={
                <>
                  {failCopy.body.en}
                  <span lang="my" className="pay-fail-my">
                    {failCopy.body.my}
                  </span>
                </>
              }
              action={
                // ONE Button for every action: the same DOM node, so focus survives a change of
                // failure kind (network → timeout mid-retry). Secondary: never competes with Pay.
                failCopy.action === "retry" ? (
                  <Button
                    variant="secondary"
                    busy={state.retrying}
                    busyLabel={
                      <Bilingual
                        copy={{ en: t("en", "payRetrying"), my: t("my", "payRetrying") }}
                      />
                    }
                    onClick={() => restart(state, "diner")}
                  >
                    <Bilingual copy={{ en: t("en", "tryAgain"), my: t("my", "tryAgain") }} />
                  </Button>
                ) : (
                  <Button variant="secondary" busy={hold} onClick={onEdit}>
                    <Bilingual
                      copy={{ en: t("en", "payBackToReview"), my: t("my", "payBackToReview") }}
                    />
                  </Button>
                )
              }
            />
          </FocusHandoff>
        )}
        {safePromise && (
          <Elements key={attempt} stripe={safePromise} options={options}>
            <PayElements
              attempt={attempt}
              revealed={view.revealed}
              wallet={wallet}
              walletLate={state.walletLate}
              walletPx={reserve.walletPx}
              showDivider={view.showDivider}
              isDark={isDark}
              liveRef={liveRef}
              walletSlotRef={walletSlotRef}
              dispatch={dispatch}
              onBind={onBind}
              onWalletConfirm={(event) => void confirm("wallet", event)}
            />
          </Elements>
        )}
      </div>

      {/* The note row keeps its box when empty (a failure), so nothing below it moves. */}
      <p id={noteId} className="pay-note">
        {note && (
          <>
            <span className="pay-note-en">
              <Icon name="lock" size={13} style={{ color: "var(--t3)" }} />
              <span>{note.en}</span>
            </span>
            <span lang="my" className="pay-note-my">
              {note.my}
            </span>
          </>
        )}
      </p>

      {/* The ONE live region on this step (polite, atomic). Visible: the decline / confirm error.
          Otherwise sr-only: a failure's title + body, or "Card form ready." after a wait the diner
          was told about. No role=alert anywhere — EmptyState and Button add none. */}
      <p
        role="status"
        aria-atomic="true"
        style={{
          minHeight: 16,
          margin: "10px 0 0",
          fontSize: "var(--fs-sm)",
          color: "var(--warn)",
        }}
      >
        {error ? (
          <>
            {error.en}
            {error.my && (
              <span lang="my" className="pay-status-my">
                {error.my}
              </span>
            )}
          </>
        ) : failCopy && view.announce !== null ? (
          <span className="sr-only">
            {failCopy.title.en}. {failCopy.body.en}{" "}
            <span lang="my">
              {failCopy.title.my} {failCopy.body.my}
            </span>
          </span>
        ) : announced ? (
          <span className="sr-only">
            {announced.en} <span lang="my">{announced.my}</span>
          </span>
        ) : null}
      </p>

      {unsent && (
        // W19 via Phase 1b — read BEFORE the tap. Not a live region: it is standing context for the
        // decision, present from the first render of the pay step.
        <p className="card checkout-unsent-note" style={{ fontSize: "var(--fs-sm)" }}>
          {unsent.en}
          <span lang="my" className="checkout-pay-unsent-my">
            {unsent.my}
          </span>
        </p>
      )}
      {/* The sum is final (§4.6, §22): the label never swaps at go-live, so no text moves under a
          thumb. Refusal is `aria-disabled` (K35 — focus stays, the reason is its description), and it
          lifts only at reveal + settleMs, so a tap aimed before the layout moved lands on a control
          that refuses it. */}
      <button
        type="submit"
        aria-disabled={ctaRefuses || undefined}
        aria-busy={submitting}
        aria-describedby={describedBy}
        className="checkout-cta"
        style={{
          width: "100%",
          marginTop: 12,
          minHeight: 50,
          borderRadius: 12,
          border: "none",
          // bg/color come from .checkout-cta (gold-warmed gradient + sheen + one-sweep shine) — parity
          // with the review step's "Pay · $X" CTA. The label rides above the ::after sweep on its own layer.
          fontWeight: "var(--fw-heavy)",
          fontSize: "var(--fs-body)",
          cursor: ctaRefuses ? "default" : "pointer",
          opacity: submitting || view.skeleton ? 0.7 : failure ? 0.55 : 1,
        }}
      >
        <span style={{ position: "relative", zIndex: 1 }}>
          {submitting ? "Processing…" : payProceedLabel(totals.totalCents)}
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          if (!submitting) onEdit();
        }}
        aria-disabled={submitting || undefined}
        className="checkout-cta-ghost"
        style={{
          width: "100%",
          marginTop: 8,
          minHeight: 44,
          borderRadius: 12,
          border: "none",
          background: "transparent",
          // color lives in .checkout-cta-ghost so the :hover brighten isn't outranked by an inline color.
          fontWeight: "var(--fw-bold)",
          cursor: submitting ? "default" : "pointer",
        }}
      >
        <span aria-hidden>←</span> Edit order
      </button>
    </form>
  );
}

function Bilingual({ copy }: { copy: { en: string; my: string } }) {
  return (
    <>
      {copy.en}
      <span lang="my" className="pay-action-my">
        {copy.my}
      </span>
    </>
  );
}

/**
 * The failure card's wrapper. Its layout-effect CLEANUP runs before React removes its DOM, so
 * `document.activeElement` still says whether focus was inside — which a blur listener cannot
 * (removing a focused node fires no reliable blur). The parent moves focus after the commit.
 */
function FocusHandoff({
  onLeaveWithFocus,
  children,
}: {
  onLeaveWithFocus: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    return () => {
      if (node && node.contains(document.activeElement)) onLeaveWithFocus();
    };
  }, [onLeaveWithFocus]);
  return (
    <div ref={ref} className="mms-rise">
      {children}
    </div>
  );
}

/** v7.2's `.sk` grammar at the Element's geometry: bordered paper boxes holding shimmer bars. The
 *  wallet shape is drawn only when THIS device measured one — a first visit never implies Apple Pay. */
function PaySkeleton({ walletPx }: { walletPx: number }) {
  return (
    <div aria-hidden>
      {walletPx > 0 && (
        <>
          <Skeleton height={walletPx} radius="var(--r-sm)" />
          <div className="checkout-pay-divider">
            <Skeleton width={96} height={10} radius="var(--r-full)" />
          </div>
        </>
      )}
      <div className="pay-skel">
        <SkelField label="38%" />
        <div className="pay-skel-row">
          <SkelField label="56%" />
          <SkelField label="64%" />
        </div>
        <div className="pay-skel-row">
          <SkelField label="44%" />
          <SkelField label="36%" />
        </div>
      </div>
    </div>
  );
}

function SkelField({ label }: { label: string }) {
  return (
    <div className="pay-skel-field">
      <span className="pay-skel-label">
        <Skeleton height={10} width={label} radius="var(--r-full)" />
      </span>
      <span className="pay-skel-input">
        <Skeleton height={10} width="40%" />
      </span>
    </div>
  );
}

/**
 * Inside Elements: the wallet row, the divider and the card form, mounted from t=0 underneath the
 * skeleton (`data-revealed="false"`: absolute, transparent, inert) so the iframes load at their true
 * width but cannot take focus. Every event is tagged with THIS mount's attempt. The live handles go
 * up through `onBind` and come back down as null on unmount, so a retry can never leave `confirm()`
 * holding a destroyed Elements.
 *
 * SAQ-A (pinned by the component suite): no onChange on either element, no getElement/getValue, and
 * from a loaderror only `error.type` is read.
 */
function PayElements({
  attempt,
  revealed,
  wallet,
  walletLate,
  walletPx,
  showDivider,
  isDark,
  liveRef,
  walletSlotRef,
  dispatch,
  onBind,
  onWalletConfirm,
}: {
  attempt: number;
  revealed: boolean;
  wallet: PayElementState["wallet"];
  walletLate: boolean;
  walletPx: number;
  showDivider: boolean;
  isDark: boolean;
  liveRef: RefObject<HTMLDivElement | null>;
  walletSlotRef: RefObject<HTMLDivElement | null>;
  dispatch: (e: PayElementEvent) => void;
  onBind: (h: Handles | null) => void;
  onWalletConfirm: (event: StripeExpressCheckoutElementConfirmEvent) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  useEffect(() => {
    onBind(stripe && elements ? { stripe, elements } : null);
    return () => onBind(null);
  }, [stripe, elements, onBind]);

  // A warm reveal keeps the slot the skeleton held until Express settles; a first visit mounts the
  // row with a rise when it arrives late. Either way the reducer re-arms the settle window.
  const walletPending = revealed && wallet === "loading" && walletPx > 0;
  const walletRise = walletLate && walletPx === 0 && wallet === "available";

  return (
    <div
      ref={liveRef}
      className={revealed ? "pay-live mms-rise" : "pay-live"}
      data-revealed={revealed ? "true" : "false"}
      inert={!revealed}
    >
      {/* W2d — wallet-first: Apple/Google Pay/Link ABOVE the card (83% scan-to-pay). Pays the SAME
          server-authoritative PaymentIntent via the shared confirm(). Renders NOTHING until the
          browser has a wallet AND the domain is registered in Stripe; `onLoadError` fails closed to
          the card path. */}
      <div
        ref={walletSlotRef}
        className={walletRise ? "pay-wallet mms-rise" : "pay-wallet"}
        style={{ minBlockSize: walletPending ? walletPx : undefined }}
      >
        <ExpressCheckoutElement
          options={{ buttonHeight: 48, buttonTheme: expressButtonTheme(isDark) }}
          onReady={({ availablePaymentMethods }) =>
            dispatch({
              type: "wallet-ready",
              attempt,
              available: hasWallet(availablePaymentMethods),
            })
          }
          onLoadError={() => dispatch({ type: "wallet-error", attempt })}
          onConfirm={onWalletConfirm}
        />
        {walletPending && (
          <span className="pay-wallet-hold" aria-hidden>
            <Skeleton height={walletPx} radius="var(--r-sm)" />
          </span>
        )}
      </div>
      {walletPending ? (
        <div className="checkout-pay-divider" aria-hidden>
          <Skeleton width={96} height={10} radius="var(--r-full)" />
        </div>
      ) : (
        showDivider && (
          <div
            className={walletRise ? "checkout-pay-divider mms-rise" : "checkout-pay-divider"}
            aria-hidden
          >
            <span>or pay with card</span>
          </div>
        )
      )}
      <PaymentElement
        options={{ layout: "tabs" }}
        onReady={() => dispatch({ type: "card-ready", attempt })}
        onLoadError={(e) => dispatch({ type: "card-error", attempt, errorType: e.error.type })}
      />
    </div>
  );
}
