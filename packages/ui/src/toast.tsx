import type { CSSProperties, ReactNode } from "react";

/**
 * Toast — the ONE diner confirmation (Phase 0). Replaces two hand-built pills (the menu's
 * `.mms-toast`, owned by TableCartProvider, and the market's `.grocery-toast`) that had two
 * placements, two entrances and two ideas of where the CTA dock was. Presentational: the caller owns
 * the timer and the single-slot queue (both callers already did, with rules of their own worth
 * keeping — the market's scan-rate timer, the menu's leave phase).
 *
 * a11y — the region is ALWAYS mounted and only the pill comes and goes: several screen-reader and
 * browser pairs skip a live region that is born with its text. `role="status"` AND `aria-live` is
 * deliberate, not the usual redundancy (QA §A): Radix's modal `aria-hidden` sweep exempts only
 * `[aria-live]` nodes, so without the attribute a message landing while a sheet is open flashes into
 * a hidden node (adversarial MED-6 on the market). This is the view's one live region for the
 * outcomes it announces — do not pair it with a second.
 *
 * `action` renders a real button inside the pill (an Undo) — the only part that takes a pointer.
 * ⚠️ WCAG 2.2.1: a caller that passes an `action` must not tear the message down on a fixed timer
 * while that button has focus or the pointer is on the pill — pause the timer (or extend it) on
 * focus/hover, or a keyboard and screen-reader user cannot reach Undo in time. No production caller
 * passes one yet (F21 is the first); build that pause into the caller that does.
 *
 * `quiet` (Phase 1c) — the message is SPOKEN through this same region and draws nothing: no pill, no
 * action, no entrance. It is for a change the person can already SEE where they acted (the menu's
 * pill morphing into a stepper), where a floating pill over the list would only cover the rows the
 * diner is reading. The region is still the view's ONE announcer — a quiet line never needs a second
 * live region, and must never get one. Non-quiet rendering is unchanged.
 */
export type ToastMessage = {
  /** Changes whenever the message does — keys the pill so a replacement replays the entrance. */
  key: string | number;
  text: ReactNode;
  /** The Burmese half, set on the Padauk stack with its own `lang="my"`. */
  my?: ReactNode;
  action?: { label: string; onAction: () => void };
  /** Spoken, not drawn — for a change already visible where the person acted. No action, no motion. */
  quiet?: boolean;
};

export function Toast({
  message,
  leaving = false,
  style,
}: {
  message: ToastMessage | null;
  /** The settle-down phase before the caller unmounts the message. */
  leaving?: boolean;
  /** Escape hatch for a caller that must offset the region (e.g. a custom dock variable). */
  style?: CSSProperties;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="ui-toast-region"
      style={style}
    >
      {message?.quiet ? (
        <span key={message.key} className="ui-toast-quiet">
          {message.text}
          {message.my ? (
            <span lang="my">
              {" · "}
              {message.my}
            </span>
          ) : null}
        </span>
      ) : message ? (
        <span key={message.key} className={`ui-toast${leaving ? " ui-toast-leaving" : ""}`}>
          <span>
            {message.text}
            {message.my ? (
              <span lang="my" className="ui-toast-my">
                {" · "}
                {message.my}
              </span>
            ) : null}
          </span>
          {message.action ? (
            <button type="button" className="ui-toast-action" onClick={message.action.onAction}>
              {message.action.label}
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
