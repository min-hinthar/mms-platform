"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { closeSecureTab } from "@/lib/staff-cart";
import { Card } from "@mms/ui";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Close a SECURE tab off-session (S3.2) — charge the card on file for the final total. Two-step confirm
 * (parity with CashSettleButton); the server (closeSecureTab) re-derives the amount + holds the settle
 * mutex, mints the off_session PI, and the webhook fulfills. A decline surfaces here as an honest
 * "settle by cash or a fresh card" — the tab is never stranded paid. No tip is added off-session.
 */
export function CloseSecureTabButton({
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Move focus into the confirm group when it opens and back to the trigger when it closes (parity with
  // CashSettleButton, S1-audit S6). The guard skips first mount.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming && !wasConfirming.current) confirmRef.current?.focus();
    else if (!confirming && wasConfirming.current) triggerRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await closeSecureTab({ sessionId });
    if (!res.ok) {
      setBusy(false);
      setConfirming(false);
      setError(res.error);
      return;
    }
    router.refresh(); // the off-session charge fulfills via webhook; the live detail re-fetches to paid
  }

  return (
    <div>
      {confirming ? (
        <Card
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-label="Confirm charging the card on file"
          style={{ ...confirmCard, outline: "none" }}
        >
          <p style={{ margin: 0, fontSize: "var(--fs-sm)" }}>
            Charge the card on file <strong>{fmt(totalCents)}</strong>? This closes the tab.
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
              {busy ? "Charging…" : `Charge ${fmt(totalCents)}`}
            </button>
          </div>
        </Card>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setConfirming(true)}
          aria-describedby="secure-close-hint"
          style={{ ...payBtn, width: "100%" }}
        >
          Close tab · card on file · {fmt(totalCents)}
        </button>
      )}
      <p id="secure-close-hint" style={hint}>
        Charges the saved card for the final total. No tip is added — a tip stays cash or in person.
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
// Surface (bg/border/radius/shadow) comes from `.card` via <Card>; this is layout only.
const confirmCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--s4)",
  padding: "var(--s4)",
};
const hint: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
  minHeight: 16,
};
