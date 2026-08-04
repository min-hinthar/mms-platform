import { describe, expect, it } from "vitest";
import { shareIntentKey } from "./split-intent-key";

/**
 * W10d (M39). The property that matters is a RELATION between calls, not any literal string: a retry
 * that follows a canceled PaymentIntent must get a DIFFERENT key from the attempt it replaces, while a
 * double-tap of the same attempt must get the SAME one. Asserting a hardcoded key would pin the format
 * and prove neither, so every assertion below compares two derivations.
 */
describe("shareIntentKey — a retry must not replay the intent it just canceled", () => {
  it("gives a retry a different key from the attempt it replaces", () => {
    const first = shareIntentKey("share-1", 2400, null);
    const retry = shareIntentKey("share-1", 2400, "pi_1");
    // Same share, same amount — the ONLY thing that changed is that PI_1 has been canceled. Under the
    // old `share_<id>_<amount>` key these were identical, so Stripe replayed the canceled PI_1 and the
    // payer could never authorize again until the tip changed or the 24h key window expired.
    expect(retry).not.toBe(first);
  });

  it("gives a double-tap of the same attempt the same key", () => {
    // Two concurrent requests both read the row before either claims it, so both see the same
    // `previousIntentId` — the key must collapse them onto one PaymentIntent, not two authorizations.
    expect(shareIntentKey("share-1", 2400, null)).toBe(shareIntentKey("share-1", 2400, null));
    expect(shareIntentKey("share-1", 2400, "pi_1")).toBe(shareIntentKey("share-1", 2400, "pi_1"));
  });

  it("still mints a fresh intent when the tip changes", () => {
    // The pre-existing behaviour this must not regress: a new amount is a new intent.
    expect(shareIntentKey("share-1", 2400, "pi_1")).not.toBe(
      shareIntentKey("share-1", 2800, "pi_1"),
    );
  });

  it("gives two DIFFERENT replaced intents two different keys", () => {
    // Pre-PR review: every other retry fixture passed the same "pi_1", so the suite never pinned that
    // the replaced-intent term is actually READ — a key that appended a constant would have passed.
    // This is the property the whole fix rests on: attempt N+1 must not reuse attempt N's key.
    expect(shareIntentKey("share-1", 2400, "pi_1")).not.toBe(
      shareIntentKey("share-1", 2400, "pi_2"),
    );
  });

  it("never collides across payers at the same table", () => {
    // Every share at a table can carry an identical amount (an even split); the share id is what keeps
    // two payers from sharing one PaymentIntent.
    expect(shareIntentKey("share-1", 2400, null)).not.toBe(shareIntentKey("share-2", 2400, null));
  });

  it("cannot confuse a first attempt with a retry", () => {
    // A guard against a future refactor collapsing `null` onto a sentinel the caller could also pass:
    // no intent id may derive the first-mint key. The earlier version of this test probed only the
    // literal "new" — a string the implementation stopped using when the sentinel was replaced by the
    // `first` / `after-<id>` prefixes — so it could not fail for either of the values its own comment
    // named. Probe every shape a broken refactor would actually produce (`String(null)`, an empty id,
    // and the retired sentinel), which is what makes this assertion able to go red.
    const firstMint = shareIntentKey("share-1", 2400, null);
    for (const impostor of ["new", "null", "undefined", "", "first"])
      expect(shareIntentKey("share-1", 2400, impostor)).not.toBe(firstMint);
  });
});
