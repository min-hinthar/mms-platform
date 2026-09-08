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
 * The largest rejected body we will hand to `JSON.parse`. Stripe's own events sit far below this;
 * the bound exists for the payloads that are not Stripe's.
 */
const MAX_BODY_PARSE = 64 * 1024;

/**
 * Digits allowed in the `t=` term. A Unix timestamp in SECONDS is ten digits and stays ten until
 * 2286; twelve is generous and still bounded. The bound is not cosmetic: the header is
 * attacker-controlled on a public route, `/^\d+$/` accepts a megabyte of digits, and the value is
 * both logged and shipped to a third-party analytics sink — an unbounded field in a per-request log
 * line is a cost an unauthenticated caller gets to choose. Over-long → null, the same "we could not
 * tell" answer a malformed term already gets.
 */
const MAX_TIMESTAMP_DIGITS = 12;

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
  // Refuse to PARSE what we would refuse to echo. The body is attacker-controlled on a public,
  // unauthenticated route, so a megabyte of nested JSON would otherwise buy a full parse and object
  // graph per request purely to fill a log field capped at 80 characters. A real Stripe event that
  // exceeds this is still logged — it just reports its id and type as unknown, which is the honest
  // answer for a payload we already refused.
  if (body.length > MAX_BODY_PARSE) return { unverifiedId: null, unverifiedType: null };
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
 * check exists to prove.
 *
 * What the timestamp is FOR, stated accurately after reading the SDK: it identifies WHICH delivery
 * a rejection belongs to, and lets an operator see whether rejections cluster in time. An earlier
 * draft of this docblock claimed it separates clock skew from a secret mismatch. It does not, and
 * the claim was load-bearing enough to be worth naming: `validateComputedSignature` throws
 * "No signatures found matching…" on `!signatureFound` BEFORE it ever evaluates `timestampAge`
 * against the tolerance, so a wrong secret can never surface the "Timestamp outside the tolerance
 * zone" message. The `reason` field alone separates those two causes.
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
    if (value.length > MAX_TIMESTAMP_DIGITS) return null;
    return /^\d+$/.test(value) ? value : null;
  }
  return null;
}

/**
 * A STABLE token for the rejection, safe to send to a third-party analytics sink.
 *
 * The SDK's raw message must not go there, and the reason is specific: when the configured secret
 * has stray whitespace the SDK appends "Note: The provided signing secret contains whitespace…",
 * which is a fact about OUR SIGNING SECRET. It belongs in our own server log and nowhere else. The
 * full message is still logged locally; only this token is exported.
 *
 * Unrecognised messages collapse to "other" rather than passing the text through — a classifier
 * that falls back to the raw string is not a classifier.
 */
export function classifyRejection(reason: string): string {
  if (/no signatures found matching/i.test(reason)) return "no_signature_match";
  if (/timestamp outside the tolerance zone/i.test(reason)) return "timestamp_outside_tolerance";
  if (/no signatures found with expected scheme/i.test(reason)) return "no_scheme_match";
  if (/payload must be provided as a string or a buffer/i.test(reason)) return "payload_not_raw";
  if (/unable to extract timestamp and signatures/i.test(reason)) return "unparsable_header";
  return "other";
}
