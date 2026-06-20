"use client";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import type { CartItem, CartTotals } from "@mms/db";
import {
  applyPromo as applyPromoAction,
  getCartView,
  setQty as setQtyAction,
  type PromoReason,
} from "@/lib/cart";
import { PaymentSection } from "./PaymentSection";

// Per-reason promo copy (the action returns a reason; Next redacts thrown errors in prod). Honest +
// on-brand: tell the diner exactly why, never a fabricated state.
const PROMO_MESSAGES: Record<PromoReason, string> = {
  invalid: "That code isn’t valid.",
  inactive: "That code is no longer active.",
  not_started: "That code isn’t available yet.",
  expired: "That code has expired.",
  min_not_met: "Your order doesn’t meet this code’s minimum yet.",
  exhausted: "That code has reached its limit.",
  session_limit: "That code’s already been used at this table.",
  cart_closed: "This order is already being paid.",
  locked: "The host has locked the order.",
  rate_limited: "Too many tries — wait a minute, then try again.",
  error: "Couldn’t apply that code — please try again.",
};

// Tip presets (v7.2 prototype). The <small> shows a client PREVIEW of the tip; the AUTHORITATIVE
// tip + grand total come back from create-intent (server) on the pay step — never the charge.
const TIPS: [label: string, rate: number][] = [
  ["No extra", 0],
  ["15%", 0.15],
  ["18%", 0.18],
  ["20%", 0.2],
];

/**
 * Cart + checkout (client), two steps: REVIEW (edit lines, promo, tip — cart open/editable) →
 * "Continue to payment" mints the intent + LOCKS the cart → PAY (Stripe Payment Element on a stable
 * clientSecret; "Edit order" unlocks and returns). Totals are always server-authoritative — the
 * review breakdown from `getCartView`, the tip-inclusive grand total from create-intent. Never client
 * money math (the tip chip preview is a hint, confirmed server-side).
 */
