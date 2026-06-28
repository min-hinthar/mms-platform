"use client";

import type { CSSProperties } from "react";

/**
 * Stepper — a quantity −/+ control (P5.4). Interactive (client). Presentational only: the parent owns
 * the mutation (the optimistic update / `startTransition` / rollback) and passes the current `qty` plus
 * an `onChange` that receives the next value. This primitive encodes the load-bearing rules ONCE, so
 * the two call sites (the customer cart in `Checkout` + the staff line editor) stop drifting:
 *  - 44px tap targets on both controls;
 *  - the **remove-at-min swap** — at `qty <= min` the "−" becomes a destructive Remove (a swapped glyph
 *    + a swapped accessible name), while the "−"/remove itself stays enabled so the line can be cleared;
 *  - the **increment gate** — "+" disables at `busy`/`disabled`, `qty >= max`, or `soldOut`, each with
 *    the right accessible name (a sold-out "+" also dims). The "−"/remove stays enabled when an item is
 *    sold out (so the line can still be cleared); it disables only with `disabled` (a mutation in flight).
 *
 * a11y: each button has an accessible name woven from `name` (e.g. "Increase Tea Leaf Salad quantity" /
 * "Remove Tea Leaf Salad"). The optional center count is a plain `<span aria-label="Quantity N">` — NOT
 * an `<output>`/live region: `<output>`'s implicit `role="status"` is announced by some AT on every
 * press even with `aria-live="off"`, and the count must not announce per tap (RED-TEAM/QA).
 */
export function Stepper({
  qty,
  onChange,
  name,
  min = 1,
  max = 99,
  disabled = false,
  soldOut = false,
  removeGlyph = "✕",
  removeTone,
  showCount = false,
  incrementLabel,
  soldOutLabel,
}: {
  qty: number;
  /** Receives the next quantity (`qty ± 1`). The parent performs the mutation. */
  onChange: (next: number) => void;
  /** Item name — woven into each control's accessible name. */
  name: string;
  /** Quantity at/below which "−" becomes a destructive Remove. Default 1. */
  min?: number;
  /** Upper bound; "+" disables at `qty >= max`. Default 99. */
  max?: number;
  /** Mutation in flight / not editable — disables both controls. */
  disabled?: boolean;
  /** 86'd item — disables + dims "+" (the "−"/remove stays enabled to clear the line). */
  soldOut?: boolean;
  /** Glyph for the remove (at-min) state. Default "✕"; the customer cart passes "🗑". */
  removeGlyph?: string;
  /** Color token for the remove-state glyph (e.g. `var(--warn)` for the staff editor's red ✕). */
  removeTone?: string;
  /** Show a center quantity readout between the buttons (the customer cart). */
  showCount?: boolean;
  /** Override the default-state "+" accessible name (e.g. the cart's warmer "Add another Tea Leaf Salad").
   *  Defaults to "Increase {name} quantity". The sold-out / at-max names take precedence. */
  incrementLabel?: string;
  /** Override the sold-out "+" accessible name (e.g. staff's "{name} is sold out — can't add more").
   *  Defaults to "{name} is sold out". */
  soldOutLabel?: string;
}) {
  const removing = qty <= min;
  const incDisabled = disabled || qty >= max || soldOut;
  return (
    <span style={{ ...row, gap: showCount ? 8 : 4 }}>
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={disabled}
        aria-label={removing ? `Remove ${name}` : `Decrease ${name} quantity`}
        style={{ ...step(disabled), ...(removing && removeTone ? { color: removeTone } : null) }}
      >
        <span aria-hidden>{removing ? removeGlyph : "−"}</span>
      </button>
      {showCount ? (
        <span aria-label={`Quantity ${qty}`} style={count}>
          {qty}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={incDisabled}
        aria-label={
          soldOut
            ? (soldOutLabel ?? `${name} is sold out`)
            : qty >= max
              ? `Maximum ${max} ${name}`
              : (incrementLabel ?? `Increase ${name} quantity`)
        }
        style={{
          ...step(incDisabled),
          ...(soldOut ? { opacity: 0.55, cursor: "not-allowed" } : null),
        }}
      >
        <span aria-hidden>+</span>
      </button>
    </span>
  );
}

const row: CSSProperties = { display: "inline-flex", alignItems: "center" };
const step = (disabled: boolean): CSSProperties => ({
  width: 44,
  height: 44,
  minWidth: 44,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: 18,
  fontWeight: 700,
  lineHeight: 1,
  cursor: disabled ? "default" : "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
});
const count: CSSProperties = {
  minWidth: 20,
  textAlign: "center",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
};
