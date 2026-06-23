// Morning Star Rewards — tier display (M4 P4.1). The tier IDs are the stable key (new/jade/ruby/gold,
// mirroring the delivery app's mms_reward_tiers + LOYALTY_TIERS); the display name/emoji live here so a
// rename never needs a migration (delivery's hard-won rule). Burmese gem names alongside the English gloss
// are the brand language (e.g. "Sein" / Diamond). Spend thresholds mirror the SQL mms_reward_tiers seed.
// NOTE: exact MY strings for ruby/gold to be reconciled with the delivery app at the M5 unification.

export type RewardTierId = "new" | "jade" | "ruby" | "gold";

export type RewardTierMeta = {
  id: RewardTierId;
  /** Burmese gem name (brand-forward). */
  name: string;
  /** English gloss. */
  english: string;
  emoji: string;
  minSpendCents: number;
};

// Order matters: ascending by minSpendCents (the ladder).
export const REWARD_TIERS: RewardTierMeta[] = [
  { id: "new", name: "မိတ်ဆွေသစ်", english: "New Friend", emoji: "☆", minSpendCents: 0 },
  { id: "jade", name: "စိန်", english: "Diamond", emoji: "💎", minSpendCents: 25000 },
  { id: "ruby", name: "ပတ္တမြား", english: "Ruby", emoji: "❤️", minSpendCents: 75000 },
  { id: "gold", name: "ရွှေ", english: "Gold", emoji: "👑", minSpendCents: 150000 },
];

const BY_ID = new Map(REWARD_TIERS.map((t) => [t.id, t]));

const BASE_TIER = REWARD_TIERS[0]!; // the 'new' base tier always exists (seeded above)

export function tierMeta(id: string | null | undefined): RewardTierMeta {
  return (id ? BY_ID.get(id as RewardTierId) : undefined) ?? BASE_TIER;
}

/** The next tier up the ladder, or null at the top (Gold). */
export function nextTier(id: string | null | undefined): RewardTierMeta | null {
  const i = REWARD_TIERS.findIndex((t) => t.id === (id ?? "new"));
  return i >= 0 && i < REWARD_TIERS.length - 1 ? (REWARD_TIERS[i + 1] ?? null) : null;
}

/** Cents still needed to reach the next tier (0 at the top). Pure display math — never authoritative. */
export function spendToNextTierCents(spendCents: number, id: string | null | undefined): number {
  const nxt = nextTier(id);
  return nxt ? Math.max(nxt.minSpendCents - spendCents, 0) : 0;
}

/** Capability flag (parity with delivery's `tier >= ruby` early-access). Display/gating hint only. */
export function isEarlyAccess(id: string | null | undefined): boolean {
  return id === "ruby" || id === "gold";
}
