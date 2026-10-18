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
 * money instead of test cards.
 *
 * TWO GUARDS COVER TWO DIFFERENT PAIRINGS, and an earlier version of this header credited the wrong
 * one for the dangerous case — which is precisely how it shipped unguarded:
 *
 *   - secret key vs PUBLISHABLE key → `modeDisagreement`. Both credentials ANNOUNCE their mode in a
 *     prefix, so they can be compared, and `getStripe()` refuses rather than take the money.
 *   - secret key vs WEBHOOK SIGNING SECRET → `webhookCandidatesForMode`, judging the variable NAME.
 *     `modeDisagreement` structurally CANNOT see this pairing: a `whsec_…` is byte-identical in test
 *     and live, so there is no marker to compare. This is the hazard described just above, and
 *     claiming the key-pair check covered it is exactly the false assurance that let it through.
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
 *     answers 500 rather than signing with it — fail-closed, which is the right trade when the
 *     alternative is capturing money that cannot be fulfilled. What that 500 SAYS is
 *     `webhookSecretDiagnostic`'s job, and it must be built from the RAW candidate list: this
 *     function's own output no longer contains the dropped name.
 *   - **unknown → the same as live (M166, owner 2026-10-07).** `unknown` is "cannot tell" — no
 *     secret key resolved, or a prefix `keyMode` does not read (a future format, a mock) — and
 *     `resolvedStripeMode` says callers must never read it as "test". Keeping `_TEST` at top
 *     precedence here was the one fail-OPEN branch in a module that otherwise fails closed, on the
 *     one credential nothing else can check. An unreadable mode therefore counts as live, and the
 *     diagnostic says the mode could not be READ rather than claiming it is live.
 *   - **test → keep both, `_TEST` first.** The BASE name legitimately holds a test secret in local
 *     dev, in `.env.example`, and in every deployment that predates the per-mode rename. Dropping it
 *     there would break working setups to guard a hazard that does not exist in test mode —
 *     over-blocking is as bad as under-blocking. Only a key that READS as test earns this branch.
 */
export function webhookCandidatesForMode(
  mode: StripeMode,
  candidates: readonly EnvCandidate[],
): readonly EnvCandidate[] {
  if (mode === "test") return candidates;
  return candidates.filter(([name]) => !name.endsWith("_TEST"));
}

/**
 * The staff badge's verdict on this deployment's Stripe setup (owner, 2026-10-18: read-only, no
 * toggle — the mode lives in Vercel's environment and nowhere else).
 *
 *   - `live` / `test` — every credential resolved, the two keys agree, and the webhook has a signing
 *     secret it is allowed to use in that mode.
 *   - `mismatch` — the secret and publishable keys announce different modes. `getStripe()` refuses
 *     on exactly this (`modeDisagreement`, the same function), so card payments are refused.
 *   - `webhook_mismatch` — the keys agree, but the only signing secret set sits under a name the
 *     webhook may not use in this mode (`webhookCandidatesForMode`, the same function the route
 *     filters with): the live-cutover leftover. Cards are charged; deliveries are answered 500.
 *   - `unconfigured` — a credential resolved to nothing: no secret key, no publishable key, or no
 *     signing secret under any name.
 *   - `unknown` — a key carries no mode marker, so nobody can say which Stripe account it talks to.
 *     Never read as test (`resolvedStripeMode`'s own rule).
 *
 * VALUES in, an enum out: the caller resolves each credential through the resolvers checkout itself
 * uses (`readPaymentMode` in `stripe.ts`), and nothing about a value — not even its prefix — leaves
 * this function. Pure, so every branch is falsified by a value.
 */
export type PaymentModeStatus =
  | "live"
  | "test"
  | "mismatch"
  | "webhook_mismatch"
  | "unconfigured"
  | "unknown";

export function paymentModeStatus(input: {
  readonly secretKey: string | null | undefined;
  readonly publishableKey: string | null | undefined;
  /** The webhook's RAW candidate list — the filter is applied here, by the route's own rule. */
  readonly webhookCandidates: readonly EnvCandidate[];
}): PaymentModeStatus {
  const { secretKey, publishableKey, webhookCandidates } = input;
  if (!secretKey?.trim() || !publishableKey?.trim()) return "unconfigured";
  if (modeDisagreement(secretKey, publishableKey)) return "mismatch";
  const mode = keyMode(secretKey);
  if (mode === "unknown" || keyMode(publishableKey) === "unknown") return "unknown";
  if (!pickEnv(webhookCandidatesForMode(mode, webhookCandidates)))
    return pickEnv(webhookCandidates) ? "webhook_mismatch" : "unconfigured";
  return mode;
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

/**
 * The 500 diagnostic for a webhook signing secret that resolved to nothing.
 *
 * `missingEnvMessage` on its own is NOT enough here, and Codex round 2 on #274 caught why. The route
 * selects from the MODE-FILTERED candidates, so handing that same filtered list to the diagnostic
 * names only `STRIPE_WEBHOOK_SECRET` and silently omits the `_TEST` name that was dropped.
 *
 * That omission lands in exactly the one failure this guard exists for. A live cutover deletes the
 * `_TEST` API keys and leaves `STRIPE_WEBHOOK_SECRET_TEST` behind; the filter correctly refuses to
 * sign live deliveries with it, and the operator then reads "Looked for: STRIPE_WEBHOOK_SECRET"
 * while the variable that actually holds a secret sits populated in their dashboard, unmentioned.
 * The single fact that ends the outage — *your `_TEST` variable is set and was deliberately
 * ignored* — is the fact the message hides, and the webhook stays down while they hunt for it.
 *
 * So: name every place looked, then name what was ignored and whether it is SET. Set-ness only,
 * never a value and never a prefix — this string goes to a log, and a signing secret is a
 * credential. Reported through `pickEnv`'s own trim rule, so a whitespace-only variable reads as
 * "not set" here exactly as it does during selection; two answers to "is it set?" would send the
 * operator hunting for a variable this module considers empty.
 *
 * M166 — the WHY differs by mode, and it is the half the operator acts on. In live mode the keys
 * really did resolve live, so the remedy is the live endpoint's secret. In `unknown` mode nothing
 * resolved to a mode at all, and telling that operator "the API keys resolved to LIVE mode" would
 * send them looking for a live key that does not exist; what they need to hear is that the secret
 * key's mode could not be read, and how to make it readable.
 */
export function webhookSecretDiagnostic(
  mode: StripeMode,
  candidates: readonly EnvCandidate[],
): string {
  const eligible = new Set(webhookCandidatesForMode(mode, candidates).map(([name]) => name));
  const ignored = candidates.filter(([name]) => !eligible.has(name));
  const base = missingEnvMessage("Webhook signing secret", candidates);
  if (ignored.length === 0) return base;
  const described = ignored
    .map(([name, value]) => `${name} (${pickEnv([[name, value]]) ? "SET" : "not set"})`)
    .join(", ");
  if (mode === "live")
    return (
      `${base} Ignored because the API keys resolved to LIVE mode: ${described}. ` +
      `A _TEST name cannot sign live deliveries — delete it from this environment and set ` +
      `STRIPE_WEBHOOK_SECRET to the live endpoint's signing secret.`
    );
  return (
    `${base} Ignored because the Stripe secret key's mode could not be read — no secret key is ` +
    `set, or its prefix is not sk_test_/rk_test_/sk_live_/rk_live_ — and an unreadable mode counts ` +
    `as live: ${described}. A _TEST name signs deliveries only when the secret key reads as test ` +
    `mode — set a secret key with a test prefix, or set STRIPE_WEBHOOK_SECRET.`
  );
}
