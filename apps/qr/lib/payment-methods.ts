/**
 * M155 — the payment methods a guest may pay for a meal with, named ONCE (owner ruling #7,
 * OWNER_RULINGS_2026-10-07: "Phone payments for meals take card only (Apple Pay and Google Pay
 * ride the card method). No bank debits. One named constant.").
 *
 * WHY NOT `automatic_payment_methods`. Automatic methods hand the choice to whatever the Stripe
 * Dashboard has enabled, and a bank debit (ACH and its kin) sits in `processing` for DAYS.
 * `classifyLiveIntent` treats `processing` as captured for the life of the cart link — correct for a
 * card, where it lasts seconds — so a bank debit would answer every re-checkout "already going
 * through", refuse every promo as locked, and let the lock TTL lapse while tablemates edit the lines
 * the charge priced, until fulfilment refuses the order. Listing the methods here makes the
 * Dashboard irrelevant to that state: nothing outside this list can reach it. And because the
 * current API version turns automatic methods ON when a create names no list, every meal create
 * names this one rather than merely omitting the automatic flag.
 *
 * Apple Pay and Google Pay are wallets ON the `card` method, so they stay. If the owner names
 * another INSTANT method enabled on purpose (the ruling's examples: Cash App Pay, Klarna), it joins
 * this list — and a bank debit still never does.
 *
 * Read by every meal create: the three doors that mint a Stripe intent — `create-intent` (pay now),
 * `create-share-intent` (a split share) and `setup-intent` (a card saved for a tab) — and the tab's
 * off-session charge at close, `closeSecureTab` (`staff-cart.ts`), which pins the saved method and
 * so charges it as a card or not at all. Each suite (the three routes', `secure-close-cas.test.ts`)
 * asserts its create sends exactly this list; `payment-methods.test.ts` pins the list itself. The
 * Terminal reader's create is not a meal phone payment: it names `card_present` (`terminal.ts`).
 */
export const MEAL_PAYMENT_METHOD_TYPES = ["card"] as const;
