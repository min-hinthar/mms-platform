/**
 * WHICH Stripe credentials this deployment uses — and the rule that they must all be the same MODE.
 *
 * Background (C18, and the rename that followed it). The three Stripe credentials used to be read
 * from three fixed names. When the owner split them into per-mode copies — `STRIPE_SECRET_KEY_TEST`,
 * `STRIPE_WEBHOOK_SECRET_TEST`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST` alongside the unsuffixed
 * production pair and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_Production` — nothing in the code knew the
 * new names, and each miss fails DIFFERENTLY and quietly:
 *
 *   - publishable missing → `getStripePromise()` returns null → the card form never mounts and
 *     checkout shows "card checkout unavailable". No error, no log, no Stripe request.
 *   - webhook secret missing → every delivery is answered 500 and Stripe retries for 72h.
 *   - secret key missing → `getStripe()` throws on the first server call.
 *
 * ⚠️ THE ONE THAT IS WORSE THAN MISSING: a LIVE secret key beside a TEST webhook secret. Real cards
 * are charged, and every fulfilment webhook fails signature verification — C18 with real guests'
 * money instead of test cards. Nothing in the values themselves prevents that pairing, so
 * `modeDisagreement` is the check that does, and `getStripe()` refuses rather than take the money.
 *
 * This module is PURE and isomorphic on purpose: it holds no `process.env` read for a SECRET. The
 * literal reads live at their call sites — in `stripe.ts` (`import "server-only"`) and in the
 * webhook route — so no secret name appears in a module a client component may import. The
 * publishable key is the one credential that is meant to reach the browser, so its resolver lives
 * here beside the rule.
 *
 * The reads must stay LITERAL (`process.env.NAME`, never `process.env[name]`): Next.js inlines
 * `NEXT_PUBLIC_*` into the client bundle at BUILD time by textual substitution, so a computed lookup
 * resolves to undefined in the browser however correct it looks in the editor.
 */

/** Which Stripe mode a key belongs to. `unknown` means the value carries no mode marker. */
export type StripeMode = "test" | "live" | "unknown";

/** A candidate env var: the name we looked under, and what was there. */
export type EnvCandidate = readonly [name: string, value: string | undefined];

/** The candidate that won, or null when none of them held anything usable. */
export type ResolvedEnv = { readonly name: string; readonly value: string } | null;

/**
 * First candidate holding a non-empty value wins, and the WINNER'S NAME comes back with it.
 *
 * The name is returned rather than discarded because every diagnostic this module feeds needs to say
 * which variable was actually used: "STRIPE_SECRET_KEY is not set" is a lie when four names were
 * tried, and an operator who has just renamed their variables is precisely the reader of that error.
 *
 * The value is TRIMMED, and that is load-bearing for the webhook secret specifically: Stripe's SDK
 * appends "Note: The provided signing secret contains whitespace" to the verification failure when
 * the configured secret has stray characters — a real failure mode for a secret pasted through a
 * dashboard field. Trimming here means a stray newline can no longer reject every delivery.
 */
export function pickEnv(candidates: readonly EnvCandidate[]): ResolvedEnv {
  for (const [name, value] of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    return { name, value: trimmed };
  }
  return null;
}

/**
 * The mode a Stripe key announces about itself.
 *
 * Stripe's publishable, secret and restricted keys all carry the mode in their prefix
 * (`pk_test_` / `pk_live_`, `sk_…`, `rk_…`). Webhook signing secrets (`whsec_…`) do NOT — which is
 * exactly why the mismatch this module guards against is invisible from the webhook side alone, and
 * why the agreement check below compares the two keys that CAN be read.
 */
export function keyMode(key: string | null | undefined): StripeMode {
  if (typeof key !== "string") return "unknown";
  const k = key.trim();
  if (/^[sprk]{2}_test_/.test(k)) return "test";
  if (/^[sprk]{2}_live_/.test(k)) return "live";
  return "unknown";
}

/**
 * The refusal message when the secret and publishable keys are from different Stripe modes, or null
 * when they agree.
 *
 * Deliberately silent when either key carries no mode marker. An unrecognised prefix is an absence
 * of evidence, not evidence of disagreement — a future key format, or a mock in a test, must not
 * take down checkout. The pairing this exists to stop (a live secret beside a test publishable, or
 * the reverse) always has BOTH markers present, so refusing only on a known disagreement costs the
 * guard nothing it was built to catch.
 */
