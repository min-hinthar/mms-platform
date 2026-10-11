"use client";
import { useRef } from "react";
import { t, type DictKey } from "@/lib/i18n";
import { useCtaDock } from "@/lib/hooks/useCtaDock";

const TX = (k: DictKey) => t("en", k);

/**
 * PD10 (m10 screen 1, "THE DOCK"; D5) — the dine-in Bill's Pay, DOCKED, once the phone-pay door is
 * open (after C2's flip; `SURFACES.dineInPhonePay`). The sibling of PD2's `PayAtCounterDock` and the
 * same fixed geometry (`.counter-dock`): the Bill's ONE LINE SLOT, then the filled Pay at
 * `--tap-bump`, then the quiet "Pay at the counter" — a column whose height never changes, so the
 * door opening moves nothing.
 *
 * The slot carries Pay's ONE reason while it is held — "Pay opens once everything’s served." (the
 * kitchen), a tablemate's lock, the Send still owed, a hostless table's server, a to-go dish's ⋯ —
 * and at rest, once the door is open, "Ready to pay." (decision 9: the visual twin of the one-time
 * announcement). Never both. Held, Pay KEEPS its name and amount ("Pay the whole order · $39.23"),
 * dimmed and `aria-disabled` — never native `disabled`, so it stays reachable and reads why through
 * `aria-describedby` — and every blocked tap re-says the reason through the view's one region.
 *
 * THE COUNTER IS NEVER GATED BY SERVED (D5): its own hold (`counter.reason`) is the counter's — a
 * tablemate's lock, the Send still owed, the Send's undo window, the register mid-settle — never the
 * kitchen. It is quiet (44px, transparent), never a second filled hero. Held, it is `aria-disabled`
 * and SAYS ITS OWN REASON (the capped blind pass on #346, C3): when that reason is the slot's own
 * sentence (a lock, the register), the counter reads the slot; when it differs (the kitchen holds
 * Pay while the undo window holds the counter), its sentence is drawn directly above it
 * (`#pay-counter-line`) and the counter reads that. Each held control is described by its own reason,
 * and Pay's kitchen line never stands alone as the counter's. The extra line shows only in that
 * mixed state. It is always gone before the served door can open (a grace or an unsent dish holds
 * the gate too), so the door opening still moves nothing.
 *
 * `popping` is the door moment's POP (0.96 → 1, 180 ms) on the whole button — the motion language's
 * "a control comes alive" (m10 B8), never the 1.18 numeral `mmsPop`. Reduced motion: the button is
 * simply there. No sound, no haptic, no focus move: nobody is hurried to pay.
 */
export function PayDock({
  line,
  held,
  payKey,
  amount,
  loading,
  busy,
  popping,
  hidden,
  onPay,
  onRefusedPay,
  counter,
}: {
  /** The slot: Pay's held reason, or "Ready to pay." at rest. `my` is null where no Burmese is
   *  shipped (listed for K15 — never invented). */
  line: { en: string; my: string | null };
  /** Pay is held (any reason): `aria-disabled`, described by the slot. */
  held: boolean;
  /** "Pay" (solo) or "Pay the whole order" (a group — the honest caveat). */
  payKey: "pay" | "payWholeOrder";
  /** The ONE total binding, formatted ("$39.23"). */
  amount: string;
  /** create-intent is in flight: "Starting checkout…". */
  loading: boolean;
  /** The tap is being decided (`payBusy`): natively disabled for a second tap, `aria-busy`. */
  busy: boolean;
  popping: boolean;
  /** The promo field has focus: the dock leaves so it never rides the keyboard. */
  hidden: boolean;
  onPay: () => void;
  onRefusedPay: () => void;
  counter: {
    /** The counter's OWN held reason (`counterHoldCopy`, the register's sentence mid-settle), or
     *  null when it is live. `my` is null where no Burmese is shipped. */
    reason: { en: string; my: string | null } | null;
    busy: boolean;
    onClick: () => void;
    /** A blocked tap says the counter's own reason, never nothing. */
    onRefusedTap: (reason: string) => void;
  };
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useCtaDock(ref, !hidden);
  // C3 — the counter's own line, drawn only when it says something the slot does not.
  const counterLine = counter.reason && counter.reason.en !== line.en ? counter.reason : null;
  const counterDescribedBy = counter.reason
    ? counterLine
      ? "pay-counter-line"
      : "pay-line"
    : undefined;
  return (
    <div ref={ref} className="counter-dock pay-dock" hidden={hidden}>
      {/* Static text, never a live region (the view keeps its one). */}
      <p id="pay-line" className="counter-dock-line">
        {line.en}
        {line.my && (
          <span lang="my" className="counter-dock-line-my">
            {line.my}
          </span>
        )}
      </p>
      <button
        type="button"
        className={`checkout-cta counter-dock-door${popping ? " checkout-door-pop" : ""}`}
        aria-disabled={held || undefined}
        aria-describedby={held ? "pay-line" : undefined}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={() => {
          if (held) {
            onRefusedPay();
            return;
          }
          onPay();
        }}
      >
        <span className="counter-dock-door-label">
          <span>{loading ? "Starting checkout…" : `${TX(payKey)} · ${amount}`}</span>
          <span aria-hidden className="checkout-cta-arrow">
            →
          </span>
        </span>
        <span lang="my" className="counter-dock-door-my">
          {t("my", payKey)}
        </span>
      </button>
      {/* Static text, like the slot: the counter's own reason when it is not the slot's. */}
      {counterLine && (
        <p id="pay-counter-line" className="pay-dock-counter-line">
          {counterLine.en}
          {counterLine.my && (
            <span lang="my" className="pay-dock-counter-line-my">
              {counterLine.my}
            </span>
          )}
        </p>
      )}
      <button
        type="button"
        className="pay-dock-counter"
        aria-disabled={counter.reason !== null || undefined}
        aria-describedby={counterDescribedBy}
        aria-busy={counter.busy || undefined}
        onClick={() => {
          if (counter.busy) return;
          if (counter.reason) {
            counter.onRefusedTap(counter.reason.en);
            return;
          }
          counter.onClick();
        }}
      >
        <span>{counter.busy ? "One moment…" : TX("payAtCounter")}</span>
        <span lang="my" className="pay-dock-counter-my">
          {t("my", "payAtCounter")}
        </span>
      </button>
    </div>
  );
}
