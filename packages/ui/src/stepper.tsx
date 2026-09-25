"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { removeHeld } from "./gesture";
import { Icon } from "./icon";

/**
 * Stepper — a quantity −/+ control (P5.4). Interactive (client). Presentational only: the parent owns
 * the mutation (the optimistic update / `startTransition` / rollback) and passes the current `qty` plus
 * an `onChange` that receives the next value. This primitive encodes the load-bearing rules ONCE, so
 * the two call sites (the customer cart in `Checkout` + the staff line editor) stop drifting:
 *  - 44px tap targets on both controls;
 *  - the **remove-at-min swap** — at `qty <= min` the "−" becomes a destructive Remove (a swapped glyph
 *    + a swapped accessible name), while the "−"/remove itself stays enabled so the line can be cleared;
 *  - the **increment gate** — "+" refuses at `busy`/`disabled`, `qty >= max`, or `soldOut`, each with
 *    the right accessible name (a sold-out "+" also dims). The "−"/remove stays live when an item is
 *    sold out (so the line can still be cleared); it refuses only with `disabled` (a mutation in flight).
 *  - **the remove-arm** (Phase 1c) — a Remove that was a "−" less than `SAME_GESTURE_MS` ago ignores
 *    the tap (a double-tap never deletes). The swallowed tap gives no feedback: by definition it is the
 *    second half of the gesture that made the "−" turn into Remove. A Remove that MOUNTED at the
 *    minimum is never held. The arm is a ref read and written only in the handler (#126).
 *  - **§17 — never native `disabled` on a control that was just tapped.** A natively disabled button
 *    drops focus to `<body>` mid-tap, so a busy stepper spoke its name from nowhere. Both controls are
 *    `aria-disabled` with the handler refusing re-entry (the same predicate), and a dim keyed on it;
 *    a refused "+" therefore ANNOUNCES why (sold out, at the maximum) instead of blurring.
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
  removeGlyph = <Icon name="close" size={18} />,
  removeTone,
  showCount = false,
  incrementLabel,
  soldOutLabel,
  disabledLabel,
  labels,
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
  /** Glyph for the remove (at-min) state. Defaults to the close icon; the customer cart passes the trash
   *  icon. Any ReactNode (icon or text). */
  removeGlyph?: ReactNode;
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
  /** The name BOTH controls take while `disabled` — the reason a refused tap gives. A control that
   *  keeps its focus (§17) must not keep a name that promises the action it now refuses: the diner
   *  cart's "+" said "Add another Mohinga" through a payment freeze. Omit for a sub-second busy
   *  beat, where a renamed control would only chatter. */
  disabledLabel?: string;
  /**
   * ── Phase 2c · pad ── every name WHOLE, for a caller with its own dictionary (the staff line
   * editor, Burmese-first). ALL-OR-NOTHING: the three base names come together, so a control can
   * never announce one tongue on "−" and another on "+". `soldOut` / `max` are optional and fall
   * back to `soldOutLabel` / the default. `max` is handed the REAL ceiling, so a caller's name can
   * never state a number this control does not enforce. `disabledLabel` still wins while `disabled`
   * (the reason a refused tap gives). A caller passing nothing — the diner cart — renders exactly
   * as before.
   */
  labels?: {
    decrease: string;
    remove: string;
    increase: string;
    soldOut?: string;
    max?: (max: number) => string;
  };
}) {
  const removing = qty <= min;
  const incDisabled = disabled || qty >= max || soldOut;
  // When this "−" last turned into Remove (a `performance.now()` stamp), or null. Handler-only.
  const morphedAt = useRef<number | null>(null);
  return (
    <span style={{ ...row, gap: showCount ? 8 : 4 }}>
      <button
        type="button"
        className="mms-stepper-btn"
        onClick={() => {
          if (disabled) return;
          // The remove-arm: the second tap of a double-tap on "−" lands on the Remove it just became.
          if (removing && removeHeld(morphedAt.current, performance.now())) return;
          if (!removing && qty - 1 <= min) morphedAt.current = performance.now();
          onChange(qty - 1);
        }}
        aria-disabled={disabled || undefined}
        aria-label={
          disabled && disabledLabel
            ? disabledLabel
            : removing
              ? (labels?.remove ?? `Remove ${name}`)
              : (labels?.decrease ?? `Decrease ${name} quantity`)
        }
        style={{ ...step(disabled), ...(removing && removeTone ? { color: removeTone } : null) }}
      >
        <span aria-hidden>{removing ? removeGlyph : "−"}</span>
      </button>
      {showCount ? (
        // R5a count-bounce. The accessible quantity is a REAL `.sr-only` text node (reliably exposed —
        // `aria-label` on a roleless <span> is not), and it's NOT a live region, so it never announces
        // per tap (the red-team rule above). The visible digit is `aria-hidden` and keyed on `qty` so it
        // remounts → replays `mms-pop` (reduced-motion-gated by the shared keyframe rule) — purely visual.
        <span style={count}>
          <span className="sr-only">Quantity {qty}</span>
          <span key={qty} aria-hidden className="mms-pop" style={{ display: "inline-block" }}>
            {qty}
          </span>
        </span>
      ) : null}
      <button
        type="button"
        className="mms-stepper-btn"
        onClick={() => {
          if (incDisabled) return;
          onChange(qty + 1);
        }}
        aria-disabled={incDisabled || undefined}
        aria-label={
          disabled && disabledLabel
            ? disabledLabel
            : soldOut
              ? (labels?.soldOut ?? soldOutLabel ?? `${name} is sold out`)
              : qty >= max
                ? (labels?.max?.(max) ?? `Maximum ${max} ${name}`)
                : (labels?.increase ?? incrementLabel ?? `Increase ${name} quantity`)
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
  fontWeight: "var(--fw-bold)",
  lineHeight: 1,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.6 : 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
});
const count: CSSProperties = {
  minWidth: 20,
  textAlign: "center",
  fontWeight: "var(--fw-bold)",
  fontVariantNumeric: "tabular-nums",
};
