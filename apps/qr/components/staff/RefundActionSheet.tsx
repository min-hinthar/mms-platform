"use client";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { refundLine, type StaffOrderLine } from "@/lib/refunds";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";

const REASONS: [value: string, label: string][] = [
  ["unhappy", "Not happy with it"],
  ["wrong_item", "Wrong item"],
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

  // Money-out modal: move focus into the dialog on open + restore it to the trigger on close (WCAG 2.4.3 /
  // QA §A). Escape closes. (A full focus trap is overkill for a 4-control sheet; focus-in + restore covers
  // the keyboard/SR concern.)
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("select, input, button")?.focus();
    return () => prev?.focus?.();
  }, []);

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
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Refund ${line.name}`}
      style={overlay}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div ref={dialogRef} className="card" style={sheet} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0, fontSize: "var(--fs-h3)" }}>Refund a line</h2>
        <p style={{ margin: "4px 0 0", fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
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
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--scrim)", // the real token (both themes) — the old rgba fallback was the only consumer
  display: "grid",
  placeItems: "end center",
  // clear the iOS home-bar inset so the bottom-anchored sheet isn't obscured by it
  padding: "16px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
  // scrim+sheet in ONE fixed overlay → the sheet layer of the token scale (canonical Sheet migration is P1-5)
  zIndex: "var(--z-sheet)" as CSSProperties["zIndex"],
};
const sheet: CSSProperties = {
  width: "100%",
  maxWidth: 440,
  padding: 18,
  // match the .mms-sheet dvh discipline so a tall sheet scrolls rather than overflowing the viewport
  maxHeight: "var(--sheet-max-h)",
  overflowY: "auto",
};
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
