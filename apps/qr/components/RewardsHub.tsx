import type { CSSProperties } from "react";
import type { RewardsState } from "@/lib/rewards";
import { REWARD_TIERS, tierMeta, nextTier, spendToNextTierCents } from "@/lib/rewards-tiers";
import { Card } from "@mms/ui";

const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;

/**
 * Morning Star Rewards hub (M4 P4.1) — read-only, server-rendered from the server-derived summary. Tier
 * ladder + Stars progress + the earned-reward wallet. Every number is truthful (derived from paid orders);
 * rewards are redeemable at checkout (M4 P4.2 — the "Use a reward" field on the order).
 */
export function RewardsHub({ state }: { state: RewardsState }) {
  const current = tierMeta(state.tierId);
  const nxt = nextTier(state.tierId);
  const toNextSpend = spendToNextTierCents(state.spendCents, state.tierId);
  const currentIdx = REWARD_TIERS.findIndex((t) => t.id === current.id);
  // Stars in the current milestone cycle (filled toward the next reward).
  const inCycle = Math.max(0, state.milestoneStep - state.ordersToNext) % state.milestoneStep;

  return (
    <>
      {/* Tier */}
      <Card as="section" style={card} aria-labelledby="tier-h">
        <h2 id="tier-h" style={cardH}>
          Your tier
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 34, lineHeight: 1 }} aria-hidden>
            {current.emoji}
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--tx)" }}>
              {current.name}{" "}
              <span style={{ color: "var(--t2)", fontWeight: 600 }}>· {current.english}</span>
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--t2)" }}>
              {nxt
                ? `${dollars(toNextSpend)} more to ${nxt.english} ${nxt.emoji}`
                : "Top tier — thank you!"}
            </p>
          </div>
        </div>
        {/* Ladder ribbon — current lit, passed tinted, future faint. Decorative gems aria-hidden; the
            accessible state is in each item's label. */}
        <ol role="list" style={ladder} aria-label="Tier ladder">
          {REWARD_TIERS.map((t, i) => {
            const reached = i <= currentIdx;
            return (
              <li
                key={t.id}
                style={{
                  ...rung,
                  opacity: reached ? 1 : 0.4,
                  borderColor: i === currentIdx ? "var(--ac)" : "var(--bd)",
                  background:
                    i === currentIdx ? "color-mix(in srgb, var(--ac) 12%, var(--cd))" : "var(--cd)",
                }}
                aria-label={`${t.english}${i === currentIdx ? " — your tier" : reached ? " — reached" : ` — ${dollars(t.minSpendCents)}`}`}
              >
                <span aria-hidden style={{ fontSize: 18 }}>
                  {t.emoji}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--t2)", fontWeight: 700 }}>
                  {t.english}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>

      {/* Stars */}
      <Card as="section" style={card} aria-labelledby="stars-h">
        <h2 id="stars-h" style={cardH}>
          Stars
        </h2>
        <p style={{ margin: "0 0 10px", fontSize: 15, color: "var(--tx)" }}>
          <strong style={{ fontSize: 22 }}>{state.stars}</strong> <span aria-hidden>★</span> earned
        </p>
        {/* Cycle progress toward the next Kyay-Zu-Par! reward. */}
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={state.milestoneStep}
          aria-valuenow={inCycle}
          aria-label="Progress to your next reward"
          style={track}
        >
          <div style={{ ...trackFill, width: `${(inCycle / state.milestoneStep) * 100}%` }} />
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--t2)" }}>
          {state.ordersToNext === 1
            ? "1 more order unlocks a Kyay-Zu-Par! reward."
            : `${state.ordersToNext} more orders unlock a Kyay-Zu-Par! reward.`}
        </p>
      </Card>

      {/* Wallet — earned rewards (honest: saved now, redeemable at checkout in P4.2). */}
      {state.coupons.length > 0 && (
        <Card as="section" style={card} aria-labelledby="wallet-h">
          <h2 id="wallet-h" style={cardH}>
            Your rewards
          </h2>
          <ul
            role="list"
            style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}
          >
            {state.coupons.map((c) => (
              <li key={c.code} style={coupon}>
                <span style={{ fontSize: 18 }} aria-hidden>
                  🎁
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, color: "var(--tx)" }}>
                    {dollars(c.amountCents)} reward
                  </p>
                  <p style={{ margin: "1px 0 0", fontSize: 12, color: "var(--t2)" }}>
                    Code {c.code} · expires {new Date(c.expiresAt).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--t3)" }}>
            Apply a reward at checkout — tap “Use a reward” on your order.
          </p>
        </Card>
      )}
    </>
  );
}

// Surface (bg/border/radius/shadow) comes from `.card` via <Card>; this is layout only.
const card: CSSProperties = {
  padding: "var(--s5)",
  marginBottom: "var(--s4)",
};
const cardH: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  color: "var(--t2)",
};
const ladder: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 6,
  margin: "16px 0 0",
  padding: 0,
  listStyle: "none",
};
const rung: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 3,
  padding: "8px 4px",
  borderRadius: 10,
  border: "1px solid var(--bd)",
};
const track: CSSProperties = {
  height: 8,
  borderRadius: 999,
  background: "color-mix(in srgb, var(--ac) 14%, transparent)",
  overflow: "hidden",
};
const trackFill: CSSProperties = { height: "100%", borderRadius: 999, background: "var(--ac)" };
const coupon: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px dashed var(--ac)",
  background: "color-mix(in srgb, var(--ac) 7%, var(--cd))",
};
