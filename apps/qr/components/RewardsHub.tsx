import type { CSSProperties } from "react";
import type { RewardsState } from "@/lib/rewards";
import { REWARD_TIERS, tierMeta, nextTier, spendToNextTierCents } from "@/lib/rewards-tiers";
import { Card, NumberFlow } from "@mms/ui";
import { StarsRing } from "./StarsRing";
import { TierUpCelebration } from "./TierUpCelebration";

const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;

/**
 * Morning Star Rewards hub (M4 P4.1 · enriched R8) — read-only, server-rendered from the server-derived
 * summary. The Stars ring (real milestone cycle) + tier ladder + earned-reward wallet, plus an honest
 * "how it works" panel. Every number is truthful (derived from PAID orders); the ring + balance roll via
 * NumberFlow, and a tier-up moment fires on a genuine climb. Rewards are redeemable at checkout (P4.2).
 *
 * Honesty note: the v7.2 prototype's perk grid (free milk tea / 10% off snacks / birthday sweet / skip-
 * the-line) is demo fiction — QR only delivers the milestone reward coupon (`reward_base_cents` every
 * `milestone_step` orders) + spend tiers, and `isEarlyAccess` has no consumers. So "How it works" states
 * only the real mechanics rather than copying perks the app can't keep.
 */
export function RewardsHub({ state }: { state: RewardsState }) {
  const current = tierMeta(state.tierId);
  const nxt = nextTier(state.tierId);
  const toNextSpend = spendToNextTierCents(state.spendCents, state.tierId);
  const currentIdx = REWARD_TIERS.findIndex((t) => t.id === current.id);
  // Honest milestone caption (ordersToNext is strictly ≥1; a fresh cycle reads as "step to your next reward").
  const ringCaption =
    state.stars === 0
      ? `${state.milestoneStep} orders to your first reward`
      : state.ordersToNext === 1
        ? "1 order to your next reward"
        : `${state.ordersToNext} orders to your next reward`;

  return (
    <>
      {/* Fires only on a genuine tier climb (localStorage-deduped); silent on first sight / revisit. */}
      <TierUpCelebration tierId={state.tierId} />

      {/* Stars — the ring hero (replaces the old flat progress bar). */}
      <Card as="section" style={card} aria-labelledby="stars-h">
        <h2 id="stars-h" style={cardH}>
          Stars
        </h2>
        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 0" }}>
          <StarsRing
            stars={state.stars}
            milestoneStep={state.milestoneStep}
            ordersToNext={state.ordersToNext}
            tierId={state.tierId}
            caption={ringCaption}
          />
        </div>
        {/* Visible caption — the ring's role="img" label already states it for AT, so hide this copy. */}
        <p
          aria-hidden
          style={{ margin: "10px 0 0", textAlign: "center", fontSize: 13.5, color: "var(--t2)" }}
        >
          {ringCaption}
        </p>
      </Card>

      {/* Tier — current standing, spend-to-next, and the ladder ribbon. */}
      <Card as="section" style={card} aria-labelledby="tier-h">
        <h2 id="tier-h" style={cardH}>
          Your tier
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 34, lineHeight: 1 }} aria-hidden>
            {current.emoji}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
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
        {/* Lifetime spend — the real driver of tiers; rolls via NumberFlow (self-gates reduced motion). The
            row is one labelled group + the visual label/reel are aria-hidden, so AT announces "Lifetime spend
            $X" once and NumberFlow's own role="img" doesn't leak a stray "image" node (matches StarsRing). */}
        <div
          style={spendStat}
          role="group"
          aria-label={`Lifetime spend ${dollars(state.spendCents)}`}
        >
          <span aria-hidden style={{ fontSize: 12.5, color: "var(--t2)", fontWeight: 700 }}>
            Lifetime spend
          </span>
          <span
            aria-hidden
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: "var(--tx)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <NumberFlow value={state.spendCents / 100} format={{ style: "currency", currency: "USD" }} />
          </span>
        </div>
        {/* Ladder ribbon — current lit + soft glow, passed tinted, future faint. Decorative gems aria-hidden;
            the accessible state is in each item's label. No hover-lift: the rungs aren't interactive, so a
            lift would be a false affordance (R7b learning) — the current rung's glow carries the emphasis. */}
        <ol role="list" style={ladder} aria-label="Tier ladder">
          {REWARD_TIERS.map((t, i) => {
            const reached = i <= currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <li
                key={t.id}
                className={`reward-rung${isCurrent ? " reward-rung-current" : ""}`}
                style={
                  {
                    ...rung,
                    opacity: reached ? 1 : 0.4,
                    borderColor: isCurrent ? "var(--ac)" : "var(--bd)",
                    background: isCurrent
                      ? "color-mix(in srgb, var(--ac) 12%, var(--cd))"
                      : "var(--cd)",
                    ["--rung-delay" as string]: `${i * 55}ms`,
                  } as CSSProperties
                }
                aria-label={`${t.english}${isCurrent ? " — your tier" : reached ? " — reached" : ` — ${dollars(t.minSpendCents)}`}`}
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

      {/* How it works — honest mechanics only (no fictional perks). */}
      <Card as="section" style={card} aria-labelledby="how-h">
        <h2 id="how-h" style={cardH}>
          How it works
        </h2>
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          <li style={benefit}>
            <span style={benefitE} aria-hidden>
              ✦
            </span>
            <div>
              <p style={benefitN}>Earn a Star with every order</p>
              <p style={benefitD}>One Star lands each time you order and pay.</p>
            </div>
          </li>
          <li style={benefit}>
            <span style={benefitE} aria-hidden>
              🎁
            </span>
            <div>
              <p style={benefitN}>A reward every {state.milestoneStep} Stars</p>
              <p style={benefitD}>
                Reach {state.milestoneStep} and a Kyay-Zu-Par! reward is yours to use at checkout.
              </p>
            </div>
          </li>
          <li style={benefit}>
            <span style={benefitE} aria-hidden>
              💎
            </span>
            <div>
              <p style={benefitN}>Climb the gem tiers</p>
              <p style={benefitD}>The more you spend over time, the higher your standing with us.</p>
            </div>
          </li>
        </ul>
      </Card>

      {/* Wallet — earned rewards (redeemable at checkout in P4.2). */}
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
const spendStat: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  margin: "14px 0 0",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--bd)",
  background: "var(--cd)",
};
const ladder: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 6,
  margin: "14px 0 0",
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
const benefit: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
};
const benefitE: CSSProperties = {
  fontSize: 22,
  lineHeight: 1.1,
  flex: "none",
  width: 28,
  textAlign: "center",
};
const benefitN: CSSProperties = {
  margin: 0,
  fontWeight: 700,
  fontSize: 14,
  color: "var(--tx)",
};
const benefitD: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 12.5,
  color: "var(--t2)",
};
const coupon: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px dashed var(--ac)",
  background: "color-mix(in srgb, var(--ac) 7%, var(--cd))",
};
