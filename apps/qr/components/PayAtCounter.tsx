"use client";
import type { CSSProperties } from "react";
import { Icon, NumberFlow } from "@mms/ui";
import { t, type DictKey } from "@/lib/i18n";

/**
 * A1 — the diner's "Pay at the counter" moment, on the Bill.
 *
 * Two surfaces share this file because they are one decision seen from two sides:
 *  - `PayAtCounterButton` — the quiet second door under "Pay · $X". Ghost, never a second filled
 *    CTA (the Bill owns ONE hero action — W12/W19), and it carries the same freeze gate as the pay
 *    CTA: a table mid-card-payment is not offered a walk to the register.
 *  - `PayAtCounterCard` — the state after the tap. It REPLACES the pay furniture (tip, promo, the
 *    card CTA) but never the receipt rows above it: the register re-derives the live total, so the
 *    amount here is the same server figure the Bill already shows, and the table may keep ordering.
 *    The way back is a quiet link, last (the DESIGN-LANGUAGE "escape is a quiet link" rule).
 *
 * Amounts are never computed here — `totalCents` is `getCartTotals`' figure, passed through.
 */

const TX = (k: DictKey) => t("en", k);

export function PayAtCounterButton({
  disabled,
  busy,
  onClick,
}: {
  /** The pay freeze (`payFrozen`) — the same predicate the card CTA reads. */
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="checkout-cta-ghost"
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      onClick={() => {
        if (disabled || busy) return;
        onClick();
      }}
      style={{
        ...ghost,
        cursor: disabled || busy ? "default" : "pointer",
        opacity: disabled ? 0.55 : busy ? 0.7 : 1,
      }}
    >
      <Icon name="receipt" size={16} />
      <span>
        {busy ? "One moment…" : TX("payAtCounter")}
        <span lang="my" style={{ display: "block", fontSize: "var(--fs-xs)", fontWeight: 600 }}>
          {t("my", "payAtCounter")}
        </span>
      </span>
    </button>
  );
}

export function PayAtCounterCard({
  tableNumber,
  totalCents,
  busy,
  onWithdraw,
}: {
  tableNumber: number | null;
  totalCents: number;
  busy: boolean;
  onWithdraw: () => void;
}) {
  return (
    <section className="card card-textured mms-rise" style={card} aria-labelledby="counter-h">
      <p style={eyebrow}>
        <Icon name="receipt" size={14} />{" "}
        {tableNumber != null ? `Table ${tableNumber}` : "Your table"}
      </p>
      <h3 id="counter-h" style={title}>
        {TX("counterTitle")}
        <span lang="my" style={titleMy}>
          {t("my", "counterTitle")}
        </span>
      </h3>
      <p style={body}>
        {TX("counterBody")}
        <span lang="my" style={bodyMy}>
          {t("my", "counterBody")}
        </span>
      </p>
      <p style={amountRow}>
        <span style={amountLabel}>{TX("rowTotal")}</span>
        <span className="vt-cart-total" style={amount}>
          <NumberFlow value={totalCents / 100} format={{ style: "currency", currency: "USD" }} />
        </span>
      </p>
      <p style={note}>
        {TX("counterKeepOrdering")}
        <span lang="my" style={bodyMy}>
          {t("my", "counterKeepOrdering")}
        </span>
      </p>
      <button
        type="button"
        className="nav-link"
        aria-busy={busy || undefined}
        onClick={() => {
          if (busy) return;
          onWithdraw();
        }}
        style={{ ...back, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "One moment…" : TX("payOnPhoneInstead")}
        <span aria-hidden className="nav-arrow nav-arrow-fwd">
          {" "}
          →
        </span>
      </button>
    </section>
  );
}

/** The close after the register settled — the diner's screen has no cart left to read. */
export function CounterSettledCard({ menuHref, menuText }: { menuHref: string; menuText: string }) {
  return (
    <section className="card card-textured mms-pop" style={card} aria-labelledby="settled-h">
      <p style={{ ...eyebrow, color: "var(--ok)" }}>
        <Icon name="check" size={14} /> Settled
      </p>
      <h3 id="settled-h" style={title}>
        {TX("counterSettledTitle")}
        <span lang="my" style={titleMy}>
          {t("my", "counterSettledTitle")}
        </span>
      </h3>
      <p style={body}>
        {TX("counterSettledBody")}
        <span lang="my" style={bodyMy}>
          {t("my", "counterSettledBody")}
        </span>
      </p>
      <a href={menuHref} className="nav-link-strong" style={{ marginTop: 6 }}>
        <span aria-hidden className="nav-arrow nav-arrow-back">
          ←
        </span>{" "}
        {menuText}
      </a>
    </section>
  );
}

const ghost: CSSProperties = {
  width: "100%",
  marginTop: 10,
  minHeight: 48,
  borderRadius: 12,
  border: "1px solid var(--bd)",
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontWeight: 700,
  fontSize: "var(--fs-body)",
  textAlign: "left",
};
const card: CSSProperties = { marginTop: 14, padding: "18px 18px 16px", display: "grid", gap: 8 };
const eyebrow: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-xs)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--t3)",
  display: "flex",
  alignItems: "center",
  gap: 6,
};
const title: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-h2)",
  fontWeight: 800,
  lineHeight: 1.15,
};
const titleMy: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-my)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  color: "var(--t2)",
  marginTop: 4,
};
const body: CSSProperties = {
  margin: 0,
  color: "var(--t2)",
  fontSize: "var(--fs-body)",
  lineHeight: 1.5,
};
const bodyMy: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-my)",
  fontSize: "var(--fs-xs)",
  color: "var(--t3)",
  marginTop: 2,
};
const amountRow: CSSProperties = {
  margin: "6px 0 0",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12,
  paddingTop: 10,
  borderTop: "1px solid var(--bd)",
};
const amountLabel: CSSProperties = { fontWeight: 800, fontSize: "var(--fs-body)" };
const amount: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-h2)",
  fontWeight: 800,
};
const note: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
  lineHeight: 1.5,
};
const back: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  marginTop: 4,
  justifySelf: "start",
};
