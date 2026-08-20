"use client";
import { useState, useTransition, type CSSProperties } from "react";
import { Sheet } from "@mms/ui";
import { refundLine, type StaffOrderLine } from "@/lib/refunds";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";

const REASONS: [value: string, label: string][] = [
  ["unhappy", "Not happy with it"],
  ["wrong_item", "Wrong item"],
  // W23a — the reason the owner's question was really about. Before this, an out-of-stock refund
  // landed in "other" and was invisible in the data, so nobody could say how often it happened. It
  // is listed HIGH because if it is ever common it is the one refund reason with a cheap structural
  // fix (86 the dish and the next order never happens).
  ["sold_out", "We ran out"],
  ["too_slow", "Took too long"],
  ["duplicate", "Duplicate charge"],
  ["other", "Other"],
];

/**
 * Refund step-up sheet (S4.3b) — money-OUT confirmation for ONE paid line. Reason (audit) + the manager's
 * own PIN (re-auth at action time; lockout-counted server-side). The amount shown is a display echo; the
 * server (mms_refund_authorize) re-derives the authoritative amount + PI. One live region for the error.
 */
export function RefundActionSheet({
  line,
  orderLabel,
  onClose,
  onDone,
}: {
  line: StaffOrderLine;
  orderLabel: string;
  onClose: () => void;
  /** Called on success/no-op. The amount (cents) is passed on a real refund so the board can confirm the
   *  ACTUAL figure (the over-refund cap may clamp it below the displayed estimate); omitted on a no-op. */
  onDone: (refundedCents?: number) => void;
}) {
  const [reason, setReason] = useState<string>("unhappy");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The server-derived refundable amount (discounted goods + the line's share of order tax) — computed in
  // getStaffOrders to mirror mms_refund_authorize, so the figure shown IS what the server will refund.
  const amount = line.refundableCents / 100;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await refundLine({ orderItemId: line.id, reason, pin });
        if (res.ok) {
          onDone(res.amountCents); // the SERVER-authorized amount (may be clamped below the estimate)
          return;
        }
        switch (res.reason) {
          case "pin_wrong":
            setError(
              `Wrong PIN — ${res.attemptsRemaining} ${res.attemptsRemaining === 1 ? "try" : "tries"} left.`,
            );
            break;
          case "pin_locked":
            setError("Too many tries — locked for a few minutes.");
            break;
          case "pin_no_pin":
            setError("You don’t have a PIN set. Set one in your profile first.");
            break;
          case "already_refunded":
            // It's already refunded — refresh the board (the line will show "Refunded") + close. No dead
            // error text (the sheet unmounts on onDone, so a message here would never be seen).
            onDone();
            break;
          case "fully_refunded":
            // The order's refundable pool (goods + tax) is exhausted by prior refunds — nothing left to
            // give back on this line. Refresh + close; the board reflects the order's refunded state.
            onDone();
            break;
          case "not_paid":
            setError("That order isn’t in a refundable state.");
            break;
          case "split_unsupported":
            setError("Split-tender orders refund via the Stripe dashboard.");
            break;
          case "stripe_error":
            setError("The refund didn’t go through at the card processor — try again.");
            break;
          case "not_manager":
            setError("Manager access is required to refund.");
            break;
          case "outage":
            // W10b — no money moved; the platform is unreachable, not a verdict about the manager.
            setError(STAFF_WRITE_OUTAGE);
            break;
          default:
            setError("Couldn’t refund that line — try again.");
        }
      } catch {
        setError("Couldn’t refund that line — try again.");
      }
    });
  };

  return (
    // W22c — the canonical `Sheet` migration this file's own `overlay` comment has been asking for
    // since P1-5. The hand-roll carried FOUR real defects, and one migration closes all four:
    //
    //   1. `aria-modal="true"` with NO focus trap. The attribute PROMISES assistive tech that the
    //      rest of the page is inert; the rationale in the deleted comment ("a full focus trap is
    //      overkill for a 4-control sheet") argued the trap was unnecessary while leaving the claim
    //      that it existed. A screen-reader user could tab straight out into the board behind and be
    //      told nothing had changed. Radix traps.
    //   2. Escape was bound with `onKeyDown` on the overlay `<div>`, which is not focusable — so it
    //      worked only while a control inside happened to have focus and the event bubbled. Given
    //      defect 1, focus really could leave, and Esc died the moment it did. Radix binds Esc to
    //      the document.
    //   3. `onClick={onClose}` on the overlay plus `stopPropagation` on the card dismissed the sheet
    //      on any click whose common ancestor was the overlay — including a text-selection DRAG that
    //      started inside the PIN field and released on the scrim. A manager mid-PIN losing the
    //      refund to a slipped finger. Radix's `onPointerDownOutside` is the correct shape and is
    //      what the primitive uses.
    //   4. No `--kb-inset`. The sheet is bottom-anchored, the PIN is a `type="password"` field and
    //      the Refund button sits in the row BELOW it — so on a phone the keyboard covered the one
    //      control the sheet exists to reach. The primitive publishes the VisualViewport inset and
    //      `.mms-sheet` lifts above the keyboard.
    //
    // Swipe-to-close comes with it and is safe here: the gesture CANCELS, and a cancelled refund
    // costs a re-open. Nothing destructive is one gesture away — the money still needs the PIN.
    //
    // ⚠️ BUT NOT WHILE THE REFUND IS IN FLIGHT. `Cancel` has always carried `disabled={pending}`,
    // and the migration adds three exits that did not exist before — document-level Esc, the sticky
    // ✕, and the handle drag — so without `!pending` they would contradict the intent that button
    // already encodes. The cost is not a lost gesture: the caller unmounts this component on close,
    // so a dismissal mid-flight drops the server's answer on the floor. `setError` would no-op on an
    // unmounted tree and `onDone` would never run, leaving the board un-refreshed and the manager
    // with no confirmation and no error — a state indistinguishable from a refund that never
    // happened, over money that may already have left the card.
    <Sheet
      open
      onOpenChange={(next) => !next && !pending && onClose()}
      title={`Refund ${line.name}`}
    >
      <div style={body}>
        <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
          {orderLabel} · {line.qty}× {line.name}
        </p>
        <p
          style={{
            margin: "8px 0 0",
            fontWeight: 800,
            fontSize: "var(--fs-h2)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          Refund ${amount.toFixed(2)}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: "var(--fs-sm)", color: "var(--t3)" }}>
          Price + tax, back to the card. Tips — and the service charge on older orders — aren’t
          included.
        </p>

        <label style={lbl} htmlFor="refund-reason">
          Reason
        </label>
        <select
          id="refund-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={field}
        >
          {REASONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>

        <label style={lbl} htmlFor="refund-pin">
          Your manager PIN
        </label>
        <input
          id="refund-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          style={field}
          placeholder="••••"
        />

        {/* One live region for the sheet's error (polite — the failure text changes so AT announces it). */}
        <p
          role="status"
          style={{
            minHeight: 18,
            margin: "8px 0 0",
            fontSize: "var(--fs-sm)",
            color: "var(--warn)",
          }}
        >
          {error}
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            className="staff-btn"
            type="button"
            onClick={onClose}
            disabled={pending}
            style={secondaryBtn}
          >
            Cancel
          </button>
          <button
            className="staff-btn"
            type="button"
            onClick={submit}
            disabled={pending || pin.length < 4}
            style={primaryBtn}
          >
            {pending ? "Refunding…" : `Refund $${amount.toFixed(2)}`}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// The primitive owns the scrim, the fixed positioning, the z layer, the safe-area padding and the
// dvh/keyboard discipline — all of which this file used to restate. What is left is the body inset.
const body: CSSProperties = { padding: "0 18px 18px" };
const lbl: CSSProperties = {
  display: "block",
  margin: "14px 0 4px",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  color: "var(--t2)",
};
const field: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
};
const primaryBtn: CSSProperties = {
  flex: 1,
  minHeight: 44,
  borderRadius: 10,
  border: "none",
  background: "var(--ac)",
  color: "var(--oa)",
  fontWeight: 700,
  cursor: "pointer",
};
const secondaryBtn: CSSProperties = {
  flex: "none",
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 10,
  border: "1px solid var(--bd)",
  background: "transparent",
  color: "var(--tx)",
  fontWeight: 700,
  cursor: "pointer",
};
