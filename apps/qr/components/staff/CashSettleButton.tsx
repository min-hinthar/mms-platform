"use client";
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { settleCash } from "@/lib/staff-cart";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Cash settle ("pay a human", S1.3). Two-step confirm showing the authoritative all-in total (incl. the
 * SB-1524 service charge; tip is in-hand/off-system → not recorded). The server re-derives and reconciles
 * the amount — this button never sends it. On success the cart flips paid and the live detail re-fetches
 * to the paid state; a refresh nudges it immediately.
 */
export function CashSettleButton({
  sessionId,
  totalCents,
}: {
  sessionId: string;
  totalCents: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    router.refresh(); // the realtime re-fetch also fires; this makes the paid state immediate
  }

  return (
    <div>
      {confirming ? (
        <div role="group" aria-label="Confirm cash settlement" style={confirmCard}>
          <p style={{ margin: 0, fontSize: 14 }}>
            Take <strong>{fmt(totalCents)}</strong> in cash? This closes the order.
          </p>
          <div style={{ display: "flex", gap: "var(--s3)" }}>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              style={cancelBtn}
            >
              Cancel
            </button>
            <button type="button" onClick={confirm} disabled={busy} style={payBtn}>
              {busy ? "Settling…" : `Settle ${fmt(totalCents)}`}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-describedby="settle-hint"
          style={{ ...payBtn, width: "100%" }}
        >
          Settle in cash · {fmt(totalCents)}
        </button>
      )}
      {/* Static helper text (a description, not a status) — linked to the button, never a live region.
          The detail view's one polite live region is the line-edit status in FloorDetailLive; a settle
          FAILURE is an assertive role="alert" instead (different concern, mutually exclusive action). */}
      <p id="settle-hint" style={hint}>
        Includes the 5% service charge. A cash tip is handled separately.
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
  fontSize: 15,
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
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};
const confirmCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--s4)",
  padding: "var(--s4)",
  borderRadius: "var(--r-card)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
};
const hint: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 12.5,
  color: "var(--t3)",
  minHeight: 16,
};
