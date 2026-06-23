"use client";
import { useState, useTransition, type CSSProperties } from "react";
import { staffSetQty } from "@/lib/staff-cart";
import { STAFF_STATE_COPY } from "@/lib/line-state-copy";
import type { TableLineView } from "@/lib/floor-types";
import { LossActionSheet } from "./LossActionSheet";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * One cart line on the staff drill-down. The control depends on the line's kitchen state (S2.1/S2.3):
 *   • 'draft'  → qty steppers (− / +); staff edit freely (no canMutateLine restriction).
 *   • fired / in_progress / served → POST-fire: a silent qty change would desync the kitchen + skip the
 *     loss audit, so the only edit is **Void / Comp** (loss-gated, manager-PIN when cooked — S2.3).
 *   • 'voided' → terminal, shown muted with no controls. 'comped' → shown as a free line, no controls.
 * The server is authoritative; the live re-fetch (FloorDetailLive) reconciles the displayed state.
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
  const [sheetOpen, setSheetOpen] = useState(false);

  // When the server (the live re-fetch) reports a new qty, drop any optimistic value — both when it
  // catches up to ours AND when another actor changes the line. React's guarded set-during-render pattern.
  if (line.qty !== seenServerQty) {
    setSeenServerQty(line.qty);
    setOptimisticQty(null);
  }
  const qty = optimisticQty ?? line.qty;
  const busy = pending || disabled;

  function setQty(next: number) {
    setOptimisticQty(next);
    startTransition(async () => {
      try {
        const res = await staffSetQty(sessionId, { cartItemId: line.id, qty: next });
        if (!res.ok) {
          setOptimisticQty(null); // roll back to the last server value
          onError(res.error);
        }
      } catch {
        // S2-audit B3: an unexpected throw (network/redacted server error) must not strand the optimistic
        // qty silently — roll back + surface honest copy through the shared region.
        setOptimisticQty(null);
        onError("Couldn’t update that — check the connection and try again.");
      }
    });
  }

  // ── Terminal / settled-as-free states: a muted row, no controls ──────────────────────────────────────
  if (line.state === "voided") {
    return (
      <li style={{ ...row, opacity: 0.55 }}>
        <span style={{ minWidth: 0, flex: 1, textDecoration: "line-through" }}>
          {line.qty}× {line.name}
        </span>
        <span style={badge}>Voided</span>
      </li>
    );
  }
  if (line.comped) {
    return (
      <li style={row}>
        <span style={{ minWidth: 0, flex: 1 }}>
          {line.qty}× {line.name}
          {line.bySeatName && (
            <span style={{ color: "var(--t3)", fontSize: 12 }}> · {line.bySeatName}</span>
          )}
        </span>
        <span style={{ ...badge, color: "var(--ac-strong)" }}>Comped · free</span>
      </li>
    );
  }

  // ── Post-fire (fired / in_progress / served): Void / Comp instead of a silent stepper ────────────────
  const postFire = line.state !== "draft";
  if (postFire) {
    const stateLabel = STAFF_STATE_COPY[line.state]; // S12: one shared vocabulary
    return (
      <li style={row}>
        <span style={{ minWidth: 0, flex: 1 }}>
          {line.qty}× {line.name}
          <span style={{ color: "var(--t3)", fontSize: 12 }}> · {stateLabel}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
          <span style={priceCell}>{fmt(line.unitPriceCents * line.qty)}</span>
          {line.pendingApproval ? (
            // S2.4: a void/comp request is open for this line — a manager resolves it from the queue; don't
            // offer a second request.
            <span style={badge} aria-label={`Approval requested for ${line.name}`}>
              Approval requested
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              disabled={disabled}
              aria-label={`Void or comp ${line.name}`}
              style={{ ...lossBtn, opacity: disabled ? 0.5 : 1 }}
            >
              Void / Comp
            </button>
          )}
        </span>
        {/* Mounted only while open so each open is a fresh sheet (resets reason/PIN, refetches managers)
            without a setState-in-effect reset. */}
        {sheetOpen && !line.pendingApproval && (
          <LossActionSheet
            open
            onOpenChange={setSheetOpen}
            sessionId={sessionId}
            line={line}
            onDone={() => setSheetOpen(false)}
          />
        )}
      </li>
    );
  }

  // ── Draft: the qty stepper (unchanged) ───────────────────────────────────────────────────────────────
  const removing = qty <= 1;
  return (
    <li style={row}>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ fontWeight: 600 }}>{qty}×</span> {line.name}
        {line.soldOut && (
          <span style={{ color: "var(--t3)", fontSize: 12, fontWeight: 400 }}> · Sold out</span>
        )}
        {line.bySeatName && (
          <span style={{ color: "var(--t3)", fontSize: 12 }}> · {line.bySeatName}</span>
        )}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
        <span style={priceCell}>{fmt(line.unitPriceCents * qty)}</span>
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
            disabled={busy || qty >= 99 || line.soldOut}
            aria-label={
              line.soldOut
                ? `${line.name} is sold out — can’t add more`
                : `Increase ${line.name} quantity`
            }
            style={{ ...step, ...(line.soldOut ? { opacity: 0.4, cursor: "not-allowed" } : null) }}
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
const priceCell: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  minWidth: 56,
  textAlign: "right",
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
const lossBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 14px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--warn)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const badge: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--t2)",
  whiteSpace: "nowrap",
};
