"use client";
import { useState, useTransition, type CSSProperties } from "react";
import { staffSetQty } from "@/lib/staff-cart";
import type { TableLineView } from "@/lib/floor-types";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * One editable cart line on the staff drill-down (S1.3) — qty steppers (− / +) and a remove at qty 1.
 * Staff have authority over any line (no canMutateLine restriction). The server is authoritative: this
 * calls staffSetQty and lets the live re-fetch (FloorDetailLive) update the displayed qty; the controls
 * disable while the call is in flight so a double-tap can't race. `disabled` (mid-payment / no open
 * cart) greys the whole row.
 */
export function StaffLineEditor({
  sessionId,
  line,
  disabled,
  onError,
}: {
  sessionId: string;
  line: TableLineView;
  disabled: boolean;
  onError: (msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [optimisticQty, setOptimisticQty] = useState<number | null>(null);
  const [seenServerQty, setSeenServerQty] = useState(line.qty);

  // When the server (the live re-fetch) reports a new qty for this line, drop any optimistic value —
  // both when it catches up to ours AND when another actor (a diner / second server) changes the line,
  // so we never mask the server truth. React's guarded set-state-DURING-render pattern, not an effect
  // (the guard makes it converge in one extra render, and avoids the cascading-effect lint).
  if (line.qty !== seenServerQty) {
    setSeenServerQty(line.qty);
    setOptimisticQty(null);
  }
  const qty = optimisticQty ?? line.qty;
  const busy = pending || disabled;

  function setQty(next: number) {
    setOptimisticQty(next); // immediate feedback; the live re-fetch reconciles to the server truth
    startTransition(async () => {
      const res = await staffSetQty(sessionId, { cartItemId: line.id, qty: next });
      if (!res.ok) {
        setOptimisticQty(null); // roll back to the last server value
        onError(res.error);
      }
    });
  }

  const removing = qty <= 1;
  return (
    <li style={{ ...row, opacity: disabled ? 0.55 : 1 }}>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ fontWeight: 600 }}>{qty}×</span> {line.name}
        {line.bySeatName && (
          <span style={{ color: "var(--t3)", fontSize: 12 }}> · {line.bySeatName}</span>
        )}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            minWidth: 56,
            textAlign: "right",
          }}
        >
          {fmt(line.unitPriceCents * qty)}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            onClick={() => setQty(qty - 1)}
            disabled={busy}
            aria-label={removing ? `Remove ${line.name}` : `Decrease ${line.name} quantity`}
            style={{ ...step, color: removing ? "var(--warn)" : "var(--tx)" }}
          >
            {removing ? "✕" : "−"}
          </button>
          <button
            type="button"
            onClick={() => setQty(qty + 1)}
            disabled={busy || qty >= 99}
            aria-label={`Increase ${line.name} quantity`}
            style={step}
          >
            +
          </button>
        </span>
      </span>
    </li>
  );
}

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s3)",
  padding: "8px 0",
  borderTop: "1px solid var(--bd)",
  fontSize: 14,
};
const step: CSSProperties = {
  width: 44,
  height: 44,
  minWidth: 44,
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  fontSize: 18,
  fontWeight: 700,
  lineHeight: 1,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
