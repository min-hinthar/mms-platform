/**
 * Phase 3a (D4, `docs/PHASE3_JOURNEYS.md`) — /account is a hub with three panels, decided here.
 *
 * The page used to be one 2–4 screen scroll (live orders → identity → Stars → history → favorites →
 * tier ladder → how it works → sound → back link), with the reference cards below the record on
 * every visit and no way to a section but scrolling. Three panels, one tap each:
 *
 *   Orders  — what is happening now and the record this app promised (receipts, order again).
 *   Rewards — the Stars, the coupons spendable today, the tier ladder, how it works.
 *   You     — who this is (the save / sign-in door, or the signed-in card), settings, help & contact.
 *
 * Addressed by `?tab=`, never a hash: Next's loading boundary consumes a hash on the skeleton's
 * commit (the page's own note). A lend-mode `?resume=` return opens You, where the sign-in door is.
 */
export type AccountPanelKey = "orders" | "rewards" | "you";

export const ACCOUNT_PANELS: { key: AccountPanelKey; label: string }[] = [
  { key: "orders", label: "Orders" },
  { key: "rewards", label: "Rewards" },
  { key: "you", label: "You" },
];

export function accountPanel(params: { tab?: string; resume?: string }): AccountPanelKey {
  if (params.tab === "orders" || params.tab === "rewards" || params.tab === "you")
    return params.tab;
  if (params.resume != null) return "you";
  return "orders";
}

export function accountPanelHref(key: AccountPanelKey): string {
  return `/account?tab=${key}`;
}