export function Checkout({
  cartId,
  initialItems,
  initialTotals,
}: {
  cartId: string;
  initialItems: CartItem[];
  initialTotals: CartTotals;
}) {
  const [items, setItems] = useState<CartItem[]>(initialItems);
  const [totals, setTotals] = useState<CartTotals>(initialTotals);
  const [promo, setPromo] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tipRate, setTipRate] = useState(0);
  const [step, setStep] = useState<"review" | "pay">("review");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [payTotals, setPayTotals] = useState<CartTotals | null>(null);
  const [loadingPay, setLoadingPay] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Focus management: when a stepper removes the last unit of a line, the <li> unmounts and focus
  // would fall to <body>. Move it to the heading so keyboard/SR users keep their place.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevLen = useRef(items.length);
  useEffect(() => {
    if (items.length > 0 && items.length < prevLen.current) headingRef.current?.focus();
    prevLen.current = items.length;
  }, [items.length]);

  // On a review↔pay transition the button that triggered it (Continue / Edit order) unmounts while
  // holding focus → focus would drop to <body> with no cue (WCAG 2.4.3). The heading is mounted in
  // both steps, so move focus there after the commit. Skip the first mount (no transition yet).
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) headingRef.current?.focus();
    else mounted.current = true;
  }, [step]);

  async function refresh() {
    try {
      const v = await getCartView(cartId);
      setItems(v.items);
      setTotals(v.totals);
    } catch {
      // Swallow: the EXPECTED failure here is the post-payment 403 (the cart flipped to paid → the
      // diner is being redirected to /track). We can't discriminate it from a transient error
      // client-side — Server Action errors are redacted in prod, so no `.status` survives — and
      // surfacing an error on the expected post-pay 403 would be a false alarm. A transient failure
      // self-heals on the next interaction (every mutation re-fetches).
    }
  }

  function changeQty(id: string, qty: number) {
    startTransition(async () => {
      try {
        await setQtyAction(id, qty);
      } catch {
        // Locked or no-longer-open — refresh() below re-syncs the UI to server truth.
      }
      await refresh();
    });
  }

  function onPromo(e: FormEvent) {
    e.preventDefault();
    if (!promo.trim()) return;
    startTransition(async () => {
      setStatus(null); // clear any stale result so it doesn't linger through the round-trip
      setPayError(null); // single live region — don't let a prior pay error mask the promo result
      try {
        const result = await applyPromoAction(cartId, promo.trim());
        setStatus(result.ok ? "Promo applied." : PROMO_MESSAGES[result.reason]);
      } catch {
        // A thrown error here is a transport/redacted failure, not a known reason — one honest line.
        setStatus("Couldn’t apply that code — check your connection and try again.");
      }
      await refresh();
    });
  }

  async function continueToPayment() {
    setPayError(null);
    setStatus(null); // single live region — clear any prior promo result
    setLoadingPay(true);
    try {
      // Member-gated (cookie session); the route re-derives the amount from getCartTotals and locks
      // the cart for the pay window. Same-origin fetch carries the auth cookie.
      const res = await fetch("/api/stripe/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartId, tipRate }),
      });
      const data = (await res.json()) as {
        clientSecret?: string;
        totals?: CartTotals;
        error?: string;
      };
      if (!res.ok || !data.clientSecret || !data.totals)
        throw new Error(data.error ?? `HTTP ${res.status}`);
      setClientSecret(data.clientSecret);
      setPayTotals(data.totals);
      setStep("pay");
    } catch {
      setPayError("Couldn’t start checkout — please try again.");
    } finally {
      setLoadingPay(false);
    }
  }

  async function editOrder() {
    // The cart was never locked (see create-intent NOTE), so going back is a pure UI step — just
    // re-sync from the server in case anything changed while the pay step was open.
    setStep("review");
    setClientSecret(null);
    setPayTotals(null);
    await refresh();
  }

  if (items.length === 0)
    return (
      <main style={{ padding: 24, maxWidth: 440, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28 }}>Your order</h1>
        <p style={{ color: "var(--t2)" }}>Nothing here yet.</p>
        <Link href="/menu" style={{ color: "var(--ac)", fontWeight: 700 }}>
          <span aria-hidden>←</span> Back to menu
        </Link>
      </main>
    );

  const onPay = step === "pay" && clientSecret && payTotals;
  // Client tip PREVIEW (a hint, not the charge) — identical formula to the server's
  // `Math.round(netCents * rate)` (lib/totals.ts), so the previewed "Estimated total" reconciles
  // exactly with the tip-inclusive total create-intent returns on the pay step.
  const tipPreview = (rate: number) =>
    Math.round((totals.subtotalCents - totals.discountCents) * rate);
  const tipPreviewCents = tipPreview(tipRate);

  return (
    <main style={{ padding: "24px 20px 40px", maxWidth: 440, margin: "0 auto" }}>
      {/* tabIndex={-1} = programmatic focus target (focus moves here when a line is removed). No
          outline override — the browser shows its :focus-visible ring (WCAG 2.4.7). */}
      <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 28 }}>
        Your order
      </h1>

      {onPay ? (
        <>
          <dl style={{ margin: "12px 0" }}>
            <Row k="Subtotal" cents={payTotals.subtotalCents} />
            {payTotals.discountCents > 0 && <Row k="Promo" cents={-payTotals.discountCents} />}
            <Row k="Service charge (5%)" cents={payTotals.serviceChargeCents} />
            <Row k="Sales tax" cents={payTotals.taxCents} />
            {payTotals.tipCents > 0 && <Row k="Tip" cents={payTotals.tipCents} />}
            <Row k="Total" cents={payTotals.totalCents} strong />
          </dl>
          <PaymentSection
            cartId={cartId}
            clientSecret={clientSecret}
            totals={payTotals}
            onEdit={editOrder}
          />
        </>
      ) : (
        <>
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0", display: "grid", gap: 10 }}>
            {items.map((i) => (
              <li
                key={i.id}
                className="card"
                style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{i.name}</div>
                  {i.modifiers.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--t2)" }}>{i.modifiers.join(", ")}</div>
                  )}
                  <div
                    style={{ fontWeight: 700, marginTop: 4, fontVariantNumeric: "tabular-nums" }}
                  >
                    ${((i.unitPriceCents * i.qty) / 100).toFixed(2)}
                  </div>
                </div>
                <Stepper
                  qty={i.qty}
                  disabled={pending}
                  name={i.name}
                  onChange={(q) => changeQty(i.id, q)}
                />
              </li>
            ))}
          </ul>

          <form onSubmit={onPromo} style={{ display: "flex", gap: 8, margin: "12px 0" }}>
            <input
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
              placeholder="Promo code"
              aria-label="Promo code"
              autoCapitalize="characters"
              maxLength={40}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--bd)",
                background: "var(--cd)",
                color: "var(--tx)",
              }}
            />
            <button
              type="submit"
              disabled={pending || !promo.trim()}
              style={{
                minHeight: 44,
                padding: "0 16px",
                borderRadius: 10,
                border: "1px solid var(--bd)",
                background: "var(--sf)",
                fontWeight: 700,
              }}
            >
              Apply
            </button>
          </form>

          {/* Tip selector (server confirms the exact tip at create-intent) */}
          <div
            role="group"
            aria-label="Add a tip"
            style={{ display: "flex", gap: 8, margin: "14px 0 4px" }}
          >
            {TIPS.map(([label, rate]) => {
              const on = tipRate === rate;
              const previewCents = tipPreview(rate);
              return (
                <button
                  key={rate}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTipRate(rate)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    padding: "10px 4px",
                    borderRadius: 13,
                    border: `1.5px solid ${on ? "var(--ac)" : "var(--bd)"}`,
                    background: on ? "color-mix(in oklab, var(--ac) 9%, var(--cd))" : "var(--cd)",
                    color: on ? "var(--ac)" : "var(--tx)",
                    textAlign: "center",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {label}
                  <small
                    style={{
                      display: "block",
                      fontSize: 10,
                      fontWeight: 700,
                      color: on ? "var(--ac)" : "var(--t3)",
                    }}
                  >
                    {rate ? `$${(previewCents / 100).toFixed(2)}` : "—"}
                  </small>
                </button>
              );
            })}
          </div>

          <dl style={{ margin: "12px 0" }}>
            <Row k="Subtotal" cents={totals.subtotalCents} />
            {totals.discountCents > 0 && <Row k="Promo" cents={-totals.discountCents} />}
            <Row k="Service charge (5%)" cents={totals.serviceChargeCents} />
            <Row k="Sales tax" cents={totals.taxCents} />
            {/* Tip is previewed here so the review total matches the pay-step total — labeled
                "Estimated" until create-intent confirms it server-side. */}
            {tipPreviewCents > 0 && <Row k="Tip" cents={tipPreviewCents} />}
            <Row
              k={tipPreviewCents > 0 ? "Estimated total" : "Total"}
              cents={totals.totalCents + tipPreviewCents}
              strong
            />
          </dl>

          <p style={{ fontSize: 11, color: "var(--t3)" }}>
            A 5% service charge supports fair kitchen wages and is shared with the team (CA
            SB-1524). It is not a tip — anything extra above is yours to give. Card fees are built
            into menu prices; we never add a surcharge on debit.
          </p>

          <button
            type="button"
            onClick={continueToPayment}
            disabled={loadingPay}
            aria-busy={loadingPay}
            style={{
              width: "100%",
              marginTop: 12,
              minHeight: 50,
              borderRadius: 12,
              border: "none",
              background: "var(--ac)",
              color: "var(--oa)",
              fontWeight: 800,
              fontSize: 16,
              cursor: loadingPay ? "default" : "pointer",
              opacity: loadingPay ? 0.7 : 1,
            }}
          >
            {loadingPay ? "Starting checkout…" : "Continue to payment"}
          </button>
          {/* The ONE polite live region for the review step (QA §A P1) — carries the pay-start
              error OR the promo result, never both (each handler clears the other first). The pay
              step has its own single region inside PaymentSection. */}
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{
              minHeight: 16,
              margin: "8px 0 0",
              fontSize: 13,
              color: payError ? "var(--warn)" : "var(--t2)",
            }}
          >
            {payError ?? status}
          </p>
        </>
      )}
    </main>
  );
}

