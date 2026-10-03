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
 * commit (the page's own note). Two returns land on You without saying `tab`, because the thing
 * they return TO is on You: a lend-mode `?resume=` (the sign-in door), and the OAuth bounce —
 * Supabase sends `?error_code=…` (or `?error=…`) back to the Google button's `redirectTo`, and the
 * recovery copy and its button render in the save card; a panel that hid them would strand the
 * diner on Orders with no sign of what happened (blind pass on #312).
 */
export type AccountPanelKey = "orders" | "rewards" | "you";

export const ACCOUNT_PANELS: { key: AccountPanelKey; label: string }[] = [
  { key: "orders", label: "Orders" },
  { key: "rewards", label: "Rewards" },
  { key: "you", label: "You" },
];

export function isAccountPanel(x: string | null | undefined): x is AccountPanelKey {
  return x === "orders" || x === "rewards" || x === "you";
}

export function accountPanel(params: {
  tab?: string;
  resume?: string;
  error_code?: string;
  error?: string;
}): AccountPanelKey {
  if (isAccountPanel(params.tab)) return params.tab;
  if (params.resume != null) return "you";
  if (params.error_code != null || params.error != null) return "you";
  return "orders";
}

export function accountPanelHref(key: AccountPanelKey): string {
  return `/account?tab=${key}`;
}
