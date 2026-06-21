import "server-only";
import crypto from "node:crypto";

/**
 * Verify a "Standard Webhooks" (Svix-format) signature — used by the Supabase Send-Email Hook (and the
 * same scheme Resend/Svix use). Signature = base64(HMAC_SHA256(secret, "{id}.{timestamp}.{body}")),
 * where the secret is the base64 after a `v1,whsec_` / `whsec_` prefix, and the header is a
 * space-separated list of `vN,<base64sig>`. Fails CLOSED (false) on a missing/undecodable secret or any
 * malformed signature. The caller verifies BEFORE trusting the payload, and should reject (4xx/5xx).
 */
export function verifyStandardWebhook(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  signatureHeader: string,
): boolean {
  const b64 = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const key = Buffer.from(b64, "base64");
  if (key.length === 0) return false;
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);
  for (const part of signatureHeader.split(" ")) {
    const sig = part.split(",")[1]; // "v1,<sig>" → "<sig>"
    if (!sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf))
      return true;
  }
  return false;
}

/** ±5-min replay window (Svix default). `timestamp` is unix SECONDS. */
export function withinTolerance(timestamp: string, seconds = 300): boolean {
  const ts = Number(timestamp);
  return Number.isFinite(ts) && Math.abs(Date.now() / 1000 - ts) <= seconds;
}
