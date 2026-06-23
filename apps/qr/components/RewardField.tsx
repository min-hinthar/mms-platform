"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { applyReward, clearReward, type ApplyRewardReason } from "@/lib/cart";
import { getMyRewardCoupons, type RewardCoupon } from "@/lib/rewards";

const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;

// Per-reason copy (honest + on-brand) — the action returns a reason; never a fabricated state.
const REASON: Record<ApplyRewardReason, string> = {
  invalid: "That reward isn’t available.",
  min_not_met: "Add a little more to your order to use this reward.",
  in_use: "That reward is already on another order.",
  busy: "The order’s being paid — you can’t change it right now.",
  cart_closed: "This order is already being paid.",
  error: "Couldn’t apply that reward — please try again.",
};

/**
 * Redeem a Morning Star reward at checkout (M4 P4.2). Lists the diner's active coupons and applies one to
 * the cart; the discount then rides the server-authoritative totals (getCartTotals → mms_reward_discount).
 * Renders nothing when the diner has no coupons. The amount shown is the server's (appliedRewardCents from
 * totals.rewardCents) — never a client guess.
 */
export function RewardField({
  cartId,
  appliedRewardCents,
  onChanged,
}: {
  cartId: string;
  appliedRewardCents: number;
  onChanged: () => void;
}) {
  const [coupons, setCoupons] = useState<RewardCoupon[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getMyRewardCoupons()
      .then(setCoupons)
      .catch(() => {
        /* a coupon-fetch failure just hides the affordance — never blocks checkout */
      });
  }, []);

  const applied = appliedRewardCents > 0;

  async function apply(code: string) {
    setBusy(true);
    setError(null);
    const res = await applyReward(cartId, code);
    setBusy(false);
    if (!res.ok) {
      setError(REASON[res.reason]);
      return;
    }
    setOpen(false);
    onChanged();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    await clearReward(cartId);
    setBusy(false);
    onChanged();
  }

  if (applied) {
    return (
      <div style={appliedRow}>
        <span style={{ fontSize: 14, color: "var(--tx)" }}>
          <span aria-hidden>🎁 </span>Reward applied ·{" "}
          <strong>−{dollars(appliedRewardCents)}</strong>
        </span>
        <button type="button" onClick={remove} disabled={busy} style={linkBtn}>
          {busy ? "…" : "Remove"}
        </button>
      </div>
    );
  }
  if (coupons.length === 0) return null; // no rewards to redeem → no affordance

  return (
    <div style={{ marginTop: 10 }}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} style={applyBtn}>
          <span aria-hidden>🎁 </span>Use a reward ({coupons.length})
        </button>
      ) : (
        <div style={panel}>
          <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--t2)" }}>
            Tap a reward to apply it to this order:
          </p>
          <ul
            role="list"
            style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}
          >
            {coupons.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => apply(c.code)}
                  disabled={busy}
                  style={couponBtn}
                >
                  <span style={{ fontWeight: 800 }}>{dollars(c.amountCents)} off</span>
                  <span style={{ fontSize: 11.5, color: "var(--t2)" }}>
                    expires {new Date(c.expiresAt).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            style={linkBtn}
          >
            Cancel
          </button>
        </div>
      )}
      <p role="status" aria-live="polite" aria-atomic="true" style={errLine}>
        {error}
      </p>
    </div>
  );
}

const appliedRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  minHeight: 44,
  marginTop: 10,
};
const applyBtn: CSSProperties = {
  width: "100%",
  minHeight: 44,
  borderRadius: 12,
  border: "1px dashed var(--ac)",
  background: "color-mix(in srgb, var(--ac) 6%, transparent)",
  color: "var(--ac)",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};
const panel: CSSProperties = {
  padding: "var(--s4)",
  borderRadius: 12,
  border: "1px solid var(--bd)",
  background: "var(--cd)",
};
const couponBtn: CSSProperties = {
  width: "100%",
  minHeight: 48,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid var(--bd)",
  background: "var(--bg)",
  color: "var(--tx)",
  cursor: "pointer",
};
const linkBtn: CSSProperties = {
  minHeight: 44,
  padding: "0 4px",
  border: "none",
  background: "transparent",
  color: "var(--t2)",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};
const errLine: CSSProperties = {
  minHeight: 16,
  margin: "6px 0 0",
  fontSize: 12.5,
  color: "var(--warn)",
};
