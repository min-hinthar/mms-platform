/**
 * M160(a) — what a REJECTED Stripe delivery is allowed to say about itself.
 *
 * The webhook's signature check is the one path in `app/api/stripe/webhook/route.ts` that used to
 * answer without leaving a trace, and it is the path that fired: prod spent a week answering 400 to
 * every delivery — five paid carts, zero orders — while Vercel's error view stayed empty, because
 * returning a 400 is not the same as logging an error. The route now logs it, and these are the
 * pure halves of that log line so they can be falsified by a test instead of eyeballed in prod.
 *
 * ⚠️ THE INVARIANT THAT MAKES THIS SAFE: everything here reads a body whose signature FAILED, i.e.
 * an attacker-controlled string. Its output is for the log line and the counter ONLY. Nothing in
 * this module may ever reach a decision, a DB write, or a Stripe call — the whole point of the
 * signature check is that this payload is not to be believed. Hence the names: `unverified*`.
 */

/** What a rejected payload CLAIMS to be. Both fields are unverified and may be attacker-chosen. */
export type UnverifiedEvent = {
  /** The payload's `id`, when it is a plain JSON string of a sane shape; else null. */
  unverifiedId: string | null;
  /** The payload's `type`, same rules. */
  unverifiedType: string | null;
};

/** A rejected body can be any size and any shape; cap what we are willing to echo into a log. */
const MAX_ECHO = 80;

/**
 * A log field must not become its own incident: a rejected body can be megabytes of nested JSON, or
 * not JSON at all. Take only two top-level string scalars, cap their length, and refuse anything
 * else (numbers, objects, arrays, nested lookalikes) rather than coercing it into a string.
 */
function scalar(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_ECHO ? `${trimmed.slice(0, MAX_ECHO)}…` : trimmed;
}

/**
 * Best-effort read of a rejected payload's self-declared id/type. Never throws: a body that is not
 * JSON, or is JSON but not an object, yields nulls — "we could not tell" is a legitimate log value
 * and is strictly better than losing the whole line to a parse error.
 */
export function describeUnverifiedEvent(body: string): UnverifiedEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { unverifiedId: null, unverifiedType: null };
  }
  // `typeof null === "object"`, and an array would index numerically — demand a plain object.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return { unverifiedId: null, unverifiedType: null };
  const record = parsed as Record<string, unknown>;
  return { unverifiedId: scalar(record.id), unverifiedType: scalar(record.type) };
}

/**
 * The `t=` (issued-at) term of a `Stripe-Signature` header, as a string of digits.
 *
 * ⚠️ Deliberately returns ONLY the timestamp. The `v1=` terms are HMACs computed with the signing
 * secret; logging one hands an attacker a known-plaintext/-digest pair against the very secret this
 * check exists to prove. The timestamp is what a human actually needs — it says WHICH delivery, and
 * whether the failure is a clock-skew rejection (Stripe's tolerance) or a true secret mismatch.
 *
 * Parsed as a comma-separated term list per Stripe's format, anchored so a `v1=` value that happens
 * to contain the text `t=` cannot be mistaken for the timestamp term.
 */
export function signatureTimestamp(header: string | null): string | null {
  if (!header) return null;
  for (const term of header.split(",")) {
    const [key, ...rest] = term.trim().split("=");
    if (key !== "t") continue;
    const value = rest.join("=").trim();
    return /^\d+$/.test(value) ? value : null;
  }
  return null;
}
