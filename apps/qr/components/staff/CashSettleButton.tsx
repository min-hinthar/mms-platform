"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { settleCash } from "@/lib/staff-cart";
import { changeDue } from "@/lib/register-math";
import { Card } from "@mms/ui";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Cash settle ("pay a human", S1.3). Two-step confirm showing the authoritative all-in total
 * (mode-priced lines + tax — W16a retired the service charge; tip is in-hand/off-system → not
 * recorded). The server re-derives and reconciles the amount — this button never sends it. On
 * success the cart flips paid and the live detail re-fetches to the paid state; a refresh nudges
 * it immediately.
 */
export function CashSettleButton({
  sessionId,
  totalCents,
  isTab = false,
  handoff = false,
  onHandoff,
}: {
  sessionId: string;
  totalCents: number;
  /** When this table is running a trust tab (S3.1), the cash settle IS the tab close — re-frame the
   *  copy ("Close tab" / "closes this tab") so the action reads as the deliberate end-of-night close,
   *  not a mid-meal settle. The money path is identical (mms_fulfill_cash_order, server-reconciled). */
  isTab?: boolean;
  /** W6a (register): a counter order's settle ends with a HANDOFF — show the tendered/change helper
   *  in the confirm step and hand the result UP (`onHandoff`), so the parent renders the #CODE card
   *  OUTSIDE the open-cart conditional this button lives in (the review's confirmed HIGH: the detail
   *  refresh unmounts this component seconds after settle). Display-only; the charge stays server-derived. */
  handoff?: boolean;
  onHandoff?: (h: { orderId: string; totalCents: number; changeCents: number | null }) => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tendered, setTendered] = useState("");
  // Cashier arithmetic only — parsed dollars → cents, never sent anywhere.
  const tenderedCents = Math.round(Number.parseFloat(tendered || "0") * 100) || 0;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Move focus into the confirm group when it opens and back to the trigger when it closes, so it's
  // never dropped to <body> as the step unmounts (S1-audit S6). The guard skips first mount.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming && !wasConfirming.current) confirmRef.current?.focus();
    else if (!confirming && wasConfirming.current) triggerRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await settleCash({ sessionId });
    if (!res.ok) {
      setBusy(false);
      setConfirming(false);
      setError(res.error);
      return;
    }
    if (handoff) {
      setBusy(false);
      setConfirming(false);
      // The AUTHORITATIVE total the settle returned (the prop can be a poll interval stale), and the
      // change computed against it. The parent owns the card — this component unmounts with the cart.
      onHandoff?.({
        orderId: res.orderId,
        totalCents: res.totalCents,
        changeCents: tenderedCents > 0 ? changeDue(res.totalCents, tenderedCents) : null,
      });
    }
    router.refresh(); // the realtime re-fetch also fires; this makes the paid state immediate
  }

  return (
    <div>
      {confirming ? (
        <Card
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-label="Confirm cash settlement"
          style={{ ...confirmCard, outline: "none" }}
        >
          <p style={{ margin: 0, fontSize: "var(--fs-sm)" }}>
            Take <strong>{fmt(totalCents)}</strong> in cash?{" "}
            {isTab ? "This closes the tab." : "This closes the order."}
          </p>
          {handoff && (
            <div style={{ display: "grid", gap: 4 }}>
              <label htmlFor="cash-tendered" style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>
                Cash tendered (optional)
              </label>
              <input
                id="cash-tendered"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 40"
                value={tendered}
                onChange={(e) => setTendered(e.target.value.replace(/[^0-9.]/g, ""))}
                style={tenderInput}
              />
              <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)", minHeight: 18 }}>
                {tenderedCents > 0
                  ? tenderedCents >= totalCents
                    ? `Change: ${fmt(changeDue(totalCents, tenderedCents))}`
                    : "Not enough yet."
                  : ""}
              </p>
            </div>
          )}
          <div style={{ display: "flex", gap: "var(--s3)" }}>
            <button
              className="staff-btn"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              style={cancelBtn}
            >
              Cancel
            </button>
            <button
              className="staff-btn"
              type="button"
              onClick={confirm}
              disabled={busy}
              style={payBtn}
            >
              {busy ? "Settling…" : `Settle ${fmt(totalCents)}`}
            </button>
          </div>
        </Card>
      ) : (
        <button
          className="staff-btn"
          ref={triggerRef}
          type="button"
          onClick={() => setConfirming(true)}
          aria-describedby="settle-hint"
          style={{ ...payBtn, width: "100%" }}
        >
          {isTab ? "Close tab · cash" : "Settle in cash"} · {fmt(totalCents)}
        </button>
      )}
      {/* Static helper text (a description, not a status) — linked to the button, never a live region.
          The detail view's one polite live region is the line-edit status in FloorDetailLive; a settle
          FAILURE is an assertive role="alert" instead (different concern, mutually exclusive action). */}
      <p id="settle-hint" style={hint}>
        Includes sales tax. A cash tip is handled separately.
      </p>
      {error && (
        <p role="alert" style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

const payBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 20px",
  borderRadius: "var(--r-full)",
  border: "1px solid transparent",
  background: "var(--ac)",
  color: "var(--oa)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  cursor: "pointer",
};
const cancelBtn: CSSProperties = {
  minHeight: 48,
  padding: "0 20px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
  fontWeight: 600,
  cursor: "pointer",
};
// Surface (bg/border/radius/shadow) comes from the shared `.card` via <Card>; this is layout only.
const confirmCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--s4)",
  padding: "var(--s4)",
};
const tenderInput: CSSProperties = {
  minHeight: 48,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
};
const hint: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
  minHeight: 16,
};
