"use client";
import { useState, useTransition, type CSSProperties } from "react";
import { refundLine, type StaffOrderLine } from "@/lib/refunds";

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
  onDone: () => void;
}) {
  const [reason, setReason] = useState<string>("unhappy");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const amount = (line.unitPriceCents * line.qty + line.taxCents) / 100;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await refundLine({ orderItemId: line.id, reason, pin });
        if (res.ok) {
          onDone();
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
            setError("That line was already refunded.");
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
    >
      <div className="card" style={sheet} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Refund a line</h2>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--t2)" }}>
          {orderLabel} · {line.qty}× {line.name}
        </p>
        <p
          style={{
            margin: "8px 0 0",
            fontWeight: 800,
            fontSize: 20,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          Refund ${amount.toFixed(2)}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--t3)" }}>
          Price + tax, back to the card. Service charge &amp; tip aren’t included.
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
          aria-live="polite"
          style={{ minHeight: 18, margin: "8px 0 0", fontSize: 13, color: "var(--warn)" }}
        >
          {error}
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="button" onClick={onClose} disabled={pending} style={secondaryBtn}>
            Cancel
          </button>
          <button
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
  background: "rgba(0,0,0,0.45)",
  display: "grid",
  placeItems: "end center",
  padding: 16,
  zIndex: 50,
};
const sheet: CSSProperties = { width: "100%", maxWidth: 440, padding: 18 };
const lbl: CSSProperties = {
  display: "block",
  margin: "14px 0 4px",
  fontSize: 12,
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
  fontSize: 15,
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
