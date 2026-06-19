"use client";
import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import type { CartItem, CartTotals } from "@mms/db";
import { applyPromo as applyPromoAction, getCartView, setQty as setQtyAction } from "@/lib/cart";

/**
 * Cart + checkout (client). Renders the SERVER-AUTHORITATIVE totals/lines and re-fetches them after
 * every mutation via `getCartView` — it never does client money math. Quantity steppers and promo go
 * through the member-gated server actions. The pay CTA is a placeholder until P1.3 mounts the Stripe
 * Payment Element here (no card path until the M1 gate in docs/REVIEW.md is green).
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

  async function refresh() {
    try {
      const v = await getCartView(cartId);
      setItems(v.items);
      setTotals(v.totals);
    } catch {
      // The cart is no longer open (paid/closed) — assertCartMember throws 403. Swallow it so the
      // read path doesn't surface an uncaught rejection; P1.3 redirects to the receipt page here.
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
      try {
        await applyPromoAction(cartId, promo.trim());
        setStatus("Promo applied.");
      } catch {
        setStatus("That code isn’t valid.");
      }
      await refresh();
    });
  }

  if (items.length === 0)
    return (
      <main style={{ padding: 24, maxWidth: 440, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28 }}>Your order</h1>
        <p style={{ color: "var(--t2)" }}>Nothing here yet.</p>
        <Link href="/menu" style={{ color: "var(--ac)", fontWeight: 700 }}>
          ← Back to menu
        </Link>
      </main>
    );

  return (
    <main style={{ padding: "24px 20px 40px", maxWidth: 440, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28 }}>Your order</h1>

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
              <div style={{ fontWeight: 700, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
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
      {/* The one polite live region — promo result. The rolling totals below are NOT aria-live. */}
      <p aria-live="polite" style={{ minHeight: 16, margin: 0, fontSize: 12, color: "var(--t2)" }}>
        {status}
      </p>

      <dl style={{ margin: "12px 0" }}>
        <Row k="Subtotal" cents={totals.subtotalCents} />
        {totals.discountCents > 0 && <Row k="Promo" cents={-totals.discountCents} />}
        <Row k="Service charge (5%)" cents={totals.serviceChargeCents} />
        <Row k="Sales tax" cents={totals.taxCents} />
        <Row k="Total" cents={totals.totalCents} strong />
      </dl>

      <p style={{ fontSize: 11, color: "var(--t3)" }}>
        A 5% service charge supports fair kitchen wages and is shared with the team (CA SB-1524).
        Card fees are in menu prices; we never surcharge debit.
      </p>

      <button
        type="button"
        disabled
        aria-describedby="pay-cta-note"
        style={{
          width: "100%",
          marginTop: 12,
          minHeight: 50,
          borderRadius: 12,
          border: "none",
          background: "var(--sf)",
          color: "var(--t3)",
          fontWeight: 800,
          cursor: "default",
        }}
      >
        Continue to payment — arriving next
      </button>
      {/* Visible + programmatically-associated reason (aria-describedby) — `title` is invisible on
          mobile and unreliable in screen readers. */}
      <p
        id="pay-cta-note"
        style={{ fontSize: 11, color: "var(--t3)", marginTop: 6, textAlign: "center" }}
      >
        Secure card checkout arrives next (P1.3).
      </p>
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
      {/* Plain <span> (not <output>): <output> has an implicit role="status"/aria-live="polite"
          that NVDA + VoiceOver announce on every stepper press even with aria-live="off". The label
          stays readable on navigation; the count must NOT be a live region (RED-TEAM/QA). */}
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