function Stepper({
  qty,
  onChange,
  disabled,
  name,
}: {
  qty: number;
  onChange: (q: number) => void;
  disabled?: boolean;
  name: string;
}) {
  const btn = {
    width: 44,
    height: 44,
    borderRadius: 999,
    border: "1px solid var(--bd)",
    background: "var(--cd)",
    color: "var(--tx)",
    fontSize: 20,
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
  } as const;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        disabled={disabled}
        aria-label={qty <= 1 ? `Remove ${name}` : `Decrease ${name} quantity`}
        onClick={() => onChange(qty - 1)}
        style={btn}
      >
        {qty <= 1 ? "🗑" : "−"}
      </button>
      {/* Plain <span> (not <output>): <output> has an implicit role="status" some AT announces on
          every press even with aria-live="off". The count must NOT be a live region (RED-TEAM/QA). */}
      <span
        aria-label={`Quantity ${qty}`}
        style={{
          minWidth: 20,
          textAlign: "center",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {qty}
      </span>
      <button
        type="button"
        disabled={disabled || qty >= 99}
        aria-label={qty >= 99 ? `Maximum 99 ${name}` : `Add another ${name}`}
        onClick={() => onChange(qty + 1)}
        style={btn}
      >
        +
      </button>
    </div>
  );
}

function Row({ k, cents, strong }: { k: string; cents: number; strong?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "5px 0",
        fontWeight: strong ? 800 : 400,
      }}
    >
      <dt>{k}</dt>
      <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>${(cents / 100).toFixed(2)}</dd>
    </div>
  );
}
