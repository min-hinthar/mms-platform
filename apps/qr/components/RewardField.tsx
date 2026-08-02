"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@mms/ui";
import { applyReward, clearReward, type ApplyRewardReason } from "@/lib/cart";
import { getMyRewardCoupons, type RewardCoupon } from "@/lib/rewards";
import { failureCopy, useConnectionTruth } from "@/lib/useConnectionTruth";

const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;

// Per-reason copy (honest + on-brand) — the action returns a reason; never a fabricated state.
const REASON: Record<ApplyRewardReason, string> = {
  invalid: "That reward isn’t available.",
  min_not_met: "Add a little more to your order to use this reward.",
  in_use: "That reward is already on another order.",
  busy: "The order’s being paid — you can’t change it right now.",
  cart_closed: "This order is already being paid.",
  rate_limited: "Too many tries — wait a minute, then try again.",
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
  // W10c — attribution for the two catches below, diagnosed on failure and never asserted (the same
  // one-probe truth layer the checkout promo field uses). The catches AWAIT `diagnose()` for the
  // verdict rather than reading the hook's `truth` state, which lags the probe by a render.
  const { diagnose } = useConnectionTruth();

  useEffect(() => {
    void getMyRewardCoupons()
      .then(setCoupons)
      .catch(() => {
        /* a coupon-fetch failure just hides the affordance — never blocks checkout */
      });
  }, []);

  const applied = appliedRewardCents > 0;

  // Focus handoff (WCAG 2.4.3): an apply unmounts the tapped coupon button (panel → applied row) and a
  // remove unmounts the Remove button (applied row → "Use a reward"). Move focus to the control that
  // replaces it — but ONLY after an action on THIS device (`acted`), so a peer's realtime change or the
  // initial render never steals focus.
  const removeBtnRef = useRef<HTMLButtonElement>(null);
  const useBtnRef = useRef<HTMLButtonElement>(null);
  const acted = useRef(false);
  const refocusOnIdle = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!acted.current) return;
    acted.current = false;
    // The branch just swapped, so anything the failure path captured is detached — drop it rather
    // than let the effect below focus a node that is no longer in the document (pre-merge review).
    refocusOnIdle.current = null;
    (applied ? removeBtnRef.current : useBtnRef.current)?.focus({ preventScroll: true });
  }, [applied]);

  // ⚠️ Pre-PR review — focus restore on FAILURE. `setBusy(true)` disables the control the diner just
  // tapped, and a browser blurs a focused element the moment it is disabled — so every failed apply
  // or remove silently parked a keyboard/SR user at <body>, on the money step. The success paths hand
  // off via `acted`; this covers the paths that stay put. It has to run AFTER the busy=false commit,
  // or the button is still disabled and `.focus()` is a no-op.
  useEffect(() => {
    if (busy || !refocusOnIdle.current) return;
    const el = refocusOnIdle.current;
    refocusOnIdle.current = null;
    el.focus({ preventScroll: true });
  }, [busy]);

  // W10c — both actions THROW under an outage: `applyReward`/`clearReward` run `assertCartMember`
  // first, which rejects before any discriminated `reason` can exist, so the reason table above is
  // unreachable on that path. Without a catch, `setBusy(false)` never ran and `busy` latched TRUE —
  // every coupon button (or the Remove button, stuck on "…") disabled forever, with no error text
  // and an unhandled rejection in the console. Dead controls on the money path, recoverable only by
  // a full reload. `finally` is what makes that impossible; the copy says whose fault it is.
  async function apply(code: string, tapped: HTMLButtonElement | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await applyReward(cartId, code);
      if (!res.ok) {
        refocusOnIdle.current = tapped;
        setError(REASON[res.reason]);
        return;
      }
      setOpen(false);
      acted.current = true; // hand focus to the Remove button once the applied row mounts
      onChanged();
    } catch {
      // ⚠️ Pre-PR review — AWAIT the probe. `truth` is this hook's own state and only its own
      // `diagnose()` writes it, so composing the string from it here always read the initial
      // "unknown": every FIRST failure rendered the neutral sentence, and the "it's not your
      // connection" / "you look offline" copy was effectively dead. `diagnose()` returns the verdict.
      const t = await diagnose();
      // And don't over-claim: a throw is not proof the write didn't land (a response lost after a
      // committed mutation is the canonical case). Point at the server-authoritative total instead.
      setError(`${failureCopy(t, "apply that reward")} Nothing’s charged — check the total below.`);
      // Arm BOTH handoffs, because we don't yet know which one applies: `refocusOnIdle` for the
      // ordinary case (the write didn't land, the panel stays put), and `acted` for the case the
      // re-read below reveals it DID land — which swaps the branch and detaches `tapped` (pre-merge
      // review: focusing a detached node is a silent no-op, so that path dropped to <body> again).
      refocusOnIdle.current = tapped;
      acted.current = true;
      onChanged(); // re-read: if it DID land, the screen corrects itself
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await clearReward(cartId);
      acted.current = true; // hand focus back to "Use a reward" once it remounts
      onChanged();
    } catch {
      const t = await diagnose();
      setError(`${failureCopy(t, "remove that reward")} The total below is the one that counts.`);
      refocusOnIdle.current = removeBtnRef.current;
      acted.current = true; // same both-handoffs reasoning as apply()
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (applied) {
    return (
      // Warm gold-wash pill + a one-sweep shimmer on mount — a small delight when a reward lands. The
      // content rides above the ::after shimmer on its own z-layer. W10c — the applied branch carries
      // its OWN error line: a failed Remove used to set a message into a paragraph this branch never
      // rendered, so the button just went quiet. The two RewardField branches are exclusive, so this
      // adds no second region of its own. (Pre-PR review: the review STEP still owns a `role="status"`
      // of its own in Checkout.tsx — a pre-existing second polite region on that view, logged as an
      // OPEN-ITEM rather than papered over with a comment claiming otherwise.)
      <>
        <div className="checkout-reward-applied" style={appliedRow}>
          <span
            style={{
              position: "relative",
              zIndex: 1,
              fontSize: "var(--fs-sm)",
              color: "var(--tx)",
            }}
          >
            <Icon
              name="gift"
              size={14}
              style={{ display: "inline", verticalAlign: "-2px", marginRight: 3 }}
            />
            Reward applied · <strong>−{dollars(appliedRewardCents)}</strong>
          </span>
          <button
            ref={removeBtnRef}
            type="button"
            onClick={remove}
            disabled={busy}
            style={{ ...linkBtn, position: "relative", zIndex: 1 }}
          >
            {busy ? "…" : "Remove"}
          </button>
        </div>
        {/* Always mounted (an aria-live region has to pre-exist its content to be announced), but it
            reserves no space until it has something to say — the applied pill is a settled state and
            must not carry a permanent empty gap under it. */}
        <p
          role="status"
          aria-atomic="true"
          style={{ ...errLine, minHeight: 0, margin: error ? "6px 0 0" : 0 }}
        >
          {error}
        </p>
      </>
    );
  }
  if (coupons.length === 0) return null; // no rewards to redeem → no affordance

  return (
    <div style={{ marginTop: 10 }}>
      {!open ? (
        <button
          ref={useBtnRef}
          type="button"
          onClick={() => setOpen(true)}
          className="checkout-reward-add"
          style={applyBtn}
        >
          <Icon
            name="gift"
            size={15}
            style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}
          />
          Use a reward ({coupons.length})
        </button>
      ) : (
        <div style={panel}>
          <p style={{ margin: "0 0 8px", fontSize: "var(--fs-sm)", color: "var(--t2)" }}>
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
                  // Capture the tapped node synchronously — `e.currentTarget` is nulled once the
                  // synthetic event is released, and `apply` awaits before it needs the ref.
                  onClick={(e) => apply(c.code, e.currentTarget)}
                  disabled={busy}
                  className="checkout-reward-add"
                  style={couponBtn}
                >
                  <span style={{ fontWeight: 800 }}>{dollars(c.amountCents)} off</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--t2)" }}>
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
      <p role="status" aria-atomic="true" style={errLine}>
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
  fontSize: "var(--fs-sm)",
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
  background: "var(--sf)",
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
  fontSize: "var(--fs-sm)",
  cursor: "pointer",
};
const errLine: CSSProperties = {
  minHeight: 16,
  margin: "6px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--warn)",
};
