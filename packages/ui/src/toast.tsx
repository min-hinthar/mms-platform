import type { CSSProperties, FocusEvent, ReactNode } from "react";
import { matchesFocusVisible } from "./focus-visible";

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
 * `live={false}` (Phase 2b) — for a view whose OWN region already speaks the fact: the region
 * drops role, aria-live and aria-atomic, and the pill only DRAWS (one voice per fact). The staff
 * lane's Undo pill is the case: the lane's region says "Table 7 picked up — undo available", and a
 * second polite region saying "Table 7 picked up" would be the same sentence twice. A quiet message
 * has nothing to draw, so the type forbids `quiet` with `live={false}`.
 *
 * `action` renders a real button inside the pill (an Undo). Its NAME is its visible label — a
 * ReactNode, so a staff caller passes its marked `<Chrome>` — and there is deliberately NO
 * aria-label channel: a name passed as an object property is invisible to the staff-language
 * guard's attribute rules, and the visible text is the name WCAG 2.5.3 wants anyway. What the
 * action is ABOUT rides `describedById` instead: the pill's own visible text becomes the button's
 * description, so a screen reader hears "Undo — Table 7 picked up" without a second name. `disabled`
 * refuses the tap (aria-disabled, the label kept — never natively disabled, which drops focus).
 * ⚠️ WCAG 2.2.1: a caller that passes an `action` must not tear the message down on a fixed timer
 * while a keyboard or screen-reader user is on it. `onHold(true)` fires when focus arrives the
 * KEYBOARD way (`:focus-visible` — a tap's focus never holds, so a touch never stalls the write)
 * and `onHold(false)` on blur; the caller pauses its window between the two. The staff lane is the
 * first caller with an action and owns that pause (lib/undo-hold.ts).
 *
 * `size="xl"` (Phase 2b) — the thumb-zone pill: `--tap-bump` tall, and it takes pointer events over
 * its WHOLE body, so a thumb that misses the action lands on the visible pill — never on a control
 * hidden beneath it. A LEAVING xl pill takes none (an invisible pill must never eat a tap). `shield`
 * keeps the pill fully visible while its action refuses — the caller's "same gesture" window after
 * its own Undo, so a double-tap's second half lands on something the person can see and does
 * nothing. `drainMs` draws a bar that empties over the caller's REAL window; `held` pauses it.
 *
 * `quiet` (Phase 1c) — the message is SPOKEN through this same region and draws nothing: no pill, no
 * action, no entrance. It is for a change the person can already SEE where they acted (the menu's
 * pill morphing into a stepper), where a floating pill over the list would only cover the rows the
 * diner is reading. The region is still the view's ONE announcer — a quiet line never needs a second
 * live region, and must never get one. Non-quiet rendering is unchanged.
 */
export type ToastAction = {
  /** The visible label — and the WHOLE accessible name (there is no aria-label channel). */
  label: ReactNode;
  onAction: () => void;
  /** Refuse the tap (aria-disabled, the label kept) — an Undo not yet armed, a write in flight. */
  disabled?: boolean;
  /** `true` when focus arrives the keyboard way, `false` on blur — the caller holds its window. */
  onHold?: (held: boolean) => void;
  /** An id for the pill's TEXT, which the action is then `aria-describedby`: a bare "Undo" heard
   *  on its own says nothing about WHAT it undoes, so the subject the pill names rides along as its
   *  description. The caller owns the id (unique on the page); the name stays the visible label. */
  describedById?: string;
};

export type ToastMessage = {
  /** Changes whenever the message does — keys the pill so a replacement replays the entrance. */
  key: string | number;
  text: ReactNode;
  /** The Burmese half, set on the Padauk stack with its own `lang="my"`. */
  my?: ReactNode;
  action?: ToastAction;
  /** Spoken, not drawn — for a change already visible where the person acted. No action, no motion. */
  quiet?: boolean;
  /** An xl pill's drain: empties linearly over this many ms — the caller's real window. */
  drainMs?: number;
  /** The caller's window is held (a keyboard user is on the action): the drain pauses. */
  held?: boolean;
};

/** A message that can never be quiet — the only kind a `live={false}` toast takes. */
export type SilentToastMessage = Omit<ToastMessage, "quiet"> & { quiet?: never };

/**
 * The leave phase's length: `.ui-toast-leaving` runs `uiToastOut` over `--dur-fast`, and a caller
 * that unmounts on a timer must wait exactly this long (pinned to the token by `toast.test.ts`).
 */
export const TOAST_LEAVE_MS = 120;

type ToastProps = {
  /** The settle-down phase before the caller unmounts the message. */
  leaving?: boolean;
  /** Escape hatch for a caller that must offset the region (e.g. a custom dock variable). */
  style?: CSSProperties;
  /** `xl` — the thumb-zone pill (see above). */
  size?: "md" | "xl";
  /** The pill stays visible and its action refuses (the caller's same-gesture window). */
  shield?: boolean;
} & (
  | { live?: true; message: ToastMessage | null }
  | { live: false; message: SilentToastMessage | null }
);

export function Toast({
  message,
  leaving = false,
  style,
  size = "md",
  shield = false,
  live = true,
}: ToastProps) {
  const region = live
    ? ({ role: "status", "aria-live": "polite", "aria-atomic": "true" } as const)
    : {};
  const action = message?.action;
  // A LEAVING pill's action refers to a window that is already closing: refused in the handler too,
  // not only by the stylesheet's `pointer-events` (a keyboard Enter never asks the stylesheet).
  const inert = shield || leaving || action?.disabled === true;
  const onHold = action?.onHold;
  return (
    <div {...region} className="ui-toast-region" style={style}>
      {message?.quiet ? (
        // Spoken through the region — so a silent region has nothing to do with it.
        live ? (
          <span key={message.key} className="ui-toast-quiet">
            {message.text}
            {message.my ? (
              <span lang="my">
                {" · "}
                {message.my}
              </span>
            ) : null}
          </span>
        ) : null
      ) : message ? (
        <span
          key={message.key}
          className={`ui-toast${size === "xl" ? " ui-toast-xl" : ""}${leaving ? " ui-toast-leaving" : ""}`}
          data-shield={shield || undefined}
          data-held={message.held || undefined}
        >
          <span id={action?.describedById}>
            {message.text}
            {message.my ? (
              <span lang="my" className="ui-toast-my">
                {" · "}
                {message.my}
              </span>
            ) : null}
          </span>
          {action ? (
            <button
              type="button"
              className="ui-toast-action"
              aria-disabled={inert || undefined}
              aria-describedby={action.describedById}
              onClick={() => {
                if (!inert) action.onAction();
              }}
              onFocus={
                onHold
                  ? (e: FocusEvent<HTMLButtonElement>) => {
                      if (matchesFocusVisible(e.currentTarget)) onHold(true);
                    }
                  : undefined
              }
              onBlur={onHold ? () => onHold(false) : undefined}
            >
              {action.label}
            </button>
          ) : null}
          {size === "xl" && message.drainMs ? (
            <span
              className="ui-toast-drain"
              aria-hidden="true"
              style={{ "--toast-drain": `${message.drainMs}ms` } as CSSProperties}
            />
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