export function modeDisagreement(
  secretKey: string | null | undefined,
  publishableKey: string | null | undefined,
): string | null {
  const secret = keyMode(secretKey);
  const publishable = keyMode(publishableKey);
  if (secret === "unknown" || publishable === "unknown") return null;
  if (secret === publishable) return null;
  return (
    `Stripe mode mismatch: the secret key is ${secret} mode and the publishable key is ` +
    `${publishable} mode. Charges and the card form would be talking to different Stripe accounts, ` +
    `and the webhook signing secret can only match one of them. Set all three credentials to the ` +
    `same mode before taking payments.`
  );
}

/**
 * Every name we look under for the browser's publishable key, most specific first.
 *
 * ⚠️ `_TEST` WINS. That is the safe default for this deployment while prod runs on test keys before
 * the live cutover, and it makes the cutover an explicit act: REMOVE the `_TEST` variables from the
 * Vercel Production environment. Leaving one behind keeps the restaurant on test cards — money that
 * looks collected and never arrives — so the cutover checklist has to name this, and
 * `modeDisagreement` catches the half-done version where only some of them were removed.
 *
 * `_Production` is spelled exactly as it is in the dashboard, capital P included: env var names are
 * case-sensitive, and a helpfully-guessed `_PRODUCTION` would resolve to nothing while looking right.
 */
export function publishableKeyCandidates(): readonly EnvCandidate[] {
  return [
    [
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST",
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST,
    ],
    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY],
    [
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_Production",
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_Production,
    ],
  ];
}

/**
 * The signing-secret candidates that are LEGITIMATE for the mode the API keys resolved to.
 *
 * ⚠️ THIS IS THE P1 THE MODE GATE COULD NOT SEE, and the cutover checklist created it. Removing the
 * two `_TEST` KEY variables at the live cutover while leaving `STRIPE_WEBHOOK_SECRET_TEST` behind
 * gives `getStripe()` a live secret and a live publishable key — they AGREE, so it raises nothing —
 * while the webhook keeps picking the test signing secret. Every live delivery then fails
 * `constructEvent`: real cards captured, zero orders. C18 with real money.
 *
 * `modeDisagreement` structurally cannot catch it. A signing secret is `whsec_…` in both modes and
 * carries no marker to compare, so the only evidence available is the NAME it was read from — which
 * is what this function judges.
 *
 * The rule is deliberately ASYMMETRIC, because the two directions are not symmetric facts:
 *
 *   - **live → drop every `_TEST` name.** A name containing `_TEST` can never be correct in live
 *     mode, so a leftover becomes INERT rather than authoritative. If that leaves nothing, the route
 *     answers 500 naming both names — fail-closed, which is the right trade when the alternative is
 *     capturing money that cannot be fulfilled.
 *   - **test / unknown → keep both, `_TEST` first.** The BASE name legitimately holds a test secret
 *     in local dev, in `.env.example`, and in every deployment that predates the per-mode rename.
 *     Dropping it there would break working setups to guard a hazard that does not exist in test
 *     mode — over-blocking is as bad as under-blocking.
 */
export function webhookCandidatesForMode(
  mode: StripeMode,
  candidates: readonly EnvCandidate[],
): readonly EnvCandidate[] {
  if (mode !== "live") return candidates;
  return candidates.filter(([name]) => !name.endsWith("_TEST"));
}

/** The publishable key this deployment should hand to Stripe.js, with the name it came from. */
export function resolvePublishableKey(): ResolvedEnv {
  return pickEnv(publishableKeyCandidates());
}

/**
 * The error text for a credential that resolved to nothing, naming every place we looked.
 *
 * A bare "X is not set" sends an operator to check the one name in the message, which is the one
 * name they may have deliberately moved away from.
 */
export function missingEnvMessage(label: string, candidates: readonly EnvCandidate[]): string {
  return `${label} is not set. Looked for: ${candidates.map(([name]) => name).join(", ")}.`;
}
