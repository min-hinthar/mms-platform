"use client";
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { clearTable } from "@/lib/floor";

/**
 * Clear a table on turnover (S1.2). Two-step confirm (no accidental clear), and DISABLED with an honest
 * reason while a payment is in flight — the server refuses it regardless (the button gating is just the
 * affordance). On success the session is closed; we leave the now-defunct detail page for the floor.
 */
export function ClearTableButton({
  sessionId,
  label,
  paymentInFlight,
}: {
  sessionId: string;
  label: string;
  paymentInFlight: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await clearTable({ sessionId });
    if (!res.ok) {
      setBusy(false);
      setConfirming(false);
      setError(res.error);
      return;
    }
    // Session closed — return to the floor (this detail is now defunct).
    router.replace("/staff");
    router.refresh();
  }

  if (paymentInFlight) {
    return (
      <div>
        <button type="button" disabled style={{ ...clearBtn, opacity: 0.5, cursor: "not-allowed" }}>
          Clear table
        </button>
        <p style={hint}>Can’t clear while this table is mid-payment.</p>
      </div>
    );
  }

  return (
    <div>
      {confirming ? (
        <div role="group" aria-label={`Confirm clearing table ${label}`} style={confirmRow}>
          <span style={{ fontSize: 14 }}>Clear table {label}?</span>
          <div style={{ display: "flex", gap: "var(--s3)" }}>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              style={cancelBtn}
            >
              Cancel
            </button>
            <button type="button" onClick={confirm} disabled={busy} style={clearBtn}>
              {busy ? "Clearing…" : "Confirm"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} style={clearBtn}>
          Clear table
        </button>
      )}
      <p role="status" aria-live="polite" style={{ ...hint, minHeight: error ? 18 : 0 }}>
        {error && <span style={{ color: "var(--warn)" }}>{error}</span>}
      </p>
    </div>
  );
}

const clearBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--warn)",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
const cancelBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
const confirmRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s4)",
  flexWrap: "wrap",
};
const hint: CSSProperties = { margin: "8px 0 0", fontSize: 12.5, color: "var(--t3)" };
