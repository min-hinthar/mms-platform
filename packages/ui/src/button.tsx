import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";

/**
 * Button — the ONE action control (Phase 0). Styling is `primitives.css` (`.ui-btn*`); this file owns
 * the behaviour every hand-rolled button had to remember and several forgot:
 *
 *  · **Disabled is `aria-disabled`, never native `disabled`** (K35, DESIGN-LANGUAGE §17). A native
 *    disabled control drops out of the tab order and swallows the focus a keyboard user was on; an
 *    aria-disabled one keeps focus, announces "dimmed", and the click is refused HERE, in one place.
 *  · **Busy is a state, not a disabled look.** `busy` sets `aria-busy`, refuses re-entry (the double
 *    tap that minted two of something — LEARNINGS #126) and swaps in a spinner + optional
 *    `busyLabel` ("Saving…"), at full ink.
 *  · **One size vocabulary** with a 44px floor at every size; `xl` is the kitchen/counter tap.
 *
 * For a link that should LOOK like a button (a Next `<Link>`), use `buttonClass()` on the link —
 * this package does not depend on Next.
 */
export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

export function buttonClass({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}): string {
  return [
    "ui-btn",
    `ui-btn-${variant}`,
    size === "md" ? null : `ui-btn-${size}`,
    block ? "ui-btn-block" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width of its container. */
  block?: boolean;
  /** Refuses the tap and says so (`aria-disabled`); focus stays. */
  disabled?: boolean;
  /** The action is in flight: `aria-busy`, a spinner, re-entry refused. */
  busy?: boolean;
  /** What the label says while busy ("Saving…"). Defaults to the label itself. */
  busyLabel?: ReactNode;
  /** A trailing arrow that nudges on hover — `fwd` for forward CTAs, `back` for returns. */
  arrow?: "fwd" | "back";
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant,
    size,
    block,
    disabled = false,
    busy = false,
    busyLabel,
    arrow,
    className,
    type = "button",
    onClick,
    children,
    ...rest
  },
  ref,
) {
  const inert = disabled || busy;
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, block, className })}
      aria-disabled={inert || undefined}
      aria-busy={busy || undefined}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        // The one refusal point. `preventDefault` also stops a type="submit" button's implicit form
        // submission (an Enter in a field synthesises a click on it).
        if (inert) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      {...rest}
    >
      {busy ? <span className="ui-btn-spinner" aria-hidden /> : null}
      {arrow === "back" ? (
        <span aria-hidden className="ui-btn-arrow-back">
          ←
        </span>
      ) : null}
      <span>{busy && busyLabel ? busyLabel : children}</span>
      {arrow === "fwd" ? (
        <span aria-hidden className="ui-btn-arrow-fwd">
          →
        </span>
      ) : null}
    </button>
  );
});
